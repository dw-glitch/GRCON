# Auditoria da geração de GRDT e continuidade da Central SIGEM

Data: 13/10/2026. Repositório: `dw-glitch/GRCON`. Continuidade da PR #239, branch `feat/sigem-posting-central-20261013`. Base de produção examinada: `f51018c`; ponta anterior da PR: `fcee7ba`.

## Resultado

A versão examinada **não estava inteiramente de acordo**. Um teste já existente da busca em lote por integrantes de GRDT falhava. Também foram reproduzidos defeitos de geometria, filtros e isolamento durante atualização. As correções abaixo estão implementadas e os testes específicos passaram. A entrega continua em homologação: não implica publicação nem comprovação de operação autenticada com bases reais.

## Problemas identificados e corrigidos

| Gravidade | Evidência / reprodução | Correção |
|---|---|---|
| Alta | Lista de códigos na visão GRDT retornava zero linhas: índice e visualização usavam objetos diferentes. | Projeção única das GRDTs, compartilhada com os índices; preservação da ordem de entrada e identificação de ausência mesmo com um único código. |
| Alta | Revisão de um integrante e disciplina/status de outro faziam a mesma GRDT passar em filtros combinados. | Os critérios documentais são aplicados ao mesmo integrante. O detalhe conserva todos os componentes e o escopo total/parcial. |
| Alta | Troca de contrato alterava o estado antes de retirar as linhas antigas do DOM durante a leitura assíncrona. | Limpeza imediata da tabela, pesquisa, seleção, painel e preferências; resultados atrasados são descartados pelo contexto e geração da consulta. |
| Alta | Cópia local do histórico limitada a 1.000 registros era tratada como universo consultável da nova central. | Leitura paginada pelo serviço oficial `loadClassificationHistory`; cache em memória por usuário/contrato. Falha/offline identifica a cópia local como potencialmente incompleta. |
| Média | Janela virtual da Central podia começar além do fim; todas as rolagens recriavam linhas. | Início limitado ao total, janela calculada pelo viewport, atualização agrupada por frame e reaproveitamento da janela quando não muda. |
| Média | Coluna fixa de documento ficava 45,3 px sobreposta: largura real da situação 237,3 px e deslocamento 192 px. | Medição após aplicação das colunas, atualização de posição e observação de cabeçalho atual, inclusive após sua substituição. |
| Média | `display:flex` no próprio `td.revision-grdt-cell` prejudicava a geometria e o alinhamento. | Restauração de `table-cell`, campo de revisão compacto e margens internas delimitadas. |
| Média | Medição antes de ocultar colunas fazia a altura virtual oscilar; evidências abertas não participavam dos espaçadores. | Medição após evento de apresentação, alturas em coordenadas de layout e offsets incluindo detalhes expandidos. |
| Média | Pesquisa não considerava o título da LD; filtro do arquivo final ignorava arquivos complementares. | Inclusão de título/alocação na pesquisa, nomes finais por entrada e identificação da última GRDT no filtro correspondente. |
| Média | “Nenhum valor selecionado” não podia ser aplicado e filtros vazios eram ignorados. | Conjunto vazio válido com zero resultados, indicação de filtro ativo e chip “Nenhum valor”. |
| Média | Faixa legada de filtros mantinha a pesquisa antiga após limpar, apesar de 500 resultados na tabela. | Uso da barra oficial sincronizada com a triagem, eliminando o resumo paralelo do GRCON. |
| Média | Lista de ausências exibia somente 15 códigos; exportação registrava a busca universal mesmo quando a lista era usada. | Lista integral em área rolável e exportação da pesquisa efetivamente aplicada. |
| Média | Datas sem valor passavam no filtro “Até”; datas brasileiras ordenavam incorretamente. | Normalização de datas, exclusão de registros sem data nos filtros temporais e ordenação cronológica. |
| Média | Documento presente apenas no SIGEM podia escolher revisão 0 em vez de B quando datas não existiam. | Desempate pela hierarquia oficial de revisões. |
| Média | Metadados do Excel não recebiam a mesma proteção contra fórmulas dos registros. | Sanitização de todas as abas, inclusive proveniência, lista e detalhe da GRDT. |

## Continuidade implementada

- Personalização de colunas: mostrar/ocultar, arrastar, mover por controles, redimensionar por arraste ou largura numérica, fixar e restaurar padrão.
- Visualizações pessoais salvas com colunas, larguras, fixação, ordenação, filtros e visão; limite de 20, isoladas por usuário e contrato.
- Filtro por coluna, status SIGEM, múltiplas revisões e acompanhamento a partir de uma quantidade de horas desde a geração. Esse tempo é operacional, sem equivaler a SLA ou envio comprovado.
- Histórico de GRDTs, quantidade de repostagens, workflow/status da alocação, fontes e revisão à qual o status SIGEM corresponde.
- Entrega e declaração Teams são apresentadas separadamente da confirmação na Consulta Geral; não promovem o documento para confirmado.
- Confirmação histórica reutiliza o estado oficial quando o marcador do contrato coincide, ou a evidência da consulta atual da sessão. Revisão anterior nunca confirma posterior.
- Preparação manual de pendências: o usuário seleciona os itens elegíveis no detalhe; a relação da Central de GRDT recebe somente um rascunho. Não aplica, analisa, gera ou posta automaticamente.
- Retorno da conferência técnica conserva a pesquisa, filtros e rolagem.
- Exportação por visualização e aba de integrantes das GRDTs; códigos/revisões permanecem texto, inclusive zeros à esquerda.
- Processamento de bases grandes em Worker externo, reutilizando os mesmos motores. Não há cópias paralelas das regras de conferência.
- Foco restaurado ao fechar detalhes, navegação por teclado e gerenciamento de Tab no painel.

