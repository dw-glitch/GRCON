# GRCON — Cofre, Consultas e Conferência

Entrega de 07/10/2026, baseada no commit `11632c358a01de3f1ec73fbdbe6459f291c59a3b` de `dw-glitch/GRCON`.

## Estado da entrega

Código implementado e validado. As quatro migrations abaixo já foram aplicadas ao projeto Supabase GRCON (`kvyrttccwzdhasplfxnr`). Os nomes dos arquivos correspondem às versões efetivamente registradas no banco. O frontend e o Worker estão preparados em uma branch de revisão; esta entrega não publicou o aplicativo Cloudflare nem modificou a branch principal.

Não foram excluídos documentos reais do usuário para testar. O teste executa o Worker real com Postgres local e um binding R2 em memória, verifica as chamadas `get`, `put`, `delete` e `head`, e simula falhas de armazenamento e banco. A exclusão física em um bucket de produção ainda precisa de uma prova após o deploy, com um documento de teste autorizado.

## Cofre: exclusão e consistência

A ação Excluir aparece para owner/admin e pede confirmação com código e revisão. O navegador envia somente documento e workspace; não fornece bucket ou chave do objeto. O Worker reutiliza a autenticação e o binding R2 existentes. A RPC de exclusão aceita apenas service_role e valida associação ativa, papel, contrato, documento e prefixo da chave, incluindo referências de outro contrato.

A operação começa com um registro durável e o estado `deleting`. O objeto é removido com `bucket.delete` e sua ausência é verificada com `bucket.head`. Somente depois a transação final remove a linha de `grcon_document_files` e registra sucesso na auditoria. Lookup, download e novo envio não tratam arquivos em exclusão como disponíveis. Cache de lookup, fontes e preparação da GRDT são invalidados; a listagem é atualizada.

Se R2 ou finalização do banco falhar, o documento fica indisponível para GRDT, a falha é registrada e a interface oferece nova tentativa. O registro durável permite retomar inclusive quando o objeto já foi removido. A repetição de uma exclusão concluída é idempotente. Se outras entradas usam o mesmo binário, o Worker preserva uma cópia, muda as referências restantes e remove a chave original; nenhuma outra entrada perde seu arquivo.

A auditoria mantém document_id, código, revisão, contrato, autor, data, chave R2 e resultado/erro. Ela não depende de FK para o documento removido. Nenhuma operação altera GRDT/eGRDT, histórico ou auditoria de emissão.

## Excel do Cofre

Exportar Excel reutiliza o ExcelJS e carrega apenas metadados da API de listagem existente. Percorre todas as páginas do resultado filtrado (200 registros por chamada), independentemente dos 50 registros visíveis. O contexto de contrato e os filtros são capturados para impedir mistura durante uma exportação.

Colunas: Contrato, Código do documento, Revisão, Nome do arquivo, Extensão, Tipo quando disponível, Tamanho em bytes, Data de inclusão, Incluído por e Situação. A data é tipada e o tamanho é numérico. Incluído por usa nome/e-mail do perfil; não apresenta UUID como substituto. Não exporta tokens, credenciais, URLs assinadas, object_key ou identificadores técnicos. Não baixa arquivos do R2.

## Controle de Solicitações em Consultas

O carregamento e a atualização ficam dentro de Consultas. Owner/admin publicam uma planilha Excel; membros consultam e sincronizam a base do contrato. O parser identifica a aba Solicitações e a coluna documental, preservando todas as colunas rotuladas, nome da aba e número da linha. Cabeçalhos ambíguos ou arquivos sem códigos são recusados com mensagem.

A base é enviada em blocos de 500 e ativada atomicamente somente quando a contagem estiver completa. Uma verificação da versão ativa impede sobrescrever uma publicação concorrente. Há uma única versão ativa por contrato; versões anteriores são temporárias para limpeza. A consulta reutiliza a normalização e as variantes documentais de TriagemCore, inclusive NT e identidade EAP.

