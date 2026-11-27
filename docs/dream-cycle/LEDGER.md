| Date | Deep | Finding | Issue | PR | Evaluated? | Verdict | Effect | Witness | Prior-night fates | Reviewer | Review-minutes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-15 | link-graph | npm ci EALLOWREMOTE blocks vowl-wasm tarball; node_modules absent, checks fail | NONE | NONE | yes | INCONCLUSIVE |  | b8b0e2ba905f |  |  |  |
| 2026-11-16 | webview-editor | npm ci EALLOWREMOTE blocks vowl-wasm+ontomark tarballs (deps, not devDeps) | NONE | NONE | yes | INCONCLUSIVE |  | 13751806e2b4 |  |  |  |
| 2026-11-17 | security-boundary | EALLOWREMOTE night 3; package eval runs verify-pins needing both GitHub tarballs | NONE | NONE | yes | INCONCLUSIVE |  | 046412d474c7 |  |  |  |
| 2026-11-18 | ai-delivery | npm ci EALLOWREMOTE night 4; vowl-wasm+ontomark tarballs block all checks | NONE | NONE | yes | INCONCLUSIVE |  | be18e2a48088 |  |  |  |
| 2026-11-19 | notes-workspace | npm ci EALLOWREMOTE night 5; verify-pins protection bars repo-side dep removal | NONE | NONE | yes | INCONCLUSIVE |  | 8ac3bc647751 |  |  |  |
| 2026-11-19 | notes-workspace | File links from the [[ picker double-encoded %-encoded names; now fixed+tested | NONE | https://github.com/DreamLab-AI/vellum-markdown-editor/pull/2 | yes | ACCEPT |  | f5fc68e61925 |  |  |  |
| 2026-11-20 | link-graph | md links wrapping an image were invisible to the graph; now parsed, rename-safe | NONE | https://github.com/DreamLab-AI/vellum-markdown-editor/pull/4 | yes | ACCEPT |  | b52675bc0c8a |  |  |  |
| 2026-11-21 | webview-editor | Pasted images vanished when doc shrank before insertImage; pastePos now clamped | NONE | https://github.com/DreamLab-AI/vellum-markdown-editor/pull/5 | yes | ACCEPT |  | dae084e4ff1d |  |  |  |
| 2026-11-22 | security-boundary | renameImage: webview src could address files outside the workspace; now refused | NONE | https://github.com/DreamLab-AI/vellum-markdown-editor/pull/6 | yes | ACCEPT |  | ab9099028734 |  |  |  |
| 2026-11-23 | ai-delivery | AI link context now reports unresolved wikilinks left out past the 40-entry cap | NONE | https://github.com/DreamLab-AI/vellum-markdown-editor/pull/7 | yes | ACCEPT |  | 3ffcdfbab350 |  |  |  |
| 2026-11-24 | notes-workspace | VETOED: Note deletion missed image assets with spaces or %20 names; now… | NONE | VETOED | yes | REJECT |  | 2e5806a9a475 |  |  |  |
| 2026-11-25 | link-graph | vellum-graph ignored extra positional args; --depth/--max bounds now enforced | NONE | https://github.com/DreamLab-AI/vellum-markdown-editor/pull/10 | yes | ACCEPT |  | 1e7df0b9f770 |  |  |  |
| 2026-11-26 | webview-editor | webview-editor source absent (only lockfile/CHANGELOG shown); scans untestable | NONE | NONE | yes | INCONCLUSIVE |  | 8f3d86e88d46 |  |  |  |
| 2026-11-27 | security-boundary | Diff fallback: escape lang strings, check msg shape; no live injection existed | NONE | https://github.com/DreamLab-AI/vellum-markdown-editor/pull/11 | yes | ACCEPT |  | df8ed732357c |  |  |  |
