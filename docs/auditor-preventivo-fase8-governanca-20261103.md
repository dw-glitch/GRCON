# GRCON — Robô Auditor Preventivo 2.0 — Fase 8: histórico, aprendizado e administração

## O que já existia (verificado no código/SQL, reaproveitado)
- Histórico de auditorias por contrato (`grcon_allocation_audit_runs/rows/events`, RPCs `begin/chunk/finish/event/history/detail`), idempotente por `requestId`.
- Sessões de conversa (`grcon_allocation_chat_sessions`) isoladas por contrato e usuário, com expiração e revisão otimista.
- **Catálogo de regras versionado** (`grcon_allocation_learned_rules`, PK `(id,version)`, estados `candidate→validating→active/suspended/revoked`, append-only, validação positiva+negativa, referência de homologação ≥10 caracteres, ativação e restauração exclusivas do **Proprietário ADM** via `grcon_require_master_owner()` no servidor).
- Painel administrativo `IntelligencePanel` (já com o nome **Proprietário ADM**), sem novo painel isolado.
- RLS: tabelas `private.*` revogadas de `anon/authenticated`; acesso apenas por RPCs `security definer` com `search_path` vazio e contrato do membro validado no servidor.

## O que a Fase 8 acrescentou
- **`allocation_auditor_learning.js`**: quatro níveis não equivalentes (*precedente observado*, *padrão recorrente*, *critério técnico confirmado*, *regra operacional homologada*). Recorrência fiscal **nunca** promove regra; só homologação ativa do ADM habilita automação. `proposeRuleAdjustment` gera proposta inativa para homologação. `catalogEntry` normaliza a versão da regra aos campos do catálogo. `invalidatedByRuleChange` aponta autorizações cuja regra foi alterada/suspensa/revogada.
- **Retomada segura** (`resumeCheck`): contrato, permissão, versão do motor, fontes/hashes e versões de bases; resultado `resume | reattach | reanalyze` com motivos. `restore()` informa o que reanexar ou reanalisar; `analyze(resume)` continua recusando fontes/bases alteradas.
- Painel ADM mostra o nível de cada regra.
- Persistência: apenas metadados, hashes e linhas de auditoria; **nenhum binário** é gravado (verificado por teste estático: sem R2, cofre, `localStorage`/IndexedDB; única chamada de rede é a IA opcional, autenticada e sem conteúdo de arquivos).

## Testes
`tests/allocation_auditor_governance_phase8.cjs` (no `test:allocation-auditor`) + suítes de banco já existentes (28 + 27 verificações).

## Limites declarados
- Não há PostgreSQL/Supabase local: **RLS e RPCs foram verificados por inspeção do SQL e pelas suítes estáticas existentes, não executados contra um banco**. Teste de troca de contrato em ambiente autenticado permanece pendente (Fase 9).
- Nenhuma regra de correção automática foi criada ou ativada. A IA (Workers AI) recebe apenas metadados de proposta/achados, como antes.
