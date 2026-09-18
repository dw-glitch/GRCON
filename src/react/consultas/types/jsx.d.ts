/**
 * GRCON — Aumento de tipos JSX para o elemento custom `empty-state`.
 *
 * `<empty-state>` já é usado em outras telas do GRCON (fora do React) com o
 * mesmo CSS de `requests-empty`; aqui só é registrado para o TypeScript
 * aceitá-lo como tag JSX nativa, sem introduzir nenhum comportamento novo.
 */
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "empty-state": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

export {};
