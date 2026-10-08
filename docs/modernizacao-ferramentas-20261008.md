# GRCON — revisão visual das ferramentas (08/10/2026)

## Escopo e referência

Este lote continua a modernização publicada na #216. Usa `image-gen-1(1).png` para os acessos a Ferramentas adicionais e `image-gen-3.png` para Adicionar Capa. As 28 imagens foram reinspecionadas em grade e comparadas às capturas anteriores disponíveis. O inventário completo permanece em `modernizacao-28-esbocos-auditoria-20261008.md`.

Não declara paridade integral das 28 referências. As colagens são inspiração para hierarquia e organização; os valores e ações de demonstração não são dados do produto.

## Mudanças

- Ferramentas adicionais: cartões com ícone, descrição e ação em posições separadas. A ação acompanha o tema e mantém a navegação e o foco do botão existente.
- Adicionar Capa: quatro etapas distribuídas uniformemente; estados atual e concluído usam tokens de tema.
- A prévia vazia passa de um quadro com proporção A4 para um espaço compacto. Quando existe um PDF real, a proporção A4 permanece.
- As mensagens de validação e a identificação das alterações manuais acompanham o tema escuro. O seletor de arquivo recebe foco visível por teclado.
- Novo identificador do cache do Service Worker para entregar o CSS atualizado.

Nenhum motor documental, permissão, total de folhas, revisão, título da LD, capa oficial, contracapa ou critério de geração foi alterado.

## Evidências e verificação

- Antes: capturas do pacote `grcon-216-qa-aprovado.zip`, inspecionadas visualmente.
- Depois: a auditoria `QA — UX/UI global` produz capturas nas larguras 1280, 1366, 1440, 1600 e 1920; inclui ferramentas e capa em tema escuro, além de capa com zoom CSS de 125% em 1440.
- A suíte `QA — Adicionar Capa Chromium` verifica seleção pela LD, revisão manual, PDF gerado, preservação da contracapa, Word, ambiguidades e geometria desktop/móvel.
- A suíte global exige ausência de sobreposições, estouro da página e erros de JavaScript. Também exige prévia vazia compacta e fundo correspondente ao tema.
- A aprovação técnica exige CI verde e inspeção das capturas de depois antes da integração. A publicação exige conferência do commit e dos arquivos em produção.

## Continuidade

As prioridades #212–#215 foram incorporadas à #216; #210 e #217 também já foram integradas. A revisão de preparação seletiva por GRDT foi publicada pela #218.

A homologação por um operador autenticado continua sendo uma evidência distinta dos testes de regressão. Monitoramento, configurações restritas e fluxos com bases locais PW/LD devem ser conferidos com a sessão e os arquivos do operador. Esta documentação não presume que essa homologação foi executada.
