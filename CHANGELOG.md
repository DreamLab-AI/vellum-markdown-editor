# Changelog

All notable changes to Vellum Markdown Editor are documented here, followed by upstream history.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added
* **`vellum-graph`** (`npm run graph -- <command>`): the link graph from a terminal, for Claude Code, other agents and scripts that cannot query the running extension. Backlinks, outgoing links, unlinked mentions, unresolved links, link context, resolution, edges, orphans, and rename planning, with `--apply` to rewrite links and move a note or folder outside VS Code. It reuses the extension's parser and resolver through a new VS Code-free `Vault` (`src/links/vault.ts`). Not part of the VSIX.
* `AGENTS.md` (and a `CLAUDE.md` that imports it): a briefing for coding agents on the repository and on reaching Vellum's features.

### Documentation and branding
* Record the shared Ontomark graph architecture and implementation handoff, including optional Vellum navigation, Rust/WASM benchmark gates and typed-vault compatibility. No graph feature is implemented by this documentation change.
* Add Marketplace installation instructions and links to the public listing and GitHub release downloads. Publish 0.4.0 through Marketplace Trusted Publishing on 14 November 2026.
* Link the extension homepage to dreamlab-ai.com and document Microsoft's DNS verification process and six-month eligibility requirements.
* Add a screenshot of the installed 0.4.0 extension rendering a Mermaid class diagram with Pele in an existing Obsidian knowledge vault.
* Replace the inherited extension icon with an original folded-vellum V mark; add it to the README with DreamLab AI, CI, version, licence, VS Code, and GitHub badges.
* Add a screenshot walkthrough, disposable demo workspace, and desktop feature test report for 0.4.0.
* Confirm desktop editing/saving, backlinks and mention linking, missing-note creation, file-rename link updates, templates, selection reference/reveal, link context, and outside-edit reload behaviour in VS Code 1.106.3 on Linux. See `docs/TESTING.md` for evidence and remaining gaps.
* Confirm one-page A4 export without page errors; record the remaining dark-theme print contrast issue and the native clipboard limitation.

### Fixed
* Exclude local agent state and signing keys (`.agentic-qe/`) from Git and VSIX packages.
* CLI renames now reject moving a folder inside itself before rewriting links, refuse to overwrite dangling symlinks, and use the same normalised paths for planning and applying a rename. Add five CLI integration tests for queries, dry runs, successful moves, and rejected moves.
* Remove a duplicate `markdown-live.refreshSidebar` registration that prevented extension activation in VS Code.
* Wait for Milkdown to initialise before requesting document content, replacing the fixed 500 ms startup delay. Suppress edits from the empty initial editor so it cannot overwrite the document during startup.
* Remove both inline and external webview scripts from the standalone print preview before adding the bundled Paged.js script.
* Insert print-preview assets with a replacement callback so dollar-sign replacement tokens in JavaScript are preserved literally rather than expanded.

### Validation
* Installed the packaged VSIX in VS Code 1.106.3 on Linux; exercised editing and saving, source mode, diagrams, maths, tables, the notes sidebar, and image paste.
* Generated a one-page A4 PDF from the exported preview in headless Chromium, with no JavaScript errors. Print colours still need polish for dark editor themes.
* All 63 automated tests pass; both bundled asset digests verify and VSIX packaging succeeds.

## v0.4.0 — Claude Code compatibility (2026-11-14)

### Added
* **Send Selection to AI Assistant** now produces a file reference with a line range (`@path#18-19`) by mapping the rendered selection back to the Markdown source, and delivers it to Claude Code (`anthropic.claude-code`) when installed. Settings: `markdownLive.aiTarget`, `markdownLive.claudeDelivery`.
* **Reveal Selection in Text Editor** and **Copy @-Reference to Selection**.
* **Copy Note and Its Links as AI Context**: the note, its backlinks, its outgoing links and its missing links, as references.
* CI workflow, and a Marketplace publish workflow using Trusted Publishing (`PUBLISHING.md`).

### Fixed
* After any change to the file from outside the editor, the editor wrote the file back in its own formatting about 200 ms later, marking it modified. Outside changes are no longer echoed.
* An outside change reset the cursor and scroll position; both are now kept, and an identical update no longer rebuilds the view.

