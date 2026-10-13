# Auditoria da geração de GRDT e continuidade da Central SIGEM

Data: 13/10/2026. Repositório: `dw-glitch/GRCON`. Continuidade da PR #239, branch `feat/sigem-posting-central-20261013`. Base de produção examinada: `f51018c`; ponta anterior da PR: `fcee7ba`.

## Resultado

A versão inicial não estava inteiramente de acordo. Os defeitos reproduzidos foram corrigidos, e os recursos restantes do pedido foram implementados: evolução integrada, monitoramento exato por revisão e GRDT, exportação histórica e abertura direta pelo alerta. As três migrações foram aplicadas ao GRCON e as APIs passaram na homologação com identidades e papéis reais. A instrução posterior do usuário autoriza executar a integração e publicação.

A validação abrange o código, o banco real e a interface alimentada pelas bases reais. Desempenho no computador corporativo e operação em sua rede dependem do ambiente; as medições abaixo identificam o ambiente efetivamente testado.

## Problemas identificados e corrigidos

| Gravidade | Evidência / reprodução | Correção |
|---|---|---|
| Alta | Lista de códigos na visão GRDT retornava zero linhas: índice e visualização usavam objetos diferentes. | Projeção única das GRDTs, compartilhada com os índices; preservação da ordem de entrada e identificação de ausência mesmo com um único código. |
| Alta | Revisão de um integrante e disciplina/status de outro faziam a mesma GRDT passar em filtros combinados. | Os critérios documentais são aplicados ao mesmo integrante. O detalhe conserva todos os componentes e o escopo total/parcial. |
| Alta | Troca de contrato alterava o estado antes de retirar as linhas antigas do DOM durante a leitura assíncrona. | Limpeza imediata da tabela, pesquisa, seleção, painel e preferências; resultados atrasados são descartados pelo contexto e geração da consulta. |
| Alta | Cópia local do histórico limitada a 1.000 registros era tratada como universo consultável da nova central. | Leitura paginada pelo serviço oficial `loadClassificationHistory`; cache em memória por usuário/contrato. Falha/offline identifica a cópia local como potencialmente incompleta. |
| Média | Janela virtual da Central podia começar além do fim; todas as rolagens recriavam linhas. | Início limitado ao total, janela calculada pelo viewport, atualização agrupada por frame e reaproveitamento da janela quando não muda. |
| Média | Coluna fixa de documento ficava 45,3 px sobreposta: largura real da situação 237,3 px e deslocamento 192 px. | Medição após aplicação das colunas, atualização de posição e observação de cabeçalho atual, inclusive após sua substituição e a reconstrução virtual ao alterar densidade. |
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

Geração de PDFs + eGRDT, loteamento por disciplina/somente limite, numeração, inclusão manual, escolha de revisão, histórico, remoção de arquivo, fontes locais/Cofre, relatórios oficiais dos outros módulos, fiscalização, monitoramento e comparação de snapshots existentes. O monitoramento amplia o mesmo motor e a mesma central de notificações. As novas tabelas privadas têm RLS e acesso direto revogado; wrappers públicos são invoker, com validação de membro e de papel no servidor. Proprietário/administrador gerenciam assinaturas; operador consulta. Nenhuma credencial privilegiada foi adicionada ao frontend.

## Conclusão dos recursos restantes

