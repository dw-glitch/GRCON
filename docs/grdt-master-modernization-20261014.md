# Central GRDT — modernização e diagnóstico do download

Versão: **5.44.10**. Base auditada: `f7c5c4c18db1709bddcaaae6d5982b904d0cec13` (PR #239 integrada). Branch: `fix/grdt-master-operational-20261014`.

## Resultado e escopo

Modernização executada na arquitetura existente, em JavaScript: a Central de geração utiliza esse runtime, enquanto outros módulos são ilhas React. Não houve reconstrução, substituição por demonstração, alteração de tabelas do banco ou dependência de Power Automate Premium. As melhorias já presentes na base foram preservadas e validadas.

### Auditoria: causas confirmadas

| Problema | Causa no código | Correção |
|---|---|---|
| Demora antes de abrir a prévia | `p1_ux.js` consultava as bases remotas e forçava histórico; a geração fazia as mesmas consultas novamente. | Prévia usa validade local e o índice existente. A geração conserva a validação remota obrigatória e a consulta atualizada ao histórico. |
| Espera sem indicação durante Cofre | `persistEmissionFiles` calcula SHA-256 e pode enviar os arquivos locais ao R2 antes do ZIP. Seus eventos só alimentavam a fila do Cofre. | Progresso dessa etapa também alimenta a Central, com quantidade, tempo decorrido e cancelamento. Preservação e rastreabilidade continuam antes da emissão. |
| Percentual do Worker ignorado | `workerProgress` considerava somente `total/completed`, enquanto o exportador envia `progress`. | Barra específica junto ao download consome o percentual e a mensagem reais do Worker. O adaptador genérico também aceita o percentual. |
| Leitura serial da pasta de rede | `preparePackageFiles` aguardava um arquivo por vez. | Até quatro leituras simultâneas, uma leitura por arquivo compartilhado, interrupção após erro/cancelamento e transferência dos bytes ao Worker. |
| Recomprimir arquivos já comprimidos | Todos os PDFs e formatos Office recentes passavam novamente por DEFLATE nível 4. | STORE nesses formatos; XLS das eGRDTs e demais conteúdos mantêm a compressão padrão. Nenhum byte dos documentos, nome ou pasta é alterado. |
| Piscadas e cliques repetidos | Preflight anterior à trava; atualizações do índice redesenhavam a tabela durante preparação; conclusão chamava `renderAll` em dois níveis. | Trava desde o primeiro clique, controles de edição bloqueados durante a geração, atualizações do histórico sem redesenho durante preparo e uma atualização final. Recalibração virtual pode exigir outro desenho de layout. |
| Situação e filtro contraditórios | Documento desmarcado mantinha a sugestão “Incluir”; cache do filtro de situação ignorava mudanças de seleção. | “Excluído” visível e filtro de situação acompanha a inclusão real. Sugestão técnica preservada no tooltip e detalhes. |
| Lacunas nos filtros | Origem, extensão, mudança/divergência de revisão e ausência confirmada de histórico não tinham controles próprios. | Filtros operacionais combináveis com busca, filtros rápidos e os 22 filtros de coluna. |
| Histórico silenciosamente indisponível | Falha era absorvida pelo serviço e não chegava ao painel; espera anterior podia impedir nova consulta após troca de contexto. | Erro explícito, nova tentativa, contexto por conta/contrato, descarte de resposta antiga e consulta nova independente. |
| Revisão incomum no histórico | Uma revisão histórica inválida podia permitir inferência indevida de revisão inédita. | Classificação a confirmar, exceto quando há prova da mesma revisão já emitida. |

## Downloads

O principal **Baixar PDFs + eGRDT** continua ligado a `exportZip`, gerando o ZIP oficial com pastas por lote, XLS e arquivos selecionados. “Somente eGRDT” continua secundário. O pacote que adiciona relatório e manifesto foi nomeado **Pacote + relatórios** para explicar sua diferença. Relatório de triagem e PDFs de alocação deixaram de exigir confirmações auxiliares. A prévia dos lotes e a confirmação de numeração foram preservadas.

A barra informa a etapa em andamento, inclusive quando não há percentual mensurável. O tempo é medido no navegador; percentuais não estimam prazo para terminar. Ao finalizar, informa **download preparado**, sem afirmar que o usuário salvou no computador. Falha/cancelamento interrompe a indicação de carregamento e libera nova tentativa. Troca de contrato/conta cancela o contexto anterior.

## Tabela, filtros e histórico

- Identificação reúne código copiável, nome original, origem, extensão e última eGRDT clicável. Código longo é truncado visualmente, com tooltip e cópia integral.
- Revisão editável apresenta a transição encontrada → selecionada; a coluna original permanece no gerenciador. Checkbox duplicado foi ocultado; o controle principal mantém inclusão manual.
- Colunas essenciais e larguras ajustadas; todos os 22 campos técnicos e a expansão continuam disponíveis. A tabela segue virtualizada, com offsets e janela reutilizados durante rolagem.
- Busca com debounce de 250 ms e projeção normalizada reutilizada, incluindo identificadores de todas as eGRDTs carregadas. Aplica-se ao conjunto carregado completo, além da janela visível.
- Origem, tipo de arquivo, revisão, histórico e vínculo de alocação combinam-se com filtros de coluna. ET/N-1710, LD, TAG e revisões individuais continuam pelos campos existentes. O filtro de alocação significa vínculo identificado; não presume aprovação/alocado.
- “Nunca emitido” exige histórico completo. Ausência em cópia parcial é “sem histórico confirmado”. Limpar não altera revisões nem inclusão. Selecionar todos afeta somente o conjunto filtrado elegível.
- Histórico apresenta emissões cronológicas, revisão, propósito, data, referência de geração, encaminhamento registrado e localização na Consulta Geral para a revisão exata quando disponível. Não utiliza a existência da eGRDT como confirmação de postagem.
- Painel com retorno de foco, navegação por Tab, fechamento por Escape e retry. Registros de outro contrato não entram no índice; o contexto também distingue contas no mesmo contrato.
- Mesma revisão emitida → repostagem; revisão superior inédita com histórico completo → nova revisão; revisão anterior ou inválida → conferir histórico. Havendo prova da mesma revisão, mantém repostagem e alerta sobre revisão posterior. A alteração manual recalcula indicadores, nomes automáticos e contagens sem mudar inclusão.

## Arquivos alterados

| Área | Arquivos |
|---|---|
| Triagem, downloads, seleção e virtualização | `app.js`, `grdt_triage_query.js`, `grdt_download_progress.js`, `p1_ux.js`, `index.html`, `grdt-central-ux.css`, `macro5_flow_core.js`, `macro5_flow_app.js`, `grdt-stage-progress.js` |
| Histórico e escopo | `posting_flow.js`, `history_classification.js`, `grdt_central_history_ui.js`, `grcon_cloud_app.js` |
| Arquivos e pacote | `document_vault_app.js`, `performance_workers.js`, `package_layout.js`, `workers/export.worker.js` |
| Regressões | `tests/grdt_master_operational.cjs`, `tests/grdt_download_pipeline.cjs`, `tests/cloud_history_pagination.cjs`, `tests/history_classification.cjs`, `tests/shared_sigem_query.cjs`, `tests/grdt_visual_steps.cjs`, `scripts/validar-grdt-table-audit-browser.cjs` |
| Validação e versão | workflow `sigem-posting-central.yml`, `package.json`, `package-lock.json`, `sw.js`, `grcon_config.js`, `LEIA-ME_PUBLICACAO.txt`, versões de reserva do histórico React, Teams e postagem |

## Testes e medições

`npm run verify` inclui typecheck, seis builds React, sintaxe, Workers, referências, versão, dependências, integração Supabase e regressão global. O pacote Cloudflare é gerado e verificado separadamente. Os testes novos cobrem filtros combinados, histórico incompleto, revisão incomum, troca de conta/contrato, resposta atrasada, paginação abaixo do limite solicitado, cancelamento, leitura concorrente e transferência sem duplicação.

Chromium 138 em Linux, Node 24.19.0, 1366×768 e zoom 125%. Cenários de teste sintéticos, sem envio Teams nem gravação no banco de produção. Aplicativo, virtualização, Workers, geração de XLS e ZIP reais. Backend de histórico controlado e atraso de 160 ms no adaptador de Cofre para verificar barra e ausência de redesenho; esse atraso não é medição de R2.

| Volume | Análise/carga da triagem | Duas mudanças de filtro via Playwright | Linhas no DOM virtual em densidade compacta | Transbordamento horizontal da página |
|---:|---:|---:|---:|---:|
| 100 | 1.747 ms | 876 ms | 100 | 0 px |
| 500 | 2.325 ms | 566 ms | 33 | 0 px |
| 1.000 | 3.153 ms | 851 ms | 33 | 0 px |

Os tempos de filtro incluem automação, espera de ação e pintura, não são o tempo isolado do algoritmo. A análise inclui validação automatizada da LD. São referências locais, não uma promessa de tempo no computador corporativo.

Todos os três volumes passaram: filtros combinados e vazios, busca por título e eGRDT antiga, inclusão somente dos filtrados, edição preservada ao limpar, histórico por contrato, falha/retry, geometria das colunas fixas, última linha, expansão, densidades e zoom. A barra recebeu percentual de Cofre e chegou a 100%; o observador não detectou reconstrução da tabela durante a etapa controlada de preparação. A conclusão teve no máximo duas atualizações, incluindo calibração de layout.

ZIPs abertos após o download: dois PDFs com bytes preservados, nome de revisão A coerente, uma eGRDT no modo somente limite e duas no modo disciplina, com números e pastas corretos. Duplo clique produziu somente um download. Falha na validação remota foi distinguida da prévia e liberou nova tentativa.

Benchmark isolado de compressão: 16 MiB sintéticos incompressíveis, mesma máquina/Node. DEFLATE: **1.096,7 ms**, 16.782.460 bytes. STORE: **97,7 ms**, 16.777.340 bytes. Conteúdo extraído idêntico, conferido por SHA-256. Isso mede CPU local da compressão, não duração total do download nem velocidade da rede/R2.

## Integridade, limitações e publicação

Regras de loteamento, limite do proprietário, numeração, arquivos locais/Cofre, histórico imutável, documentos previstos, alocação, exportações e integrações preservados. A consulta captura conta/contrato durante toda a paginação, abortando antes de ler outra página sob contexto diferente. Nenhuma credencial privilegiada adicionada, nenhuma política RLS alterada e nenhuma migração necessária.

A duração do upload de PDFs reais para o Cofre e da leitura na rede corporativa depende do tamanho dos arquivos e da conexão. Não foi executado upload de dados corporativos para medir esse ambiente. O diagnóstico `GrconGrdtDownloadProgress.metrics()` registra etapas e tempos da operação real na sessão para identificar seu gargalo; não envia telemetria a terceiros.

PR, SHA final e publicação: registrados na descrição da PR e no workflow **Deploy Cloudflare**, que valida a versão por `deployment-meta.json`. A entrega ao usuário deve citar o estado efetivamente confirmado pelo workflow; build local não comprova publicação. Rollback: restaurar o artefato anterior aprovado sem excluir históricos ou arquivos R2.
