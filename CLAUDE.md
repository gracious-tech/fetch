
# fetch(bible) Platform

## Project Overview

fetch(bible) is a complete platform for digital Bible access, built by Gracious Tech. Unlike
typical API platforms, it uses a **client-side architecture** where the hosted portion is entirely
static files and the "API" is a client-side JavaScript module. This means no backend server is
needed — collections are hosted on a CDN and consumed directly by the client library.

**Key features:**
- A collector CLI that discovers, downloads, converts, and publishes Bible translations from
  multiple sources (eBible, DBL, etc.) into static file collections
- A client library (`@gracious.tech/fetch-client`) that consumes those collections in an API-like
  way, supporting browser and Node.js
- A full-featured Vue 3 Bible reading app with multi-translation view, search, cross-references,
  glosses, and study notes
- A web enhancer that detects Bible references on third-party pages and makes them interactive
- A search indexing library using flexsearch
- A Bible reference parsing/detection library (`@gracious.tech/bible-references`)
- Converters for Bible formats (USX to JSON, reverse versification)
- A VitePress documentation site at https://fetch.bible/

**Repository:** https://github.com/gracious-tech/fetch
**Website:** https://fetch.bible/
**License:** MIT-0 (MIT No Attribution)


## Architecture & Data Flow

### High-level flow

```
External sources (eBible, DBL, etc.)
        │
        ▼
   [collector]  ── discover → download → process → manifest → publish
        │
        ▼
   Static files on CDN (S3 + CloudFront)
        │
        ▼
   [client]  ── fetches manifest + translation data client-side
        │
        ▼
   [app / enhancer / third-party apps]  ── renders Bible content
```

### Component dependency graph (build order)

```
references  ─────────────────────────────────┐
    │                                        │
    ▼                                        ▼
  client  ──────────────────────────►  collector
    │                                    │
    ├──► enhancer                        │ (uses converters)
    │                                    │
    ▼                                    ▼
  search                          converters/usx-to-json
    │                             converters/reverse-usx
    ▼
   app
```

### Data formats

- **Source formats:** USFM, USX (XML), plain text — downloaded from external sources
- **Distribution formats:** JSON (HTML content per verse), JSON (plain text per verse), USFM, USX
- **Collection structure:** Static files with a manifest JSON at the root, translations organized
  by ID, chapters as individual files
- **Shared types:** Defined in `collector/src/parts/shared_types.ts` and symlinked into
  `client/src/assets/shared_types.ts`


## Tech Stack

| Technology | Purpose |
|---|---|
| **TypeScript** | Primary language for all packages (strict mode) |
| **Vue 3** | App and site UI framework (with Pug templates, scoped SASS) |
| **Vuetify 3** | Material Design 3 component library for the app |
| **Vite** | Dev server and bundler for app |
| **VitePress** | Static site generator for fetch.bible docs |
| **esbuild** | Fast bundling for libraries (client, search, references, converters, collector) |
| **vitest** | Test runner |
| **ESLint** | Linting (with Vue, TypeScript, Pug plugins) |
| **SASS** | Stylesheets for client CSS and enhancer |
| **yargs** | CLI argument parsing for collector |
| **flexsearch** | Full-text search indexing |
| **AWS S3 + CloudFront** | Hosting for collections, app, and site |
| **Workbox** | Service worker / PWA support in the app |
| **Bible Multi Converter** | External Java tool used by collector for format conversion |
| **@xmldom/xmldom + xpath** | XML parsing in collector for USX processing |


## File Structure & Entry Points

