# SIGEM × PW — Evolução auditável v4

Versão da regra: `sigem-pw-evolution-audit-v4.1`.

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

Para o PW também são identificadas novas emissões por **documento + revisão**:
- nova chave documento + revisão que já chega emitida;
- chave documento + revisão que passa de PREVISTO (não emitido determinável) para emitida.

A movimentação técnica antiga continua calculada em paralelo para diagnóstico/compatibilidade, mas não infla o KPI principal quando várias ocorrências técnicas pertencem à mesma chave documento + revisão. Uma passagem de estado indeterminado para emitido é mostrada como diagnóstico, sem afirmar que a emissão ocorreu entre os dois snapshots.

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

## Diagnóstico e correções da retomada (5.44.9)

| Problema encontrado | Comportamento final |
|---|---|
| Releitura de todos os payloads e recomputação a cada evento | Leitura por chave; cache versionado em memória e IndexedDB |
| Seleção redefinida ao atualizar o período/histórico | Escolhas manuais preservadas; ausência explícita de base anterior também persiste |
| Primeira construção de snapshots/gráfico bloqueava a interface | Worker usa o mesmo motor, identidade, catálogo e filtro de escopo do runtime principal |
| Comparações repetidas reprocessavam as mesmas bases | Cache limitado a 12 pares; gráfico limitado a quatro históricos derivados |
| Variante PREVISTO posterior podia substituir uma evidência de emissão | SIM prevalece sobre NÃO; ambos prevalecem sobre indeterminado, que prevalece sobre PREVISTO; empate usa linha da origem |
| KPI documento + revisão abria/exportava ocorrências técnicas | Listas dos estados atuais e abas de emissão usam um representante por documento + revisão |
| Duas revisões de um documento novo apareciam como dois documentos novos | Documento novo conta uma vez; novas chaves documento + revisão seguem listadas separadamente |
| Exportação de relação SIGEM + PW omitindo evidência do PW | Status e evidência PW acompanham a relação, sem substituir o status SIGEM |
| Atualização sem troca de versão PWA | Versão 5.44.9 renova o cache e a regra v4.1 invalida resultados derivados anteriores |

### Como conciliar com o número informado pelo PW

O número de operações informado pelo time pode incluir múltiplas emissões da mesma revisão, movimentos que ocorreram e foram revertidos entre duas exportações, versões/arquivos da mesma revisão e documentos fora do escopo. A Evolução compara fotografias das relações recebidas. Não afirma conhecer todas as operações executadas entre elas.

Entradas que já chegam com SIM/NÃO e transições de PREVISTO para emitido são mostradas separadamente na explicação do KPI. Uma entrada já emitida não prova que sua emissão ocorreu entre os dois snapshots. Para reconciliar uma diferença operacional concreta ainda são necessários os CSVs/snapshots correspondentes e o relatório de operações do PW com a mesma granularidade, escopo e período.

Se a importação antiga guardou somente a quantidade de linhas inválidas, sem seu conteúdo, o total continua diagnosticado, mas não é possível reconstruir a evidência por linha. Arquivo, fingerprint e versão da regra identificam a origem; não são uma assinatura criptográfica de autenticidade.
