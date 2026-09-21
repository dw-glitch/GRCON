# FASE B — Combinar PDFs — checklist de paridade

Branch: `feat/phase-b-pdf-tools-ui`  
Base: `main@42eca09923c2ac56f08c479524036780c663283d`

## Regra da fase

A FASE B altera somente a camada visual/UX da ilha React. A cadeia abaixo permanece a fonte de verdade do processamento:

```text
React UI
↓
usePdfMerge
↓
pdfMergeAdapter
↓
pdf_merge_core.js
↓
workers/pdf-merge.worker.js
↓
pdf_merge_engine.js
↓
pdf-lib
```

Não duplicar validação, deduplicação, ordenação, sanitização de nome, merge ou progresso no React.

## Checklist funcional antes/depois

- [x] cabeçalho do módulo
- [x] aviso de processamento local
- [x] dropzone clicável
- [x] seletor múltiplo
- [x] drag/drop externo
- [x] Enter e Espaço na dropzone
- [x] validação de PDF
- [x] rejeição de arquivo vazio
- [x] deduplicação
- [x] lista ordenada
- [x] contador via `GrconPdfMergeCore.summarize()`
- [x] tamanho total via Core
- [x] subir
- [x] descer
- [x] drag reorder
- [x] remover
- [x] limpar
- [x] nome de saída
- [x] mínimo de 2 PDFs
- [x] progresso real do Worker
- [x] cancelamento
- [x] merge real
- [x] download automático
- [x] baixar novamente
- [x] resultado
- [x] erros reais do Engine
- [x] invalidação/revogação do resultado quando a lista muda
- [x] navegação repetida sem duplicar root/listeners
- [x] Worker encerrado ao abandonar job
- [x] PWA/offline
- [x] mobile
- [x] dark mode

## Baseline visual observado

Antes da FASE B:

- dropzone permanecia alta depois de adicionar arquivos;
- a lista disputava espaço com a área de entrada;
- ações por linha tinham peso visual elevado;
- posição dos PDFs era pouco dominante;
- painel final mantinha três instruções permanentes;
- progresso mostrava barra e mensagem, mas não o percentual em destaque;
- sucesso era funcional, porém visualmente secundário.

## Mudanças visuais da FASE B

- fluxo compacto `Adicionar → Organizar → Gerar`;
- dropzone vazia ampla e dropzone preenchida compacta;
- lista passa a ser o foco quando há arquivos;
- toolbar de arquivos permanece acessível acima do scroll local;
- posições usam `01, 02, 03...`;
- remover usa ícone local/inline com `aria-label` e `title`;
- lista tem altura controlada no desktop e mobile;
- painel final mantém apenas `Combinar e baixar` como CTA primário;
- estado com menos de 2 PDFs recebe explicação textual;
- progresso mostra percentual + mensagem real do Worker;
- sucesso destaca nome, páginas, tamanho e PDFs utilizados;
- targets mobile de reorder/remover têm área ampliada;
- `prefers-reduced-motion` continua respeitado.

## Performance

Baseline consolidado da FASE A:

| Métrica | Antes |
|---|---:|
| abrir módulo | ~76–99 ms |
| adicionar 20 PDFs | ~21–23 ms |
| reordenar 20 | ~33 ms |
| adicionar 50 | ~33 ms |
| resposta com 50 | ~34 ms |

A FASE B adiciona medição de 100 PDFs e métricas de layout. Variação normal de CI não é tratada como regressão; crescimento relevante precisa ser investigado.

## Critérios de aceite

A entrega só é considerada PASS quando os testes remotos confirmarem:

- 2, 20, 50 e 100 PDFs utilizáveis;
- 1440, 1366, 1024, 768 e 390 sem overflow horizontal global;
- merge A+B e B+A preservando ordem;
- cancelamento real e novo merge posterior;
- PDF corrompido tratado;
- duplicado e inválido rejeitados;
- download automático + baixar novamente;
- PWA/cache aquecido/offline;
- Consultas e Histórico sem regressão;
- bundle React sem `pdf-lib`;
- Core, Worker e Engine sem alteração nesta fase.