```
fetch_platform/
├── .bin/                    # Shell scripts for build, dev, publish, and tooling
│   ├── setup                # Full dev environment setup (npm ci + build all)
│   ├── setup_node           # Downloads project-scoped Node.js v25.8.1
│   ├── build_*              # Build scripts per workspace
│   ├── serve_*              # Dev servers (app, collection, site)
│   ├── audit_*              # Test, lint, type-check scripts
│   ├── test_collector       # Wipes and rebuilds a test collection end-to-end
│   ├── publish_*            # Publish scripts per workspace (S3 + npm)
│   ├── publish.ts           # Node.js S3/CloudFront publish utility
│   ├── collector             # Shortcut to run collector CLI
│   ├── switch_collections   # Swap main/alt test collections
│   └── upgrade              # Upgrade all workspace dependencies
├── app/                     # Vue 3 Bible reading app
│   ├── src/
│   │   ├── init.ts          # App bootstrap (Vue, Vuetify, collection loading)
│   │   ├── comp/            # Vue components (AppRoot, ContentInstance, NavPanel, etc.)
│   │   ├── services/        # State management, utilities
│   │   ├── css/             # Global styles
│   │   └── index.pug        # HTML template
│   └── vite.config.ts       # Vite config with Vue, Vuetify, SVG, Workbox plugins
├── client/                  # Core library for accessing collections
│   └── src/
│       ├── index.ts         # Public API exports
│       ├── client.ts        # FetchClient class (main entry point for consumers)
│       ├── collection/      # FetchCollection, BibleCollection classes
│       ├── book/            # BibleBook, HTML/TXT/USFM/USX access
│       ├── assets/          # Types, request handler, license filtering
│       │   └── shared_types.ts  # Symlink from collector/src/parts/shared_types.ts
│       ├── css/             # Client CSS (verse styling, etc.)
│       └── other/           # Search interfaces
├── collector/               # Node CLI for managing collections
│   └── src/
│       ├── index.ts         # yargs CLI definition
│       ├── commands/        # CLI commands (setup, discover, download, process, serve, publish)
│       ├── integrations/    # Source-specific adapters (eBible, DBL)
│       ├── parts/           # Core modules (manifest, indexes, shared_types)
│       ├── resources/       # Gloss, notes processing
│       └── data/            # Static data (population, cross-references)
├── converters/
│   ├── usx-to-json/         # USX XML → JSON (HTML or plain text per verse)
│   │   └── src/html.ts, txt.ts, common.ts, elements.ts
│   ├── reverse-usx/         # Normalize versification to standard 66-book structure
│   └── adaptations/         # Custom transformation utilities
├── enhancer/                # Embeds Bible references in third-party pages
│   └── src/
│       ├── enhance.ts       # BibleEnhancer class
│       ├── markup.ts        # Reference detection and HTML manipulation
│       └── styles.sass      # Modal/popup styles
├── search/                  # Full-text search using flexsearch
│   └── src/
│       ├── main.ts          # BibleIndex class
│       ├── strip.ts         # HTML stripping for indexing
│       └── index.ts         # Public exports
├── references/              # Bible reference parsing and detection
│   └── src/
│       ├── passage.ts       # PassageReference class
│       ├── detect.ts        # Regex-based reference detection
│       ├── data.ts          # Book names, abbreviations, ordering
│       ├── last_verse.ts    # Versification data
│       └── *.test.ts        # Tests alongside source
├── site/                    # VitePress docs site (fetch.bible)
│   ├── src/                 # Markdown content, Vue components, assets
│   └── .vitepress/config.ts # VitePress configuration
├── branding/                # SVG icons (icon.svg, icon_quiet.svg, social.svg)
├── .private/                # Internal utilities (DBL integration, versification data, specs)
├── .vscode/                 # VS Code config (debug launch, vitest integration)
├── tsconfig_base.jsonc      # Base TypeScript config inherited by all workspaces
├── vitest.config.ts         # Vitest config (excludes collection dirs)
├── .eslintrc.js             # ESLint config (Vue, TypeScript, Pug support)
└── package.json             # Root workspace definition + devDependencies
```

### Where to start reading

- **Understanding the platform:** Start with `client/src/client.ts` → `collection/collection.ts`
  → `collection/bibles.ts` to see how consumers access data
- **Understanding the pipeline:** Start with `collector/src/index.ts` (CLI commands) →
  `commands/process.ts` → `parts/manifest.ts`
- **Understanding the app:** Start with `app/src/init.ts` → `comp/AppRoot.vue` →
  `comp/ContentInstance.vue`
- **Understanding Bible formats:** Start with `converters/usx-to-json/src/html.ts`


## Development Setup & Commands

