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
- [ ] faixa `RASTREABILIDADE DAS ANÁLISES`
- [ ] título `Todos os documentos analisados pelo GRCON`
- [ ] texto explicativo existente
- [ ] botão `Fazer backup`
- [ ] botão `Restaurar backup`
- [ ] input JSON oculto para restauração
- [ ] botão `Excluir análise selecionada`
- [ ] botão `Limpar todo o histórico`
- [ ] IDs externos necessários permanecem disponíveis quando aplicável

### Busca unificada
- [ ] título e texto explicativo
- [ ] textarea aceita um código/nome por linha
- [ ] Enter sem Shift executa a busca
- [ ] Shift+Enter continua inserindo nova linha
- [ ] botão `Buscar`
- [ ] botão `Limpar`
- [ ] contador de eGRDTs no Histórico
- [ ] contador de documentos no Histórico de análises
- [ ] detalhes de eGRDT: número, tipo de saída, quantidade de documentos
- [ ] detalhes de análise: documento, resultado entregue, situação da alocação
- [ ] estado sem resultado
- [ ] limpar esconde resultados/detalhes e zera contadores

### Filtros principais
- [ ] Busca geral
  - documento
  - título
  - motivo/código do motivo
  - GRDT
  - alocação
  - demais campos já pesquisados pelo `Core.matches()`
- [ ] Situação entregue:
  - Todas / `ALL`
  - Será incluído na eGRDT / `READY`
  - Não será incluído / `BLOCKED`
  - Não será enviado novamente / `DISCARD`
  - Precisa de conferência / `REVIEW`
- [ ] Data inicial
- [ ] Data final
- [ ] período inválido quando final < inicial
- [ ] mensagem de validade: `A data final deve ser igual ou posterior à data inicial.`
- [ ] Análise executada
- [ ] opção `Todas as análises`
- [ ] opções mostram data/hora, total de docs e nome da LD
- [ ] mudança de filtro volta para página 1
- [ ] busca textual usa debounce de aproximadamente 300 ms
- [ ] demais filtros mantêm atualização sem exigir botão Aplicar

### Filtros rápidos
- [ ] Hoje: início=fim=hoje e status ALL
- [ ] Últimos 7 dias: hoje e seis dias anteriores, status ALL
- [ ] Pendências: status REVIEW e período limpo
- [ ] Incluídos: status READY e período limpo

### Filtros salvos
- [ ] select `Filtro salvo`
- [ ] opção inicial `Selecionar filtro`
- [ ] carregar filtro aplica query/status/datas/sessão e volta à página 1
- [ ] botão `Salvar filtro atual`
- [ ] prompt pede nome, sugerindo filtro atual ou `Meu filtro`
- [ ] persistência continua por `GrconMacro5Flow`
- [ ] erro de gravação é notificado
- [ ] botão `Excluir filtro`
- [ ] botão fica disabled sem filtro selecionado
- [ ] exclusão pede confirmação
- [ ] exclusão atualiza lista e notifica sucesso

### Resumo
- [ ] cartão `Análises`
- [ ] cartão `Documentos`
- [ ] cartão `Incluir`
- [ ] cartão `Não incluir`
- [ ] cartão `Aguardar`
- [ ] cartão `Conferir`
- [ ] mesmas classes/tons atuais
- [ ] números formatados em pt-BR

### Tabela
Ordem obrigatória:
- [ ] Analisado em
- [ ] Documento
- [ ] Revisão atual
- [ ] Próxima revisão
- [ ] Resultado GRCON
- [ ] SIGEM
- [ ] Alocação
- [ ] LD
- [ ] Motivo

Conteúdo:
- [ ] data e hora em duas linhas
- [ ] documento + título
- [ ] revisão atual
- [ ] próxima revisão + status da revisão
- [ ] chip do Resultado GRCON com mesma classificação
- [ ] chip SIGEM com mesma classificação
- [ ] situação da alocação + número da alocação
- [ ] versão da LD + aba/linha
- [ ] código do motivo + explicação
- [ ] valores ausentes exibem `—`
- [ ] paginação continua em 200 registros por página
- [ ] ordem padrão continua sendo data de análise desc + documento
- [ ] linha abre detalhes por clique
- [ ] linha abre detalhes por Enter
- [ ] linha abre detalhes por Espaço
- [ ] `tabIndex=0` e rótulo acessível da linha
- [ ] CSS atual continua convertendo tabela em cartões nas telas estreitas

