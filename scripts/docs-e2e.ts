#!/usr/bin/env bun
/**
 * Why: the documentation site (docs/) is part of what this repository ships,
 * and it makes claims: sizes, focus and value preservation, literal text.
 * This script serves docs/ on loopback and drives it in real Chromium, the
 * way a visitor does, so a claim that stops holding fails the gate.
 *
 * It fails on console errors, page errors, failed requests and HTTP errors
 * (a wrong Subresource Integrity hash surfaces as a console error). It also
 * fails while docs/assets differs from the built bundles (`make docs`), the
 * highlighted code examples differ from a fresh shiki run, or a `data-stat`
 * element shows a number other than dist/stats.json. Syntax colors are
 * checked as rendered: every token shows its theme color with at least 4.5:1
 * contrast on its background (WCAG AA for normal text), in both schemes.
 *
 * Playwright drives the pages directly instead of vitest's browser mode:
 * the site needs a real top-level window with its own demo iframe.
 * VERIFIED: the first run of this script caught a docs claim that did not
 * hold (focus survives keyed reorders); README and SKILL.md now state the
 * inherited limitation instead.
 * Screenshots and report.json land in output/docs-e2e/.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type ConsoleMessage, type Frame, type Page } from "playwright";
import { DOC_ASSETS, HIGHLIGHTED } from "./docs.ts";
import { highlightPage } from "./highlight.ts";
import { serve } from "./server.ts";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "output/docs-e2e");
const stats = JSON.parse(readFileSync(resolve(root, "dist/stats.json"), "utf8"));
const passed: string[] = [];
const failures: string[] = [];
const check = (condition: unknown, claim: string, detail = "") => {
  if (condition) passed.push(claim);
  else failures.push(detail ? `${claim}: ${detail}` : claim);
};

// ---- static checks: the site serves what the build produced --------------------------------------------------------
for (const [source, copy] of DOC_ASSETS) {
  const same = readFileSync(source).equals(readFileSync(copy));
  check(same, `${copy.slice(root.length + 1)} is a copy of ${source.slice(root.length + 1)}`, "stale; run `make docs`");
}
{
  const html = readFileSync(HIGHLIGHTED.page, "utf8");
  // A "<" that starts no tag is code text, as in HTML; the first highlighter dropped it.
  const lone = await highlightPage('<pre data-lang="js"><code>if (a < 3) go()</code></pre>\n<!-- snippets:start -->\n<!-- snippets:end -->', "const PRESETS = [];");
  check(lone.includes("&lt;") && !lone.includes("< 3"), "the highlighter keeps a bare < in code as text");
  check((await highlightPage(html, readFileSync(HIGHLIGHTED.site, "utf8"))) === html, "docs/index.html holds the current shiki highlighting of its code examples and playground snippets", "stale; run `make docs`");
}
const pages = ["docs/index.html", "docs/demo/index.html"].map((name) => [name, readFileSync(resolve(root, name), "utf8")] as const);
for (const [name, html] of pages) {
  const versions = new Set([...html.matchAll(/defuss-shadcn@([\d.]+)\//g)].map((m) => m[1]));
  check(versions.size === 1, `${name} pins one defuss-shadcn release`, [...versions].join(", "));
  const tags = [...html.matchAll(/<link[^>]+cdn\.jsdelivr\.net[^>]*>/g)].map((m) => m[0]);
  check(tags.length > 0 && tags.every((tag) => /integrity="sha384-/.test(tag) && /crossorigin="anonymous"/.test(tag)), `${name} loads every CDN stylesheet with an SRI hash`);
}

/** The text a `data-stat` element must show: `version`, or `<file>.<bytes|gzip|brotli>` in a format. */
function expected(key: string, format: string | null): string | undefined {
  if (key === "version") return stats.version;
  const match = /^(.+)\.(bytes|gzip|brotli)$/.exec(key);
  const value = match ? stats.files[match[1]]?.[match[2]] : undefined;
  if (typeof value !== "number") return undefined;
  if (format === "kb") return `${(value / 1000).toFixed(1)} kB`;
  if (format === "bytes") return value.toLocaleString("en-US");
  return String(value);
}

