# Using speckit-eye

speckit-eye shows the progress of a [GitHub Spec Kit](https://github.com/github/spec-kit)
project in your browser. It only reads your project: it never creates, changes,
or deletes a file in it. A static build writes only to the output folder you
name with `--out`.

For every option and exit code, see the CLI contract:
[contracts/cli.md](../specs/001-speckit-eye-dashboard/contracts/cli.md).

## Serve mode

Run this in any Spec Kit project folder (one that has a `specs/` or a
`.specify/` folder):

```sh
npx speckit-eye --serve .
```

or point it at another folder:

```sh
npx speckit-eye --serve path/to/project
```

The tool prints the address to open:

```text
speckit-eye 1.0.0 — serving /path/to/project
  Local: http://127.0.0.1:4747/
  Watching specs/ and .specify/ for changes (Ctrl+C to stop)
```

Open the `Local:` address in a browser. The server listens on your own
machine only (`127.0.0.1`). If port 4747 is already in use, another free port
is chosen and printed instead. Press Ctrl+C to stop it.

If a `tasks.md` does not follow the Spec Kit template, the tool still shows
everything it can and prints a warning such as
`warning: specs/002-x/tasks.md:14 checkbox without a task ID (counted)`. The
same warnings are listed on the feature in the overview and on its feature
page.

## Build mode

Build mode writes the same pages as a static site into a folder, for hosting
or sharing, and exits:

```sh
npx speckit-eye --build . --out _site
npx speckit-eye --build . --out _site --base /my-repo/
```

| Option | Required | Default | Meaning |
|---|---|---|---|
| `--build <dir>` | yes | — | The Spec Kit project to read. |
| `--out <folder>` | yes | — | Where to write the site. Created if missing. Must not be the project folder itself or lie inside `specs/` or `.specify/`. |
| `--base <path>` | no | `/` | The URL path the site is served under. `repo`, `/repo` and `/repo/` all mean `/repo/`. |

It prints a summary:

```text
speckit-eye 1.0.0 — building /path/to/project → _site (base /my-repo/)
  wrote 37 pages
  2 warnings (see above)
  Note: this site includes every spec, plan, research note, the constitution and assessments.
        Anyone who can reach it can read them unless your host restricts access.
```

- Exit code 0 means the site was written (warnings do not change it); 1 means
  the folder could not be written; 2 is a usage error, including an `--out`
  folder that is not empty and was not written by speckit-eye (nothing is
  changed in it then).
- Building again into the same folder replaces the previous build; pages of
  deleted files do not stay behind. The tool marks its output folder with a
  `.speckit-eye-build` file.
- The built pages match what serve mode shows, plus a "generated at" time in
  the footer. They have no live updates and no "Live updates paused" banner,
  and they work with JavaScript turned off.

**Everything is published**: see [Hosting a snapshot](hosting.md) for what a
hosted build exposes and a sample GitHub Pages workflow.

## Page layout

Every page has the same frame:

- **Sidebar** (overview and feature pages): a dark column on the left with the
  project name, the search entry, links to the Overview, the constitution and
  each idea assessment under `.specify/assessments/`, and the **Features**
  list ("Features 1 / 4 done"). Each feature there has a status dot (green
  when complete, blue ring when started, grey when not started) and its
  number of open tasks, or a ✓ when it is complete. The list is sorted "In
  progress first" (see [Order](#order-depth-and-filter)), and the feature
  whose page is open is marked. At the bottom are the theme switch and the
  version.
- **Icon rail** (document pages): the sidebar shrinks to a narrow dark rail
  of icons (search, Overview, Constitution, assessments, theme), so the
  document gets the room.
- **Mobile menu**: on a narrow screen (a phone, or a window narrower than
  about 1,000 pixels) the sidebar and rail are hidden behind a **Menu** button
  at the top of the page. It opens and closes without JavaScript.

Every link and button is at least 36 pixels tall, so it is easy to hit with a
mouse and on a touch screen (task map squares excepted).

## The overview

The overview answers three questions without scrolling: how far along is the
project, which feature is being worked on, and what comes next.

- **Stats card**: the overall percentage ("62 %", "40 of 65 tasks"),
  features ("1 / 4", "1 in progress"), phases ("5 / 9", "4 remaining") and
  open tasks ("25", "across 2 features"). Below it a bar has one segment per
  feature with tasks, as wide as the feature's share of all tasks, split into
  done, open and next. Hover a segment to see its feature; click it to jump to
  the feature in the tree.
- **Up next**: a dark bar that names the next task, its feature and phase.
  The full text shows on hover. **View task** opens the task on its feature
  page; **Open quickstart** opens the feature's `quickstart.md` when there is
  one. When there is no next task the bar says why ("Every task is complete",
  "No tasks yet").
- **Features** (left): the feature tree, see below.
- **Task map** (right): one square per task, see [The task map](#the-task-map).

On a narrow screen the tree comes first and the task map below it.

### The feature tree

One row per folder in `specs/`. A feature row shows its number chip ("002"),
title, a status pill ("10 open", "Ready", "Complete", or the stage when it has
no tasks yet: "Empty", "Specified", "Planned"), a small progress bar and
"done/total". The arrow at the end of the row opens the feature page.

Inside a feature are its phases from `tasks.md`, and inside a phase its tasks.
When a phase holds tasks for one user story only, the phase and the story are
shown as one row ("Phase 3 · User Story 1 - Beta listing", with a priority
badge such as P1); when it holds several stories, each story gets its own row
under the phase. Each task row shows a state mark, the task ID (a link to the
task on its feature page) and the task text; the next task has a **NEXT**
badge. Click a row (or press Enter on it) to open or close it. When the tree
is tall, it scrolls inside its card.

If a `tasks.md` has problems (for example checkboxes without a task ID), the
feature shows amber **warning rows** with the affected line numbers ("L14",
"L20–L22") and a **Details** link to the warnings on the feature page.

### Order, depth and filter

These controls need JavaScript; without it the tree is shown in the default
order with all its rows still opening and closing.

- **Order** (the button above the tree) cycles through four orders:
  - **In progress first** (default): features with open tasks (started ones
    before not started ones), then features without tasks, then complete
    features;
  - **Number**: folder order;
  - **Least complete**: lowest percentage first;
  - **Name A–Z**: by title.
- **Depth** ("Features | Phases | Tasks") opens the tree to that level in one
  click: only feature rows, every feature with its phases, or every phase
  with tasks.
- **All features / Open tasks only** (top right of the page): "Open tasks
  only" hides complete features, phases and stories and every done task.

The order and the filter are remembered in the browser.

### What is active

The overview opens exactly one chain: the **active feature**, its **active
phase**, and, when that phase holds several stories, its **active story**.
Everything else starts collapsed.

The active feature is picked like this:

1. The feature named in `.specify/feature.json` (Spec Kit writes this file).
2. Otherwise, the feature folder with the same name as your current git branch.
3. Otherwise, the first feature (in folder order) that still has open tasks.

A feature from rule 1 or 2 is passed over when all its tasks are done, as long
as some other feature still has open tasks. Inside the active feature, the
active phase is the first phase with open tasks, the active story is the first
story in that phase with open tasks, and the next task is the first open task
there.

When every task in the project is done, the page says so and nothing is marked
"next". A feature named by rule 1 or 2 then stays open and highlighted (and
green, because it is complete); otherwise nothing is active.

### Stage labels

A feature's stage comes from the files in its folder:

| Stage | Meaning |
|---|---|
| Empty | Neither `spec.md` nor `tasks.md` yet |
| Specified | `spec.md` only |
| Planned | `plan.md`, but no tasks yet |
| Ready | `tasks.md` with tasks, none done yet |
| In progress (shown as "N open") | Some tasks done, some open |
| Complete | Every task done |

Features without a `tasks.md` are listed, but they do not count toward the task
total.

## The task map

The task map shows every task of the project as one square, in the same order
as the folders and the `tasks.md` files, including checkboxes without a task
ID. The legend below it counts each state ("Done 40 · Open 23 · Blocked 1 ·
Next 1 · 1 dot = 1 task").

### Colors

The same colors are used in the task map, the tree and the legend:

| Look | Task state |
|---|---|
| Filled green | Done |
| Blue outline | Open: still to do |
| Rose outline | Blocked: its "depends on T…" names a task that is still open |
| Orange | Next: the next task to work on |

Feature and phase rows use a green ✓ when complete, a blue ring when started
and grey when not started yet. Completed items keep their green color and ✓
even when they are collapsed.

### Hover, tooltip and click

- **Hover** a square: it grows at once, and its feature, phase and task rows
  are tinted in the tree. After half a second a dark tooltip shows the task
  ID, its status, the start of its text and its feature. The tooltip appears
  at once when a square gets keyboard focus, and never on a touch screen.
  Moving away hides it at once.
- **Click** a square (tap it, or press Enter on it) to reveal its task in the
  tree: its feature and phase open, the tree scrolls to the task, and the
  task stays outlined. From there its task ID opens the feature page. Without
  JavaScript the square is a link that jumps to the task row, and its title
  names the task.

### By feature, and large projects

**By feature** groups the squares into one labelled block per feature
("name · done/total"); **Stack all** puts them back into one field. The choice
is remembered in the browser.

The map adapts to the size of the project:

| Tasks in the project | The map opens |
|---|---|
| up to 1,000 | stacked, one square per task |
| 1,001 to 5,000 | "By feature" (you can still switch to "Stack all") |
| more than 5,000 | one progress bar per feature, labelled "title · done / total" (1 bar = 1 feature); click a bar to jump to the feature in the tree |

Features without tasks have no block or bar. The tree is the same in all
cases.

## Feature pages

Every feature has its own page, `features/<folder>/index.html`, opened from
the sidebar, the arrow on its tree row, a task ID in the tree or "View task".

- **Header**: a breadcrumb (Overview / Features), the status pill, the folder
  name, the title, "done / total tasks · completed of total phases" and a
  progress ring (a ✓ when the feature is complete).
- **Tabs**: **Tasks** (this page, with its task count) and one tab per
  document that exists: Specification, Plan, Research, Data model,
  Quickstart, Contracts, the quality checklist (or Checklists) and More for
  every other file. A tab with several documents, such as Contracts, opens a
  list of them. A link to `tasks.md` sits below the task list.

### Phases

The **phase rail** has one block per phase ("P3 · 6"), as wide as the phase's
share of the feature's tasks and colored by its status; the caption below it
names the selected phase. Choosing a block or a phase row opens that phase and
closes the others; choosing it again closes it. On load the active phase is
open. On a narrow screen the rail and the tabs scroll sideways inside their
own area.

When the feature's `tasks.md` has problems, an amber banner lists them with
their line numbers; **Show lines** reveals the lines of `tasks.md` as written.

### Tasks, filters and the detail panel

Each task row shows a state mark, its ID, its text (with its formatting,
`code` and FR/SC references as chips) and, in aligned columns, a **kind** chip
("Go test", "Vue") and a **file** chip ("list.go", or "2 files") taken from
the file paths in the text. Long text is cut off on the row, never in the
content.

Above the list (with JavaScript):

- **Filter chips**: All, Open, Tests and one chip per kind of file, each with
  its count.
- **Filter by ID, text or file**: a text filter; when nothing matches, the
  page says "No tasks match the filters" with **Clear filters**.
- **Expand all** / **Collapse all**.

Click a task row to expand it in place (full text and its markers: user
story, "Parallel", FR/SC references, "depends on"); click again to collapse
it. With JavaScript the task is also selected and shown in the **detail
panel**: ID, status, full text, phase, markers and every file path. For a
blocked task it says which tasks it is waiting on ("Waiting on T011").
**Copy ID** copies the task ID; **View source line** opens `tasks.md` at that
task's line, highlighted.

Each task has its own address (`features/002-beta/index.html#task-…`). The
address changes when you select a task, so you can bookmark or share it;
opening it shows the task open, selected and in view.

## Documents

Every Markdown file of the project gets its own page, so you can read the
specs without opening the repository:

- every `*.md` file anywhere under each feature folder in `specs/`: `spec.md`,
  `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `tasks.md`, the
  files in `contracts/` and `checklists/`, and any other file such as the
  autopilot's `decisions.md` and `run-log.md`;
- the constitution, `.specify/memory/constitution.md`;
- every `*.md` file under `.specify/assessments/`, grouped per assessment.

A file or folder whose name has characters other than letters, digits, `.`,
`_` and `-` (for example a space) gets no page; the tool prints a warning such
as `warning: specs/001-x/bad name.md name not supported for a page (skipped)`
and shows it on the feature.

Every document is at most two clicks from the overview: through the
feature's tabs, or through the document list of any document of the same
feature. The constitution and the first document of each assessment are
linked from the sidebar.

### The reader

Document pages use a reading layout with three columns:

- **Document list** (left): "Back to feature", the feature's title and status,
  and its documents grouped under **Define** (specification, checklists),
  **Design** (plan, research, data model, quickstart), **Contracts**,
  **Build** (tasks) and **Other**, with the current one marked. The
  constitution and assessments get a list of the project documents. Each
  link is labelled with the file's first `# ` heading (or its file name).
- **Reading column**: the document kind and file name ("SPECIFICATION ·
  spec.md"), the title, and the top-level sections numbered 01, 02, ….
  **Expand all** opens every collapsed part; **Raw markdown** shows the exact
  source of the file and switches back.
- **On this page** (right): the sections of the document. The section being
  read is marked, and a bar shows how far you have read.

On a narrow screen the contents panel is hidden and the document list sits
behind a button at the top.

### Specifications

A `spec.md` that follows the Spec Kit template is shown in a structured way:

- a metadata card (feature branch, created, status) and the original request
  as a pull quote;
- clarifications grouped by session ("N answered · M sessions"), the first
  session open, with **Show N more answers** and aligned Yes / No badges;
- user stories as cards: priority, why this priority, the independent test, a
  numbered Given / When / Then table, and the phase that implements the story
  with its progress;
- functional requirements with area chips (click a chip to show only that
  area) and MUST, MUST NOT, SHOULD, SHOULD NOT and MAY highlighted;
- key entities as a grid of cards.

Everything else is shown as ordinary formatted text. No line of the file is
left out and no wording is changed; "Raw markdown" always shows the source.
Other documents are shown with ordinary formatting in the same layout. In a
`tasks.md` document every task line can be linked to (`tasks.html#L31`),
which is where "View source line" lands.

### How documents are formatted

Headings, tables, task lists (as ticked or empty checkboxes; checklist
checkboxes are never counted as tasks), code blocks, block quotes and links
are rendered. Headings get anchors, so a link such as `cli.md#synopsis` lands
on the "Synopsis" heading.

- **Links to other documents** (relative links such as `[plan](./plan.md)` or
  `[cli](contracts/cli.md#synopsis)`) open that document's page.
- **Links to other files** in the repository (for example `../../src/index.js`)
  are shown as plain text: the tool never serves files that are not
  documents.
- **Web links** (`http:`, `https:`, `mailto:`) are kept as they are. Other
  link types, such as `javascript:`, are not links.
- **Raw HTML** in a file, including `<script>` tags, is shown as text and
  never runs.
- **Images** are shown as their alt text; nothing is loaded from other
  servers.
- **Diagrams** (for example ` ```mermaid ` blocks) are shown as code; they are
  not drawn in this version.

## Theme

The theme switch at the bottom of the sidebar (and of the icon rail) has
three buttons: **Light**, **Dark** and **System**. System is the default and
follows your operating system, also when it changes while a page is open.

Your choice applies to every page from its first paint, with no flash of the
other theme, and it survives reloads and live updates. It is remembered in the
browser; if the browser refuses to store it (for example a private window with
storage blocked), the switch still changes the current page and the next page
starts with System again.

The sidebar, the icon rail, the Up next bar and the map tooltips stay dark in
both themes, and the next-task orange is the same in both.

## Search

Press **⌘K** (Ctrl+K on Windows and Linux) on any page, or click **Search
tasks, specs…** in the sidebar or the icon rail.

- **What is searched**: tasks by ID and text, features by number and name,
  and documents by title and section headings.
- **What is not searched**: the body text of documents. A word that appears
  only in a paragraph of a spec finds nothing.
- Every word you type must match; case is ignored. A task ID typed in full
  ("T018") always comes first.
- Results are grouped as **Tasks** (state mark, ID, text and feature),
  **Features** (name and status) and **Documents**, each showing its first 8
  results and "N more".
- Use the arrow keys and Enter, or click, to open a result: a task opens
  selected on its feature page, a heading opens the document at that heading.
  Escape closes the search and returns you to where you were.

Search works the same in static builds, also under a sub-path, and never
contacts another server. In serve mode it finds changes after a live update
without a reload.

## Without JavaScript

All pages stay readable and navigable with JavaScript turned off, for example
in a locked-down browser or a hosted build:

- the tree, phases, stories, task rows, clarification sessions, "Show more
  answers", "Raw markdown" and the mobile menu open and close;
- every link and tab works, and task map squares jump to their rows in the
  tree;
- the page follows the theme of your operating system.

These parts need JavaScript and are not shown without it: the search entry,
the theme switch, the Order, depth and "Open tasks only" controls, the map
mode button, the task filters, the detail panel, "Expand all" and the
requirement area chips.

## Supported browsers

The pages work in the last two major versions of Chrome, Edge, Firefox and
Safari, on desktop and on phones. They are tested in Chromium, Firefox and
WebKit. Fonts and icons ship with the tool, so no page loads anything from
another server.

## Live updates

In serve mode, every open page follows your files as they change. There is no
timed refresh and nothing to click: when a file settles, the page updates
within about 2 seconds (usually much faster).

### What triggers an update

- Creating, changing, renaming, or deleting any Markdown file under `specs/`
  (every feature folder, including `contracts/` and `checklists/`), the
  constitution in `.specify/memory/`, and the files under
  `.specify/assessments/`.
- A new or deleted feature folder: it appears in, or disappears from, the tree.
- A change to `.specify/feature.json` or a switch of git branch, which can
  change the active feature.

Editors that save by writing a temporary file and renaming it over the
original, and bursts of many writes (for example during an autopilot run), are
both fine: the tool waits for a short quiet moment, then rescans the whole
project, so the page always ends on the final content.

Each rescan prints one line in the terminal, such as
`updated (3 features, 41/65 tasks)`, plus any new or changed warning.

### What you see on the page

- The page stays as you left it: scroll positions (of the page, the tree
  card and the task list), the items you opened or closed, the order, depth
  and filters, the map mode, the selected task, text you typed in a filter,
  and the raw or expanded view of a document. A selected task that is
  deleted from `tasks.md` is unselected.
- Items whose status or counts changed are briefly highlighted, and progress
  bars move to their new values. With "reduce motion" turned on in your
  system settings, the highlight and animation are skipped.
- If the page you are on no longer exists (for example its file was deleted),
  a notice says so and links back to the overview.

### The "Live updates paused" banner

The banner at the bottom of the page, "Live updates paused — reconnecting…",
means the page has lost its connection to the tool, usually because you
stopped it with Ctrl+C. The page keeps showing the last content and keeps
trying to reconnect. Start the tool again on the same address (the same port,
4747 by default) and the banner goes away and the page catches up on its own.

### WSL

Under WSL, keep the project on the Linux file system (for example under
`~/projects/`). Files under `/mnt/c/...` that are edited from Windows do not
raise Linux file events, so the page would not update; network drives may not
raise them either. If you must work from such a folder, restart the tool to
see your changes (reloading the page is not enough, because the tool has not
rescanned).
