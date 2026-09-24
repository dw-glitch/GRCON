# GRCON Mascot Runtime v5

## Fonte de verdade

O personagem continua sendo o mascote oficial do GRCON. Os seis estados animados foram preparados a partir do elemento Higgsfield `grcon-mascot` (`5d684379-9c43-47db-913a-6af9d779e8b2`) e versionados localmente como WebM VP9 com alpha:

- `idle` → `assets/mascot/video/grcon-mascot-idle-alpha.webm`
- `hello` → `assets/mascot/video/grcon-mascot-hello-alpha.webm`
- `analyzing` → `assets/mascot/video/grcon-mascot-analyzing-alpha.webm`
- `warning` → `assets/mascot/video/grcon-mascot-warning-alpha.webm`
- `success` → `assets/mascot/video/grcon-mascot-success-alpha.webm`
- `running` → `assets/mascot/video/grcon-mascot-run-alpha.webm`

A procedência e os job IDs ficam em `assets/mascot/video/higgsfield-source.json`. Nenhuma URL temporária do Higgsfield é usada em produção.

## Arquitetura

`grcon_mascot_controller.js` é o entrypoint estável. O runtime vive em `grcon_mascot_controller_v4.js` por compatibilidade de cache/caminho, mas sua versão lógica é 5.0.0.

Existe somente uma instância visual global: `#grcon-context-mascot`. Ela contém um único `<video>` reutilizado entre estados e o sprite PNG HD oficial como fallback estático.

`grcon_mascot_header.js`, `grcon_mascot_runner.js` e `grcon_mascot_success_pilot.js` são bridges de compatibilidade. Eles não criam player, overlay, timers operacionais ou listeners concorrentes.

React usa a mesma instância por `src/react/shared/mascot/`.

## API

A API pública é `window.GrconMascot`:

- `show(...)`
- `warning({ target, message })`
- `success(...)`
- `run(...)`
- `idle()`
- `hide()`
- `begin(...)`, que devolve uma operação cancelável com `success`, `warning`, `running`, `analyzing`, `cancel` e `end`
- `setEnabled(boolean)`
- `diagnostics()`

Estados antigos como `checking-document`, `checking-ld`, `generating-grdt` e `sigem-pw-analysis` são normalizados para a state machine nova.

## Comportamento

A prioridade é `warning > analyzing > running > success > hello > idle`. Warnings ativos não são interrompidos por sucesso. Operações guardam a geração do contexto atual; se o usuário navegar antes da resposta assíncrona, a conclusão antiga não altera a nova tela.

Sem target, o mascote usa uma região segura no canto inferior direito. Com target no desktop, o runtime tenta direita, esquerda, acima e abaixo, mantendo gap e limites da viewport. Em mobile, o target não faz o mascote atravessar formulários; a bolha comunica o contexto e o personagem permanece em posição segura.

A corrida usa o vídeo Higgsfield para o movimento corporal e CSS transform para o deslocamento controlado pela viewport. GSAP não foi adicionado porque não há runtime GSAP instalado no GRCON atual.

## Performance e acessibilidade

- `idle` e `hello` podem ser carregados primeiro.
- `analyzing`, `warning` e `success` são pré-carregados somente quando o navegador fica ocioso.
- `running` permanece sob demanda.
- o Service Worker pré-cacheia apenas `idle` e `hello`; os demais entram no cache quando usados.
- `prefers-reduced-motion: reduce` desativa corrida/deslocamentos e usa o PNG estático.
- a opção **Animações do mascote** fica nas configurações gerais e persiste localmente.
- ao desativar animações, o runtime não mantém fonte de vídeo carregada.
- mídia e overlay usam `pointer-events: none`.
- nenhuma informação funcional essencial existe somente na animação.

## Fallback

Falha de WebM → sprite PNG HD oficial. Falhas de mídia nunca bloqueiam o GRCON.
