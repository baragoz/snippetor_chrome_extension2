# Snippetor Chrome Extension

Snippetor lets you attach your own comments to any line of code in an open-source project on GitHub or Chromium Code Search. Comments are joined together into a sequence — a **snippet** — that you can share with colleagues or the open-source community.

## Features

The extension's side panel has three tabs:

### Home

- Navigate to the Snippetor website to search snippets created by others.
- Create a new snippet.
- Switch to a different snippet, making it the active one.

### Active

Shows the snippet that is currently active. The active snippet is opened by default on new pages, so any comments you add are appended to it.

### Pinned

Lets you pin a snippet to a specific Chrome tab. A pinned snippet stays tied to that tab, so you don't have to manually switch the active snippet when moving between tabs.

## API

### 1. Snippetor website ↔ `content_snippetor.js`

`content_snippetor.js` is injected into the Snippetor website (matches in `manifest.json`, currently `http://127.0.0.1:8788/*` and `https://snipettor.firebaseapp.com/*`, `run_at: document_start`). The page and the content script talk over `window.postMessage` only — the page never touches `chrome.*` APIs directly.

- **Request** — page → content script: `{ action: "snippetAPI.<name>", id, ...params }`, id is a random string generated per call.
- **Response** — content script → page: `{ action: "snippetAPI.callback", id, result }`, matched back to the caller by `id`.
- **Live updates** — page → content script: `{ action: "snippetAPI.onUpdate", id }` once, to subscribe. From then on, every `chrome.storage.onChanged` event is rebroadcast as `{ action: "snippetAPI.listener", result: { changes, namespace } }` (no `id`, fan-out to all subscribers).

| Action | Params | Result |
| --- | --- | --- |
| `snippetAPI.getSnippets` | — | `snippets` array from storage; each entry carries its own `source` object (`type`, `space`, `version`, `snippetUID`, `isModified` — used to derive Saved/Modified status, see `Readme.snippet-source.md`) |
| `snippetAPI.getNotesById` | `snippetId` | `notes_<snippetId>` array |
| `snippetAPI.updateNotes` | `snippetId`, `notes` | `true` |
| `snippetAPI.removeSnippet` | `snippetId` | `true`; also clears `notes_<id>`/`active_note_<id>` and unsets `active_snippet` if it pointed at this snippet |
| `snippetAPI.loadSnippet` | `snippet`, `notes`, `source` (`{ space, version?, snippetUID }`) | `{ backId }` — assigns the snippet a fresh local `id` and a freshly-minted `backId` (deliberately not the source's own id — see `Readme.snippet-source.md`), tags it with a `source` object built from the request, stores it + its notes, and asks the extension to pin it to the current tab |
| `snippetAPI.onUpdate` | — | `"subscribed"` once, then ongoing `snippetAPI.listener` broadcasts |

### 2. `content_snippetor.js` ↔ the extension itself

The injected script runs in an **isolated world**, so it has direct access to `chrome.storage.sync` (read/write, no messaging needed for that part) and to `chrome.runtime`:

- `chrome.storage.sync.get/set/remove` — backs every `snippetAPI.*` action above directly.
- `chrome.runtime.sendMessage({ action: "SnBackground.openAsPinnedSnippet", snippetId, activeNote, url })` — sent once after `snippetAPI.loadSnippet` finishes storing notes, so `background.js` pins the new snippet to the tab and opens its first note.

### 3. `content.js` (GitHub / Chromium Code Search note editor)

**a. Events it listens for on the web page**

- `dblclick` on each recognized code-line element — opens the note editor (or restores/creates a note) for that line.
- `DOMContentLoaded` — only if the document isn't already `complete`/`interactive` when the script runs, to do the first line-binding pass.
- `navigation` (Navigation API) `navigate` event — detects SPA route changes (both GitHub and Chromium Code Search re-render in place without a full reload) and debounces before re-binding lines and reloading notes for the new URL.

**b. Pattern lookup for attaching functionality**

`getContentParser(url)` picks a parser by hostname — `GitHubContentParser` for `github.com`, `GoogleCodeParser` for `source.chromium.org` — each implementing the same interface so `content.js` itself stays site-agnostic:

- `isBlobUrl(url)` / `isCodeResource(url)` — gate: only file-view ("blob") pages, and only non-media file extensions, get line listeners at all.
- `getCodeLines()` — CSS selector for the line-number elements to bind `dblclick` to (GitHub: `div.react-code-file-contents > div.react-line-numbers > div.react-line-number`; Chromium Code Search: `div.CodeMirror > .line-numbers > div.line-number > a`).
- `getDefaultBranchAndBlob(lineNumberElement)` — reads the surrounding page (GitHub's embedded React JSON, or the Code Search URL) to resolve `project`, `path`, `line`, `defaultBranch`, `currentBranch`, `blob`.
- `getCodeLineByUrl(url)` / `parseStartLineNumber(url)` — reverse lookup, used to re-find the line element for a note that's being restored.

If `getCodeLines()` comes back empty (page still rendering), `content.js` retries on a 300ms timer instead of giving up.

**c. Communication API between `content.js` and the extension**

Sends (`chrome.runtime.sendMessage`):

| Action | When |
| --- | --- |
| `SnBackground.saveNote` | New note created (`note`, `snippetId`, `isContentScript: true`) |
| `SnBackground.updateNote` | Existing note edited (`note`, `snippetId`, `isContentScript: true`) |
| `SnBackground.openSiblingNoteInCurrentTab` | Prev/Next clicked on a note (`goPrev`/`goNext`, `note`, `snippetId`) |
| `SnBackground.getNotesForUrl` | On load/route change, to fetch notes for the current URL (`url`) |

Receives (`chrome.runtime.onMessage`), broadcast from `background.js` to open tabs:

| Action | Effect |
| --- | --- |
| `onNoteAdd` | Renders a new note's circle/preview on its line |
| `onNoteSelect` | Shows the given note and hides other notes for that snippet (same-file case) |
| `onNoteUpdate` | Updates an existing note's content in place |
| `onNoteRemove` | Removes a note's circle/container from the page |
| `onSnippetRemove` | Removes every note belonging to a removed snippet |
