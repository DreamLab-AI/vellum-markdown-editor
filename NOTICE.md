# Notices

## This work

**Vellum Markdown Editor** — GPL-3.0-only.

- Original work: *Obsidian-style Markdown Live Editor* 0.1.4, Copyright © 2026 Thinh Vu,
  <https://github.com/thinh-vu/vscode-markdown-editor>, commit `b90af69`, GPL-3.0.
  The extension icon (`assets/`) and the translations are upstream's and are unchanged.
- Modifications: Copyright © 2026 DreamLab AI Consulting Ltd, dated from 14 November 2026.
  As required by section 5(a) of the licence, the changes are stated in `CHANGELOG.md` and
  `SECURITY-REVIEW.md`, and the full history is in the repository.

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License, version 3, as published by the Free Software Foundation. It is
distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See `LICENSE`.

## Code adapted into this repository

| File | Adapted from | Licence |
|---|---|---|
| `webview/plugins/diagram.ts` | `@milkdown/plugin-diagram` 7.7.0, Copyright © 2020-present Mirone | MIT |

## Components bundled into the built extension

All are MIT-licensed, which is compatible with GPL-3.0. Their licence texts ship in each
package under `node_modules/` and are reproduced by reference here.

| Component | Version | Copyright |
|---|---|---|
| Pele (`pele`) | 1.12.0, pinned by SHA-256 | © 2026 kepano |
| Paged.js (`pagedjs`) | 0.4.3, pinned by SHA-256 | © 2018 Adam Hyde |
| Milkdown (`@milkdown/*`) | 7.x | © 2020-present Mirone |
| ProseMirror (`prosemirror-*`) | per lockfile | © Marijn Haverbeke and others |
| CodeMirror 6 (`@codemirror/*`) | per lockfile | © Marijn Haverbeke and others |
| KaTeX (`katex`) | per lockfile | © 2013-2020 Khan Academy and other contributors |

The complete dependency set, with exact versions and integrity hashes, is `package-lock.json`.
Run `npx license-checker --production --summary` for a full licence inventory.

## Names

"Obsidian" is a trademark of Dynalist Inc. "Mermaid" is the name of the Mermaid diagramming
project. Both are used only to describe compatibility. This project is not affiliated with or
endorsed by either, nor by Thinh Vu or Vnstock.
