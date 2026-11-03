# GRCON — Robô Auditor Preventivo 2.0 — Fase 6: correção inteligente e segura

**Data:** 03/11/2026 · **Branch:** `claude/vigilant-bardeen-p1hval` (inclui `feat/auditor-preventivo-fase0-20261103`)

## Reconciliação das Fases 0–5 (evidência executada)
- `npm ci`, `npm run typecheck`, `npm run build`: executados. **Bug 1:** `typecheck` falhava em `service.ts` (parâmetro implícito `any`) — corrigido. **Bug 2:** `importMany` não rejeitava arquivo sem aba documental reconhecida (mensagem enganosa) — corrigido.
- `npm run verify` na baseline (antes da Fase 6): saiu com código 0.
- O motor continua em `1.3.0` (`allocation_auditor_core.js`).

## O que a Fase 6 entrega
- **`allocation_auditor_corrections.js`** (novo, puro, carregado na página e no Worker): classifica cada proposta em **A** (automática segura), **B** (proposta), **C** (verificação complementar) ou **D** (sem alteração necessária) e define **onde corrigir** (Situações A–D: LD correta/alocação incorreta; título na LD; fonte de referência responsável; fontes conflitantes → pendência, sem escolha automática).
- **Classe A exige regra ativa** (ciclo de vida `candidate→validating→active`, versionado, homologado pelo Proprietário ADM, já existente no servidor) **e** todas as portas: contrato, modelo oficial de 16 colunas, SHA-256 da origem, linha física, revisão confirmada na LD exata, evidência, hash da LD, bases sem aviso de indisponibilidade. Sem regra ativa, nada é automático — nem por "confiança" de IA.
- **Escritor de alocação endurecido** (`allocation_auditor_revision.js`): bloqueia célula mesclada e aba protegida; exige revisão do evento igual à da linha; devolve rastreio por alteração (arquivo, aba, linha, coluna, célula, antes/depois, regra/versão, referência, responsável, decisão) e `outputHash`; recusa cópia idêntica ao original.
- **Agrupamento**: chave inclui a confiança/fonte; cada linha do grupo carrega a **própria evidência** (antes o grupo copiava a evidência da primeira linha para todas — bug de rastreabilidade corrigido em `acceptGroup`).
- **Chat**: o resultado mostra números reais (documentos analisados, correções seguras, propostas, pendências, sem problemas) e as ações *Aplicar correções seguras*, *Revisar propostas*, *Gerar arquivos corrigidos*. Pendências permanecem sem alteração.
- Numeração oficial: nenhum módulo de correção/cópia toca numeração; `assistantPackage(…, generateOfficial=false)` é o padrão.

## Testes
`tests/allocation_auditor_corrections_phase6.cjs` — 20 verificações (escrita real, original intacto, hash divergente, valor anterior divergente, fórmulas, células não relacionadas, OOXML/CRC, comentários fiscais, LD, alocação a partir de LD correta, layout externo, duplicidade/idempotência, revisões, EAP parcial e ambígua, título com evidência, falha segura, agrupamento de 80 documentos, ausência de numeração, rastreabilidade, célula mesclada, aba protegida). Incluído em `npm run test:allocation-auditor`.

## Limites
Nenhuma regra de correção automática está homologada em produção (conforme validação de 29/10): na prática, as correções ficam em **B** até o Proprietário ADM ativar regras. Layout externo mapeado continua somente auditável.