| Requisito | Entrega e verificação |
|---|---|
| Integração real das bases | 593 GRDTs, 23.574 registros SIGEM, 27.465 documentos previstos, 12.835 vínculos de alocação e 933 solicitações processados pelo aplicativo em Chromium. |
| Paridade da conferência | 4.823 ocorrências do histórico sem divergência de classificação em relação a `GrconPostingConference.reconcile`; 18.419 documentos consolidados, 593 GRDTs. |
| Evolução integrada | Seleção de bases, documento/revisão, status anterior/atual, classificação, datas e filtros. 23.574 pares reais comparados: 23.562 sem alteração, 10 saídas de análise e 2 localizados nesta versão. |
| Pendências resolvidas e divergências | Calculadas por reconciliação oficial das duas bases com o histórico, sem converter todo status presente em confirmação. Filtros de divergências atuais/resolvidas, pendências resolvidas e mudanças de status. |
| Informações modificadas | Projeção identifica alteração de título, disciplina ou redação do status, sem simular aprovação/postagem ou gerar alertas de status. |
| Monitoramento por documento/revisão | Assinatura exata normalizada; outra revisão não dispara; idempotência, desativação e exclusão testadas. Link abre a revisão exata, inclusive histórica. |
| Monitoramento por GRDT | Integrantes derivados no servidor do histórico ativo. Uma notificação agrupada por GRDT/evidência; integrantes removidos não continuam gerando alertas. Link usa a identidade remota correta. |
| Exportação histórica | Visão filtrada e aba `Versões comparadas`, com identificação das bases, datas, contrato e filtros. Textos protegidos contra interpretação como fórmula. |
| Isolamento e papéis reais | Proprietário, administrador e operador existentes exercitados com role `authenticated` e claims no PostgreSQL. UHDT-D, UGH e Pátio do Coque verificados; operador impedido de gravar e de consultar contrato sem associação. |
| Ausência de efeitos da homologação | Gravações de teste em transações revertidas; zero assinaturas artificiais remanescentes e zero notificações emitidas pela comparação manual. |
| Liberação | Usuário autorizou executar tudo o que estava em aberto. PR #239 integra o código; workflow da `main` valida, publica Cloudflare e confere `deployment-meta.json`. |

### Homologação complementar

- `tests/sigem_monitor_targets.cjs`: PostgreSQL/PGlite, assinatura exata, GRDT agrupada, integrantes removidos, idempotência, inatividade, metadados, links, papéis e isolamento.
- `scripts/sigem-central-tracking-qa.cjs`: Chromium, gerenciamento de assinatura, evolução incluindo itens sem alteração, filtros de pendências/divergências, visualização salva, restauração de colunas, link remoto e interface de operador.
- `scripts/sigem-central-real-data-qa.cjs`: recebe exportação de leitura autorizada, sem incluir dados operacionais no git/CI. Usa os motores oficiais, Worker real e serviços adaptados à fotografia do banco. Backend e papéis são validados separadamente no próprio PostgreSQL de produção; não simula login com credenciais no navegador de produção.
- Base real: carga inicial 1.978 ms em Chromium 1366×768; janela virtual limitada; exportação filtrada; página sem transbordamento horizontal em 1024×768; troca de contrato limpa tabela e comparação.
- Regressão completa `npm run verify` e pacote Cloudflare aprovados localmente. O CI registra o resultado do SHA final e o workflow de produção confirma a versão efetivamente publicada.
- As três migrações versionadas correspondem às versões registradas no banco: `20261013202339`, `20261013203427`, `20261013203620`.

### Segurança das novas APIs

Acesso direto de `authenticated` às tabelas privadas: negado. Execução anônima do novo monitoramento: negada. APIs existentes, notificações e permissões por contrato foram preservadas. O aviso informativo de RLS sem políticas nas tabelas privadas é compatível com a estratégia de acesso exclusivo pelas funções guardadas; não foram criadas políticas permissivas para eliminar esse aviso. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

O benchmark sintético anterior continua válido como referência, e não como medida do computador corporativo. As medições reais acima substituem a ausência de homologação funcional das bases disponíveis. UGH e Pátio do Coque estavam sem histórico/Consulta Geral no momento da leitura; o estado vazio e as permissões foram verificados sem inventar dados.

## Arquivos desta auditoria

- `app.js`, `app-ui.js`, `macro5_flow_app.js`, `grdt-central-ux.css`: triagem, filtros, geometria e rascunho de pendências.
- `sigem_posting_central_app.js`, `sigem_posting_central_query.js`, `sigem_posting_central_core.js`, `sigem_posting_central_render.js`, `sigem-posting-central.css`: consulta, atualização, fontes, personalização, detalhe e relatórios.
- `workers/sigem_central.worker.js`: consolidação fora da interface.
- `tests/sigem_posting_central.cjs`, scripts Chromium operacionais, de assinatura e de dados reais, e `scripts/benchmark-sigem-central.cjs`: regressões e medições reproduzíveis.
- `package.json`, `sw.js`, workflow e documentação: execução obrigatória, cache/artefatos e auditoria.

## Rollback

Se houver regressão de implantação, restaurar o artefato Cloudflare anterior aprovado (`f51018c`) e o cache compatível do Service Worker. Conservar as três migrações e os dados: a ampliação do banco é compatível com o frontend anterior. A autorização posterior do usuário liberou a integração e a publicação.
