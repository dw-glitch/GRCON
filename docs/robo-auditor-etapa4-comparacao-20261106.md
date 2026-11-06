# Robô Auditor de Alocações — Etapas 1–3 integradas e Etapa 4 (parcial) — 06/11/2026

Situação: **Etapas 1 e 2 recuperadas e verificadas; Etapa 3 parcial; Etapa 4 parcial.** Nenhuma migração aplicada, nada publicado.

## 1. Estado recuperado
- Pacotes recebidos (`Fase0_Pacote`, `Fase1_Evidencias`, `Fase2_Evidencias`, `Fase2_Alteracoes`). O `GRCON_Robo_Fase2.patch` é cumulativo (Etapas 1 e 2), foi feito sobre `b1b867c0` (#427) e **aplica sem conflitos sobre a `main` atual (`09de0a46`)**: os 17 arquivos resultantes têm SHA-256 **idêntico** ao manifesto do pacote (`bdf06cc8…` para o patch).
- Verificações do próprio pacote sobre a `main` atual: `typecheck`, `vite build --mode allocation-auditor`, `vite build --mode allocation` e `test:allocation-auditor` — **aprovados**.
- A Etapa 3 (branch `claude/robo-auditor-etapa3`, commit `fe873b34`) foi trazida por cima; conflitos só em `allocation_auditor_core.js` (cabeçalho) e `package.json` (lista de testes), resolvidos mantendo as duas partes. A versão do motor foi para **1.6.0** (a 1.5.0 é a da Etapa 2; a retomada de sessão recusa sessões de outro motor, o que é correto porque a Etapa 3 muda resultados).
- A migração `20261106104652_allocation_auditor_complete_checkpoint.sql` está no repositório **mas não foi aplicada em nenhum banco** (testada só em PGlite no ambiente de origem). Precisa de homologação antes de o frontend que depende dela ir ao ar.

## 2. Etapa 4 — o que foi feito (parcial)
Motor (`allocation_auditor_core.js`):
- **RA-02 — comparação de campo preenchido com a linha exata da LD.** Antes só se copiava o valor da LD quando o campo estava vazio; um título ou TAG diferente da LD saía "Sem não conformidades detectadas". Agora, para **título, TAG, disciplina e EAP**: igual → nada; igual só na forma (maiúsculas, acentos, espaços) → **sugestão** `LD-<CAMPO>-FORMAT`; diferente → **erro** `LD-<CAMPO>-MISMATCH` com os dois valores e a origem (arquivo/aba/linha) e uma **proposta** (não correção). Valor copiado da LD não é comparado consigo mesmo.
- **ET 7.1.7 — TAG × Grupo 7 do código** (`TAG-GROUP7-MISMATCH`), com `_` e `/` valendo como `-`; item `nt-` não é comparado.
Pacote/decisões:
- **T14** — `finalState`: uma alteração de campo só resolve **um** erro do campo, a menos que cite os achados (`findingIds`). Alterar o campo não prova resolver tudo.
- **T13** — `finalState`: **proposta em aberto** (sem alteração verificada) impede "Pronta para conferência final e envio".
- **T15** — `plan`: vale a **última decisão** por (linhagem, campo, valor); aceitar e depois rejeitar remove a autorização (por data, se houver).

Resultado: a matriz independente do pacote foi de **12 aprovados / 5 reprovados** para **17 / 0**; novo teste do repositório `tests/allocation_auditor_stage4_comparison.cjs`. `npm run build && npm test` completos passaram.

## 3. Matriz dos 16 problemas
| RA | Problema | Situação |
|---|---|---|
| RA-01 | Revisão/LD sem diagnóstico | resolvido e verificado (Etapa 1) |
| RA-02 | Campos preenchidos sem comparação completa | **parcial**: título, TAG, disciplina, EAP × LD e TAG × Grupo 7 feitos; **faltam** comparação completa de Workflow, Data Book e níveis EAP quando preenchidos, comparação semântica e o relatório por múltiplas LDs |
| RA-03 | Parecer ignora proposta/resolução específica | **parcial**: proposta aberta e decisão vigente tratadas (T13/T15); **falta** o parecer final e a separação sugestão/autorização/aplicação/resolução comprovada (Etapa 5) |
| RA-04 | Sugestão aparece como correção no Excel | aberto (Etapa 7) |
| RA-05 | Retomada reduz o universo | resolvido e verificado (Etapa 2) |
| RA-06 | Sessão sem análise retém run anterior | resolvido e verificado (Etapa 2) |
| RA-07 | Homologação/revisão desconectadas | **parcial**: proposta aberta bloqueia o envio (T13); **falta** ligar a homologação e a revisão humana ao estado e à reauditoria |
| RA-08 | API rejeita campos produzidos pelo motor | aberto (Etapa 8) |
| RA-09 | Perda de zeros/representação de revisão | resolvido e verificado (Etapa 1) |
| RA-10 | Inspeção rejeita planilha legível | resolvido e verificado (Etapa 1) |
| RA-11 | Cancelamento e prazos incompletos | aberto (Etapa 8) |
| RA-12 | ML não implementado/avaliado | aberto (Etapas 9–10; depende de acervo autorizado) |
| RA-13 | Chat esconde pendências e duplica ações | aberto (Etapa 6) |
| RA-14 | Autorização antiga e unidades ambíguas | **parcial**: autorização antiga tratada (T15); unidades ambíguas abertas |
| RA-15 | Excel omite valor e contexto operacional | aberto (Etapa 7) |
| RA-16 | Cobertura não representa o fluxo completo | aberto (Etapa 11) |

Resumo: 5 resolvidos, 4 parciais (RA-02, 03, 07, 14), 7 abertos.

## 4. Limitações e riscos
- A matriz de 17 casos é **sintética**; nenhum binário de planilha corporativa foi usado. Não há homologação com banco real nem validação com usuários.
- A comparação nova pode **aumentar o número de erros** em alocações reais (títulos/TAGs que antes passavam em silêncio). É o objetivo, mas convém conferir com uma alocação real antes de publicar.
- A Etapa 3 deixa registros "Verificações inconclusivas" enquanto TAG/EAP/Data Book/Workflow não estiverem validados; ainda não há tela para registrar validações.
- Os 11 casos reprovados citados no pacote da Etapa 2 eram da matriz independente mais ampla do ambiente de origem; aqui foram reproduzidos os 17 casos do script do pacote (5 reprovavam; todos passam agora). Os demais casos, se existirem, não vieram no pacote.

## 5. Próximos passos
Concluir RA-02 (Workflow, Data Book, níveis EAP, semântica), RA-07 (homologação e revisão no estado e na reauditoria) e seguir para a Etapa 5 (parecer e indicadores).
