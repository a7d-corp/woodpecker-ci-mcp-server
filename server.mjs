#!/usr/bin/env node
// Minimal MCP server (stdio, JSON-RPC 2.0) for Woodpecker CI.
// Zero dependencies — plain Node 18+ (built-in fetch). Config via env vars.
//
// Configuration (env):
//   WOODPECKER_URL    e.g. https://your-woodpecker.example.com
//   WOODPECKER_TOKEN  Woodpecker Personal Access Token (JWT)
//
// Tools:
//   woodpecker_list_repos
//   woodpecker_list_pipelines  { repo_id, limit? }
//   woodpecker_get_pipeline    { repo_id, number }   -> status + workflow/step tree
//   woodpecker_pipeline_logs   { repo_id, number, step_id, tail? } -> decoded step logs

import { Buffer } from "node:buffer";

const BASE = (process.env.WOODPECKER_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.WOODPECKER_TOKEN || "";

function log(...a) {
  // Diagnostics go to stderr so they never corrupt the stdout JSON-RPC stream.
  process.stderr.write("[woodpecker-mcp] " + a.join(" ") + "\n");
}

async function api(path) {
  if (!BASE || !TOKEN) throw new Error("Missing WOODPECKER_URL or WOODPECKER_TOKEN in environment");
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

// --- tool response formatting ---

function summarizePipeline(p) {
  const lines = [];
  lines.push(`pipeline #${p.number} (id=${p.id})  status=${p.status}  event=${p.event}  branch=${p.branch}`);
  lines.push(`commit=${(p.commit || "").slice(0, 12)}  author=${p.author}`);
  if (p.message) lines.push(`message: ${p.message.split("\n")[0]}`);
  for (const wf of p.workflows || []) {
    lines.push(`  WORKFLOW "${wf.name}" (pid=${wf.pid}) state=${wf.state}${wf.error ? ` error=${wf.error}` : ""}`);
    for (const c of wf.children || []) {
      lines.push(
        `    step "${c.name}" (id=${c.id}, pid=${c.pid}) ${c.state} exit=${c.exit_code ?? "-"} type=${c.type}`
      );
    }
  }
  return lines.join("\n");
}

function decodeLogs(entries) {
  if (!Array.isArray(entries)) return String(entries);
  return entries
    .map((e) => {
      const d = e?.data;
      if (d == null) return "";
      try {
        return Buffer.from(d, "base64").toString("utf-8");
      } catch {
        return String(d);
      }
    })
    .join("");
}

const TOOLS = [
  {
    name: "woodpecker_list_repos",
    description: "List repositories the token can access (id, full name, default branch).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async () => {
      const repos = await api(`/user/repos`);
      return (repos || [])
        .map((r) => `id=${r.id}  ${r.full_name}  default_branch=${r.default_branch}`)
        .join("\n") || "(no repositories)";
    },
  },
  {
    name: "woodpecker_list_pipelines",
    description: "Recent pipelines for a repository. Params: repo_id (number), limit (number, default 20).",
    inputSchema: {
      type: "object",
      properties: {
        repo_id: { type: "number", description: "Woodpecker repository ID" },
        limit: { type: "number", description: "How many pipelines to return (default 20)" },
      },
      required: ["repo_id"],
      additionalProperties: false,
    },
    handler: async ({ repo_id, limit }) => {
      const list = await api(`/repos/${repo_id}/pipelines?perPage=${limit || 20}`);
      return (list || [])
        .map(
          (p) =>
            `#${p.number}  ${p.status.padEnd(8)}  ${p.event.padEnd(12)}  ${p.branch}  ${(p.commit || "").slice(0, 8)}  ${(p.message || "").split("\n")[0]}`
        )
        .join("\n") || "(no pipelines)";
    },
  },
  {
    name: "woodpecker_get_pipeline",
    description: "Pipeline details: status plus the workflow/step tree (with step ids for fetching logs). Params: repo_id, number.",
    inputSchema: {
      type: "object",
      properties: {
        repo_id: { type: "number" },
        number: { type: "number", description: "Pipeline number (as shown in the UI)" },
      },
      required: ["repo_id", "number"],
      additionalProperties: false,
    },
    handler: async ({ repo_id, number }) => {
      const p = await api(`/repos/${repo_id}/pipelines/${number}`);
      return summarizePipeline(p);
    },
  },
  {
    name: "woodpecker_pipeline_logs",
    description: "Decoded logs for a single step. Params: repo_id, number (pipeline), step_id (from woodpecker_get_pipeline). Optional tail (last N lines).",
    inputSchema: {
      type: "object",
      properties: {
        repo_id: { type: "number" },
        number: { type: "number" },
        step_id: { type: "number", description: "Step id from woodpecker_get_pipeline" },
        tail: { type: "number", description: "Return only the last N lines (optional)" },
      },
      required: ["repo_id", "number", "step_id"],
      additionalProperties: false,
    },
    handler: async ({ repo_id, number, step_id, tail }) => {
      const entries = await api(`/repos/${repo_id}/logs/${number}/${step_id}`);
      let txt = decodeLogs(entries);
      if (tail && tail > 0) {
        txt = txt.split("\n").slice(-tail).join("\n");
      }
      return txt || "(no logs)";
    },
  },
];

// --- JSON-RPC over stdio loop ---

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(req) {
  const { id, method, params } = req;
  if (method === "initialize") {
    reply(id, {
      protocolVersion: params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "woodpecker-mcp", version: "1.0.0" },
    });
    return;
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return; // notifications carry no response
  }
  if (method === "ping") {
    reply(id, {});
    return;
  }
  if (method === "tools/list") {
    reply(id, {
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
    return;
  }
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) {
      replyError(id, -32602, `Unknown tool: ${params?.name}`);
      return;
    }
    try {
      const text = await tool.handler(params.arguments || {});
      reply(id, { content: [{ type: "text", text }] });
    } catch (e) {
      reply(id, { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
    }
    return;
  }
  if (id !== undefined) replyError(id, -32601, `Unsupported method: ${method}`);
}

let buf = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      continue;
    }
    handle(req).catch((e) => log("handler error:", e.message));
  }
});
process.stdin.on("end", () => process.exit(0));
log("ready", BASE ? `(${BASE})` : "(WOODPECKER_URL is not set!)");
