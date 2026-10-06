# FASE 0 — Auditoria normativa do GRCON e checkpoint de implementação

Data: 2026-09-30  
Baseline auditado: `main` em `da597233de6c25ba3ea077353932b380597d408e`, GRCON `5.44.5`.

> Este checkpoint consolida a matriz mínima necessária para liberar a infraestrutura normativa (PR A).
> Ele **não autoriza** promover para produção regras cujo texto-fonte, revisão, vigência ou aplicabilidade não estejam confirmados.

## 1. Fontes efetivamente verificadas

### Repositório / regras operacionais

A `main` já possui regras maduras para:

- geração e reabertura do XLS BIFF8 da eGRDT;
- documento + revisão + arquivo;
- disciplina, tipo documental, propósito e caminho Databook;
- loteamento por disciplina ou somente por limite configurável;
- Histórico GRCON;
- Consulta Geral SIGEM;
- Documentos Previstos compartilhados;
- Repostagem de GRDT;
- validações específicas de ET/CV/N-1710 já usadas operacionalmente.

A evolução normativa deve **explicar e versionar** essas decisões, e não substituí-las silenciosamente.

### Pacote PETROBRAS fornecido

O arquivo `Downloads(1).7z` foi preservado, mas este ambiente não dispõe de extrator 7z capaz de inventariar seu conteúdo integralmente. Também há PDFs individuais extraídos na Biblioteca; neste checkpoint foram confirmados individualmente os documentos prioritários abaixo.

Não é correto declarar o pacote inteiro como auditado enquanto o inventário interno do 7z não puder ser reproduzido.

### N-2064

Fonte disponível: `N-2064 Rev. C`, edição AGO/2003, com emendas posteriores até 02/2014.

Achados confirmados na fonte:

- 4.1.1 — emissão original = revisão 0;
- 4.2.1 — revisões por letras maiúsculas, sem I e O;
- 4.2.2 — depois de Z seguem AA, AB ...;
- 4.2.3 — revisão de campo acrescenta algarismo (ex.: B1, C2);
- 5.1 — modificar, cancelar, substituir, renumerar e alterar finalidade específica caracteriza revisão;
- 5.2–5.4 — regras específicas para cancelamento, substituição e renumeração.

O Catálogo público PETROBRAS disponível em mar/2025 registra **N-2064 Rev. D, out/2017**. Portanto, a Rev. C local é uma fonte histórica/desatualizada para efeito de promoção. Ela pode orientar comparação e migração, mas **não pode gerar novo BLOQUEIO de produção como se fosse a Rev. D**.

### N-1710

Corpo confirmado: **Rev. N — 04/2020**.

Anexos confirmados individualmente:

| Parte | Revisão | Edição |
|---|---:|---:|
| Anexo A | W | 10/2023 |
| Anexo B | CJ | 04/2025 |
| Anexo C | BF | 12/2024 |
| Anexo D | BG | 04/2025 |
| Anexo E | D | 03/2010 |
| Anexo F | G | 10/2014 |
| Anexo G | CN | 04/2025 |

Pontos confirmados:

- 1.2 — a norma se aplica às categorias previstas no Anexo A e às classes aplicáveis;
- nota do escopo — não é válido imitar a estrutura N-1710 sem usar corretamente os códigos de seus anexos;
- 5.1 — o número codificado possui 7 grupos;
- 5.2 — grupos: idioma, categoria, instalação, área de atividade, classe, origem e sequencial;
- 6.5 — Anexo D/F depende do contexto aplicável.

Os anexos precisam ser versionados separadamente do corpo.

### N-381

Fonte confirmada: **Rev. M — 05/2022**, com errata 06/2022.

Pontos confirmados:

- 1.3–1.5 — aplicabilidade temporal/contratual precisa respeitar o empreendimento e o contrato;
- 1.6 — distingue Requisitos Técnicos e Práticas Recomendadas;
- 3.5.1 — todas as folhas abrangidas devem conter quadro de legenda;
- 3.5.4 — preenchimento dos campos da legenda.

A N-381 permanece como referência normativa catalogada, porém o GRCON não abre documentos técnicos PDF para conferir seu conteúdo. Legendas, carimbos, textos, revisões, títulos, datas, responsáveis, dimensões ou qualquer outro dado interno do PDF não são fonte automática de conformidade; quando necessários, os dados devem vir de bases estruturadas ou de entrada explícita do operador.