Os resultados mostram Fonte: Controle de Solicitações, e o painel de detalhe mostra todos os campos originais. Quando o documento já está na LD, a LD mantém prioridade e os dados de solicitações aparecem como informação complementar, sem criar conflito artificial. A fonte funciona também sem LD local. Documentos Previstos continua sendo a fonte oficial da classificação de alocação.

Foram auditadas as tabelas existentes `grcon_requests`/`grcon_request_items`: são solicitações operacionais individuais, não a base documental da planilha. Por isso o fluxo não as duplica nem as substitui. A mudança de contrato limpa o estado e invalida requisições em andamento.

## Data da Consulta Geral

A Conferência distingue Data da Consulta Geral de data/hora do upload. A data de referência é registrada na importação e pode ser editada depois da publicação por owner/admin autorizado. A RPC verifica snapshot ativo do contrato e a data anterior esperada; grava apenas metadata e auditoria com data anterior/nova, autor e instante.

A sincronização do mesmo snapshot detecta a mudança de data e atualiza metadados, sem disparar o evento de troca de base. Não reimporta linhas, cria snapshot, comparação ou notificações. O instante original do upload permanece separado do instante de publicação.

## Pendências de postagem

O detalhamento documental foi preservado. Acima da tabela há um resumo com documentos pendentes, GRDTs distintas, casos sem GRDT identificada, lista em ordem natural e Copiar GRDTs (uma por linha).

Detalhamento, resumo e Excel usam o mesmo resultado filtrado. Um Map agrega os identificadores pertinentes do último envio em O(n), normalizando caixa e espaços. A contagem documental é independente da contagem de GRDTs. A agregação é memorizada por resultado e filtros para não reprocessar toda a base ao paginar. Identificadores ausentes, rótulos e placeholders sem parte numérica não entram no consolidado; o documento permanece no detalhe como GRDT não identificada. Os formatos históricos numéricos ou com prefixo de contrato são aceitos.

No filtro Pendências de postagem, o Excel mantém a aba Detalhamento com todos os campos documentais existentes e acrescenta GRDTs Pendentes, com uma linha por GRDT e quantidade de documentos no resultado filtrado. Nenhum dado adicional é inventado.

## Remoção de Análises

Menu, painel, rota ativa, mapeamento do loader, build React, assets de precache e implementação React exclusiva, CSS sem referências e callbacks exclusivos da tela antiga foram removidos. A rota antiga abre a Central de Controle de GRDT. Os utilitários de histórico de análise usados por backup e GRDT foram preservados. As declarações globais necessárias ao Histórico eGRDT foram movidas para o próprio módulo. Workflows e testes exclusivos obsoletos foram removidos; verificações úteis foram mantidas.

## Cofre → GRDT: gargalos e otimizações

A busca anterior já oferecia uma API em lote, mas a função do banco executava consultas em um loop por item. Ela foi substituída por uma consulta de conjunto com entrada normalizada, agregação ordenada e acesso pelo índice composto existente de contrato/identidade/revisão/sequence para status ready. Não há leitura integral do Cofre para procurar códigos no navegador.

O cliente divide lotes maiores em até 500 códigos, com até três consultas concorrentes, preservando a ordem solicitada. A prévia usa somente metadados. Os arquivos são recuperados apenas na preparação, com até quatro downloads concorrentes e deduplicação por hash/tamanho na mesma preparação. O progresso informa quantos documentos foram preparados; uma falha impede declarar o lote completo. O motor de revisão, repostagem, alocação, disciplina, propósito, limites e emissão da GRDT permanece o existente. A geração atual acontece no navegador, portanto não foi introduzido um segundo motor no backend.

### Medições

| Documentos | Localizar e montar prévia | Preparar arquivos |
|---:|---:|---:|
| 10 | 76 ms | 69 ms |
| 50 | 54 ms | 127 ms |
| 100 | 65 ms | 260 ms |