### Estados da tabela
- [ ] loading: `Carregando histórico…`
- [ ] vazio: `Nenhum documento localizado`
- [ ] vazio: `Execute uma análise ou ajuste os filtros.`
- [ ] erro: mensagem do motor ou `Não foi possível abrir o histórico.`
- [ ] erro gera notificação
- [ ] resultado mostra `N documento(s)`

### Paginação
- [ ] botão Anterior
- [ ] botão Próxima
- [ ] estados disabled corretos
- [ ] `Página X de Y · N documento(s)`
- [ ] sem resultados: `Nenhum documento`
- [ ] troca de página não altera os filtros

### Armazenamento
- [ ] texto padrão: histórico local deste navegador
- [ ] quando disponível, mostra uso/quota via `navigator.storage.estimate()`
- [ ] formatação B/KB/MB/GB preservada
- [ ] fallback de armazenamento existente continua funcional

## Detalhes do documento

### Abertura/fechamento
- [ ] painel lateral e overlay
- [ ] título recebe o documento
- [ ] estado `Carregando comparação…`
- [ ] botão × fecha
- [ ] clique no overlay fecha
- [ ] Escape fecha
- [ ] foco vai para botão fechar após carregamento
- [ ] erro de detalhe fica isolado no painel
- [ ] fechar limpa seleção visual/lógica do detalhe

### Decisão desta análise
- [ ] Analisado em
- [ ] Resultado GRCON
- [ ] Revisão atual
- [ ] Próxima revisão
- [ ] Status da revisão
- [ ] SIGEM
- [ ] Situação da postagem
- [ ] Alocação: status + número
- [ ] LD utilizada: versão + aba + linha
- [ ] Caminho Databook

### Evidência e motivo
- [ ] Código do motivo
- [ ] Explicação
- [ ] Comentário da Fiscal
- [ ] Origem da entrada
- [ ] Arquivos originais
- [ ] Arquivos finais
- [ ] comparação com análise anterior:
  - Resultado GRCON
  - SIGEM
  - Próxima revisão
- [ ] mensagem quando não houve mudança material

### Linha do tempo
- [ ] consulta todas as ocorrências do documento
- [ ] correspondência exata usa `Core.norm`
- [ ] ordenação/timeline continua vindo de `Flow.analysisTimeline` quando disponível
- [ ] exibe data/hora, situação, revisão atual→alvo, SIGEM e mudanças/motivo
- [ ] ordem visual continua invertida para mais recente primeiro
- [ ] estado sem análise anterior

### eGRDT relacionada
- [ ] relação continua vindo de `Flow.relatedEgrdt`
- [ ] mostra número da eGRDT
- [ ] mostra data/hora
- [ ] mostra quantidade de documentos
- [ ] botão `Abrir eGRDT no histórico`
- [ ] carrega módulo Histórico antes de selecionar
- [ ] botão `Preparar no SIGEM`
- [ ] registra postagem via `GrconSigemPosting.registerGenerated`
- [ ] carrega módulo SIGEM antes de selecionar postagem
- [ ] quando não há eGRDT relacionada, mantém a mensagem atual

## Ações destrutivas e persistência

### Excluir análise selecionada
- [ ] disabled sem sessão específica
- [ ] pede confirmação com data/hora e quantidade de documentos
- [ ] usa `Core.deleteSession(id)`
- [ ] limpa seleção da sessão
- [ ] volta à página 1
- [ ] atualiza a tela
- [ ] emite `grcon:analysis-history-updated`
- [ ] notifica sucesso

### Limpar todo o histórico
- [ ] não faz nada quando não existem sessões
- [ ] exige confirmação destrutiva
- [ ] preserva a camada de confirmação de segurança existente
- [ ] preserva auditoria `historico_analises_limpo`
- [ ] usa `Core.clearAll()`
- [ ] volta à página 1
- [ ] atualiza a tela
- [ ] emite `grcon:analysis-history-updated`
- [ ] notifica sucesso

