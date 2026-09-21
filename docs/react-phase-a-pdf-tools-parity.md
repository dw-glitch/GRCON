# FASE A — Combinar PDFs — checklist de paridade

> Inventário criado **antes da remoção de `pdf_merge_app.js`**, a partir da `main` em `ea2d432542f026a0c6833ce68d329c48cf05ab12`.
>
> Objetivo desta etapa: migrar exclusivamente a UI do módulo para React + TypeScript, mantendo Core, Engine, Worker, aparência e regras existentes.

## Fronteira arquitetural atual

```text
index.html (markup estático)
  ↓
pdf_merge_app.js (estado + DOM + Worker + download)
  ↓
window.GrconPdfMergeCore
  ↓
workers/pdf-merge.worker.js
  ↓
pdf_merge_engine.js
  ↓
pdf-lib.min.js
```

Contratos que devem permanecer fonte da verdade:

- `pdf_merge_core.js` / `window.GrconPdfMergeCore`
- `pdf_merge_engine.js`
- `workers/pdf-merge.worker.js`
- `pdf-lib.min.js`, importado somente pelo Worker
- `window.GrconPdfMergeUi.activate()`
- `window.GrconPdfMergeUi.addFiles()`
- `window.GrconPdfMergeUi.clear()`
- `window.GrconPdfMergeUi._debug`

## Cabeçalho e privacidade

- [x] Título “Combinar PDFs”
- [x] Texto “Junte vários PDFs em um único arquivo, na ordem escolhida.”
- [x] Badge “Somente neste navegador”
- [x] Mensagem em repouso: “Processamento 100% local: nenhum arquivo é enviado, armazenado ou registrado no banco.”
- [x] Durante processamento, a mensagem muda para orientar a não fechar a aba
- [x] Nenhum `fetch`, Supabase, upload, API ou persistência dos arquivos no módulo

## Entrada de arquivos

- [x] Dropzone clicável
- [x] Enter abre seletor
- [x] Espaço abre seletor
- [x] `dragenter`
- [x] `dragover`
- [x] `dragleave`
- [x] `drop`
- [x] `input[type=file]` múltiplo
- [x] Botão “Adicionar arquivos”
- [x] Entrada fica bloqueada durante `busy`

## Validação e deduplicação

- [x] `GrconPdfMergeCore.isAcceptedFile()` é a única regra de aceitação da UI
- [x] Arquivo vazio é recusado pelo Core
- [x] PDF é reconhecido pelo contrato atual do Core
- [x] Inválidos são ignorados e geram notificação
- [x] Duplicados são ignorados e geram notificação
- [x] Assinatura exata: `nome normalizado + tamanho + lastModified`
- [x] A assinatura é gerada exclusivamente por `GrconPdfMergeCore.fileSignature()`
- [x] ID usa `crypto.randomUUID()` quando disponível e fallback quando necessário

## Lista e ordem

- [x] Posição
- [x] Nome
- [x] Tamanho formatado pelo Core
- [x] Ícone PDF
- [x] Botão subir
- [x] Botão descer
- [x] Botão remover
- [x] Drag-and-drop HTML5
- [x] Classe visual do item arrastado
- [x] Classe visual do alvo do drop
- [x] A ordem da lista é a ordem enviada ao Worker
- [x] Reordenação usa exclusivamente `GrconPdfMergeCore.reorder()`
- [x] Após mover por botão, o foco volta ao botão correspondente do mesmo item
- [x] Reordenação e remoção são bloqueadas em `busy`

## Métricas

- [x] Quantidade de PDFs
- [x] Tamanho total
- [x] Ambos derivados de `GrconPdfMergeCore.summarize()`
- [x] Formatação de bytes delegada a `GrconPdfMergeCore.formatBytes()`

## Nome de saída

- [x] Fallback visual e funcional: `PDF_Combinado.pdf`
- [x] `maxlength=124`
- [x] Nome final sempre normalizado por `GrconPdfMergeCore.outputFileName()`
- [x] Campo bloqueado em `busy`
- [x] Alterar o nome após gerar um resultado não recombina o PDF; o novo nome é aplicado ao download subsequente

## Regra de mínimo

- [x] Mínimo de 2 PDFs
- [x] Botão “Combinar e baixar” desabilitado com menos de 2
- [x] Fluxo de combinação revalida o mínimo antes de iniciar

## Processamento e progresso

Ao iniciar:

- [x] `busy = true`
- [x] Resultado anterior é invalidado
- [x] Dropzone bloqueada
- [x] Adicionar bloqueado
- [x] Limpar bloqueado
- [x] Reordenação bloqueada
- [x] Remoção bloqueada
- [x] Nome bloqueado
- [x] Combinar é ocultado
- [x] Cancelar é exibido
- [x] Progresso é exibido

Eventos reais do Worker:

- [x] `reading` → “Lendo X (1 de N)…”
- [x] `copied` → “Y página(s) combinada(s)…”
- [x] `saving` → “Finalizando Y página(s)…”
- [x] sucesso → “PDF combinado com sucesso.”
- [x] progresso visual deriva das mensagens do Worker; não existe timer de progresso simulado

