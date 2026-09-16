# Mascote oficial GRCON — PNG + GSAP

O primeiro frame vem sempre de `grcon-mascot-sprite.png`. A animação usa somente os recortes oficiais em `assets/mascot/layers/` e o GSAP local em `vendor/gsap/`; não há CDN, Canvas, WebAssembly ou Rive.

O controlador central é `grcon_mascot_controller.js`. Para acionar um estado sem conhecer a timeline interna:

```js
window.GrconMascot.play("searching-files");
window.GrconMascot.play("success");
window.GrconMascot.play("error");
window.GrconMascot.stop();
window.GrconMascot.reset();
```

Operações assíncronas devem emitir `grcon:mascot-operation` com `{ active, state, task }`. O controlador encerra a timeline anterior antes de criar a próxima, pausa quando a aba fica oculta e elimina timelines/listeners em `pagehide`.

Para criar uma animação, adicione o estado à lista `STATES`, implemente uma função de timeline no controlador e faça o roteamento em `workingTimeline`. Novas partes raster só devem ser adicionadas após validar que recompõem o PNG oficial parado sem diferença visual. Em qualquer falha do GSAP ou das camadas, o sprite HD original permanece visível.
