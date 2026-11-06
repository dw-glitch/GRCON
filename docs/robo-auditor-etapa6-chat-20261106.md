# Robô Auditor de Alocações — Etapa 6: reconstrução do chat (RA-13) — 06/11/2026

Situação: **Etapa 6 implementada e validada localmente** (testes unitários, JSDOM e navegador real Chromium em 1440/1280/390/320 px). Nada publicado; sem validação com usuários.

## 1. O que mudou
| Antes (RA-13) | Agora |
|---|---|
| "Ver pendências" só dizia que as ocorrências estavam no Excel | Abre a aba **Pendências** dentro da janela: um cartão por ocorrência/proposta, com filtro por tipo, busca e "somente em aberto" |
| Seis `<details>` (arquivos, propostas agrupadas, nova alocação, conversas salvas…) | **Zero acordeões**. Quatro abas (Conversa · Pendências · Arquivos · Histórico) navegáveis por setas |
| Dois botões de download iguais ("Gerar arquivos corrigidos" e "Baixar pacote completo"), "Auditar novamente" ao lado de "Auditar alocação atual" | **Uma ação principal** que muda com o estado (Auditar → Retomar → Ver pendências → Baixar) e **um único** botão de download |
| Sem noção de etapa | Seis etapas (Alocação · LDs e referências · Auditoria · Diagnóstico · Correções · Relatório) derivadas do estado real; sem LD = "atenção", nunca "ok" |
| Erro como texto solto | Caixa **O que aconteceu / O que ficou comprometido / O que fazer** |
| Só fechar | **Minimizar** sem descartar; o botão flutuante mostra o andamento ("Auditando 40/120", "Ver resultado") e o número de documentos com erro/pendência; reabre na mesma aba |
| Histórico dentro da conversa | Aba **Histórico** separada |

Cada cartão de pendência mostra: documento, revisão e alocação · problema · **por que importa** · valor encontrado · valor sugerido (marcado "não aplicado") · referência consultada (fonte, arquivo, aba, linha) · o que fazer · **onde corrigir** · **como verificar** · status do ciclo de vida (do parecer da Etapa 5). **Revisão individual**: autorizar/recusar proposta (justificativa ≥ 5 caracteres; evidência para campos de classificação) ou registrar **exceção justificada** (justificativa + evidência obrigatórias). A decisão fica no evento do usuário; autorizar não altera arquivo.

Arquivos: `src/react/allocation-auditor/chatView.ts` (modelo puro), `PendenciasPanel.tsx`, `AllocationAssistant.tsx` (reescrito), `RobotAuditorLauncher.tsx`, `assistantStore.ts` (aba, `setTab`, `decide`), `allocation-auditor.css`. As contagens vêm do parecer canônico (Etapa 5): chat, Resumo e manifesto continuam usando a mesma fonte.

## 2. Funcionamento pedido (itens 1–11)
| # | Ação | Como |
|---|---|---|
| 1 | Informar o número da alocação | Campo no cartão de início ("Auditar esta alocação") |
| 2 | Selecionar existente / importar externa | "Auditar alocação atual" e "Enviar outra alocação" |
| 3 | Anexar LDs e referências | 📎 / LD no rodapé e na aba Arquivos. **Referências além de LDs (.xlsx) ainda não têm anexo na tela** (catálogo da Etapa 3 segue vindo do contexto) |
| 4 | Solicitar auditoria | Ação principal / mensagem |
| 5 | Acompanhar | Barra de progresso, etapas e "Pausar análise" |
| 6 | Diagnóstico | Cartão de resultado (documentos · ocorrências · propostas, com unidade) e impedimentos |
| 7 | Abrir e filtrar pendências | Aba Pendências |
| 8 | Orientação individual | Cartão do item |
| 9 | Preparar correções na origem | **Parcial**: autorizar/recusar propostas e gerar cópias pelo relatório; o Excel didático e a correção na LD de origem são a Etapa 7 |
| 10 | Exportar relatório | "Baixar relatório e arquivos" |
| 11 | Reexecutar | "Reexecutar auditoria" |

## 3. Verificação
- `tests/allocation_auditor_chat_view_stage6.cjs` (modelo: itens, filtros, ciclo de vida, próxima ação sem "pronto" sem parecer, etapas, mensagens) e `tests/allocation_auditor_chat_dom_stage6.cjs` (React real + Worker em JSDOM: sem acordeões, abas por teclado, ação única, pendências com orientação, busca, minimizar/reabrir). Ambos na suíte `test:allocation-auditor`.
- Testes de DOM antigos atualizados para a nova interface (rótulos "Minimizar conversa", "Auditar alocação", aba Histórico, texto "documento(s) com verificação pendente").
- `scripts/validar-allocation-assistant-browser.cjs` (**navegador real**, fora do `npm test`): agora cobre pendências na interface, filtros, decisão individual (exceção), teclado, painel dentro de 390×800 e 320×640 sem rolagem horizontal e campo de mensagem visível; capturas em `artifacts/allocation-assistant/` (`chat-*.png`). Os trechos de checkpoint/retomada da fixture estavam defasados em relação ao serviço (`input-chunk`/`input-detail`, `created_by`) e foram corrigidos; já falhavam antes desta etapa.

## 4. Limites
- Validação visual feita em Chromium; sem Safari/Firefox, sem tema escuro revisado e sem teste de usabilidade com a equipe.
- Auditoria de 12.000 documentos no script de navegador levou ~45 s após reanexar (inclui retomada); não comparei com antes das Etapas 3–4.
- Pendências de campos sem regra de revisão (ex.: LD ausente) mostram a orientação, mas não oferecem decisão — só a ação na origem.
- A reauditoria automática continua não produzida pelo fluxo (Etapas 7/8).

## 5. Matriz
RA-13: **resolvido e verificado localmente** (testes + navegador real), pendente de validação com usuários. Resumo: 9 resolvidos localmente, 1 parcial (RA-07), 6 abertos (RA-04, 08, 11, 12, 15, 16).
