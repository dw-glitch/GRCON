# FASE 0 — Auditoria normativa e checkpoint técnico

Data: 2026-09-30  
Base auditada: `main` — GRCON 5.44.5  
Branch de infraestrutura isolada: `feat/normative-phase1-registry`

> Este documento é um checkpoint técnico auditável. Ele não promove regras normativas para produção.
> Regras sem vigência, revisão, aplicabilidade ou fonte integralmente confirmadas permanecem candidatas/informativas.

## 1. Diagnóstico do estado atual

O GRCON já possui regras operacionais maduras para triagem, revisão, nome de arquivo, disciplina, geração XLS, loteamento, histórico, Consulta Geral, Documentos Previstos, SIGEM/PW e Repostagem. O principal gap não é “falta de validação”, e sim falta de uma camada única que responda, para cada decisão: qual é a fonte, norma, revisão, seção, tipo, aplicabilidade, vigência e possibilidade de override.

Achados confirmados na `main`:

- `grdt_workbook.js` gera XLS legado e preserva as 9 colunas: DOCUMENTO, REVISÃO, TÍTULO, ARQUIVO, FORMATO, DISCIPLINA, TIPO DE DOCUMENTO, PROPÓSITO e CAMINHO DATABOOK.
- o próprio `grdt_workbook.js` reabre o XLS gerado e compara os 9 campos, verifica a aba GRDT e a estrutura esperada; a linha FIM é emitida após os itens;
- `core.js` já implementa sequência de revisão 0 → A…Z → AA… e rejeita I/O; também reconhece revisões de campo como B1/C2;
- `core.js` valida documento, revisão, título, extensão do arquivo, formato, disciplina, tipo documental e propósito;
- `grdt_reissue_core.js` é mais restritivo que o fluxo normal para propósito e CAMINHO DATABOOK, enquanto `grcon_output_guard.js` trata Databook vazio como aviso. Essa divergência é operacional e precisa ser reconciliada antes de virar política normativa;
- `grdt_databook_support.js` contém heurística operacional de caminho Databook com três ou mais segmentos separados por `|`; não há evidência suficiente neste checkpoint para classificá-la como requisito PETROBRAS;
- `history_core.js` preserva revisão enviada, revisão sugerida e alteração manual, mas ainda não grava snapshot normativo (`normativeValidationVersion`, regras verificadas, alertas, bloqueios, overrides e normas aplicadas);
- o contexto N-1710 existente ainda não é um parser completo dos sete grupos com catálogos de anexos versionados.

## 2. Fontes efetivamente auditadas

### Pacote fornecido

- `Downloads.7z` localizado e preservado.
- O ambiente não possui extrator 7z disponível e o indexador não abriu o arquivo internamente.
- Até este checkpoint, 26 PDFs do pacote foram expostos individualmente na Biblioteca (`N-0002` a `N-1550`, em lotes não contíguos).
- Portanto, ainda **não é permitido declarar as 288 normas como integralmente auditadas**.

### Normas prioritárias confirmadas individualmente

- N-2064, arquivo local Rev. C, edição AGO/2003, com emenda até 02/2014.
- N-1710 Rev. N, 04/2020.
- N-381 Rev. M, 05/2022.

### Catálogo externo oficial usado somente como verificação complementar

Catálogo PETROBRAS de jul/2024:

- N-2064 está registrada como **Rev. D — out/2017**. Logo, a Rev. C local está desatualizada em relação a esse catálogo.
- N-1710 está registrada como Rev. N — abr/2020.
- N-381 está registrada como Rev. M — mai/2022.
- N-1692 D, N-1784 C e N-2040 F também aparecem no catálogo; suas regras não serão promovidas enquanto os respectivos arquivos e aplicabilidade contratual não forem auditados no pacote fornecido.

O catálogo de jul/2024 é uma referência externa complementar e não substitui o Catálogo contido no pacote do usuário nem prova, sozinho, a vigência em 2026.

### Especificação contratual/projeto RNEST confirmada

Foi auditada a `ET-5290.00-22000-912-1LV-001 — Definição de Codificação de Documentos`, Rev. P de 17/06/2026. A própria ET determina, para documentação de projeto, o uso da N-1710 e define regras específicas para documentação administrativa e relatórios do RNEST. Entre os pontos relevantes:

