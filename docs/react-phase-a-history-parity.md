# FASE A — Checklist de paridade do Histórico de análises

> Registro obrigatório feito **antes de remover a UI legada**.  
> Base: `main` em `a4aaa115cb2c5dc84fbbd76429b99190619e13e9`.

## Baseline

| Verificação | Resultado | Observação |
| --- | --- | --- |
| GitHub Actions `Validação` na main | PASS | run 35355668392 |
| GitHub Actions mascote na main | PASS | run 35355668388 |
| Vercel produção da main | PASS | deployment concluído |
| `npm ci --ignore-scripts` remoto | PASS | mesmo commit da main |
| `npm run typecheck` remoto | PASS | mesmo commit da main |
| `npm run build` remoto | PASS | `react-dist/consultas-app.js` gerado |
| `npm test` remoto | PASS | suíte completa |
| `npm run verify` remoto Node 20 | NÃO APLICÁVEL | ambiente remoto usa Node 20 e falha em `import.meta.dirname`; projeto exige Node >=22 |
| `npm run verify` GitHub Actions Node 22 | PASS | workflow oficial da main |

## Contratos legados que continuam sendo a fonte da verdade

- `window.GrconAnalysisHistory` / `analysis_history_core.js`
  - `listSessions()`
  - `queryDocuments(filters, options)`
  - `allDocuments(filters)`
  - `summary()` / índices e agregações internas
  - `deleteSession(id)`
  - `clearAll()`
  - `exportBackup()`
  - `importBackup(payload, { replace: true })`
  - `storageEstimate()`
  - `norm()`, `statusKey()`, `statusLabel()`
- `window.GrconAnalysisHistoryReport` / `analysis_history_report.js`
  - `buildWorkbook()`
  - `downloadName()`
- `window.GrconMacro5Flow`
  - filtros salvos
  - `analysisTimeline()`
  - `relatedEgrdt()`
- `window.GrconHistory` / `window.GrconHistoryUi`
  - leitura do histórico de eGRDT
  - abertura de eGRDT relacionada
- `window.GrconSigemPosting` / `window.GrconSigemUi`
  - preparação da eGRDT relacionada para SIGEM
- `window.GRCONModuleLoader`
  - carregamento de Histórico, SIGEM, Excel e marca
- `window.GrconNotify`
  - notificações
- Nenhuma regra documental será copiada para React.

## Checklist visual e de controles

### Cabeçalho
- [x] faixa `RASTREABILIDADE DAS ANÁLISES`
- [x] título `Todos os documentos analisados pelo GRCON`
- [x] texto explicativo existente
- [x] botão `Fazer backup`
- [x] botão `Restaurar backup`
- [x] input JSON oculto para restauração
- [x] botão `Excluir análise selecionada`
- [x] botão `Limpar todo o histórico`
- [x] IDs externos necessários permanecem disponíveis quando aplicável

### Busca unificada
- [x] título e texto explicativo
- [x] textarea aceita um código/nome por linha
- [x] Enter sem Shift executa a busca
- [x] Shift+Enter continua inserindo nova linha
- [x] botão `Buscar`
- [x] botão `Limpar`
- [x] contador de eGRDTs no Histórico
- [x] contador de documentos no Histórico de análises
- [x] detalhes de eGRDT: número, tipo de saída, quantidade de documentos
- [x] detalhes de análise: documento, resultado entregue, situação da alocação
- [x] estado sem resultado
- [x] limpar esconde resultados/detalhes e zera contadores

### Filtros principais
- [x] Busca geral
  - documento
  - título
  - motivo/código do motivo
  - GRDT
  - alocação
  - demais campos já pesquisados pelo `Core.matches()`
- [x] Situação entregue:
  - Todas / `ALL`
  - Será incluído na eGRDT / `READY`
  - Não será incluído / `BLOCKED`
  - Não será enviado novamente / `DISCARD`
  - Precisa de conferência / `REVIEW`
