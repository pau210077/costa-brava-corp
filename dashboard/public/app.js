// Lógica del dashboard. Solo habla con el servidor local (server.js):
// envía mensajes, recibe eventos en directo (SSE) y pinta el estado.
import { marked } from "/vendor/marked.js";
import DOMPurify from "/vendor/purify.js";

const $ = (id) => document.getElementById(id);
const CABECERAS = { "content-type": "application/json", "x-cbc": "1" };
const post = (ruta, datos = {}) =>
  fetch(ruta, { method: "POST", headers: CABECERAS, body: JSON.stringify(datos) }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    return j;
  });

const NOMBRES_ESTADO = { pendiente: "Pendiente", en_curso: "En curso", hecho: "Hecho", bloqueado: "Bloqueado" };
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- markdown seguro con botón de copiar en cada bloque de código ----------
marked.setOptions({ gfm: true, breaks: true });
function md(texto) {
  const html = DOMPurify.sanitize(marked.parse(String(texto ?? "")));
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  for (const pre of tpl.content.querySelectorAll("pre")) {
    const caja = document.createElement("div");
    caja.className = "cmd";
    pre.replaceWith(caja);
    caja.append(pre);
    const b = document.createElement("button");
    b.className = "copiar";
    b.type = "button";
    b.textContent = "Copiar";
    caja.append(b);
  }
  for (const a of tpl.content.querySelectorAll("a")) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
  return tpl.content;
}
function pintarMd(el, texto) { el.replaceChildren(md(texto)); }

document.addEventListener("click", async (e) => {
  const b = e.target.closest(".copiar");
  if (!b) return;
  const fuente = b.dataset.copiar ? $(b.dataset.copiar) : b.parentElement.querySelector("pre");
  try {
    await navigator.clipboard.writeText(fuente.innerText.replace(/\n$/, ""));
    b.textContent = "Copiado"; b.classList.add("ok");
  } catch { b.textContent = "No se pudo copiar"; }
  setTimeout(() => { b.textContent = "Copiar"; b.classList.remove("ok"); }, 1600);
});

// ---------- estado del panel ----------
function progreso(niveles = []) {
  let hechas = 0, total = 0;
  for (const n of niveles) for (const m of n.misiones || []) { total++; if (m.estado === "hecho") hechas++; }
  return total ? Math.round((hechas / total) * 100) : 0;
}
const chip = (estado) => `<span class="estado-chip" data-estado="${esc(estado)}">${esc(NOMBRES_ESTADO[estado] || estado)}</span>`;

