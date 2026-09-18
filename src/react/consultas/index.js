/**
 * GRCON — Ponto de entrada da ilha React de Consultas.
 *
 * Monta a árvore React apenas dentro de `#grcon-consultas-root`, dentro da
 * área "Consulta de documentos" já existente. A aba "Modelos de exportação"
 * continua com sua própria tela e código legado — nada aqui toca nela.
 */
(function (root) {
  "use strict";

  const React = root.React;
  const ReactDOM = root.ReactDOM;
  const h = React.createElement;

  class ConsultasErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
      return { error };
    }

    componentDidCatch(error) {
      console.error("[Consultas/React]", error);
      root.GrconNotify?.("A tela de Consultas encontrou um erro inesperado. Recarregue a página.", "error");
    }

    render() {
      if (this.state.error) {
        return h("div", { className: "requests-panel", role: "alert" },
          h("div", { className: "requests-panel-head" }, h("h3", null, "Não foi possível exibir a Consulta")),
          h("p", null, "Ocorreu um erro inesperado ao carregar a tela. Recarregue a página; se persistir, avise o suporte."));
      }
      return this.props.children;
    }
  }

  function mount() {
    const container = document.getElementById("grcon-consultas-root");
    if (!container) {
      console.error("[Consultas/React] #grcon-consultas-root não encontrado no HTML.");
      return;
    }
    const rootHandle = ReactDOM.createRoot(container);
    rootHandle.render(h(ConsultasErrorBoundary, null, h(root.GrconConsultasApp)));
    root.GrconConsultasReact = Object.freeze({ mounted: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})(window);
