# AGENTS.md

A briefing for coding agents (Claude Code and others) working in this repository or in a
notes folder edited with Vellum. `CLAUDE.md` imports this file.

Vellum is a VS Code **web extension**: a live WYSIWYG Markdown editor (Milkdown/ProseMirror,
with a CodeMirror source view), with Obsidian-style `[[wikilinks]]`, a Backlinks panel and link
updates on rename. It is a GPL-3.0 fork of thinh-vu's Markdown Live Editor. Command and setting
IDs keep upstream's `markdown-live.*` / `markdownLive.*` names on purpose.

## Using Vellum's features as an agent

Vellum and an agent are connected in two directions. Each one uses a different mechanism.

### Vellum → you (the user pushes context)

The extension cannot call you. A person triggers these, and the result arrives in your prompt:

- **`@path#18-19`** is a file reference with a 1-based line range, from *Send Selection to AI
  Assistant* (`Ctrl+Shift+L`) or *Copy @-Reference*. The rendered selection has been mapped
  back to Markdown source lines. Read those lines from the file. The rendered text can differ
  (wikilinks, tables, front matter). In rendered view, a selection inside one of two identical
  lines can map to the nearer one.
- With `markdownLive.claudeDelivery: selection`, the note opens in a text editor with the
  lines selected, and Claude Code attaches the file and selection itself.
- The **link-context block** (`Note: @x.md` / `Linked from (n):` / `Links to (n):` /
  `Links to notes that do not exist yet:`) comes from the Backlinks panel button. It lists
  references, not contents. Open the ones you need.

### You → the link graph (`vellum-graph`)

You cannot query the running extension. It runs in the web extension host with no server,
socket, MCP endpoint or index file. The Claude Code IDE bridge exposes diagnostics, not other
extensions' commands. Use the headless CLI instead. It reads the notes from disk and answers
with the extension's own parser and resolver (`src/links/*`):

```sh
npm run graph -- <command> [args] [--root DIR] [--json]
# without npm (it is not always installed here):
node_modules/.bin/esbuild src/cli/vellum-graph.ts --bundle --platform=node --format=esm \
  --outfile=out/vellum-graph.mjs --log-level=warning && node out/vellum-graph.mjs <command> ...
```

`--root` is the notes folder, treated as the workspace folder. It defaults to the current
directory. Within this repo, `--root docs/demo` is a small sample vault. Commands: `notes`,
`links`, `backlinks`, `mentions`, `unresolved`, `context`, `resolve`, `linktext`, `graph`,
`neighbours`, `orphans`, `rename`. `--help` lists them. With `--json`, lines are 1-based and columns 0-based.
Exit status: 1 means not found, 2 means usage error.

Use it at these points:

| When | Do |
|---|---|
| Before changing or deleting a note | `backlinks <note>` and `mentions <note>`: who depends on it |
| Gathering context on a topic | `context <note>`, then read the referenced notes |
| Writing a link | `linktext <note>` gives the exact `[[...]]` Vellum would write; `resolve <target> --from <note>` checks where a link lands |
| After writing or editing notes | `unresolved` finds links to notes that do not exist |
| Moving or renaming a note or folder | `rename <from> <to>` (dry run), then `--apply`. **Do not use `mv` or `git mv`**: VS Code updates links only for renames made in its own Explorer |
| Auditing a vault | `orphans`, `graph --json` |
| Seeing what the Note Graph panel shows for a note | `neighbours <note> [--depth N] [--max N]` |

`--apply` rewrites the links, then moves the files, and refuses to overwrite. It is not atomic,
so work on a clean git tree.

### Editing notes Vellum has open

- Write the file directly. Vellum reloads the view in place and keeps the user's cursor and
  scroll position. It does not re-save the file in its own formatting, so your next edit does not
  hit "file has changed".
- The CLI reads only what is on disk. Unsaved edits in an open editor are invisible to it.
- Link syntax: `[[Note]]`, `[[folder/Note]]`, `[[Note#Heading]]`, `[[Note|shown text]]` and
  `![[Note]]` (rendered as a link, not embedded). Inside a table, escape the pipe:
  `[[Note\|text]]`. Relative Markdown links to `.md` files count as links too. Links inside code
  and YAML front matter do not.
- Resolution follows Obsidian and ignores case. An **exact path from the root wins first**, then
  a path suffix. Among several matches, the source's own folder wins, then the shallowest path.
  So from `notes/a.md`, `[[Plan]]` means the root `Plan.md` when it exists, even if there is a
  `notes/Plan.md`. When names collide, prefer `linktext`'s qualified form.

## Repository map