### Catálogo público complementar

A referência oficial pública localizada no Canal Fornecedor PETROBRAS é o Catálogo de mar/2025. Ele confirma, entre outras, N-2064 D, N-1710 N, N-381 M, N-1692 D, N-1883 F, N-2040 F e N-1784 C.

Para normas cujo **PDF não foi auditado**, o registry pode registrar a revisão conhecida apenas como inventário, mas deve marcar `sourceAvailable=false`; isso impede promoção automática.

## 2. Modelo real da eGRDT

O arquivo fornecido `Carga em Lote de Documentos(5).XLS` é XLS legado/BIFF8.

A estrutura operacional atualmente implementada em `grdt_workbook.js` reproduz e revalida:

`DOCUMENTO`, `REVISÃO`, `TÍTULO`, `ARQUIVO`, `FORMATO`, `DISCIPLINA`, `TIPO DE DOCUMENTO`, `PROPÓSITO`, `CAMINHO DATABOOK`.

O gerador:

- preserva BIFF8;
- reaproveita estilos/linhas do template;
- grava `FIM` depois dos documentos;
- mantém área de impressão;
- ajusta a faixa das validações de dados;
- reabre o XLS e compara cada campo gerado.

O XLS real também contém instruções explícitas de revisão obrigatória, arquivo obrigatório com extensão, ordem fixa das colunas, ausência de linhas vazias antes do final e uso dos seletores do modelo.

**Gap restante da FASE D:** executar golden test reprodutível célula/estilo/listas contra o arquivo real, sem converter o formato.

## 3. Diagnóstico do GRCON atual

O principal gap não é ausência de validações. É falta de uma camada única e auditável que responda para cada decisão:

- qual regra foi aplicada;
- qual fonte;
- norma/revisão/seção;
- se é requisito, recomendação, contrato ou regra operacional;
- onde se aplica;
- por que virou CONFORME, ALERTA, BLOQUEIO ou NÃO APLICÁVEL;
- se admite override;
- qual versão do motor decidiu;
- qual snapshot foi gravado no Histórico.

Também foi identificado que o contexto N-1710 atual ainda não é um parser normativo completo dos sete grupos e anexos versionados.

## 4. Matriz prioritária consolidada

