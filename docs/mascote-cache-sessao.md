# Mascote GRCON — cache e saudação por sessão

## Causa corrigida

A implementação anterior dependia de um teste antecipado de WebM/VP9 e usava os mesmos URLs estáticos dos vídeos. Em ambientes corporativos isso podia levar diretamente ao PNG quando o navegador não declarava o codec no `canPlayType`, além de permitir reaproveitamento de respostas antigas para o mesmo URL de mídia.

A saudação também era controlada apenas por uma variável em memória. Por isso, um refresh podia reproduzir o aceno novamente e um logout/login na mesma aba podia não reproduzir uma nova saudação.

## Estratégia atual

- `grcon_mascot_controller.js` é um entrypoint mínimo e estável que carrega a implementação v4.
- `grcon_mascot_controller_v4.js` centraliza estados, assets, reprodução, diagnóstico e prioridade das animações.
- Os WebMs continuam hospedados no próprio GRCON e recebem uma versão determinística no URL (`v=20260916.2`).
- O Vercel entrega WebM como `video/webm` e permite cache imutável da mídia porque a revisão faz parte do URL solicitado.
- O entrypoint do controlador usa `no-store`, evitando que uma versão antiga permaneça presa no navegador.
- Não existe dependência de Higgsfield ou de URL temporária em tempo de execução.

## Saudação

- A entrada autenticada reproduz o aceno uma vez por sessão da aba.
- A marca é gravada em `sessionStorage`, nunca em `localStorage`.
- Refresh e navegação interna não repetem a saudação.
- Quando o aplicativo passa de desbloqueado para `grcon-cloud-pending`, o controlador interpreta isso como encerramento da sessão ativa e libera a próxima saudação.
- Uma nova entrada autenticada pode reproduzir o aceno novamente.

## Prioridade

Operações de análise/conferência sempre têm prioridade. Se uma operação começar durante o aceno, a saudação e a bolha são encerradas e o vídeo de processamento assume o mascote sem bloquear a tarefa.

## Fallback e acessibilidade

O PNG HD oficial fica visível até existir um frame reproduzível. Erro de mídia, rejeição de `play()`, timeout ou preferência `prefers-reduced-motion` nunca deixam a área do mascote invisível.

## Diagnóstico

`window.GrconMascot.diagnostics()` expõe a revisão dos assets, URLs finais, estado, falhas de mídia e eventos recentes. Logs detalhados no console só são ativados com `?grconMascotDebug=1` ou `sessionStorage["grcon:mascot:debug"] = "1"`.
