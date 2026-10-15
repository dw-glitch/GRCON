# Progresso e responsividade — 5.44.12

Operações demoradas agora possuem acompanhamento local com etapa, contagem ou progresso indeterminado e resultado explícito. O ciclo de vida compartilhado foi extraído da antiga Central de Tarefas, preservando a remoção do seu botão/painel. O proprietário continua usando as mesmas telas, regras, permissões e modelos de saída.

## Alterações

- `operation_tasks.js`: estados running/completed/failed/cancelled/interrupted, progresso desconhecido representado por null, atualizações agrupadas e histórico limitado. Recupera interrupções de recarga e verifica abas ainda ativas por BroadcastChannel. Timestamps monotônicos e preferência por resultado terminal evitam uma aba manter execução antiga após erro em outra.
- `operation_progress.js`: acompanhamento junto da operação, deduplicação, primeira pintura antes do processamento, tempo decorrido, captura de contexto, falha/cancelamento e limpeza. Anúncios acessíveis separam a etapa da atualização numérica. Preserva o conteúdo original dos botões e oferece métricas locais sem conteúdo dos documentos; diagnóstico de tarefas longas é limitado a 100 entradas.
- `workspace.js` e `app.js`: falha e cancelamento são registrados antes dos finally; encerrar os controles não transforma erro em sucesso. O progresso da análise também alimenta o estado compartilhado.
- `workers/data.worker.js`: parsers existentes de Central de alocação, Documentos Previstos e Controle de Solicitações; índices de alocação/Consultas e preparação/filtro do Dashboard de Alocação. Instâncias e cache do dashboard são limitados; mudança de contexto elimina o Worker de dados.
- Consultas reutiliza o Worker/cache de LD e a leitura estável com retry de arquivos locais/de rede, agrupa indexação ao anexar múltiplas LDs e usa índice assíncrono. Há proteção de geração/contexto para descartar resposta antiga e estado próprio de anexação/exportação. Uma LD inválida permanece identificada na lista, sem classificar um carregamento parcial como sucesso.
- `data_exports.js` e `emission_dashboard_report.js`: construtores compartilhados para Worker e compatibilidade, preservando as abas, estilos, filtros e verificações dos exportadores existentes. Central SIGEM, Dashboard de Alocação, Dashboard de emissões e Monitoramento deixam de montar/serializar seus arquivos na interface no caminho principal.
- Dashboard de Alocação agrupa digitação de filtros e reutiliza agregação na paginação. Respostas antigas não substituem filtros atuais; exportação aguarda o resultado correspondente. Detalhes de alocações grandes são revelados em blocos de 100 documentos, mantendo todos os registros acessíveis.
- Cofre: download por stream com bytes recebidos, percentual somente com tamanho conhecido, proteção de clique repetido e interrupção por contexto. A janela PDF é preparada no clique. Exportação, exclusão e conferência de armazenamento exibem fases; respostas de outro contexto não atualizam a tela. Consultas têm limite de espera; escrita sem confirmação orienta conferir o resultado antes de repetir. Download utiliza timeout de inatividade, reiniciado a cada bloco recebido.
- Carregamento de módulo mostra preparação/recursos e permite nova tentativa após erro/timeout. Conclusão de carregamento antigo não reativa um módulo que o usuário já deixou.
- Histórico identifica requisições de relatório, informa fases e encerra espera de Worker sem resposta. Capas, combinação de PDFs, Conferência, Evolução SIGEM × PW e salvamento de contrato compartilham o acompanhamento, mantendo os indicadores específicos que já existiam.
- `sw.js` e versão 5.44.12 renovam os assets do aplicativo; não são exigidos serviço novo, migração de banco ou segredo adicional.

## Verificação

`npm run verify` cobre TypeScript, builds React, sintaxe, Workers, referências, versões, dependências, contratos Supabase e regressões documentais. O pacote Cloudflare também é construído e validado.

O novo teste `scripts/validar-progress-responsiveness-browser.cjs` exercita Workers reais no Chromium:

- Central de alocação sintética de 50 mil linhas com comparação integral contra o parser anterior;
- preparação, filtro e Excel de alocação com as mesmas contagens e abas;
- importação de Solicitações e Documentos Previstos, índice compartilhado e recuperação depois de arquivo inválido;
- relatório semanal com Dashboard, Emissões diárias, Emissões semanais e Documentos emitidos, lendo o binário resultante;
- deduplicação, progresso indeterminado, agrupamento de 1.000 eventos de progresso, restauração de botão, erro e cancelamento;
- troca de contrato, resultado terminal entre abas e recarga interrompida.

Em uma execução local de 50 mil linhas, o parser anterior ocupou a interface por aproximadamente 1.344,5 ms. Em Worker, a operação completa levou 1.529,8 ms, com 90 atualizações do timer e maior intervalo de 43,5 ms. São dados sintéticos, em máquina de laboratório. A melhoria demonstrada é a continuidade de resposta da interface; inicialização do Worker pode aumentar o tempo total da primeira execução.

Também são executados os testes Chromium existentes de desempenho/exportações, documentos automáticos do Cofre, contratos/monitoramento, Central SIGEM, Histórico, capas PDF, combinação de PDFs e cópia personalizada para Outlook. Os testes usam fixtures locais e respostas simuladas; não enviam mensagens nem alteram documentos de produção.

`scripts/validar-progress-soak-browser.cjs` alterna módulos, recolhe a área de arquivos e reabre Configurações, executa operações, coleta DOM/listeners/memória e verifica retenção limitada. O teste local é configurado para 60 minutos. O workflow específico repete 10 minutos por PR. O resultado integral do teste local deve ser conferido antes do encerramento da entrega; sua execução não equivale a um teste com bases reais em todos os módulos.

## Limites e preservação de regras

O desempenho total continua dependendo do volume de documentos, tamanho/páginas de PDF, rede, memória e tempo de servidor. O modo de compatibilidade conserva processamento local quando Workers não estão disponíveis e pode ser menos responsivo. As rotinas existentes de montagem PDF/DOCX permanecem; a leitura de LD das capas já usa Worker. Backup sem entrada ativa na interface não foi reintroduzido.

Regras de alocação, comparação por revisão, loteamento, inclusão manual, numeração, histórico, Colar GRCON V2, modelos e permissões não foram alteradas. O mascote de análise e a formatação de respostas Outlook permanecem nos seus fluxos. Publicação exclusivamente no Cloudflare, com conferência posterior do commit servido.
