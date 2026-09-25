# GRCON Mascot Runtime v5.1

## Arquitetura visual

O mascote oficial continua usando os assets já versionados no GRCON. A correção de setembro de 2026 separa definitivamente a apresentação do mascote da área operacional:

```text
AppShell
├── Header / topbar
│   └── #grcon-mascot-header-slot
│       └── #grcon-context-mascot
├── #grcon-mascot-activity-strip
│   └── vídeo real de corrida
└── .app-shell
    └── .workspace
```

O mascote contextual normal fica no slot da topbar. Ele não usa mais `position: fixed`, não escolhe cantos da viewport e não é reposicionado ao redor de campos dentro do workspace. Mensagens de aviso continuam disponíveis, mas aparecem junto ao mascote no shell.

A corrida é uma apresentação separada. `grcon_mascot_runner.js` controla uma faixa temporária em fluxo normal imediatamente antes do `.app-shell`. A faixa fica `hidden` quando inativa, portanto não deixa espaço permanente na tela.

## Fonte de verdade dos vídeos

Os estados contextuais continuam locais e same-origin:

- `idle` → `assets/mascot/video/grcon-mascot-idle-alpha.webm`
- `hello` → `assets/mascot/video/grcon-mascot-hello-alpha.webm`
- `analyzing` → `assets/mascot/video/grcon-mascot-analyzing-alpha.webm`
- `warning` → `assets/mascot/video/grcon-mascot-warning-alpha.webm`
- `success` → `assets/mascot/video/grcon-mascot-success-alpha.webm`

A corrida horizontal volta a usar o vídeo original que já havia sido aprovado no aplicativo:

- `running` → `assets/mascot/video/grcon-mascot-running-alpha.webm`
- revisão histórica do runner: `20260917.1`
- duração de travessia restaurada como referência: `5040 ms`

O arquivo posterior `grcon-mascot-run-alpha.webm` permanece no repositório por compatibilidade/histórico, mas não é a fonte visual da corrida horizontal restaurada.

## Corrida real, não PNG deslocado

`grcon_mascot_runner.js` cria/reutiliza um único `<video>`, mantém `muted`, `playsInline`, `loop` e desloca somente o contêiner da mídia pela faixa. O movimento das pernas e do corpo vem do WebM real.

O runtime contextual não contém mais `grcon-mascot-runtime-run` nem fallback CSS que simule passos em PNG. Durante `running`, o mascote contextual da topbar fica oculto e a faixa é a única representação visual da corrida.

## Estados e integração

A API pública continua sendo `window.GrconMascot`:

- `show(...)`
- `warning({ target, message })`
- `success(...)`
- `run(...)`
- `idle()`
- `hide()`
- `begin(...)`
- `setEnabled(boolean)`
- `diagnostics()`

React continua usando `src/react/shared/mascot/`. Operações longas podem entrar logicamente em `running`; o controlador delega a apresentação para `window.GrconMascotRunner`. Ao concluir, avisar, cancelar, navegar para outro estado, desativar animações ou sair da página, o runner pausa e reinicia a mídia e oculta a faixa.

## Transparência e fallback

Os vídeos contextuais continuam passando pelo probe de transparência antes de serem revelados. Se um desses WebMs falhar ou tiver fundo visualmente opaco, o sprite PNG HD oficial permanece como fallback.

A corrida não é substituída por PNG animado. Se o vídeo original de corrida não puder ser reproduzido, a faixa é encerrada e o controlador retorna ao estado `analyzing`, preservando a interface funcional sem fingir uma corrida com imagem estática.

## Mobile, acessibilidade e interação

- a faixa usa altura compacta em telas estreitas;
- `pointer-events: none` impede bloqueio de botões, campos e navegação;
- o runner fica antes do workspace e não o sobrepõe;
- `prefers-reduced-motion: reduce` desativa o deslocamento horizontal;
- o PNG oficial pode aparecer como fallback estático/acessível nos estados contextuais;
- nenhuma informação funcional depende somente da animação.

## PWA / Service Worker

O vídeo original de corrida permanece lazy/on-demand e está incluído na estratégia de mídia pesada do Service Worker. WebM continua servido com `video/webm` e cache imutável pelas configurações Vercel/Cloudflare existentes. O cache do Service Worker foi versionado para invalidar a implementação anterior.

## QA obrigatório

A validação Chromium cobre:

- 1920×1080
- 1440×900
- 1366×768
- 1024×768
- 768×1024
- 390×844
- 375×812

Durante o QA de corrida, os testes confirmam o caminho exato `grcon-mascot-running-alpha.webm`, avanço real de `currentTime`, animação horizontal da faixa, ausência de sprite PNG no runner, ausência de sobreposição com o workspace, clique funcional no conteúdo durante a corrida, encerramento da faixa e ausência de overflow horizontal.