- [x] Data inicial
- [x] Data final
- [x] período inválido quando final < inicial
- [x] mensagem de validade: `A data final deve ser igual ou posterior à data inicial.`
- [x] Análise executada
- [x] opção `Todas as análises`
- [x] opções mostram data/hora, total de docs e nome da LD
- [x] mudança de filtro volta para página 1
- [x] busca textual usa debounce de aproximadamente 300 ms
- [x] demais filtros mantêm atualização sem exigir botão Aplicar

### Filtros rápidos
- [x] Hoje: início=fim=hoje e status ALL
- [x] Últimos 7 dias: hoje e seis dias anteriores, status ALL
- [x] Pendências: status REVIEW e período limpo
- [x] Incluídos: status READY e período limpo

### Filtros salvos
- [x] select `Filtro salvo`
- [x] opção inicial `Selecionar filtro`
- [x] carregar filtro aplica query/status/datas/sessão e volta à página 1
- [x] botão `Salvar filtro atual`
- [x] prompt pede nome, sugerindo filtro atual ou `Meu filtro`
- [x] persistência continua por `GrconMacro5Flow`
- [x] erro de gravação é notificado
- [x] botão `Excluir filtro`
- [x] botão fica disabled sem filtro selecionado
- [x] exclusão pede confirmação
- [x] exclusão atualiza lista e notifica sucesso

### Resumo
- [x] cartão `Análises`
- [x] cartão `Documentos`
- [x] cartão `Incluir`
- [x] cartão `Não incluir`
- [x] cartão `Aguardar`
- [x] cartão `Conferir`
- [x] mesmas classes/tons atuais
- [x] números formatados em pt-BR

### Tabela
Ordem obrigatória:
- [x] Analisado em
- [x] Documento
- [x] Revisão atual
- [x] Próxima revisão
- [x] Resultado GRCON
- [x] SIGEM
- [x] Alocação
- [x] LD
- [x] Motivo

Conteúdo:
- [x] data e hora em duas linhas
- [x] documento + título
- [x] revisão atual
- [x] próxima revisão + status da revisão
- [x] chip do Resultado GRCON com mesma classificação
- [x] chip SIGEM com mesma classificação
- [x] situação da alocação + número da alocação
- [x] versão da LD + aba/linha
- [x] código do motivo + explicação
- [x] valores ausentes exibem `—`
- [x] paginação continua em 200 registros por página
- [x] ordem padrão continua sendo data de análise desc + documento
- [x] linha abre detalhes por clique
- [x] linha abre detalhes por Enter
- [x] linha abre detalhes por Espaço
- [x] `tabIndex=0` e rótulo acessível da linha
- [x] CSS atual continua convertendo tabela em cartões nas telas estreitas

### Estados da tabela
- [x] loading: `Carregando histórico…`
- [x] vazio: `Nenhum documento localizado`
- [x] vazio: `Execute uma análise ou ajuste os filtros.`
- [x] erro: mensagem do motor ou `Não foi possível abrir o histórico.`
- [x] erro gera notificação
- [x] resultado mostra `N documento(s)`

### Paginação
- [x] botão Anterior
- [x] botão Próxima
- [x] estados disabled corretos
- [x] `Página X de Y · N documento(s)`
- [x] sem resultados: `Nenhum documento`
- [x] troca de página não altera os filtros

### Armazenamento
- [x] texto padrão: histórico local deste navegador
- [x] quando disponível, mostra uso/quota via `navigator.storage.estimate()`
- [x] formatação B/KB/MB/GB preservada
- [x] fallback de armazenamento existente continua funcional

## Detalhes do documento

### Abertura/fechamento
- [x] painel lateral e overlay
- [x] título recebe o documento
- [x] estado `Carregando comparação…`
- [x] botão × fecha
- [x] clique no overlay fecha
- [x] Escape fecha
- [x] foco vai para botão fechar após carregamento
- [x] erro de detalhe fica isolado no painel
- [x] fechar limpa seleção visual/lógica do detalhe

