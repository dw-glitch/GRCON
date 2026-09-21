function fmt(value: number): string { return Number(value || 0).toLocaleString("pt-BR"); }
export function SigemPwPager({ page, pages, total, start, pageSize, onPage }: {
  page: number; pages: number; total: number; start: number; pageSize: number; onPage(page: number): void;
}) {
  const text = total ? `${fmt(start + 1)}–${fmt(Math.min(start + pageSize, total))} de ${fmt(total)} · página ${fmt(page)} de ${fmt(pages)}` : "0 registros";
  return <div className="spw-pager"><span id="spw-page-info">{text}</span><div className="spw-pager-actions"><button className="secondary-button" id="spw-prev" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button><button className="secondary-button" id="spw-next" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima</button></div></div>;
}
