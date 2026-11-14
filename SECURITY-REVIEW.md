# Security review

Reviewed 2026-11-14 at upstream commit `b90af69` (thinh-vu/vscode-markdown-editor, v0.1.4).
All 44 tracked files were read. This records what was found, what Vellum changed, and what
remains.

## What the extension can do

- It runs as a **web extension** (`"browser": "./dist/extension.js"`), so it has no Node APIs:
  no process spawning, no raw filesystem, no sockets. It works through the `vscode` API only.
- No telemetry, analytics or update pings were found. No obfuscated or minified source is
  committed. The lockfile resolves only from `registry.npmjs.org`.
- Install scripts exist only in `esbuild`, `fsevents` and `@playwright/browser-chromium`
  (development tooling). The audit and builds here ran with `--ignore-scripts`.
- It reads every `*.md` file in the workspace to build the sidebar, writes pasted images under
  the configured image directory, renames images, and offers to move a deleted note's images to
  the trash (after a pick list; nothing is deleted without a choice).

## Findings and what changed

| # | Severity | Finding in upstream | This fork |
|---|---|---|---|
| 1 | High | The sidebar webview had **no Content-Security-Policy** and built its HTML from workspace files. A bookmark's `fileUri` from `.tmp/bookmarks.json` was written unescaped into an inline `onclick`. A cloned repository could ship that file and run script in the sidebar, which holds the title and opening text of every note and could send them anywhere. | Strict CSP with a per-load nonce; no inline handlers (one delegated listener); every interpolated value escaped; `openFile` accepts only Markdown files inside the workspace. |
| 2 | High | "Export PDF" wrote the whole note to a `file://` page that loaded **Paged.js from unpkg, unpinned, with no integrity check**. Whoever controls that URL runs script in a local page holding the document. | Paged.js 0.4.3 is a pinned dependency, verified by SHA-256 at build time, bundled into `dist/` and inlined into the preview. No network request. |
| 3 | Medium | The editor webview allowed `'unsafe-eval'` and loaded Google Fonts on every open (a third-party request per note). | `'unsafe-eval'` removed (the bundle contains no `eval` or `new Function` once Mermaid is gone; checked in a browser under the new policy). Remote fonts removed; the font stack falls back to local fonts. |
| 4 | Medium | Mermaid 10 **and** 11 were both bundled, bringing DOMPurify with a critical advisory, and `prosemirror-view` had a high-severity paste XSS. | Mermaid replaced by Pele (below), removing 153 packages. `prosemirror-view` raised to 1.42.9. Advisories: 28 → 19, none critical; of the 19, only KaTeX (low) ships in the extension. |
| 5 | Medium | Raw HTML in a note and rendered diagram SVG were assigned to `innerHTML`. Only the CSP stood between a hostile note and script execution. | Both are parsed inertly, scrubbed of scripts, frames, event handlers and `javascript:` links, and attached as nodes. |
| 6 | Low | A pasted image's file extension came from the webview unchecked and went into a file name. | Only known image extensions are accepted; anything else becomes `png`. |
| 7 | Low | Workspace settings were interpolated unescaped into the editor page's attributes. | Escaped. |
| 8 | Low | The Git-diff notice page had an inline handler and no CSP. | CSP with a nonce. |
| 9 | Bug | The export path read `provider.extensionUri`, which did not exist, so its stylesheet inlining always failed silently. | The provider exposes `extensionUri`. |

## What remains

- **Remote images still load.** `img-src` allows `https:`, so a note can reference an image on
  any server and that server sees the request when the note is opened. This is how Markdown
  images normally behave; it is a privacy consideration for untrusted notes.
- **Raw HTML is still rendered**, minus active content. Styling and layout markup in a hostile
  note can still imitate interface elements.
- **`style-src 'unsafe-inline'`** stays; the editor's own markup depends on it.
- **The preview file stays on disk** at `.vscode/print-preview.html` after an export.
- **Links open what they point at.** A relative link in a note can open a file outside the
  workspace when clicked.
- Upstream does not type-check (`tsc` reports errors that predate this fork); the build uses
  esbuild only. This fork reduced the count from 24 to 16 and added none.
- The initial security review used Chromium with a stand-in for the host. A subsequent
  smoke test exercised the installed extension in VS Code; see the follow-up below.

## Note graph (2026-11-14)

The note graph is a separate webview panel, opened by a command. Its page is built from one
template in `src/graph/graphPanel.ts` and loads one bundled script, `dist/graph.js`.