| Path | What |
|---|---|
| `src/extension.ts` | Activation; registers the editor, the link system, the sidebar and commands |
| `src/editorProvider.ts`, `src/handlers/messageHandler.ts` | Custom editor; handles webview messages (save, images, links, AI, PDF export) |
| `src/links/` | `parser`, `resolver`, `wikilink`: **pure**. `linkIndex` (live index over `vscode`), `backlinksView`, `register` (rename edits, text-editor wikilinks). `vault`: pure in-memory index for the CLI |
| `src/links/graph.ts` | **Pure** bounded neighbourhood of a note; the Note Graph panel and the CLI's `neighbours` both use it |
| `src/graph/` | `graphPanel.ts` (the Note Graph webview panel: follows the note in focus, sends the graph, opens notes); `messages.ts` (**pure**: the message contract and its validation) |
| `webview/graph/main.ts` | The Note Graph page, bundled to `dist/graph.js` with Ontomark's renderer and layout driver and the vowl-wasm layout module |
| `src/cli/vellum-graph.ts` | The headless CLI (Node only, never bundled into the extension) |
| `src/ai/` | `reference.ts` (pure: `@path#a-b` mapping, link-context text, Claude URI); `assistant.ts` (delivery to Claude Code, Antigravity, chat or clipboard) |
| `src/security.ts` | Escaping and validation for anything crossing a trust boundary |
| `src/sidebarProvider.ts`, `noteManager.ts`, `template.ts`, `bookmarkManager.ts` | Notes sidebar, new notes and templates, annotations |
| `webview/` | Editor UI bundled to `dist/webview.js` (Milkdown, CodeMirror, plugins for wikilinks, diagrams, search, image paste) |
| `test/unit/*.test.ts`, `test/stubs/vscode.ts` | `node --test` suites. `vscode` is aliased to an in-memory stub |
| `scripts/verify-pins.mjs` | SHA-256 check of vendored Pele, Paged.js, the Ontomark graph package and the vowl-wasm module at build time; copies their notices to `dist/licenses/` |
| `docs/TESTING.md`, `docs/WALKTHROUGH.md`, `docs/demo/` | Desktop test report, screenshots, sample vault |
| `SECURITY-REVIEW.md`, `PUBLISHING.md`, `NOTICE.md` | Security posture, Marketplace release steps, attribution |

## Build and test

npm may be missing from the shell (pnpm and node are present). Each script's underlying command
is in `package.json`. Run it directly from `node_modules/.bin` if needed.

```sh
npm ci --ignore-scripts   # install scripts are not needed
npm run test:unit         # esbuild bundles test/unit/*.test.ts, then node --test (79 tests)
npm run package           # verify pins, bundle webview and extension into dist/
npx @vscode/vsce package  # .vsix
```

CI (`.github/workflows/ci.yml`) runs `test:unit`, `package` and `vsce package` on Node 22. It
does not run lint or `tsc`.

## Rules that keep it working

- **No Node APIs in the extension.** `src/` (except `src/cli/`) and `webview/` run in a browser
  context: no `fs`, `path`, `child_process` or sockets. Use `vscode.workspace.fs` and the
  `vscode` API.
- **Keep the pure modules pure** (`parser`, `resolver`, `wikilink`, `vault`, `links/graph`,
  `graph/messages`, `ai/reference`, `security`): no `vscode` or DOM imports. The CLI and the unit tests depend on that.
- **The CLI must give the same answers as the extension.** Put link behaviour in the pure modules,
  not in `linkIndex.ts`. `vault.ts` mirrors `LinkIndex`'s queries. The note pattern, excluded
  folders and 2 MB cap in `src/cli/vellum-graph.ts` mirror `linkIndex.ts`. Change both together.
- **Security posture** (see `SECURITY-REVIEW.md`): strict CSP with nonces, no inline handlers,
  escape everything interpolated from workspace files (`src/security.ts`), no `unsafe-eval`, no
  network requests or remote fonts. Vendored assets change only with new pinned digests. The
  Note Graph page alone allows `'wasm-unsafe-eval'`, for its layout module; do not add it to
  another page, and do not add a worker, `connect-src` or a fetched `.wasm`.
- **The Note Graph does not fork its renderer.** Drawing and layout driving live in Ontomark's
  `packages/graph`, which Ontomark Obsidian also consumes; the force layout lives in vowl-wasm.
  Change them there, release, and move the pin and digests here. A webview message names a node
  by the ID the extension sent, never a path or URI; keep new requests in `graph/messages.ts`.
- **Packaging:** `.vscodeignore` keeps sources, tests, docs and `out/` out of the VSIX. Check it
  when adding top-level files.
- **Do not rename** `markdown-live.*` commands or `markdownLive.*` settings.
- Record user-visible changes in `CHANGELOG.md` (under `Unreleased`) and in the README. The docs
  are plain and specific, and say what was not verified.
- Commit subjects are plain imperative sentences without prefixes (for example "Add wikilinks, a
  Backlinks panel and link updates on rename").

## Known state (2026-11-14)

- `tsc -p tsconfig.test.json --noEmit` reports one existing error: `enableFindWidget` in
  `src/editorProvider.ts` is passed in `WebviewOptions`. esbuild ignores types, so the build is
  unaffected.
- ESLint/Prettier formatting is not enforced. Older files fail it. Format only what you touch.
- `LinkIndex.backlinks()`, `outgoing()` and `unlinkedMentions()` resolve each link by scanning
  every note, which is slow on vaults of thousands of notes. The Note Graph uses
  `createResolver` (`src/links/resolver.ts`), which gives the same answers from an index.
  Moving the other queries to it is open work.
- The installed Note Graph was opened from the Command Palette beside a live note in desktop
  VS Code 1.106.3 on Linux: 118 notes, two missing targets and 400 links. Desktop interaction
  acceptance remains partial; vscode.dev is untested. Browser CSP and interaction checks use
  a stand-in for the VS Code API (`docs/TESTING.md`).
- Delivery to Claude Code has not been run against the real Claude extension. That covers the
  selection opened beside Vellum, the @-mention command lookup and the
  `vscode://anthropic.claude-code/open` link. `docs/TESTING.md` lists what was verified.
- `src/test/extension.test.ts` is an upstream placeholder, not evidence.
