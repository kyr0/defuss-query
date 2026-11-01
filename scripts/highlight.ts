/**
 * Why: syntax highlighting for the code examples on the docs site, computed
 * by shiki when `make docs` runs instead of in the visitor's browser. The page
 * ships the colored spans as static markup: no highlighter download, no flash
 * of plain code, no extra CDN script. VERIFIED: the smallest browser build of
 * shiki that covers this page (four grammars, two themes, the JavaScript regex
 * engine) is 704 kB minified and 120 kB gzipped; the library the page
 * documents is about 4 kB. scripts/docs-e2e.ts runs highlightPage() again
 * and fails while the page differs from its result, so an edited example
 * cannot stay plain or stale.
 *
 * What gets highlighted in docs/index.html:
 * - `<pre data-lang="L"><code>…</code></pre>`: one block, written back as one
 *   `<span>` per line, the defuss-shadcn code-block format the copy buttons read.
 * - `<div class="mockup-code" data-lang="L">`: its `<pre><code>` lines are
 *   highlighted as one text, so the body of a `<script>` line gets JavaScript
 *   colors, and each line goes back into its own `<pre>`.
 * - the playground snippets: the `run` arrow functions of `PRESETS` in
 *   docs/assets/site.js, head removed and dedented, written as
 *   `<template data-snippet="id">` between the snippets markers.
 *
 * Editing an example: replace the content of its `<code>` with plain escaped
 * text, one source line per text line, and run `make docs`. Re-running is a
 * no-op, because the text of highlighted markup is its source.
 *
 * Every token carries both theme colors as `--shiki-light` and `--shiki-dark`;
 * site.css picks one per surface. VERIFIED: with these two themes every token
 * on the page has at least 4.5:1 contrast on its background in both color
 * schemes (scripts/docs-e2e.ts measures it). The plain github-light and
 * github-dark themes fall to 3.2:1 and 3.1:1.
 */
import { createHighlighter, type ThemedToken } from "shiki";
import ts from "typescript";

const THEMES = { light: "github-light-high-contrast", dark: "github-dark-default" } as const;
const LANGS = ["html", "js", "ts", "sh"] as const;
type Lang = (typeof LANGS)[number];

let highlighter: ReturnType<typeof createHighlighter> | undefined;

/** Highlighted markup for each line of `code`. */
async function highlightLines(code: string, lang: string): Promise<string[]> {
  if (!LANGS.includes(lang as Lang)) throw Error(`data-lang="${lang}" is not one of ${LANGS.join(", ")}`);
  highlighter ??= createHighlighter({ themes: Object.values(THEMES), langs: [...LANGS] });
  const { tokens } = (await highlighter).codeToTokens(code, { lang: lang as Lang, themes: THEMES, defaultColor: false });
  return tokens.map(lineMarkup);
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (text: string) =>
  text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, name: string) =>
    name.startsWith("#") ? String.fromCodePoint(Number(name[1] === "x" || name[1] === "X" ? `0${name.slice(1)}` : name.slice(1))) : (ENTITIES[name] ?? match),
  );

/** One line of tokens as spans; neighbors with the same colors share a span. */
function lineMarkup(tokens: ThemedToken[]): string {
  let markup = "";
  let style = "";
  let text = "";
  for (const token of tokens) {
    const next = Object.entries(token.htmlStyle ?? {})
      .map(([name, value]) => `${name}:${value}`)
      .join(";");
    if (next !== style && text) {
      markup += `<span style="${style}">${escape(text)}</span>`;
      text = "";
    }
    style = next;
    text += token.content;
  }
  return text ? `${markup}<span style="${style}">${escape(text)}</span>` : markup;
}

/**
 * The source text of code markup: tags dropped, entities decoded. With
 * `spanPerLine`, each top-level `<span>` ends a line (the code-block format);
 * otherwise the markup is a single line. Only `<span>` tags may occur; a `<`
 * that starts no tag is text, as in HTML.
 */
function sourceOf(markup: string, spanPerLine: boolean): string {
  let depth = 0;
  let text = "";
  for (const [tag, close, name, chunk] of markup.matchAll(/<(\/?)([a-z]+)[^>]*>|([^<]+|<)/g)) {
    if (chunk !== undefined) text += decode(chunk);
    else if (name !== "span") throw Error(`unexpected <${name}> in a highlighted code example: ${tag}`);
    else if (!close) depth++;
    else if (--depth === 0 && spanPerLine) text += "\n";
  }
  return spanPerLine ? text.replace(/\n$/, "") : text;
}