### Fixed after review
* The extension now activates for any workspace containing Markdown, so links are updated on rename, and `[[` completion and clickable wikilinks work in the text editor, without first opening a note in Vellum.
* The link to open Claude Code is built so that a prompt containing `&`, `+` or `%` arrives intact; prompts too long for a link stay on the clipboard.
* A renamed note with unsaved link edits is indexed from the open document, not the stale file.
* A wikilink with shown text inside a table is saved with its pipe escaped.
* Following a link creates the note only when the file is known to be missing.

### Not yet verified
* Delivery to Claude Code (the text editor opening beside, the @-mention command lookup, the `vscode://anthropic.claude-code/open` link) is built from Claude Code's documentation and has not been run against the extension. Selection mapping and reload behaviour were checked in a browser.

## v0.3.0 — links and backlinks (2026-11-14)

### Added
* **Wikilinks are real.** `[[Note]]`, `[[Note#Heading]]`, `[[Note|text]]` and `![[Note]]` are an editor node, saved byte for byte. Previously `[[` inserted a standard Markdown link, and hand-typed wikilinks were at risk of bracket escaping on save.
* **Backlinks panel** in the sidebar: linked mentions and unlinked mentions for the note in focus, with one-click linking of a mention.
* **Links follow renames.** Renaming or moving a note or folder rewrites the wikilinks and Markdown links that would break, in the same undo step. Setting: `markdownLive.updateLinksOnRename`.
* Clicking a link to a missing note creates it. Missing targets are shown dashed.
* Plain text editor: clickable wikilinks and `[[` completion.

### Changed
* The `[[` picker lists notes by their shortest unambiguous name and accepts a new name.

### Not yet verified
* Initially checked against a stand-in for the VS Code API. The Backlinks panel, mention linking, and file-rename handling have since been exercised in desktop VS Code; see [the test report](docs/TESTING.md). Native text-editor completion and links still need a UI check.

## v0.2.0 — Vellum Markdown Editor (2026-11-14)

First release of the modified version maintained by DreamLab AI, based on upstream v0.1.4 (`b90af69`). Renamed from *Obsidian-style Markdown Editor* (`vnstock.obsidian-markdown-live-editor`) to `dreamlab-ai.vellum-markdown-editor`; command and setting identifiers are unchanged.

### Security
* Sidebar webview: strict Content-Security-Policy with a nonce, no inline handlers, escaped values; fixes script injection through `.tmp/bookmarks.json`.
* PDF export no longer loads Paged.js from a CDN; a pinned, digest-verified copy is bundled and inlined.
* Editor webview: `'unsafe-eval'` and remote Google Fonts removed.
* Raw HTML blocks and diagram SVG are sanitised and attached as nodes, not assigned to `innerHTML`.
* Pasted image extensions are restricted to known image types.
* `prosemirror-view` raised to 1.42.9 (paste XSS).

### Changed
* Mermaid diagrams are rendered by Pele 1.12.0. Mermaid 10 and 11, DOMPurify and 150 other packages are gone; the webview bundle is 2.26 MB, down from 7.75 MB.
* Diagram syntax errors show the line and a caret snippet.

### Fixed
* PDF export could not inline its stylesheet (`extensionUri` was undefined).

See `SECURITY-REVIEW.md`.

## v0.1.4

### ✨ New Features
* **Default Editor Experience**: The Obsidian-style Live Editor is now set as the default editor for all `.md` files. When you click a file in the explorer, it opens directly in this rich WYSIWYG environment.
* **Smart Diff Fallback**: When viewing changes in the Source Control (Git diff) tab, VS Code will automatically fall back to its native text editor to preserve the code-level highlighting and comparison capabilities.

### 🐛 Bug Fixes
* **Link Serialization**: Fixed an issue where Milkdown would wrap links containing spaces in `<>` (angle brackets). The editor now automatically URL-encodes spaces (e.g. `%20`) to maintain strict CommonMark compliance without visually cluttering the markdown.
* **Internal Link Navigation**: Clicking on local file links or relative links within the live editor now correctly opens them inside VS Code (using the native editor or appropriate extension) instead of attempting to open them in a web browser context.

## v0.1.3

### ✨ New Features
* **Annotations System**: Select any text in the visual editor to reveal a floating "Add Annotation" tooltip. It allows you to attach personal notes/comments to text selections, which are saved to a workspace `.tmp/bookmarks.json` file.
* **Annotations Sidebar**: A new "Annotations" tab is now available in the Markdown Live Sidebar to view your selected texts along with their attached notes and quickly jump to them.
* **Open in Text Editor**: Added a new toolbar button (file icon) to quickly switch the current document to VS Code's default text editor.
* **Smart Relative Paths**: Pasted images now correctly calculate their relative paths based on the current markdown file's directory instead of assuming the workspace root.
* **Extension Categories**: Updated VS Code marketplace categories to include Formatters, Programming Languages, Machine Learning, Visualization, and Linters.

