function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

export function SigemPwRevisionPager({ page, pages, total, start, pageSize, onPage }: {
  page: number;
  pages: number;
  total: number;
  start: number;
  pageSize: number;
  onPage(page: number): void;
}) {
  const end = Math.min(start + pageSize, total);
  return (
    <div className="spw-rev-pages" id="spw-rev-pages" aria-label="Paginação de Situação das Revisões">
      <span>{total ? fmt(start + 1) + "–" + fmt(end) + " de " + fmt(total) + " · " : ""}Página {fmt(page)} de {fmt(pages)}</span>
      <div className="spw-rev-page-actions">
        <button
          className="secondary-button"
          type="button"
          data-spw-rev-page={page - 1}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Página anterior"
        >
          ← Anterior
        </button>
        <button
          className="secondary-button"
          type="button"
          data-spw-rev-page={page + 1}
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Próxima página"
        >
          Próxima →
        </button>
      </div>
    </div>
  );
}
