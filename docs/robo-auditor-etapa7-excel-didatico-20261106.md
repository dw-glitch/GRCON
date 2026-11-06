# Robô Auditor de Alocações — Etapa 7: Excel didático, correções na origem e reauditoria (RA-04, RA-15) — 06/11/2026

Situação: **Etapa 7 implementada e testada localmente.** Nada publicado; sem validação com a equipe de Qualidade; sem alocação real.

## 1. O que mudou no Excel
Organização operacional (nesta ordem; `LEIA PRIMEIRO` substitui o antigo `RESUMO`):

| Aba | Para quê |
|---|---|
| **LEIA PRIMEIRO** | Parecer, identificação, contagens **por unidade** (documentos · ocorrências · propostas), **Por onde começar** (as cinco abas, na ordem), reauditoria (quando houver), limitações |
| **O QUE CORRIGIR** | Erros confirmados e verificações pendentes ainda em aberto. Por linha: documento e revisão, alocação, problema, **por que importa**, valor encontrado, valor de referência encontrado (**a confirmar**), **valor correto (somente quando comprovado)**, referência consultada, ação recomendada, **onde corrigir** (arquivo · aba · linha/célula; LD ou alocação), status e **como verificar a resolução** |
| **PROPOSTAS PARA REVISÃO** | Propostas de correção e sugestões preventivas. Coluna **"Valor sugerido (NÃO aplicado)"**; decisão (aguardando / autorizada — falta aplicar / recusada), quem e quando decidiu, justificativa |
| **CORREÇÕES VERIFICADAS** | Só alterações **lidas de volta na cópia gerada** (valor original → corrigido, arquivo, aba, célula, quem autorizou, prova de resolução) e resoluções **comprovadas por reauditoria**. Vazia = diz o motivo, sem linhas fictícias |
| **REFERÊNCIAS E DECISÕES** | Trilha completa: decisões humanas (quem, quando, por quê, evidência), fontes com SHA-256, versões das referências, arquivos não produzidos |
| **REAUDITORIA** (só se houver) | Comparação anterior × atual: resolvida · persiste · nova |
| DETALHAMENTO · ALOCAÇÃO CORRIGIDA · TÍTULOS DA LD | Abas técnicas por alocação, mantidas (trilha completa) |

As cinco abas são globais (têm a coluna Alocação); as técnicas continuam uma por alocação.

### Regra obrigatória: sugestão não é correção realizada (RA-04)
- **ALOCAÇÃO CORRIGIDA** agora mantém o **valor recebido** em todas as células. Só entra valor quando existe alteração **verificada** na cópia gerada (célula verde). Proposta e autorização **não** preenchem célula e **não** são destacadas; ficam na coluna "Propostas não aplicadas (valor atual preservado)", e a situação diz "Nada aplicado: N proposta(s) aguardam decisão / autorizada(s), cópia pendente".
- "Código sugerido" virou "Código sugerido (não aplicado)".
- "Valor correto" só aparece com **decisão autorizada** (e diz "ainda não aplicado na cópia") ou aplicação verificada; senão: "Sem valor comprovado". O valor encontrado na LD é mostrado como **referência a confirmar**, porque a mensagem do motor manda confirmar qual lado está atualizado.

### Dados e contexto (RA-15)
- **DETALHAMENTO** passa a preencher o **valor atual** mesmo sem sugestão (evidência do motor ou valor da linha). Todas as colunas e a trilha foram preservadas.
- Cada pendência traz "onde corrigir" com arquivo/aba/linha (LD exata) ou célula da alocação oficial.
- Orientação "por que importa" é a mesma do chat (teste confere que as duas tabelas não divergem).

## 2. Reauditoria com comparação (anterior × posterior)
- **Novo `allocation_auditor_reaudit.js`:** compara o resultado anterior com o atual por (alocação, documento, revisão) e por (regra, campo). Classifica **resolvida / persiste / nova**; documentos que só existem de um lado não viram "resolvidos"; sugestão preventiva não entra.
- **Fluxo:** ao reexecutar (ou anexar LD/alocação corrigida e auditar), o serviço guarda o resultado concluído anterior, compara e mostra no chat (cartão de resultado e rótulo "Persiste/Nova após a correção" nas pendências) e no Excel (aba REAUDITORIA + CORREÇÕES VERIFICADAS).
- **Pacote:** cada cópia oficial corrigida é relida e **auditada de novo**; essa segunda auditoria alimenta o parecer (Etapa 5). Correção **só em LD** não tem segunda auditoria no pacote: fica "aplicada — falta reauditar" e o estado é "Verificação complementar necessária" até reexecutar com a LD corrigida. Proposta aplicada sem reauditoria que a cubra também bloqueia (novo impedimento `SEM-REAUDITORIA-PROPOSTA`).

## 3. Correções na origem
Preservação dos originais, fórmulas e históricos já é garantida pelo escritor de cópias (`allocation_auditor_revision.js`: só a célula-alvo é alterada no XML, fórmula na célula-alvo é recusada, leitura de volta e hash do original); cobertura em `allocation_auditor_corrections_phase6.cjs` e `allocation_auditor_package_phase7.cjs`. Esta etapa não alterou o escritor. O relatório agora aponta **a LD como local de correção** quando a origem do apontamento é a LD.

## 4. Verificação
- `tests/allocation_auditor_reaudit_stage7.cjs` (comparação, regressões, documentos sem par, integração com o parecer) e `tests/allocation_auditor_report_stage7.cjs` (modelo puro + pacote real no Worker); ambos em `test:allocation-auditor`.
- Os testes antigos que **afirmavam o comportamento do RA-04** (valor proposto preenchido e destacado na aba corrigida) foram atualizados para a nova regra; os de nomes de abas, para a nova organização. `package_phase7` ganhou asserções do fluxo cópia verificada → segunda auditoria → CORREÇÕES VERIFICADAS.
- Pré-requisitos independentes do pacote da Etapa 0: `W05-unapproved-value` e `W06-plain-values` reprovavam e agora **aprovam** (W07/W08, da Etapa 8, seguem reprovando).
- Inspeção visual do `LEIA PRIMEIRO` e da aba O QUE CORRIGIR renderizados pelo LibreOffice (pacote sintético).

## 5. Limites e riscos
- Excel com 15 colunas na aba O QUE CORRIGIR exige rolagem horizontal em tela pequena; larguras foram reduzidas e há cabeçalho congelado, mas **não houve teste de usabilidade** com a equipe.
- A reauditoria compara duas execuções da **mesma sessão do chat**; ela não é persistida entre sessões (o histórico salvo continua sendo o da Etapa 2).
- Correções em LD não são reauditadas dentro do pacote (dependem de reexecutar com a LD corrigida).
- "Valor correto" é conservador: um valor lido da LD não conta como comprovado enquanto o motor pedir confirmação.

## 6. Matriz
RA-04 e RA-15: **resolvidos e verificados localmente**. RA-03: reauditoria agora produzida no fluxo (pacote e chat). Resumo: **11 resolvidos localmente** (RA-01–06, 09, 10, 13, 14, 15), 1 parcial (RA-07), 4 abertos (RA-08, RA-11, RA-12, RA-16).
