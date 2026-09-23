# FASE B — Histórico de análises — checklist de paridade

> Inventário registrado a partir de `docs/react-phase-a-history-parity.md` e da implementação React da `main` antes do redesenho visual.  
> Escopo: apresentação/UX do Histórico de análises. O domínio continua em `GrconAnalysisHistory`, `GrconAnalysisHistoryReport`, `GrconMacro5Flow`, Histórico/eGRDT, SIGEM e Module Loader.

## Fronteira arquitetural

- [x] React Island permanece em `src/react/historico-analises/`.
- [x] Hook continua coordenando estado e efeitos.
- [x] `historicoAnalisesAdapter.ts` continua sendo a fronteira com APIs globais.
- [x] `analysis_history_core.js` não recebe lógica de UI.
- [x] Nenhuma regra de EAP, TAG, LD, ET, CV, N-1710, RIR, C&M, revisão, SIGEM, GRDT/eGRDT, alocação ou Databook foi copiada para React.
- [x] Nenhuma alteração de Supabase, schema, RLS, RPC ou migração.

## Cabeçalho e gerenciamento

- [x] Rastreabilidade das análises.
- [x] Todos os documentos analisados pelo GRCON.
- [x] Metadados de análises/documentos derivados do estado existente.
- [x] Fazer backup.
- [x] Restaurar backup.
- [x] Input JSON de restauração.
- [x] Excluir análise selecionada.
- [x] Limpar todo o histórico.
- [x] Confirmações, auditoria e permissões existentes continuam no adapter/motores.
- [x] Ações destrutivas ficam visualmente secundárias em Gerenciar histórico.

## Busca de rastreabilidade

- [x] Busca simultânea no Histórico de eGRDT e no Histórico de análises.
- [x] Um item por linha.
- [x] Enter executa busca.
- [x] Shift+Enter cria nova linha.
- [x] Buscar.
- [x] Limpar.
- [x] Contador de eGRDT.
- [x] Contador de análises.
- [x] Detalhes dos dois conjuntos.
- [x] Estado sem resultado.
- [x] Lógica continua em `historicoAnalisesAdapter.unifiedSearch`.

## Filtros principais

- [x] Busca textual por campos já suportados pelo Core.
- [x] Debounce existente de 300 ms.
- [x] Situação ALL/READY/BLOCKED/DISCARD/REVIEW.
- [x] Data inicial.
- [x] Data final.
- [x] Regra data final >= data inicial.
- [x] Mensagem de período inválido preservada.
- [x] Período inválido não é enviado ao IndexedDB.
- [x] Análise executada.
- [x] Mudança de filtro retorna à página 1.
- [x] Sem botão Aplicar; filtros permanecem reativos.

## Filtros rápidos

- [x] Hoje.
- [x] Últimos 7 dias.
- [x] Pendências.
- [x] Incluídos.
- [x] Semântica existente preservada.
- [x] Estado ativo perceptível por `aria-pressed` e estilo.

## Filtros salvos

- [x] Selecionar filtro.
- [x] Carregar filtro.
- [x] Salvar filtro atual.
- [x] Nome via prompt existente.
- [x] Excluir filtro.
- [x] Confirmação de exclusão.
- [x] Persistência por `GrconMacro5Flow`.
- [x] Notificações existentes.

## Resumo / KPIs

- [x] Análises.
- [x] Documentos.
- [x] Incluir.
- [x] Não incluir.
- [x] Aguardar.
- [x] Conferir.
- [x] KPIs de situação reutilizam READY/BLOCKED/DISCARD/REVIEW.
- [x] Clique no KPI altera apenas o filtro existente.
- [x] Nenhuma classificação paralela criada.

## Resultados e tabela

- [x] Área Resultados possui hierarquia própria.
- [x] Total de documentos.
- [x] Exibindo X de Y quando há filtros ativos.
- [x] Filtros ativos legíveis.
- [x] Documento.
- [x] Resultado GRCON.
- [x] Revisão atual.
- [x] Próxima revisão.
- [x] Status da revisão.
- [x] SIGEM.
- [x] Alocação.
- [x] Analisado em.
- [x] LD.
- [x] Código do motivo.
- [x] Explicação do motivo.
- [x] Revisões combinadas visualmente em atual → próxima sem perda de valores.
- [x] Motivo continua visível na tabela e completo nos detalhes.
- [x] Linha abre por clique.
- [x] Linha abre por Enter.
- [x] Linha abre por Espaço.
- [x] `tabIndex=0`.
- [x] `aria-label`.
- [x] Foco visível.
- [x] Valores ausentes continuam representados por —.

