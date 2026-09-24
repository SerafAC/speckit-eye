/**
 * Command-line argument parsing (contracts/cli.md). Pure: no I/O, no exit.
 */

import { parseArgs } from "node:util";

export const USAGE = `Usage:
  speckit-eye --serve <dir>
  speckit-eye --build <dir> --out <folder> [--base <path>]
  speckit-eye --help
  speckit-eye --version

Options:
  --serve <dir>     Start the local live dashboard for the Spec Kit project in <dir>
  --build <dir>     Write a static site for the Spec Kit project in <dir>
  --out <folder>    Output folder for --build (required)
  --base <path>     URL base path for --build (default /), for example /repo/
  -h, --help        Show this help
  -v, --version     Show the version
`;

/**
 * @typedef {object} CliArgs
 * @property {"serve" | "build" | "help" | "version"} mode
 * @property {string | null} dir
 * @property {string | null} out
 * @property {string} base
 */

/**
 * Normalizes a base path to a leading and trailing `/` (`repo` → `/repo/`).
 * @param {string | undefined | null} base
 * @returns {string}
 */
export function normalizeBase(base) {
  const trimmed = String(base ?? "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

/**
 * @param {string[]} argv arguments after the node binary and script
 * @returns {CliArgs | {error: string}}
 */
export function parseCliArgs(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        serve: { type: "string" },
        build: { type: "string" },
        out: { type: "string" },
        base: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    }));
  } catch (err) {
    return { error: /** @type {Error} */ (err).message };
  }

  if (values.help) return { mode: "help", dir: null, out: null, base: "/" };
  if (values.version) return { mode: "version", dir: null, out: null, base: "/" };

  const serve = values.serve !== undefined;
  const build = values.build !== undefined;
  if (serve && build) return { error: "use either --serve or --build, not both" };
  if (!serve && !build) return { error: "missing mode: use --serve <dir> or --build <dir>" };

  if (serve) {
    if (!values.serve) return { error: "--serve needs a project folder" };
    if (values.out !== undefined) return { error: "--out can only be used with --build" };
    if (values.base !== undefined) return { error: "--base can only be used with --build" };
    return { mode: "serve", dir: values.serve, out: null, base: "/" };
  }

  if (!values.build) return { error: "--build needs a project folder" };
  if (!values.out) return { error: "--build needs --out <folder>" };
  return { mode: "build", dir: values.build, out: values.out, base: normalizeBase(values.base) };
}
