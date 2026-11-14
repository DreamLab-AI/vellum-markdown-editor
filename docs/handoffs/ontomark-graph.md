# Handoff: shared graph components for Vellum and Ontomark

Date: 14 November 2026. Status: first slice implemented the same day; see the status
table. Decision: [ADR-VEL-001](../adr/ADR-VEL-001-shared-graph-and-rust-wasm.md).

## Status, 14 November 2026 (after implementation)

The first slice is built. Read this table first; the sections below are the original
handoff, kept for the reasoning and for the work that remains. Where the two disagree,
this table and the [ADR amendment](../adr/ADR-VEL-001-shared-graph-and-rust-wasm.md#amendment-14-november-2026)
are current.

| Step | State | What exists | What remains |
|---|---|---|---|
| 1. Fixtures and baseline | Not done, and re-scoped | Nothing | The premise changed: there was no JavaScript layout to measure against. The 100, 1,000 and 10,000-node programme now gates moving the layout to a worker or a slimmer engine, for Obsidian's whole-vault view and the publisher. It does not gate Vellum's bounded view. |
| 2. Renderer usable by both hosts | Done | `@dreamlab-ai/ontomark-graph` 0.3.0: host `ariaLabel`, `preservePositions` on `setGraph`, explicit node `shape`, and the `/layout` driver with a `vowlEngine` adapter. 29 tests. Defaults unchanged for existing consumers. | Browser tests of the mounted renderer in Ontomark's own harness were not rerun. The publisher's suite was not run against 0.3.0; the publisher has not moved its pin. |
| 3. Bounded Vellum graph | Built, not accepted | `src/links/graph.ts` (pure), `src/graph/` (panel and message validation), `webview/graph/main.ts`, command `markdown-live.showGraph`, setting `markdownLive.graph.depth`, CLI `neighbours`. 79 unit tests. Page run in Chrome under its real policy. | The "Done when" below asks for acceptance in real VS Code. None of it has been run: see [TESTING.md](../TESTING.md#note-graph--2026-11-14). Not in a Marketplace release. |
| 4. Rust computation behind the shared API | Done differently | No new crate. The driver uses `vowl-wasm`'s existing simulation, on the main thread in slices. `NggExplorer.loadArrays` is added to `vowl-wasm` `main`, unreleased; the driver uses it when present and the module's NGG1 encoder otherwise. | Release `vowl-wasm` with `loadArrays` when convenient (its release workflow publishes to npm). Extract a layout-only crate if a consumer needs the size back. A worker, only if step 1's measurements call for one. |
| 5. Typed-vault editing compatibility | Not started | The rename gap for front matter references is confirmed and unchanged. | All of it. Vellum must not claim to edit Ontomark vaults safely until this is done. |

Ontomark Obsidian's state is recorded in that repository.

Decisions the implementation took that this handoff left open:

- **Bounds.** One link away by default, up to three. 150 notes by default, doubling on request
  to 1,000. Nearer notes are kept first, existing notes before missing ones, then by path.
- **Missing notes** are nodes of their own kind (a diamond, a neutral colour, an ID no path
  can have) and cannot be opened from the graph.
- **IDs.** A graph belongs to one workspace folder. The webview is sent each note's path
  relative to that folder as its ID and sends an ID back; the extension maps it through the
  graph currently on screen. Two folders cannot collide because one graph never spans two.
- **Leaving the workspace.** A note outside every workspace folder, or not in the index,
  replaces the graph with a sentence saying why. A tab that is not a note changes nothing.
- **Worker failure** became module failure: the graph is drawn unarranged and says so.

## Outcome

Give Vellum an optional graph of the current note's neighbourhood using the same
renderer as Ontomark Obsidian and the web publisher. Establish a portable
Rust/WASM computation core only where end-to-end measurements justify adopting
it. Make the two editors safe to use on the same typed Markdown vault before
claiming ontology-editing compatibility.

This handoff authorises neither a Marketplace release nor changes to another
consumer's deployed pin. The implementation task should specify its release
scope. Work can span the repositories below; each owns its own changes.

## Repositories and starting points

| Repository | Work owned there |
|---|---|
| [Vellum](https://github.com/DreamLab-AI/vellum-markdown-editor) | Pure navigation-graph projection, VS Code webview adapter, optional command, editor integration and preservation tests. Start at `src/links/linkIndex.ts`, `parser.ts`, `resolver.ts`, `vault.ts`, `src/editorProvider.ts`, `webview/ui/metadata.ts` and `webview/ui/events.ts`. |
| [Ontomark](https://github.com/DreamLab-AI/ontomark) | `packages/graph` API and renderer, benchmark fixtures, candidate Rust core and WASM bindings. Consult `crates/ontomark-parse`, `ontomark-model`, `ontomark-ngg1`, `ontomark-wasm` and ADR-OM-002 before adding equivalents. |
| [Ontomark Obsidian](https://github.com/DreamLab-AI/ontomark-obsidian) | Verify `src/views/graph-view.ts`, worker lifecycle and reviewed edits against the shared changes. `src/api.ts`, `client.ts` and `protocol.ts` are useful host-independent boundaries; `src/main.ts` and the views contain Obsidian integration. |
| Existing web publisher | Run its graph acceptance suite when changing a shared release. Confirm its current repository and pin from Ontomark's consumer records; do not infer deployment ownership from an old checkout. |

Read each repository's instructions and current status before editing. The ADR
records the source revisions inspected, not required future branch tips. In the
review workspace, the `ontomark-obsidian` symlink was broken, so its source was
read from GitHub. Do not assume that path is a usable checkout. Keep any task
worktrees under `~/workspace/wt/` and remove them after integration.

## Sequence and completion criteria

### 1. Establish fixtures and baseline measurements

Owner: Ontomark, with a Vellum data adapter.

- Use deterministic fixtures at approximately 100, 1,000 and 10,000 nodes,
  covering chains, stars, disconnected components, dense clusters, duplicate
  labels and high-degree hubs. Include a bounded neighbourhood and a synthetic
  typed vault. Record edge counts, seed and fixture digests.
- Measure the released renderer and an optimised JavaScript baseline before
  selecting Rust work. Inspect repeated label ranking, pointer hit-testing,
  traversal and layout separately; the reviewed renderer has deterministic
  seeding, not a built-in force simulation. Identify any existing reusable
  layout implementation before creating another.
- Record machine, browser/host versions, commit and release hashes, cold/warm
  startup, bundle/WASM bytes, peak memory, p50/p95 computation time and p95
  input-to-present latency. Include transfer/deserialisation costs and updates
  while typing. Publish raw samples and reproducible commands with the report.
- Before measuring the candidate, commit the target workloads and adoption
  thresholds in the benchmark brief. Suggested starting thresholds are at
  least 20% lower p95 computation time on the chosen large workloads, no more
  than 10% p95 interaction regression on small workloads, and explicit startup
  and memory budgets. These are proposed targets, not measured results or
  current product promises; settle them before seeing the candidate results.

Done when another developer can reproduce the baseline and identify the work
worth moving. Stop the Rust port if the relevant cost is browser painting or
host messaging and there is no justified computation boundary.

### 2. Make the existing renderer usable by both hosts

Owner: Ontomark `packages/graph`.

- Retain `mountGraph`, `setGraph`, `setPositions`, selection callbacks and
  `destroy`. Prefer additive options with existing defaults over breaking the
  Obsidian and web consumers.
- Make the accessible graph description host-supplied: the current Canvas
  label says "Ontology graph", which is wrong for Vellum's note links. Supply
  VS Code theme colours through the existing options rather than requiring
  Obsidian CSS variables. Keep asserted/inferred styling available.
- Keep file access, network access, note resolution and host commands outside
  the package. Test cleanup, repeated mounting, keyboard navigation, dragging,
  invalid identities, absent endpoints and non-finite positions.

Done when existing consumer tests pass and a small browser fixture can display
both navigation and ontology data with correct labels and independent state.

### 3. Add the bounded Vellum graph

Owner: Vellum. Depends on steps 1 and 2; does not depend on the Rust port.

- Build the graph from the existing index; do not crawl or parse the workspace
  again. Keep projection logic pure and test it against `Vault`/CLI fixtures.
  Use opaque, workspace-scoped IDs so identical paths in different roots do
  not collide. Resolve a selected ID through the host's current mapping.
- Add an explicit command under the existing `markdown-live.*` namespace.
  Open a local neighbourhood first. Define and document node/edge bounds;
  report a truncated view and offer deliberate expansion. Do not silently
  omit unresolved notes or treat them as real target files.
- Bundle the pinned renderer locally in a separate graph webview. Validate
  message shape, allowed operations and node membership. Keep the VS Code
  API private; do not accept arbitrary URIs, HTML or commands from the view.
  Use the existing CSP/escaping conventions and minimal resource roots.
- Follow active-note changes and index updates, including unsaved document
  edits. Generation-tag updates and reject stale results. Dispose listeners,
  workers and animation state when the view closes. Define what happens when
  the active note leaves the workspace or is excluded.
- Double-click/keyboard activation opens the expected note in Vellum; it does
  not steal focus on every refresh. Test remote and virtual workspace URIs
  without assuming OS paths. Do not claim full vscode.dev support without an
  installed browser-host test; existing editor selectors also need checking.

Done when real VS Code acceptance covers open/focus/filter, node activation,
edit/rename/delete, two workspace roots, themes, keyboard use, close/reopen and
offline operation. Pure tests alone do not establish these behaviours.

### 4. Add portable Rust computation behind the shared API

Owner: Ontomark. Depends on the benchmark brief; can proceed alongside step 3.

- Choose a crate boundary from the measured workload. A provisional name is
  `ontomark-graph-core`; check existing crates and name availability first.
  Keep it independent of the DOM, Obsidian, VS Code and corpus policy. Reuse
  the existing model/codec where appropriate; do not require an ontology engine
  just to draw ordinary note links.
- Compile the same algorithms for native Rust and WASM. Use a thin binding
  compatible with the existing consumer toolchain. Start with single-threaded
  workers; do not require SharedArrayBuffer or cross-origin isolation.
- Keep graph state resident, batch requests and exchange position/index arrays
  rather than per-node JSON calls each frame. Specify ownership and lifetime
  of buffers: worker transfers and WASM memory growth can invalidate views.
  Do not claim zero-copy without measuring the actual transport.
- Cover deterministic seeds, ordering, disconnected graphs, empty graphs,
  overflow, non-finite values, cancellation and stale generations. Native and
  WASM outputs must agree, with declared tolerances for floating-point layout.
- Preserve the JavaScript baseline until adoption is decided. Worker failure
  must leave the editor usable and cannot display old results as current.
  Document the fallback/error behaviour. A GPU paint path is outside this ADR.

Done when the predeclared benchmark gate and cross-host correctness tests pass.
If they fail, record the result and retain the shared JavaScript implementation.
If a reusable crate is released, include full rustdoc, compiling examples,
README, licences and repository metadata; require `cargo doc --no-deps` without
warnings, native tests and WASM/browser tests. Publish immutable package/assets,
then update consumer pins and integrity checks in separate reviewable changes.

### 5. Establish typed-vault editing compatibility

Owners: Vellum and Ontomark; required before an ontology-enabled editing claim.

Start with `Animal.md`, `Dog.md` containing a `subclass-of` frontmatter link,
and `Rex.md` containing an `instance-of` link. Add explicit IRIs, aliases,
duplicate names, YAML comments, block scalars, lists, quoted values, LF/CRLF,
an `ontomark-sparql` block and unrelated fenced examples.

- Reproduce the current frontmatter rename gap, then define recognised typed
  reference locations and their resolver contract with Ontomark. Do not remove
  frontmatter/code masking globally. Keep ontology assertions separate from
  navigation edges even if both kinds of reference participate in rename.
- Test single-note and folder renames, ambiguity and collisions. Verify both
  source references and entity identity: an explicit IRI should not change
  merely because the filename changed; path-derived identities need an explicit
  engine policy. Do not use Vellum's closest-name choice to guess a semantic
  reference that Ontomark considers ambiguous.
- For `ontomark-sparql`, either reuse its parser-aware reference rewriting
  contract or explicitly leave this unsupported with a warning. Never rewrite
  arbitrary code or query string literals by regex. Track incomplete support
  in the compatibility matrix rather than claiming all-vault compatibility.
- Check that body edits preserve unrelated frontmatter exactly, and that a
  metadata edit changes only its intended span. Exercise external edits while
  Vellum is open and while a reviewed Ontomark patch is pending. Stale proposals
  must be refused; an asynchronous read followed by a blind write is not an
  atomic equivalent of Obsidian's `vault.process`.
- Keep new reference behaviour in shared pure logic and apply it consistently
  in the extension and `vellum-graph`. Test undo and file-event reindexing in
  both installed editors. Do not auto-apply model suggestions.

Done when the fixture matrix records supported and unsupported cases with
tests, and two editors can use the same vault without losing metadata or
silently breaking recognised references. The read-only graph may ship earlier.

## Evidence, release and scope

Keep benchmark receipts and acceptance reports under each owning repository's
docs. Record commits, commands, outcomes and untested cases. The initial review
ran the shared renderer's 12 existing Node tests successfully; it did not run
a VS Code graph, a WASM performance comparison or typed-vault interoperability.

For Vellum, run `npm run test:unit`, `npm run package` and VSIX packaging; inspect
the archive for intended assets only. New rendering/worker code needs real
browser and installed-VS Code evidence. Record any CSP changes explicitly;
never add broad `unsafe-eval` to make a worker load. Ontomark Obsidian changes
need its built-WASM, offline and installed-desktop gates, not just mocks.

Update the README and Unreleased changelog only for behaviour actually delivered.
Keep existing command/setting IDs and attribution. Vellum's known print contrast
and unverified Claude delivery remain separate work. Do not add SPARQL execution,
reasoning, model endpoints, automatic fact extraction, a mandatory server or a
replacement editor as part of this graph feature. A later optional Ontomark
companion needs its own scope and acceptance decision.

Suggested first implementation slice: steps 1–3 with a read-only graph and a
written compatibility matrix; evaluate step 4 independently and complete step 5
before advertising typed-vault editing support.
