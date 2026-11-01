// The demo app: a task board whose whole list is rendered again as VNodes on every change. It runs on the global df$
// installed by ../assets/defuss-morph.min.js and ../assets/defuss-query.min.js, the built bundles this site serves.
// Security: task titles and tags are visitor input, so they only ever reach the DOM as VNode text or input values,
// never as markup strings. VERIFIED: a title typed as <b>literal</b> stays text (scripts/docs-e2e.ts).
const df$ = globalThis.df$;

const tasks = [
  { id: 1, title: "Select with native CSS selectors", done: true, tags: ["dom"] },
  { id: 2, title: "Morph the list instead of rebuilding it", done: false, tags: ["morph"] },
  { id: 3, title: "Edit this title, then shuffle", done: false, tags: ["identity"] },
  { id: 4, title: "Read the form as native FormData", done: false, tags: ["forms", "dom"] },
];
let nextId = 5;
let filter = "all";
let renders = 0;

// ---- inspector state: identity of row elements across renders -------------------------------------------------------
// A WeakMap keyed by the element object: a row keeps its number only while morph keeps the same DOM node.
const nodeIds = new WeakMap();
let nextNode = 1;
const log = [];
let nextLog = 1;

const time = () => new Date().toISOString().slice(11, 23);
function note(kind, text) {
  log.unshift({ id: nextLog++, time: time(), kind, text });
  log.length = Math.min(log.length, 9);
  df$("#log").morph(
    log.map((entry) => ({
      type: "li",
      attributes: { key: entry.id, class: "log-entry", "data-kind": entry.kind },
      children: [{ type: "time", children: [entry.time] }, { type: "span", attributes: { class: "badge", "data-variant": "outline", "data-size": "sm" }, children: [entry.kind] }, { type: "span", children: [entry.text] }],
    })),
  );
}

const visible = () => tasks.filter((task) => (filter === "open" ? !task.done : filter === "done" ? task.done : true));

/** The list as VNodes. Keys let morph match rows across renders, whatever their order. */
function rows() {
  const list = visible();
  if (!list.length) return [{ type: "li", attributes: { key: "empty", class: "task-empty" }, children: ["Nothing here. Add a task or change the filter."] }];
  return list.map((task) => ({
    type: "li",
    attributes: { key: task.id, class: task.done ? "task done" : "task", "data-id": task.id },
    children: [
      { type: "input", attributes: { class: "checkbox", type: "checkbox", checked: task.done, "data-action": "toggle", "aria-label": `Done: ${task.title}` } },
      { type: "input", attributes: { class: "input task-title", "data-size": "sm", value: task.title, "data-field": "title", "aria-label": "Task title", spellcheck: "false" } },
      { type: "span", attributes: { class: "task-tags" }, children: task.tags.map((tag) => ({ type: "span", attributes: { class: "badge", "data-variant": "secondary", "data-size": "sm" }, children: [tag] })) },
      { type: "button", attributes: { type: "button", class: "btn", "data-variant": "ghost", "data-size": "icon", "data-action": "remove", "aria-label": `Remove ${task.title}` }, children: ["×"] },
    ],
  }));
}

/**
 * Render the list and report which row elements morph kept, created and removed. With a transition, morph()
 * returns a Promise and the report waits for it.
 */
function render(reason, options) {
  const list = document.getElementById("tasks");
  const before = new Set(list.children);
  const started = performance.now();
  const result = df$(list).morph(rows(), options);
  const finish = () => {
    const after = [...list.children];
    const kept = after.filter((el) => before.has(el)).length;
    const created = after.filter((el) => !before.has(el));
    const removed = [...before].filter((el) => !el.isConnected).length;
    for (const el of after) {
      if (!nodeIds.has(el)) nodeIds.set(el, nextNode++);
      df$(el).data("node", nodeIds.get(el));
    }
    df$(created).addClass("born");
    setTimeout(() => df$(created).removeClass("born"), 900);
    renders++;
    df$("#stat-kept").text(kept);
    df$("#stat-created").text(created.length);
    df$("#stat-removed").text(removed);
    df$("#stat-renders").text(renders);
    df$("#stat-ms").text(`${(performance.now() - started).toFixed(1)} ms`);
    const open = tasks.filter((task) => !task.done).length;
    df$("#count-open").text(`${open} open`);
    df$("#count-done").text(`${tasks.length - open} done`);
    note("render", `${reason}: kept ${kept}, created ${created.length}, removed ${removed}`);
  };
  return result instanceof Promise ? result.then(finish) : finish();
}

