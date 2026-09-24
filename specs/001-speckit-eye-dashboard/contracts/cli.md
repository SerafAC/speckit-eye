# Contract: Command-Line Interface

The binary is `speckit-eye`, installed from the npm package `speckit-eye`, typically run as `npx speckit-eye …`.

## Synopsis

```text
speckit-eye --serve <dir>
speckit-eye --build <dir> --out <folder> [--base <path>]
speckit-eye --help
speckit-eye --version
```

Arguments are parsed with `util.parseArgs` in strict mode. The CLI accepts exactly one mode (`--serve` or `--build`).

| Option | Value | Modes | Default | Notes |
|---|---|---|---|---|
| `--serve` | project dir | serve | — | Starts the local live server (FR-002). |
| `--build` | project dir | build | — | Writes the static site (FR-003). |
| `--out` | folder | build (required) | — | The output folder, created if missing. Must not be the project folder itself or inside `specs/` or `.specify/`. |
| `--base` | URL path | build | `/` | Normalized to a leading and trailing `/` (`repo` → `/repo/`) (FR-004). |
| `--help`, `-h` | — | — | — | Prints usage to stdout and exits 0. |
| `--version`, `-v` | — | — | — | Prints the version from `package.json` and exits 0. |

With no arguments, the CLI prints usage to stderr and exits 2.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. For build: the site was written (warnings do not change the code). Serve: stopped with Ctrl+C / SIGTERM. |
| 1 | Runtime failure: the output cannot be written, the server cannot start, or an unexpected error occurred. |
| 2 | Usage error: unknown or conflicting options, a missing required value, `<dir>` does not exist or is not a Spec Kit project (neither `specs/` nor `.specify/`), or `--out` is not empty and has no `.speckit-eye-build` marker (FR-033). |

## Output

stdout is for normal information; stderr is for warnings and errors. There are no colors when stdout is not a TTY.

**Serve**

```text
speckit-eye 1.0.0 — serving /path/to/project
  Local: http://127.0.0.1:4747/
  Watching specs/ and .specify/ for changes (Ctrl+C to stop)
warning: specs/002-x/tasks.md:14 checkbox without a task ID (counted)
```

- The server binds to `127.0.0.1` only (FR-007). If port 4747 is busy, it uses a free port chosen by the operating system, and the `Local:` line shows that port.
- On every rescan, new or changed warnings are printed once, and each rescan logs one line: `updated (<n> features, <done>/<total> tasks)`.

**Build**

```text
speckit-eye 1.0.0 — building /path/to/project → ./site (base /repo/)
  wrote 37 pages
  2 warnings (see above)
  Note: this site includes every spec, plan, research note, the constitution and assessments.
        Anyone who can reach it can read them unless your host restricts access.
```

- The build is deterministic apart from the "generated at" timestamp on the pages (FR-031).
- FR-033: if `--out` exists and contains `.speckit-eye-build`, its contents are removed and rewritten. If it exists, is not empty, and has no marker, nothing is written and the exit code is 2.
- The project folder is never written (FR-006).
