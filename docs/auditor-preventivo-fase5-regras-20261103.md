# GRCON — Robô Auditor Preventivo 2.0 — Fase 5: motor técnico e precedentes

**Data:** 03/11/2026  
**Branch:** `feat/auditor-preventivo-fase0-20261103`  
**Propósito:** detectar e explicar riscos documentais antes de enviar a alocação à Fiscal 01. Arquivos devolvidos não são a entrada operacional prevista; comentários antigos são evidências históricas, não aprovação ou regra normativa automática.

## Alterações aplicadas

### Regras normativas

- Em `allocation_auditor_core.js` o `VERSION` do motor passa a `1.3.0`.
- Corrigida a identificação dos códigos de diagnóstico reais do validador ET: `ET_TAG_CHAR`, `ET_GROUP_COUNT` etc., além de possíveis identificadores com `ET-`. Antes o filtro `/^ET-/` ignorava códigos com `ET_`, deixando de reconhecer corretamente verificações dependentes de aplicabilidade.
- ET Rev. R com revisão e aplicação documental comprovadas pode apresentar severidade `error`; sem comprovação, a verificação permanece `pending`. Se a revisão comprovadamente aplicável for N/P/Q, a validação específica da Rev. R não vira erro confirmado: uma ocorrência `ET-REVISION-NEEDS-VALIDATION` explica a diferença e exige a regra correspondente à revisão.
- **Nenhum texto livre de IA e nenhum comentário fiscal** estabelece aplicabilidade normativa ou libera correção automaticamente.

### Inteligência de precedentes fiscais

- Comentário exato do mesmo documento/LD/revisão continua consultável. A simples existência de um apontamento antigo gera apenas `suggestion`; quando um **valor criticado relevante ainda é idêntico** ao valor da evidência anterior, emite-se `FISCAL-UNCHANGED-PRECEDENT` como risco `pending`.
- Recorrência `FISCAL-FAMILY-*` aparece somente com **três ou mais documentos distintos** da mesma disciplina e tipo de relatório RNEST, no mesmo contrato, com categoria fiscal classificada em comum. Três reapresentações do mesmo código **não** são uma recorrência de família.
- A família gera somente **sugestão preventiva** com `normativeProof:false`, `humanReview:true`, amostra de origem, versão, aba, linha e alocação. Não modifica automaticamente título, Workflow, TAG, Data Book ou EAP.
- Históricos legados sem identificação explícita do contrato continuam disponíveis para consulta **exata** no contexto já filtrado, preservando os testes e fluxos anteriores; **não** entram no mecanismo de generalização por família. Fontes explicitamente de outro contrato são descartadas.

### EAP, Workflow e desempenho

- Mantém a seleção pelo ancestral mais específico da EAP e desempate por disciplina do Workflow. Caso `3.9.2.1` tenha apenas ancestrais `3` e `3.9`, não inventar níveis seguintes nem exigir equivalência de níveis inexistentes na base. Múltiplas árvores para `10.2.1.2` permanecem ambíguas sem disciplina exclusiva.
- Divergência comprovável entre disciplina explicitamente codificada e disciplina interpretada do Workflow gera `WORKFLOW-DISCIPLINE-CONFLICT`, **sem proposta de autocorreção**; a gravidade permanece conservadora quando a base não está homologada.
- O índice de recorrência fiscal agora é pré-agregado **uma vez por análise**: não recalcula milhares de comentários para cada documento.
- O Worker apaga resultados cacheados ao receber um novo contexto, para não reaproveitar achados obsoletos quando bases e precedentes são atualizados.

### Chat

- `assistantStore.ts` e `AllocationAssistant.tsx` passam a distinguir `erros confirmados`, `verificações pendentes` e `sugestões preventivas`.
- O assistente lembra explicitamente que **ausência de alertas não é aprovação da fiscalização** e indica limites das bases indisponíveis.

### Compatibilidade da Fase 4

- Ajustado `tests/allocation_assistant_import_phase4.cjs` para converter arrays de outro contexto JavaScript (`vm`) a arrays nativos antes de `assert.deepEqual` em Node. Isso evita falha do próprio teste devido à diferença de protótipo, sem relaxar a comparação do conteúdo.

## Evidências de testes nesta execução

- Executados por JavaScript isolado com os conteúdos atuais do GitHub: **9/9 testes novos da Fase 5 aprovados**, incluindo ET `ET_`, revisão N vs R, risco de valor inalterado, isolamento de contratos, três documentos distintos, EAP parcial/ambígua, conflito do Workflow, invalidação de cache e 500 documentos com 1.200 referências históricas sintéticas.
- **24/24 testes anteriores do motor principal aprovados** nessa mesma estratégia com APIs Node substituídas por shims, após ajuste de uma regressão de escopo histórico; **um teste do módulo Cloudflare AI foi pulado**, pois importa um módulo externo fora do contexto de execução isolado.
- Essas verificações executam o motor real baixado da branch, mas **não equivalem** à execução de `node --test` no projeto inteiro e tampouco comprovam resultados técnicos em documentos reais autorizados.
- O teste `tests/allocation_auditor_preventive_phase5.cjs` foi salvo no GitHub e incorporado a `npm run test:allocation-auditor`.
- Sem migrações, novas permissões, alteração à Central compartilhada, emissão de GRDT/alocação, armazenamento corporativo no R2, workflows pagos ou deploy.

## Gates para merge e publicação

1. Rodar `npm ci`, `npm run typecheck`, `npm run build`, `npm run test:allocation-auditor` e `npm run verify` em um checkout completo e autorizado.
2. Executar Worker XLSX real e testes de navegador, inclusive upload automático, LD posterior, seleção de abas, retomada e troca de contrato.
3. Homologar em amostras reais e autorizadas os apontamentos da Fiscal 01: taxa de falsos positivos, falsos negativos, revisão contratual, TAGs, EAP e Data Book.
4. Confirmar que nenhuma sugestão ou comentário histórico seja convertido indevidamente em correção automática ou aprovação fiscal.
5. Confirmar impacto de desempenho em milhares de documentos e comentários reais, sem bloquear o Gerador.

**Status:** Fase 5 implementada na branch, com regressões do motor aprovadas em execução isolada. Build integral, testes de navegador e homologação normativa operacional continuam pendentes. A `main` e a produção Cloudflare permanecem inalteradas.

**Próxima fase:** Fase 6 — correções automáticas seguras, cópias na LD de origem, conferência de células, rastreabilidade e tratamento de casos ambíguos.
