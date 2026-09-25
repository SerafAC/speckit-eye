/**
 * Discovers a Spec Kit project's input files through a ProjectReader and
 * returns them raw (no parsing). Pure apart from the injected reader.
 */

import { isValidName, compareStrings, CONSTITUTION_SOURCE } from "./artifacts.js";

/**
 * @typedef {object} Warning
 * @property {string} code  e.g. "W9"
 * @property {string} file  project-relative path
 * @property {number | null} line
 * @property {string} message
 */

/**
 * @typedef {object} ScanResult
 * @property {string} name
 * @property {{dir: string, files: Map<string, string>}[]} features
 * @property {{source: string, content: string} | null} constitution
 * @property {{slug: string, files: Map<string, string>}[]} assessments
 * @property {string | null} featureDirectory
 * @property {string | null} gitBranch
 * @property {string | null} gitDir
 * @property {Warning[]} warnings
 */

/**
 * Sort order for warnings: by file, then by line; a warning without a line
 * comes first within its file.
 * @param {Warning} a
 * @param {Warning} b
 * @returns {number}
 */
export function compareWarnings(a, b) {
  if (a.file !== b.file) return compareStrings(a.file, b.file);
  return (a.line ?? 0) - (b.line ?? 0);
}

export const MSG_W9 = "could not read file (skipped)";
export const MSG_W10 = ".specify/feature.json does not name an existing feature (ignored)";
export const MSG_W11 = "name not supported for a page (skipped)";

const FEATURE_JSON = ".specify/feature.json";
const ASSESSMENTS = ".specify/assessments";

/**
 * A folder is a Spec Kit project when `specs/` or `.specify/` exists.
 * @param {import("./reader.js").ProjectReader} reader
 */
export async function isSpecKitProject(reader) {
  return (await reader.exists("specs")) || (await reader.exists(".specify"));
}

/**
 * Reads every `*.md` below `baseDir`, recursively, into a Map keyed by the
 * path relative to `baseDir`.
 * @param {import("./reader.js").ProjectReader} reader
 * @param {string} baseDir
 * @param {Warning[]} warnings
 */
async function readMarkdownTree(reader, baseDir, warnings) {
  /** @type {Map<string, string>} */
  const files = new Map();
  /** @param {string} rel */
  async function walk(rel) {
    const dir = rel ? `${baseDir}/${rel}` : baseDir;
    const entries = [...(await reader.list(dir))].sort((a, b) => compareStrings(a.name, b.name));
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (!entry.isDir && !entry.name.endsWith(".md")) continue;
      if (!isValidName(entry.name)) {
        warnings.push({ code: "W11", file: `${baseDir}/${relPath}`, line: null, message: MSG_W11 });
        continue;
      }
      if (entry.isDir) {
        await walk(relPath);
        continue;
      }
      try {
        files.set(relPath, await reader.read(`${baseDir}/${relPath}`));
      } catch {
        warnings.push({ code: "W9", file: `${baseDir}/${relPath}`, line: null, message: MSG_W9 });
      }
    }
  }
  await walk("");
  return files;
}

/**
 * Sorted direct subfolders of `dir` with valid names; invalid ones raise W11.
 * @param {import("./reader.js").ProjectReader} reader
 * @param {string} dir
 * @param {Warning[]} warnings
 */
async function listSubfolders(reader, dir, warnings) {
  const names = (await reader.list(dir))
    .filter((e) => e.isDir)
    .map((e) => e.name)
    .sort(compareStrings);
  return names.filter((name) => {
    if (isValidName(name)) return true;
    warnings.push({ code: "W11", file: `${dir}/${name}`, line: null, message: MSG_W11 });
    return false;
  });
}

/**
 * @param {string} value
 */
function basename(value) {
  const parts = value.replace(/\\/g, "/").replace(/\/+$/, "").split("/");
  return parts[parts.length - 1];
}

/**
 * @param {import("./reader.js").ProjectReader} reader
 * @param {string} projectName
 * @returns {Promise<ScanResult>}
 */
export async function scan(reader, projectName) {
  /** @type {Warning[]} */
  const warnings = [];

  const features = [];
  for (const dir of await listSubfolders(reader, "specs", warnings)) {
    features.push({ dir, files: await readMarkdownTree(reader, `specs/${dir}`, warnings) });
  }

  let constitution = null;
  if (await reader.exists(CONSTITUTION_SOURCE)) {
    try {
      constitution = { source: CONSTITUTION_SOURCE, content: await reader.read(CONSTITUTION_SOURCE) };
    } catch {
      warnings.push({ code: "W9", file: CONSTITUTION_SOURCE, line: null, message: MSG_W9 });
    }
  }

  const assessments = [];
  for (const slug of await listSubfolders(reader, ASSESSMENTS, warnings)) {
    assessments.push({ slug, files: await readMarkdownTree(reader, `${ASSESSMENTS}/${slug}`, warnings) });
  }

  let featureDirectory = null;
  if (await reader.exists(FEATURE_JSON)) {
    let named = null;
    try {
      const json = JSON.parse(await reader.read(FEATURE_JSON));
      const value = json?.feature_directory;
      if (typeof value === "string" && value.trim()) named = basename(value.trim());
    } catch {
      named = null;
    }
    if (named && features.some((f) => f.dir === named)) {
      featureDirectory = named;
    } else {
      warnings.push({ code: "W10", file: FEATURE_JSON, line: null, message: MSG_W10 });
    }
  }

  let gitBranch = null;
  let gitDir = null;
  try {
    const git = await reader.readGitHead();
    if (git) {
      gitDir = git.gitDir;
      const m = /^ref:\s*refs\/heads\/(.+?)\s*$/.exec(git.head.trim());
      gitBranch = m ? m[1] : null;
    }
  } catch {
    gitBranch = null;
    gitDir = null;
  }

  return { name: projectName, features, constitution, assessments, featureDirectory, gitBranch, gitDir, warnings };
}
