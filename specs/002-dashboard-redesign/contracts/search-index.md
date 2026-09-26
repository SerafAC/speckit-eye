# Contract: Search Index and Matching

`assets/search-index.json` is built by `src/render/search-index.js` from the model and published by `site.js` in both modes (FR-049c, research D14). It is fetched by `assets/search.js` on the first search, relative to `document.body.dataset.base`, and fetched again on the next search after a live `change` event.

## File format

```json
{
  "version": 1,
  "entries": [
    { "type": "task", "label": "T047", "detail": "Write unit tests for Signal Simulator …", "context": "001 · Serial Data Processing Studio", "state": "done", "url": "features/001-serial-data-studio/index.html#task-001-serial-data-studio-T047", "terms": "t047 write unit tests for signal simulator …" },
    { "type": "feature", "label": "001 · Serial Data Processing Studio", "detail": "Complete · 123/123", "url": "features/001-serial-data-studio/index.html", "terms": "001 serial data processing studio" },
    { "type": "document", "label": "Implementation Plan", "detail": "plan.md", "context": "001 · Serial Data Processing Studio", "url": "features/001-serial-data-studio/plan.html", "terms": "implementation plan plan.md" },
    { "type": "heading", "label": "Technical Context", "detail": "Implementation Plan", "context": "001 · Serial Data Processing Studio", "url": "features/001-serial-data-studio/plan.html#technical-context", "terms": "technical context" }
  ]
}
```

| Field | Rule |
|---|---|
| `type` | `task`, `feature`, `document` (every artifact, including the constitution and assessments), `heading` (every `##` and `###` heading of every document) |
| `label` | What the result shows first: task ID (`"No ID"` for tasks without one), `number · title`, document title, heading text |
| `detail` | Task text (as written), feature status and counts, file name, or the heading's document title |
| `context` | The feature (`number · title`), `Project`, or `Assessment: <slug>`; omitted for features |
| `state` | Tasks only: `done`, `next`, `blocked`, `open` (for the state mark) |
| `url` | Page path without base; the client prefixes `base` |
| `terms` | Lower-cased `label + " " + detail` (tasks and headings), whitespace collapsed; the text that is searched |

Entries are in page order: features in folder order, each followed by its tasks in file order and its documents in 001 artifact order with their headings; then project documents.

## Matching

1. The query is lower-cased and split on whitespace into words; an empty query shows nothing.
2. An entry matches when **every** word occurs in its `terms` (substring match).
3. Ranking inside each group: (a) a task whose ID equals the query exactly (case-insensitive); (b) entries whose `label` starts with the first word; (c) the rest; ties keep page order.
4. Groups are shown in the order Tasks, Features, Documents (documents and headings together). Each group shows its first **8** results and "N more" when there are more; choosing "N more" shows the whole group.
5. No match in any group → "No results for "<query>"".

Body text of documents is not in the index (clarified scope).

## Opening a result

| Type | Opens |
|---|---|
| task | its feature page with the task selected, expanded and in view (FR-036); tasks without an ID open the feature page at their phase |
| feature | its feature page |
| document | the document page |
| heading | the document page at the heading's anchor |
