/**
 * GRCON — Faixa "Retomar de onde parou", na tela de Controle de GRDT
 *
 * A tela abria com o cartão de fontes e mais de metade da altura vazia, sem
 * dizer nada sobre o trabalho já feito. Esta faixa preenche esse espaço com o
 * que já está gravado: a última eGRDT emitida e os totais do histórico.
 *
 * Duas regras que valem para o módulo inteiro valem aqui também:
 *
 *   1. Nada é inventado. Tudo sai de GrconHistory.read(), o mesmo histórico da
 *      aba Histórico. Sem registro nenhum a faixa não aparece — nem com número
 *      zerado, nem com exemplo, porque um painel que mostra zero onde nunca
 *      houve trabalho é ruído, não informação.
 *   2. Nenhum botão sem ação. O único botão leva à aba Histórico, que é onde a
 *      informação completa está.
 */
(function (root) {
  "use strict";

  const els = {};

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function numero(value) {
    return Number(value || 0).toLocaleString("pt-BR");
  }

  function quando(iso) {
    const data = iso ? new Date(iso) : null;
    if (!data || Number.isNaN(data.getTime())) return "";
    return data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  /**
   * Lê o histórico local. Falhar aqui nunca pode derrubar a tela de análise:
   * a faixa é conveniência, e o trabalho do dia não depende dela.
   */
  function registros() {
    try {
      const History = root.GrconHistory;
      if (!History || typeof History.read !== "function") return [];
      const lidos = History.read();
      return Array.isArray(lidos) ? lidos : [];
    } catch (erro) {
      console.debug("[Retomar] histórico indisponível:", erro);
      return [];
    }
  }

  function cartao(rotulo, valor, detalhe) {
    return `<div class="grcon-retomar-card">
      <span>${escapeHtml(rotulo)}</span>
      <strong>${escapeHtml(valor)}</strong>
      ${detalhe ? `<small>${escapeHtml(detalhe)}</small>` : ""}
    </div>`;
  }

  function render() {
    if (!els.secao || !els.cards) return;
    const lista = registros();
    if (!lista.length) {
      // Sem histórico a tela continua como sempre foi.
      els.secao.hidden = true;
      return;
    }

    const History = root.GrconHistory;
    const resumo = History && typeof History.summary === "function"
      ? History.summary(lista)
      : { egrdts: lista.length, documents: 0, files: 0, allocations: 0, lastGeneratedAt: "" };
    const ultima = lista[0] || {};

    const partes = [];
    const numeroUltima = text(ultima.egrdtNumber);
    if (numeroUltima) {
      partes.push(cartao("ÚLTIMA eGRDT", numeroUltima, quando(ultima.generatedAt)));
    }
    partes.push(cartao("eGRDTs EMITIDAS", numero(resumo.egrdts)));
    partes.push(cartao("DOCUMENTOS", numero(resumo.documents)));
    if (resumo.allocations) partes.push(cartao("ALOCAÇÕES", numero(resumo.allocations)));

    els.cards.innerHTML = partes.join("");
    els.secao.hidden = false;
  }

  function abrirHistorico() {
    const botao = document.querySelector('[data-grcon-view="history"]');
    if (botao) botao.click();
  }

  function ligar() {
    els.secao = document.getElementById("grcon-retomar");
    els.cards = document.getElementById("grcon-retomar-cards");
    els.abrir = document.getElementById("grcon-retomar-abrir");
    if (!els.secao) return false;
    if (els.abrir) els.abrir.addEventListener("click", abrirHistorico);
    // O histórico muda quando uma eGRDT é gerada ou quando a área
    // compartilhada termina de sincronizar.
    ["grcon:history-changed", "grcon:cloud-ready", "grcon:requests-saved"].forEach((evento) =>
      root.addEventListener(evento, render));
    render();
    return true;
  }

  root.GrconRetomar = Object.freeze({ init: ligar, render, _debug: { registros } });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ligar, { once: true });
  } else {
    ligar();
  }
})(window);
