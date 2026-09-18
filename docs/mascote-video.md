# Mascote oficial GRCON — vídeo local com fallback PNG

O primeiro frame visual vem sempre de `grcon-mascot-sprite.png`. O controlador só oculta esse PNG depois que o navegador entrega um frame válido do WebM, evitando desaparecimento, cintilação ou dependência de rede externa.

## Comportamentos

- `assets/mascot/video/grcon-mascot-wave-alpha.webm`: aceno natural para saudação, clique, foco e hover.
- `assets/mascot/video/grcon-mascot-processing-alpha.webm`: busca e conferência de papéis, pequena atrapalhação e gesto de coçar o capacete durante operações.

Os estados `analyzing`, `searching-files`, `checking-document`, `checking-ld`, `sigem-pw-analysis`, `uploading`, `generating-grdt` e `loading` usam o vídeo de processamento em loop. `welcome` e `hover` usam o aceno uma vez.

## API

```js
window.GrconMascot.play("searching-files");
window.GrconMascot.play("success");
window.GrconMascot.stop();
window.GrconMascot.reset();
```

Operações assíncronas emitem `grcon:mascot-operation` ou `grcon:processing-state` com `{ active, state, task }`. O controlador pausa fora da aba, encerra reprodução e listeners em `pagehide`, respeita `prefers-reduced-motion` e mantém o PNG oficial se WebM/VP9 estiver indisponível ou falhar.

Não há Rive, WebAssembly, Canvas, GSAP, CDN ou montagem do personagem em partes.

## Cenários contextuais (revisão 20260918.5)

A camada `grcon_mascot_scenarios.js` usa a mesma estratégia de mídia local/versionada do controlador principal, mas mantém âncoras e escalas próprias por operação. Ela não contém regras documentais e apenas reage aos eventos já emitidos pelos módulos.

| Cena | Contexto | Apresentação | Limite desktop |
| --- | --- | --- | ---: |
| `importBases` | importação SIGEM/PW | `wide-stage` | 68% / 880 px |
| `longProcessing` | processamento SIGEM/PW prolongado | `medium-stage` | 38% / 560 px |
| `sleepy` | inatividade | `idle-stage` | 18% / 300 px |
| `curious` | tela aguardando entrada | `idle-stage` | 14% / 240 px |
| `grdtStamp` | `grcon:egrdt-generated` | `event-stage` | 32% / 460 px |
| `teamsSend` | envio efetivo ao Teams | `event-stage` | 34% / 500 px |
| `grdtToTeams` | eGRDT pronta no painel Teams | `event-stage` | 26% / 400 px |
| `paperwork` | Analisar e conferir | `wide-stage` | 78% / 960 px |
| `reviewCoffee` | conferência/revisão prolongada | `medium-stage` | 40% / 560 px |

Os nove cenários usam WebM VP9 same-origin como mídia principal, preservam MP4 H.264 same-origin como fallback de formato e usam poster WebP como fallback estático/reduced-motion. Os clipes 01 e 08 foram recortados verticalmente, preservando mascote e papéis, para aproveitar a composição horizontal sem ocupar altura excessiva. Testes locais de matte com os fundos claros não atingiram qualidade suficiente nos contornos brancos do capacete, braços e papéis; por isso nenhuma versão alpha nova foi publicada. Em vez de chroma key aproximado, as cenas permanecem deliberadamente enquadradas em superfície do GRCON, com borda e sombra discretas.

Os vídeos contextuais não entram no precache inicial. Ao entrar no módulo correspondente, somente metadados dos cenários prováveis são preparados. O Service Worker faz cache runtime após o primeiro uso, inclui suporte a `Range` e usa a revisão no query string para invalidar mídia antiga. `prefers-reduced-motion` mantém apenas o poster. Falhas de `play()`, timeout, `error`, `waiting` ou `stalled` nunca bloqueiam a operação funcional.

Enquanto `wide-stage`, `medium-stage` ou `event-stage` está ativo, o vídeo do cabeçalho e o runner comemorativo ficam suprimidos; o PNG oficial do cabeçalho permanece estático. `window.GrconMascotScenarios.diagnostics()` expõe cenário ativo, assets, estado do player, preload, falhas e eventos recentes.
