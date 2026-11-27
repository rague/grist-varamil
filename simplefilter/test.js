/**
 * Harnais de test pour simplefilter — simule l'environnement Grist (comme liquid-2/test.js).
 * Exécution : node test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");

function makeHarness() {
  const state = {
    selections: [], // historique des appels setSelectedRows
    readyCalls: 0,
    onRecordsCalls: 0,
    onOptionsCalls: 0,
  };

  // Faux éléments DOM
  const elements = {
    filter: { value: "", placeholder: "" },
    type: { innerHTML: "" },
    search: { style: { display: "" } },
    config: { style: { display: "" } },
    target: { checked: false, value: "normal" },
    empty: { checked: true },
    defsearchtype: { value: "0" },
    defval: { value: "" },
    savesession: { checked: false },
    sessionID: { value: "" },
    columns: { value: "" },
    placeholder: { value: "" },
    help: { value: "" },
  };

  const documentMock = {
    getElementById: (id) => elements[id] || { value: "", style: {} },
  };

  const sessionStorageMock = {
    store: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; },
    setItem(k, v) { this.store[k] = String(v); },
  };

  let recordsHandler = null;
  let optionsHandler = null;

  const gristMock = {
    ready(opts) { state.readyCalls++; state.readyOpts = opts; },
    onRecords(fn) { recordsHandler = fn; state.onRecordsCalls++; },
    onOptions(fn) { optionsHandler = fn; state.onOptionsCalls++; },
    onRecord() {},
    setSelectedRows(rows) { state.selections.push(rows); },
    widgetApi: { setOption(k, v) { state.options = state.options || {}; state.options[k] = v; } },
  };

  const sandbox = {
    grist: gristMock,
    document: documentMock,
    sessionStorage: sessionStorageMock,
    console,
    alert: (m) => { state.alerted = m; },
    event: { key: "" },
    performance,
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(src, context, { filename: "script.js" });

  return {
    state, elements, context, sandbox,
    fireOptions(opts) { optionsHandler(opts || {}); },
    fireRecords(records) { recordsHandler(records, {}); },
    apply() { vm.runInContext("ApplyFilter()", context); },
    getAllRecords() { return vm.runInContext("allRecords", context); },
  };
}

function rec(id, fields) { return { id, fields }; }

const DATA = [
  { id: 1, Name: "alice smith", City: "paris" },
  { id: 2, Name: "bob jones", City: "lyon" },
  { id: 3, Name: "carol white", City: "paris" },
];

// Format imbriqué {id, fields} — géré par rétrocompatibilité
const DATA_NESTED = [
  { id: 1, fields: { Name: "alice smith", City: "paris" } },
  { id: 2, fields: { Name: "bob jones", City: "lyon" } },
  { id: 3, fields: { Name: "carol white", City: "paris" } },
];

let failures = 0;
function check(label, actual, expected) {
  // Les valeurs proviennent d'un contexte vm (autre realm) : comparaison via JSON
  const a = JSON.stringify(actual === undefined ? null : actual);
  const e = JSON.stringify(expected === undefined ? null : expected);
  if (a === e) {
    console.log("OK   —", label);
  } else {
    failures++;
    console.log("FAIL —", label);
    console.log("       attendu:", e);
    console.log("       obtenu :", a);
  }
}

// ---------- Scénario ----------
const t = makeHarness();

// 1) Le script enregistre bien les handlers
check("grist.ready appelé", t.state.readyCalls, 1);
check("grist.onRecords enregistré", t.state.onRecordsCalls, 1);
check("grist.onOptions enregistré", t.state.onOptionsCalls, 1);

// 2) onOptions avant onRecords (ordre Grist) — recherche vide par défaut
t.fireOptions({});
check("après onOptions, recherche vide → tout afficher (null)", t.state.selections.at(-1), null);

// 3) onRecords avec données au format PLAT de Grist ({id, Col1, ...}, pas de "fields")
t.fireRecords(DATA);
check("après onRecords, recherche vide → tous les ids", t.state.selections.at(-1), [1, 2, 3]);

const conv = t.getAllRecords();
check("conversion colonne-basée : id", conv && conv.id, [1, 2, 3]);
check("conversion colonne-basée : Name", conv && conv.Name, ["alice smith", "bob jones", "carol white"]);
check("conversion colonne-basée : City", conv && conv.City, ["paris", "lyon", "paris"]);

// 4) Recherche simple (OR)
t.elements.filter.value = "alice";
t.apply();
check("recherche 'alice' → ligne 1", t.state.selections.at(-1), [1]);

// 5) Recherche multi colonnes (OR)
t.elements.filter.value = "paris";
t.apply();
check("recherche 'paris' → lignes 1 et 3", t.state.selections.at(-1), [1, 3]);

// 6) Aucun résultat
t.elements.filter.value = "zzzz";
t.apply();
check("recherche 'zzzz' → aucun", t.state.selections.at(-1), []);

// 7) AND
t.elements.filter.value = "&alice paris";
t.apply();
check("recherche '&alice paris' → ligne 1 (alice et paris présents)", t.state.selections.at(-1), [1]);

t.elements.filter.value = "&alice lyon";
t.apply();
check("recherche '&alice lyon' → aucun", t.state.selections.at(-1), []);

t.elements.filter.value = "&bob lyon";
t.apply();
check("recherche '&bob lyon' → ligne 2", t.state.selections.at(-1), [2]);

// 8) AND même colonne
t.elements.filter.value = "&&bob jones";
t.apply();
check("recherche '&&bob jones' → ligne 2", t.state.selections.at(-1), [2]);

// 9) Colonnes restreintes via @
t.elements.filter.value = "alice@Name";
t.apply();
check("recherche 'alice@Name' → ligne 1", t.state.selections.at(-1), [1]);

// 10) displayall=false + recherche vide → aucun
t.fireOptions({ displayall: false });
t.elements.filter.value = "";
t.apply();
check("displayall=false + recherche vide → aucun", t.state.selections.at(-1), []);

// 11) displayall=true + recherche vide → tous (via ids, pas null)
t.fireOptions({ displayall: true });
t.elements.filter.value = "";
t.apply();
check("displayall=true + recherche vide → tous les ids", t.state.selections.at(-1), [1, 2, 3]);

// 12) onRecords vide ensuite
t.fireRecords([]);
check("onRecords vide → recherche vide/displayall → aucun id", t.state.selections.at(-1), []);

// 13) Valeur de recherche avec type par défaut AND
t.fireRecords(DATA);
t.fireOptions({ defsearchtype: 1 });
t.elements.filter.value = "lyon";
t.apply();
check("defsearchtype=AND, 'lyon' seul → ligne 2", t.state.selections.at(-1), [2]);

if (failures === 0) {
  console.log("\n--- PARTIE 1 : OK ---");
} else {
  console.log(`\n--- PARTIE 1 : ${failures} TEST(S) EN ÉCHEC ---`);
}
console.log("\n--- Format imbriqué {id, fields} ---");
const t2 = makeHarness();
t2.fireOptions({});
t2.fireRecords(DATA_NESTED);
check2("nested: recherche vide → tous les ids", t2.state.selections.at(-1), [1, 2, 3]);
t2.elements.filter.value = "alice";
t2.apply();
check2("nested: recherche 'alice' → ligne 1", t2.state.selections.at(-1), [1]);
t2.elements.filter.value = "lyon";
t2.apply();
check2("nested: recherche 'lyon' → ligne 2", t2.state.selections.at(-1), [2]);

function check2(label, actual, expected) {
  const a = JSON.stringify(actual === undefined ? null : actual);
  const e = JSON.stringify(expected === undefined ? null : expected);
  if (a === e) {
    console.log("OK   —", label);
  } else {
    failures++;
    console.log("FAIL —", label);
    console.log("       attendu:", e);
    console.log("       obtenu :", a);
  }
}
process.exit(failures === 0 ? 0 : 1);
