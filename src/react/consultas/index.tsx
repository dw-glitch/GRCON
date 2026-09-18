/**
 * GRCON — Ponto de entrada da ilha React de Consultas.
 *
 * Monta a árvore React apenas dentro de `#grcon-consultas-root`, dentro da
 * área "Consulta de documentos" já existente. A aba "Modelos de exportação"
 * continua com sua própria tela e código legado — nada aqui toca nela.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ConsultasApp } from "./ConsultasApp";

interface ErrorBoundaryState {
  error: unknown;
}

class ConsultasErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo): void {
    console.error("[Consultas/React]", error);
    window.GrconNotify?.("A tela de Consultas encontrou um erro inesperado. Recarregue a página.", "error");
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="requests-panel" role="alert">
          <div className="requests-panel-head"><h3>Não foi possível exibir a Consulta</h3></div>
          <p>Ocorreu um erro inesperado ao carregar a tela. Recarregue a página; se persistir, avise o suporte.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function mount(): void {
  const container = document.getElementById("grcon-consultas-root");
  if (!container) {
    console.error("[Consultas/React] #grcon-consultas-root não encontrado no HTML.");
    return;
  }
  const rootHandle = createRoot(container);
  rootHandle.render(
    <ConsultasErrorBoundary>
      <ConsultasApp />
    </ConsultasErrorBoundary>,
  );
  window.GrconConsultasReact = Object.freeze({ mounted: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
