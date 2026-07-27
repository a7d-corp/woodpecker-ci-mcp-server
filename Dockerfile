# Woodpecker CI MCP server — zero dependencies, single file, stdio transport.
FROM node:20-alpine

WORKDIR /app

# No dependencies to install; just the single-file server.
COPY server.mjs ./

# Run as the built-in non-root user.
USER node

# stdio transport: run with `docker run -i --rm ... woodpecker-ci-mcp-server`
ENTRYPOINT ["node", "server.mjs"]
