# ⚡ Pikachu — VS Code Extension

Explain and save code learnings without leaving your editor.

## Requirements

The Pikachu Next.js app must be running locally:

```bash
cd /path/to/pikachu
npm run dev   # starts on http://localhost:3200
```

## Usage

### Explain a selection
1. Select code in any file
2. Right-click → **Pikachu: Explain Selection**  
   or press `Cmd+Shift+E` (Mac) / look for it in the Command Palette

### Explain a whole file
Right-click anywhere in an open file → **Pikachu: Explain File**

### Search your learnings
Command Palette → **Pikachu: Search Learnings**  
Results open in the Pikachu dashboard.

### Open the dashboard
Command Palette → **Pikachu: Open Dashboard**

## Status bar

The `⚡ Pikachu` item in the bottom-right status bar shows server connectivity:
- `⚡ Pikachu` — server connected, click to explain selection
- `⚡ Pikachu (offline)` — server not reachable

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `pikachu.serverUrl` | `http://localhost:3200` | URL of the Pikachu server |
| `pikachu.provider` | `claude` | AI backend: `claude` or `opencode` |
| `pikachu.autoSave` | `false` | Auto-save explanations without clicking Save |

## Development

```bash
cd vscode-extension
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

## How it works

1. The extension spawns **no AI process itself** — it calls your local Pikachu server's `/api/explain` endpoint
2. The server runs the AI (Claude Code CLI or opencode CLI) headlessly
3. Results appear in a side panel webview; click **Save to Pikachu** to persist