function pintarEstado(e) {
  if (!e || typeof e !== "object") return;
  const niveles = e.niveles || [];
  const nivel = niveles.find((n) => n.numero === e.nivel_actual);
  const mision = nivel?.misiones?.find((m) => m.id === e.mision_actual);
  const paso = e.paso || {};

  // cabecera
  const pct = progreso(niveles);
  $("global-pct").textContent = `${pct} %`;
  $("global-barra").style.width = `${pct}%`;

  // AHORA MISMO
  $("ahora-nivel").textContent = nivel ? `Nivel ${nivel.numero}: ${nivel.nombre}` : "Sin nivel";
  $("ahora-mision").textContent = mision ? `Misión ${mision.id}: ${mision.titulo}` : "Sin misión abierta";
  const estadoPaso = paso.estado || mision?.estado || "en_curso";
  $("ahora").dataset.estado = estadoPaso;
  $("ahora-estado").dataset.estado = estadoPaso;
  $("ahora-estado").textContent = NOMBRES_ESTADO[estadoPaso] || estadoPaso;
  $("ahora-titulo").textContent = paso.titulo || "Sin paso activo";
  pintarMd($("ahora-que"), paso.que || "");
  pintarMd($("ahora-porque"), paso.porque || "");
  pintarMd($("ahora-empresa"), paso.empresa_real || "");
  for (const [id, valor] of [["ahora-porque", paso.porque], ["ahora-empresa", paso.empresa_real]])
    $(id).closest(".bloque").hidden = !valor;
  const comp = paso.comprobar;
  $("ahora-comprobar").hidden = !comp?.comando;
  if (comp?.comando) { $("ahora-cmd").textContent = comp.comando; $("ahora-esperado").textContent = comp.esperado || ""; }
  $("ahora-snapshot").hidden = !paso.snapshot;
  $("ahora-snapshot-texto").textContent = paso.snapshot || "";

  // SIGUIENTE
  $("siguientes").innerHTML = (e.siguientes || []).slice(0, 3).map((s) => `<li>${esc(s)}</li>`).join("");
  $("siguientes").closest("section").hidden = !(e.siguientes || []).length;

  // PROGRESO por nivel
  $("tab-progreso").innerHTML = niveles.map((n) => {
    const ms = n.misiones || [];
    const p = progreso([n]);
    const actual = n.numero === e.nivel_actual;
    return `<details class="nivel" data-actual="${actual ? "si" : "no"}" ${actual ? "open" : ""}>
      <summary>
        <span class="nivel-nombre"><small>Nivel ${n.numero}</small>${esc(n.nombre)}</span>
        <span class="barra"><span class="barra-relleno" style="width:${p}%;display:block"></span></span>
        <span class="nivel-pct">${p} %</span>
      </summary>
      <ul class="misiones">${ms.map((m) => `<li data-estado="${esc(m.estado)}"><span class="mid">${esc(m.id)}</span><span class="mt">${esc(m.titulo)}</span>${chip(m.estado)}</li>`).join("")}</ul>
    </details>`;
  }).join("") || `<p class="vacio">Todavía no hay niveles definidos.</p>`;

  // LABORATORIO
  const lab = e.laboratorio || {};
  const vms = lab.vms || [];
  const ramOn = vms.filter((v) => v.encendida_ahora).reduce((s, v) => s + (Number(v.ram_gb) || 0), 0);
  $("tab-lab").innerHTML = vms.length
    ? `<table class="tabla"><thead><tr><th>VM</th><th>IP</th><th>Rol</th><th>RAM</th><th>Ahora</th></tr></thead><tbody>
        ${vms.map((v) => `<tr><td><strong>${esc(v.nombre)}</strong></td><td><code>${esc(v.ip || "por definir")}</code></td><td>${esc(v.rol)}</td><td>${esc(v.ram_gb)} GB</td>
          <td><span class="encendida" data-on="${v.encendida_ahora ? "si" : "no"}">${v.encendida_ahora ? "Encendida" : "Apagada"}</span></td></tr>`).join("")}
      </tbody></table>
      <p class="ram-resumen" data-exceso="${ramOn > 11 || vms.filter((v) => v.encendida_ahora).length > 3 ? "si" : "no"}">RAM para las VMs encendidas: <strong>${ramOn} GB</strong> de 16 GB del PC (máximo 3 VMs a la vez).</p>
      <p class="ram-resumen">Último snapshot recomendado: <strong>${esc(lab.ultimo_snapshot || "ninguno todavía")}</strong></p>`
    : `<p class="vacio">Aún no hay máquinas virtuales. Aparecerán aquí a partir del nivel 1.</p>
       <p class="ram-resumen">Último snapshot recomendado: <strong>${esc(lab.ultimo_snapshot || "ninguno todavía")}</strong></p>`;

  // DUDAS
  const dudas = e.dudas || [];
  const abiertas = dudas.filter((d) => d.estado !== "resuelta");
  $("n-dudas").textContent = abiertas.length || "";
  $("tab-dudas").innerHTML = dudas.length
    ? `<ul class="lista">${dudas.map((d) => `<li data-estado="${d.estado === "resuelta" ? "resuelta" : "abierta"}">${esc(d.texto)}</li>`).join("")}</ul>`
    : `<p class="vacio">Sin dudas ni problemas abiertos.</p>`;

  // LOGROS
  const logros = e.logros || [];
  $("n-logros").textContent = logros.length || "";
  $("tab-logros").innerHTML = logros.length
    ? `<ul class="lista">${logros.map((l) => `<li>${esc(typeof l === "string" ? l : l.texto)}</li>`).join("")}</ul>`
    : `<p class="vacio">Los logros para el CV aparecen al terminar cada nivel.</p>`;

  // GLOSARIO
  const glos = e.glosario || [];
  $("n-glosario").textContent = glos.length || "";
  $("tab-glosario").innerHTML = glos.length
    ? `<dl class="glosario">${glos.map((g) => `<dt>${esc(g.termino)}</dt><dd>${esc(g.definicion)}</dd>`).join("")}</dl>`
    : `<p class="vacio">Cada concepto nuevo que aprendas se apuntará aquí.</p>`;

  // AVISOS
  const avisos = [{ tipo: "info", texto: `Coste acumulado del proyecto: ${Number(e.coste_eur) || 0} €.` }, ...(e.avisos || []).filter((a) => !/^Coste del proyecto/.test(a.texto))];
  const importantes = (e.avisos || []).filter((a) => a.tipo === "aviso" || a.tipo === "urgente");
  $("n-avisos").textContent = importantes.length || "";
  $("tab-avisos").innerHTML = `<ul class="lista">${avisos.map((a) => `<li data-tipo="${esc(a.tipo)}">${esc(a.texto)}</li>`).join("")}</ul>`;
  const urgentes = (e.avisos || []).filter((a) => a.tipo === "urgente");
  $("avisos-urgentes").hidden = !urgentes.length;
  $("avisos-urgentes").innerHTML = urgentes.map((a) => `<p>${esc(a.texto)}</p>`).join("");
}

