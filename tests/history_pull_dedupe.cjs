"use strict";
// Histórico compartilhado: leituras simultâneas dividem UMA consulta e uma queda passageira do servidor
// não derruba o espelho incremental (voltar ao completo baixaria o histórico inteiro no pior momento).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cloud = fs.readFileSync(path.join(__dirname, "..", "grcon_cloud_app.js"), "utf8");

assert.match(cloud, /let historyPullInFlight = null;/);
assert.match(cloud, /historyPullInFlight\.workspaceId === workspaceId/, "só compartilha dentro do mesmo workspace");
assert.match(cloud, /if \(!settings\.forceFull \|\| running\.forceFull\) return running\.promise;/, "leitura repetida reaproveita a em andamento");
assert.match(cloud, /entry\.promise = pullCloudHistoryNow\(settings\)\.finally\(/, "libera a vaga ao terminar, com sucesso ou erro");
assert.match(cloud, /function isTransientServerError\(error\)/);
assert.match(cloud, /status >= 500/);
assert.match(cloud, /"57014"/, "estouro de tempo do Postgres conta como passageiro");
// Falha passageira não zera o espelho incremental; falha de schema/política zera.
const transientBranch = cloud.slice(cloud.indexOf("if (isTransientServerError(error)) {"), cloud.indexOf("throw error;", cloud.indexOf("if (isTransientServerError(error)) {")));
assert.doesNotMatch(transientBranch.split("} else {")[0], /historyFullSyncDone = false/, "falha passageira não volta ao espelho completo");
assert.match(transientBranch.split("} else {")[1], /historyFullSyncDone = false;\s*state\.historySyncSince = "";/, "erro de schema/política volta ao espelho completo");

// Comportamento do classificador, extraído do próprio código.
const body = cloud.slice(cloud.indexOf("function isTransientServerError(error) {"), cloud.indexOf("// Leituras simultâneas do histórico"));
const isTransientServerError = new Function(body + "; return isTransientServerError;")();
assert.equal(isTransientServerError({ status: 503 }), true);
assert.equal(isTransientServerError({ status: 500, message: "x" }), true);
assert.equal(isTransientServerError({ code: "57014" }), true);
assert.equal(isTransientServerError(new TypeError("Failed to fetch")), true);
assert.equal(isTransientServerError({ message: "canceling statement due to statement timeout" }), true);
assert.equal(isTransientServerError({ status: 401, message: "JWT expired" }), false);
assert.equal(isTransientServerError({ code: "42501", message: "permission denied for table" }), false);
assert.equal(isTransientServerError(null), false);
console.log("history_pull_dedupe: OK");
