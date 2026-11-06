# Robô Auditor de Alocações — Etapa 5: parecer, decisões e indicadores — 06/11/2026

Situação: **Etapa 5 implementada e testada localmente (RA-03 e RA-14).** Nada publicado, nenhuma migração aplicada, nada validado com dados reais.

## 1. O que mudou
Novo módulo `allocation_auditor_opinion.js` (`GrconAllocationAuditorOpinion`, v1.0.0): **uma única fonte** para o estado final, as contagens, o relatório e o chat. `allocation_auditor_package.js#finalState` passou a delegar a ele; o Worker, o carregador de módulos, o verificador de produção e o teste de governança listam o arquivo novo.

### Três unidades que nunca se misturam (RA-14)
| Unidade | O que conta | Onde aparece |
|---|---|---|
| **Documentos** | linhas analisadas, documentos distintos, sem apontamentos, com erro, com pendência | Resumo, manifesto (`opinion.counts`), chat |
| **Ocorrências** | apontamentos do motor: erro confirmado, pendência, sugestão preventiva | idem |
| **Propostas** | valores sugeridos: sugerida, autorizada, recusada, aplicada, resolvida (comprovada), contradita | idem |

O Resumo do relatório ganhou o bloco **Contagens por unidade** (com os impedimentos para concluir); o manifesto ganhou `opinion` (estado, contagens, impedimentos e ciclo de vida). Os rótulos e valores anteriores (`manifest.counts`, "Documentos analisados" etc.) foram mantidos.

### Ciclo de vida (RA-03)
- **Proposta:** sugerida → autorizada | recusada → aplicada → resolvida-comprovada | contradita.
- **Ocorrência:** aberta/pendente → aplicada → resolvida-comprovada | resolução-contradita; ou exceção-justificada.
- **Encerrar exige achado + evidência + reauditoria.** Uma alteração só resolve o que cita (`findingIds`); sem citar, resolve no máximo **um** erro do mesmo campo (T14). Alteração não verificada nunca resolve. Se existe reauditoria (segunda auditoria das cópias): achado ausente → *resolvida-comprovada*; ainda presente → *resolução-contradita* (volta a bloquear); linha sem reauditoria → *aplicada-sem-reauditoria* (bloqueia). Sem reauditoria separada vale a verificação da própria cópia (compatível com o fluxo atual).
- **Decisão vigente (T15):** a última por (linhagem, campo, valor), ordenada por horário; recusar ou revogar depois de autorizar remove a autorização; decisão sobre outro valor não vale.
- **Proposta em aberto (T13):** sugerida ou autorizada sem alteração verificada impede "Pronta para conferência final e envio". A proposta é coberta por alteração do mesmo valor e **não gasta a cota** do erro do mesmo campo (corrige um defeito em que erro + proposta do mesmo campo deixavam a proposta aberta para sempre).
- **Exceção justificada:** só com justificativa (≥5 caracteres) e evidência de um humano; mesmo válida, gera o impedimento "conferência humana final" — nunca "pronta" automático.

### Estado final
`ready` somente sem nenhum impedimento. Impedimentos: ERRO-ABERTO (→ *Correção necessária*), PENDENCIA-ABERTA, PROPOSTA-ABERTA, SEM-REAUDITORIA, PROPOSTA-CONTRADITA, EXCECAO-JUSTIFICADA, ARQUIVO-NAO-PRODUZIDO, CONTEXTO-LIMITADO (→ *Verificação complementar necessária*). Sugestão preventiva não bloqueia.

### Chat
`assistantStore.ts` usa as mesmas frases (`describe`) na situação e na conclusão da auditoria, com os impedimentos. A reformulação completa do chat (RA-13) continua na Etapa 6.

## 2. Testes
`tests/allocation_auditor_opinion_stage5.cjs` (na suíte `test:allocation-auditor`): unidades, sugestão não bloqueia, T13, T14, erro+proposta, T15 (inclusive eventos fora de ordem), reauditoria (sem / contradita / comprovada), exceção fraca × válida, arquivo não produzido/contexto limitado, e integração com `finalState`. Teste de mutação manual: remover o filtro `verified` ou a cota por alteração faz o teste falhar.

## 3. Limites e riscos
- A **reauditoria ainda não é executada automaticamente**: o módulo a aceita (`reaudit`), mas o fluxo atual do pacote não a produz; hoje vale a verificação da própria cópia. Disparar a segunda auditoria sobre as cópias geradas é trabalho para a Etapa 6/8.
- Exceção justificada ainda não tem tela de registro (Etapa 6).
- Matriz sintética; sem dados reais nem usuários. Motor 1.6.0 inalterado.

## 4. Matriz (atualização)
| RA | Situação |
|---|---|
| RA-03 | **resolvido localmente** no parecer/estado (T13, T14, reauditoria modelada e testada); falta **produzir** a reauditoria no fluxo |
| RA-14 | **resolvido localmente** (T15 + unidades separadas e únicas em Resumo, manifesto e chat) |
Demais linhas inalteradas em relação a `docs/robo-auditor-etapa4-comparacao-20261106.md`. Resumo: 6 + 2 resolvidos localmente = **8**, 1 parcial (RA-07), 7 abertos.
