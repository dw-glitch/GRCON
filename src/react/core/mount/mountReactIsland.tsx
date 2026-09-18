import type { ReactElement, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ReactIslandErrorBoundary } from "../components/ReactIslandErrorBoundary";

export interface MountReactIslandOptions {
  containerId: string;
  islandName: string;
  element: ReactElement;
  fallback: ReactNode;
  notifyMessage: string;
}

export function mountReactIsland(options: MountReactIslandOptions): boolean {
  const container = document.getElementById(options.containerId);
  if (!container) {
    console.error(`[${options.islandName}/React] #${options.containerId} não encontrado no HTML.`);
    return false;
  }

  if (container.dataset.grconReactIslandMounted === options.islandName) return true;

  const root = createRoot(container);
  container.dataset.grconReactIslandMounted = options.islandName;
  root.render(
    <ReactIslandErrorBoundary
      islandName={options.islandName}
      notifyMessage={options.notifyMessage}
      fallback={options.fallback}
    >
      {options.element}
    </ReactIslandErrorBoundary>,
  );
  return true;
}
