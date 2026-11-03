# GRCON — Robô Auditor Preventivo 2.0 — Fase 1 (2026-11-03)

## Escopo executado na branch

Branch: `feat/auditor-preventivo-fase0-20261103`, criada da `main` em `4fb07f763eefb7f4f6da0182ebf8059440f16d06`.

Esta entrega **não foi publicada**. Não altera dados, contratos, migrações, numeração oficial, comentários fiscais ou armazenamento R2.

1. `index.html`: remove o cartão independente **Auditor de Alocações** das Ferramentas Adicionais e move `grcon-allocation-auditor-root` para dentro de `allocation-generator-module`, ao lado do root do Gerador.
2. `grcon_module_loader.js`: caminhos legados para `allocation-auditor` abrem primeiro o Gerador e depois o chat, respeitando a habilitação do contrato.
3. `src/react/allocation-auditor/index.tsx`: em produção monta apenas `RobotAuditorLauncher` e `AllocationAssistant`; a tela React antiga é conservada exclusivamente para *fixtures* de testes que ainda usam `#allocation-auditor-module`.
4. `RobotAuditorLauncher.tsx`: botão flutuante com **instância única do mascote oficial**, transferida pelo runtime `GrconMascot.presentIn`; observa visibilidade do Gerador e devolve o mascote ao cabeçalho quando a interface é fechada/trocada.
5. `AllocationAssistant.tsx` e `allocation-auditor.css`: diálogo lateral não modal (sem bloqueio de fundo e sem prisão de foco), com responsividade, Escape para fechar e foco retornando ao launcher. O mascote continua se movendo do launcher para a conversa ao abrir.
6. `src/react/allocation/AllocationApp.tsx`: carrega o bundle do assistente de forma preguiçosa ao entrar no Gerador em um contrato habilitado; remove o botão do cabeçalho, e preserva a ação contextual no histórico onde habilitada.
7. `src/react/allocation/index.tsx`: expõe `assistantEnabled()` à navegação para não contornar a regra contratual.
8. `tests/allocation_auditor_preventive_shell.cjs`: contrato estático de regressão; incluído no script `test:allocation-auditor`.

## Resultado da verificação disponível

Leitura remota dos arquivos na branch e execução de 17 verificações estáticas no orquestrador de ferramentas: **17/17 passaram** (estrutura HTML, ausência de rota visual isolada, lazy-load, launcher, runtime oficial, portal não modal, gate contratual, ausência de emissão por padrão e inclusão do teste).

Essas verificações **não substituem** build, TypeScript, Node tests, testes Playwright/Chromium nem autorização real. A infraestrutura atual não permite clonar o repositório completo (DNS de `github.com` indisponível), portanto não houve execução de:
- `npm ci`
- `npm run typecheck`
- `npm run build`
- `npm run test:allocation-auditor`
- `npm run verify`
- navegadores reais autenticados

**Status honesto:** integração estrutural da Fase 1 implementada na branch e verificação estática aprovada. **Homologação executável e liberação para merge/publicação pendentes.** Não abrir PR que dispare Actions pagos nem realizar deploy até rodar/verificar esses gates em ambiente autorizado.

## O que pertence às próximas fases

- Fase 2: lapidar posicionamento do mascote e comportamento de animações usando sessão de navegador real.
- Fase 3: linguagem conversacional contextual, retomada e feedback sem travar o Gerador.
- Fase 4: upload universal com detecção de cabeçalhos, auditoria automática pós-importação e preservação da análise ao adicionar LD.
- Fase 5: usar o histórico da Fiscal 01 **somente como precedentes preventivos**, não auditar arquivos devolvidos.
- Fases 6+: correções seguras, exportações e homologação de precisão.

## Critérios de aprovação para liberar a Fase 1

1. Gerador abre e continua funcional; auditoria aparece somente dentro dele.
2. Mascote oficial aparece como launcher e migra ao chat; fecha retornando ao launcher/cabeçalho.
3. Ao sair do Gerador, o chat fecha sem flutuar sobre outros módulos.
4. Links antigos de auditoria abrem o Gerador+chat, com gate contratual.
5. Chat aberto não bloqueia digitação, rolagem nem botões do Gerador.
6. Testes legacy e novos passam em TypeScript, npm e navegador.
7. Nenhuma alteração à numeração, LD original, Central ou RLS.

Apenas os itens estruturalmente verificáveis foram conferidos nesta execução. Itens dependentes de runtime/navegador permanecem pendentes.
