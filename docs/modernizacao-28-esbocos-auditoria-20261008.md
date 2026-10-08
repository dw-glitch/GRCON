# GRCON — rastreabilidade das 28 referências visuais

Revisão de 08/10/2026. Este inventário distingue implementação, testes automatizados e homologação pelo operador. Os valores e documentos demonstrativos das imagens não são dados do aplicativo.

## Publicações concluídas antes deste lote

- #216 integrou #212–#215: PDFs, etapas da GRDT, Cofre e Modelos.
- #218 publicou o preparo seletivo de pendências, com invalidação ao trocar base, histórico ou contrato.
- #219 refinou Ferramentas e Capa; a saída A4 oficial permaneceu preservada.
- #220 reconheceu o cabeçalho da Fiscal 01 com nome do responsável. A importação real de 02/10 passou; ela não foi ativada sobre a base mais nova.
- Validação técnica: `npm run verify`, CI e capturas Chromium. Navegação e geometria cobertas em 1280/1366/1440/1600/1920; claro/escuro e zoom CSS de 125%. Isso não substitui uso autenticado no PC corporativo.

## Referências e cobertura

| # | Referência | Módulo / papel | Implementação ou evidência |
|---|---|---|---|
| 1 | Cofre de Documentos GRCON.png | Cofre | Cofre: contraste e upload acessível (#216); densidade da tabela e espaçamento revisados neste lote. |
| 2 | Colagem de telas do sistema GRCON.png | Galeria multitelas | Galeria transversal: módulos correspondentes incluídos no QA de navegação/geometria; não representa uma tela independente nem comprova paridade pixel a pixel. |
| 3 | Controle de GRDT_ Análise e Emissão de Documentos.png | Controle de GRDT | GRDT: trilha Preparar → Analisar → Revisar → Emitir (#216); regras e geração preservadas. |
| 4 | Dashboard GRCON de Controle de GRDT.png | Controle de GRDT | GRDT: trilha das quatro etapas e verificação geométrica. |
| 5 | Dashboard GRCON_ Combinar PDFs.png | Combinar PDFs | PDFs: fluxo local, ordem manual e natural sob comando (#216). |
| 6 | Fluxo GRCON_ Telas 08 a 18.png | Galeria multitelas | Galeria transversal: módulos correspondentes incluídos no QA de navegação/geometria; não representa uma tela independente nem comprova paridade pixel a pixel. |
| 7 | Galeria de Dashboards GRCON em Azul e Branco.png | Galeria SIGEM/PW, histórico e conferência | Galeria transversal: módulos correspondentes incluídos no QA de navegação/geometria; não representa uma tela independente nem comprova paridade pixel a pixel. |
| 8 | Galeria de Interfaces GRCON em Português.png | Galeria SIGEM/PW, histórico e conferência | Galeria transversal: módulos correspondentes incluídos no QA de navegação/geometria; não representa uma tela independente nem comprova paridade pixel a pixel. |
| 9 | image-gen-1(1).png | Ferramentas Adicionais | Ferramentas: cartões e ações alinhados; temas claro/escuro (#219). |
| 10 | image-gen-2.png | Combinar PDFs | PDFs: ordenação natural explícita e inventário visual (#216). |
| 11 | image-gen-3.png | Adicionar Capa | Capa: quatro etapas, prévia vazia compacta e saída oficial A4 (#219). |
| 12 | Painel Corporativo GRCON em Nove Telas.png | Galeria multitelas | Galeria transversal: módulos correspondentes incluídos no QA de navegação/geometria; não representa uma tela independente nem comprova paridade pixel a pixel. |
| 13 | Painel de comparação documental SaaS.png | Consulta Geral × SIGEM | Consulta Geral × SIGEM: pesquisa e histórico paginado; exportações preservadas (#216). |
| 14 | Painel de Consultas Documentais GRCON.png | Consultas | Consultas: React, Controle central e Fiscal 01 (#210/#217/#220); dados Fiscal 01 aguardam planilha atual. |
| 15 | Painel de Consultas Operacionais GRCON.png | Consulta Geral × SIGEM | Consulta Geral × SIGEM: pesquisa e histórico paginado; comparação preservada. |
| 16 | Painel de Controle de GRDT.png | Controle de GRDT | GRDT: quatro etapas e regressões de triagem/revisão/emissão. |
| 17 | Painel de Modelos de Exportação GRCON.png | Modelos de Exportação | Modelos: pesquisa por nome, base e escopo (#216). |
| 18 | Painel de Monitoramento de Documentos.png | Monitoramento | Monitoramento: pesquisa, filtros e histórico; Chromium com backend de teste. |
| 19 | Painel GRCON de Controle de GRDT.png | Controle de GRDT | GRDT: quatro etapas e regressões de triagem/revisão/emissão. |
| 20 | Painel GRCON Flow de Solicitações.png | Atalho externo | Navegação externa para GRCON Flow preservada. |
| 21 | Painel GRCON para Combinar PDFs.png | Combinar PDFs | PDFs: ordem natural/manual e geração local preservadas. |
| 22 | Painel GRCON_ Configurações Gerais.png | Configurações | Configurações: navegação verificada; permissões de proprietário cobertas pelas suítes administrativas. |
| 23 | Painel GRCON_ Ferramentas e Monitoramento.png | Galeria multitelas | Galeria transversal: módulos correspondentes incluídos no QA de navegação/geometria; não representa uma tela independente nem comprova paridade pixel a pixel. |
| 24 | Painel GRCON_ Fluxo Operacional Completo.png | Galeria multitelas | Galeria transversal: módulos correspondentes incluídos no QA de navegação/geometria; não representa uma tela independente nem comprova paridade pixel a pixel. |
| 25 | Painel GRCON_ Histórico de Comparações.png | Histórico de comparações | Histórico: pesquisa/paginação; integridade e exportações cobertas por regressões. |
| 26 | Painel GRCON_ Visão Geral do Sistema.png | Galeria multitelas | Galeria transversal: módulos correspondentes incluídos no QA de navegação/geometria; não representa uma tela independente nem comprova paridade pixel a pixel. |
| 27 | Tela de Controle de GRDT Revisado.png | Controle de GRDT | GRDT: quatro etapas e regressões de triagem/revisão/emissão. |
| 28 | Visão geral do sistema GRCON em 18 telas.png | Galeria multitelas | Galeria transversal: módulos correspondentes incluídos no QA de navegação/geometria; não representa uma tela independente nem comprova paridade pixel a pixel. |

## Lacunas corrigidas nesta continuação

- LD de comissionamento: cabeçalho oficial DOCUMENTO N-1710, inclusive com quebra de linha. Rejeita colunas ambíguas e mantém os critérios documentais.
- Leitura da LD: somente a aba N-1710 e processamento em worker; erros não ativam uma base incompleta.
- Cofre: quatro ações na mesma linha, sem esconder Detalhes/Abrir/Baixar/Excluir; alvo de 32 px e manutenção da rolagem interna. O painel de métricas adicional ocupa espaço apenas quando contém dados.
- QA do Cofre: 1366/1440/1920, claro/escuro e zoom CSS 100/125%; mesmos filtros, exclusão autorizada e exportação integral de todas as páginas.

## Dados reais e limites da validação

- PW disponível: arquivo histórico enviado em setembro, 20.956 registros. LDs da Qualidade disponíveis desde setembro: 3.675 e 56 documentos. São fontes de teste; não foram publicadas como bases atuais.
- SIGEM de 08/10: 23.417 linhas, consultadas em modo somente leitura.
- Seis visões (ET/N-1710/total × revisão 0/todas), identidade por documento+revisão e cinco partições exclusivas verificadas. Análises síncrona/assíncrona produzem resultados iguais.
- Excel filtrado: 2.298 linhas reabertas e comparadas célula a célula.
- Evolução SIGEM: duas fontes reais de setembro/outubro; snapshots e linha do tempo do worker coincidem com o motor principal. Há somente uma base PW real disponível, portanto sua evolução temporal real permanece sem segunda fonte.
- Medições de desempenho feitas no Node local; não representam medição no PC corporativo.

## Pendências que exigem outra fonte ou sessão

1. Reimportar Fiscal 01 com o Controle de Solicitações atual. A base ativa contém 12.696 vínculos; o arquivo disponível de 02/10 contém 12.541. Publicá-lo substituiria dados mais novos.
2. Homologação operacional autenticada pelo operador no PC corporativo, incluindo integrações e referências visuais. As capturas de CI usam backend e usuários de teste e não comprovam uma operação corporativa real.
3. Evolução temporal PW com duas bases reais de datas distintas.

## Publicação por fase

A continuação foi autorizada pelo usuário. Cada PR deve passar por verificações, inspeção das evidências e integração sequencial. O inventário registra cobertura técnica; não declara as 28 referências integralmente homologadas pelo operador.
