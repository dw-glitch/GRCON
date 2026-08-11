/**
 * GRCON — Aba "E-mails de evidência"
 *
 * Lista a fila de e-mails pendentes, um por eGRDT gerada, e deixa o operador
 * decidir quando gerar cada rascunho. Gerar significa baixar um arquivo .eml
 * que o Outlook abre já preenchido, pronto para conferir e enviar.
 */
(function () {
  "use strict";

  const Fila = window.GrconEmailQueue;
  const Email = window.GrconEmailDraft;
  if (!Fila) return;

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  const els = {
    modulo: $("#emails-module"),
    lista: $("#emails-list"),
    vazio: $("#emails-empty"),
    resumo: $("#emails-summary"),
    limpar: $("#emails-clear"),
    destinatarios: $("#emails-recipients"),
    contadorAba: $("#emails-tab-count"),
    contadorLateral: $("#ops-emails-count"),
  };

  function notify(mensagem, tom) {
    if (typeof window.GrconNotify === "function") window.GrconNotify(mensagem, tom || "info");
  }

  function formatarData(valor) {
    const data = new Date(valor || Date.now());
    if (Number.isNaN(data.getTime())) return "";
    const dois = (n) => String(n).padStart(2, "0");
    return `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()}, ${dois(data.getHours())}:${dois(data.getMinutes())}`;
  }

  function tituloDoItem(item) {
    if (item.egrdts.length === 1) return item.egrdts[0];
    if (item.egrdts.length > 1) return `${item.egrdts.length} eGRDTs · ${item.egrdts[0]}`;
    return "eGRDT sem número";
  }

  function atualizarContadores(resumo) {
    [els.contadorAba, els.contadorLateral].forEach((alvo) => {
      if (!alvo) return;
      alvo.textContent = String(resumo.pendentes);
      alvo.hidden = resumo.pendentes === 0;
    });
  }

  function renderResumo(resumo) {
    if (!els.resumo) return;
    const uso = Math.round((resumo.bytes / resumo.limits.maxBytes) * 100);
    els.resumo.innerHTML = `
      <div><span>Na fila</span><strong>${resumo.total}</strong></div>
      <div><span>Aguardando envio</span><strong>${resumo.pendentes}</strong></div>
      <div><span>Já gerados</span><strong>${resumo.gerados}</strong></div>
      <div><span>Documentos</span><strong>${resumo.documentos}</strong></div>
      <div><span>Espaço usado</span><strong>${uso}%</strong></div>`;
  }

  // Mostra para quem o rascunho vai antes de gerar. Sem isto o operador só
  // descobria a falta de destinatário depois de clicar em "Gerar e-mail".
  function renderDestinatarios() {
    if (!els.destinatarios) return;
    const modelo = Email ? Email.readTemplate() : null;
    const para = (modelo && modelo.to) || [];
    const copia = (modelo && modelo.cc) || [];
    els.destinatarios.classList.toggle("sem-destinatario", para.length === 0);
    if (!para.length) {
      els.destinatarios.textContent = "Sem destinatário definido — o proprietário precisa preencher o modelo em Configurações gerais.";
      return;
    }
    const cc = copia.length ? ` · Cc: ${copia.join(", ")}` : "";
    els.destinatarios.textContent = `Para: ${para.join(", ")}${cc}`;
  }

  function render() {
    const itens = Fila.read();
    const resumo = Fila.summary();
    atualizarContadores(resumo);
    renderResumo(resumo);
    renderDestinatarios();
    if (els.limpar) els.limpar.disabled = itens.length === 0;
    if (els.vazio) els.vazio.hidden = itens.length > 0;
    if (!els.lista) return;
    els.lista.innerHTML = itens.map((item) => {
      const gerado = Boolean(item.geradoEmailEm);
      return `<article class="email-card ${gerado ? "is-generated" : ""}" data-email-id="${escapeHtml(item.id)}">
        <div class="email-card-main">
          <strong>${escapeHtml(tituloDoItem(item))}</strong>
          <span>${escapeHtml(formatarData(item.geradoEm))} · ${item.documentos.length} documento(s)</span>
          ${gerado ? `<small class="email-card-flag">E-mail gerado em ${escapeHtml(formatarData(item.geradoEmailEm))}</small>` : `<small class="email-card-flag pendente">Aguardando envio</small>`}
        </div>
        <div class="email-card-actions">
          <button class="primary-button compact" data-email-action="gerar" type="button">${gerado ? "Gerar novamente" : "Gerar e-mail"}</button>
          <button class="secondary-button compact" data-email-action="excluir" type="button">Excluir</button>
        </div>
      </article>`;
    }).join("");
  }

  function baixar(conteudo, nome) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: "message/rfc822" }));
    const ancora = document.createElement("a");
    ancora.href = url;
    ancora.download = nome;
    document.body.appendChild(ancora);
    ancora.click();
    ancora.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function gerar(id) {
    if (!Email) { notify("Módulo de e-mail indisponível.", "error"); return; }
    const item = Fila.read().find((registro) => registro.id === id);
    if (!item) { notify("Este e-mail não está mais na fila.", "warn"); return; }
    const montado = Email.buildEml(item);
    if (!montado.ok) { notify(montado.error, "warn"); return; }
    baixar(montado.eml, Email.suggestedFileName(item));
    Fila.markGenerated(id);
    render();
    notify(`Rascunho de ${tituloDoItem(item)} gerado. Abra o arquivo baixado e lembre-se de anexar o log de evidência do SIGEM antes de enviar.`, "success");
  }

  function excluir(id) {
    const item = Fila.read().find((registro) => registro.id === id);
    if (!item) return;
    if (!window.confirm(`Remover o e-mail de ${tituloDoItem(item)} da fila?`)) return;
    Fila.remove(id);
    render();
    notify("E-mail removido da fila.", "info");
  }

  function limparTudo() {
    const resumo = Fila.summary();
    if (!resumo.total) return;
    const aviso = resumo.pendentes
      ? `Apagar os ${resumo.total} e-mail(s) da fila? ${resumo.pendentes} ainda não foram gerados e não poderão ser recuperados.`
      : `Apagar os ${resumo.total} e-mail(s) da fila?`;
    if (!window.confirm(aviso)) return;
    Fila.clear();
    render();
    notify("Fila de e-mails limpa.", "success");
  }

  function instalar() {
    if (els.lista) {
      els.lista.addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-email-action]");
        if (!botao) return;
        const id = botao.closest("[data-email-id]")?.dataset.emailId;
        if (!id) return;
        if (botao.dataset.emailAction === "gerar") gerar(id);
        if (botao.dataset.emailAction === "excluir") excluir(id);
      });
    }
    if (els.limpar) els.limpar.addEventListener("click", limparTudo);
    window.addEventListener("grcon:email-queued", render);
    window.addEventListener("grcon:email-template-updated", render);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", instalar, { once: true });
  else instalar();

  window.GrconEmailQueueUi = Object.freeze({ render, gerar, limparTudo });
})();