// pestañas
for (const b of document.querySelectorAll("[data-tab]")) {
  b.addEventListener("click", () => {
    for (const o of document.querySelectorAll("[data-tab]")) {
      const activa = o === b;
      o.setAttribute("aria-selected", String(activa));
      $(`tab-${o.dataset.tab}`).hidden = !activa;
    }
    try { localStorage.setItem("cbc-tab", b.dataset.tab); } catch {}
  });
}
try { const t = localStorage.getItem("cbc-tab"); if (t) document.querySelector(`[data-tab="${t}"]`)?.click(); } catch {}

// ---------- chat ----------
const mensajes = $("mensajes");
let enCurso = null; // { el, texto, pendiente }

function pegadoAbajo() { return mensajes.scrollHeight - mensajes.scrollTop - mensajes.clientHeight < 120; }
function bajar(forzar) { if (forzar || pegadoAbajo()) mensajes.scrollTop = mensajes.scrollHeight; }

// "12:45" si es de hoy; "lun 27/10, 12:45" si es de otro día
function horaCorta(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d)) return "";
  const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return hora;
  return `${d.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "2-digit" })}, ${hora}`;
}

function crearMensaje(rol, texto, imagenes = 0, fecha) {
  $("chat-vacio")?.remove();
  const div = document.createElement("div");
  div.className = `msg msg-${rol}`;
  const autor = { pau: "Tú", claude: "Claude", error: "Aviso" }[rol] || rol;
  div.innerHTML = `<div class="msg-autor">${autor} <span class="msg-hora">${esc(horaCorta(fecha))}</span></div><div class="msg-cuerpo ${rol === "pau" ? "" : "md"}"></div>`;
  const cuerpo = div.querySelector(".msg-cuerpo");
  if (rol === "pau") cuerpo.textContent = texto || "(captura)";
  else pintarMd(cuerpo, texto);
  if (imagenes) div.insertAdjacentHTML("beforeend", `<div class="msg-img">${imagenes} captura${imagenes > 1 ? "s" : ""} adjunta${imagenes > 1 ? "s" : ""}</div>`);
  mensajes.append(div);
  return div;
}