// ---- list interactions: one native listener on the list element, which morph keeps across renders -----------------
// VERIFIED: the <ul> is morphed in place, never replaced, so this listener serves every row of every render
// (scripts/docs-e2e.ts toggles, edits and removes rows after many renders). Per-row listeners would need re-adding
// for each created row.
df$("#tasks")
  .on("click", (event) => {
    const button = event.target.closest('[data-action="remove"]');
    if (!button) return;
    const id = Number(button.closest("[data-id]").dataset.id);
    const index = tasks.findIndex((task) => task.id === id);
    const [task] = tasks.splice(index, 1);
    render(`removed "${task.title}"`);
  })
  .on("change", (event) => {
    if (event.target.dataset.action !== "toggle") return;
    const task = tasks.find((item) => item.id === Number(event.target.closest("[data-id]").dataset.id));
    task.done = event.target.checked;
    render(task.done ? "checked a task" : "unchecked a task");
  })
  .on("input", (event) => {
    if (event.target.dataset.field !== "title") return;
    // Keep the model in sync without rendering: the next render writes the same value back.
    tasks.find((item) => item.id === Number(event.target.closest("[data-id]").dataset.id)).title = event.target.value;
  });

// ---- toolbar -----------------------------------------------------------------------------------------------------
df$("#filters").on("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  filter = button.dataset.filter;
  df$("#filters [data-filter]").each(function () {
    df$(this).attr("aria-pressed", String(this === button));
  });
  render(`filter: ${filter}`);
});
df$("#sort").on("click", () => {
  tasks.sort((a, b) => a.title.localeCompare(b.title));
  render("sorted A to Z");
});
df$("#reverse").on("click", async function () {
  df$(this).prop("disabled", true);
  tasks.reverse();
  await render("reversed with a fade", { transition: { type: "fade", duration: 250, target: "self" } });
  df$(this).prop("disabled", false);
});
const shuffle = () => {
  for (let i = tasks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
  }
};
df$("#shuffle-once").on("click", () => {
  shuffle();
  render("shuffled");
});
let timer = 0;
df$("#auto-shuffle").on("change", function () {
  clearInterval(timer);
  if (this.checked) timer = setInterval(() => {
    shuffle();
    render("auto-shuffle");
  }, 1500);
  note("event", this.checked ? "auto-shuffle on, every 1.5 s" : "auto-shuffle off");
});
df$("#clear-done").on("click", () => {
  const count = tasks.length;
  for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i].done) tasks.splice(i, 1);
  render(`cleared ${count - tasks.length} done`);
});

// ---- the add form: native FormData, including the submitter and repeated names -----------------------------------
df$("#add-form").on("submit", function (event) {
  event.preventDefault();
  const data = df$(this).form(event.submitter);
  df$("#form-out").text(JSON.stringify({ entries: [...data], tags: data.getAll("tag"), serialize: df$(this).serialize(event.submitter) }, null, 2));
  const title = String(data.get("title") ?? "").trim();
  if (!title) {
    note("form", "empty title, nothing added");
    return;
  }
  tasks.unshift({ id: nextId++, title, done: data.get("action") === "done", tags: data.getAll("tag").map(String) });
  df$("#new-title").val("");
  render(`added "${title}"`);
  df$("#new-title").get(0).focus();
});

// ---- start: df$(fn) runs once the document is parsed ---------------------------------------------------------------
df$(() => {
  df$("#query-version").text(`defuss-query ${df$.queryVersion}`);
  render("first render");
});