| REGRA | FONTE | NORMA | SEÇÃO | REVISÃO | TIPO | APLICABILIDADE | GRCON ATUAL | GAP | RISCO | MELHORIA PROPOSTA | DECISÃO INICIAL | MÓDULO |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Emissão original = Rev. 0 | PDF local | N-2064 | 4.1.1 | C local / D catálogo | mandatory | documento de projeto aplicável | revisão 0 suportada | fonte local desatualizada | bloquear por texto antigo | obter/auditar Rev. D antes de promover | INFORMAÇÃO | GRDT |
| Revisões sem I/O | PDF local | N-2064 | 4.2.1 | C local / D catálogo | mandatory na fonte C | documentos aplicáveis | regra operacional já existe | sem proveniência/versionamento | confundir regra atual com fonte vigente | vincular após reconciliar D | INFORMAÇÃO | Core/GRDT |
| Após Z → AA... | PDF local | N-2064 | 4.2.2 | C local / D catálogo | mandatory | documentos aplicáveis | suportado | sem ruleId/version | histórico sem evidência | snapshot normativo | INFORMAÇÃO | Core/Histórico |
| Revisão de campo B1/C2 | PDF local | N-2064 | 4.2.3 | C local / D catálogo | mandatory | revisão de campo | formato aceito | contexto de campo não modelado | falso positivo | adicionar contexto/fase | INFORMAÇÃO | Core/Conferência |
| Mudança de finalidade exige revisão | PDF local | N-2064 | 5.1 | C local / D catálogo | mandatory | emissão subsequente aplicável | propósito existe | comparação histórico × propósito não é normativa | emissão incoerente | comparar com última emissão após auditar D | ALERTA candidato | GRDT/Histórico |
| Cancelamento/substituição/renumeração | PDF local | N-2064 | 5.2–5.4 | C local / D catálogo | mandatory | operação correspondente | partes do fluxo existem | sem modelo relacional completo | cancelamento indevido | rastrear predecessora/substituta | ALERTA candidato | GRDT/Repostagem |
| N-1710 possui 7 grupos | PDF confirmado | N-1710 | 5.1–5.2 | N | mandatory | somente N-1710 | regex/contexto parcial | sem parser por grupo | falso aceite | parser estruturado | ALERTA → BLOQUEIO após parser+testes | Core/Conferência |
| Categoria deve existir no anexo | PDF + Anexo A | N-1710 | 1.2/6.2 | N/A=W | mandatory | N-1710 | catálogo parcial | anexos não centralizados | código semântico inválido | catálogo versionado por anexo | ALERTA primeiro | Core |
| Instalação deve usar Anexo B | PDF + Anexo B | N-1710 | 5.2/6.3 | N/B=CJ | mandatory | N-1710 | inferências atuais | falta validação por grupo | falso aceite/rejeição | validar Grupo 2 | ALERTA primeiro | Core |
| Área/classe usam anexos corretos | PDF + C/D/E/F | N-1710 | 5.2/6.4–6.5 | versões independentes | mandatory | conforme instalação/contexto | parcial | risco de usar anexo errado | seleção explícita C/D vs E/F | ALERTA primeiro | Core/ReconDocs |
| Legenda em todas as folhas abrangidas | PDF confirmado | N-381 | 3.5.1 | M | mandatory | documentos em escopo | não automatizado | leitura interna de PDF retirada por decisão arquitetural | falso positivo e perda de autonomia | conferir fora do GRCON; no sistema usar somente dados estruturados | NÃO IMPLEMENTAR VIA PDF | — |
| Campos da legenda | PDF confirmado | N-381 | 3.5.4 | M | mandatory | conforme tipo/formato | não automatizado por leitura do arquivo | conteúdo interno do PDF não é fonte do GRCON | falso bloqueio por interpretação textual | usar metadados estruturados equivalentes quando existirem; nunca extrair do PDF | INFORMAÇÃO ESTRUTURADA | GRDT/Conferência |
| 9 colunas e ordem da eGRDT | modelo XLS + código atual | operacional/contratual | modelo de carga | atual | operational | exportação eGRDT | implementado | golden real pendente | incompatibilidade SIGEM | teste golden BIFF8 | BLOQUEIO após golden | grdt_workbook |
| FIM/sem linha vazia intermediária | modelo XLS + código | operacional | modelo de carga | atual | operational | exportação | implementado | golden real pendente | rejeição na carga | golden + round-trip | BLOQUEIO após golden | grdt_workbook |
| Disciplina oficial da eGRDT | template/contrato | operacional/contratual | — | vigente | operational | eGRDT | resolver existente | autoridade precisa ser versionada | lista divergente | registry separado de template | BLOQUEIO apenas por fonte vigente | GRDT |
| CAMINHO DATABOOK | fluxo atual | não confirmado | — | — | operational | depende do fluxo | políticas diferentes | fonte não comprovada | bloqueio indevido | manter operacional até fonte | ALERTA normativo | GRDT/Repostagem |
| Documento alocado | Documentos Previstos compartilhados | regra operacional | — | banco vigente | operational | Consultas/GRDT | corrigido na main | nenhum gap normativo imediato | regressão de fonte | preservar autoridade | decisão operacional existente | Consultas/GRDT |

## 5. Arquitetura liberada para PR A

1. `NormativeRegistry` — schema das regras; nenhuma regra precisa estar ativa para o módulo existir.
2. `NormativeVersionRegistry` — revisão por norma/parte/anexo, `sourceAvailable`, status e decisão de promoção.
3. `NormativeApplicability` — disciplina, tipo/categoria, família, fase, projeto, instalação e idioma.
4. `NormativeRuleEngine` — `CONFORME`, `ALERTA`, `BLOQUEIO`, `NÃO APLICÁVEL`.
5. Snapshot normativo para integração futura com Histórico.
6. Registry de template GRDT separado do registry normativo.

### Guardrail obrigatório de promoção

Uma regra só pode bloquear quando, cumulativamente:

- o texto-fonte foi auditado;
- a revisão usada pelo ruleId é a revisão registrada para aquela parte;
- o status da fonte permite promoção;
- eventual revisão de catálogo não diverge;
- a aplicabilidade foi determinada;
- o tipo da regra admite bloqueio;
- existe avaliador executável;
- o resultado é inequívoco.

