import { useEffect, useRef, type ReactNode } from "react";

export function UiPageHeader({ eyebrow, title, description, meta }: {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header-copy">
        {eyebrow ? <span className="ui-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {meta ? <div className="ui-page-header-meta">{meta}</div> : null}
    </header>
  );
}

export function UiPanel({ children, className = "", labelledBy }: {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section className={`ui-panel ${className}`.trim()} aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}

export function UiMetaPill({ children, className = "" }: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`ui-meta-pill ${className}`.trim()}>{children}</span>;
}

export function UiDrawer({
  open,
  onClose,
  labelledBy,
  children,
  drawerClassName,
  overlayClassName,
  drawerId,
  overlayId,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  drawerClassName: string;
  overlayClassName: string;
  drawerId?: string;
  overlayId?: string;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousFocusIdentityRef = useRef<{
    id: string;
    analysisId: string;
    ariaLabel: string;
    tagName: string;
  } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousFocusRef.current = previousFocus;
    previousFocusIdentityRef.current = previousFocus ? {
      id: previousFocus.id || "",
      analysisId: previousFocus.getAttribute("data-analysis-id") || "",
      ariaLabel: previousFocus.getAttribute("aria-label") || "",
      tagName: previousFocus.tagName,
    } : null;
    body.style.overflow = "hidden";
    drawerRef.current?.focus();

    const getFocusable = () => {
      const drawer = drawerRef.current;
      if (!drawer) return [] as HTMLElement[];
      return Array.from(drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.getAttribute("aria-hidden") !== "true");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        drawer.focus();
        return;
      }

      const active = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focusIsOutside = !(active instanceof Node) || !drawer.contains(active);

      if (event.shiftKey && (active === drawer || active === first || focusIsOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === drawer || active === last || focusIsOutside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      body.style.overflow = previousOverflow;
      const previousFocus = previousFocusRef.current;
      const identity = previousFocusIdentityRef.current;
      let focusTarget = previousFocus?.isConnected ? previousFocus : null;

      // A tabela pode rerenderizar enquanto o drawer está aberto. Nesse caso o
      // nó que tinha foco deixa de estar conectado, embora exista um equivalente
      // atual. Reencontre-o por identidade estável antes de devolver o foco.
      if (!focusTarget && identity) {
        if (identity.id) {
          const byId = document.getElementById(identity.id);
          if (byId instanceof HTMLElement) focusTarget = byId;
        }
        if (!focusTarget && identity.analysisId) {
          focusTarget = Array.from(document.querySelectorAll<HTMLElement>("[data-analysis-id]")).find((element) => (
            element.tagName === identity.tagName
            && element.getAttribute("data-analysis-id") === identity.analysisId
          )) || null;
        }
        if (!focusTarget && identity.ariaLabel) {
          focusTarget = Array.from(document.querySelectorAll<HTMLElement>("[aria-label]")).find((element) => (
            element.tagName === identity.tagName
            && element.getAttribute("aria-label") === identity.ariaLabel
          )) || null;
        }
      }

      focusTarget?.focus();
      previousFocusRef.current = null;
      previousFocusIdentityRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        className={overlayClassName}
        id={overlayId}
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => onCloseRef.current()}
      />
      <aside
        ref={drawerRef}
        className={drawerClassName}
        id={drawerId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </aside>
    </>
  );
}
