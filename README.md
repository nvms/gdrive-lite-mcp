# gdrive-lite-mcp

A small, read-only MCP server for Google Drive: `search`, `read` (Docs, Sheets and Slides as text) and `download` (any file, into a folder you name). It asks Google only for read-only access.

## Setup, once

1. In [Google Cloud Console](https://console.cloud.google.com/), in a project with an OAuth app (see [gmail-lite-mcp](https://github.com/nvms/gmail-lite-mcp) for setting one up), enable the **Google Drive API**.
2. Save a **Desktop app** client's JSON to `~/.config/gdrive-lite-mcp/client.json`.
3. Sign in:

   ```sh
   npx -y github:nvms/gdrive-lite-mcp auth
   ```

## Use

```json
{ "mcpServers": { "drive": { "command": "npx", "args": ["-y", "github:nvms/gdrive-lite-mcp"] } } }
```
