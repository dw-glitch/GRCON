# Robô Auditor de Alocações — Etapas 1–3 integradas e Etapa 4 (parcial) — 06/11/2026

Situação: **Etapas 1 e 2 recuperadas e verificadas; Etapa 3 parcial; Etapa 4 parcial.** Nenhuma migração aplicada, nada publicado.

## 1. Estado recuperado
- Pacotes recebidos (`Fase0_Pacote`, `Fase1_Evidencias`, `Fase2_Evidencias`, `Fase2_Alteracoes`). O `GRCON_Robo_Fase2.patch` é cumulativo (Etapas 1 e 2), foi feito sobre `b1b867c0` (#427) e **aplica sem conflitos sobre a `main` atual (`09de0a46`)**: os 17 arquivos resultantes têm SHA-256 **idêntico** ao manifesto do pacote (`bdf06cc8…` para o patch).
- Verificações do próprio pacote sobre a `main` atual: `typecheck`, `vite build --mode allocation-auditor`, `vite build --mode allocation` e `test:allocation-auditor` — **aprovados**.
- A Etapa 3 (branch `claude/robo-auditor-etapa3`, commit `fe873b34`) foi trazida por cima; conflitos só em `allocation_auditor_core.js` (cabeçalho) e `package.json` (lista de testes), resolvidos mantendo as duas partes. A versão do motor foi para **1.6.0** (a 1.5.0 é a da Etapa 2; a retomada de sessão recusa sessões de outro motor, o que é correto porque a Etapa 3 muda resultados).
- A migração `20261107120803_allocation_auditor_complete_checkpoint.sql` está no repositório **mas não foi aplicada em nenhum banco** (testada só em PGlite no ambiente de origem). Precisa de homologação antes de o frontend que depende dela ir ao ar.

## 2. Etapa 4 — o que foi feito
**Escopo da Etapa 4 no backlog = RA-02** (T05 e T06). Concluído; RA-03 e RA-14 (Etapa 5) e RA-07 (Etapa 3) receberam avanços pontuais.

Motor (`allocation_auditor_core.js`, v1.6.0):
- **RA-02 — campo preenchido é comparado com a linha exata da LD** (antes só se copiava o valor da LD quando o campo estava vazio, e título ou TAG diferentes saíam "Sem não conformidades"). Campos: título, TAG, disciplina, EAP (erro), Workflow e caminho do Data Book (pendência a confirmar, pois podem ter sido reclassificados). Quatro níveis, sempre com os dois valores e a origem (arquivo, aba, linha): igual → nada; igual só na forma (maiúsculas, acentos, espaços) → sugestão `LD-<CAMPO>-FORMAT`; **equivalente por regra explícita** (sigla × nome da disciplina ELE/ELETRICA, TUB/TUBULACAO, CVL/CIVIL, HVAC; prefixo hierárquico da EAP) → sugestão `LD-<CAMPO>-SEMANTIC`; diferente → `LD-<CAMPO>-MISMATCH`. Valor copiado da LD não é comparado consigo mesmo; Workflow não é auditado em N-1710; título/TAG/disciplina/EAP geram **proposta** (não correção), Workflow/Data Book mantêm a proposta própria do modelo oficial (sem duplicar).
- **ET 7.1.7 — TAG × Grupo 7 do código** (`TAG-GROUP7-MISMATCH`), com `_` e `/` valendo `-`; item `nt-` não é comparado.
- **EAP 5.7.3.1 e 10.2.1.2**: testados com 10 níveis, lacuna legítima, nível acima do N6 conferido, nível adicional sem referência não é erro, e dois caminhos (ELETRICA × CIVIL) — Workflow unívoco seleciona, ambíguo vira pendência, sem chute.
- **RA-07 / "nunca forçar flags"** (catálogo, Etapa 3): cada validação/homologação agora diz como foi demonstrada — `registro completo`, `confirmação de aplicabilidade` ou `sinalizador` (o `homologated.*` que a tela já grava, sem responsável/data). Verificação sustentada só em sinalizador gera a sugestão `REF-FLAG-ONLY` e a coluna **Demonstração** no Excel. O sinalizador continua valendo (compatibilidade), mas deixa de passar por demonstração.
Pacote/decisões (adiantados da Etapa 5):
- **T14** `finalState`: uma alteração de campo resolve no máximo **um** erro do campo, a menos que cite os achados (`findingIds`).
- **T13** `finalState`: **proposta em aberto** impede "Pronta para conferência final e envio".
- **T15** `plan`: vale a **última decisão** por (linhagem, campo, valor); revogar remove a autorização.

Resultado: matriz independente do pacote **12/5 → 17/0**; testes novos `allocation_auditor_stage4_comparison.cjs` e ampliação de `allocation_auditor_references.cjs`; `npm run build && npm test` completos passaram.

## 3. Matriz dos 16 problemas (conforme o backlog do pacote)
| RA | Problema | Fase | Situação |
|---|---|---|---|
| RA-01 | Revisão/LD sem diagnóstico | 1 | resolvido e verificado (T02–T04) |
| RA-02 | Campos preenchidos sem comparação completa | 4 | **resolvido e verificado localmente** (T05, T06 + campos, equivalências, EAP); falta apenas validação com dados reais |
| RA-03 | Parecer ignora proposta/resolução específica | 5 | **parcial**: T13 e T14 passam; **falta** vincular encerramento a achado + evidência + **reauditoria** e o parecer final |
| RA-04 | Sugestão aparece como correção no Excel | 7 | aberto |
| RA-05 | Retomada reduz o universo | 2 | resolvido e verificado (T16) |
| RA-06 | Sessão sem análise retém run anterior | 2 | resolvido e verificado (T17) |
| RA-07 | Homologação/revisão desconectadas | 3 | **parcial**: fonte, revisão e vigência chegam ao motor e ao Excel (catálogo) e o sinalizador é identificado; **faltam** tela para registrar validação/homologação com responsável e evidência e a comprovação da vigência (depende de pessoas) |
| RA-08 | API rejeita campos produzidos pelo motor | 8 | aberto |
| RA-09 | Perda de zeros/representação de revisão | 1 | resolvido e verificado |
| RA-10 | Inspeção rejeita planilha legível | 1 | resolvido e verificado |
| RA-11 | Cancelamento e prazos incompletos | 8 | aberto |
| RA-12 | ML não implementado/avaliado | 9 | aberto (depende de acervo autorizado) |
| RA-13 | Chat esconde pendências e duplica ações | 6 | aberto |
| RA-14 | Autorização antiga e unidades ambíguas | 5 | **parcial**: T15 passa; **falta** separar documentos, ocorrências e propostas |
| RA-15 | Excel omite valor e contexto operacional | 7 | aberto |
| RA-16 | Cobertura não representa o fluxo completo | 11 | aberto |

Resumo: **6 resolvidos** (RA-01, 02, 05, 06, 09, 10), **3 parciais** (RA-03, 07, 14), **7 abertos**.

## 4. Limitações e riscos
- A matriz de 17 casos é **sintética**; nenhum binário de planilha corporativa foi usado. Não há homologação com banco real nem validação com usuários.
- A comparação nova pode **aumentar o número de erros** em alocações reais (títulos/TAGs que antes passavam em silêncio). É o objetivo, mas convém conferir com uma alocação real antes de publicar.
- A Etapa 3 deixa registros "Verificações inconclusivas" enquanto TAG/EAP/Data Book/Workflow não estiverem validados; ainda não há tela para registrar validações.
- Os 11 casos reprovados citados no pacote da Etapa 2 eram da matriz independente mais ampla do ambiente de origem; aqui foram reproduzidos os 17 casos do script do pacote (5 reprovavam; todos passam agora). Os demais casos, se existirem, não vieram no pacote.

## 5. Próximos passos
Etapa 5 — parecer, decisões e indicadores (RA-03, RA-14): vincular encerramento a achado, evidência e reauditoria; separar sugestão, autorização, aplicação e resolução comprovada; contagens únicas. Em paralelo, a tela de registro de validações (RA-07) depende da Etapa 6.