### Decisão desta análise
- [x] Analisado em
- [x] Resultado GRCON
- [x] Revisão atual
- [x] Próxima revisão
- [x] Status da revisão
- [x] SIGEM
- [x] Situação da postagem
- [x] Alocação: status + número
- [x] LD utilizada: versão + aba + linha
- [x] Caminho Databook

### Evidência e motivo
- [x] Código do motivo
- [x] Explicação
- [x] Comentário da Fiscal
- [x] Origem da entrada
- [x] Arquivos originais
- [x] Arquivos finais
- [x] comparação com análise anterior:
  - Resultado GRCON
  - SIGEM
  - Próxima revisão
- [x] mensagem quando não houve mudança material

### Linha do tempo
- [x] consulta todas as ocorrências do documento
- [x] correspondência exata usa `Core.norm`
- [x] ordenação/timeline continua vindo de `Flow.analysisTimeline` quando disponível
- [x] exibe data/hora, situação, revisão atual→alvo, SIGEM e mudanças/motivo
- [x] ordem visual continua invertida para mais recente primeiro
- [x] estado sem análise anterior

### eGRDT relacionada
- [x] relação continua vindo de `Flow.relatedEgrdt`
- [x] mostra número da eGRDT
- [x] mostra data/hora
- [x] mostra quantidade de documentos
- [x] botão `Abrir eGRDT no histórico`
- [x] carrega módulo Histórico antes de selecionar
- [x] botão `Preparar no SIGEM`
- [x] registra postagem via `GrconSigemPosting.registerGenerated`
- [x] carrega módulo SIGEM antes de selecionar postagem
- [x] quando não há eGRDT relacionada, mantém a mensagem atual

## Ações destrutivas e persistência

### Excluir análise selecionada
- [x] disabled sem sessão específica
- [x] pede confirmação com data/hora e quantidade de documentos
- [x] usa `Core.deleteSession(id)`
- [x] limpa seleção da sessão
- [x] volta à página 1
- [x] atualiza a tela
- [x] emite `grcon:analysis-history-updated`
- [x] notifica sucesso

### Limpar todo o histórico
- [x] não faz nada quando não existem sessões
- [x] exige confirmação destrutiva
- [x] preserva a camada de confirmação de segurança existente
- [x] preserva auditoria `historico_analises_limpo`
- [x] usa `Core.clearAll()`
- [x] volta à página 1
- [x] atualiza a tela
- [x] emite `grcon:analysis-history-updated`
- [x] notifica sucesso

### Backup
- [x] usa `Core.exportBackup()`
- [x] JSON
- [x] nome `GRCON_Backup_Historico_Analises_<timestamp>.json`
- [x] download local
- [x] notifica sucesso/erro

### Restaurar backup
- [x] aceita JSON
- [x] parseia arquivo local
- [x] confirma substituição do histórico atual
- [x] usa `Core.importBackup(..., { replace: true })`
- [x] volta à página 1
- [x] atualiza
- [x] emite `grcon:analysis-history-updated`
- [x] informa quantidade restaurada
- [x] limpa o valor do input mesmo em erro/cancelamento

## Exportação Excel
- [x] disabled sem resultados
- [x] disabled em período inválido
- [x] loading: `Gerando relatório…`
- [x] texto normal sem período: `Baixar relatório Excel`
- [x] texto normal com período: `Baixar relatório do período`
- [x] usa todos os documentos filtrados, não apenas a página
- [x] sessões exportadas são somente as referenciadas pelos documentos
- [x] carrega `excel` e `brand` pelo Module Loader
- [x] usa `GrconAnalysisHistoryReport.buildWorkbook`
- [x] usa `GrconAnalysisHistoryReport.downloadName`
- [x] MIME XLSX preservado
- [x] notifica quantidade exportada
- [x] erro não derruba o módulo
- [x] ao terminar, estado exporting volta ao normal

