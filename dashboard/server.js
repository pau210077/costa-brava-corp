// Servidor local del dashboard de Costa Brava Corp.
// - Sirve la web en http://127.0.0.1:4321 (solo accesible desde este PC).
// - Por cada mensaje del chat lanza Claude Code en modo no interactivo (claude -p)
//   continuando la misma sesion (--resume), y reenvia la respuesta en directo al navegador (SSE).
// - Las acciones que Claude no tiene permitidas pasan por mcp-permisos.js, que pregunta aqui,
//   y el navegador muestra la ventana de confirmacion.
// - Vigila data/estado.json y avisa al navegador cuando cambia.
// La web nunca ejecuta comandos: el unico proceso que se lanza es Claude Code.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DASH = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(DASH, "..");               // carpeta del proyecto: Claude trabaja aqui
const PUBLIC = path.join(DASH, "public");
const DATA = path.join(DASH, "data");
const LOCAL = path.join(DASH, ".local");             // historial, sesion y logs (ignorado por git)
const ESTADO = path.join(DATA, "estado.json");
const HISTORIAL = path.join(LOCAL, "historial.json");
const SESION = path.join(LOCAL, "sesion.txt");
const MCP_CONFIG = path.join(LOCAL, "mcp-permisos.json");
const LOG = path.join(LOCAL, "claude.log");
const BITACORA = path.join(DATA, "bitacora.json");    // diario de lo hecho, con fecha y hora

const PUERTO = Number(process.env.CBC_PUERTO || 4321);
const CLAUDE = process.env.CLAUDE_EXE || "claude";
const TOKEN = crypto.randomBytes(24).toString("hex"); // solo lo conoce mcp-permisos.js

// Lo unico que Claude puede hacer sin preguntar desde el dashboard.
// Leer el proyecto, consultar Microsoft Learn y editar dashboard/data/.
// "/dashboard/..." con una sola barra se ancla en la carpeta del proyecto.
const PERMITIDAS = [
  "Read",
  "Glob",
  "Grep",
  "Edit(/dashboard/data/**)",
  "mcp__plugin_microsoft-docs_microsoft-learn__*",
];

fs.mkdirSync(LOCAL, { recursive: true });
fs.writeFileSync(
  MCP_CONFIG,
  JSON.stringify(
    {
      mcpServers: {
        cbcpermisos: {
          type: "stdio",
          command: process.execPath,
          args: [path.join(DASH, "mcp-permisos.js")],
          env: { CBC_PUERTO: String(PUERTO), CBC_TOKEN: TOKEN },
        },
      },
    },
    null,
    2
  )
);

// ---------- utilidades ----------
const leerJSON = (f, porDefecto) => {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return porDefecto; }
};
const guardarJSON = (f, datos) => fs.writeFileSync(f, JSON.stringify(datos, null, 2));
const leerSesion = () => { try { return fs.readFileSync(SESION, "utf8").trim() || null; } catch { return null; } };
const log = (texto) => fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${texto}\n`);

let historial = leerJSON(HISTORIAL, []);
const anadirHistorial = (entrada) => {
  historial.push({ ...entrada, fecha: new Date().toISOString() });
  guardarJSON(HISTORIAL, historial);
};

// ---------- eventos en directo al navegador (Server-Sent Events) ----------
const clientes = new Set();
const emitir = (tipo, datos) => {
  const msg = `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
  for (const res of clientes) res.write(msg);
};

// ---------- vigilar estado.json y bitacora.json ----------
let ultimoEstado = leerJSON(ESTADO, {});
let ultimaBitacora = leerJSON(BITACORA, []);
let temporizador = null;
fs.watch(DATA, () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    // Si un archivo esta a medio escribir o con JSON roto, esperamos al siguiente cambio.
    const nuevo = leerJSON(ESTADO, null);
    if (nuevo && JSON.stringify(nuevo) !== JSON.stringify(ultimoEstado)) {
      ultimoEstado = nuevo;
      emitir("estado", nuevo);
    }
    const bit = leerJSON(BITACORA, null);
    if (Array.isArray(bit) && JSON.stringify(bit) !== JSON.stringify(ultimaBitacora)) {
      ultimaBitacora = bit;
      emitir("bitacora", bit);
    }
  }, 150);
});