function watch(page: Page, label: string) {
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") failures.push(`${label}: console error: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`${label}: page error: ${error.message}`));
  page.on("requestfailed", (request) => failures.push(`${label}: request failed: ${request.url()} (${request.failure()?.errorText})`));
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(`${label}: HTTP ${response.status()} for ${response.url()}`);
  });
}

const report = async (page: Page) =>
  page.$$eval("#report > div", (rows) => Object.fromEntries(rows.map((row) => [row.querySelector("dt")!.textContent, row.querySelector("dd")!.textContent ?? ""])));

async function runPreset(page: Page, id: string) {
  await page.click(`#presets [data-preset="${id}"]`);
  await page.waitForFunction((preset) => document.querySelector(`[data-preset="${preset}"]`)?.getAttribute("aria-pressed") === "true" && document.querySelectorAll("#report > div").length > 0, id);
  return report(page);
}

/**
 * Syntax colors as rendered: the token count, the tokens painted with the theme color their surface uses, the
 * lowest contrast against the nearest opaque background, and code blocks without tokens. A canvas converts every
 * CSS color (shadcn uses oklch) to sRGB bytes.
 */
const syntax = (page: Page) =>
  page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgba = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    };
    const luminance = (rgb: number[]) =>
      [0.2126, 0.7152, 0.0722].reduce((sum, weight, i) => {
        const c = rgb[i] / 255;
        return sum + weight * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      }, 0);
    const background = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const color = rgba(getComputedStyle(node).backgroundColor);
        if (color[3] === 255) return color;
      }
      return rgba(getComputedStyle(document.documentElement).backgroundColor);
    };
    const dark = document.documentElement.classList.contains("dark");
    const tokens = [...document.querySelectorAll<HTMLElement>(":is([data-lang], #preset-code) span[style]")];
    let painted = 0;
    let worst = { ratio: Number.POSITIVE_INFINITY, text: "" };
    for (const token of tokens) {
      const color = rgba(getComputedStyle(token).color);
      if (rgba(token.style.getPropertyValue(!dark && token.closest(".dq-face") ? "--shiki-light" : "--shiki-dark")).join() === color.join()) painted++;
      const [a, b] = [luminance(color), luminance(background(token))];
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < worst.ratio) worst = { ratio, text: token.textContent ?? "" };
    }
    const plain = [...document.querySelectorAll("pre[data-lang], [data-lang] > pre, .mk-code-block pre:not(:has(> #preset-code)), .dq-face pre, .dq-hero-code pre")]
      .filter((pre) => pre.textContent!.trim() !== "" && !pre.querySelector("span[style]"))
      .map((pre) => pre.outerHTML.slice(0, 80));
    return { tokens: tokens.length, painted, worst, plain };
  });

function checkSyntax(result: Awaited<ReturnType<typeof syntax>>, scheme: string) {
  check(result.plain.length === 0, `every code example is highlighted (${scheme})`, result.plain.join(" | "));
  check(result.tokens > 0 && result.painted === result.tokens, `every syntax token shows its theme color (${scheme})`, `${result.painted} of ${result.tokens}`);
  check(result.worst.ratio >= 4.5, `every syntax token has at least 4.5:1 contrast (${scheme})`, `${result.worst.ratio.toFixed(2)}:1 for "${result.worst.text}"`);
}

const demoStat = (frame: Frame, id: string) => frame.$eval(`#${id}`, (el) => el.textContent);
const rowNodes = (frame: Frame) => frame.$$eval("#tasks li[data-id]", (rows) => rows.map((row) => `${row.getAttribute("data-id")}:${row.getAttribute("data-node")}`).sort());

