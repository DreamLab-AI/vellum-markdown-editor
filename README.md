# Vellum Markdown Editor

A live, what-you-see-is-what-you-get Markdown editor for VS Code, with diagrams rendered by
[Pele](https://github.com/obsidianmd/pele) and webviews locked down by a strict content
security policy.

Vellum is a modified version of
[**Obsidian-style Markdown Live Editor**](https://github.com/thinh-vu/vscode-markdown-editor)
by Thinh Vu, released under the same licence, GPL-3.0. See [Attribution](#attribution-and-licence).

## What it does

- **Live editing.** Edit rendered Markdown directly (Milkdown), or switch to a source view
  (CodeMirror 6) that stays in sync.
- **Diagrams.** Fenced `mermaid` blocks render in place and follow your VS Code theme. A syntax
  error shows the line and a caret under the fault.
- **Maths, tables and GitHub-flavoured Markdown.** KaTeX, a table context menu, admonitions,
  task lists and YAML front matter.
- **Slash commands and templates.** Type `/` for a quick-insert menu; keep your own templates in
  a folder.
- **Images.** Paste or drop an image to save it under a configured directory; rename it from
  the context menu.
- **Wikilinks and outline.** Type `[[` to link another note; a fly-out outline tracks headings.
- **Sidebar.** Recent notes, the whole workspace, and bookmarks.
- **PDF export.** Paginated preview with header, footer, page numbers and an optional contents
  page.
- **Send to AI context.** Send the selection, with its file and line range, to a chat panel.

## What differs from upstream

| Area | Upstream 0.1.4 | Vellum |
|---|---|---|
| Diagram renderer | Mermaid 10 and 11, both bundled | Pele 1.12.0: no dependencies, synchronous, no `eval` |
| Editor bundle | 7.75 MB | 2.26 MB |
| Sidebar webview | No content security policy; a value from a workspace file reached an inline handler | Nonce policy, no inline handlers, all values escaped |
| PDF export | Loaded a script from a CDN, unpinned | Pinned copy, checked by SHA-256 at build, bundled |
| Editor webview | `'unsafe-eval'`; Google Fonts fetched on every open | Neither |
| Raw HTML and diagram output | Assigned to `innerHTML` | Sanitised, attached as nodes |
| npm advisories | 28, one critical | 19, none critical; one low-severity issue ships |

The full review, including what is **not** fixed, is in [SECURITY-REVIEW.md](SECURITY-REVIEW.md).

### Diagram compatibility

Mermaid stays the source syntax, so your documents do not change. Pele targets Mermaid 12.1
syntax and lays diagrams out with its own engine, so a diagram can look different from
Mermaid's rendering. Mermaid themes, `%%{init}%%` directives and click handlers are not
honoured.

## Status

This is a source release, **not published to the VS Code Marketplace**. A locally packaged
VSIX was installed and exercised in VS Code 1.106.3 on Linux on 14 November 2026. Testing
found and fixed duplicate command registration, a startup content-loading race, and broken
script insertion in the print preview. See [CHANGELOG.md](CHANGELOG.md).

Verified in VS Code: rendered Markdown, editing and saving to disk, source mode, a Pele
flowchart, maths, tables, the notes sidebar, and image paste with a saved, loaded local image.
The generated print preview was also checked in headless Chromium: pagination completed
without JavaScript errors and produced a one-page A4 PDF. Print colours still need polish;
the dark editor theme can produce faint text on a white page.

These are smoke checks, not a complete compatibility test. macOS, Windows, remote
workspaces, AI context, templates, image renaming and the interactive browser print dialog
were not exercised in this pass.

## Build and install

Requires Node 20 or later.

```sh
npm ci --ignore-scripts      # install scripts are not needed to build
npm run test:unit            # 15 tests
npm run package              # verifies the pinned assets, then bundles into dist/
npx @vscode/vsce package     # produces a .vsix
code --install-extension vellum-markdown-editor-*.vsix
```

`npm run package` fails if Pele or Paged.js does not match its pinned SHA-256
(`scripts/verify-pins.mjs`).

After replacing an installed build, run **Developer: Reload Window** from the Command
Palette. To reinstall the same version, add `--force` to `code --install-extension`.

Vellum keeps upstream's command and setting identifiers (`markdown-live.*`, `markdownLive.*`),
so existing settings and keybindings carry over. For the same reason, **do not install it
alongside the upstream extension**: the two would register the same commands and editor.

## Use

Open a `.md` file, then any of:

1. `Ctrl + Alt + Shift + M` (`Cmd + Ctrl + Shift + M` on macOS).
2. Right-click the file in the Explorer and choose **Open in Markdown Live Editor**.
3. Click the pencil icon at the top right of the text editor.

For a quick smoke check, use a disposable folder with two Markdown notes. Include YAML
front matter, formatted text, a task list, a table, inline maths and a fenced `mermaid`
flowchart. Confirm that content loads on opening; edit and save, then inspect the file on
disk. Toggle source mode, open **Markdown Live: Focus on Notes View**, and paste an image
to check that it is written under `assets/images` and displayed. Click **Export PDF** to
generate `.vscode/print-preview.html`, open it in your browser and use **Ctrl+P** (macOS:
**Cmd+P**) to print or save as PDF. The preview file remains on disk.

| Command | macOS | Windows and Linux |
|---|---|---|
| Open live editor | `Cmd + Ctrl + Shift + M` | `Ctrl + Alt + Shift + M` |
| Send to AI context | `Cmd + Shift + L` | `Ctrl + Shift + L` |
| Insert link | `Cmd + K` | `Ctrl + K` |
| Insert table | `Cmd + Option + T` | `Ctrl + Shift + T` |
| Insert code block | `Cmd + Option + C` | `Ctrl + Shift + C` |
| Bold | `Cmd + Option + B` | `Ctrl + Shift + B` |
| Italic | `Cmd + I` | `Ctrl + I` |
| Heading 1 to 6 | `Cmd + Option + 1-6` | `Ctrl + Shift + 1-6` |

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `markdownLive.language` | `en` | Interface language (`en` or `vi`) |
| `markdownLive.fontFamily` | `sans-serif` | `sans-serif` or `serif`; local fonts only |
| `markdownLive.tableDisplayMode` | `scroll` | `scroll` or `wrap` for wide tables |
| `markdownLive.enableSlashCommand` | `true` | The `/` menu |
| `markdownLive.defaultNoteDirectory` | empty | Where new notes are created |
| `markdownLive.sidebarScanDirectory` | empty | Folder the sidebar lists |
| `markdownLive.templateFolder` | empty | Folder of note templates |
| `markdownLive.imageDirectory` | `assets/images` | Where pasted images are saved |
| `markdownLive.imagePublicPath` | empty | Prefix for image paths that start with `/` |
| `markdownLive.printHeaderFormat` | `{title}` | PDF header; accepts front-matter variables |
| `markdownLive.printFooterFormat` | `{signature}` | PDF footer |
| `markdownLive.printPageNumberFormat` | `{page}` | PDF page numbering |
| `markdownLive.printFontFamily` | empty | Font for PDF export |
| `markdownLive.printAutoTOC` | `false` | Insert a contents page when exporting |

## Privacy

Vellum sends no telemetry and makes no network request of its own. A note that references an
image on a remote server will still load that image when opened, as Markdown images do.

## Attribution and licence

Vellum Markdown Editor is free software under the **GNU General Public License, version 3**
([LICENSE](LICENSE)). It comes with no warranty.

- It is a modified version of **Obsidian-style Markdown Live Editor** 0.1.4, © 2026 Thinh Vu
  ([thinh-vu/vscode-markdown-editor](https://github.com/thinh-vu/vscode-markdown-editor),
  commit `b90af69`), licensed GPL-3.0. Upstream's own README is kept as
  [README.upstream.md](README.upstream.md).
- Modifications © 2026 DreamLab AI Consulting Ltd, first made on 14 November 2026 and listed in
  [CHANGELOG.md](CHANGELOG.md) and [SECURITY-REVIEW.md](SECURITY-REVIEW.md).
- Third-party components and their licences are listed in [NOTICE.md](NOTICE.md).

Vellum is not affiliated with or endorsed by Thinh Vu, Vnstock, Obsidian or Dynalist Inc.
"Obsidian" and "Mermaid" are names of their respective owners, used here only to describe
compatibility. Security fixes are offered back to upstream; please report problems with this
version in this repository, not upstream.
