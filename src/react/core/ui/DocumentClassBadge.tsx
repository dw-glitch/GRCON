type DocumentClassBadgeProps = {
  value?: string | null;
  className?: string;
};

export function DocumentClassBadge({ value, className = "" }: DocumentClassBadgeProps) {
  const raw = String(value ?? "").trim();
  const label = raw || "—";
  const documentClass = raw === "ET" || raw === "N-1710" ? raw : undefined;
  const classes = ["document-class-badge", className].filter(Boolean).join(" ");
  return (
    <span className={classes} data-document-class={documentClass}>
      {label}
    </span>
  );
}
