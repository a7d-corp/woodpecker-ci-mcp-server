# Woodpecker CI MCP Server

> A **Model Context Protocol (MCP) server for [Woodpecker CI](https://woodpecker-ci.org/)** — let AI assistants like **Claude**, **Claude Code**, **Cursor**, and any MCP-compatible client read your CI pipelines, inspect workflows and steps, and pull decoded build logs to debug failures.

[![MCP](https://img.shields.io/badge/MCP-server-blue)](https://modelcontextprotocol.io/)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-green)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)
[![Dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)

**Keywords:** Woodpecker CI, MCP server, Model Context Protocol, CI/CD, pipeline logs, build logs, Claude, Claude Code, Anthropic, AI DevOps assistant, LLM tools, continuous integration.

---

## What it does

This is a tiny, **single-file, zero-dependency** MCP server that wraps the Woodpecker CI REST API. Once connected, your AI assistant can answer questions like:

- "Why did the latest pipeline on `main` fail?"
- "Show me the logs for the failed lint step in pipeline #2105."
- "List the last 20 pipelines for repo 1 and tell me which ones are red."

It speaks MCP over **stdio**, uses only the built-in `fetch` from Node 18+, and reads its configuration from two environment variables. Nothing is hardcoded.

## Tools

| Tool | Parameters | Returns |
| --- | --- | --- |
| `woodpecker_list_repos` | – | Repositories the token can access (`id`, full name, default branch) |
| `woodpecker_list_pipelines` | `repo_id`, `limit?` (default 20) | Recent pipelines with status, event, branch, commit, message |
| `woodpecker_get_pipeline` | `repo_id`, `number` | Pipeline status + full workflow/step tree (with step ids for logs) |
| `woodpecker_pipeline_logs` | `repo_id`, `number`, `step_id`, `tail?` | Decoded logs for a single step (base64 from the API is decoded for you) |

> Read-only by design — the server only performs `GET` requests. It never starts, stops, approves, or deletes pipelines.

## Requirements

- **Node.js ≥ 18** (uses the built-in global `fetch`)
- A **Woodpecker Personal Access Token** (see below)

## Configuration

The server is configured entirely through environment variables — there are **no default URLs or tokens baked into the code**:

| Variable | Required | Description |
| --- | --- | --- |
| `WOODPECKER_URL` | yes | Base URL of your Woodpecker instance, e.g. `https://your-woodpecker.example.com` (no trailing slash) |
| `WOODPECKER_TOKEN` | yes | Your Woodpecker Personal Access Token (JWT) |

### Get a Personal Access Token

In the Woodpecker UI: **User settings → CLI and API → Personal Access Token**. Copy the token.

### Find your `repo_id`

It is the numeric id in the repo URL (`/repos/<id>/...`) or via `woodpecker_list_repos`.

## Installation

Clone the repo (or copy `server.mjs` anywhere — it has no dependencies to install):

```bash
git clone https://github.com/coredeskdev/woodpecker-ci-mcp-server.git
```

### Claude Code (CLI)

```bash
claude mcp add woodpecker \
  -s user \
  -e WOODPECKER_URL=https://your-woodpecker.example.com \
  -e WOODPECKER_TOKEN=your-token \
  -- node /absolute/path/to/woodpecker-ci-mcp-server/server.mjs
```

`-s user` makes it available across all your projects on this machine. Drop it for the current project only.

### Claude Desktop / generic MCP client

Add to your MCP config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "woodpecker": {
      "command": "node",
      "args": ["/absolute/path/to/woodpecker-ci-mcp-server/server.mjs"],
      "env": {
        "WOODPECKER_URL": "https://your-woodpecker.example.com",
        "WOODPECKER_TOKEN": "your-token"
      }
    }
  }
}
```

### Cursor / Windsurf / other MCP hosts

Any host that supports stdio MCP servers works — point the `command` at `node` and the `args` at `server.mjs`, and pass the two env vars.

## Example prompts

Once connected, try:

- *"Using the woodpecker tools, list the last 10 pipelines for repo 1."*
- *"Get pipeline 2105 in repo 1 and tell me which step failed and why."*
- *"Show me the last 40 lines of the logs for step 38613 in pipeline 2105, repo 1."*

## How it works

The server implements the MCP JSON-RPC 2.0 handshake (`initialize`, `tools/list`, `tools/call`) over stdio. Each tool issues an authenticated `GET` to `${WOODPECKER_URL}/api/...` with `Authorization: Bearer ${WOODPECKER_TOKEN}`. Step logs come back base64-encoded per line from the Woodpecker API; the server decodes and concatenates them for you. Diagnostic output goes to **stderr** so it never corrupts the stdout JSON-RPC stream.

## Security

- Treat `WOODPECKER_TOKEN` like a password. Prefer your MCP client's env/secret storage over committing it anywhere.
- `.env` is git-ignored; only `.env.example` (with placeholders) is tracked.
- The server is read-only (`GET`-only), reducing blast radius if a token leaks.

## Manual smoke test

```bash
WOODPECKER_URL=https://your-woodpecker.example.com \
WOODPECKER_TOKEN=your-token \
node server.mjs
# then paste an MCP initialize frame on stdin, or just rely on your MCP client.
```

## License

[MIT](./LICENSE) © coredeskdev

---

<sub>This project is an independent, community-built integration and is not affiliated with or endorsed by the Woodpecker CI project or Anthropic.</sub>
