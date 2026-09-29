---
title: speckit-eye
---

# speckit-eye

speckit-eye is a zero-setup progress dashboard for
[GitHub Spec Kit](https://github.com/github/spec-kit) projects. It reads the
`specs/` and `.specify/` folders of a project and shows how far along the
project is, which feature and phase are being worked on and which task comes
next, either as a live local server or as a static site you can host.

![The speckit-eye overview: a dark sidebar with the features, a stats card with the overall percentage and a bar per feature, the Up next bar naming the next task, the feature tree with the active phase open, and the task map with one square per task](assets/screenshot.png)

## Install and run

You need Node.js 22 or later. In a Spec Kit project folder, run:

```sh
npx speckit-eye --serve .
```

and open the address it prints. [Usage](usage.md) describes every option.

## Project status & live demo

**[Project status & live demo](https://serafac.github.io/speckit-eye/status/)**:
this repository's own specs and tasks, shown by speckit-eye and rebuilt from
`main` on every change.

The package is on [npm](https://www.npmjs.com/package/speckit-eye) and the
source is on [GitHub](https://github.com/SerafAC/speckit-eye).

## Guides

- [Usage](usage.md): serve and build modes, options, and what the pages show
- [Hosting a snapshot](hosting.md): publishing a static build, for example on
  GitHub Pages
- [Architecture](architecture.md): how the code is organized
- [Releasing](releasing.md): how a new version is published

## Project

- [Contributing](https://github.com/SerafAC/speckit-eye/blob/main/CONTRIBUTING.md)
- [Development](https://github.com/SerafAC/speckit-eye/blob/main/DEVELOPMENT.md)
- [Changelog](https://github.com/SerafAC/speckit-eye/blob/main/CHANGELOG.md)
- [Security policy](https://github.com/SerafAC/speckit-eye/blob/main/SECURITY.md)
