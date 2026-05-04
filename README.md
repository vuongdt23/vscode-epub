# EPUB Reader for VS Code

A full-featured EPUB reader extension for Visual Studio Code, powered by [react-reader](https://github.com/gerhardsletten/react-reader) (epub.js).

## Features

- **Custom Editor** — opens `.epub` files directly in a VS Code tab
- **Table of Contents** — slide-out overlay panel with chapter navigation
- **Bookmarks** — save and jump to bookmarks, persisted across sessions (global storage)
- **Reading Progress** — absolute page progress with a seekable progress bar
- **Themes** — light, dark, and sepia modes with full theme consistency
- **Font Controls** — adjustable font size (60%–200%)
- **Responsive Layout** — two-page spread on wide viewports, single page on narrow
- **Content Constraints** — tables and images are clamped to page width
- **Position Persistence** — remembers your reading position per file

## Getting Started

### Prerequisites

- Node.js >= 18
- VS Code >= 1.85

### Install & Build

```bash
npm install
cd webview && npm install && cd ..
npm run build
```

### Run in Development

1. Open this folder in VS Code
2. Press **F5** (launches Extension Development Host)
3. Open any `.epub` file in the new window

### Usage

- **Open via file association** — double-click or open any `.epub` file
- **Open via command palette** — `Ctrl+Shift+P` → "EPUB Reader: Open EPUB File"

## Project Structure

```
├── src/
│   ├── extension.ts            # Extension entry point
│   └── epubEditorProvider.ts   # CustomReadonlyEditorProvider for .epub files
├── webview/
│   └── src/
│       ├── App.tsx             # React reader UI (TOC, themes, bookmarks, progress)
│       ├── styles.css          # Themed styles
│       └── main.tsx            # Webview entry
├── package.json                # Extension manifest & scripts
└── .vscode/
    ├── launch.json             # F5 debug configuration
    └── tasks.json              # Build task
```

## Architecture

- **Extension Host** (Node.js) — reads `.epub` as binary, sends to webview via `postMessage`, persists reading state in `globalState`
- **Webview** (React + Vite) — renders the book with react-reader, handles UI interactions, reports position changes back to the extension

Communication uses a ready-handshake pattern: the webview signals `ready`, then the extension sends the book data.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build extension + webview |
| `npm run build:extension` | Build extension only (esbuild) |
| `npm run build:webview` | Build webview only (Vite) |
| `npm run watch:extension` | Watch mode for extension |
| `npm run dev` | Concurrent watch for both |

## License

MIT
