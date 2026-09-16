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