### 🐛 Bug Fixes
* **Auto-Formatting Improvements**: Refined the built-in Milkdown serializer to prevent aggressive and unnecessary backslash escaping for image and link syntax (`\![image]`), and removed forced `<>` wrappers around standard URLs.
* **Data Sync Race Condition**: Fixed a critical 2-way sync loop bug that caused dropped characters or cursor jumps when typing rapidly or when auto-save triggers.

## v0.1.2

### ✨ New Features

* **Table Display Options**: Added a new setting `markdownLive.tableDisplayMode` allowing you to toggle how tables are rendered in the live preview.
  * `scroll` (Default): Auto-sizes columns based on content and enables horizontal scrolling for wide tables. This prevents short words from being broken unnaturally.
  * `wrap`: Forces the table to fit the document width by aggressively wrapping text and URLs. Ideal for printing or narrow screens.

## v0.1.1

### 🐛 Bug Fixes

* **Table Display**: Added automatic word wrap for Markdown tables (`table-layout: fixed`, `word-wrap: break-word`) to prevent long text and URLs from breaking the document's width.

## v0.1.0

### 🐛 Bug Fixes

* **Image Display & Multi-root Workspaces**: Fixed critical path resolution issues that caused images to break or render incorrectly with double slashes (`//`). Enhanced support for multi-root workspaces to ensure images are saved and loaded from the correct active project folder.
* **Rename & Reveal Image Context Menu**: Fixed an issue where renaming or revealing an image from the webview context menu would fail with a "File to move/copy does not exist" error. The editor now correctly strips internal VS Code webview URIs to recover the absolute physical file path.
* **Echo Loop & Text Editor Interference**: Solved a critical bug where typing in the default VS Code text editor would trigger aggressive markdown formatting and backslash (`\`) injections from the Live Editor running in the background. The Live Editor now correctly respects `document.hasFocus()` before emitting edits.

## v0.0.9

### ✨ New Features

* **In-Editor Find & Replace**: Added a fully interactive, floating Find & Replace widget natively inside the WYSIWYG editor. Complete with Match Case, Next/Previous navigation, Replace/Replace All, and support for standard keyboard shortcuts (`Cmd + F` / `Ctrl + F`).
* **Git Diff Smart Fallback**: Solved a core limitation of VS Code Custom Editors. If you set Live Editor as your default Markdown viewer, clicking a file in the Source Control (Git Diff) panel will now show a smart fallback UI that seamlessly redirects you to the native VS Code split-screen text diff.

### 🐛 Bug Fixes

* **Toolbar Buttons**: Fixed missing event listeners for formatting buttons including Bold, Italic, Strikethrough, Quote, and Footnote.
* **Link & Image Insertion**: Fixed webview prompt blocks for links and images by migrating to native VS Code Input Box dialogs.
* **Task List Rendering**: Fixed a bug where task list items rendered as standard bullet points. Introduced interactive CSS-based checkboxes and a ProseMirror plugin for real-time toggling without `input` elements.
* **List Conversion**: Fixed a bug where switching between Bullet Lists and Ordered Lists from the toolbar would not correctly mutate the list type.
* **PDF Export Assets**: Fixed a critical issue where images and media were missing during Print to PDF by properly resolving the `<base>` href to absolute local file URIs.

## v0.0.8

### ✨ New Features

* **PDF Export & Pagination**: Export Markdown to beautifully styled PDFs powered by Paged.js, including automatic Table of Contents generation and print layout optimization.
* **Enhanced Image Management**: Added comprehensive image pasting support. You can now rename images directly from the context menu (smartly excluding file extensions during rename) and quickly reveal them in the Explorer.

## v0.0.7

### ✨ New Features

* **Workspace Sidebar Explorer**: Introduced a brand-new dedicated Sidebar panel specifically for managing your Markdown notes.
  * Displays a clean list of all Markdown files in your configured vault directory.
  * Extracted image thumbnails automatically displayed next to your note preview.
  * Organized neatly into two smart tabs: **Recent Files** (sorted by last modified) and **Vault Files** (alphabetical).
  * Auto-refreshes in real-time when files are added, modified, or deleted.
* **Streamlined Note Creation**: Consolidated "New Note" and "New Note from Template" actions into a single intuitive `+` button in the Sidebar header. If you've configured a template directory in settings, clicking it opens a sleek quick-pick menu.
* **Configurable Vault Directories**: Choose exactly which folder the Sidebar scans via the `markdownLive.sidebarScanDirectory` setting to eliminate noise from `node_modules` or other irrelevant folders.
* **Path Handling & Branding**: Added a custom extension icon and improved file path handling by migrating to workspace-relative paths and robust URI serialization.

### 🐛 Bug Fixes

* **UI Layout Stability**: Fixed a critical bug where raw HTML inside Markdown documents would break the Sidebar's DOM layout and create an unintended "carousel" effect.
* **Broken Images**: Sidebar thumbnails now automatically detect broken or micro-tracking-pixel images and gracefully hide them to maintain visual cleanliness.

## v0.0.6

### ✨ New Features

* **AI Agent Context Integration**: Added seamless integration with Antigravity AI Agent / VS Code Chat. Highlight any text in the live editor and right-click to choose **"Send to AI Context"** or use the shortcut `Cmd + Shift + L` (`Ctrl + Shift + L` on Windows/Linux) to attach the exact selection as a rich file context tag without cluttering your workspace with temporary files.

### 🐛 Bug Fixes

* **Context Menu Styling & Contrast**: Fixed contrast and text visibility for the custom right-click context menu across light and dark VS Code themes.

## v0.0.5

### 🐛 Bug Fixes

* **Properties (YAML Frontmatter)**: Fixed a critical bug where the YAML frontmatter was being automatically deleted when typing in the WYSIWYG editor. Properties now display correctly in the metadata UI and synchronize perfectly without duplicating inside the editor.

## v0.0.4

This release brings a massive architectural overhaul and introduces a suite of premium features designed to make writing in VS Code a truly frictionless, Obsidian-like experience.

### ✨ Highlights & New Features

* **Modular Architecture**: Completely refactored webview communication and editor orchestration, deeply integrating Milkdown (WYSIWYG) and CodeMirror 6 (Source Mode) into robust, performant modules.
* **Smart Asset & Media Management**:
  * **Auto-Cleanup**: Intelligently detects when a markdown file is deleted and prompts to clean up orphaned image assets to prevent system junk.
  * **Image Renaming**: Added the ability to rename local image assets directly from the editor's right-click context menu.
  * **Path Prefixing**: Added support for configurable public path prefixes, enabling seamless compatibility with frameworks like Next.js and Vite.
* **Dynamic Template System**: Introduced local Markdown template insertion, accessible via a filtering Slash command menu (`/`) or direct VS Code keyboard shortcuts.
* **Rich Markdown Extensions**:
  * Added native **LaTeX math** support for rendering formulas.
  * Added beautiful, GitHub-flavored **Admonition styling** (Notes, Warnings, Tips, etc.).
  * Added real-time **Hashtag highlighting** (`#tag`) synced across both editors.
  * Introduced a dynamic **Document Outline** (Table of Contents) and **Metadata UI** embedded directly within the editor.
* **Refined Typography & UI**:
  * **Dynamic Fonts**: Switch between modern sans-serif and immersive serif fonts in settings, with the Live Editor refreshing instantly without reloading.
  * **Polished Toolbar**: Overhauled the interactive toolbar, adding an organized history dropdown.
  * **Premium Icons**: Replaced plain text with crisp, modern SVG icons in the quick-insert Slash menu.
  * Re-ordered User Settings to improve logical configuration flow.

### 🐛 Bug Fixes

* **Interactive HTML**: Fixed native HTML `<details>` and `<summary>` (collapsible) tags so they can be toggled smoothly directly inside the WYSIWYG editor.
* **Infinite Dirty-Dot Loop**: Resolved an issue where the file tab would constantly show an unsaved indicator due to `CRLF` / `LF` line-ending mismatches during Auto-Save.
* **Live Editor Sync**: Fixed a critical regression where text changes made inside the Live Editor were failing to emit edit events back to the VS Code document.

### 🛠 Chore & Miscellaneous

* Added **Internationalization (i18n)** support for the extension UI.
* Configured full project linting, formatting, and unit testing infrastructure.
* Updated project license to **GPL-3.0**.
* Improved the repository's `README.md` layout, adding categorized features and collapsible screenshot previews.

## v0.0.2

### Added

* Initial project setup with Milkdown editor.
* Basic bi-directional synchronization between extension host and webview.
* VS Code `markdownLive.language` configuration for i18n support.
* Configurable image public path via `markdownLive.imagePublicPath`.