function pintarHistorial(lista) {
  mensajes.replaceChildren();
  if (!lista.length) {
    mensajes.innerHTML = `<p class="chat-vacio" id="chat-vacio">Conversación nueva. Pulsa <strong>Sigamos</strong> para que Claude te diga dónde estamos.</p>`;
    return;
  }
  for (const m of lista) crearMensaje(m.rol, m.texto, m.imagenes, m.fecha);
  bajar(true);
}

const NOMBRES_HERRAMIENTA = (n) =>
  /microsoft-learn/.test(n) ? "Consultando Microsoft Learn…" :
  n === "Read" ? "Leyendo archivos del proyecto…" :
  n === "Glob" || n === "Grep" ? "Buscando en el proyecto…" :
  n === "Edit" || n === "Write" ? "Actualizando archivos…" :
  n === "Bash" || n === "PowerShell" ? "Preparando un comando…" :
  n === "WebFetch" || n === "WebSearch" ? "Consultando la web…" :
  /cbcpermisos/.test(n) ? "Esperando tu aprobación…" :
  "Trabajando…";

function setOcupado(ocupado, texto = "Pensando…") {
  $("pensando").hidden = !ocupado;
  $("pensando-texto").textContent = texto;
  for (const b of document.querySelectorAll(".rap, #btn-nueva")) b.disabled = ocupado;
  const env = $("btn-enviar");
  env.dataset.modo = ocupado ? "detener" : "enviar";
  env.textContent = ocupado ? "Detener" : "Enviar";
}

let pintarPendiente = false;
function pintarStreaming() {
  if (pintarPendiente) return;
  pintarPendiente = true;
  requestAnimationFrame(() => {
    pintarPendiente = false;
    if (!enCurso) return;
    const abajo = pegadoAbajo();
    pintarMd(enCurso.cuerpo, enCurso.texto);
    if (abajo) bajar(true);
  });
}

// adjuntos (pegar, arrastrar o elegir archivo)
let adjuntos = [];
function pintarAdjuntos() {
  const caja = $("adjuntos");
  caja.hidden = !adjuntos.length;
  caja.replaceChildren(...adjuntos.map((a, i) => {
    const d = document.createElement("div");
    d.className = "adjunto";
    d.innerHTML = `<img alt="Captura ${i + 1}" src="data:${a.media_type};base64,${a.data}"><button type="button" aria-label="Quitar captura">✕</button>`;
    d.querySelector("button").onclick = () => { adjuntos.splice(i, 1); pintarAdjuntos(); };
    return d;
  }));
}
function anadirArchivos(files) {
  for (const f of files) {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) continue;
    if (adjuntos.length >= 4) break;
    if (f.size > 5 * 1024 * 1024) { alert("La captura pesa más de 5 MB. Recórtala o guárdala en JPG."); continue; }
    const r = new FileReader();
    r.onload = () => { adjuntos.push({ media_type: f.type, data: String(r.result).split(",")[1] }); pintarAdjuntos(); };
    r.readAsDataURL(f);
  }
}
$("archivo").addEventListener("change", (e) => { anadirArchivos(e.target.files); e.target.value = ""; });
$("texto").addEventListener("paste", (e) => {
  const imgs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
  if (imgs.length) { e.preventDefault(); anadirArchivos(imgs); }
});
const col = $("chat-col");
let arrastres = 0;
col.addEventListener("dragenter", (e) => { if ([...e.dataTransfer.types].includes("Files")) { arrastres++; $("soltar").hidden = false; } });
col.addEventListener("dragleave", () => { if (--arrastres <= 0) { arrastres = 0; $("soltar").hidden = true; } });
col.addEventListener("dragover", (e) => e.preventDefault());
col.addEventListener("drop", (e) => { e.preventDefault(); arrastres = 0; $("soltar").hidden = true; anadirArchivos(e.dataTransfer.files); });

