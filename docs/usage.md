# Using speckit-eye

speckit-eye shows the progress of a [GitHub Spec Kit](https://github.com/github/spec-kit)
project in your browser. It only reads your project: it never creates, changes,
or deletes a file in it.

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
speckit-eye 0.1.0 — serving /path/to/project
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

## What the overview shows

- **Header**: the project name, and links to the constitution and to each
  idea assessment under `.specify/assessments/`.
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
  its feature and phase are outlined in the tree.

On a narrow screen the tree comes first and the grid below it.

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
