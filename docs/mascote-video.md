# GRCON Mascot Runtime v5.2

## Arquitetura híbrida

O mascote usa uma única arquitetura centralizada:

```text
evento real do GRCON
        ↓
window.GrconMascot
        ↓
resolve estado semântico
        ↓
┌──────────────────────┐
│ ação possui vídeo?   │
└──────────────────────┘
      ↓            ↓
     sim          não
      ↓            ↓
   <video>      sprite PNG
      ↓
    ended
      ↓
  sprite PNG
```

A regra visual é simples:

- sprite/PNG = estado parado;
- WebM = ação real;
- o PNG não recebe keyframes, bounce, rotação, escala, deslocamento de cursor nem pseudoanimação;
- a troca PNG ↔ vídeo usa apenas opacidade curta;
- somente uma camada visual fica aparente por vez.

## Registro central de mídia

`grcon_mascot_controller_v4.js` é a fonte de verdade dos estados contextuais.

| Estado | Mídia |
| --- | --- |
| `idle` | `grcon-mascot-sprite.png` estático |
| `hello` | `assets/mascot/video/grcon-mascot-hello-alpha.webm` |
| `analyzing` | `assets/mascot/video/grcon-mascot-analyzing-alpha.webm` |
| `warning` | `assets/mascot/video/grcon-mascot-warning-alpha.webm` |
| `success` | `assets/mascot/video/grcon-mascot-success-alpha.webm` |
| `running` | `assets/mascot/video/grcon-mascot-running-alpha.webm` pela faixa de corrida |

Os aliases como `searching-files`, `checking-document`, `uploading`, `generating-grdt`, `checking-ld` e `loading` continuam convergindo para a ação de análise quando não há um vídeo dedicado.

Os arquivos `grcon-mascot-idle-alpha.webm`, `grcon-mascot-processing-alpha.webm` e `grcon-mascot-wave-alpha.webm` permanecem versionados para histórico/compatibilidade, mas não são usados para inventar movimento do sprite. O antigo `grcon-mascot-run-alpha.webm`, que duplicava a corrida e ainda carregava rastros do cenário, foi removido; a corrida aprovada usa exclusivamente `grcon-mascot-running-alpha.webm`.

## Idle realmente estático

No estado normal o runtime:

1. pausa qualquer vídeo anterior;
2. remove o `src` do vídeo contextual;
3. exibe o frame do sprite correspondente ao contexto;
4. não mantém mídia escondida reproduzindo;
5. não segue o cursor;
6. não executa keyframes no PNG.

O vídeo de idle também deixou de ser precache obrigatório do Service Worker.

## Ações em vídeo

`hello`, `analyzing`, `warning` e `success` usam os WebMs locais quando as animações estão habilitadas e `prefers-reduced-motion` não está ativo.

- `hello` e `success` retornam ao sprite pelo evento `ended`;
- `warning` executa o vídeo uma vez e, se o aviso continuar ativo, permanece no sprite estático de warning;
- `analyzing` pode ficar em loop enquanto a operação real continuar;
- erro de mídia ou rejeição de autoplay retorna ao sprite estático, nunca a um PNG animado.

## Corrida real fora do workspace

A corrida horizontal permanece em `grcon_mascot_runner.js`.

O runner usa exclusivamente:

`assets/mascot/video/grcon-mascot-running-alpha.webm`

O movimento corporal vem do vídeo real. A transformação horizontal existe somente no contêiner do vídeo para atravessar a faixa estrutural, o que não converte o PNG em uma corrida artificial.

A faixa:

- fica antes do `.app-shell`;
- não cobre tabelas, inputs ou botões;
- usa `pointer-events: none`;
- pausa e volta a `currentTime = 0` quando termina;
- fica oculta quando inativa.

## Transparência e fallback

Os WebMs contextuais passam pelo probe de transparência antes de serem revelados. Se a mídia falhar ou tiver fundo opaco incompatível, o runtime mostra o sprite estático.

Não existe card, quadrado cinza, fundo preto/branco ou moldura criada para mascarar vídeo inadequado.

## Acessibilidade

Com `prefers-reduced-motion: reduce`:

- vídeos não essenciais não são reproduzidos;
- a corrida é desativada;
- o sprite estático continua disponível;
- nenhuma funcionalidade operacional depende da animação.

Os vídeos permanecem `muted` e `playsinline`.

## Carregamento

O runtime prioriza apenas mídia necessária:

- `hello` pode ser preparado antecipadamente;
- `analyzing` é preparado de forma ociosa;
- `warning` e `success` são carregados quando acionados;
- a corrida continua lazy no runner;
- idle não baixa WebM.

## QA

A validação automática exige:

- idle em PNG estático;
- ausência de animação CSS e movimento por cursor no sprite;
- `hello`, `analyzing`, `warning` e `success` reproduzindo seus WebMs;
- corrida usando `grcon-mascot-running-alpha.webm`;
- avanço real de `currentTime`;
- resposta HTTP 200 dos WebMs disparados;
- nenhuma requisição ao vídeo de idle;
- retorno ao sprite após `ended`;
- fallback estático quando mídia falha;
- ausência de sobreposição do workspace;
- ausência de overflow horizontal;
- desktop e mobile;
- console sem erros.
