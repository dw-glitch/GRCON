# GRCON — recuperação das 28 referências visuais (08/10/2026)

> Documento de rastreabilidade da modernização. A existência de um módulo ou PR anterior **não** prova paridade visual com o esboço. Não usar valores ou documentos fictícios das imagens.

## Fontes e linha de base

- Especificação: `Texto colado(20261008-151124).txt` (779 linhas).
- Referências: arquivo `Nova pasta(2).zip`, 28 imagens PNG verificadas individualmente em grade de inspeção.
- Código: `dw-glitch/GRCON`, branch `main`. Um ZIP anterior (v5.44.9) serviu apenas para inspeção local; antes de publicar alterações, todos os arquivos tocados foram conferidos com o GitHub atual.
- PRs anteriores preservadas: #204 (UX/Higgsfield), #208 (Cofre/Registro Mestre), #211 (desempenho).
- Estado deste lote: **intervenção específica na ordenação de PDFs**; os demais esboços ainda não estão homologados. Não interpretar a revisão de material como implementação das 28 telas.

## Inventário das 28 imagens

| # | Arquivo de referência | Módulo / papel | Estado da implementação neste lote |
|---|---|---|---|
| 1 | Cofre de Documentos GRCON.png | Cofre | Métricas/versionamento existentes; adequação visual ainda não validada |
| 2 | Colagem de telas do sistema GRCON.png | Galeria multitelas | Avaliação transversal pendente |
| 3 | Controle de GRDT_ Análise e Emissão de Documentos.png | Controle de GRDT | Consolidação visual pendente |
| 4 | Dashboard GRCON de Controle de GRDT.png | Controle de GRDT | Consolidação visual pendente |
| 5 | Dashboard GRCON_ Combinar PDFs.png | Combinar PDFs | Fluxo local existente; ver #10 |
| 6 | Fluxo GRCON_ Telas 08 a 18.png | Galeria multitelas | Avaliação transversal pendente |
| 7 | Galeria de Dashboards GRCON em Azul e Branco.png | Galeria SIGEM/PW, histórico e conferência | Avaliação transversal pendente |
| 8 | Galeria de Interfaces GRCON em Português.png | Galeria SIGEM/PW, histórico e conferência | Avaliação transversal pendente |
| 9 | image-gen-1(1).png | Ferramentas Adicionais | Dois acessos já existentes; paridade visual pendente |
| 10 | image-gen-2.png | Combinar PDFs | **Ordenação natural explícita implementada neste lote**; validação visual pendente |
| 11 | image-gen-3.png | Adicionar Capa | Motor oficial existente; paridade visual pendente |
| 12 | Painel Corporativo GRCON em Nove Telas.png | Galeria multitelas | Avaliação transversal pendente |
| 13 | Painel de comparação documental SaaS.png | Consulta Geral × SIGEM | Comparação existente; paridade visual pendente |
| 14 | Painel de Consultas Documentais GRCON.png | Consultas | Módulo React existente; paridade visual pendente |
| 15 | Painel de Consultas Operacionais GRCON.png | Consulta Geral × SIGEM | Comparação existente; paridade visual pendente |
| 16 | Painel de Controle de GRDT.png | Controle de GRDT | Consolidação visual pendente |
| 17 | Painel de Modelos de Exportação GRCON.png | Modelos de Exportação | Ferramentas de modelos existentes; paridade visual pendente |
| 18 | Painel de Monitoramento de Documentos.png | Monitoramento | Monitoramento existente; paridade visual pendente |
| 19 | Painel GRCON de Controle de GRDT.png | Controle de GRDT | Consolidação visual pendente |
| 20 | Painel GRCON Flow de Solicitações.png | Atalho externo | Preservar navegação externa, sem duplicar GRCON Flow |
| 21 | Painel GRCON para Combinar PDFs.png | Combinar PDFs | Referência complementar; fluxo independente preservado |
| 22 | Painel GRCON_ Configurações Gerais.png | Configurações | Paridade visual pendente; manter controles restritos ao proprietário |
| 23 | Painel GRCON_ Ferramentas e Monitoramento.png | Galeria multitelas | Avaliação transversal pendente |
| 24 | Painel GRCON_ Fluxo Operacional Completo.png | Galeria multitelas | Avaliação transversal pendente |
| 25 | Painel GRCON_ Histórico de Comparações.png | Histórico de comparações | Histórico existente; paridade visual pendente |
| 26 | Painel GRCON_ Visão Geral do Sistema.png | Galeria multitelas | Avaliação transversal pendente |
| 27 | Tela de Controle de GRDT Revisado.png | Controle de GRDT | Consolidação visual pendente |
| 28 | Visão geral do sistema GRCON em 18 telas.png | Galeria multitelas | Avaliação transversal pendente |

**Observação:** títulos e valores das referências são demonstrativos. Não devem substituir nomenclaturas, dados, regras ou permissões do produto.

## Primeiro ajuste implementado — Combinar PDFs

- Constatado na implementação React: drag-and-drop, reordenação manual, processamento em Web Worker e geração local já existentes.
- Lacuna: ordenação natural automática **sob comando** (ex.: prancha1, prancha2, prancha10) ausente na interface atual.
- Solução: botão "Ordenar automaticamente" na barra da lista; ordenação `Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" })` estável e sem mutar a origem.
- Não ordena a lista quando arquivos são adicionados; não muda o critério de geração; não modifica Core, Engine nem Worker; bloqueia mudança durante processamento; resultado anterior é invalidado somente quando a ordem efetivamente mudar.
- Testes locais executados: `tests/pdf_tools_react.cjs`, `tests/additional_tools_navigation.cjs`, `tests/cover_document_react.cjs` e compilação TypeScript isolada do novo utilitário.
- **Não** foi possível executar `npm run verify` completo sobre o snapshot local, pois ele não contém `node_modules`/dependências React e Vite. A PR deve passar por CI no GitHub e homologação visual antes de merge.
- Nenhuma alteração de banco, worker de borda, Supabase, R2 ou Cloudflare é necessária.

## Próximas frentes não concluídas

1. Controle de GRDT (cinco esboços): confrontar telas reais de preparação, triagem, revisão e geração sem alterar loteamento ou repostagem.
2. Cofre, Consultas e Conferência: comparar tabelas e filtros às referências, preservando fonte de alocação, exportação e desempenho de grandes bases. Considerar #210 (Consultas) ainda aberta para não sobrescrever alterações.
3. Ferramentas: página de acesso e Adicionar Capa, preservando motores locais, modelo oficial e nomenclatura real.
4. SIGEM × PW/Evolução, Consulta Geral, monitoramento e histórico: harmonizar hierarquias sem modificar contagens de revisão ou status.
5. Modelos, dashboard e configurações: apenas indicadores calculáveis e ações realmente autorizadas.
6. Comparação visual/funcional nas larguras 1366/1440/1920, zoom e modo escuro, com capturas antes/depois e validação operacional.

**Status:** modernização geral **em andamento**. Nenhum dos 28 esboços foi declarado integralmente homologado apenas por estar presente neste inventário.
