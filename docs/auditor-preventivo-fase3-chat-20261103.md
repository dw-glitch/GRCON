# GRCON — Robô Auditor Preventivo 2.0 — Fase 3: conversa operacional
**Data:** 03/11/2026  
**Branch:** `feat/auditor-preventivo-fase0-20261103`

## Missão e limites

O usuário prepara uma alocação **antes da fiscalização**. O robô utiliza bases técnicas e comentários históricos da Fiscal 01 como evidências e precedentes; não é um mecanismo de auditoria de arquivos devolvidos pela fiscalização. Alocações externas devem conservar a identidade da planilha enviada, sem exigência de histórico no Gerador.

Esta fase desenvolveu o **comportamento da conversa** e corrigiu regressões das Fases 1/2. O upload com auditoria automática após validar arquivos e a conservação de LD adicionada à sessão serão implementados na Fase 4. Não afirmar que já estão prontos.

## Alterações na branch

1. **Serviço do Gerador — `src/react/allocation/service.ts`:** `auditCurrent(false)` e `auditSavedRun` agora carregam somente o bundle do serviço Auditor via `GRCONModuleLoader.ensure`, sem reativar uma tela independente.
2. **Ponte de integração — `src/react/allocation/index.tsx`:** expõe `auditCurrentInChat()`. O assistente usa essa chamada, evitando a recursão que ocorria ao invocar a antiga `auditCurrent()` (que abria o próprio chat novamente).
3. **Estado conversacional — `src/react/allocation-auditor/assistantStore.ts`:** mensagens preventivas; ações `help`, `status`, `current`, `auditFiles`, `resume`, `pause`, `details`, `download` e `generate`; tratamento explícito de erros e histórico de sessões. `pause()` não passa pelo bloqueio da operação pendente, permitindo solicitar parada durante a análise; o processamento em lote fica a cargo do motor existente.
4. **Prioridade da origem externa:** se o operador anexar `C1O-ALOC-CM-0372-2026.xlsx` e digitar seu número, o chat usa os registros do arquivo enviado, não os substitui silenciosamente por registros do histórico. Se houver origem anexada diferente do número solicitado, o chat explica o conflito antes de uma substituição.
5. **Segurança da numeração:** o download preventivo chama `assistantPackage(sessionId,false)`. A ação de **nova emissão oficial** permanece distinta e exige dois cliques: solicitar e confirmar. Uma auditoria externa ou um download comum não emitem numeração oficial.
6. **UI — `AllocationAssistant.tsx` e `allocation-auditor.css`:** ações rápidas contextuais (Auditar arquivos, Retomar análise, Situação, Ver pendências, Ajuda), comandos em linguagem natural, confirmação explícita para nova emissão e aviso de que auditoria preventiva não equivale à aprovação fiscal. O controle `Auditar arquivos` desaparece enquanto existir um lote parcialmente pausado para evitar reinicialização acidental. Alterar o conjunto de registros elimina confirmação pendente.
7. **Teste de navegador anterior — `scripts/validar-allocation-assistant-browser.cjs`:** atualizado para nome acessível `Robô Auditor Preventivo` e `aria-modal="false"`. Os demais ensaios históricos foram preservados.
8. **Teste comportamental — `tests/allocation_auditor_chat_phase3.cjs`:** usa o `assistantStore.ts` transpilado por TypeScript com serviços e identidade simulados; verifica auditoria da seleção atual sem recursão, ajuda, situação, pacote sem numeração, emissão explícita, prioridades de arquivos externos, pausa durante operação pendente e limpeza de contexto. Incluído na bateria `npm run test:allocation-auditor`.

## Evidências verificadas neste turno

- Consulta direta da branch remota e atualização de cada arquivo por SHA via conector GitHub, sem editar a `main`.
- Os testes estáticos das Fases 1 e 2 foram executados sobre arquivos lidos da branch em motor JavaScript isolado e **ambos passaram**.
- Dez verificações adicionais de integração da Fase 3 foram aprovadas.
- O estado conversacional da versão intermediária foi executado com dependências simuladas em JavaScript isolado, após retirada apenas das anotações TS: **8/8 cenários aprovados**, incluindo priorização de anexo externo, pausa e numeração. Esse procedimento **não é** um teste de compilação TypeScript.
- O teste Node `allocation_auditor_chat_phase3.cjs` foi escrito e revisado: correção do regex literal, do nome `qaModule` para evitar colisão no wrapper CommonJS, e do texto de singular. A suíte Node real **ainda não foi executada**.
- Nenhum workflow pago, migração de banco, alteração de permissões, arquivos corporativos ou deploy Cloudflare foi acionado.

## Pendências antes de aprovar merge ou publicação

- Executar `npm ci`, `npm run typecheck`, `npm run build`, `npm run test:allocation-auditor` e `npm run verify` num checkout integral com ferramentas instaladas.
- Executar o teste de navegador existente e um novo smoke do launcher hospedado no **Gerador real** (o ensaio de navegador anterior usa um host sintético). Confirmar ausência de travamento do Gerador e posicionamento do mascote.
- Simular interrupção/retomada de 2.500 documentos e verificação das permissões em uma sessão autenticada autorizada.
- Conferir visualmente em 1280/1440 px, tema escuro e telas estreitas; validar controles de teclado e o download real do ZIP.
- Não liberar produção até esses critérios estarem aprovados.

**Status:** Fase 3 implementada na branch e verificação estrutural/comportamental parcial positiva. Homologação executável completa pendente, com `main` e Cloudflare inalterados.

**Próxima fase:** Fase 4 — importação universal e início automático da auditoria após validação dos anexos, com preservação do conjunto de alocações ao adicionar LDs.
