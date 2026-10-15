const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function loadDashboardModule() {
  const noop = () => {};
  const documentStub = {
    readyState: "loading",
    addEventListener: noop,
    documentElement: { dataset: {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      dataset: {},
      setAttribute: noop,
      appendChild: noop,
      classList: { add: noop, remove: noop, toggle: noop },
    }),
    body: { classList: { add: noop, remove: noop, toggle: () => false } },
  };
  const storage = new Map();
  const windowStub = {
    document: documentStub,
    setTimeout,
    clearTimeout,
    console,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  };
  windowStub.window = windowStub;
  const context = vm.createContext(windowStub);
  context.document = documentStub;
  vm.runInContext(fs.readFileSync(path.join(root, "retomar.js"), "utf8"), context);
  return context.GrconHistoryDashboard._debug;
}

const debug = loadDashboardModule();

assert.equal(debug.startOfWeekKey("2026-10-14"), "2026-10-12", "quarta-feira deve cair na segunda da mesma semana");
assert.equal(debug.endOfWeekKey("2026-10-14"), "2026-10-18", "semana deve terminar no domingo");
assert.equal(debug.startOfWeekKey("2027-01-01"), "2026-12-28", "virada do ano não pode quebrar a semana");

const range = debug.weeklyRangeFor(8, "2026-10-14");
assert.equal(range.weeks, 8);
assert.equal(range.start, "2026-08-24");
assert.equal(range.end, "2026-10-14");
assert.equal(debug.clampWeekCount(0), 1);
assert.equal(debug.clampWeekCount(80), 52);
assert.equal(debug.clampWeekCount("abc"), 8);

const daily = [
  { date: "2026-09-28", ET: 2, "N-1710": 1, CV: 0, total: 3, egrdts: 1 },
  { date: "2026-10-06", ET: 0, "N-1710": 3, CV: 1, total: 4, egrdts: 2 },
  { date: "2026-10-14", ET: 4, "N-1710": 0, CV: 2, total: 6, egrdts: 1 },
];

const weekly = debug.buildDashboardWeeklyData(daily, "2026-09-21", "2026-10-14");
assert.equal(weekly.length, 4, "o período deve conter quatro barras semanais, inclusive a semana zerada");
assert.equal(weekly[0].startDate, "2026-09-21");
assert.equal(weekly[0].total, 0, "semana sem emissão precisa continuar visível com zero");
assert.equal(weekly[1].total, 3);
assert.equal(weekly[2].total, 4);
assert.equal(weekly[3].total, 6);
assert.equal(weekly[3].partial, true, "última semana deve ser marcada como parcial");
assert.equal(weekly[3].endDate, "2026-10-14");
assert.equal(weekly[3].fullEndDate, "2026-10-18");
assert.equal(debug.dashboardPointLabel(weekly[3], false), "12/10–14/10");

const dailyTotal = daily.reduce((sum, item) => sum + item.total, 0);
const weeklyTotal = weekly.reduce((sum, item) => sum + item.total, 0);
assert.equal(weeklyTotal, dailyTotal, "agrupar por semana não pode alterar o total de emissões");

const crossing = debug.buildDashboardWeeklyData([
  { date: "2026-12-28", ET: 1, "N-1710": 0, CV: 0, total: 1, egrdts: 1 },
  { date: "2027-01-02", ET: 0, "N-1710": 1, CV: 0, total: 1, egrdts: 1 },
], "2026-12-28", "2027-01-03");
assert.equal(crossing.length, 1, "28/12 a 03/01 é uma única semana operacional");
assert.equal(crossing[0].total, 2);
assert.equal(crossing[0].startDate, "2026-12-28");
assert.equal(crossing[0].endDate, "2027-01-03");

const source = fs.readFileSync(path.join(root, "retomar.js"), "utf8");
assert.match(source, /data-dashboard-granularity="week"/);
assert.match(source, /data-dashboard-weeks="52"/);
assert.match(source, /id="dashboard-week-count"[^>]*min="1"[^>]*max="52"/);
assert.match(fs.readFileSync(path.join(root, "emission_dashboard_report.js"), "utf8"), /workbook\.addWorksheet\("Emissões semanais"/);
assert.match(source, /dashboardGranularity === "week"\s*\? buildDashboardWeeklyData/);

console.log("OK — Dashboard de emissões suporta agrupamento semanal, semanas vazias, parcial e virada de ano.");
