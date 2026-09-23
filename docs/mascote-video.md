# Mascote oficial GRCON — vídeos essenciais + piloto contextual

O GRCON preserva somente os três comportamentos originais aprovados e um piloto novo de microinteração contextual.

## Comportamentos preservados

- `assets/mascot/video/grcon-mascot-wave-alpha.webm`: aceno de boas-vindas, clique, foco e hover.
- `assets/mascot/video/grcon-mascot-processing-alpha.webm`: conferência de documentos, busca de papéis e gesto de coçar o capacete durante operações.
- `assets/mascot/video/grcon-mascot-running-alpha.webm`: corrida horizontal pós-operação bem-sucedida.

Os estados `analyzing`, `searching-files`, `checking-document`, `checking-ld`, `sigem-pw-analysis`, `uploading`, `generating-grdt` e `loading` continuam usando o vídeo de processamento. `welcome` e `hover` usam o aceno uma vez.

## Piloto Higgsfield — sucesso / joinha

O piloto foi gerado no Higgsfield com o mascote oficial do repositório como referência, em 720p, 4 segundos e sem áudio. A cena foi criada para depender da UI real: o mascote entra pela lateral direita, olha para a área vazia onde estará o card real, faz joinha e sai.

Prompt utilizado:

> Use the supplied GRCON mascot image as the exact character reference. Preserve the same robot identity, helmet, dark visor, cyan eyes, white/graphite/blue technical body, green quality-check chest badge, proportions and overall design. Create a 4-second UI microinteraction, not a standalone cinematic scene. Composition: the mascot is small and anchored at the far RIGHT edge, occupying roughly 15-18% of the frame width, with large empty space on the LEFT reserved for a real application card. Start with the mascot mostly hidden just outside the right edge, then it peeks in, turns its eyes/head toward the empty left area as if reacting to a real success card, raises one hand and gives one clear thumbs-up, shows a subtle satisfied reaction, then retreats back toward the right edge. Keep movement compact, professional, calm and readable. No sitting. No chair. No desk. No room. No office. No monitor. No fake dashboard. No fake buttons. No text. No logos other than the existing badge on the mascot. No camera movement. No zoom. Fixed camera. Use a perfectly flat, uniform pure magenta background (#FF00FF) across the entire frame with no gradient, texture, shadows, glow, reflections or color spill on the character; the background is only for chroma-key removal. Keep clear separation between the mascot edges and the magenta background. The animation must feel incomplete without the surrounding software UI, because it is intended to be composited beside a real GRCON card.

O MP4 gerado foi tratado com chroma key e convertido para WebM VP9 com alpha real. O asset final é:

`assets/mascot/video/grcon-mascot-success-pilot-alpha.webm`

Ele é carregado sob demanda por `grcon_mascot_success_pilot.js`, sem frame, sem fundo, sem player aparente e com `pointer-events: none`.

### Integração

O piloto é acionado após `grcon:egrdt-teams-notified`, ancorado ao card real `#egrdt-teams-ready`. A posição é calculada com `getBoundingClientRect()` e recalculada em scroll/resize. Em desktop ocupa no máximo cerca de 14vw (limitado a 210 px); no mobile cai para no máximo 120 px.

Com `prefers-reduced-motion: reduce`, o piloto não é reproduzido. Se a mídia falhar, o PNG oficial HD é usado brevemente como fallback estático.

## Arquitetura

```text
GrconMascot
  ├─ wave
  └─ processing

GrconMascotRunner
  └─ corrida horizontal

GrconMascotSuccessPilot
  └─ microinteração de sucesso ancorada à UI
```

A antiga camada `grcon_mascot_scenarios.js` e seus nove vídeos contextuais foram removidos, junto com MP4s, WebMs, posters, testes e cache dedicados.

## API

```js
window.GrconMascot.play("searching-files");
window.GrconMascot.stop();
window.GrconMascot.reset();

window.GrconMascotRunner.run({ force: true });
window.GrconMascotSuccessPilot.play({ anchor: "#egrdt-teams-ready" });
```
