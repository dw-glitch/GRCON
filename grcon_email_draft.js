/**
 * GRCON — Rascunho de e-mail da evidência de postagem
 *
 * Ao gerar a eGRDT, monta um arquivo .eml e o baixa. Abrindo esse arquivo, o
 * Outlook exibe um RASCUNHO já preenchido (destinatários, assunto e a relação
 * dos documentos), pronto para conferir e enviar.
 *
 * Por que .eml e não mailto: a relação pode passar de 40 documentos, e um
 * mailto com corpo longo é truncado pelo Windows/navegador. O .eml não tem esse
 * limite e ainda permite tabela formatada. O cabeçalho "X-Unsent: 1" é o que faz
 * o Outlook abrir como rascunho editável em vez de mensagem recebida.
 *
 * Tudo é montado no próprio navegador — nenhum e-mail é enviado por aqui, e
 * nenhum dado sai da máquina. Quem envia é você, pelo Outlook.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconEmailDraft = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "grcon.email.destinatarios.v1";
  const _U = (typeof globalThis !== "undefined" ? globalThis : this).GrconUtils || {};

  function text(value) {
    return _U.text ? _U.text(value) : (value === null || value === undefined ? "" : String(value).trim());
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  /** Aceita e-mails separados por vírgula, ponto e vírgula ou quebra de linha. */
  function parseRecipients(value) {
    return text(value)
      .split(/[;,\n\r]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function isValidEmail(value) {
    return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(text(value));
  }

  function splitValidity(list) {
    const validos = [];
    const invalidos = [];
    list.forEach((item) => (isValidEmail(item) ? validos : invalidos).push(item));
    return { validos, invalidos };
  }

  function storageOf(storage) {
    if (storage) return storage;
    try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (_) { return null; }
  }

  const MODELO_PADRAO = Object.freeze({
    assunto: "Evidencia de Postagem {NF}",
    corpo: "Olá,\n\nSegue evidencia de postagem;\n\n{TABELA}",
    to: [],
    cc: [],
  });

  // Marcadores que o proprietário pode usar no assunto e no corpo.
  const MARCADORES = Object.freeze([
    { chave: "{NF}", descricao: "nota(s) fiscal(is) encontradas no nome dos documentos" },
    { chave: "{EGRDT}", descricao: "número da eGRDT gerada" },
    { chave: "{DATA}", descricao: "data e hora da geração" },
    { chave: "{QTD}", descricao: "quantidade de documentos" },
    { chave: "{TABELA}", descricao: "a tabela dos documentos (só no corpo)" },
  ]);

  // Cópia local do modelo compartilhado, para o app funcionar offline e para
  // não precisar ir ao servidor a cada eGRDT gerada.
  function readTemplate(storage) {
    const target = storageOf(storage);
    if (!target) return { ...MODELO_PADRAO };
    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return { ...MODELO_PADRAO };
      return {
        assunto: text(parsed.assunto) || MODELO_PADRAO.assunto,
        corpo: typeof parsed.corpo === "string" && parsed.corpo.trim() ? parsed.corpo : MODELO_PADRAO.corpo,
        to: Array.isArray(parsed.to) ? parsed.to.filter(isValidEmail) : [],
        cc: Array.isArray(parsed.cc) ? parsed.cc.filter(isValidEmail) : [],
      };
    } catch (_) { return { ...MODELO_PADRAO }; }
  }

  function cacheTemplate(modelo, storage) {
    const target = storageOf(storage);
    if (!target) return false;
    try {
      target.setItem(STORAGE_KEY, JSON.stringify({
        assunto: text(modelo && modelo.assunto) || MODELO_PADRAO.assunto,
        corpo: (modelo && typeof modelo.corpo === "string" && modelo.corpo.trim()) ? modelo.corpo : MODELO_PADRAO.corpo,
        to: Array.isArray(modelo && modelo.to) ? modelo.to.filter(isValidEmail) : [],
        cc: Array.isArray(modelo && modelo.cc) ? modelo.cc.filter(isValidEmail) : [],
      }));
      return true;
    } catch (_) { return false; }
  }

  /** Valida o que o proprietário digitou, antes de mandar ao servidor. */
  function validateTemplate(assunto, corpo, to, cc) {
    const problemas = [];
    if (!text(assunto)) problemas.push("O assunto não pode ficar vazio.");
    if (!text(corpo)) problemas.push("O corpo não pode ficar vazio.");
    const listaTo = splitValidity(Array.isArray(to) ? to : parseRecipients(to));
    const listaCc = splitValidity(Array.isArray(cc) ? cc : parseRecipients(cc));
    const invalidos = [...listaTo.invalidos, ...listaCc.invalidos];
    if (invalidos.length) problemas.push(`Endereço inválido: ${invalidos.join(", ")}`);
    if (!listaTo.validos.length) problemas.push("Informe ao menos um destinatário em Para.");
    return { ok: problemas.length === 0, problemas, to: listaTo.validos, cc: listaCc.validos };
  }

  /* ── Montagem do .eml ─────────────────────────────────────── */

  function toBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binario = "";
    // Em blocos, para não estourar a pilha com corpos grandes.
    for (let i = 0; i < bytes.length; i += 8192) {
      binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    if (typeof btoa === "function") return btoa(binario);
    return Buffer.from(value, "utf8").toString("base64");
  }

  /** Assunto com acento precisa de encoded-word, senão o Outlook mostra errado. */
  function encodeHeader(value) {
    const limpo = text(value).replace(/[\r\n]+/g, " ");
    return /^[\x20-\x7E]*$/.test(limpo) ? limpo : `=?UTF-8?B?${toBase64(limpo)}?=`;
  }

  function wrapBase64(value) {
    return value.replace(/(.{76})/g, "$1\r\n");
  }

  /** Formato do modelo aprovado: 10/08/2026, 10:54 */
  function formatDateBR(value) {
    const data = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(data.getTime())) return "";
    const dois = (n) => String(n).padStart(2, "0");
    return `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()}, ${dois(data.getHours())}:${dois(data.getMinutes())}`;
  }

  /**
   * O assunto usa a nota fiscal que aparece no fim do nome do documento
   * (ex.: C1O_..._RIR_nt-LBN-NF-6204 -> NF-6204), como no modelo em uso.
   * Havendo mais de uma NF na mesma eGRDT, todas entram; não havendo
   * nenhuma, cai para o número da eGRDT para o assunto nunca ficar vazio.
   */
  function extractNotasFiscais(documentos) {
    const encontradas = [];
    // Não usar \b aqui: em "..._NF-1234" o caractere anterior é "_", que conta
    // como parte de palavra, e a nota passaria batida. Exigir explicitamente um
    // caractere não alfanumérico antes também evita casar com "CONF-1234".
    const padrao = /(?:^|[^A-Za-z0-9])NF[-\s_]?(\d{2,})/gi;
    (documentos || []).forEach((doc) => {
      const alvo = `${text(doc && doc.documento)} ${text(doc && doc.arquivo)}`;
      padrao.lastIndex = 0;
      let achado = padrao.exec(alvo);
      while (achado !== null) {
        const normalizada = `NF-${achado[1]}`;
        if (!encontradas.includes(normalizada)) encontradas.push(normalizada);
        achado = padrao.exec(alvo);
      }
    });
    return encontradas;
  }

  // Só a tabela é gerada pelo app; o texto ao redor vem do modelo do dono.
  function buildTableHtml(dados) {
    const info = dados || {};
    const documentos = Array.isArray(info.documentos) ? info.documentos : [];
    if (!documentos.length) return "<p><i>Nenhum documento relacionado.</i></p>";
    const quando = formatDateBR(info.geradoEm);
    const borda = "border:1px solid #cfd9e2;padding:6px 8px";
    const cabecalho = "border:1px solid #1d5c86;padding:6px 8px;text-align:left";
    const linhas = documentos.map((doc) => `<tr>
      <td style="${borda};white-space:nowrap">${escapeHtml(doc.data || quando)}</td>
      <td style="${borda}">${escapeHtml(doc.egrdt)}</td>
      <td style="${borda}">${escapeHtml(doc.documento)}</td>
      <td style="${borda}">${escapeHtml(doc.titulo)}</td>
      <td style="${borda}">${escapeHtml(doc.disciplina)}</td>
    </tr>`).join("");
    return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px;margin:12px 0">
      <thead><tr style="background:#1d5c86;color:#ffffff">
        <th style="${cabecalho}">DATA DA GERAÇÃO / POSTAGEM</th>
        <th style="${cabecalho}">EGRDT</th>
        <th style="${cabecalho}">DOCUMENTO</th>
        <th style="${cabecalho}">TÍTULO</th>
        <th style="${cabecalho}">DISCIPLINA</th>
      </tr></thead><tbody>${linhas}</tbody></table>`;
  }

  /** Valores dos marcadores para uma emissão. */
  function placeholderValues(dados) {
    const info = dados || {};
    const notas = extractNotasFiscais(info.documentos);
    const egrdts = Array.isArray(info.egrdts) ? info.egrdts : [];
    return {
      "{NF}": notas.join(", "),
      "{EGRDT}": egrdts.join(", "),
      "{DATA}": formatDateBR(info.geradoEm),
      "{QTD}": String((info.documentos || []).length),
    };
  }

  function applyPlaceholders(texto, valores) {
    return String(texto == null ? "" : texto).replace(/\{(NF|EGRDT|DATA|QTD)\}/g, (inteiro) => valores[inteiro] ?? "");
  }

  function buildSubject(dados, modelo) {
    const alvo = modelo || readTemplate();
    const valores = placeholderValues(dados);
    // Sem NF nos documentos, {NF} viraria vazio e o assunto ficaria truncado:
    // nesse caso o número da eGRDT entra no lugar.
    if (!valores["{NF}"]) valores["{NF}"] = valores["{EGRDT}"];
    return applyPlaceholders(alvo.assunto || MODELO_PADRAO.assunto, valores).replace(/\s{2,}/g, " ").trim();
  }

  function buildBodyHtml(dados, modelo) {
    const alvo = modelo || readTemplate();
    const valores = placeholderValues(dados);
    if (!valores["{NF}"]) valores["{NF}"] = valores["{EGRDT}"];
    const bruto = (alvo.corpo || MODELO_PADRAO.corpo);
    // O texto do modelo é escapado (não vira HTML); só {TABELA} injeta marcação.
    const paragrafos = applyPlaceholders(bruto, valores)
      .split(/\n{2,}/)
      .map((bloco) => {
        if (bloco.trim() === "{TABELA}") return buildTableHtml(dados);
        const conteudo = escapeHtml(bloco).replace(/\n/g, "<br>");
        return conteudo.trim() ? `<p>${conteudo}</p>` : "";
      })
      .join("\n");
    const comTabela = paragrafos.includes("<table") ? paragrafos : `${paragrafos}\n${buildTableHtml(dados)}`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Segoe UI,Calibri,Arial,sans-serif;font-size:13px;color:#1c2b3a">
${comTabela}
</body></html>`;
  }

  function buildEml(dados, modelo) {
    const info = dados || {};
    const alvo = modelo || readTemplate();
    const to = (alvo.to || []).filter(isValidEmail);
    const cc = (alvo.cc || []).filter(isValidEmail);
    if (!to.length) return { ok: false, error: "Nenhum destinatário definido. O proprietário precisa configurar o modelo do e-mail em Configurações." };

    const assunto = buildSubject(info, alvo);
    const corpo = buildBodyHtml(info, alvo);
    const limite = `GRCON_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const linhas = [
      `To: ${to.join(", ")}`,
      cc.length ? `Cc: ${cc.join(", ")}` : null,
      `Subject: ${encodeHeader(assunto)}`,
      `Date: ${new Date(info.geradoEm || Date.now()).toUTCString()}`,
      "X-Unsent: 1",
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${limite}"`,
      "",
      `--${limite}`,
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(toBase64(corpo)),
      `--${limite}--`,
      "",
    ].filter((linha) => linha !== null);

    return { ok: true, eml: linhas.join("\r\n"), to, cc, subject: assunto, documentos: (info.documentos || []).length };
  }

  function safeFileName(value) {
    return text(value).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "eGRDT";
  }

  function suggestedFileName(dados) {
    const notas = extractNotasFiscais(dados && dados.documentos);
    if (notas.length) return `Evidencia_de_Postagem_${safeFileName(notas.join("_"))}.eml`;
    const egrdts = (dados && dados.egrdts) || [];
    const base = egrdts.length === 1 ? egrdts[0] : `${egrdts.length}_eGRDTs`;
    return `Evidencia_de_Postagem_${safeFileName(base)}.eml`;
  }

  return {
    STORAGE_KEY,
    MODELO_PADRAO,
    MARCADORES,
    parseRecipients,
    isValidEmail,
    extractNotasFiscais,
    readTemplate,
    cacheTemplate,
    validateTemplate,
    buildTableHtml,
    buildBodyHtml,
    buildSubject,
    buildEml,
    suggestedFileName,
  };
});