Esses números são da última execução Chromium com APIs simuladas e arquivos de 3 bytes. A localização/prévia não faz downloads; a preparação respeita concorrência máxima de quatro. A consulta SQL no Postgres local levou 1,8 / 3,9 / 6,5 ms para 10 / 50 / 100 códigos, em um catálogo pequeno de teste. São provas funcionais e medições reproduzíveis, não um benchmark de produção ou prova de ganho de latência real do R2. Não foi medida uma comparação antes/depois com documentos reais.

## Banco, migrations e RLS

| Migration aplicada | Alteração |
|---|---|
| `20261007122636_document_vault_deletion.sql` | Estados deleting/delete_failed, job/auditoria durável, RPC service-only, listagem com falhas visíveis, contrato explícito e nome do autor |
| `20261007122911_shared_sigem_reference_date.sql` | RPC de alteração exclusiva de metadado temporal com owner/admin, contrato e controle de concorrência |
| `20261007122913_requests_control_base.sql` | Bases/linhas privadas, uma base ativa por contrato, publicação atômica, paginação e autorização |
| `20261007122915_document_vault_set_lookup.sql` | Consulta documental por conjunto, índice existente e somente arquivos ready |

As três tabelas novas têm RLS habilitada e nenhum SELECT direto concedido a anon/authenticated. O acesso ocorre por funções com search_path vazio e validação interna de contrato/papel; wrappers públicos usam security invoker. Exclusão e lookup são exclusivos do serviço. Edição de data e base de solicitações exigem usuário autenticado, com papel validado para escrita. As permissões efetivamente instaladas foram consultadas após as migrations.

