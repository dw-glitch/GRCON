# Consulta Geral SIGEM compartilhada

A Consulta Geral publicada no Supabase é a fonte prioritária do status SIGEM no GRCON. Conferência, SIGEM × PW, Controle de GRDT e Repostagem consultam a mesma versão por área de trabalho. A presença em Documentos Previstos continua determinando a alocação, independentemente do status.

## Uso

Na Conferência, selecionar **Atualizar Consulta Geral** para carregar Excel. O arquivo é processado em Worker pelo parser existente da Conferência. A prévia mostra arquivo, contagens e amostra de documento/revisão/status. Proprietário e administrador podem selecionar **Publicar Consulta Geral compartilhada**. Os demais membros recebem a versão automaticamente ao abrir o módulo, recuperar a conexão, voltar à aba ou pelo polling de 60 segundos.

Uma prévia local não substitui um status válido encontrado na versão compartilhada. Não é preciso importar novamente a Consulta Geral no Dashboard. Na ausência de uma versão compartilhada, a importação local continua disponível. Uma LD sem Colar SIGEM pode ser analisada quando houver Consulta Geral válida; as demais validações da LD foram mantidas.

## Prioridade e identidade

1. Documento + revisão exatos na versão compartilhada, incluindo sua última cópia válida em cache.
2. Documento + revisão exatos na Consulta Geral local.
3. Fallback existente da LD/Colar SIGEM.

O resolvedor retorna `status`, `source`, `revision` e `snapshotId`. Nenhuma revisão diferente é escolhida como substituta. Normalização de código reutiliza as chaves do motor documental, harmoniza separadores estruturais e mantém a regra de NT e EAP. A grafia exibida é preservada. Ocorrências da mesma revisão com datas diferentes usam a evidência mais recente; empates de status conflitantes não são escolhidos arbitrariamente e recorrem ao fallback. O cache e os índices são isolados por workspace e limpos da memória ao sair.

O motor operacional de avanço de revisão e os overrides manuais existentes foram mantidos. A fonte/status é atualizada quando a revisão é editada e antes da geração. A Repostagem usa status como informação, mantendo os campos e as validações da eGRDT recuperada. Histórico normal e Repostagem persistem o status, origem e versão usados.

## Banco

Migração: `supabase/migrations/20260929223549_shared_sigem_query.sql`, aplicada ao projeto GRCON (`kvyrttccwzdhasplfxnr`).

- `private.grcon_sigem_query_snapshots`: arquivo, autor, datas, contagem esperada/confirmada, metadados do parser, checksum SHA-256, versão anterior esperada e estado.
- `private.grcon_sigem_query_rows`: linhas JSON imutáveis de uma versão publicada, indexadas por versão + número da linha.
- RPCs `grcon_sigem_query_current`, `page`, `begin`, `chunk`, `publish`.

O cliente envia lotes de 500 linhas. Leitura por keyset em páginas de 1.000 linhas; toda a versão é baixada antes da troca em memória. O índice único parcial garante uma única versão ativa por workspace. Publicação bloqueia o workspace, confirma a contagem e verifica a versão anterior esperada. Publicação concorrente obsoleta é rejeitada com SQLSTATE 40001. Carga incompleta não altera a versão ativa. Versões arquivadas ficam disponíveis por sete dias; uploads abandonados, por um dia. Não foram criados índices de status/código sem consulta SQL que os utilize: as buscas por documento/revisão são mapas em memória após uma única carga em lote.

Tabelas privadas com RLS e sem grants diretos ao frontend. Wrappers públicos são SECURITY INVOKER e sem execução para anon/PUBLIC. Implementações privadas verificam `auth.uid()` e membership/papel antes de operar. Leitura: membro ativo do workspace. Publicação: owner/admin. Nenhuma service role é usada no frontend. Auditoria registra publicação, arquivo, quantidade e checksum. Advisor: apenas aviso informativo de tabelas privadas sem policies, esperado porque todo acesso ocorre por RPC autorizada; aviso de proteção de senhas comprometidas já existente no projeto não foi alterado.

## Cache e desempenho

IndexedDB existente da Conferência guarda a última base compartilhada válida por workspace e a prévia local separada. Falhas de rede mantêm a última versão e informam possível desatualização. Falhas de cache não impedem a leitura da versão atual online. Troca de usuário/workspace invalida downloads em andamento. Parser Excel em Worker, indexação única e buscas por Map: não há consultas Supabase por documento nem varredura linear repetida durante geração. O teste de 25.000 indexações + consultas ficou em cerca de 0,3 segundo neste ambiente.

## Arquivos

| Área | Arquivos principais |
|---|---|
| Fonte central | shared_sigem_query_core.js, shared_sigem_query_app.js, workers/shared_sigem_query.worker.js |
| Conferência/parser | posting_conference_core.js, posting_conference_app.js |
| Dashboard/evolução | src/react/sigem-pw/services/sigemPwDashboardAdapter.ts, types/legacy-globals.d.ts |
| GRDT | core.js, app.js, workers/triage.worker.js, workers/ld.worker.js |
| Repostagem/Histórico | grdt_reissue_app.js, history_core.js |
| Sessão/PWA | grcon_cloud_app.js, index.html, sw.js |
| Inicialização | grcon_bootstrap_head.js — elimina corrida de dependências de storage observada no QA |
| Testes | tests/shared_sigem_query.cjs, tests/shared_sigem_query_database.sql, scripts/validar-shared-sigem-browser.cjs, package.json |

## Verificação

- `npm run verify`: TypeScript, sete builds React de produção, sintaxe, workers, referências, versões, dependências, Supabase e suíte completa.
- `npm run build:cloudflare` + `npm run verify:cloudflare`: pacote e referências íntegros; infraestrutura preservada.
- Unitários novos: prioridade, revisão exata, fallback, datas/duplicidades, identidade/EAP/NT, parser, triagem com alocação independente e 25 mil registros.
- SQL real no Supabase com ROLE authenticated: carga incompleta, preservação da versão anterior, publicação válida, concorrência, leitura paginada, negação a não membros e ausência de acesso anon/direto. Tudo em transação com rollback; nenhum documento fictício foi deixado ativo na equipe.
- Chromium desktop, dois perfis isolados: importação por Worker, prévia, publicação, usuário B sem upload, mesmo snapshot na Conferência e Dashboard, status na triagem, revisão exata, arquivo vazio, falha de upload, atualização, offline e reload do cache.
- Controle normal pelo UI: upload de LD sem Colar SIGEM, pasta PDF+nativo N-1710, entrada de documentos, análise em Worker, edição manual de revisão/propósito pelo drawer, confirmação de numeração, download XLS e Histórico contendo fonte/versionamento do status.
- Repostagem: busca real e mudança de revisão atualizam status; suite existente cobre 48/96/240 linhas, loteamento, edição incremental e controles.
- Dashboard existente: cruzamento, cinco situações, busca/filtros, paginação, evolução, exportação e Service Worker.

O teste Chromium compartilhado utiliza um backend RPC controlado para simular dois usuários e falhas; o SQL da persistência/segurança foi validado separadamente no Supabase real. Não equivale a publicar uma Consulta Geral corporativa real: essa primeira carga deve ser feita com o arquivo atualizado da equipe.
