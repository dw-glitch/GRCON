# FASE 3 — N-2064 Rev. D: emissão e revisão

## Versão e proveniência

O catálogo oficial PETROBRAS confirma **N-2064 Rev. D, edição 10/2017**. O pacote entregue ao GRCON contém uma cópia antiga da Rev. C. Uma cópia pública da Rev. D foi usada para auditar as seções 4.1 a 5.3, mas o PDF primário Rev. D não estava no pacote recebido.

Por isso:

- a versão alvo passa a ser Rev. D;
- o `NormativeVersionRegistry` mantém status `unconfirmed` para promoção automática;
- nenhuma regra N-2064 nova passa a bloquear produção somente por causa dessa fonte secundária;
- correções permissivas que removem falsos bloqueios foram aplicadas no motor de revisão.

## Correções no motor de revisão

O GRCON agora reconhece:

- `0` — emissão original;
- `#1`, `#2`... — versões preliminares antes da emissão original;
- `01`, `02`... — versões preliminares após Rev. 0 e antes da próxima emissão;
- `A1`, `A2`, `C2`... — versões preliminares após revisão emitida;
- `A ... Z, AA, AB ...` — revisões emitidas.

A Rev. D classifica o não uso de **I** e **O** como prática recomendada. Portanto:

- I/O são aceitos pelo validador;
- recebem alerta de recomendação;
- a sugestão automática `nextRevision` continua pulando I/O, preservando o comportamento preferencial do GRCON.

Isso corrige o comportamento anterior, baseado na Rev. C, que tornava I/O inválidos e poderia bloquear uma revisão que a Rev. D trata apenas como prática não recomendada.

## Ciclo de vida auditável

`n2064_revision_lifecycle.js` adiciona auditoria isolada para:

- sequência de emissão/revisão;
- preliminar antes da Rev. 0;
- preliminar entre revisões;
- mudança de finalidade;
- cancelamento;
- substituição;
- renumeração;
- tradução;
- situações especiais As Built / como comprado / como fabricado / certificado.

Guardrails relevantes:

- documento ainda não emitido não deve ser cancelado: deve sair do planejamento aplicável;
- renumeração cria novo documento em Rev. 0;
- tradução cria novo documento e guarda a revisão da fonte;
- saltos de revisão histórica geram alerta para conferência, não bloqueio automático.

## Integração segura

A validação efetivamente usada pelo GRCON continua em `TriagemCore.revisionInfo` / `nextRevision`. O auditor de ciclo de vida é modular e fica disponível para a camada central de compliance e para histórico/overrides nas fases seguintes.

## Continuação e regressões corrigidas — 01/10/2026

- A mesma gramática de revisões é reconhecida no nome recebido, PDF, nome final, Histórico e localização de arquivos para Repostagem.
- `_0001` permanece identificador de folha, nunca preliminar; `RIR` permanece sufixo operacional.
- `#1 → #2`, `01 → 02` e `A1 → A2` são transições preliminares válidas.
- Histórico desconhecido gera alerta; só evidência explícita de nunca emitido caracteriza a inconsistência de cancelamento.
- Renumeração exige identidade diferente da original.
- Avisos de I/O acompanham o resultado da triagem; aceitar o formato não apaga a recomendação.
- A infraestrutura ainda não promove regras N-2064 a novos bloqueios de produção.