- **Policy:** `default-src 'none'; style-src 'nonce-…'; script-src 'nonce-…' 'wasm-unsafe-eval'`.
  One nonce per load covers the script and the style sheet. There is no `'unsafe-inline'`, no
  `img-src`, `connect-src`, `font-src` or `worker-src`, and `localResourceRoots` is `dist/` only.
  This is stricter than the editor's page, which keeps `style-src 'unsafe-inline'`.
- **`'wasm-unsafe-eval'` is new.** The layout is a WebAssembly module, and a page cannot compile
  one without it. It permits WebAssembly compilation only; `eval()` and `new Function()` stay
  blocked, and `'unsafe-eval'` is still not used anywhere. The module's bytes are inside
  `dist/graph.js`, so it is compiled from memory: nothing is fetched and no worker is started.
- **The module is pinned.** `@dreamlab-ai/vowl-wasm` 0.2.3 and `@dreamlab-ai/ontomark-graph`
  0.3.0 come from immutable GitHub release tarballs, with lockfile integrity at install and
  SHA-256 of the exact files (`vowl_wasm_bg.wasm`, `vowl_wasm.js`, the renderer and the layout
  driver) at build time in `scripts/verify-pins.mjs`. The module is Rust compiled by its own
  project's release workflow; this repository does not rebuild it, so its contents are trusted
  as released, as Pele's and Paged.js's are.
- **What the page can ask for:** three messages, validated in `src/graph/messages.ts` before
  anything acts on them. `ready` re-sends the graph. `bounds` changes depth and node limit
  within fixed ranges. `open` names a node by the opaque ID the extension sent and the
  generation of the graph it was in; the extension looks that ID up in the graph now on screen
  and opens the note it maps to. The page cannot name a path, a URI or a command, a link to a
  note that does not exist has no URI to open, and a request from a graph since replaced is
  dropped.
- **What the page is given:** note paths relative to the workspace folder, note names and link
  structure. No note text. Everything is drawn on a canvas or set as `textContent`; nothing
  from the workspace is parsed as HTML.
- **Checked:** unit tests cover the policy string, the message validation and the open rules
  with a stand-in for the VS Code API. The page was then run in Chrome under the real policy:
  the module compiled, the graph was arranged, dragged and searched, the browser reported no
  policy violation and the only resource loaded was the page's own script.
- **Not checked:** the panel in an installed VS Code or vscode.dev. VS Code injects its own
  bootstrap and theme variables into a webview, and those were stood in for here.

## VS Code follow-up (2026-11-14)

A packaged VSIX was installed in VS Code 1.106.3 on Linux. Testing exposed a duplicate
sidebar command registration that failed activation, and a document-loading race caused by
the fixed startup delay. The duplicate is removed; initial content is now sent after
Milkdown signals readiness, with empty-editor changes suppressed during initialisation.

Print-preview testing also found that the bundled Paged.js source was corrupted by
`String.replace` replacement-token expansion. A callback now inserts the source literally.
The exported HTML has all webview script elements removed, including the injected VS Code
API bootstrap, before the trusted bundled Paged.js script is added.

The VS Code checks covered editing and saving, source mode, diagrams, maths, tables, the
notes sidebar and image paste. The exported preview paginated without JavaScript errors
in headless Chromium and produced a one-page A4 PDF. Dark-theme print contrast still needs
work. These functional checks do not extend the security review to all commands, platforms
or remote workspaces.

## Diagrams: Mermaid syntax, rendered by Pele

Fenced `mermaid` blocks are now rendered by [Pele](https://github.com/obsidianmd/pele) 1.12.0
(MIT, no dependencies, synchronous, Mermaid 12.1 syntax). Documents are unchanged on disk.

- Pinned exactly; `scripts/verify-pins.mjs` checks `dist/pele.js` against a SHA-256 before every
  build. npm `pele` 1.0.0 is an unrelated package and is refused.
- `@milkdown/plugin-diagram` was replaced by a local port of its node (`webview/plugins/diagram.ts`),
  because that package imports Mermaid just to declare the node.
- Diagrams follow the VS Code theme through Pele's CSS variables.
- A syntax error shows Pele's line and caret snippet in place of the diagram.
- The webview bundle went from 7.75 MB to 2.26 MB.
- Layout is Pele's own and differs from Mermaid's. Mermaid themes, `%%{init}%%` directives and
  click handlers are not honoured.

## Checks

- `npm run test:unit`: 15 tests (escaping, image extensions, nonce, inline script, seven diagram
  types, a syntax error, hostile labels, the Markdown transform).
- `npm run verify-pins`: both vendored assets match their digests.
- Browser check of the built bundle under the shipped CSP: editor, two diagrams, a syntax error,
  a hostile label, maths, a table, a code block and a hostile raw-HTML block. No policy
  violations, no script errors, and none of the injected handlers ran.
