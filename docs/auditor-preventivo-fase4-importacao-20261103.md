# GRCON — Robô Auditor Preventivo 2.0 — Fase 4

**Data:** 03/11/2026  
**Branch:** `feat/auditor-preventivo-fase0-20261103`  
**Objetivo:** auditar **alocações ainda não encaminhadas à fiscalização**, inclusive arquivos externos XLSX que nunca foram gerados pelo GRCON. Retornos e comentários anteriores da Fiscal 01 são referências históricas, não entradas operacionais de auditoria desta fase.

## Implementação

### 1. Importação universal com reconhecimento seguro

`src/react/allocation-auditor/service.ts` passa a oferecer `inspectBatch(files)` e `importMany(files, selectedSheets)`:

- Aceita o layout `official-16` **e** arquivos reconhecidos como `mapped` pelo motor existente em `allocation_auditor_core.js`.
- Escolhe automaticamente uma única aba documental elegível; prioriza `GERAL` oficial, modelo oficial único e `GERAL` mapeada, conforme diagnóstico.
- Havendo várias abas compatíveis sem escolha inequívoca, exige a seleção do operador: não mistura abas ou adivinha a origem.
- Limita a 20 XLSX por lote, 100 MB no total, 30 MB por arquivo no Worker e 50.000 documentos no conjunto. Preserva as verificações ZIP/OOXML já existentes.
- Faz **pré-validação de todos os arquivos antes de alterar a sessão**: nenhum arquivo de um lote inválido é incorporado parcialmente.
- Verifica nomes duplicados, hashes e colisões com conteúdos existentes; reapresentação do mesmo arquivo não duplica ocorrências.
- Identifica cada linha pelo contrato, hash, aba, posição, alocação, código documental e revisão. Históricos semelhantes não são descartados por mera coincidência do código.
- Metadados das fontes incluem `model`, `sheet`, `documentCount`, `correctionMode` e SHA-256.
- Arquivo mapeado é **auditável**, mas sua planilha não entra no writer oficial de correções sem modelo homologado. O pacote registra a limitação.

### 2. Limite da entrada: antes da fiscalização

Planilhas com **campo explícito** de comentário/retorno fiscal preenchido, ou com data de retorno, são rejeitadas no fluxo operacional preventivo com uma mensagem clara.

Uma coluna interna `STATUS/ OBSERVACAO` não é interpretada como comentário da Fiscal 01. Seu valor é preservado em `inputStatusObservation` e retirado de `fiscalComment`, `fiscalDecision` e `commentFindings` da ocorrência de entrada.

Comentários históricos da Fiscal 01 nas bases de conhecimento continuam acessíveis ao motor separadamente, com escopo e revisão.

### 3. Auditoria automática no chat

`src/react/allocation-auditor/assistantStore.ts`:

- Faz inspeção dos anexos antes do commit.
- Para planilhas de origem inequívoca, importa e **inicia automaticamente a auditoria**, sem segundo comando.
- Se houver ambiguidade, apresenta escolhas e inicia a análise somente após confirmar.
- A escolha pendente é local e isolada por contrato; mudança de contrato e logout limpam anexos em espera.
- Enquanto há escolha pendente, a navegação por comandos não deve substituir silenciosamente o lote.
- Ações continuam distintas: importar/auditar, preparar cópias, **emitir nova numeração oficial somente sob confirmação explícita**.

### 4. LDs anexadas depois da alocação

`service.importAssistantLd`:

- Valida hashes e nomes de LD antes do processamento.
- Preserva os **registros originais das alocações já carregadas** e suas referências.
- Se a fonte LD mudou, invalida resultados e decisões derivadas do contexto anterior e promove uma **reanálise automática** com a nova referência.
- Se houve apenas reanexação dos mesmos bytes para uma auditoria em checkpoint, conserva o estado anterior.
- Retoma automaticamente um checkpoint somente se **todas** as fontes de que a análise depende estiverem anexadas; senão, informa os arquivos faltantes.
- A importação da LD permanece no fluxo já existente do Gerador e não altera a LD original no disco ou Central compartilhada.

### 5. Interface

`AllocationAssistant.tsx` contém seleção de aba apenas quando necessária, com nome do arquivo, quantidade estimada de documentos e tipo de layout. A origem mapeada é identificada como auditável sem correção automática da planilha. Ações rápidas evitam recomeçar um checkpoint enquanto estiver incompleto.

## Evidências e limites

- Alterações realizadas no repositório remoto via GitHub, na branch isolada; a `main` e a produção Cloudflare não foram alteradas.
- Os scripts estáticos das Fases 1 e 2 foram reexecutados por JavaScript com arquivos remotos: **2/2 passaram**.
- Checagens estruturais específicas do fluxo importação/conversa: **15/15 passaram**.
- Testes de fluxo conversacional executados em V8 isolado com remoção das anotações de TypeScript: **12/12 cenários aprovados**.
- Métodos reais de pré-inspeção/importação/LD isolados de `service.ts`, executados com Worker sintético em V8: **13/13 cenários aprovados**.
- Dois novos testes Node no repositório:
  - `tests/allocation_assistant_import_phase4.cjs` (modelos mapeados, ambiguidade, colisões, lote atômico, observações internas, recusa de entrada fiscal, LD, proteção do writer);
  - `tests/allocation_assistant_auto_phase4.cjs` (início automático, escolhas, reanálise e checkpoints).
- Ambos são incluídos no script `npm run test:allocation-auditor`, mas **não foram executados pelo Node.js completo** nesta sessão.

**Limite importante:** não houve clone completo devido à falha de DNS de `github.com` no ambiente local. Por isso os comandos `npm ci`, `npm run typecheck`, `npm run build`, `npm run test:allocation-auditor`, `npm run verify` e Playwright/Chromium com aplicação integral **ainda precisam ser executados** antes de merge/publicação.

## Critérios para homologar a Fase 4

1. Rodar build e suíte Node sem erro, inclusive worker XLSX real.
2. Navegador: upload oficial e mapeado, autoauditoria, 2+ planilhas, escolha de aba ambígua, rejeição de planilha devolvida e anexação tardia de LD.
3. Confirmar que o lote inválido não altera resultados, arquivos ou numeração.
4. Validar duas ocorrências do mesmo documento em arquivos distintos (não deduplicar indevidamente).
5. Confirmar que a cópia de layout mapeado não é escrita como se fosse modelo oficial, e que o relatório informa as limitações.
6. Testar pausas e reanexação de arquivos após recarregar, com checkpoint válido e mudança de contrato.
7. Comprovar auditoria preventiva em arquivos reais autorizados e comparar achados com precedentes históricos, sem interpretação de comentários fiscais como entrada corrente.

**Status:** Fase 4 implementada na branch e aprovada em verificações estruturais e simulações isoladas. Homologação executável com o projeto completo, merge e publicação permanecem pendentes. Nenhuma ação paga do GitHub Actions foi disparada.

**Próxima fase planejada:** Fase 5 — motor de auditoria preventiva e aprimoramento da aplicação de precedentes fiscais (sem inferir aprovação nem aplicar correção sem evidência).