## Responsividade

- [x] Tabela continua desktop em telas amplas.
- [x] Abaixo de aproximadamente 960 px vira cartões.
- [x] Todos os dados recebem labels nos cartões.
- [x] Sem scroll lateral da página inteira por desenho.
- [x] Códigos permitem quebra de linha.
- [x] Drawer limitado à viewport.
- [x] Timeline compacta.

## Paginação

- [x] 200 registros por página.
- [x] Anterior.
- [x] Próxima.
- [x] Página X de Y.
- [x] N documentos.
- [x] Paginação não altera filtros.
- [x] Exportação não é limitada à página atual.

## Detalhes / drawer

- [x] Decisão desta análise.
- [x] Evidência e motivo.
- [x] Linha do tempo.
- [x] eGRDT relacionada.
- [x] Drawer usa comportamento compartilhado `UiDrawer`.
- [x] `role="dialog"`.
- [x] `aria-modal="true"`.
- [x] Trap de foco.
- [x] Escape.
- [x] Overlay.
- [x] Scroll interno.
- [x] Scroll lock do body.
- [x] Restauração de foco ao elemento de origem.
- [x] Conteúdo específico continua no módulo.

### Decisão
- [x] Analisado em.
- [x] Resultado GRCON.
- [x] Revisão atual.
- [x] Próxima revisão.
- [x] Status da revisão.
- [x] SIGEM.
- [x] Situação da postagem.
- [x] Alocação + número.
- [x] LD utilizada + aba + linha.
- [x] Caminho Databook.

### Evidência
- [x] Código do motivo.
- [x] Explicação.
- [x] Comentário da Fiscal.
- [x] Origem da entrada.
- [x] Arquivos originais.
- [x] Arquivos finais.
- [x] Comparação com análise anterior.
- [x] Mensagem quando não há mudança material.

### Timeline
- [x] Dados continuam vindo do `Flow.analysisTimeline`.
- [x] Data/hora.
- [x] Resultado.
- [x] Revisão atual → alvo.
- [x] SIGEM.
- [x] Mudança/motivo.
- [x] Ordem existente preservada, com mais recente exibido primeiro.

### eGRDT relacionada
- [x] Relação continua vindo de `Flow.relatedEgrdt`.
- [x] Número da eGRDT.
- [x] Data/hora.
- [x] Quantidade de documentos.
- [x] Abrir eGRDT no histórico.
- [x] Preparar no SIGEM.
- [x] Eventos e APIs de Histórico/SIGEM preservados.

## Exportação Excel

- [x] `GrconAnalysisHistoryReport` continua sendo a fonte.
- [x] Todos os documentos filtrados.
- [x] Sessões referenciadas.
- [x] Não exporta apenas a página atual.
- [x] Estado Gerando relatório….
- [x] Botão fica na área de Resultados.
- [x] Período inválido continua bloqueando exportação.

## Persistência e ações

- [x] Backup usa `Core.exportBackup()`.
- [x] Restauração usa `Core.importBackup(..., { replace: true })`.
- [x] Exclusão de sessão usa `Core.deleteSession(id)`.
- [x] Limpeza usa `Core.clearAll()`.
- [x] Auditoria da limpeza preservada.
- [x] Evento `grcon:analysis-history-updated` preservado.
- [x] Notificações preservadas.

## Estados e atalhos

- [x] Carregando histórico….
- [x] Nenhum documento localizado.
- [x] Execute uma análise ou ajuste os filtros.
- [x] Erro do motor/fallback existente.
- [x] Período inválido explícito.
- [x] Gerando relatório….
- [x] Atalho externo continua encontrando `#analysis-history-search`.
- [x] IDs externos de compatibilidade permanecem.

## Design System e regressão

- [x] `UiPageHeader` reutilizado.
- [x] `UiPanel` reutilizado.
- [x] `UiMetaPill` formalizado a partir do padrão CSS já usado por Consultas.
- [x] `UiDrawer` contém apenas comportamento genérico comum.
- [x] Consultas mantém classes e conteúdo visual do drawer existente.
- [ ] Typecheck — validar em CI.
- [ ] Build — validar em CI.
- [ ] Testes — validar em CI.
- [ ] Chromium Histórico — validar em workflow.
- [ ] Chromium Consultas — revalidar em workflow.
- [ ] Dark mode — validar por screenshots.
- [ ] Service Worker/cache frio/cache quente — validar por browser.
- [ ] Console — validar por browser.
- [ ] Vercel Preview — validar após abertura da PR.
