# GRCON — Robô Auditor Preventivo 2.0 — Fase 2
**Data:** 03/11/2026  
**Branch de trabalho:** `feat/auditor-preventivo-fase0-20261103`  
**Propósito:** manter o mascote oficial do GRCON como acionador flutuante do chat preventivo, sem duplicar sua instância nem bloquear o Gerador de Alocação.

## Alterações efetivadas

1. **Launcher React:** `src/react/allocation-auditor/RobotAuditorLauncher.tsx`.
   - A estrutura do botão permanece conectada ao DOM enquanto o chat está aberto. O botão fica invisível e inacessível, mas o host do mascote continua presente, evitando que o runtime recrie sua instância ao transferir o elemento.
   - Há `aria-controls="aac-panel"`, `aria-expanded`, rótulo acessível e opção de abertura por teclado.
   - A exibição depende da visibilidade do Gerador **e** de `GrconAllocationGeneratorUi.assistantEnabled()`; mudanças de contrato, login e logout atualizam essa condição.
   - Desativar o contrato ou sair do Gerador fecha o assistente e devolve o mascote ao cabeçalho.
   - O launcher trata carregamento tardio do `GrconMascot` oficial, monitorando a marca `data-grcon-mascot-runtime` sem importar ou criar personagens genéricos.
2. **Chat React:** `src/react/allocation-auditor/AllocationAssistant.tsx`.
   - Movimentação do mascote `launcher → chat → launcher/cabeçalho` via `GrconMascot.presentIn`.
   - `useLayoutEffect` efetua a transferência antes da pintura sempre que o runtime já está pronto; observer cobre inicialização tardia.
   - A saudação oficial `hello` não é imediatamente substituída por `idle`.
   - Estados reais `analyzing`, `warning` e `success` mantêm o mesmo registro de vídeos WebM do GRCON; nenhuma animação nova foi gerada.
   - Escape fecha a conversa e o foco retorna ao botão flutuante, quando ainda disponível.
   - O conteúdo rola dentro da conversa sem forçar a página inteira a rolar.
3. **Estilos:** `allocation-auditor.css`.
   - Painel lateral não modal e responsivo; camada externa não intercepta cliques no Gerador.
   - Posicionamento considera áreas seguras da janela; tema segue variáveis do GRCON.
   - Mídia reduzida desativa movimentos visuais decorativos; o runtime original já utiliza fallback PNG estático.
4. **Inicialização por contrato:** `src/react/allocation/AllocationApp.tsx`.
   - O carregamento lazy do Robô é reavaliado em `grcon:contract-context-changed`, `grcon:cloud-ready` e `grcon:cloud-signed-out`.
   - Guard explícito evita invocar um carregador ausente. O bundle permanece reaproveitado.
5. **Teste de segurança:** `tests/allocation_auditor_mascot_phase2.cjs`.
   - Registrado no comando `npm run test:allocation-auditor`.
   - Verifica host conectado, contratos, acessibilidade, transferência do mascote, modal não bloqueante, redução de movimento e referências aos vídeos oficiais.
   - O teste estático da fase anterior `tests/allocation_auditor_preventive_shell.cjs` continua registrado.

## Evidência obtida nesta sessão

- Releitura remota do conteúdo dos arquivos alterados na branch GitHub.
- **27/27** controles estruturais complementares aprovados.
- Os **dois scripts exatos de testes estáticos** da branch foram executados em ambiente JavaScript isolado com leitura de arquivos simulada pelos conteúdos obtidos do GitHub: ambos terminaram sem erro.
- A verificação de ambiente local constatou Node.js e `tsc` instalados, mas o download da árvore de arquivos via GitHub falhou por indisponibilidade de resolução de DNS. Por isso **não foram executados `npm ci`, `npm run typecheck`, `npm run build`, `npm run verify` nem Playwright com o aplicativo completo**.
- Nenhum GitHub Actions pago foi acionado; nenhum arquivo corporativo foi enviado; nenhum deploy Cloudflare foi realizado.

Os testes estáticos **não provam** que todas as transições visuais ocorrerão corretamente em React/Chromium; a Fase 2 permanece **implementada na branch, aguardando homologação executável**.

## Gates obrigatórios antes de merge/publicação

- Executar os comandos da suíte completa do GRCON em ambiente com checkout e dependências autorizados.
- Validar em Chromium: ida e volta da mesma instância do mascote entre cabeçalho, botão e chat, inclusive abertura/fechamento rápidos.
- Verificar `GrconMascot.diagnostics().instances === 1`, sem vídeos duplicados; `prefers-reduced-motion` usa sprite estático; WebMs retornam 200 e reproduzem os estados corretos.
- Inspecionar 1280, 1440 e telas estreitas: sem sobreposição de ações essenciais, scroll horizontal ou captura indevida de clique.
- Alternar entre contrato habilitado e desabilitado, mudar de módulo e efetuar logout: sem acesso indevido nem mascote fora do contexto.
- Conferir preservação dos testes legados do Auditor e do Gerador.
- Não publicar no Cloudflare antes dessas aprovações.

**Próxima fase funcional:** Fase 3 — aperfeiçoar chat conversacional e comandos. A importação automática e a conservação das LDs após anexos pertencem à Fase 4, não foram afirmadas como prontas nesta entrega.
