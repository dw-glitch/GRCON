# Auditor de Alocações — implementação e estado de validação

Referência: 28/10/2026. Base inspecionada: `dw-glitch/GRCON`, commit `b13640ec79b43d36574850bb0a1bddd2eebc2999`.

**Estado: implementação funcional integrada à main pelo PR #322 (commit db1867950f14faa9fe47f8ffeba4633978debbec); publicação ainda não comprovada nem homologação técnica concluída.** A estrutura de persistência foi aplicada ao Supabase. Não houve inserção automática do acervo operacional, alteração de LD oficial ou alteração dos comentários da Central.

## Integração entregue

- Ferramentas Adicionais → Auditor de Alocações, em ilha React/Vite.
- Ação Auditar Alocação no Gerador, inclusive em suas alocações históricas.
- Importação XLSX por aba explicitamente selecionada; entrada por LD ou histórico do Gerador.
- Consulta à Central compartilhada vigente existente. Arquivos adicionais podem complementar o histórico; repetir o mesmo arquivo/aba/linha é idempotente, sem eliminar reapresentações de outras linhas.
- Leitura separada da data de retorno e do texto de resposta da Fiscal 01.
- Catálogo fiscal por similaridade normalizada, com variantes originais e ocorrências completas; critérios recorrentes continuam sujeitos a revisão.
- Regras determinísticas: integridade de lote, revisão desconhecida, origem LD ambígua, formato/catálogos ET e N-1710 incorporados, prefixo `nt-`, caracteres proibidos, unidade versus caminho, existência exata de caminhos, hierarquia e referências de TAG.
- Regras da ET só recebem gravidade de erro normativo quando há revisão/aplicabilidade registrada para o contrato; o catálogo incorporado de relatórios é Rev. R. Revisões N/P/Q não herdam automaticamente os códigos da tabela R.
- Catálogos N-1710 sem aplicabilidade/Anexos comprovados geram pendência. Sequenciais com letras são sinalizados com referência à N-1710 Rev. N, item 6.7.
- EAP importada da Central ou exemplos não se torna automaticamente EAP contratual. Sem homologação do Anexo III — Apêndice A, a limitação permanece explícita.
- TAGs são comparados exatamente, sem alterar caixa, sufixos ou equipamentos. Ausência no Apêndice é inconclusiva; LI/SCON carregados também podem fornecer referência exata.
- Histórico relacionado por contrato, código completo, revisão quando conhecida e identidade canônica da LD. `ET_LD_004` corresponde à aba ET da LD004, sem cruzamento com LD003.
- Apontamentos podem ser propostos, aprovados, rejeitados ou justificados. Uma rejeição posterior revoga uma aprovação anterior do mesmo campo. Encerramento e classificação crítica exigem evidência.
- ZIP com relatório Excel, correções da LD, decisões, histórico fiscal, catálogo fiscal JSON e rastreabilidade. O pacote oficial usa os exportadores existentes do Gerador, com seu modelo de 16 colunas e linhas da Central.
- Cópia revisada da LD somente para títulos explicitamente aprovados. O escritor existente verifica preservação de partes OOXML, fórmulas e demais células. Também se confere o código exato na linha antes da escrita. Outros campos constam do pacote de correções.
- IA opcional, acionada por documento, no Workers AI e orçamento existente. A resposta só pode citar achados fornecidos; não cria títulos, TAGs, caminhos ou prova normativa. Respostas inválidas mantêm o fluxo manual disponível. Não foram feitas inferências reais durante os testes.

## Arquitetura e arquivos

| Camada | Implementação |
|---|---|
| Interface | `src/react/allocation-auditor/AllocationAuditorApp.tsx`, `index.tsx`, `allocation-auditor.css` |
| Estado e integração | `src/react/allocation-auditor/service.ts`, extensões em `src/react/allocation/` |
| Motor puro | `allocation_auditor_core.js` |
| Processamento local | `workers/allocation-auditor.worker.js`; escrita preservada em `workers/allocation.worker.js` |
| IA autenticada | `cloudflare/allocation-audit-ai.mjs`, rota em `cloudflare/worker-entry.mjs` |
| Navegação e build | `index.html`, `grcon_module_loader.js`, `vite.config.ts`, `package.json`, `package-lock.json` |
| Banco | migrations `20261027203851_allocation_auditor.sql` e `20261028090553_allocation_auditor_retry_safety.sql` |
| Rollback | `supabase/sql/allocation_auditor_rollback.sql`, com proteção contra apagar auditorias existentes |
| Evidências | testes `allocation_auditor*.cjs`, benchmark, inventário e relatório JSON neste diretório |

O backend usa três tabelas privadas: análises, linhas e eventos. Não há permissões diretas para `anon` ou `authenticated`. O wrapper público tem `SECURITY INVOKER`; a função privada valida a sessão, associação ativa, contrato ativo e perfil em toda chamada. Uploads são segmentados e idempotentes; análises concluídas e linhas recebidas não podem ser substituídas. Repetir um lote idêntico após perda de resposta é permitido. Responsável e data dos eventos são definidos pelo servidor.

