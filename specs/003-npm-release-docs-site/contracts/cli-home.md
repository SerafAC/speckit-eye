# Contract: `--home <url>` build option (delta to 001 `contracts/cli.md`)

This feature adds one option to the speckit-eye CLI. Everything else in
[001 contracts/cli.md](../../001-speckit-eye-dashboard/contracts/cli.md) stays unchanged;
at implementation that contract's synopsis and option table gain the row below.

## Synopsis

```text
speckit-eye --build <dir> --out <folder> [--base <path>] [--home <url>]
```

| Option | Value | Modes | Default | Notes |
|---|---|---|---|---|
| `--home` | absolute `http:`/`https:` URL | build | none | Adds a "Home" link to `<url>` on every page (research R6). |

## Rules

- `--home` with `--serve` → usage error, exit 2 (`--home can only be used with --build`).
- A value that does not parse as a URL with protocol `http:` or `https:` → usage error, exit 2
  (`--home must be an http or https URL`).
- Without `--home`, every generated file is identical to the output of the previous version.
- The usage text (`--help`) lists the option:
  `--home <url>      Link back to <url> from every page, for --build (for example your docs site)`.

## Rendering

- Overview and feature pages: in the sidebar, directly under the project name, a link
  `<a href="<url>" data-part="home">` with the `house` icon and the text "Home".
- Document pages: in the icon rail, after the brand, an icon link with `aria-label="Home"` and
  `title="Home"`.
- Mobile menu: the same link as the sidebar.
- The URL is written as given (HTML-escaped by the `html` template); no `target`, no scripts.
  The CSP is unchanged (the link is navigation, not a resource load).
