# Dashboard de Costa Brava Corp

Web local desde la que sigo el proyecto: chat con mi mentor (Claude Code) y un panel con
el paso actual, el progreso, el laboratorio y los avisos.

## Arrancar y parar

- **Arrancar**: doble clic en `Costa Brava Corp.bat` en el escritorio (o en `dashboard/arrancar.bat`).
  Se abre una ventana minimizada con el servidor y el navegador en http://127.0.0.1:4321.
- **Parar**: botón **Apagar** del dashboard, o cerrar la ventana "Costa Brava Corp - servidor".
- La primera vez instala las dependencias (`npm install`). Requiere Node.js 20+ y Claude Code
  instalado y con sesión iniciada (`claude` debe funcionar en una terminal).

## Cómo funciona por dentro

```
Navegador ──HTTP/SSE──> server.js (127.0.0.1:4321) ──lanza──> claude -p --resume <sesión>
    ^                        |   ^                                   |
    |   ventana Aprobar      |   └──── pregunta permiso ──── mcp-permisos.js (MCP)
    └────────────────────────┘
                     vigila dashboard/data/estado.json  <── Claude lo edita
```

1. **Servidor (`server.js`)**: Node.js sin frameworks. Escucha solo en `127.0.0.1`, así que
   nadie de la red puede entrar. Sirve la web y es el único que habla con Claude Code.
2. **Un proceso por mensaje**: cada mensaje lanza `claude -p` (modo no interactivo) con
   `--resume <id>`, de modo que siempre continúa la misma conversación. El id se guarda en
   `.local/sesion.txt`. "Nueva sesión" lo borra y archiva el historial.
3. **Streaming**: con `--output-format stream-json --include-partial-messages` Claude Code
   emite cada trozo de texto como una línea JSON. El servidor las reenvía al navegador con
   Server-Sent Events (un canal servidor → navegador sobre HTTP).
4. **Capturas**: se envían con `--input-format stream-json` como bloques de imagen en base64.
5. **Permisos (mínimo privilegio)**: por defecto Claude solo puede leer el proyecto, consultar
   Microsoft Learn y editar `dashboard/data/` (`--allowedTools`). Para cualquier otra cosa,
   Claude Code consulta la herramienta indicada en `--permission-prompt-tool`: un mini servidor
   MCP (`mcp-permisos.js`) que pregunta al servidor, y este muestra la ventana de confirmación
   con el comando o el archivo exactos. Si no pulso Aprobar, no se hace. `AskUserQuestion`
   está desactivado: las preguntas llegan por el chat.
6. **Panel en vivo**: Claude actualiza `data/estado.json`; el servidor lo vigila (`fs.watch`)
   y la web se repinta sola.
7. **Memoria**: el servidor antepone a cada mensaje la fecha y hora de Madrid, y Claude apunta
   cada avance en `data/bitacora.json`. Con "Sigamos" la lee primero, así que recuerda dónde
   lo dejamos aunque se empiece una sesión nueva. La web la muestra en "Lo último que hiciste"
   y en la pestaña Diario.
8. **Protecciones del servidor**: solo acepta peticiones dirigidas a `127.0.0.1`/`localhost`
   (contra *DNS rebinding*), las acciones exigen una cabecera propia y el origen correcto
   (contra que otra web abierta en el navegador las dispare), y el canal de permisos usa un
   token aleatorio que solo conoce `mcp-permisos.js`. La web nunca ejecuta comandos.

### Por qué la CLI y no el Agent SDK

El Agent SDK sería más cómodo, pero su documentación pide autenticarse con API key (de pago).
`claude -p` es Claude Code tal cual, con mi sesión normal: coste 0 € y mismas reglas de permisos.

## Archivos

| Archivo | Para qué |
|---------|----------|
| `server.js` | Servidor HTTP, lanzador de Claude Code, SSE y permisos |
| `mcp-permisos.js` | Herramienta MCP que pide aprobación al dashboard |
| `public/` | La web: `index.html`, `styles.css`, `app.js` |
| `data/estado.json` | Estado del panel (en git) |
| `data/bitacora.json` | Diario con fecha y hora de cada avance: la memoria entre sesiones (en git) |
| `.local/` | Historial del chat, id de sesión, logs (fuera de git) |
| `arrancar.bat` | Arranque con doble clic |

## Problemas frecuentes

- **"No se pudo arrancar Claude Code"**: abre una terminal y prueba `claude --version`.
- **El panel no cambia**: revisa que `data/estado.json` sea JSON válido; el servidor ignora
  versiones rotas hasta que se corrigen.
- **Logs**: `dashboard/.local/claude.log`.
