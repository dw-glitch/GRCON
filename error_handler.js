(function () {
  "use strict";

  const ERROR_CATALOG = {
    // Erros de arquivo e estrutura
    LD_CORRUPTED: {
      code: "LD_CORRUPTED",
      title: "LD corrompida ou incompleta",
      icon: "⚠️",
      severity: "error",
      getMessage: (details) => "A LD está corrompida, truncada ou não é um arquivo Excel válido.",
      getAction: () => "Exporte a LD novamente do sistema de origem, copie para um local seguro e tente carregar.",
      getContext: (details) => details?.fileName ? `Arquivo: ${details.fileName}` : null,
    },

    LD_INTEGRITY_FAILED: {
      code: "LD_INTEGRITY_FAILED",
      title: "Integridade da LD reprovada",
      icon: "🔍",
      severity: "error",
      getMessage: (details) => details?.issues?.join(" · ") || "A LD não passou na verificação de integridade.",
      getAction: () => "Verifique se a LD contém as abas técnicas (ET, CV, N-1710) e a aba 'Colar SIGEM' com histórico de postagens.",
      getContext: (details) => details?.ldName || null,
    },

    LD_EMPTY: {
      code: "LD_EMPTY",
      title: "LD sem conteúdo válido",
      icon: "📄",
      severity: "error",
      getMessage: () => "A LD precisa conter ao menos uma aba técnica e uma base de status do SIGEM.",
      getAction: () => "Confirme que você carregou a LD controlada correta e que ela possui dados nas abas técnicas.",
      getContext: (details) => details?.sheets ? `Abas encontradas: ${details.sheets.join(", ")}` : null,
    },

    NO_DOCUMENTS_FOUND: {
      code: "NO_DOCUMENTS_FOUND",
      title: "Nenhum documento válido encontrado",
      icon: "📂",
      severity: "warning",
      getMessage: (details) => {
        if (details?.source === "folder") return "Nenhum documento válido foi encontrado na pasta selecionada.";
        if (details?.source === "list") return "A lista Excel não contém documentos reconhecidos ou não há PDFs correspondentes.";
        return "Nenhum documento válido foi encontrado para análise.";
      },
      getAction: (details) => {
        if (details?.source === "folder") return "Confirme que a pasta contém PDFs válidos e que os nomes seguem o padrão esperado (código do documento no início).";
        if (details?.source === "list") return "Verifique se a lista Excel possui coluna DOCUMENTO, ARQUIVO ou PDF com códigos válidos.";
        return "Verifique os arquivos de entrada e tente novamente.";
      },
      getContext: (details) => {
        if (details?.fileCount) return `${details.fileCount} arquivo(s) encontrado(s), mas nenhum reconhecido como documento válido.`;
        return null;
      },
    },

    ALLOCATION_MISMATCH: {
      code: "ALLOCATION_MISMATCH",
      title: "Inconsistência na alocação",
      icon: "⚡",
      severity: "warning",
      getMessage: (details) => {
        const doc = details?.document || "documento";
        const status = details?.allocationStatus || "status inconsistente";
        return `${doc} está marcado como "${status}" mas possui número de alocação preenchido.`;
      },
      getAction: () => "Corrija a coluna 'Confirmação de Alocação' (ou 'Status de Alocação') na LD para refletir o estado real.",
      getContext: (details) => {
        const parts = [];
        if (details?.allocation) parts.push(`Alocação: ${details.allocation}`);
        if (details?.sheet) parts.push(`Aba: ${details.sheet}`);
        if (details?.row) parts.push(`Linha: ${details.row}`);
        return parts.length ? parts.join(" · ") : null;
      },
    },

    XLSX_LOAD_FAILED: {
      code: "XLSX_LOAD_FAILED",
      title: "Erro ao processar arquivo Excel",
      icon: "📊",
      severity: "error",
      getMessage: (details) => {
        const fileName = details?.fileName || "arquivo";
        return `Não foi possível processar ${fileName}.`;
      },
      getAction: () => "Confirme que o arquivo não está aberto em outro programa, não está protegido e é um formato Excel válido (.xlsx, .xls, .xlsm).",
      getContext: (details) => details?.error || null,
    },

    ANALYSIS_CANCELLED: {
      code: "ANALYSIS_CANCELLED",
      title: "Análise cancelada",
      icon: "⏸️",
      severity: "info",
      getMessage: () => "A análise foi cancelada e nenhum resultado parcial foi usado.",
      getAction: () => "Você pode iniciar uma nova análise quando estiver pronto.",
      getContext: () => null,
    },

    EGRDT_GENERATION_FAILED: {
      code: "EGRDT_GENERATION_FAILED",
      title: "Erro ao gerar eGRDT",
      icon: "📋",
      severity: "error",
      getMessage: (details) => details?.message || "Não foi possível gerar o arquivo eGRDT oficial.",
      getAction: () => "Verifique se há documentos selecionados, se todos estão aptos e se a sequência da eGRDT é válida.",
      getContext: (details) => {
        const parts = [];
        if (details?.selectedCount !== undefined) parts.push(`${details.selectedCount} documento(s) selecionado(s)`);
        if (details?.readyCount !== undefined) parts.push(`${details.readyCount} pronto(s)`);
        return parts.length ? parts.join(" · ") : null;
      },
    },

    REPORT_GENERATION_FAILED: {
      code: "REPORT_GENERATION_FAILED",
      title: "Erro ao gerar relatório",
      icon: "📄",
      severity: "error",
      getMessage: () => "Não foi possível gerar o relatório Excel.",
      getAction: () => "Tente novamente. Se o problema persistir, verifique se há espaço em disco disponível.",
      getContext: (details) => details?.error || null,
    },

    ZIP_GENERATION_FAILED: {
      code: "ZIP_GENERATION_FAILED",
      title: "Erro ao criar pacote ZIP",
      icon: "🗜️",
      severity: "error",
      getMessage: () => "Não foi possível criar o pacote ZIP com os arquivos.",
      getAction: () => "Confirme que há espaço em disco disponível e que os arquivos não foram movidos ou excluídos.",
      getContext: (details) => {
        if (details?.fileCount) return `${details.fileCount} arquivo(s) esperado(s)`;
        return null;
      },
    },

    GENERIC_ERROR: {
      code: "GENERIC_ERROR",
      title: "Erro inesperado",
      icon: "❌",
      severity: "error",
      getMessage: (details) => details?.message || "Ocorreu um erro inesperado durante o processamento.",
      getAction: () => "Tente novamente. Se o problema persistir, recarregue a página e comece uma nova análise.",
      getContext: (details) => details?.stack ? "Detalhes do erro disponíveis no console do navegador." : null,
    },
  };

  function classifyError(error, context) {
    const rawMessage = String(error?.message || "");
    const ctx = context || {};

    // LD corrompida
    if (/bad compressed size|invalid zip|central directory|unexpected end|corrupt|truncated/i.test(rawMessage)) {
      return { type: ERROR_CATALOG.LD_CORRUPTED, details: { fileName: ctx.fileName } };
    }

    // Integridade LD
    if (/integridade.*reprovada|integrity.*failed/i.test(rawMessage)) {
      const issues = rawMessage.match(/reprovada:\s*(.+)$/)?.[1]?.split(/[;,]/) || [];
      return { type: ERROR_CATALOG.LD_INTEGRITY_FAILED, details: { issues, ldName: ctx.ldName } };
    }

    // LD vazia
    if (/precisa conter ao menos|no technical sheets|no history/i.test(rawMessage)) {
      return { type: ERROR_CATALOG.LD_EMPTY, details: { sheets: ctx.sheets } };
    }

    // Sem documentos
    if (/nenhum documento|no documents|nenhum PDF/i.test(rawMessage)) {
      return { type: ERROR_CATALOG.NO_DOCUMENTS_FOUND, details: { source: ctx.source, fileCount: ctx.fileCount } };
    }

    // Cancelamento
    if (error?.name === "AbortError" || /cancel|abort/i.test(rawMessage)) {
      return { type: ERROR_CATALOG.ANALYSIS_CANCELLED, details: {} };
    }

    // XLSX
    if (/xlsx|excel|workbook/i.test(rawMessage) || ctx.fileType === "xlsx") {
      return { type: ERROR_CATALOG.XLSX_LOAD_FAILED, details: { fileName: ctx.fileName, error: rawMessage } };
    }

    // eGRDT
    if (ctx.operation === "egrdt" || /gerar.*egrdt/i.test(rawMessage)) {
      return { 
        type: ERROR_CATALOG.EGRDT_GENERATION_FAILED, 
        details: { message: rawMessage, selectedCount: ctx.selectedCount, readyCount: ctx.readyCount } 
      };
    }

    // Relatório
    if (ctx.operation === "report" || /relat[oó]rio/i.test(rawMessage)) {
      return { type: ERROR_CATALOG.REPORT_GENERATION_FAILED, details: { error: rawMessage } };
    }

    // ZIP
    if (ctx.operation === "zip" || /zip|compress|pacote/i.test(rawMessage)) {
      return { type: ERROR_CATALOG.ZIP_GENERATION_FAILED, details: { fileCount: ctx.fileCount } };
    }

    // Genérico
    return { 
      type: ERROR_CATALOG.GENERIC_ERROR, 
      details: { message: rawMessage, stack: error?.stack } 
    };
  }

  function formatSmartError(error, context) {
    const { type, details } = classifyError(error, context);
    
    const message = type.getMessage(details);
    const action = type.getAction(details);
    const contextInfo = type.getContext(details);

    return {
      code: type.code,
      title: type.title,
      icon: type.icon,
      severity: type.severity,
      message,
      action,
      context: contextInfo,
      fullMessage: [message, action, contextInfo].filter(Boolean).join(" "),
    };
  }

  function showSmartError(error, context) {
    const formatted = formatSmartError(error, context);
    
    if (window.showToast) {
      window.showToast(formatted.fullMessage, formatted.severity === "info" ? "info" : formatted.severity === "warning" ? "warn" : "error");
    }

    // Log detalhado no console
    console.group(`${formatted.icon} ${formatted.title} [${formatted.code}]`);
    console.error("Mensagem:", formatted.message);
    if (formatted.action) console.info("Ação:", formatted.action);
    if (formatted.context) console.info("Contexto:", formatted.context);
    if (error?.stack) console.debug("Stack trace:", error.stack);
    console.groupEnd();

    return formatted;
  }

  window.GrconErrorHandler = Object.freeze({
    ERROR_CATALOG,
    classifyError,
    formatSmartError,
    showSmartError,
  });
})();
