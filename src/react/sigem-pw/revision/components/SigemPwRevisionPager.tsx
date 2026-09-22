function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

export function SigemPwRevisionPager({ page, pages, onPage }: {
  page: number;
  pages: number;
  onPage(page: number): void;
}) {
  return (
    <div className="spw-rev-pages" id="spw-rev-pages">
      <button
        className="secondary-button"
        type="button"
        data-spw-rev-page={Math.max(1, page - 1)}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Anterior
      </button>
      <span>Página {fmt(page)} de {fmt(pages)}</span>
      <button
        className="secondary-button"
        type="button"
        data-spw-rev-page={Math.min(pages, page + 1)}
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