- tabela de siglas de disciplinas/temas usada pelo projeto;
- relatórios codificados por grupos separados por underscore;
- código da unidade UHDT-D incluindo U32;
- código de relatório RIR = Relatório de Inspeção de Recebimento;
- TAG deve preservar a codificação existente;
- para itens não tagueados, o Grupo 7 deve iniciar com `nt-` em minúsculo.

Essas regras são classificadas como **contractual/project-specific** e recebem `applicability.projects = ["RNEST"]`; não podem ser aplicadas universalmente fora do projeto.

### Planilha real

`Carga em Lote de Documentos(1).XLS` foi localizada e preservada. O arquivo é XLS legado/binário e o indexador não expôs conteúdo tabular legível neste ambiente. A comparação direta célula-a-célula com o arquivo real permanece pendente. O gerador atual, entretanto, já possui as nove colunas solicitadas e verificação de round-trip do próprio arquivo produzido.

## 3. Arquitetura proposta

A camada normativa deve permanecer separada das regras operacionais atuais:

- `NormativeVersionRegistry`: versões, revisão, data, status e histórico sem sobrescrita silenciosa;
- `NormativeRegistry`: regras estruturadas e suas fontes;
- `NormativeApplicability`: filtro por disciplina, categoria/tipo documental, fase, instalação, projeto, família e propósito;
- `NormativeRuleEngine`: resultado CONFORME / ALERTA / BLOQUEIO / NÃO APLICÁVEL / INFORMAÇÃO;
- validadores específicos são conectados por `validatorId`, em vez de espalhar decisões hardcoded pela interface;
- regra candidata não interfere na produção;
- regra de norma desatualizada ou de vigência incerta nunca é promovida automaticamente a bloqueio.

## 4. Matriz de regras prioritárias