### Prerequisites

Node.js is bundled in `.bin/`. Run `.bin/setup_node` to download it (Linux x64 only). All
commands use `.bin/node`, `.bin/npm`, `.bin/npx` — the project is self-contained.

### Initial setup

```bash
# Download project-scoped Node.js (only needed once, or after version bump)
.bin/setup_node

# Full setup: install modules, build all libraries, build test collection
# Takes 5-10 minutes on first run (downloads Bible translations)
.bin/setup
```

### Development servers

Run these in separate terminals:

```bash
# Serve the test collection (local HTTP server for collection data)
.bin/serve_collection

# Serve the Bible app (Vite dev server on port 8431)
.bin/serve_app

# Serve the documentation site (VitePress dev server)
.bin/serve_site
```

### Building

```bash
# Build individual workspaces (follow dependency order if rebuilding from scratch)
.bin/build_references       # Must be first — client and converters depend on it
.bin/build_client           # Needed by app, enhancer, and collector
.bin/build_converters       # Loops through all converter subdirectories
.bin/build_search           # Needed by app
.bin/build_enhancer
.bin/build_collector
.bin/build_app              # Production build (vite build)

# Build client API docs for the site
.bin/build_client_docs
```

### Testing, linting, and type checking

```bash
# Run tests (vitest, CWD is collection/ for collector tests)
.bin/audit_test

# Lint everything (ESLint, needs 4GB heap)
.bin/audit_lint

# Type check all workspaces (tsc + vue-tsc)
.bin/audit_types
```

### Collection management

```bash
# Run collector commands
.bin/collector setup
.bin/collector discover ebible <id>
.bin/collector discover dbl <id>
.bin/collector download <translation_id>
.bin/collector process
.bin/collector glosses
.bin/collector notes
.bin/collector crossref
.bin/collector manifest
.bin/collector serve

# Rebuild test collection from scratch
.bin/test_collector

# Swap between main and alternate test collections
.bin/switch_collections
```

### Publishing

Publishing deploys to AWS S3 + CloudFront. Each publish script rebuilds dependencies first.
Deployment config is stored in `<workspace>/.deployments/<domain>.yaml`.

```bash
.bin/publish_app            # Builds refs → search → client → app, publishes to S3 + npm
.bin/publish_site           # Publishes docs site
.bin/publish_client         # Publishes client to npm
.bin/publish_collector      # Publishes collector to npm
# etc. — see .bin/publish_* scripts
```

### Upgrading dependencies

```bash
.bin/upgrade                # Runs npm-check-updates on all workspaces
```


## Code Style & Conventions

### Formatting

- **Indentation:** 4 spaces
- **Semicolons:** Never (enforced by ESLint)
- **Quotes:** Single quotes for code strings, double quotes for UI-displayed text, curly quotes
  left as-is
- **Trailing commas:** Always on multiline (comma-dangle: always-multiline)
- **Max line length:** 100 characters (warning, URLs and template literals exempt)
- **Type annotations:** No space between colon and type (e.g., `name:string`, not `name: string`)
- **Import spacing:** `import {a, b} from 'x'` (no space padding in braces)
- **Empty lines:** Leave an empty line at the start and end of each file

### Naming

- **Variables and functions:** `snake_case`
- **Classes:** `CamelCase`
- **Vue props:** `snake_case` (enforced by ESLint rule `vue/prop-name-casing`)
- **File names:** `snake_case.ts` for source, `CamelCase.vue` for Vue components

### Code patterns

- **No inline if statements** — always put the return/continue/break on a new line
- **Comments:** At least one-line comment for every function/class, and before each code chunk
- **Modules:** All packages use `"type": "module"` (ESM everywhere)
- **Strict TypeScript:** `strict: true` plus additional strictness flags
  (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, etc.)
- **Vue components:** Use `<template lang="pug">` and `<style lang="sass" scoped>`
- **State management:** Reactive objects in `services/state.ts` (no Vuex/Pinia)
- **Path aliases:** `@` maps to `app/src/` in the app workspace

### Architectural patterns

- **Shared types:** Defined once in `collector/src/parts/shared_types.ts`, symlinked into
  `client/src/assets/shared_types.ts`
