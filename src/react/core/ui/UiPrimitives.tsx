import type { ReactNode } from "react";

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
