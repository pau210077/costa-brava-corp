// Servidor MCP de permisos.
// Claude Code lo arranca (via --mcp-config) y lo consulta (via --permission-prompt-tool)
// cada vez que Claude quiere usar una herramienta que no esta permitida por defecto.
// Este proceso no decide nada: pregunta al dashboard y espera a que Pau pulse Aprobar o Denegar.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PUERTO = process.env.CBC_PUERTO || "4321";
const TOKEN = process.env.CBC_TOKEN || "";

const server = new McpServer({ name: "cbcpermisos", version: "1.0.0" });

server.registerTool(
  "aprobar",
  {
    description: "Pide a Pau, desde el dashboard, que apruebe o deniegue una accion.",
    inputSchema: {
      tool_name: z.string(),
      input: z.record(z.string(), z.unknown()),
      tool_use_id: z.string().optional(),
    },
  },
  async ({ tool_name, input, tool_use_id }) => {
    let decision;
    try {
      const res = await fetch(`http://127.0.0.1:${PUERTO}/api/permiso/solicitud`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-cbc-token": TOKEN },
        body: JSON.stringify({ tool_name, input, tool_use_id }),
      });
      const { aprobado } = await res.json();
      decision = aprobado
        ? { behavior: "allow", updatedInput: input }
        : { behavior: "deny", message: "Pau ha denegado esta accion en el dashboard. No la repitas; preguntale que prefiere." };
    } catch (err) {
      decision = { behavior: "deny", message: "No se pudo contactar con el dashboard para pedir permiso." };
    }
    return { content: [{ type: "text", text: JSON.stringify(decision) }] };
  }
);

await server.connect(new StdioServerTransport());