| REGRA | FONTE | NORMA | SEÇÃO | REVISÃO | TIPO | APLICABILIDADE | GRCON ATUAL | GAP | RISCO | MELHORIA PROPOSTA | BLOQUEIO OU ALERTA | MÓDULO AFETADO |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Emissão original = Rev. 0 | PDF fornecido | N-2064 | 4.1.1 | C local / D no catálogo 2024 | mandatory | documentos de projeto | revisão 0 suportada | fonte local desatualizada | aplicar texto antigo como vigente | reconciliar Rev. D antes de promover | INFORMAÇÃO por ora | Controle GRDT |
| Revisões alfabéticas sem I/O | PDF fornecido | N-2064 | 4.2.1 | C local / D catálogo | mandatory | documentos de projeto | já implementado em `revisionInfo` | falta rastreabilidade normativa | baixa regressão, alta governança | vincular regra ao registro após reconciliar Rev. D | INFORMAÇÃO por ora | Core/GRDT |
| Após Z → AA/AB… | PDF fornecido | N-2064 | 4.2.2 | C local / D catálogo | mandatory | documentos de projeto | já implementado em `nextRevision` | falta fonte/revisão no resultado | histórico sem prova da regra | registrar ruleId/version | INFORMAÇÃO por ora | Core/Histórico |
| Revisão de campo B1/C2 | PDF fornecido | N-2064 | 4.2.3 | C local / D catálogo | mandatory | quando revisão de campo se aplicar | formato aceito | contexto não é explicitamente classificado | falso positivo fora de campo | adicionar contexto/fase | INFORMAÇÃO por ora | Core/Conferência |
| Mudança de finalidade caracteriza revisão | PDF fornecido | N-2064 | 5.1 | C local / D catálogo | mandatory | nova emissão com finalidade alterada | propósito existe no modelo | não compara formalmente propósito anterior x revisão | emissão incoerente | comparar Histórico/Consulta Geral após reconciliar Rev. D | ALERTA candidato | Controle GRDT/Histórico |
| Cancelamento/substituição/renumeração | PDF fornecido | N-2064 | 5.2–5.4 | C local / D catálogo | mandatory | operação correspondente | propósito de cancelamento existe | relação substitui/substituído e prova de emissão anterior incompletas | cancelamento indevido | modelo relacional + histórico antes de bloquear | ALERTA candidato | GRDT/Repostagem/Histórico |
| Código N-1710 usa 7 grupos | PDF fornecido | N-1710 | 5.1–5.2 | N | mandatory | somente contexto N-1710 | validações/nome específicos existem | sem parser por grupo | regex pode aceitar código semanticamente inválido | parser estruturado e anexos versionados | ALERTA até anexos | Core/Conferência |
| Categoria e classe devem constar em anexos | PDF fornecido | N-1710 | 1.2/5.2 | N | mandatory | somente contexto N-1710 | catálogo parcial hardcoded | anexos não versionados | categoria/classe incorreta ou falsa rejeição | importar anexos por revisão | ALERTA até anexos | Core/ReconDocs |
| Idioma/categoria/instalação/atividade/classe/origem/sequencial | PDF fornecido | N-1710 | 5–6 | N | mandatory | N-1710 | não decompõe integralmente | diagnóstico pouco explicável | usuário não sabe qual grupo falhou | retornar grupo, valor, anexo e expectativa | ALERTA até anexos | Conferência/GRDT |
| Legenda em folhas | PDF fornecido | N-381 | 3.5.1 | M | mandatory | documentos abrangidos pela N-381 | Adicionar Capa não valida todas as folhas | escopo/tipo documental precisa ser respeitado | falso positivo generalizado | extrair metadados com applicability | ALERTA primeiro | Adicionar Capa/Conferência |
| Metadados de legenda | PDF fornecido | N-381 | 3.5.4 | M | mandatory | conforme formato/tipo | título/código/revisão parcialmente tratados | executor/verificador/aprovador/data/categoria não cruzados de forma única | inconsistência documental | validador por campo e fonte | ALERTA; bloqueio só para divergências inequívocas | Adicionar Capa/Conferência |
| 9 colunas e ordem da GRDT | modelo real + gerador atual | operacional/contratual | modelo de carga | modelo atual | contractual/operational | exportação GRDT | já implementado | comparação direta com XLS real pendente | incompatibilidade SIGEM | teste golden com o XLS real | BLOQUEIO após golden | grdt_workbook |
| Linha FIM/sem vazios intermediários | gerador atual + instrução do modelo | operacional | modelo de carga | modelo atual | operational | exportação GRDT | FIM já gerada | golden real pendente | rejeição de importação | round-trip + golden | BLOQUEIO após golden | grdt_workbook |
| CAMINHO DATABOOK obrigatório | regras internas/fluxos atuais | não confirmado | — | — | operational | depende do fluxo | divergência normal x repostagem | política inconsistente | bloqueio indevido | manter operacional até fonte contratual/normativa confirmada | ALERTA no motor normativo | GRDT/Repostagem |
| Documento alocado | Documentos Previstos compartilhado | operacional | — | vigente do banco | operational | todos os usuários | corrigido na main | nenhum gap normativo | regressão de fonte | preservar autoridade atual | regra operacional existente | Consultas/GRDT |
| Relatórios RNEST usam estrutura própria de grupos | ET do projeto | ET-5290.00-22000-912-1LV-001 | 7.1 | P | contractual | projeto RNEST | regras parcialmente inferidas por padrões atuais | falta fonte estruturada | aplicar padrão fora do projeto | registrar regra com project applicability | ALERTA candidato até promoção | ReconDocs/Conferência/GRDT |
| Item não tagueado usa prefixo nt- minúsculo | ET do projeto | ET-5290.00-22000-912-1LV-001 | 7.1.7.3 | P | contractual | relatórios RNEST / itens não tagueados | GRCON já normaliza variantes nt- em fluxos específicos | regra ainda não rastreada à ET | rejeição por grafia ou aplicação universal | validador contratual escopado ao RNEST | candidato a BLOQUEIO após validação do fluxo | Core/GRDT/Conferência |
| RIR possui código de relatório definido | ET do projeto | ET-5290.00-22000-912-1LV-001 | Tabela 13 | P | contractual | relatórios RNEST | ReconDocs/RIR possuem lógica própria | falta catálogo contratual versionado | classificação divergente | estruturar tabela de códigos sem hardcode disperso | ALERTA inicialmente | ReconDocs |

## 5. Módulos impactados

Impacto direto previsto: `core.js`, `emission.js`, `grdt_workbook.js`, `grdt_reissue_core.js`, `history_core.js`, `app.js`, Conferência, Adicionar Capa React, Histórico React, ReconDocs e futuro módulo administrativo Normas Petrobras.

Impacto indireto: Consulta Geral, Documentos Previstos, SIGEM × PW, ProjectWise, LDs, exportações e Supabase. Essas bases continuam sendo fontes operacionais/contratuais; a camada normativa não as substitui.

## 6. Riscos

