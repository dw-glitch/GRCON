# Abertura sem reinício e navegação sem barra — 5.44.13

O cliente do Service Worker tratava qualquer `controllerchange` como motivo para `location.reload()`. Como `sw.js` usa `clients.claim()`, isso também acontecia na primeira instalação, após a interface já ter sido carregada. O teste Chromium com o cliente anterior reproduziu duas inicializações e duas navegações em uma única abertura.

O registro e as atualizações do Worker continuam ativos, mas a tomada de controle não força navegação. A interface em execução permanece aberta; uma navegação normal ou atualização solicitada pelo usuário carrega a interface atual. A política de cache, o acesso offline e as reinicializações de isolamento quando o contrato muda permanecem nos seus fluxos.

O carregador de módulos deixa de criar cartões e tarefas “Abrindo módulo”. Continuam presentes deduplicação, timeout, nova tentativa após falha, descarte de contexto antigo e proteção contra ativação de uma tela que o usuário já deixou. O progresso das operações documentais continua disponível.

Validação: `scripts/validar-startup-navigation-browser.cjs` usa o HTML e o Service Worker reais, em origem local isolada, sem documentos ou sessões de produção. Confere instalação inicial sem reinício, atualização do Worker com campo em edição e operação ativa preservados, recarregamento solicitado pelo usuário e abertura offline. Também verifica navegação pelos módulos reais de Consultas, PDFs e Capa, ausência dos cartões de abertura, recuperação de erro e descarte de contexto antigo. A verificação de publicação compara o cliente de registro do Worker e o carregador de módulos com os arquivos validados.
