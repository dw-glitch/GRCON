/**
 * GRCON — Fila de e-mails de evidência
 *
 * Ao gerar uma eGRDT, o rascunho do e-mail não é baixado na hora: ele fica
 * guardado nesta fila, identificado pelo número da eGRDT. Na aba "E-mails" você
 * decide quando gerar cada um — ou se não vai gerar.
 *
 * Fica no armazenamento local do navegador, de propósito: são rascunhos
 * temporários, não precisam ocupar espaço no banco compartilhado. Há teto de
 * registros e botão para limpar tudo, para a fila não crescer sem controle.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconEmailQueue = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "grcon.email.fila.v1";
  const MAX_ITENS = 200;
  const MAX_BYTES = 2000000;
  const _U = (typeof globalThis !== "undefined" ? globalThis : this).GrconUtils || {};

  function text(value) {
    return _U.text ? _U.text(value) : (value === null || value === undefined ? "" : String(value).trim());
  }

  function storageOf(storage) {
    if (storage) return storage;
    try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (_) { return null; }
  }

  function byteSize(value) {
    try { return new TextEncoder().encode(String(value)).length; } catch (_) { return String(value).length; }
  }

  function cleanDocument(doc) {
    return {
      documento: text(doc && doc.documento),
      titulo: text(doc && doc.titulo),
      disciplina: text(doc && doc.disciplina),
      egrdt: text(doc && doc.egrdt),
      arquivo: text(doc && doc.arquivo),
    };
  }

  function cleanItem(item) {
    const documentos = Array.isArray(item && item.documentos) ? item.documentos.map(cleanDocument) : [];
    const egrdts = Array.isArray(item && item.egrdts) ? item.egrdts.map(text).filter(Boolean) : [];
    return {
      id: text(item && item.id) || `${egrdts[0] || "eGRDT"}|${text(item && item.geradoEm)}`,
      egrdts,
      documentos,
      geradoEm: text(item && item.geradoEm) || new Date().toISOString(),
      criadoEm: text(item && item.criadoEm) || new Date().toISOString(),
      geradoEmailEm: text(item && item.geradoEmailEm),
    };
  }

  function read(storage) {
    const target = storageOf(storage);
    if (!target) return [];
    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.map(cleanItem)
        .filter((item) => item.documentos.length)
        .sort((a, b) => String(b.geradoEm).localeCompare(String(a.geradoEm)));
    } catch (_) { return []; }
  }

  /** Aplica os limites, devolvendo também quantos saíram e por quê. */
  function fitDetailed(itens) {
    const porQuantidade = Math.max(0, itens.length - MAX_ITENS);
    const kept = itens.slice(0, MAX_ITENS);
    const tamanhos = kept.map((item) => byteSize(JSON.stringify(item)) + 1);
    let total = tamanhos.reduce((soma, valor) => soma + valor, 2);
    let porTamanho = 0;
    while (kept.length > 1 && total > MAX_BYTES) {
      total -= tamanhos[kept.length - 1];
      kept.pop();
      porTamanho += 1;
    }
    return { kept, dropped: porQuantidade + porTamanho, droppedByCount: porQuantidade, droppedBySize: porTamanho };
  }

  function write(itens, storage) {
    const target = storageOf(storage);
    if (!target) return { saved: false, itens: [], error: "Armazenamento local indisponível." };
    const ajuste = fitDetailed(itens);
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(ajuste.kept));
      return { saved: true, itens: ajuste.kept, trimmed: ajuste.dropped, limits: { maxItens: MAX_ITENS, maxBytes: MAX_BYTES }, error: "" };
    } catch (error) {
      return { saved: false, itens: read(target), error: error && error.message || "Não foi possível salvar a fila de e-mails." };
    }
  }

  /** Guarda uma emissão na fila. Repetir a mesma eGRDT substitui o registro. */
  function enqueue(dados, storage) {
    const item = cleanItem(dados);
    if (!item.documentos.length) return { saved: false, error: "Nada a enfileirar: a emissão não trouxe documentos." };
    const atual = read(storage);
    const chave = item.egrdts.join("|");
    const semDuplicado = atual.filter((existente) => existente.egrdts.join("|") !== chave || !chave);
    const resultado = write([item, ...semDuplicado], storage);
    return { ...resultado, item };
  }

  function remove(id, storage) {
    const alvo = text(id);
    const restante = read(storage).filter((item) => item.id !== alvo);
    return write(restante, storage);
  }

  function markGenerated(id, storage) {
    const alvo = text(id);
    const itens = read(storage).map((item) => (item.id === alvo ? { ...item, geradoEmailEm: new Date().toISOString() } : item));
    return write(itens, storage);
  }

  function clear(storage) {
    const target = storageOf(storage);
    if (!target) return false;
    try { target.removeItem(STORAGE_KEY); return true; } catch (_) { return false; }
  }

  function summary(storage) {
    const itens = read(storage);
    const gerados = itens.filter((item) => item.geradoEmailEm).length;
    return {
      total: itens.length,
      pendentes: itens.length - gerados,
      gerados,
      documentos: itens.reduce((soma, item) => soma + item.documentos.length, 0),
      bytes: byteSize(JSON.stringify(itens)),
      limits: { maxItens: MAX_ITENS, maxBytes: MAX_BYTES },
    };
  }

  return { STORAGE_KEY, MAX_ITENS, MAX_BYTES, read, enqueue, remove, markGenerated, clear, summary, cleanItem };
});