1. Promover a N-2064 Rev. C local quando o catálogo já aponta Rev. D.
2. Aplicar uma norma de disciplina a documento fora do seu escopo.
3. Confundir prática recomendada com requisito obrigatório.
4. Confundir regra operacional consolidada com requisito normativo.
5. Tornar Databook ou propósito mais restritivos em um fluxo do que em outro sem fonte.
6. Recalcular histórico antigo usando norma nova.
7. Carregar PDFs completos no frontend e degradar desempenho.
8. Criar falso positivo em documentos com revisão por folha.
9. Alterar regras atuais de Documentos Previstos, Consulta Geral, loteamento, mascote ou offline como efeito colateral.

## 7. Regras que podem ser BLOQUEIO

Nenhuma regra nova deste checkpoint está promovida a bloqueio.

Após fonte, revisão, vigência e aplicabilidade confirmadas, candidatos a bloqueio são:

- estrutura inválida do arquivo GRDT frente ao golden oficial;
- revisão inválida inequívoca em regra vigente;
- divergência inequívoca documento/revisão entre PDF e emissão, quando a regra aplicável estiver confirmada;
- código N-1710 com grupo inválido segundo o anexo correto e vigente;
- regra contratual explícita classificada como não-override.

## 8. Regras que devem começar como ALERTA

- mudança de propósito sem evidência suficiente de revisão;
- cancelamento sem emissão anterior comprovada;
- divergência de título/categoria/legenda que possa depender de contexto;
- documento esperado por norma disciplinar mas ausente do escopo contratual;
- caminho Databook suspeito;
- norma/revisão sem vigência atual confirmada;
- divergência entre arquivo normativo e catálogo.

## 9. Regras informativas

- práticas recomendadas;
- regras ainda candidatas;
- fontes sem catálogo atual confirmado;
- sugestões disciplinares;
- documentos esperados pela norma quando SCON/LD/escopo/Documentos Previstos não os exigirem;
- qualquer inferência não confirmada por fonte primária.

## 10. Plano de PRs

- PR A — infraestrutura normativa: registry/version/applicability/rule engine + testes; sem integração de produção.
- PR B — N-2064: somente após obter/reconciliar Rev. D.
- PR C — N-1710: parser de 7 grupos + anexos versionados.
- PR D — GRDT workbook: golden test contra `Carga em Lote de Documentos(1).XLS`.
- PR E — N-381 / Adicionar Capa.
- PR F — ReconDocs / matriz disciplinar.
- PR G — auditoria, overrides e histórico normativo.
- PR H — módulo Normas Petrobras e governança owner.
- PR I — hardening final e deploy.

## 11. Ordem de execução e complexidade relativa

1. Fechar inventário do pacote + Catálogo do pacote — alta.
2. Obter N-2064 Rev. D — média/alta.
3. PR A — baixa/média e isolada.
4. PR B N-2064 — alta.
5. PR C N-1710/anexos — muito alta.
6. PR D golden GRDT — média.
7. PR E N-381/PDF — alta.
8. PR F matriz disciplinar — muito alta.
9. PR G histórico/override — alta.
10. PR H módulo de normas — alta.
11. PR I hardening — alta.

## 12. O que NÃO deve ser automatizado

- promoção automática de nova revisão normativa;
- substituição automática de regra contratual por interpretação genérica de norma;
- bloqueio baseado em prática recomendada;
- aplicação de norma disciplinar fora do escopo;
- alteração histórica retroativa;
- override crítico sem autorização e auditoria;
- conclusão de que uma norma está vigente apenas porque existe um PDF local;
- conclusão de que um documento deve existir apenas porque aparece em matriz normativa, ignorando SCON, LD, escopo e Documentos Previstos.

## Critério de saída da FASE 0

A FASE 0 só será marcada como fechada quando:

1. o pacote completo estiver inventariado;
2. o Catálogo contido no pacote tiver sido comparado às revisões dos PDFs;
3. a N-2064 Rev. D estiver disponível para substituir a análise baseada na Rev. C;
4. a planilha real `Carga em Lote de Documentos(1).XLS` tiver sido comparada célula/estrutura/listas contra o gerador;
5. a matriz for ampliada para todas as normas realmente aplicáveis ao escopo do GRCON.

Até lá, a PR A permanece infraestrutura não-enforcing e nenhuma regra nova altera a geração de GRDT em produção.
