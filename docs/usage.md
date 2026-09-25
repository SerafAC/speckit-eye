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
same warnings are listed on the feature in the overview.

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

## What the overview shows

- **Header**: the project name, an Overview link, links to the constitution
  and to each idea assessment under `.specify/assessments/`, and the Menu (see
  [Artifact pages](#artifact-pages)).
- **Progress**: one bar for all tasks in the project ("40 / 65 tasks (62 %)"),
  and three counters: completed specs, completed phases, and completed tasks,
  each as "completed / total". Below them, the next open task ("Next: T011 ·
  List paging"). When every task is done, the page says so instead.
- **Feature tree** (left): one entry per folder in `specs/`, in folder order.
  Each feature shows its title, its stage, and "N open / M" tasks. Inside a
  feature are its phases from `tasks.md`, and inside a phase its tasks. When a
  phase holds tasks for one user story only, the phase and the story are shown
  as one row ("Phase 3 · US1 – Beta listing (P1)"); when it holds several
  stories, each story gets its own row under the phase. Click a row (or press
  Enter on it) to open or close it.
- **Task grid** (right): one small square per task, in the same order as the
  tree, colored by state. Hover a square to see the task ID and description;
  its feature and phase are outlined in the tree. Click a square (or press
  Enter on it) to jump to that task in the tree: its feature, phase and story
  open, the tree scrolls to the task, and the task is outlined until your next
  click. This also works with JavaScript turned off, for example on a hosted
  static build; the browser then jumps to the task without the smooth scroll.

On a narrow screen the tree comes first and the grid below it.

### Large projects

The grid changes shape as the total number of tasks grows, so it stays
readable:

| Tasks in the project | The grid shows |
|---|---|
| up to 1,000 | one square per task, as above |
| 1,001 to 5,000 | one row per feature, labelled with its title, with smaller squares; hover and click work as above |
| more than 5,000 | one progress bar per feature, labelled "title · done / total"; click a bar to jump to the feature in the tree |

Features without tasks have no row or bar. The tree is the same in all three
cases.

### Stage labels

A feature's stage comes from the files in its folder:

| Stage | Meaning |
|---|---|
| Empty | Neither `spec.md` nor `tasks.md` yet |
| Specified | `spec.md` only |
| Planned | `plan.md`, but no tasks yet |
| Ready | `tasks.md` with tasks, none done yet |
| In progress | Some tasks done, some open |
| Complete | Every task done |

Features without a `tasks.md` are listed, but they do not count toward the task
total.

### Colors

| Color | Tree | Grid |
|---|---|---|
| Green with a ✓ | Completed feature, phase, or story | Completed task |
| Highlighted | The active feature, phase, and story | The next task |
| Blue | Started but not finished | — |
| Dark grey | Not started yet (or no `tasks.md`) | A task still to do |
| Red | — | A blocked task: its "depends on T…" names a task that is still open |

Completed items keep their green color and ✓ even when they are collapsed.

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

## Artifact pages

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

### Order

Inside a feature, the standard files come first, in this order: spec, plan,
research, data model, quickstart, tasks, then the contracts and the checklists
(each by name), then every other file by path. Inside an assessment: intake,
research, problem, concept, decision, then the rest by name. Each link is
labeled with the file's first `# ` heading (or its file name when it has none).

### Getting there

Every artifact is at most two clicks away from the overview:

- **On the feature**: open a feature in the tree; links to its artifacts are
  listed above its phases. A missing file (for example no `research.md`) has
  no link.
- **Menu**: every page has a **Menu** button in the header. It lists the
  overview, the constitution, each assessment with its files, and each
  feature with its files. It opens and closes without JavaScript.
- **Back**: every page has an **Overview** link in the header, and each
  artifact page starts with a breadcrumb (Overview › feature › file).

### How files are shown

Headings, tables, task lists (as ticked or empty checkboxes; checklist
checkboxes are never counted as tasks), code blocks, block quotes and links
are rendered. Headings get anchors, so a link such as `cli.md#synopsis` lands
on the "Synopsis" heading.

- **Links to other artifacts** (relative links such as `[plan](./plan.md)` or
  `[cli](contracts/cli.md#synopsis)`) open that artifact's page.
- **Links to other files** in the repository (for example `../../src/index.js`)
  are shown as plain text: the tool never serves files that are not
  artifacts.
- **Web links** (`http:`, `https:`, `mailto:`) are kept as they are. Other
  link types, such as `javascript:`, are not links.
- **Raw HTML** in a file, including `<script>` tags, is shown as text and
  never runs.
- **Images** are shown as their alt text; nothing is loaded from other
  servers.
- **Diagrams** (for example ` ```mermaid ` blocks) are shown as code; they are
  not drawn in this version.

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

- Your scroll position and the items you opened or closed stay as they are.
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