// Fecha y hora de Pau (Madrid). Se antepone a cada mensaje para que Claude sepa cuando ocurre cada cosa.
function ahora() {
  const d = new Date();
  const zona = { timeZone: "Europe/Madrid" };
  const larga = d.toLocaleString("es-ES", { ...zona, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { ...zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value])
  );
  return { larga, corta: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` };
}

// ---------- permisos pendientes ----------
const pendientes = new Map(); // id -> { info, resolver }

function describir(tool, input) {
  if (tool === "Bash" || tool === "PowerShell")
    return { accion: `Ejecutar un comando (${tool})`, detalle: input.command || "", nota: input.description || "" };
  if (tool === "Write")
    return { accion: "Crear o sobrescribir un archivo", detalle: input.file_path, contenido: String(input.content || "").slice(0, 20000) };
  if (tool === "Edit")
    return { accion: "Modificar un archivo", detalle: input.file_path, antes: String(input.old_string || "").slice(0, 20000), despues: String(input.new_string || "").slice(0, 20000) };
  if (tool === "WebFetch")
    return { accion: "Abrir una pagina web", detalle: input.url || "" };
  return { accion: `Usar la herramienta ${tool}`, detalle: JSON.stringify(input, null, 2).slice(0, 20000) };
}

function resolverPendiente(id, aprobado) {
  const p = pendientes.get(id);
  if (!p) return false;
  pendientes.delete(id);
  p.resolver(aprobado);
  emitir("permiso-resuelto", { id, aprobado });
  return true;
}
const denegarTodo = () => { for (const id of [...pendientes.keys()]) resolverPendiente(id, false); };

// ---------- ejecutar Claude Code ----------
let ejecucion = null; // { hijo, texto }

function lanzarClaude(contenido) {
  const sesion = leerSesion();
  const args = [
    "-p",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-mode", "default",
    "--mcp-config", MCP_CONFIG,
    "--permission-prompt-tool", "mcp__cbcpermisos__aprobar",
    "--allowedTools", PERMITIDAS.join(","),
    "--disallowedTools", "AskUserQuestion",
  ];
  if (sesion) args.push("--resume", sesion);

  log(`lanzar claude ${sesion ? "--resume " + sesion : "(sesion nueva)"}`);
  const hijo = spawn(CLAUDE, args, { cwd: RAIZ, windowsHide: true });
  ejecucion = { hijo, texto: "", bloques: 0, terminado: false };
  emitir("inicio", {});

  hijo.stdin.write(
    JSON.stringify({ type: "user", message: { role: "user", content: contenido }, parent_tool_use_id: null }) + "\n"
  );
  hijo.stdin.end();

  let resto = "";
  let errores = "";
  hijo.stdout.on("data", (trozo) => {
    resto += trozo.toString("utf8");
    const lineas = resto.split("\n");
    resto = lineas.pop();
    for (const l of lineas) if (l.trim()) procesarEvento(l);
  });
  hijo.stderr.on("data", (t) => { errores += t.toString("utf8"); });
  hijo.on("error", (err) => {
    log(`error al lanzar: ${err.message}`);
    terminar(`No se pudo arrancar Claude Code (${err.message}). Comprueba que el comando "claude" funciona en una terminal.`);
  });
  hijo.on("close", (codigo) => {
    if (errores.trim()) log(`stderr: ${errores.trim().slice(-2000)}`);
    if (!ejecucion?.terminado) {
      let motivo = `Claude Code se ha cerrado sin responder (codigo ${codigo}).`;
      if (/no conversation found|session.*not found/i.test(errores)) {
        fs.rmSync(SESION, { force: true });
        motivo = "No se encontro la conversacion anterior. He empezado una nueva: vuelve a enviar el mensaje.";
      }
      terminar(motivo);
    }
    denegarTodo();
    ejecucion = null;
    emitir("fin", {});
  });
}

function procesarEvento(linea) {
  let ev;
  try { ev = JSON.parse(linea); } catch { return; }
  const ej = ejecucion;
  if (!ej) return;

  if (ev.type === "system" && ev.subtype === "init" && ev.session_id) {
    fs.writeFileSync(SESION, ev.session_id);
  } else if (ev.type === "stream_event" && !ev.parent_tool_use_id) {
    const e = ev.event || {};
    if (e.type === "content_block_start") {
      const b = e.content_block || {};
      if (b.type === "text") {
        if (ej.bloques > 0) { ej.texto += "\n\n"; emitir("delta", { texto: "\n\n" }); }
        ej.bloques++;
      } else if (b.type === "tool_use") {
        emitir("herramienta", { nombre: b.name });
      } else if (b.type === "thinking") {
        emitir("pensando", {});
      }
    } else if (e.type === "content_block_delta" && e.delta?.type === "text_delta") {
      ej.texto += e.delta.text;
      emitir("delta", { texto: e.delta.text });
    }
  } else if (ev.type === "result") {
    if (ev.session_id) fs.writeFileSync(SESION, ev.session_id);
    if (ev.is_error) terminar(ev.result || `Error de Claude Code (${ev.subtype}).`);
    else terminar(null, ej.texto.trim() || ev.result || "");
  }
}

function terminar(error, texto) {
  if (!ejecucion || ejecucion.terminado) return;
  ejecucion.terminado = true;
  if (error) {
    anadirHistorial({ rol: "error", texto: error });
    emitir("fallo", { texto: error });
  } else {
    anadirHistorial({ rol: "claude", texto });
    emitir("respuesta", { texto });
  }
}

// ---------- HTTP ----------
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const VENDOR = {
  "/vendor/marked.js": path.join(DASH, "node_modules/marked/lib/marked.esm.js"),
  "/vendor/purify.js": path.join(DASH, "node_modules/dompurify/dist/purify.es.mjs"),
};

const json = (res, codigo, datos) => {
  res.writeHead(codigo, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(datos));
};

function leerCuerpo(req, limite = 20 * 1024 * 1024) {
  return new Promise((ok, mal) => {
    let tam = 0; const trozos = [];
    req.on("data", (t) => { tam += t.length; if (tam > limite) { mal(new Error("demasiado grande")); req.destroy(); } else trozos.push(t); });
    req.on("end", () => { try { ok(trozos.length ? JSON.parse(Buffer.concat(trozos).toString("utf8")) : {}); } catch (e) { mal(e); } });
    req.on("error", mal);
  });
}

const HOSTS = new Set([`127.0.0.1:${PUERTO}`, `localhost:${PUERTO}`]);
const ORIGENES = new Set([...HOSTS].map((h) => `http://${h}`));

const servidor = http.createServer(async (req, res) => {
  // Solo aceptamos peticiones dirigidas a este PC (evita ataques de "DNS rebinding").
  if (!HOSTS.has(req.headers.host)) { res.writeHead(403); return res.end("Host no permitido"); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ruta = url.pathname;

  try {
    // Peticion del servidor MCP de permisos: se queda abierta hasta que Pau decide.
    if (req.method === "POST" && ruta === "/api/permiso/solicitud") {
      if (req.headers["x-cbc-token"] !== TOKEN) return json(res, 403, { error: "token" });
      const { tool_name, input } = await leerCuerpo(req);
      const id = crypto.randomUUID();
      const info = { id, herramienta: tool_name, ...describir(tool_name, input || {}) };
      const aprobado = await new Promise((resolver) => {
        pendientes.set(id, { info, resolver });
        emitir("permiso", info);
      });
      log(`permiso ${tool_name}: ${aprobado ? "aprobado" : "denegado"}`);
      return json(res, 200, { aprobado });
    }

    // El resto de POST solo pueden venir de la propia web: cabecera propia + origen correcto.
    if (req.method === "POST") {
      const origen = req.headers.origin;
      if (req.headers["x-cbc"] !== "1" || (origen && !ORIGENES.has(origen)))
        return json(res, 403, { error: "origen no permitido" });
    }

    if (req.method === "GET" && ruta === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(`event: hola\ndata: ${JSON.stringify({ ocupado: !!ejecucion })}\n\n`);
      for (const p of pendientes.values()) res.write(`event: permiso\ndata: ${JSON.stringify(p.info)}\n\n`);
      clientes.add(res);
      const latido = setInterval(() => res.write(": latido\n\n"), 25000);
      req.on("close", () => { clearInterval(latido); clientes.delete(res); });
      return;
    }
    if (req.method === "GET" && ruta === "/api/estado") return json(res, 200, ultimoEstado);
    if (req.method === "GET" && ruta === "/api/historial") return json(res, 200, historial);
    if (req.method === "GET" && ruta === "/api/bitacora") return json(res, 200, ultimaBitacora);
    if (req.method === "GET" && ruta === "/api/info")
      return json(res, 200, { ocupado: !!ejecucion, sesion: !!leerSesion(), mensajes: historial.length });

    if (req.method === "POST" && ruta === "/api/mensaje") {
      if (ejecucion) return json(res, 409, { error: "Claude todavia esta respondiendo al mensaje anterior." });
      const { texto = "", imagenes = [] } = await leerCuerpo(req);
      const limpio = String(texto).trim();
      if (!limpio && !imagenes.length) return json(res, 400, { error: "Mensaje vacio." });
      const contenido = [];
      for (const img of imagenes.slice(0, 4)) {
        if (!/^image\/(png|jpeg|gif|webp)$/.test(img.media_type) || typeof img.data !== "string") continue;
        contenido.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
      }
      const t = ahora();
      let cabecera = `[Mensaje de Pau, ${t.larga} (bitácora: ${t.corta})]`;
      // Sesión nueva: Claude no recuerda nada, así que le pasamos lo último del diario.
      if (!leerSesion()) {
        const ultimas = leerJSON(BITACORA, []).slice(-5);
        if (ultimas.length)
          cabecera += `\n[Sesión nueva. Últimas entradas de la bitácora (dashboard/data/bitacora.json):\n${ultimas
            .map((e) => `- ${e.fecha}${e.nivel != null ? ` | nivel ${e.nivel}` : ""}${e.mision ? ` | misión ${e.mision}` : ""}: ${e.texto}${e.siguiente ? ` (siguiente: ${e.siguiente})` : ""}`)
            .join("\n")}]`;
      }
      contenido.push({ type: "text", text: `${cabecera}\n${limpio || "Te paso esta captura."}` });
      anadirHistorial({ rol: "pau", texto: limpio, imagenes: contenido.length - 1 });
      lanzarClaude(contenido);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && ruta === "/api/permiso/respuesta") {
      const { id, aprobado } = await leerCuerpo(req);
      return json(res, 200, { ok: resolverPendiente(id, aprobado === true) });
    }
    if (req.method === "POST" && ruta === "/api/cancelar") {
      denegarTodo();
      if (ejecucion) { terminar("Respuesta cancelada por Pau."); ejecucion.hijo.kill(); }
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && ruta === "/api/nueva-sesion") {
      if (ejecucion) return json(res, 409, { error: "Espera a que Claude termine o cancela la respuesta." });
      fs.rmSync(SESION, { force: true });
      if (historial.length) fs.renameSync(HISTORIAL, path.join(LOCAL, `historial-${Date.now()}.json`));
      historial = [];
      guardarJSON(HISTORIAL, historial);
      emitir("historial", historial);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && ruta === "/api/apagar") {
      json(res, 200, { ok: true });
      denegarTodo();
      ejecucion?.hijo.kill();
      emitir("apagado", {});
      log("servidor apagado desde el dashboard");
      setTimeout(() => process.exit(0), 300);
      return;
    }

    // Archivos estaticos
    if (req.method === "GET") {
      let archivo = VENDOR[ruta];
      if (!archivo) {
        archivo = path.join(PUBLIC, ruta === "/" ? "index.html" : ruta);
        if (!archivo.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
      }
      return fs.readFile(archivo, (err, datos) => {
        if (err) { res.writeHead(404); return res.end("No encontrado"); }
        res.writeHead(200, { "content-type": TIPOS[path.extname(archivo)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(datos);
      });
    }
    res.writeHead(405); res.end();
  } catch (err) {
    log(`error http ${ruta}: ${err.message}`);
    if (!res.headersSent) json(res, 400, { error: err.message });
  }
});

servidor.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`El dashboard ya esta en marcha en http://127.0.0.1:${PUERTO}`);
    process.exit(0);
  }
  throw err;
});

servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`Costa Brava Corp - dashboard en http://127.0.0.1:${PUERTO}`);
  console.log("Para pararlo: boton Apagar en el dashboard, o cierra esta ventana.");
});
