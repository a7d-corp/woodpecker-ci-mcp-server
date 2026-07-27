# Running with Docker

This MCP server is a single zero-dependency file that speaks the Model Context
Protocol over **stdio**. The container must therefore be run interactively
(`-i`) so the client can talk to it over stdin/stdout. Configuration is passed
via environment variables.

## Build

```bash
docker build -t woodpecker-ci-mcp-server .
```

## Run

```bash
docker run -i --rm \
  -e WOODPECKER_URL=https://your-woodpecker.example.com \
  -e WOODPECKER_TOKEN=your-token \
  woodpecker-ci-mcp-server
```

- `-i` is required — without it stdin closes and the JSON-RPC handshake never
  completes.
- There is no port to expose; a stdio server does not listen on the network.

## MCP client configuration

For a client such as Claude Desktop or Claude Code, point the server at `docker`:

```json
{
  "command": "docker",
  "args": [
    "run", "-i", "--rm",
    "-e", "WOODPECKER_URL",
    "-e", "WOODPECKER_TOKEN",
    "woodpecker-ci-mcp-server"
  ],
  "env": {
    "WOODPECKER_URL": "https://your-woodpecker.example.com",
    "WOODPECKER_TOKEN": "your-token"
  }
}
```