### Backup
- [ ] usa `Core.exportBackup()`
- [ ] JSON
- [ ] nome `GRCON_Backup_Historico_Analises_<timestamp>.json`
- [ ] download local
- [ ] notifica sucesso/erro

### Restaurar backup
- [ ] aceita JSON
- [ ] parseia arquivo local
- [ ] confirma substituição do histórico atual
- [ ] usa `Core.importBackup(..., { replace: true })`
- [ ] volta à página 1
- [ ] atualiza
- [ ] emite `grcon:analysis-history-updated`
- [ ] informa quantidade restaurada
- [ ] limpa o valor do input mesmo em erro/cancelamento

## Exportação Excel
- [ ] disabled sem resultados
- [ ] disabled em período inválido
- [ ] loading: `Gerando relatório…`
- [ ] texto normal sem período: `Baixar relatório Excel`
- [ ] texto normal com período: `Baixar relatório do período`
- [ ] usa todos os documentos filtrados, não apenas a página
- [ ] sessões exportadas são somente as referenciadas pelos documentos
- [ ] carrega `excel` e `brand` pelo Module Loader
- [ ] usa `GrconAnalysisHistoryReport.buildWorkbook`
- [ ] usa `GrconAnalysisHistoryReport.downloadName`
- [ ] MIME XLSX preservado
- [ ] notifica quantidade exportada
- [ ] erro não derruba o módulo
- [ ] ao terminar, estado exporting volta ao normal

## Integrações e contratos externos
- [ ] `window.GrconAnalysisHistoryUi` continua existindo para o shell
- [ ] `GrconAnalysisHistoryUi.render()` continua atualizando o módulo
- [ ] compatibilidade de `openDetail` é preservada se ainda houver consumidor
- [ ] `history_app.js` consegue ativar Histórico de análises e focar `#analysis-history-search`
- [ ] `grcon_module_loader.js` considera a ilha pronta somente após global esperado existir
- [ ] evento externo `grcon:analysis-history-updated` atualiza React uma única vez
- [ ] `productivity_center.js` continua conseguindo limpar e atualizar o Histórico
- [ ] atalho de busca de `grcon-ui-fix.js` continua encontrando `#analysis-history-search`
- [ ] contador `#analysis-history-tab-count` continua atualizado
- [ ] contador `#ops-analysis-history-count` continua atualizado
- [ ] CSS `analysis-history.css` e regras complementares em `grcon-final.css` são reutilizados
- [ ] não há listener legado concorrendo com React
- [ ] não há mais de um root React ativo
- [ ] abrir Histórico → outro módulo → Histórico repetidamente não duplica listeners/timers/requisições

## PWA, loader e segurança
- [ ] bundle `react-dist/historico-analises-app.js` incluído no loader
- [ ] dependências de domínio carregam antes da ilha
- [ ] bundle incluído no Service Worker
- [ ] cache versionado
- [ ] atualização de versão anterior não mistura HTML/JS incompatíveis
- [ ] reload com Service Worker ativo funciona
- [ ] manifest continua funcionando
- [ ] CSP não recebe `unsafe-eval`
- [ ] CSP não recebe novo `unsafe-inline`
- [ ] sem CDN
- [ ] bundle não contém `process.env.NODE_ENV`
- [ ] erro React fica isolado por Error Boundary

## Consultas e demais módulos
- [ ] Consultas abre
- [ ] carrega LD
- [ ] consulta documento
- [ ] filtra
- [ ] exporta
- [ ] Triagem/eGRDT abre sem erro crítico
- [ ] Histórico de eGRDTs abre sem erro crítico
- [ ] SIGEM × PW abre sem erro crítico
- [ ] Combinar PDFs abre sem erro crítico

## Critério de remoção do legado

`analysis_history_app.js` só pode sair do grupo de carregamento depois de todos os itens acima terem equivalente React/adapter e testes que cubram os contratos principais. Não manter duas UIs concorrentes.
