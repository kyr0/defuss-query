# defuss-query

A tiny, jQuery-shaped DOM API on top of the [defuss-morph](https://www.npmjs.com/package/defuss-morph) engine. `df$` selects elements with native CSS selectors, returns a real Array of them, and sends every structural write through morph's DOM diffing, so updates patch the page in place instead of rebuilding it.

Documentation site with a live demo: <https://query.defuss.org/>. Architecture and design decisions: [ARCH.md](ARCH.md). The API reference for coding agents ships in the package as [SKILL.md](SKILL.md).

## Why

Direct DOM traversal and mutation need neither jQuery nor a framework. `df$(".card")` gives you a chainable snapshot Array of real elements with the familiar verbs (`find`, `addClass`, `attr`, `on`, `append`, `html` and more). Content writes go through `defuss-morph`, which keeps the nodes it can match: their identity, their event listeners and the values users typed into them (unless the new content sets a value). Focus stays on a matched element that keeps its position. Two `<script>` tags in any HTML page are enough; there is no build step.

Features:

- Native CSS selectors with a chainable, jQuery-shaped API over modern DOM APIs
- One callable `df$` that is both the query factory and the morph namespace
- Content updates by DOM diffing (keyed and id-aware, state-preserving) through `defuss-morph`
- Explicit async transitions (`fade`, `slide`, custom styles)
- CDN bundles plus ESM and CommonJS builds for package managers
- Small: <!-- gzip-size:start -->4.2 kB<!-- gzip-size:end --> minified and gzipped (`dist/all.min.js`, without the morph engine)
- <!-- coverage:start -->100% statement and 100% line coverage of `src/` from node and real-Chromium tests<!-- coverage:end -->
- Written in TypeScript

**This is a deliberately specified subset, not a drop-in jQuery replacement.** Native CSS selectors only; no selector engine, AJAX layer, Deferred implementation, component runtime, reactive store or effects framework.

## Quick start from a CDN, with the global `df$`

Load morph first, then query, right before the closing `</body>` tag. Both bundles register the global `window.df$`:

```html
<body>
  <div id="app">Old content</div>

  <script type="module" src="https://cdn.jsdelivr.net/npm/defuss-morph@latest/dist/all.min.js"></script>
  <script type="module" src="https://cdn.jsdelivr.net/npm/defuss-query@latest/dist/all.min.js"></script>
  <script type="module">
    // html() morphs instead of assigning innerHTML. With a transition it returns a Promise.
    await df$("#app").html("<p>Hello from the CDN</p>", {
      transition: { type: "fade", duration: 200 },
    });

    df$("#app").find("p").on("click", function () {
      df$(this).text("Saved");
    });
  </script>
</body>
```

The application script is a module script as well: module scripts run in document order after parsing, so it sees the installed `df$`. An ordinary inline `<script>` placed after them runs earlier, before the modules have executed.

- **Good for:** prototyping (also with AI agents), demos and testing in the browser.
- **Drawbacks:** needs the network, depends on the CDN, no bundler optimizations.

## CDN with explicit ESM imports

```html
<body>
  <div id="app">Old content</div>

  <script type="module">
    await import("https://cdn.jsdelivr.net/npm/defuss-morph@latest/dist/all.min.js");
    const { df$ } = await import("https://cdn.jsdelivr.net/npm/defuss-query@latest/dist/all.min.js");

    df$("#app").html("<p>Hello from the CDN</p>").addClass("ready");
  </script>
</body>
```

The query browser module has **no runtime imports and does not embed morph**; the sequential `await import()` calls define the initialization order.

## Self-hosted files, without a CDN

Fetch both packages once and copy their browser bundles into your assets. `npm pack` downloads a package tarball without installing it:

```bash
npm pack defuss-morph defuss-query
tar -xzf defuss-morph-*.tgz && cp package/dist/all.min.js assets/js/defuss-morph.min.js && rm -r package
tar -xzf defuss-query-*.tgz && cp package/dist/all.min.js assets/js/defuss-query.min.js && rm -r package
```

```html
<body>
  <div id="app">Old content</div>

  <script type="module">
    await import("./assets/js/defuss-morph.min.js");
    const { df$ } = await import("./assets/js/defuss-query.min.js");

    df$("#app").html("<p>Hello from local assets</p>");
  </script>
</body>
```

The global `window.df$` setup from the quick start works the same way with local files.

- **Good for:** offline and air-gapped environments, and pinning the exact version you ship.
- **Drawbacks:** manual updates, no bundler optimizations.

## Install with a package manager

A package manager gives you version pinning, offline installs and production builds with tree-shaking and minification. We recommend [`bun`](https://bun.sh) as package manager and script runner:

```bash
bun add defuss-query defuss-morph
# or: npm install defuss-query defuss-morph
```

`defuss-morph` is the **single runtime peer dependency** (`^0.2.0`). The library entry has no side effects on import: it registers no global and does not read `document`, so server-side imports are safe (DOM operations still need a document).

```ts
import df$, { type DfQuery } from "defuss-query";

const buttons: DfQuery<HTMLButtonElement> = df$("button");

buttons.prop("disabled", false).on("click", function (event) {
  console.log(this.disabled, event.clientX);
});

// the morph engine is on the same namespace:
df$.morph(document.body, "<main>Rendered by the peer dependency</main>");
```

ESM and CommonJS are shipped, each with its own declarations:

```js
const { df$ } = require("defuss-query");
```

To inject your own morph instance instead of the peer import, use the core entry: `import { createDf$ } from "defuss-query/core"` and call `createDf$(morph)`.

## Browser global and load order

The query browser entry **upgrades** the plain object that the morph bundle registered as `window.df$` into a callable function. It keeps the object's own string and symbol properties and the identities of morph's functions:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/defuss-morph@latest/dist/all.min.js"></script>
<script type="module" src="https://cdn.jsdelivr.net/npm/defuss-query@latest/dist/all.min.js"></script>
<script type="module">
  df$("#app").html("<p>Hello from the CDN</p>");

  // a reference to the plain morph object taken before the upgrade stays a
  // plain object, but its morph functions keep working:
  const { morph, updateDomWithVdom } = window.df$;
</script>
```

**Load order:** load morph first. Query first works too: selectors are available at once, and structural operations once morph has loaded. That order needs **defuss-morph 0.1.1 or later**, whose global loader keeps a function-valued `df$` (older morph builds overwrite it). The intrinsic `Function` fields and query's `fn`, `dom` and `queryVersion` slots are reserved. A second query bundle reuses the installed function, and an unrelated existing `df$` function makes the bundle throw instead of overwriting it.

`dist/global.min.js` is a **classic script** that installs `globalThis.df$`, for script loaders that need deterministic execution without module ordering:

```html
<script type="module">
  await import("https://cdn.jsdelivr.net/npm/defuss-morph@latest/dist/all.min.js");
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/defuss-query@latest/dist/global.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  df$("#app").text("Classic callable global installed");
</script>
```

TypeScript types for the global are opt-in, so normal library imports never add globals:

```ts
import type {} from "defuss-query/global";
df$("button").prop("disabled", false);
df$.queueCallback(() => console.log("microtask"))();
```

## Examples

Zero-build pages to run locally: `make serve` (or `bun run serve`) serves the repository at <http://127.0.0.1:8080>, with the example at `/` and the documentation site at `/docs/`.

| Example | What it shows |
| --- | --- |
| [`examples/index.html`](examples/index.html) | The callable `df$` end to end: a keyed task list whose reorders keep node identity, user text rendered literally, native FormData with duplicate names and the submitter, and an awaited transition |
| [`docs/demo/`](docs/demo/index.html) | The demo of the documentation site: keyed morphing that keeps focus and caret while the list reorders, native events and forms, with a live inspector of kept and created nodes |

## Deliberate limitations

**Not a drop-in jQuery replacement:** native CSS selectors only, so an invalid selector throws instead of being handled by a selector engine. No AJAX layer, Deferred, component runtime, reactive store or effects framework.

**Events are native:** `.on()` calls `addEventListener` on each target, so listener order, `stopPropagation()`, non-bubbling events (`toggle`, `load`, `error` and others) and `event.currentTarget` behave exactly as without the facade. Morphing an element in place keeps its listeners; when morph removes or replaces the element, or `.remove()` detaches it, its `.on()` listeners are removed. `.off()` removes only listeners added by `.on()`. The only supported listener option is `capture`; `.trigger()` dispatches a `CustomEvent`, not trusted input.

**Shadow boundaries:** queries do not pierce shadow roots; pass an explicit `ShadowRoot` as the context instead. Content writes follow morph's rule: a normal element with an open shadow root is written through its shadow root, while custom-element hosts keep light-DOM targeting.

**Engine limitations stay inherited:** reconciliation of arbitrary SVG, MathML and `<template>` content follows defuss-morph. Morph moves keyed nodes with `insertBefore`, and the browser drops focus from an element that is moved: when a reorder moves the focused element, the element survives with its typed value, but focus goes to `<body>` (verified in Chromium; elements that keep their position keep focus and caret).

**No sanitizer:** `.text()` renders strings literally, but `.html()` and markup passed to `df$()` are parsed as HTML. Never interpolate untrusted strings into markup; use `.text()`, VNode text or a sanitizer of your choice.

## Size

| File | Size | Gzipped | Purpose |
| --- | ---: | ---: | --- |
| `index.js` + modules | See files | n/a | ESM library build, used when installing with npm or bun |
| `cjs/index.js` + modules | See files | n/a | CommonJS build |
<!-- bundle-size:start -->
| `all.js` | 30.2 kB | 8.6 kB | Readable browser ESM + global installation; for CDN-based usage with debugging |
| `all.min.js` | 11.3 kB | **4.2 kB** | Minified browser ESM + global installation (Pareto-optimal when no bundler is used) |
| `global.min.js` | 11.1 kB | **4.1 kB** | Minified classic script; installs `globalThis.df$` without a module/defer race |
<!-- bundle-size:end -->

Sizes describe **query only**, without the separately loaded morph engine; 1 kB is 1,000 bytes. The verifier enforces the release budgets: `all.min.js` at most 4,608 bytes gzipped and 13,000 bytes raw, `global.min.js` at most 4,608 bytes gzipped. `dist/stats.json` holds the raw, gzip and Brotli sizes.

## Development

`make` lists the verbs. `make setup` installs the locked dependencies and Chromium; `make verify` runs lint, tests, coverage and the end-to-end checks (packed npm consumer, documentation site in Chromium, artifact gate), the same steps `bun run check` runs before `npm publish`. `make docs` refreshes the documentation site's copies of the built bundles and its syntax highlighting. Maintainer and agent rules: [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
