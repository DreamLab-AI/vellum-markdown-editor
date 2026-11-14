# Desktop feature check — 2026-11-14

## Environment and isolation

- Source: Vellum 0.4.0, built from this checkout.
- Host: desktop VS Code 1.106.3 (`bf9252a`), Linux x64.
- Node: 26.10.0; Chromium: 153 for the standalone print check.
- Interaction: Playwright and Chromium DevTools Protocol against the actual desktop
  VS Code window and its extension webviews, with filesystem and clipboard assertions.
- Workspace: disposable `/tmp/vellum-feature-check`, seeded from the same content as
  [demo](demo). No tests edited the user's notes.
- Profile: `/tmp/vellum-vscode-profile`; extensions: `/tmp/vellum-vscode-extensions`.
  The latter contained no installed extensions. VS Code's renderer log confirmed
  `/home/john/githubs/vellum-markdown-editor` as the development extension path;
  its web-worker extension log recorded one Vellum activation.
- The normal profile had Vellum 0.2.0 installed. It was excluded from the test window,
  as were Claude Code and other third-party extensions. The normal installation was
  not upgraded or removed.

The [walkthrough](WALKTHROUGH.md) contains the screenshots and repeatable user steps.
Screenshots 01–07 are VS Code captures; screenshot 08 is the exported HTML rendered
in headless Chromium. They show successive states of the disposable notebook.

## Results

| Flow | Evidence | Result |
|---|---|---|
| Activation without duplicate registration | Development extension path and one activation in VS Code logs | Pass |
| Live rendering | Heading, bold text, three tasks, table, Pele flowchart, KaTeX expression visible | Pass |
| Source edit → live view → save | Added sentence appeared in both rendered content and disk file | Pass |
| Live edit → save | Added sentence persisted in Markdown on disk | Pass |
| Follow missing wikilink | Clicking `Next steps` created and opened `Next steps.md` | Pass |
| Backlinks | Two linked mentions and one unlinked mention for `Project.md` | Pass |
| Link This Mention | Count changed to three linked/zero unlinked; `[[Project]]` persisted in `Review.md` | Pass |
| Explorer file rename | `Project.md` → `Roadmap.md`; two wikilinks and one Markdown link rewritten, then saved | Pass |
| New Note from Template | Chose `Meeting.md`; `Weekly review.md` contained Agenda, Actions, and a task | Pass |
| Slash menu | `/` in an empty paragraph showed the block choices | Pass (menu only) |
| Image save and insert | Injected `ClipboardEvent` with a PNG File; file saved under `assets/images`, relative link persisted, rendered image loaded at 128 px | Pass (webview pipeline) |
| Copy selection reference | Selected opening rendered paragraph; clipboard read back `@Roadmap.md#7` | Pass |
| Reveal selection | Actual text editor opened beside Vellum with line 7 selected | Pass |
| Copy link context | Clipboard contained note, incoming `@Review.md#3/#5/#7`, and two outgoing note references | Pass |
| Outside file change | New text appeared, selection remained, zero dirty tabs, SHA-256 unchanged after reload | Pass |
| Print export | Toolbar generated `.vscode/print-preview.html`; Paged.js produced one page, zero page errors; PDF metadata confirmed A4 | Pass with contrast issue |
| Original branding | New folded-vellum V icon replaces upstream PNG; checked at 256 px and 32 px | Pass |

## Limitations and follow-up

- **PDF contrast:** the dark theme's pale text remains pale on the white printed page;
  the diagram retains dark boxes. The captured preview records the issue. Pagination
  and PDF generation pass; visual print quality needs work.
- **System image clipboard:** an attempted Wayland clipboard image transfer pasted
  the previous text payload into this X11/Electron session. The image handler was
  then verified with an injected image clipboard event. Native image paste and drag
  and drop are not claimed as verified here.
- **Find:** a search for `Roadmap` while inspecting source mode returned “No results”.
  Live-mode find/replace was not established by this run; do not infer coverage from
  the toolbar's presence.
- **Not exercised:** actual Claude Code, Antigravity or built-in chat delivery;
  folder moves, rename undo, duplicate-note resolution in the UI; native text-editor
  wikilink completion; table mutation/context menu; slash-menu insertion; image rename;
  annotations; outline navigation; settings variants; multi-page PDF/TOC; Windows/macOS.
- After reopening the Notes webview it sometimes remained on “Loading notes…”.
  Clicking the view’s **Refresh Notes** button populated it.
- The new-notes sidebar lists template files as notes when it scans the whole workspace.
  Set `markdownLive.sidebarScanDirectory` to a notes folder if that is undesirable.

## Build and automated checks

All **51 unit tests passed**, including diagram rendering, link parsing/resolution,
rename edit planning, selection reference mapping, and security helpers.
Both pinned vendor hashes passed: Pele 1.12.0 and Paged.js 0.4.3. Extension and webview
bundles built successfully. Final VSIX packaging also passed (13 files, 1.93 MB),
with the new 256 px icon included and documentation masters excluded. Packaging used
`pnpm --package npm --package @vscode/vsce dlx -c 'vsce package --no-dependencies --out /tmp/vellum-markdown-editor-0.4.0.vsix'`,
which supplies npm temporarily for the prepublish build. Since `npm` was absent from
the original shell, the initial build and unit-test run used the
commands behind the package scripts directly:

```sh
node_modules/.bin/esbuild test/unit/*.test.ts --bundle --platform=node --format=esm \
  --alias:vscode=./test/stubs/vscode.ts --outdir=.test-out --out-extension:.js=.mjs
node --test .test-out/*.mjs
node scripts/verify-pins.mjs --copy
node_modules/.bin/esbuild ./webview/main.ts --bundle --outfile=dist/webview.js \
  --platform=browser --minify --loader:.woff2=dataurl --loader:.woff=dataurl --loader:.ttf=dataurl
node_modules/.bin/esbuild ./src/extension.ts --bundle --outfile=dist/extension.js \
  --external:vscode --format=cjs --platform=browser
```

The placeholder `src/test/extension.test.ts` suite was not used as evidence for these
flows. Stand-in API unit tests and the actual desktop checks are distinct coverage.
