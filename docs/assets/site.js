// The landing page script. It runs on the global df$ that index.html installs from assets/defuss-morph.min.js and
// assets/defuss-query.min.js, byte-identical copies of the built bundles (scripts/docs.ts, checked by
// scripts/docs-e2e.ts), so every interaction here also exercises the bundle the page documents.
// defuss-shadcn ships JS for tabs and sheets too, but its core installs its own df$ and refuses to load next to
// another one; wiring the few behaviors with df$ keeps this page on the documented build.
const df$ = globalThis.df$;
const DfQuery = df$.fn.constructor;
const root = document.documentElement;

// ---- theme: this page and the demo frame follow one switch ---------------------------------------------------------
// VERIFIED: the frame is same-origin, so the page repaints its root directly (scripts/docs-e2e.ts checks both roots).
const frame = document.querySelector("#demo-frame iframe");
const paint = (doc, dark) => {
  doc.documentElement.classList.toggle("dark", dark);
  doc.documentElement.style.colorScheme = dark ? "dark" : "light";
};
const frameDocument = () => {
  try {
    return frame.contentDocument;
  } catch {
    return null;
  }
};
function setTheme(dark) {
  paint(document, dark);
  const doc = frameDocument();
  if (doc?.documentElement) paint(doc, dark);
  df$("#theme-toggle").prop("checked", dark);
  try {
    localStorage.setItem("defuss-shadcn-theme", JSON.stringify(dark ? "dark" : "light"));
  } catch {}
}
df$("#theme-toggle")
  .prop("checked", root.classList.contains("dark"))
  .on("change", function () {
    setTheme(this.checked);
  });
df$(frame).on("load", () => {
  const doc = frameDocument();
  if (doc?.documentElement) paint(doc, root.classList.contains("dark"));
});
df$("#demo-restart").on("click", () => frame.contentWindow?.location.reload());

// ---- mobile menu: a native <dialog> opened modal, closed by its links or a click on the backdrop ------------------
df$("[data-sheet-trigger]").on("click", function () {
  document.getElementById(this.dataset.sheetTrigger)?.showModal();
});
df$("dialog.sheet").on("click", function (event) {
  if (event.target === this || event.target.closest("[data-sheet-close]")) this.close();
});

// ---- tabs: WAI-ARIA tabs with roving tabindex ---------------------------------------------------------------------
df$(".tabs").each(function () {
  const tabs = df$(this).find('[role="tab"]');
  const select = (tab) => {
    tabs.each(function () {
      const on = this === tab;
      df$(this).attr("aria-selected", String(on)).attr("tabindex", on ? null : "-1");
      df$(`#${this.getAttribute("aria-controls")}`).prop("hidden", !on);
    });
    tab.focus();
  };
  tabs.on("click", function () {
    select(this);
  });
  tabs.on("keydown", function (event) {
    const index = tabs.indexOf(this);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(tabs.get((next + tabs.length) % tabs.length));
  });
});

// ---- copy buttons --------------------------------------------------------------------------------------------------
async function copyText(text, status) {
  try {
    await navigator.clipboard.writeText(text);
    df$(status).text("Copied");
  } catch {
    df$(status).text("Copy failed");
  }
}
df$(".mk-code-block-copy").on("click", function () {
  const block = df$(this).closest(".mk-code-block");
  const tab = block.find(".mk-code-block-tabs input:checked").prop("value");
  const pre = tab ? block.find(`pre[data-tab="${tab}"]`) : block.find("pre");
  void copyText(pre.find("code > span").map((line) => line.textContent).join("\n"), block.find(".mk-code-block-status"));
});
df$("#copy-prompt").on("click", function () {
  const label = df$(this).find("span");
  const text = df$("#agent-prompt pre:not([data-tone]) code").map((code) => code.textContent).join("\n");
  void copyText(text, "#copy-prompt-status").then(() => {
    label.text(df$("#copy-prompt-status").text());
    setTimeout(() => label.text("Copy prompt"), 2000);
  });
});

// ---- playground ----------------------------------------------------------------------------------------------------
// Each snippet runs against a fresh sandbox (a clone of <template id="sandbox-fixture">). The report compares the
// sandbox elements before and after by object identity, so "kept" means the same DOM node, not an equal one.
const NAMES = { a: "Alpha", b: "Beta", c: "Gamma", d: "Delta" };
const REORDERED = document.getElementById("sandbox-fixture").innerHTML
  .replace(/<ul id="dq-list">[\s\S]*?<\/ul>/, '<ul id="dq-list"><li key="d" id="dq-d">Delta</li><li key="c" id="dq-c">Gamma</li><li key="a" id="dq-a">Alpha</li><li key="b" id="dq-b">Beta</li></ul>');