const { server, url } = await serve(resolve(root, "docs"), 0, "/index.html");
const browser = await chromium.launch();
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  // ---- desktop, light ----------------------------------------------------------------------------------------------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", permissions: ["clipboard-read", "clipboard-write"] });
  const page = await desktop.newPage();
  watch(page, "index");
  await page.goto(url, { waitUntil: "networkidle" });

  check(await page.evaluate(() => typeof (window as any).df$ === "function" && (window as any).df$.queryVersion), "the page runs on the callable df$ of the served bundle");
  check((await page.evaluate(() => (window as any).df$.queryVersion)) === stats.version, "df$.queryVersion equals the built version");
  check(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--background").trim() !== ""), "defuss-shadcn tokens are applied");
  const stale = await page.$$eval("[data-stat]", (els) => els.map((el) => ({ key: el.getAttribute("data-stat")!, format: el.getAttribute("data-format"), text: el.textContent!.trim() })));
  for (const { key, format, text } of stale) {
    const want = expected(key, format);
    check(want !== undefined && text === want, `data-stat="${key}" shows ${want}`, `shows "${text}"; write "${want}" into every element with data-stat="${key}"${format ? ` data-format="${format}"` : ""}`);
  }

  // the hero snippet runs as shown: html() keeps and reorders the keyed items, and the arrow listener writes "Saved"
  const heroCode = await page.$$eval(".dq-hero-code pre", (lines) => lines.map((line) => line.textContent).join("\n"));
  const heroApp = /<script type="module">\n([\s\S]*?)\n<\/script>$/.exec(heroCode)?.[1];
  check(heroApp, "the hero snippet ends with an application module script", heroCode);
  await page.evaluate(() => {
    const list = Object.assign(document.createElement("ul"), { id: "list", hidden: true, innerHTML: '<li key="a">A</li><li key="b">B</li>' });
    document.body.append(list);
    (window as any).heroItems = [...list.children];
  });
  await page.addScriptTag({ type: "module", content: heroApp ?? "" });
  await page.waitForFunction(() => document.querySelectorAll("#list li.ready").length === 2);
  const hero = await page.evaluate(() => {
    const [a, b] = (window as any).heroItems;
    const items = [...document.querySelectorAll<HTMLElement>("#list li")];
    const kept = items[0] === b && items[1] === a;
    items[0].click();
    const texts = items.map((item) => item.textContent);
    document.getElementById("list")!.remove();
    return { kept, texts };
  });
  check(hero.kept, "the hero snippet's html() keeps both <li> and reorders them");
  check(JSON.stringify(hero.texts) === '["Saved","A"]', "the hero snippet's click listener writes Saved into the clicked item", JSON.stringify(hero.texts));

  // tabs: click and arrow keys move selection and panels together
  await page.click("#tab-content");
  check(await page.evaluate(() => !document.getElementById("api-content")!.hidden && document.getElementById("api-select")!.hidden), "API tabs switch panels on click");
  await page.keyboard.press("ArrowRight");
  check(await page.evaluate(() => document.activeElement?.id === "tab-events" && !document.getElementById("api-events")!.hidden), "API tabs follow arrow keys");

  // playground: every snippet, with the outcome the page describes
  await page.locator("#playground").scrollIntoViewIfNeeded();
  let r = await runPreset(page, "chain");
  check((await page.textContent("#preset-code")) === 'df$("#dq-list li").addClass("hot").attr("data-seen", "yes")', "the playground shows the source of the snippet it runs", (await page.textContent("#preset-code")) ?? "");
  check(r["Elements created"] === "0" && r["Returned"].startsWith("DfQuery(3)"), "chain: setters return the selection and create nothing", JSON.stringify(r));
  r = await runPreset(page, "morph-reorder");
  check(r["Focus"]?.startsWith("kept"), "html() re-render keeps focus on the matched input", JSON.stringify(r));
  check(r["Typed value"] === '"typed by you"', "html() re-render keeps a typed value the markup does not set", JSON.stringify(r));
  check(r["Elements created"].startsWith("1:") && r["Elements removed"] === "0", "html() re-render creates only the new row", JSON.stringify(r));
  r = await runPreset(page, "inner-reorder");
  check(r["Focus"]?.startsWith("lost") && r["Elements kept"] === "0", "innerHTML rebuilds every element and loses focus", JSON.stringify(r));
  r = await runPreset(page, "text");
  check(await page.evaluate(() => document.querySelector("#dq-list li")!.textContent === "<b>not bold</b>" && !document.querySelector("#dq-list b")), "text() writes literal text", JSON.stringify(r));
  r = await runPreset(page, "append");
  await page.click("#sandbox .dq-toolbar button");
  check((await page.textContent("#sandbox .dq-toolbar button")) === "Clicked 1 times", "an inserted button keeps its on() listener", JSON.stringify(r));
  r = await runPreset(page, "transition");
  await page.waitForFunction(() => document.querySelector("#report dd")?.textContent?.startsWith("Promise, resolved"));
  r = await report(page);
  check(r["Elements created"] === "0" && (await page.$$eval("#dq-list li", (lis) => lis.map((li) => li.textContent).join())) === "Gamma,Beta,Alpha", "morph() with a transition returns a Promise and reorders in place", JSON.stringify(r));
  r = await runPreset(page, "species");
  check(r["Returned"] === '["Alpha","Beta","Gamma"]', "map() returns a plain Array", JSON.stringify(r));
  r = await runPreset(page, "form");
  check(r["Returned"] === '[["note",""],["tag","dom"],["tag","morph"]]', "form() returns native FormData entries", JSON.stringify(r));
  await page.screenshot({ path: resolve(out, "playground.png"), clip: (await page.locator("#playground").boundingBox())! });
  checkSyntax(await syntax(page), "light");

  // demo frame
  await page.locator("#demo").scrollIntoViewIfNeeded();
  const frame = page.frame({ url: /\/demo\/$/ })!;
  check(!!frame, "the demo frame loaded");
  await frame.waitForSelector("#tasks li[data-id]");
  check((await frame.evaluate(() => (window as any).df$.queryVersion)) === stats.version, "the demo runs on the served bundle");
  const first = await rowNodes(frame);
  await frame.click("#shuffle-once");
  check((await demoStat(frame, "stat-created")) === "0" && (await demoStat(frame, "stat-kept")) === "4", "a shuffle keeps every row element", `kept ${await demoStat(frame, "stat-kept")}`);
  check(JSON.stringify(await rowNodes(frame)) === JSON.stringify(first), "rows keep their node numbers across a shuffle");
  const title = frame.locator('#tasks li[data-id="3"] .task-title');
  await title.click();
  await title.press("End");
  await title.pressSequentially(" ok", { delay: 30 });
  const node = await frame.getAttribute('#tasks li[data-id="3"]', "data-node");
  await frame.click("#auto-shuffle");
  const renders = Number(await demoStat(frame, "stat-renders"));
  await frame.waitForFunction((n) => Number(document.getElementById("stat-renders")!.textContent) >= n + 2, renders, { timeout: 6000 });
  await frame.click("#auto-shuffle");
  const edited = await frame.$eval('#tasks li[data-id="3"]', (row) => ({ node: row.getAttribute("data-node"), value: (row.querySelector(".task-title") as HTMLInputElement).value }));
  check(edited.node === node && edited.value.endsWith(" ok"), "an edited row keeps its element and text across auto-shuffle renders", JSON.stringify({ before: node, ...edited }));
  await frame.fill("#new-title", "<b>literal</b>");
  await frame.click('#add-form button[value="done"]');
  check((await frame.inputValue('#tasks li[data-id="5"] .task-title')) === "<b>literal</b>" && !(await frame.$("#tasks b")), "a new task title stays literal text");
  const formOut = JSON.parse((await frame.textContent("#form-out"))!);
  check(JSON.stringify(formOut.entries) === JSON.stringify([["title", "<b>literal</b>"], ["action", "done"], ["tag", "dom"]]), "form(event.submitter) includes the submitter entry in tree order", JSON.stringify(formOut));
  check((await demoStat(frame, "stat-created")) === "1", "adding a task creates one row element");
  await frame.click('#tasks li[data-id="2"] [data-action="remove"]');
  check((await demoStat(frame, "stat-removed")) === "1" && (await frame.$('#tasks li[data-id="2"]')) === null, "removing a task removes one row element");
  await frame.click("#reverse");
  await frame.waitForFunction(() => document.querySelector("#log li")?.textContent?.includes("reversed with a fade"), undefined, { timeout: 5000 });
  check((await demoStat(frame, "stat-created")) === "0", "a reverse with a fade keeps every row element");
  await frame.click('#filters [data-filter="done"]');
  check(await frame.$$eval("#tasks li[data-id]", (rows) => rows.length > 0 && rows.every((row) => row.classList.contains("done"))), "the Done filter shows only done tasks");
  await frame.click('#filters [data-filter="all"]');
  await frame.click("#sort");
  const titles = await frame.$$eval("#tasks .task-title", (inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  check(JSON.stringify(titles) === JSON.stringify([...titles].sort((a, b) => a.localeCompare(b))), "Sort A to Z orders the rows", JSON.stringify(titles));
  await frame.click("#clear-done");
  check((await frame.$$("#tasks li.done")).length === 0, "Clear done removes the done tasks");

  // copy buttons write the visible code and the agent prompt to the clipboard
  await page.click('#install .mk-code-block-copy >> nth=0');
  check((await page.evaluate(() => navigator.clipboard.readText())).startsWith('<script type="module" src="https://cdn.jsdelivr.net/npm/defuss-morph@latest'), "a code block's copy button copies its visible tab");
  await page.click("#copy-prompt");
  check((await page.evaluate(() => navigator.clipboard.readText())).startsWith("Use defuss-query for the DOM code in this app"), "the prompt's copy button copies the prompt");

  // Restart reloads the demo frame from scratch
  await page.click("#demo-restart");
  await page.waitForFunction(() => {
    const doc = (document.querySelector("#demo-frame iframe") as HTMLIFrameElement).contentDocument;
    return doc?.getElementById("stat-renders")?.textContent === "1" && doc.querySelectorAll("#tasks li[data-id]").length === 4;
  });
  passed.push("Restart reloads the demo with its initial tasks");

  // theme: one switch repaints the page and the frame
  await page.click("label.swap");
  check(await page.evaluate(() => document.documentElement.classList.contains("dark")), "the theme switch turns the page dark");
  check(await frame.evaluate(() => document.documentElement.classList.contains("dark")), "the theme switch turns the demo frame dark");
  await page.screenshot({ path: resolve(out, "demo-dark.png"), clip: (await page.locator("#demo").boundingBox())! });
  await page.click("label.swap");
  await page.screenshot({ path: resolve(out, "index-light.png"), fullPage: true });
  await desktop.close();

  // ---- phone, dark ---------------------------------------------------------------------------------------------------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", hasTouch: true, isMobile: true });
  const mobile = await phone.newPage();
  watch(mobile, "index (phone)");
  await mobile.goto(url, { waitUntil: "networkidle" });
  check(await mobile.evaluate(() => document.documentElement.classList.contains("dark")), "the OS dark scheme applies before any choice is saved");
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, "no horizontal scroll at 390 px", `${overflow} px too wide`);
  checkSyntax(await syntax(mobile), "dark");
  await mobile.click("[data-sheet-trigger]");
  check(await mobile.evaluate(() => (document.getElementById("dq-menu") as HTMLDialogElement).open), "the menu button opens the sheet");
  await mobile.click('#dq-menu a[href="#api"]');
  check(await mobile.evaluate(() => !(document.getElementById("dq-menu") as HTMLDialogElement).open), "a menu link closes the sheet");
  await mobile.screenshot({ path: resolve(out, "index-phone-dark.png"), fullPage: true });
  const demo = await phone.newPage();
  watch(demo, "demo (phone)");
  await demo.goto(`${url}/demo/`, { waitUntil: "networkidle" });
  const demoOverflow = await demo.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(demoOverflow <= 0, "the demo has no horizontal scroll at 390 px", `${demoOverflow} px too wide`);
  await demo.screenshot({ path: resolve(out, "demo-phone-dark.png"), fullPage: true });
  await phone.close();
} catch (error) {
  failures.push(`run aborted: ${error instanceof Error ? error.stack : error}`);
} finally {
  await browser.close();
  server.close();
}

writeFileSync(resolve(out, "report.json"), `${JSON.stringify({ at: new Date().toISOString(), passed, failures }, null, 2)}\n`);
for (const claim of passed) console.log(`PASS ${claim}`);
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`docs-e2e: ${passed.length} passed, ${failures.length} failed; report and screenshots in output/docs-e2e/`);
process.exit(failures.length ? 1 : 0);