O processamento local trabalha em lotes de 100, com progresso numérico, pausa/retomada na sessão e cache limitado a 5.000 resultados. O cache inclui versões, aplicabilidade, dados do registro, origem LD, histórico pertinente e contagem de repetições do lote. Mudança de conta/contrato encerra o Worker e limpa o estado. A retomada após fechar o navegador não está implementada; análises salvas podem ser reabertas, e uma nova análise usa as bases atuais.

## Fontes examinadas

O inventário `allocation-auditor-source-inventory.json` contém nomes, SHA-256, tamanhos e limites de abas das 28 fontes materializadas: 23 planilhas, 67 abas e cinco PDFs normativos. Limites de linhas incluem células apenas formatadas e não são apresentados como contagem de documentos.

A Central contém 15.441 registros, 15.031 respostas textuais, seis respostas numéricas e 436 variantes textuais originais agrupadas em 427 grupos normalizados; 98 grupos com apontamentos ocorrem em pelo menos três documentos. Há 10.160 valores documentais brutos e 10.159 chaves após aparar espaços externos; o valor bruto é preservado para conferência.

Foram lidas as cinco LDs disponibilizadas, totalizando 28.806 registros reconhecidos pelo parser existente. Foram localizados 314 caminhos explícitos na aba oficial da Rev. E, sem interpretar a simples existência da pasta como adequação técnica. As alocações 0353 e 0369 têm quatro e 49 linhas documentais na aba GERAL; as demais linhas de suas planilhas incluem formatação. A aba APROVADO não foi usada como prova de aceitação.

ET N/P/Q/R, N-1710, Workflows, Apêndice de bens tagueados e caminhos foram localizados. Os memoriais foram localizados na busca, mas não tiveram análise contratual integral concluída nesta execução. O Anexo III — Apêndice A não foi localizado. Não se presume aplicabilidade contratual da ET R apenas pela capa aprovada em 24/08/2026.

## Verificações executadas

- `npm run verify` completo aprovado em 28/10/2026: TypeScript, build das nove ilhas, sintaxe, Workers, referências, versões, dependências, Supabase, toda a regressão existente e desempenho do Cofre.
- 20 testes unitários específicos; 28 verificações de banco em PGlite; suites de Worker/XLSX/ZIP, rota de IA e interface React em DOM: aprovados.
- Importação real das 15.441 linhas da Central, preservação das 436 variantes de comentários e distinção entre datas e textos: aprovada.
- A interface com React e Worker reais foi exercitada para análise, busca exata 121/122, seleção, detalhes, ZIP e limpeza de contexto. Catálogo do Gerador e RPC foram controlados nesse teste; a autorização real do banco foi testada separadamente em PGlite.
- O impedimento da imagem original do mascote foi removido em 28/10: cópia recuperada com SHA Git `d9e87bcdda99aebfebccd83968f5ee71054c3367`, idêntica à do repositório. Os testes do mascote passaram na nova execução de regressão.
- Gerador, seu banco, Central compartilhada, API de alocação, Corretor de Títulos e navegação também passaram nas verificações direcionadas.
- Sintaxe, Workers externos, hashes das dependências e verificação Supabase: aprovados.
- As duas migrations foram aplicadas ao projeto existente. Introspecção confirmou RLS nas três tabelas, ausência de leitura direta para `anon`/`authenticated`, RPC negado a `anon`, execução permitida a `authenticated` e zero análises operacionais inseridas.
- O advisor apresenta INFO de RLS sem policies nas tabelas privadas: é a arquitetura de acesso exclusivamente pela função privada, sem grants diretos. Não foi adicionada policy permissiva para eliminar esse aviso.

O benchmark local do motor puro processou 15.441 registros em aproximadamente 189 ms na primeira medição, excluindo importação de arquivos, rede, persistência, UI e IA. Todos mantiveram alguma verificação pendente por ausência de confirmação normativa/EAP; isso é esperado nesse cenário sem homologação. O relatório JSON distingue desempenho técnico de qualidade dos apontamentos.

A partição candidata contém 9.189 registros de desenvolvimento, 3.069 de validação e 3.183 de reserva, agrupados por código exato e contrato. Não constitui homologação independente: aliases entre códigos corrigidos e o conjunto rotulado ainda precisam ser revisados. Precisão, cobertura, falsos positivos/negativos e falhas críticas permanecem **não medidos**, e não se declara 100%.

## Estado das fases solicitadas

