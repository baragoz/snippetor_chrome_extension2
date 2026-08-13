# Snippet schema

Reference for the shape of a "snippet" (and its notes) as stored by the
extension in `chrome.storage.sync` — not a design doc; see
`Readme.snippet-source.md` for the *why* behind `source`.

## Storage layout

| Key | Shape | Purpose |
|---|---|---|
| `snippets` | `Snippet[]` | Every snippet currently open in the extension. |
| `notes_<snippetId>` | `Note[]` | That snippet's notes, keyed by the snippet's **local** `id`. |
| `active_note_<snippetId>` | `number` | Index into `notes_<snippetId>` of the note last shown for this snippet (independent of any pinned tab — see `tabs_map`). |
| `active_snippet` | `number \| -1` | The snippet id "opened by default" on new pages; `-1` if none. |
| `active_tab_id` | `number` | The currently focused browser tab, used to resolve which `tabs_map` entry applies. |
| `tabs_map` | `TabsMapEntry[]` | Per-tab pin state — see below. |
| `version` | `string` | Storage schema marker (`"1.0"`), set once on install. Not read/compared anywhere today — a hook for a future migration, not an active check. |

## `Snippet`

One entry in the `snippets` array.

| Field | Type | Set by | Notes |
|---|---|---|---|
| `id` | `number` (epoch ms) | `content_snippetor.js`'s `loadSnippet`, or `side_panel.js`'s `createNewSnippet` | Local, per-open-instance id. The join key for `notes_<id>`/`active_note_<id>`, and what `loadSnippet` resolves back to the website as `{ id }` so it has it immediately. Opening the same source snippet twice produces two different `id`s on purpose (`content_snippetor.js`'s own comment: "allow user to open the same snippet multiple times"). Distinct from `source.snippetUID` (below) -- `id` only needs to be unique among this extension's own open snippets; `snippetUID` is the *source* snippet's own id, and is what a save/update actually resolves against. |
| `title` | `string` | `Snippet ${id}` at creation; verbatim from the website payload when loaded | Editable afterward (title-blur handler in `side_panel.js`). |
| `activeNote` | `number` | `-1` at creation or load | **Dead field** — stored but never read. Actual "which note is showing" state lives in `active_note_<id>` / `tabs_map[].activeNote` instead. |
| `source` | `object` — see below | `createNewSnippet` or `loadSnippet` | Set once; only `source.isModified` ever changes after that. |

There is no separate `backId`/`state` field. An earlier iteration had both:
`backId` duplicated what `id` already provided (a fresh, extension-assigned
id unique among open snippets), and `state` (`"new"`/`"play"`) was written
but never read anywhere -- `source.type`/`source.isModified` already say
everything `state` was trying to.

### `Snippet.source`

| Field | Type | Values | Notes |
|---|---|---|---|
| `type` | `string` | `"new"` \| `"space"` | `"new"`: created directly in the extension, no origin. Everything loaded via `loadSnippet` is `"space"` — `"draft"` is a *value of* `space`, not a second `type`. |
| `space` | `string` | `""` \| `"draft"` \| `"<real space name>"` | `""` only for `type: "new"`. `"draft"` is a sentinel for the website's local IndexedDB drafts store; anything else is a real backend space's name. |
| `version` | `number` | `0` or the backend node's version | Only meaningful when `space` is a real space — the backend's `nodes.version`/`snippets.version` at load time. `0` for `"new"` and for drafts (single-user local storage, no concurrent writer, so nothing to version). Captured but not yet checked against anything — see `Readme.snippet-source.md` §4. |
| `snippetUID` | `string` | `""` or the original id | The draft/space snippet's own id at its source. Always paired with `space` — never resolve one without the other, since `snippetUID` alone doesn't say which table it belongs to. |
| `isModified` | `boolean` | — | `true` at creation for `type: "new"` (nothing saved yet, always needs saving). `false` right after a `loadSnippet` (matches the source). Flipped to `true` in place by `background.js`'s `markSnippetModified()`, called from the `saveNote`/`updateNote`/`removeNote` handlers the first time notes change after loading — an explicit flag, not derived from a note-count comparison. |

### Example — a `"new"` snippet

```json
{
  "id": 1755000000000,
  "title": "Snippet 1755000000000",
  "activeNote": -1,
  "source": { "type": "new", "space": "", "version": 0, "snippetUID": "", "isModified": true }
}
```

### Example — loaded from a space, not yet edited (`space-saved`)

```json
{
  "id": 1755000012345,
  "title": "Auth middleware notes",
  "activeNote": -1,
  "source": {
    "type": "space",
    "space": "Platform",
    "version": 4,
    "snippetUID": "1754999000000xyz789",
    "isModified": false
  }
}
```

Edit a note and `source.isModified` flips to `true` in place (`space-modified`);
loading from a draft instead of a space only changes `source.space` to
`"draft"` (`draft-saved` / `draft-modified`). See the 5-state icon set in
`Readme.snippet-source.md`.

## `Note`

One entry in `notes_<snippetId>`.

| Field | Type | Set by | Notes |
|---|---|---|---|
| `id` | `number` (epoch ms) | `background.js`'s `SnBackground.saveNote` handler | `-1` as a placeholder in `content.js` until the save round-trip assigns the real value. |
| `url` | `string` | `content.js`, `window.location.href` at save time | Used to re-locate the note's code line on later page loads (`getCodeLineByUrl`) and to route `chrome.storage.onChanged`/tab notifications to the right open tabs (`sanitizeUrl`-matched). |
| `text` | `string` | `content.js`, the editor textarea, trimmed | The note's actual comment content. |
| `defaultBranch` | `string` | `content.js`'s `getDefaultBranchAndBlob` (GitHub or Chromium Code Search parser) | |
| `currentBranch` | `string` | same | Falls back to the default branch unless the page is pinned to a specific commit (`oid`). |
| `blob` | `string` | same | Commit/tree sha the note was taken against. |
| `hasNext` / `hasPrev` | `boolean` | `background.js`, computed on every add/update/remove | Whether prev/next note navigation should be enabled — recomputed relative to the note's position among its siblings, not stored as page state. |

**Dropped before persisting**: `content.js`'s in-memory note object (used
while the editor is open, before `SnBackground.saveNote`/`updateNote` is
called) also carries `git`, `project`, `path`, and `line` — parser output
used only to build/verify the on-page association while editing. None of
the three note-mutation messages (`SnBackground.saveNote`/`updateNote`/the
`note` object built in `content.js`'s `onSave`) include them, so they never
reach `chrome.storage.sync`; `url` alone is enough to relocate a note later.

**Transient, not persisted**: `background.js`'s `getNotesForUrl` handler
stamps a `sid` (source/snippet id) onto each note in its filtered response
for the caller's convenience — that's added to the response payload, not
written back to `notes_<id>` in storage.

## `TabsMapEntry`

One entry in `tabs_map`.

| Field | Type | Notes |
|---|---|---|
| `snippetId` | `number` | The snippet pinned to this tab. |
| `tabId` | `number` | Chrome tab id. |
| `state` | `string` | `"pinned"` \| `"default"` — whether this tab shows a specific snippet regardless of `active_snippet`. |
| `activeNote` | `number` | Index into that snippet's notes, independent of `active_note_<snippetId>` (lets different pinned tabs sit on different notes of the same snippet). |
| `refs` | `string` | Optional, `"fixed"` by default — reference-resolution mode when the tab navigates. |