async function enviar(texto) {
  texto = String(texto || "").trim();
  if (!texto && !adjuntos.length) return;
  const imgs = adjuntos;
  try {
    await post("/api/mensaje", { texto, imagenes: imgs });
    crearMensaje("pau", texto, imgs.length);
    bajar(true);
    adjuntos = []; pintarAdjuntos();
    $("texto").value = ""; ajustarAltura();
  } catch (err) {
    crearMensaje("error", err.message);
  }
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  if ($("btn-enviar").dataset.modo === "detener") return post("/api/cancelar").catch(() => {});
  enviar($("texto").value);
});
function ajustarAltura() { const t = $("texto"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 220) + "px"; }
$("texto").addEventListener("input", ajustarAltura);
$("texto").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("form").requestSubmit(); }
});
for (const b of document.querySelectorAll(".rap")) b.addEventListener("click", () => enviar(b.dataset.msg));

$("btn-nueva").addEventListener("click", async () => {
  if (!confirm("¿Empezar una conversación nueva con Claude?\n\nEl historial actual se archiva y Claude no recordará esta conversación (el estado del panel y los archivos del proyecto no cambian).")) return;
  try { await post("/api/nueva-sesion"); } catch (err) { alert(err.message); }
});
$("btn-apagar").addEventListener("click", async () => {
  if (!confirm("¿Apagar el dashboard?")) return;
  try { await post("/api/apagar"); } catch {}
  $("apagado").hidden = false;
});

// ---------- ventana de confirmación ----------
const colaPermisos = [];
let permisoActual = null;
function mostrarPermiso() {
  if (permisoActual || !colaPermisos.length) return;
  permisoActual = colaPermisos.shift();
  const p = permisoActual;
  $("permiso-accion").textContent = p.accion;
  $("permiso-detalle").textContent = p.detalle || "";
  $("permiso-nota").hidden = !p.nota;
  $("permiso-nota").textContent = p.nota ? `Motivo que da Claude: ${p.nota}` : "";
  const extra = $("permiso-extra");
  extra.replaceChildren();
  const bloque = (etiqueta, texto) => {
    if (!texto) return;
    extra.insertAdjacentHTML("beforeend", `<p class="permiso-etiqueta">${esc(etiqueta)}</p>`);
    const pre = document.createElement("pre"); pre.className = "permiso-extra-pre"; pre.textContent = texto; extra.append(pre);
  };
  bloque("Contenido del archivo", p.contenido);
  bloque("Texto que se quita", p.antes);
  bloque("Texto que se pone", p.despues);
  $("permiso").showModal();
  $("permiso-no").focus();
}
async function responderPermiso(aprobado) {
  const p = permisoActual;
  if (!p) return;
  $("permiso").close();
  permisoActual = null;
  try { await post("/api/permiso/respuesta", { id: p.id, aprobado }); } catch {}
  mostrarPermiso();
}
$("permiso-si").addEventListener("click", () => responderPermiso(true));
$("permiso-no").addEventListener("click", () => responderPermiso(false));
$("permiso").addEventListener("cancel", (e) => { e.preventDefault(); responderPermiso(false); });