O advisor não apontou novo ERROR/WARN de segurança. As três tabelas privadas seguem o padrão existente de RLS sem política permissiva de acesso direto; o advisor mostra INFO para esse padrão ([documentação](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). O WARN de proteção contra senhas vazadas já existia e não foi alterado nesta entrega ([configuração](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

## Validação executada

- `npm run verify`: typecheck, builds, sintaxe, workers, referências, versões, dependências, Supabase e suíte completa passaram.
- `npm run build:cloudflare` + `npm run verify:cloudflare`: pacote de 221 arquivos com referências íntegras.
- `tests/document_workflows.cjs`: seis documentos/três GRDTs, filtros combinados, ausência/rótulos inválidos, identificação do último envio, ordem natural, XLSX real de duas abas, parsing e caracteres acentuados; repetido após os ajustes finais.
- `tests/document_workflows_database.cjs`: migrations em Postgres/PGlite; papéis e contratos; Worker real e binding R2; exclusão, arquivo compartilhado, falha R2, falha DB após remoção física, retry e idempotência; histórico/auditoria; lookup e autor da listagem; publicação parcial/concorrente e leitura da base; edição de data sem mudanças de linhas, snapshots, comparações ou alertas. Repetido após sincronizar nomes das migrations.
- Testes de Conferência, agregação documental e verdade atual repetidos após o tratamento final de identificadores.
- `scripts/validar-integrated-contracts-browser.cjs`: regressão Chromium com 2.201 mudanças, paginação, Excel filtrado, histórico, badge, admin, editor de e-mail e Cofre → DOCX revisão 0 → análise → GRDT/histórico.
- `scripts/validar-document-workflows-browser.cjs`: interface real em Chromium; rota antiga segura; Cofre exporta 52 documentos filtrados de um catálogo de 103, além dos 50 visíveis; cancelamento não chama exclusão; confirmação remove da listagem; fonte de solicitações funciona sem LD; seis documentos/três GRDTs e filtro adicional com quatro documentos/duas GRDTs; Excel de duas abas; edição de data; cenários 10/50/100; zero erros de página. Repetido depois dos ajustes finais.
- `git diff --check` passou. Os novos testes e o runner foram adicionados ao workflow integrado para execução em PR/push.
- Após a correção da disputa de foco identificada no CI, TypeScript/build, estabilidade e os runners Chromium completos de SIGEM × PW, Consultas, PDFs e Histórico eGRDT passaram localmente, incluindo foco inicial, Tab/Shift+Tab, Escape e restauração do foco.

### Regressões encontradas e corrigidas

1. Tipos globais necessários ao Histórico eGRDT estavam no módulo Análises: foram realocados antes da remoção.
2. Workflows e teste legado ainda referenciavam arquivos de Análises: referências removidas/atualizadas.
3. Painéis iniciais de data e base tinham controles desproporcionais: ajuste de CSS e revisão visual em 1366 px.
4. Estado e operações assíncronas podiam sobreviver à troca de contrato: tokens de contexto e invalidação no hook/controlador.
5. A base de solicitações podia ser sincronizada antes do carregamento lazy de TriagemCore: dependência carregada antes de construir o índice.
6. Normalização própria de solicitações não preservava integralmente variantes NT/EAP: substituída pelo motor documental existente e coberta por teste.
7. Detalhamento e consolidado podiam escolher campos diferentes quando latestEgrdtNumber e egrdtNumber coexistiam: escolha pertinente centralizada para tela, resumo e Excel.
8. Arquivos de migration tinham timestamps de criação diferentes das versões atribuídas na aplicação remota: nomes e teste sincronizados com o histórico do banco.
9. O CI revelou disputa entre o gerenciador de foco React e o aprimoramento legado de diálogos: os drawers React agora identificam que gerenciam seu próprio foco, trap e Escape. O legado respeita esse controle, preservando o foco inicial e seu retorno ao fechar.

## Arquivos da entrega

`M`: alterado; `D`: removido; `A`: novo. Além desta documentação:

```text
M	.github/workflows/historico-egrdt-react-browser.yml
D	.github/workflows/history-phase-b-browser.yml
M	.github/workflows/integrated-contract-monitoring.yml
M	.github/workflows/pdf-tools-react-browser.yml
M	.github/workflows/sigem-pw-react-browser.yml
M	GRCON_TESTES_5.31.6.mjs
D	analysis-history.css
M	cloudflare/worker-entry.mjs
M	document_vault_app.js
M	grcon_module_loader.js
M	grcon_enhancements.js
M	ui-v3.js
M	src/react/core/ui/UiPrimitives.tsx
M	index.html
M	package.json
M	posting-conference.css
M	posting_conference_app.js
M	posting_conference_core.js
M	posting_conference_report.js
M	requests-phase-b.css
D	scripts/validar-historico-analises-browser.cjs
M	shared_sigem_query_app.js
M	src/react/consultas/ConsultasApp.tsx
M	src/react/consultas/components/consultasComponents.tsx
M	src/react/consultas/hooks/useConsultas.ts
M	src/react/consultas/services/consultasAdapter.ts
M	src/react/consultas/types/domain.ts
M	src/react/consultas/types/legacy-globals.d.ts
D	src/react/historico-analises/HistoricoAnalisesApp.tsx
D	src/react/historico-analises/components/HistoricoAnalisesComponents.tsx
D	src/react/historico-analises/hooks/useHistoricoAnalises.ts
D	src/react/historico-analises/index.tsx
D	src/react/historico-analises/services/historicoAnalisesAdapter.ts
D	src/react/historico-analises/types/domain.ts
D	src/react/historico-analises/types/legacy-globals.d.ts
M	src/react/historico-egrdt/services/historicoEgrdtAdapter.ts
M	src/react/historico-egrdt/types/legacy-globals.d.ts
M	sw.js
D	tests/historico_analises_react.cjs
M	tests/shared_sigem_query.cjs
M	vite.config.ts
A	requests_control_app.js
A	requests_control_core.js
A	scripts/validar-document-workflows-browser.cjs
A	supabase/migrations/20261007122636_document_vault_deletion.sql
A	supabase/migrations/20261007122911_shared_sigem_reference_date.sql
A	supabase/migrations/20261007122913_requests_control_base.sql
A	supabase/migrations/20261007122915_document_vault_set_lookup.sql
A	tests/document_workflows.cjs
A	tests/document_workflows_database.cjs
```
