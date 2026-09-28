// docmd configuration for the documentation site (feature 003, research R3).
// The site URL has one definition: package.json `homepage` (§III); docmd
// derives the base path (/speckit-eye/) from it.
import pkg from "./package.json" with { type: "json" };

const GITHUB = "https://github.com/SerafAC/speckit-eye";

export default {
  title: "speckit-eye",
  url: pkg.homepage,
  src: "docs",
  out: "site",
  // docmd's defaults turn every hard-wrapped line into <br> and prose such as
  // "spec.md" into links to https://spec.md.
  markdown: { breaks: false, linkify: false },
  navigation: [
    { title: "Home", path: "/" },
    { title: "Usage", path: "/usage" },
    { title: "Hosting a snapshot", path: "/hosting" },
    { title: "Architecture", path: "/architecture" },
    { title: "Releasing", path: "/releasing" },
    { title: "Contributing", path: `${GITHUB}/blob/main/CONTRIBUTING.md`, external: true },
    { title: "Development", path: `${GITHUB}/blob/main/DEVELOPMENT.md`, external: true },
    { title: "Project status & live demo", path: `${pkg.homepage}status/`, external: true },
    { title: "npm", path: "https://www.npmjs.com/package/speckit-eye", external: true },
    { title: "GitHub", path: GITHUB, external: true },
  ],
  // No chat widget, no tracking, nothing loaded from other servers.
  plugins: { ai: false, analytics: false },
};