- **Build outputs:** Libraries produce ESM (with types), CJS bundle, and sometimes IIFE bundle
- **Client CSS:** Separate stylesheet (`client.css`) for Bible content styling
- **Collector commands:** Each command is a separate module in `collector/src/commands/`
- **Source integrations:** External Bible source adapters live in `collector/src/integrations/`


## Common Tasks & Examples

### Add a new collector command

1. Create `collector/src/commands/my_command.ts` with an exported async function
2. Register it in `collector/src/index.ts` (yargs command definition)
3. Rebuild: `.bin/build_collector`

### Add a new Bible source integration

1. Create `collector/src/integrations/my_source.ts`
2. Implement the discover/download interface matching existing integrations (see `ebible.ts`)
3. Register in the discover and download commands

### Modify how Bible content is rendered

1. For HTML output format: edit `converters/usx-to-json/src/html.ts` and `elements.ts`
2. For client-side rendering: edit `client/src/book/html.ts`
3. For app display: edit `app/src/comp/ContentInstance.vue`
4. Rebuild affected packages in dependency order

### Add a Vue component to the app

1. Create `app/src/comp/MyComponent.vue` with `<template lang="pug">` and
   `<style lang="sass" scoped>`
2. Import and use in parent component
3. Dev server will hot-reload automatically

### Modify the client API

1. Edit source in `client/src/`
2. Export new public types/classes from `client/src/index.ts`
3. Rebuild: `.bin/build_client`
4. If types changed, also rebuild `client_docs`: `.bin/build_client_docs`

### Update shared types

1. Edit `collector/src/parts/shared_types.ts` (the canonical source)
2. The client gets it via symlink automatically
3. Rebuild both collector and client


## Testing & Quality

### Test framework

- **vitest** for unit and integration tests
- Tests live alongside source files as `*.test.ts` (e.g., `passage.test.ts`, `detect.test.ts`)
- The `references/` package has the most comprehensive test coverage

### Running tests

```bash
# Interactive watch mode (default)
.bin/audit_test

# Pass vitest args (e.g., run once)
.bin/audit_test run

# Run a specific test file
.bin/audit_test run references/src/passage.test.ts
```

**Important:** Tests run with CWD set to `collection/` because collector tests need access to
collection data. The vitest config excludes `collection/` and `collection_official/` directories
from file watching to avoid OS errors from too many files.

### Type checking

```bash
.bin/audit_types
```

Checks all workspaces sequentially: collector, client, enhancer, converters/usx-to-json,
references (with `tsc`), then app and site (with `vue-tsc`).

### Linting

```bash
.bin/audit_lint
```

Uses ESLint with a 4GB heap allocation. Key enforced rules:
- No semicolons
- 4-space indentation
- 100-char line limit
- `eqeqeq` (strict equality)
- No `eval`
- No `console.log` (only `warn`, `error`, `info`, `debug`)
- Vue 3 + Pug best practices
- TypeScript strict type checking rules

### VS Code integration

vitest is configured in `.vscode/settings.json` to use `.bin/audit_test` as its command line,
so the VS Code test runner works out of the box.


## Troubleshooting & Known Issues

### Collection directory errors during testing

vitest will error with "too many open files" if it tries to watch the collection directories.
This is handled by excluding `**/collection` and `**/collection_official` in `vitest.config.ts`.
If you add a new collection directory, add it to the exclusion list.

### ESLint memory issues

The lint script sets `NODE_OPTIONS="--max-old-space-size=4096"` because ESLint with TypeScript
type-checking enabled consumes a lot of memory. If linting crashes, increase this value.

### Bible Multi Converter (Java dependency)

The collector's `process` command uses an external Java tool (Bible Multi Converter) downloaded
during `collector setup`. It's stored in `collector/bmc/` (gitignored). If processing fails,
ensure Java is installed and the BMC jar was downloaded.

### Shared types symlink

`client/src/assets/shared_types.ts` is a symlink to `collector/src/parts/shared_types.ts`. If
this symlink breaks (e.g., after cloning on Windows), recreate it. The canonical source is always
the collector's copy.