/** `text.replace` with an async replacer, applied to the matches in order. */
async function replaceAsync(text: string, pattern: RegExp, replace: (...groups: string[]) => Promise<string>): Promise<string> {
  let result = "";
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    result += text.slice(last, match.index) + (await replace(...match));
    last = match.index + match[0].length;
  }
  return result + text.slice(last);
}

/** The playground snippet text of `run`, as site.js used to derive it at runtime: no `() =>` head, dedented. */
function snippetText(run: string, context: string | undefined): string {
  let body = run.replace(/^\(\)\s*=>\s*/, "");
  if (body.startsWith("{")) body = body.slice(1, -1).replace(/^\n/, "").replace(/\s+$/, "");
  const lines = body.split("\n");
  const indents = lines.slice(1).filter((line) => line.trim()).map((line) => /^ */.exec(line)![0].length);
  const indent = indents.length ? Math.min(...indents) : 0;
  const code = [lines[0].trim(), ...lines.slice(1).map((line) => line.slice(indent))];
  return [...(context ? context.split("\n") : []), ...code].join("\n");
}

/** `{ id, text }` for each entry of `const PRESETS = [...]` in site.js, read from its syntax tree. */
export function presetSnippets(siteJs: string): { id: string; text: string }[] {
  const file = ts.createSourceFile("site.js", siteJs, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let presets: ts.ArrayLiteralExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === "PRESETS" && node.initializer && ts.isArrayLiteralExpression(node.initializer)) presets = node.initializer;
    else ts.forEachChild(node, visit);
  };
  visit(file);
  if (!presets) throw Error("docs/assets/site.js declares no `const PRESETS = [...]`");
  return presets.elements.map((element) => {
    const props = new Map(
      ts.isObjectLiteralExpression(element) ? element.properties.filter(ts.isPropertyAssignment).map((prop) => [prop.name.getText(file), prop.initializer] as const) : [],
    );
    const id = props.get("id");
    const run = props.get("run");
    const context = props.get("context");
    if (!id || !ts.isStringLiteral(id) || !run || !ts.isArrowFunction(run) || (context && !ts.isStringLiteralLike(context)))
      throw Error(`docs/assets/site.js: a preset needs a string id, an arrow function run and an optional string context: ${element.getText(file).slice(0, 80)}`);
    return { id: id.text, text: snippetText(run.getText(file), context?.text) };
  });
}

/** docs/index.html with every code example highlighted and the playground snippets regenerated from site.js. */
export async function highlightPage(html: string, siteJs: string): Promise<string> {
  // Mockup windows first: their lines are highlighted together, then written back line by line.
  html = await replaceAsync(html, /(<div class="[^"]*\bmockup-code\b[^"]*"[^>]*\bdata-lang="([^"]+)"[^>]*>)([\s\S]*?)(<\/div>)/g, async (_, open, lang, inner, close) => {
    const pre = /(<pre\b[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g;
    const lines = await highlightLines([...inner.matchAll(pre)].map((match) => sourceOf(match[2], false)).join("\n"), lang);
    let index = 0;
    return open + inner.replace(pre, (_match, start: string, _code: string, end: string) => start + lines[index++] + end) + close;
  });
  html = await replaceAsync(html, /(<pre\b[^>]*\bdata-lang="([^"]+)"[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g, async (_, open, lang, inner, close) => {
    const lines = await highlightLines(sourceOf(inner, true), lang);
    return open + lines.map((line) => `<span>${line}</span>`).join("") + close;
  });
  const markers = /(<!-- snippets:start[^>]*-->\n)[\s\S]*?(<!-- snippets:end -->)/;
  if (!markers.test(html)) throw Error("docs/index.html has no <!-- snippets:start --> ... <!-- snippets:end --> markers");
  const templates: string[] = [];
  for (const { id, text } of presetSnippets(siteJs)) {
    const lines = await highlightLines(text, "js");
    templates.push(`<template data-snippet="${id}">${lines.map((line) => `<span>${line}</span>`).join("")}</template>\n`);
  }
  return html.replace(markers, (_, start: string, end: string) => start + templates.join("") + end);
}