Catálogo sem PDF/texto auditado **não é suficiente** para bloquear.

## 6. Riscos prioritários

1. Tratar N-2064 C como se fosse D.
2. Aplicar norma disciplinar fora do escopo.
3. Transformar Prática Recomendada em bloqueio.
4. Confundir regra operacional consolidada com requisito PETROBRAS.
5. Recalcular histórico antigo após atualização de norma.
6. Fazer promoção automática de revisão nova.
7. Carregar PDFs no frontend.
8. Alterar Consulta Geral, Documentos Previstos, loteamento, offline, mascote ou Repostagem como efeito colateral.

## 7. O que pode virar BLOQUEIO depois

Somente após fonte/aplicabilidade/testes:

- estrutura do XLS incompatível com o golden oficial;
- código N-1710 com grupo inválido segundo o anexo correto;
- divergência inequívoca documento/revisão/arquivo em emissão;
- requisito contratual explícito não-override;
- requisito normativo vigente cuja aplicabilidade esteja confirmada.

## 8. O que começa como ALERTA

- mudança de propósito sem evidência suficiente;
- cancelamento sem predecessor comprovado;
- divergência de título/categoria/legenda dependente de contexto;
- documento esperado por norma disciplinar mas ausente do escopo contratual;
- Databook suspeito;
- fonte sem texto integral auditado;
- revisão local divergente do catálogo.

## 9. O que é INFORMAÇÃO

- práticas recomendadas;
- regras candidatas;
- catálogo sem texto-fonte;
- sugestões disciplinares;
- inferências não confirmadas;
- regra proveniente de revisão histórica usada apenas para comparação.

## 10. PRs e ordem

- **PR A** — infraestrutura normativa isolada e não-enforcing;
- **PR B** — N-2064, somente com Rev. D auditada;
- **PR C** — N-1710 + parser 7 grupos + anexos versionados;
- **PR D** — golden test do XLS real;
- **PR E** — N-381 / Adicionar Capa;
- **PR G** — histórico, auditoria e overrides;
- **PR H** — módulo Normas Petrobras / governança owner;
- **PR I** — hardening e deploy.

## 11. Itens que não devem ser automatizados

- promoção de nova revisão;
- substituição de regra contratual por interpretação genérica;
- bloqueio baseado apenas em recomendação;
- aplicação disciplinar sem contexto;
- reescrita retroativa do histórico;
- override crítico sem autorização/auditoria;
- conclusão de vigência apenas porque existe um PDF;
- conclusão de obrigatoriedade de documento ignorando SCON, LD, escopo e Documentos Previstos.

## 12. Critério do checkpoint

A matriz acima está consolidada o suficiente para **concluir a PR A de infraestrutura** porque a PR A não interfere na produção.

As fases de enforcement permanecem condicionadas às fontes específicas de cada PR. Em especial:

- PR B: exige N-2064 Rev. D;
- PR D: exige golden test reprodutível do XLS real;

Esse desenho permite continuar a evolução sem inventar vigência e sem paralisar a arquitetura.

## Escopo atualizado em 02/10/2026

Por instrução explícita do usuário, as fases seguintes se limitam a GRCON e RECON. Referências históricas a ReconDocs não autorizam alterações nesse aplicativo.


## 8. Decisão arquitetural definitiva — 2026-10-02

O GRCON não realiza inspeção de conteúdo interno de documentos técnicos PDF. As regras de conferência utilizam códigos e dados estruturados provenientes das bases operacionais. PDFs podem ser manipulados pelas ferramentas de capa/combinação, mas seu conteúdo não constitui fonte automática de conformidade.

Consequências obrigatórias:

- não usar PDF.js, `getTextContent()`, OCR ou interpretação de páginas para conferir documento;
- não inferir código, revisão, título, categoria, finalidade, data, responsáveis, classificação, projeto, formato ou quantidade declarada de folhas a partir do PDF;
- não gerar alerta ou bloqueio porque um dado foi ou deixou de ser encontrado dentro de PDF;
- manter validação N-1710 sobre o código documental e demais cruzamentos estruturados;
- manter não conformidades normativas consultivas sem retirar automaticamente documentos da GRDT nem suprimir a decisão do operador;

A estratégia de inspeção interna introduzida na versão 5.44.7 / PR #179 foi retirada e não deve ser retomada em fases futuras.