### Build order matters

Libraries must be built in dependency order. If you get import errors after a clean checkout:
1. `.bin/build_references` (no dependencies)
2. `.bin/build_converters` (depends on references)
3. `.bin/build_client` (depends on references)
4. `.bin/build_search` (no library dependencies)
5. `.bin/build_enhancer` (depends on client)
6. `.bin/build_collector` (depends on references, converters)
7. `.bin/build_app` (depends on client, search)

Or just run `.bin/setup` to do it all correctly.

### Node.js version

The project bundles its own Node.js (currently v25.8.1) in `.bin/nodejs/`. All `.bin/` scripts
use this version via the symlinks. If you see unexpected behavior, ensure `.bin/setup_node` has
been run.

### `exactOptionalPropertyTypes` TypeScript flag

This strict flag means `{a: undefined}` is not the same as `{}`. When working with optional
properties, omit the key entirely rather than setting it to `undefined`.

### Quiet app variant

There is a "quiet" variant of the app (simplified UI) controlled by `.private/quiet.md`. Build
with `.bin/build_app_quiet` and publish with `.bin/publish_quiet`.


## Notable Dependencies

### flexsearch (v0.8.205)

Used in the `search` package. Version 0.8.x had significant API changes from 0.7.x (the
`Document` type replaced `Index` for structured data). The project uses `Document` with an
`en` (English) language preset. Adding support for other languages requires importing
additional flexsearch presets.

### @xmldom/xmldom + xpath

Used in the collector for parsing USX (XML) documents. This is a pure-JS DOM implementation
(no browser needed). Note that `@xmldom/xmldom` is the maintained fork of the original
`xmldom` package.

### Vuetify 3

Material Design 3 component library for the app. Uses tree-shaking via `vite-plugin-vuetify`.
Components use the `v-` prefix. Theming is configured in `app/src/init.ts`.

### Workbox (via rollup-plugin-workbox)

Generates the service worker for the PWA app. Uses `StaleWhileRevalidate` strategy for
collection data (external origins) and precaching for app assets.

### sass (Dart Sass)

Used for stylesheets in client, enhancer, and app. The `.sass` indented syntax (not `.scss`)
is preferred throughout the project.

### Bible Multi Converter

An external Java tool (JAR file) downloaded during collector setup. Used to convert between
USFM and USX formats. Not a Node.js dependency — requires a JRE to be installed on the system.

### cldr-localenames-full / cldr-misc-full

Unicode CLDR data used by the collector for language name localization and script/direction
metadata.


## Performance & Debugging

### App performance

- The app supports viewing 1-3 translations side by side. Each translation chapter is a
  separate HTTP request to the collection CDN
- Service worker caches collection data using StaleWhileRevalidate to avoid repeated downloads
- Search indexing (`BibleIndex`) runs asynchronously in batches to avoid blocking the UI
- The app targets ES2015 browsers; CSS targets Safari 10+

### Collector performance

- The publish script (`publish.ts`) uses a concurrent upload queue (limit 10) for S3 uploads
- Processing translations involves shelling out to the Java-based Bible Multi Converter,
  which can be slow for large translations
- The collection can contain thousands of files; the vitest watcher is configured to exclude
  collection directories to avoid file descriptor exhaustion

### Debugging

- VS Code launch config is set up to debug the client CJS bundle
  (`client/dist/cjs/index.js`)
- All esbuild outputs include sourcemaps (`--sourcemap`)
- The app's Vite config enables CSS source maps in dev mode
- The collector outputs colored terminal output using `ansi-colors`
- Use `.bin/serve_collection` + `.bin/serve_app` for local end-to-end testing


## Future Improvements

- **Search language support:** Currently only English preset in flexsearch — needs additional
  language presets for the many supported translations
- **Service worker caching strategy:** There is a TODO in the app's Vite config about checking
  collection updates periodically rather than every time
- **Converters/adaptations:** The adaptations package is minimal and may be expanded for
  custom transformations
- **Typst output:** `converters/usx-to-json/src/typst.ts` suggests print/PDF output support
  is being explored