## Validação e evidências

| Verificação | Resultado |
|---|---|
| Testes específicos do domínio | 17 casos aprovados: revisões, repostagens, GRDT parcial, lista, filtros, datas, histórico e confirmação histórica. |
| Chromium — Central SIGEM | Pesquisa, detalhe, preparação apenas dos selecionados, filtros combinados, colunas, arraste, largura, fixação, visualização salva, teclado, troca de conta/contrato e saída aprovados com dados sintéticos. |
| Chromium — Worker real | 2.500 registros, índices após clonagem, janela limitada, linha 2.499, estabilidade do fim, retorno técnico, Excel filtrado e resposta atrasada após troca de contrato aprovados. |
| Chromium — geração GRDT | 500 documentos processados pelo aplicativo real com LD e PDFs sintéticos; densidades, filtro vazio, pesquisa por título, evidências, fim da lista e zoom 125% aprovados. |
| Geometria final | Deslocamento do documento 237,328 px para situação de 237,328 px; overflow horizontal da página zero em 1366×768. |
| Regressão global e pacote | `npm run verify`, `npm run build:cloudflare` e `npm run verify:cloudflare`; resultado final registrado na descrição da PR/CI. |

As capturas e métricas do navegador são geradas em `artifacts/grdt-table-audit/`; o workflow preserva essas evidências. Os arquivos de teste não alteram dados reais nem enviam avisos ao Teams.

### Desempenho medido

Ambiente de referência: Linux, Node 24.19.0, AMD EPYC 9V74. Base sintética com 25.000 documentos e 25.000 ocorrências de geração.

| Operação | Medição |
|---|---:|
| Consolidação e índices | 2.119,17 ms |
| Pesquisa simples | 165,69 ms |
| Lista de 500 códigos | 5,39 ms |
| Heap ao término | 234,1 MB |

A consolidação acima é medição do núcleo em Node. O navegador passa a executá-la em Worker para manter a interface disponível; a transferência de dados tem custo próprio. Esses números **não comprovam desempenho no computador corporativo nem no Supabase de produção**.

## Recursos preservados

Geração de PDFs + eGRDT, loteamento por disciplina/somente limite, numeração, inclusão manual, escolha de revisão, histórico, remoção de arquivo, fontes locais/Cofre, relatórios oficiais dos outros módulos, fiscalização, monitoramento e comparação de snapshots existentes. Não há migrações, alterações de RLS, permissões ou credenciais.

## Matriz do prompt anterior

| Requisito | Situação |
|---|---|
| Motor oficial, agrupamento, revisão mais recente, GRDT parcial | Implementado e testado sinteticamente. |
| Integração Consulta Geral / histórico completo / alocação / solicitações | Implementada usando serviços atuais; falta homologação com snapshots reais. |
| Tabela profissional, visualizações, filtros e teclado | Implementados e testados. |
| Comparação histórica e exportação de evolução | Reutiliza o módulo existente por navegação; não existe uma segunda tabela de comparação embutida na Central. |
| Rastreabilidade e tempo desde geração | Implementados; envio real depende das evidências disponíveis. |
| Monitoramento por código | Integrado ao mecanismo existente; respeita permissões atuais. |
| Assinatura específica por revisão ou GRDT como entidade de alerta | **Ainda não implementada** no serviço atual, que cadastra códigos. Exigiria ampliação do modelo de monitoramento e testes backend específicos. Não foi simulada com uma anotação. |
| Preparação de pendências | Implementada por seleção explícita e rascunho, sem envio automático. |
| Exportações | Consulta, revisões, pendências consolidadas e detalhe de GRDT implementados; evolução continua no módulo existente. |
| Desempenho | Medido em referência sintética; Worker testado. Homologação corporativa pendente. |
| Segurança multi-contrato | Testes de troca, concorrência, preferências e saída aprovados. Backend existente preservado; falta homologação autenticada com papéis e contratos reais. |
| Publicação | Não realizada. O prompt original exige aprovação para integração/publicação e impede publicação automática. |

## Próximos critérios de liberação

1. CI do SHA final aprovado, incluindo os testes Chromium ampliados e pacote Cloudflare.
2. Homologação autenticada com owner/admin/operator e UHDT-D, UGH e Pátio do Coque; arquivos reais e verificações de campos/contagens.
3. Definir se a assinatura por revisão/GRDT e a comparação embutida precisam integrar esta entrega; são diferenças remanescentes em relação ao prompt completo.
4. Aprovação explícita antes de merge/publicação, conforme seção 18 do prompt recuperado.

Não classificar o prompt inteiro como integralmente concluído enquanto esses critérios estiverem pendentes.

## Arquivos desta auditoria

- `app.js`, `app-ui.js`, `macro5_flow_app.js`, `grdt-central-ux.css`: triagem, filtros, geometria e rascunho de pendências.
- `sigem_posting_central_app.js`, `sigem_posting_central_query.js`, `sigem_posting_central_core.js`, `sigem_posting_central_render.js`, `sigem-posting-central.css`: consulta, atualização, fontes, personalização, detalhe e relatórios.
- `workers/sigem_central.worker.js`: consolidação fora da interface.
- `tests/sigem_posting_central.cjs`, três scripts Chromium e `scripts/benchmark-sigem-central.cjs`: regressões e medições reproduzíveis.
- `package.json`, `sw.js`, workflow e documentação: execução obrigatória, cache/artefatos e auditoria.

## Rollback

Antes de publicação, manter a PR em rascunho e a produção em `f51018c`. Se houver implantação posterior e regressão, reverter o commit de integração/Worker para a versão anterior aprovada e restaurar a versão compatível do Service Worker. Nenhuma alteração de banco exige reversão.