const PRESETS = [
  {
    id: "chain",
    label: "Chain setters",
    run: () => df$("#dq-list li").addClass("hot").attr("data-seen", "yes"),
  },
  {
    id: "morph-reorder",
    label: "Re-render the sandbox with html()",
    context: "// REORDERED: the sandbox markup with Delta added and the list reversed.\n// Before the run, the note input is focused and holds text typed into it.\n// The markup sets no value, so morph keeps the typed one.",
    focus: true,
    run: () => df$("#sandbox").html(REORDERED),
  },
  {
    id: "inner-reorder",
    label: "The same with innerHTML",
    context: "// REORDERED: the sandbox markup with Delta added and the list reversed.\n// Before the run, the note input is focused and holds text typed into it.",
    focus: true,
    run: () => {
      document.getElementById("sandbox").innerHTML = REORDERED;
    },
  },
  {
    id: "text",
    label: "Write literal text",
    run: () => df$("#dq-list li").first().text("<b>not bold</b>"),
  },
  {
    id: "append",
    label: "Insert a button with a listener",
    run: () =>
      df$('<button type="button" class="btn" data-size="sm">Clicked 0 times</button>')
        .on("click", function () {
          const clicks = Number(this.dataset.clicks ?? 0) + 1;
          df$(this).data("clicks", clicks).text(`Clicked ${clicks} times`);
        })
        .appendTo("#sandbox .dq-toolbar"),
  },
  {
    id: "transition",
    label: "Reverse the list with a fade",
    context: '// NAMES: { a: "Alpha", b: "Beta", c: "Gamma" }',
    run: () =>
      df$("#dq-list").morph(
        ["c", "b", "a"].map((key) => ({ type: "li", attributes: { key, id: `dq-${key}` }, children: [NAMES[key]] })),
        { transition: { type: "fade", duration: 300 } },
      ),
  },
  {
    id: "species",
    label: "map() returns a plain Array",
    run: () => df$("#dq-list li").map((li) => li.textContent),
  },
  {
    id: "form",
    label: "Read the form as FormData",
    run: () => [...df$("#dq-form").form()],
  },
];

const sandbox = document.getElementById("sandbox");
const fixture = document.getElementById("sandbox-fixture");
// A text input alone in a form submits it on Enter; the sandbox form has no endpoint.
df$(sandbox).on("submit", (event) => event.preventDefault());
const resetSandbox = () => sandbox.replaceChildren(fixture.content.cloneNode(true));

function describe(value) {
  if (value instanceof DfQuery) {
    const names = value.map((node) => (node.nodeType === 1 ? node.localName + (node.id ? `#${node.id}` : "") : node.nodeName));
    return `DfQuery(${value.length}) [${names.join(", ")}]`;
  }
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

const label = (el) => el.localName + (el.id ? `#${el.id}` : el.getAttribute("name") ? `[name=${el.getAttribute("name")}]` : "");
const listOf = (els) => (els.length ? `${els.length}: ${els.slice(0, 6).map(label).join(", ")}${els.length > 6 ? ", and more" : ""}` : "0");
const row = (term, detail, tone) => ({ type: "div", children: [{ type: "dt", children: [term] }, { type: "dd", attributes: tone ? { "data-tone": tone } : {}, children: [detail] }] });

let current = PRESETS[0];
async function run(preset) {
  current = preset;
  df$("#presets button").each(function () {
    df$(this).attr("aria-pressed", String(this.dataset.preset === preset.id));
  });
  // The run() source, highlighted when `make docs` ran (scripts/highlight.ts reads PRESETS and writes one
  // <template data-snippet> per entry). It is page markup generated at build time, not visitor input.
  df$("#preset-code").html(document.querySelector(`template[data-snippet="${preset.id}"]`).innerHTML);
  resetSandbox();
  const before = new Set(sandbox.querySelectorAll("*"));
  let focused = null;
  if (preset.focus) {
    focused = sandbox.querySelector('input[name="note"]');
    focused.focus();
    focused.value = "typed by you";
    focused.setSelectionRange(5, 5);
  }
  let returned;
  try {
    const result = preset.run();
    returned = result instanceof Promise ? `Promise, resolved to ${describe(await result)}` : describe(result);
  } catch (error) {
    returned = `threw ${error}`;
  }
  const after = [...sandbox.querySelectorAll("*")];
  const kept = after.filter((el) => before.has(el));
  const created = after.filter((el) => !before.has(el));
  const removed = [...before].filter((el) => !sandbox.contains(el));
  df$(created).addClass("dq-born");
  setTimeout(() => df$(created).removeClass("dq-born"), 1200);
  const rows = [
    row("Returned", returned),
    row("Elements kept", listOf(kept), kept.length ? "good" : undefined),
    row("Elements created", listOf(created)),
    row("Elements removed", listOf(removed), removed.length ? "bad" : undefined),
  ];
  if (focused) {
    const input = sandbox.querySelector('input[name="note"]');
    const stayed = document.activeElement === focused && focused.isConnected;
    rows.push(row("Focus", stayed ? `kept, caret at ${focused.selectionStart}` : `lost to <${document.activeElement?.localName}>`, stayed ? "good" : "bad"));
    rows.push(row("Typed value", JSON.stringify(input.value), input.value === "typed by you" ? "good" : "bad"));
  }
  df$("#report").morph(rows);
}

df$("#presets").morph(
  PRESETS.map((preset) => ({
    type: "button",
    attributes: { type: "button", class: "btn dq-preset", "data-variant": "outline", "data-size": "sm", "data-preset": preset.id, "aria-pressed": "false" },
    children: [preset.label],
  })),
);
df$("#presets").on("click", (event) => {
  const button = event.target.closest("[data-preset]");
  if (button) void run(PRESETS.find((preset) => preset.id === button.dataset.preset));
});
df$("#preset-run").on("click", () => void run(current));
df$("#sandbox-reset").on("click", () => {
  resetSandbox();
  df$("#report").empty();
});
resetSandbox();
