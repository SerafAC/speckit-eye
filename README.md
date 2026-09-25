# speckit-eye

A zero-setup progress dashboard for [GitHub Spec Kit](https://github.com/github/spec-kit)
projects. Point it at a project folder and open the printed address: you see
how far along the project is, which feature and phase are being worked on, and
which task comes next, without reading a single `tasks.md` by hand.

speckit-eye only reads your project. It never creates, changes, or deletes a
file in it.

## Prerequisites

- Node.js 22 or later (it comes with `npx`)

## Usage

In a Spec Kit project folder:

```sh
npx speckit-eye --serve .
```

Then open the `Local:` address it prints (normally http://127.0.0.1:4747/).
Press Ctrl+C to stop.

The overview shows an overall progress bar with counters for specs, phases,
and tasks, a tree of every feature with its phases and stories, and a grid
with one square per task.

## Documentation

- [Usage](docs/usage.md): what the overview shows, stage labels, colors, and
  how the active feature is chosen
- [Development](DEVELOPMENT.md): building, testing, and contributing
