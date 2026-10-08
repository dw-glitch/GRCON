const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const html = read("index.html");
const css = read("grcon-ui-fix.css");
const script = read("grdt-stage-progress.js");
const sw = read("sw.js");

assert.match(html, /id="grdt-stages"/);
assert.match(html, /aria-label="Etapas do Controle de GRDT"/);
assert.equal((html.match(/data-grdt-stage=/g) || []).length, 4);
assert.match(html, /src="grdt-stage-progress\.js"/);
assert.match(css, /\.grdt-stage\.is-current/);
assert.match(css, /\.grdt-stage\.is-complete/);
assert.match(css, /var\(--surface-1/);
assert.match(css, /var\(--brand-700/);
assert.match(sw, /"grdt-stage-progress\.js"/);
assert.doesNotMatch(script, /setInterval|requestAnimationFrame|fetch\(|supabase|Worker|querySelectorAll\("\*"/);

// As quatro etapas vêm exclusivamente de estado da interface já existente.
function element() {
  const attrs = new Map();
  const classes = new Set();
  return {
    hidden: true,
    style: { display: "" },
    dataset: {},
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => { if (enabled) classes.add(name); else classes.delete(name); },
    },
    getAttribute: (name) => attrs.has(name) ? attrs.get(name) : null,
    hasAttribute: (name) => attrs.has(name),
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: (name) => attrs.delete(name),
  };
}

const steps = Array.from({ length: 4 }, element);
const stagePath = element();
stagePath.querySelectorAll = (selector) => {
  assert.equal(selector, "[data-grdt-stage]");
  return steps;
};
const progress = element();
const results = element();
const teams = element();
const announcement = { textContent: "" };
const byId = {
  "grdt-stages": stagePath,
  "progress": progress,
  "results-section": results,
  "egrdt-teams-ready": teams,
  "grdt-stage-announcement": announcement,
};
let callback;
const observed = [];
const documentMock = {
  readyState: "complete",
  getElementById: (id) => byId[id] || null,
  addEventListener: (type, listener) => { if (type === "grcon:triage-rendered") callback = listener; },
};
const windowMock = { addEventListener: () => {} };
class MockMutationObserver {
  constructor(fn) { this.fn = fn; }
  observe(node, options) {
    observed.push(node);
    assert.deepEqual(Array.from(options.attributeFilter), ["hidden", "style", "aria-hidden"]);
    assert.equal(options.attributes, true);
    callback = this.fn;
  }
}
vm.runInNewContext(script, { document: documentMock, window: windowMock, MutationObserver: MockMutationObserver });

function assertActive(index) {
  assert.equal(stagePath.dataset.activeStage, String(index + 1));
  steps.forEach((step, stepIndex) => {
    assert.equal(step.classList.contains("is-current"), stepIndex === index);
    assert.equal(step.classList.contains("is-complete"), stepIndex < index);
    assert.equal(step.getAttribute("aria-current"), stepIndex === index ? "step" : null);
  });
}
assert.deepEqual(observed, [progress, results, teams]);
assertActive(0);

progress.hidden = false;
callback();
assertActive(1);

results.hidden = false;
callback(); // análise em execução tem prioridade sobre resultado anterior
assertActive(1);

progress.hidden = true;
callback();
assertActive(2);

teams.hidden = false;
callback();
assertActive(3);
assert.equal(announcement.textContent, "Etapa atual: Emitir.");

teams.hidden = true;
results.hidden = true;
callback();
assertActive(0);

console.log("grdt_visual_steps: ok — estados operacionais e sincronização acessível");