## Integrações e contratos externos
- [x] `window.GrconAnalysisHistoryUi` continua existindo para o shell
- [x] `GrconAnalysisHistoryUi.render()` continua atualizando o módulo
- [x] compatibilidade de `openDetail` é preservada se ainda houver consumidor
- [x] `history_app.js` consegue ativar Histórico de análises e focar `#analysis-history-search`
- [x] `grcon_module_loader.js` considera a ilha pronta somente após global esperado existir
- [x] evento externo `grcon:analysis-history-updated` atualiza React uma única vez
- [x] `productivity_center.js` continua conseguindo limpar e atualizar o Histórico
- [x] atalho de busca de `grcon-ui-fix.js` continua encontrando `#analysis-history-search`
- [x] contador `#analysis-history-tab-count` continua atualizado
- [x] contador `#ops-analysis-history-count` continua atualizado
- [x] CSS `analysis-history.css` e regras complementares em `grcon-final.css` são reutilizados
- [x] não há listener legado concorrendo com React
- [x] não há mais de um root React ativo
- [x] abrir Histórico → outro módulo → Histórico repetidamente não duplica listeners/timers/requisições

## PWA, loader e segurança
- [x] bundle `react-dist/historico-analises-app.js` incluído no loader
- [x] dependências de domínio carregam antes da ilha
- [x] bundle incluído no Service Worker
- [x] cache versionado
- [x] atualização de versão anterior não mistura HTML/JS incompatíveis
- [x] reload com Service Worker ativo funciona
- [x] manifest continua funcionando
- [x] CSP não recebe `unsafe-eval`
- [x] CSP não recebe novo `unsafe-inline`
- [x] sem CDN
- [x] bundle não contém `process.env.NODE_ENV`
- [x] erro React fica isolado por Error Boundary

## Consultas e demais módulos
- [x] Consultas abre
- [x] carrega LD
- [x] consulta documento
- [x] filtra
- [x] exporta
- [x] Triagem/eGRDT abre sem erro crítico
- [x] Histórico de eGRDTs abre sem erro crítico
- [x] SIGEM × PW abre sem erro crítico
- [x] Combinar PDFs abre sem erro crítico

## Critério de remoção do legado

**CONCLUÍDO:** `analysis_history_app.js` foi removido somente após a React Island, o adapter, os testes automatizados e os fluxos de navegador confirmarem a paridade. O loader e o Service Worker não carregam mais a UI legada e existe teste de regressão que exige a ausência do arquivo.


## Evidências pós-migração

Validação executada sobre a branch `phase-a/historico-analises-react` após a remoção da UI legada:

- `npm ci --ignore-scripts`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, gerando `react-dist/consultas-app.js` e `react-dist/historico-analises-app.js`.
- `npm test`: PASS integral, incluindo `historico_analises_react.cjs` e a suíte de Consultas.
- Chromium — fluxo principal: PASS; abertura ~222 ms, busca com debounce ~390 ms, 200 linhas/página, filtros, paginação, filtros salvos, busca unificada, detalhes, Excel, backup/restauração, navegação repetida, estado vazio, confirmação destrutiva e reload com Service Worker.
- Chromium — paridade complementar: PASS; Últimos 7 dias, Incluídos, período inválido sem erro no IndexedDB, Espaço/Enter, Escape/overlay, timeline, eGRDT relacionada, preparar no SIGEM, excluir sessão, foco/atalho, evento externo e smoke dos módulos.
- Chromium — Consultas: PASS; carregar LD, consultar documento, filtrar e exportar Excel.
- Console relevante nos fluxos acima: zero erros.
- `analysis_history_app.js`: removido depois dessas validações; teste automatizado impede reintrodução concorrente.
