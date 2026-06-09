# Third-Party Notices

Chisl (AionUi) includes or redistributes components from the projects below. This
list covers **direct dependencies** that are materially bundled into the desktop
application (editor, diff UI, terminal, and core UI). Additional transitive
libraries are included in the shipped build; their licenses apply as stated in
the corresponding npm packages.

This file is provided for attribution and license compliance. It does not modify
the terms of any third-party license.

---

## Editor and language services

### Monaco Editor

- **Package:** `monaco-editor`
- **Copyright:** Copyright (c) Microsoft Corporation
- **License:** MIT
- **Repository:** https://github.com/microsoft/monaco-editor

### monaco-vscode-api (CodinGame)

- **Packages:** `@codingame/monaco-vscode-api`, `@codingame/monaco-vscode-*-service-override`, and related `@codingame/monaco-vscode-*` packages; `@aionui/editor-monaco` (npm alias to `@codingame/monaco-vscode-editor-api`)
- **Copyright:** CodinGame and contributors
- **License:** MIT
- **Repository:** https://github.com/CodinGame/monaco-vscode-api

### Monaco Language Client

- **Package:** `monaco-languageclient`
- **License:** MIT
- **Repository:** https://github.com/TypeFox/monaco-languageclient

---

## Diff and syntax highlighting

### Pierre Diffs

- **Packages:** `@pierre/diffs`, `@pierre/theme`
- **License:** Apache License 2.0 (`@pierre/diffs`); MIT (`@pierre/theme`)
- **Repository:** https://github.com/pierrecomputer/diffs (and related Pierre packages)

Shiki and related highlighters are used transitively through `@pierre/diffs` under
their respective licenses (typically MIT).

---

## User interface and rendering

### React

- **Packages:** `react`, `react-dom`
- **License:** MIT
- **Repository:** https://github.com/facebook/react

### Arco Design

- **Package:** `@arco-design/web-react`
- **License:** MIT
- **Repository:** https://github.com/arco-design/arco-design

### Mermaid

- **Package:** `mermaid`
- **License:** MIT
- **Repository:** https://github.com/mermaid-js/mermaid

---

## Terminal

### xterm.js

- **Packages:** `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-canvas`
- **License:** MIT
- **Repository:** https://github.com/xtermjs/xterm.js

---

## Agent and protocol SDKs (selected)

### Agent Client Protocol SDK

- **Package:** `@agentclientprotocol/sdk`
- **License:** See package `LICENSE` in `node_modules`
- **Repository:** https://github.com/agentclientprotocol/sdk

### Model Context Protocol SDK

- **Package:** `@modelcontextprotocol/sdk`
- **License:** MIT
- **Repository:** https://github.com/modelcontextprotocol/typescript-sdk

---

## Prior project lineage

Chisl is derived from the AionUi project (Apache License 2.0). See the repository
`LICENSE` and `NOTICE` files for copyright and license information regarding
that lineage.

---

## MIT License (reference)

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in the
Software without restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN
AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

_For the full Apache License 2.0 text, see the repository `LICENSE` file and
upstream `LICENSE` / `LICENSE.md` files in the respective packages._