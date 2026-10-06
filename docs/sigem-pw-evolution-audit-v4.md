# SIGEM × PW — Evolução auditável v4

Versão da regra: `sigem-pw-evolution-audit-v4`.

## Objetivo

A Evolução deve responder de forma rastreável duas perguntas:

1. Por que o GRCON apresenta exatamente X registros/documentos emitidos?
2. Por que uma contagem externa pode ser maior ou menor?

A regra antiga de movimentação por ocorrência técnica foi preservada para não alterar silenciosamente o histórico. A v4 acrescenta, em paralelo, contagens por documento + revisão e por documento único.

## Fontes

- **SIGEM:** Consulta Geral. Status, revisão e demais campos SIGEM continuam identificados como dados SIGEM.
- **PW:** relação/CSV ProjectWise. Cadastro e emissão são conceitos distintos; presença válida no PW significa cadastro, não emissão.

## Granularidades

| Granularidade | Chave | Uso |
|---|---|---|
| Documento único | identidade normalizada do documento | comparação de quantidade física de documentos |
| Documento + revisão | identidade normalizada + revisão normalizada | comparação operacional de revisões/cadastros/emissões |
| Ocorrência técnica | documento + revisão + versão + identificador forte quando disponível | compatibilidade com a evolução histórica e multiplicidade real da origem |

Uma nova revisão de um documento existente é classificada separadamente de um documento novo.

## Regra de emissão PW

A semântica vigente do Dashboard é mantida e explicitada:

| Última emissão | Interpretação | Conta como emitido |
|---|---|---|
| SIM | evidência de emissão atual | sim |
| NÃO | evidência de emissão histórica | sim |
| PREVISTO | não emitido determinável | não |
| vazio | informação insuficiente | indeterminado |
| valor desconhecido | regra não determinável | indeterminado |

Valores vazios/desconhecidos não entram nem em “emitido” nem em “não emitido determinável”. Nenhum estado é estimado para completar KPI.

## Evolução

A evolução não é explicada apenas por `total atual - total anterior`.

Para cada sistema são produzidos:
- adicionados;
- removidos;
- saldo líquido;
- novos documentos;
- novas revisões;
- alterações de metadados.

Para o PW também são identificadas novas emissões:
- nova entrada já emitida;
- transição de não emitido para emitido.

## Relação atual SIGEM × PW

A chave documento + revisão forma:
- SIGEM + PW emitido;
- SIGEM + PW não emitido;
- somente SIGEM;
- somente PW emitido;
- somente PW não emitido.

## Auditoria de snapshot

Cada snapshot derivado registra:
- linhas brutas;
- registros aceitos;
- documentos únicos;
- documento + revisão;
- duplicidades técnicas;
- variações técnicas da mesma chave documento + revisão;
- descartes por regra;
- distribuição da evidência de emissão;
- versão da análise;
- fingerprint;
- campos de data considerados.

## Datas

- cadastro PW: campo de criação do PW quando disponível;
- cadastro PW: `datacriacao`, quando disponível;
- emissão PW: `DataEnvioGRDCliente`; se estiver ausente, a data de emissão é não determinável;
- snapshot: data/hora de importação ou data operacional editada; esta é a data usada no eixo do gráfico entre snapshots;
- data relevante de uma ocorrência PW, usada para ordenação/contexto: `DataEnvioGRDCliente → DataAlteracaoState → datacriacao → DataGRDEntrada`. Esse fallback **não** transforma o valor encontrado em “data de emissão”.

Quando a fonte não possui data operacional suficiente, a interface/exportação não deve inventar precisão.

## Desempenho e persistência

A v4:
- preserva escolha manual dos snapshots enquanto eles continuarem válidos no período;
- persiste preferências de UI em `sessionStorage`;
- reutiliza snapshots derivados cacheados por versão da regra + snapshot + LD + data;
- persiste cache derivado no IndexedDB;
- cacheia a timeline completa e filtra o intervalo sem recomparar todo o histórico;
- normaliza filtros uma vez por recomputação, e não uma vez por linha;
- mantém dados atuais visíveis durante refresh;
- só escreve logs de profiling quando `GRCON_DEBUG_UI === true`.

## Exportação de auditoria

O relatório Excel inclui:
- Resumo;
- SIGEM x PW;
- Novos;
- Novas revisões;
- Emitidos;
- Não emitidos;
- Emissão indeterminada;
- Somente SIGEM;
- Somente PW;
- Excluídos da análise;
- Regras da análise.

A aba **Regras da análise** registra versão, snapshots, fingerprints, volumes e regras utilizadas.