## Worker e buffers

- [x] Worker de produção: `workers/pdf-merge.worker.js`
- [x] O Worker importa `pdf-lib.min.js` e `pdf_merge_engine.js`
- [x] React/legado não executa `pdf-lib` na main thread
- [x] Arquivos são enviados ao Worker como `File`, sem base64/data URL/string intermediária
- [x] Buffer final retorna como `ArrayBuffer` transferido pelo Worker
- [x] Engine continua responsável por leitura, cópia de páginas, mensagens de erro e serialização final

## Cancelamento

Comportamento legado inventariado:

- [x] envia `{ type: "cancel" }` quando possível
- [x] termina o Worker
- [x] rejeita o job com `code = "CANCELLED"`
- [x] não exibe erro de merge para cancelamento
- [x] notifica “Combinação cancelada. Nenhum arquivo foi salvo.”
- [x] `finally` libera `busy`
- [x] nova combinação pode ser iniciada depois

Hardening exigido nesta migração:

- [ ] terminar Worker também ao desmontar a ilha
- [ ] terminar Worker ao sair do módulo durante job ativo, sem perder lista/ordem
- [ ] nenhum listener antigo sobreviver à navegação repetida

## Resultado e Object URL

- [x] resultado é um `Blob` `application/pdf`
- [x] `URL.createObjectURL()`
- [x] download automático após sucesso
- [x] botão “Baixar novamente”
- [x] resultado exibe nome
- [x] resultado exibe quantidade de páginas
- [x] resultado exibe tamanho final
- [x] resultado exibe quantidade de PDFs
- [x] alterar arquivos invalida e revoga o resultado
- [x] limpar revoga o resultado
- [x] `beforeunload` revoga o resultado
- [ ] nova ilha deve também revogar em unmount e antes de substituir resultado

## Erros

Mensagens do Engine que devem chegar intactas à UI:

- [x] PDF inválido/danificado — `INVALID_PDF`
- [x] PDF protegido/criptografado — `ENCRYPTED_PDF`
- [x] PDF sem páginas — `EMPTY_PDF`
- [x] falha genérica do Worker
- [x] stack trace não é exibido ao usuário

## Acessibilidade

- [x] Dropzone `role="button"`
- [x] Dropzone focável
- [x] Enter/Espaço
- [x] nomes acessíveis nos botões de subir/descer/remover
- [x] `aria-live` nas métricas, progresso e resultado
- [x] `role="progressbar"`
- [x] `aria-valuemin=0`
- [x] `aria-valuemax=100`
- [x] `aria-valuenow` acompanha progresso

## Aparência a preservar

- [x] `pdf-merge.css` continua sendo a folha do módulo
- [x] layout duas colunas desktop
- [x] uma coluna responsiva
- [x] dropzone
- [x] lista com limite de altura
- [x] painel lateral sticky em desktop
- [x] barra de progresso
- [x] cartão de resultado
- [x] dark mode
- [x] `prefers-reduced-motion`

## Navegação / activate

Comportamento legado observado antes da migração:

- [x] `activate()` não recria estado; apenas renderiza e foca a dropzone
- [x] ao navegar para outro módulo e voltar, a lista e o resultado permanecem enquanto a página não é recarregada
- [x] não há remount explícito
- [x] `beforeunload` termina Worker e revoga Object URL

A migração deve preservar lista/ordem/resultado entre visitas à view, mas deve endurecer o ciclo de vida do Worker para não deixá-lo ativo ao abandonar o módulo.

## Limpar

- [x] bloqueado em `busy`
- [x] sem efeito quando a lista já está vazia
- [x] remove todos os itens
- [x] revoga resultado
- [x] limpa o input
- [x] restaura `PDF_Combinado.pdf`
- [x] botão combinar volta a disabled

## Baseline de performance — legado

A medição obrigatória será executada no Chromium contra a revisão-base acima, antes da exclusão definitiva de `pdf_merge_app.js`.

| Métrica | Legado | React |
|---|---:|---:|
| abrir módulo | NÃO EXECUTADO | NÃO EXECUTADO |
| adicionar 20 PDFs pequenos | NÃO EXECUTADO | NÃO EXECUTADO |
| reordenar lista | NÃO EXECUTADO | NÃO EXECUTADO |
| resposta da UI com 50 itens | NÃO EXECUTADO | NÃO EXECUTADO |

Nenhuma célula será marcada como PASS ou preenchida com número sem execução real.

## Critério de remoção de `pdf_merge_app.js`

Só remover depois de:

- [ ] React + TypeScript implementado
- [ ] adapter/service implementado
- [ ] testes do adapter PASS
- [ ] Chromium com merge real PASS
- [ ] ordem das páginas PASS
- [ ] download automático PASS
- [ ] download novamente PASS
- [ ] cancelamento determinístico PASS
- [ ] erro de Worker PASS
- [ ] navegação repetida PASS
- [ ] PWA/cache frio/quente PASS
- [ ] regressão Consultas PASS
- [ ] regressão Histórico PASS