// ---------- eventos en directo ----------
function conectar() {
  const es = new EventSource("/api/events");
  es.addEventListener("open", () => { $("conexion").dataset.estado = "ok"; $("conexion").textContent = "Conectado"; });
  es.addEventListener("error", () => { $("conexion").dataset.estado = "caida"; $("conexion").textContent = "Sin conexión"; });
  es.addEventListener("hola", (ev) => setOcupado(JSON.parse(ev.data).ocupado));
  es.addEventListener("estado", (ev) => pintarEstado(JSON.parse(ev.data)));
  es.addEventListener("bitacora", (ev) => pintarBitacora(JSON.parse(ev.data)));
  es.addEventListener("historial", (ev) => pintarHistorial(JSON.parse(ev.data)));
  es.addEventListener("inicio", () => setOcupado(true));
  es.addEventListener("pensando", () => { if (!enCurso) $("pensando-texto").textContent = "Pensando…"; });
  es.addEventListener("herramienta", (ev) => { $("pensando-texto").textContent = NOMBRES_HERRAMIENTA(JSON.parse(ev.data).nombre); });
  es.addEventListener("delta", (ev) => {
    if (!enCurso) {
      const el = crearMensaje("claude", "");
      enCurso = { el, cuerpo: el.querySelector(".msg-cuerpo"), texto: "" };
      $("pensando-texto").textContent = "Escribiendo…";
    }
    enCurso.texto += JSON.parse(ev.data).texto;
    pintarStreaming();
  });
  es.addEventListener("respuesta", (ev) => {
    const { texto } = JSON.parse(ev.data);
    if (enCurso) { enCurso.texto = texto; pintarMd(enCurso.cuerpo, texto); }
    else crearMensaje("claude", texto);
    enCurso = null;
    bajar();
  });
  es.addEventListener("fallo", (ev) => {
    enCurso = null;
    crearMensaje("error", JSON.parse(ev.data).texto);
    bajar(true);
  });
  es.addEventListener("fin", () => { enCurso = null; setOcupado(false); $("texto").focus(); });
  es.addEventListener("permiso", (ev) => { colaPermisos.push(JSON.parse(ev.data)); mostrarPermiso(); });
  es.addEventListener("permiso-resuelto", (ev) => {
    const { id } = JSON.parse(ev.data);
    const i = colaPermisos.findIndex((p) => p.id === id);
    if (i >= 0) colaPermisos.splice(i, 1);
    if (permisoActual?.id === id) { $("permiso").close(); permisoActual = null; mostrarPermiso(); }
  });
  es.addEventListener("apagado", () => { es.close(); $("apagado").hidden = false; });
}

// ---------- diario (memoria con fecha y hora) ----------
// Las entradas llevan fecha "AAAA-MM-DD HH:MM" en hora de Madrid.
function partirFecha(f) {
  const [dia, hora = ""] = String(f || "").split(" ");
  const [a, m, d] = dia.split("-").map(Number);
  const fecha = new Date(a, (m || 1) - 1, d || 1);
  return { dia, hora, nombreDia: isNaN(fecha) ? dia : fecha.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) };
}
function pintarBitacora(lista) {
  lista = Array.isArray(lista) ? lista : [];
  const ultimo = lista[lista.length - 1];
  $("ultimo").hidden = !ultimo;
  if (ultimo) {
    const p = partirFecha(ultimo.fecha);
    $("ultimo-fecha").textContent = `${p.nombreDia}, ${p.hora}`;
    $("ultimo-texto").textContent = ultimo.texto;
  }
  $("n-diario").textContent = lista.length || "";
  if (!lista.length) { $("tab-diario").innerHTML = `<p class="vacio">Aquí se apunta, con día y hora, cada cosa que termines.</p>`; return; }
  let html = "", diaActual = null;
  for (const e of [...lista].reverse()) {
    const p = partirFecha(e.fecha);
    if (p.dia !== diaActual) {
      if (diaActual !== null) html += "</ul>";
      html += `<p class="diario-dia">${esc(p.nombreDia)}</p><ul class="diario">`;
      diaActual = p.dia;
    }
    const donde = [e.nivel != null ? `Nivel ${e.nivel}` : "", e.mision ? `misión ${e.mision}` : ""].filter(Boolean).join(", ");
    html += `<li><span class="diario-hora">${esc(p.hora)}</span><div>${donde ? `<div class="diario-donde">${esc(donde)}</div>` : ""}<div>${esc(e.texto)}</div>${e.siguiente ? `<div class="diario-sig">Siguiente: ${esc(e.siguiente)}</div>` : ""}</div></li>`;
  }
  $("tab-diario").innerHTML = html + "</ul>";
}

// ---------- arranque ----------
const [estado, historial, bitacora] = await Promise.all([
  fetch("/api/estado").then((r) => r.json()),
  fetch("/api/historial").then((r) => r.json()),
  fetch("/api/bitacora").then((r) => r.json()),
]);
pintarEstado(estado);
pintarHistorial(historial);
pintarBitacora(bitacora);
conectar();
$("texto").focus();