| Fase | Estado verificável |
|---|---|
| 1 — diagnóstico | Código, arquitetura, produção por metadados e 28 fontes inventariados; inspeção autenticada da produção pendente. |
| 2 — inteligência fiscal | Extração integral da Central e catálogo implementados; interpretação e rotulagem humanas ainda necessárias. |
| 3 — normas | Motor e reaproveitamento de catálogos testados; aplicabilidade e revisão integral dos anexos não homologadas. |
| 4 — TAG/EAP/Data Book | Comparações implementadas; comprovação técnica da EAP e adequação de destinos pendentes. |
| 5 — IA | Rota, limites e esquema testados com binding controlado; inferência real e avaliação semântica não homologadas. |
| 6 — reapresentações | Associação e estados auditáveis implementados; aliases entre códigos alterados dependem de confirmação. |
| 7 — correções | Revisão, pacote e títulos em cópia da LD implementados; edição preservada de outros campos não liberada. |
| 8 — Gerador | Integração e exportadores reutilizados; fluxo completo em produção pendente. |
| 9 — React | Integração e teste DOM funcionais; fluxo sintético em Chromium real validado; fluxo autenticado em produção pendente. |
| 10 — estabilidade/segurança | Lotes, escopo, validação, cache e idempotência testados; retomada após fechar o navegador pendente. |
| 11 — homologação | Testes técnicos e benchmark concluídos; conjunto rotulado independente e métricas de qualidade pendentes. |
| 12 — publicação | Banco aplicado; tentativa de publicação pelo GitHub autorizada após tornar o repositório público. Publicação e acesso efetivo ao R2 ainda dependem da execução do runner e da credencial existente. |

## Publicação e custos

Em 28/10/2026 o usuário tornou o repositório público e autorizou retomar a criação/verificação do bucket e publicação pelo GitHub. Os novos jobs usam somente o runner padrão `ubuntu-latest`. O deploy e o workflow de liberação verificam que o repositório permanece público; não foram alterados planos, assinaturas, limites de cobrança ou segredos.

`scripts/ensure-cloudflare-r2.mjs` consulta apenas o bucket existente `grcon-documents`. Cria esse mesmo nome, em Standard, somente após HTTP 404. Uma resposta 401/403/429/500 nunca aciona criação; conflito de criação exige nova consulta. O script verifica acesso r2.dev desativado e ausência de domínio customizado ativo. Não lê, grava, lista nem exclui objetos, não apaga/recria buckets existentes e não habilita acesso público. Onze testes cobrem esses casos, concorrência e ausência/redação de credenciais.

A API precisa da credencial `CLOUDFLARE_API_TOKEN` já existente no GitHub e de `CLOUDFLARE_ACCOUNT_ID`. Permissão de deploy de Worker não implica permissão R2: eventual recusa deve ser registrada sem expor o segredo. Se R2 não estiver contratado, o fluxo não ativa assinatura automaticamente. O consumo de armazenamento/operações continua sujeito à franquia e aos limites existentes do R2.

A verificação completa `npm run verify` terminou com código 0. O pacote Cloudflare completo passou: 334 arquivos, referências locais íntegras. O Chromium existente no ambiente executou o React e Worker reais com contrato/RPC sintéticos: dois documentos, distinção exata 121/122, seleção, revisão, download ZIP, limpeza ao trocar contrato e zero erros de página. A imagem desktop foi inspecionada. Os testes Chromium existentes do Gerador e de publicação também passaram: geração oficial, permissões, reinicialização por contrato, importação de 503 linhas e árvore Rev. E de 312 caminhos no cenário sintético. Isso não comprova autenticação real, permissões reais em produção, inferência real nem homologação normativa.

A reexecução do último deploy bem-sucedido (`40534508430`) foi aceita pela API em 28/10/2026, mas permaneceu na fila sem jobs no momento desta atualização. Os commits de infraestrutura foram enviados à mesma branch do Auditor. Após a integração, o Workers Builds nativo falhou novamente, sem mensagem técnica ou anotações fornecidas pelo GitHub (build b9611f94-ed30-4177-83e0-36f59988b5e4). Não há comprovação de criação de bucket ou nova publicação enquanto as etapas autenticadas não terminarem com sucesso. O workflow de produção exige verificação completa, testes do Auditor e R2, pacote íntegro, bucket privado, deploy e comparação do commit/arquivos publicados. A verificação pós-deploy inclui os quatro assets do Auditor e recusa HTTP 401 da rota sem sessão.

Rollback: o código pode ser revertido pelo commit de integração ou uma versão anterior do Worker; os registros históricos e originais do R2 não são alterados por esta entrega. As migrations devem permanecer quando houver análises salvas; o SQL de rollback recusa apagá-las nesse caso.

## Uso após a publicação

1. Abra Ferramentas Adicionais → Auditor de Alocações, ou Auditar Alocação no Gerador.
2. Importe a alocação e escolha a aba; carregue LDs quando o título/revisão não constar da alocação. A Central compartilhada vigente é consultada como histórico.
3. Registre a referência de aplicabilidade normativa e execute a auditoria.
4. Confira achados e comentários. Aprove, rejeite ou justifique cada correção; não considere reapresentação como resolução.
5. Baixe o pacote de correções e, quando houver origem exata e títulos aprovados, uma cópia revisada da LD. Corrija a fonte oficial conforme o procedimento da equipe.
6. Gere o pacote pelo Gerador e submeta à conferência final. Pendências e exceções permanecem no relatório.
