# Execução — 23/10/2026

Estado: **preparação implementada; migração operacional parcialmente concluída**.

## Retomada do chat compartilhado

PR #300 já estava mesclado em `1a2bb243077cd00ee5390f2d7f4703bdb1d8a46e`. A inspeção encontrou main em `0cf4a125fe3b1a39511873c334ca79f5b02aaa17`, preservando as alterações posteriores. Produção ainda informa `cfb294123e4bfe8193e5e321c4a900ec56ebf4c0`, build `39965977125`; a preparação Turso não está publicada.

O Deploy Cloudflare `39995527361` foi reexecutado nesta retomada. A tentativa 3 encerrou com failure, job sem steps e sem runner alocado. A API disponível não expõe as anotações desse bloqueio. A inspeção do navegador autenticado confirmou o aviso: **The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings.** O GitHub não diferencia nesse aviso qual das duas condições ocorreu. Não houve alteração de plano, limite ou cobrança. Nenhuma credencial Cloudflare/Turso está disponível ao processo local, e a busca por integrações desses serviços não retornou conexão utilizável. Após o usuário informar a correção do bloqueio, a tentativa 4 iniciou normalmente: checkout, Node e instalação concluídos; validação global em execução.

Nova medição somente leitura: PostgreSQL **1.140.829.331 bytes**, tabela SIGEM **939.032.576 bytes**, **817.351 linhas**, **35 snapshots**, **1 ativo** e **0 pendentes**. Os campos normalizados usados na cópia não possuem nulos na base atual. Nenhuma linha corporativa foi copiada, removida ou alterada nesta retomada.

Pendências técnicas concluídas nesta retomada:

- Segunda verificação integral por lotes contra origem atual, destino, checkpoints e backup, exclusiva Master e com as autorizações existentes.
- CLI confere o hash total da segunda passagem; uploads pendentes ou inventário alterado impedem conclusão e retornam saída 2.
- Gerador de restauração PostgreSQL transacional em schema novo e isolado, preservando os campos reais e metadados, com RLS e recusa de sobrescrita.
- Recuperação SQLite com arquivo 0600, publicação sem sobrescrita em concorrência e recusa de symlinks fora da raiz.
- Testes executados: suites `sigem_turso.cjs`, `sigem_turso_routes.cjs` e `sigem_turso_cli.cjs`; restauração integral de 501 linhas sintéticas no SQLite e em PostgreSQL PGlite, comparação de todos os campos, corrupção em backup/destino/origem, contrato incorreto, metadados, payloads com Unicode/aspas/SQL, integridade, RLS e recusa de sobrescrita. Todos aprovados. Suíte global/build de produção ainda não reexecutados nesta retomada; a cópia local contém os arquivos necessários aos testes específicos, sem o checkout completo.

Continuam pendentes a publicação da preparação, autorização externa corporativa explícita, banco libSQL e secrets, capacidade Turso/R2, cópia e restauração corporativas, protocolo distribuído de publicação/reativação, adaptação das dez dependências SQL e homologação funcional completa. Modo `turso` e limpeza permanecem bloqueados. A recuperação PostgreSQL isolada não equivale à reversão operacional completa.

- Inspeção do repositório e banco real realizada; base main `cfb294123e4bfe8193e5e321c4a900ec56ebf4c0`.
- 35 snapshots / 817.351 linhas inventariados no diagnóstico global.
- 0 snapshots corporativos copiados ao Turso; 0 linhas corporativas migradas ou removidas nesta execução.
- 0 divergências corporativas medidas: a verificação corporativa ainda não ocorreu.
- Snapshot sintético de 501 linhas copiado, validado e restaurado integralmente em SQLite local; testes incluem corrupção deliberada e falhas.
- Novo cliente, API autenticada, RPC aditiva, interface master, CLI, restauração e documentação preparados.
- `supabase` permanece a fonte oficial; modo `turso` bloqueado até implementação e testes do protocolo de publicação e projeções SQL.
- Falta autorização corporativa para armazenamento externo, configuração do banco/segredos, capacidade real do R2 e testes com serviços reais.
- Não houve habilitação de plano pago ou cobrança excedente.

Migração aditiva `20261023152857_turso_sigem_preparation.sql` aplicada ao Supabase. Consulta real verificou ACL restrita a authenticated e rejeição sem sessão. Advisors antes/depois: os mesmos 40 informativos de RLS sem políticas em tabelas privadas e 1 aviso preexistente de proteção de senhas; nenhum novo aviso. `npm run verify`, testes específicos e geração/validação do pacote Cloudflare aprovados. QA real local passou com Chromium Headless Shell: painel de armazenamento Master, header de autenticação, cópia bloqueada sem configuração, larguras 1024/1366/1440; e suíte completa de administração Master/owner/perfis. O Chrome completo não inicia neste ambiente, mas o Headless Shell executou os testes normalmente. PR #300 criado. Todos os workflows GitHub Actions falharam antes de executar etapas; Validar Cloudflare foi reexecutado uma vez, com o mesmo resultado. Sem logs de etapas; causa externa ainda não confirmada. Wrangler 4.34.0 dry-run aprovado, sem credenciais e sem publicar. Publicação ainda não confirmada. Os limites e os passos técnicos estão em `docs/turso-sigem-migration.md`.


# Continuação em 26/10/2026 — autorização e capacidade

- O proprietário confirmou neste chat possuir autorização corporativa para armazenar a Consulta Geral no Turso e seus backups no R2. Isso não autoriza a retirada de dados do Supabase.
- Conexão real confirmada no relatório do GRCON às 12:33 UTC, após o PR #306 corrigir a opção de redirect incompatível com Workers.
- Inventário reconsultado no Supabase: 36 snapshots (1 ativo com 25.333 registros e 35 arquivados com 817.351), total de 842.684 registros. Todos pertencem ao contrato UHDT-D. Nenhum snapshot pendente foi encontrado nessa consulta.
- Medidas atuais: PostgreSQL completo 1.177.357.459 bytes; tabela da Consulta Geral com índices 968.523.776 bytes. A soma integral de `octet_length(to_jsonb(row)::text)` foi 803.028.492 bytes; maior linha 1.483 bytes. O tamanho do SQLite dependerá de índices e páginas; não confundir esse total JSON com o arquivo final.
- Conta Turso inspecionada autenticada pelo GitHub: Starter (Free), sem meio de pagamento e sem faturas; consumo total da organização 4,1 KB / 5 GB, 0 / 500M leituras, 0 / 10M escritas e 0 B / 3 GB de sync. Leituras e escritas não estão bloqueadas. Apenas a consulta de conexão aparece no histórico.
- Captura do R2 fornecida pelo proprietário: armazenamento total 6,69 GB, Classe A 2,24 mil, Classe B 2,56 mil, cobrança acumulada US$ 0. A franquia Standard é 10 GB de armazenamento, 1M operações A e 10M B. Há aproximadamente 3,31 GB nominais de margem de armazenamento, suficiente para o backup JSON inicial de aproximadamente 0,80 GB mais manifestos. Manter margem para o Cofre e rever o consumo se a origem crescer ou a cópia precisar ser repetida com conteúdo novo.
- A autorização externa e o preflight da carga atual podem ser habilitados no Worker; o modo permanece `supabase`. Nenhum serviço pago ou cobrança adicional foi habilitado. A aprovação refere-se ao volume atual, não a crescimento ilimitado.
- A cópia pela tela passa a realizar a mesma segunda auditoria integral do driver administrativo: compara origem, Turso, R2 e checkpoints, recompõe o hash total e reconfirma o inventário. Somente o relatório com `migration.complete:true` e `fullAudit:true` em todos os snapshots comprova a cópia integral. Isso ainda não substitui restauração real, homologação dos módulos e liberação do corte.
- Erros transitórios de rede, limite ou indisponibilidade nas operações idempotentes de cópia/auditoria possuem até quatro tentativas, com espera limitada. Cada tentativa usa a sessão atual e revalida a tela/contrato; erros de credencial/configuração não entram nessa repetição. Os lotes confirmados permanecem recuperáveis após interrupção.
- A preparação do esquema/snapshot é executada na primeira página, evitando repetir seis chamadas remotas de preparação por lote. Todas as páginas continuam comparando os metadados imutáveis e a contagem esperada no destino antes de escrever backup ou linhas.
- Ainda pendentes: executar a carga real e registrar o resultado; restauração corporativa isolada; protocolo de publicação/reativação; adaptação das dez dependências SQL e do background; homologação funcional; corte; autorização específica para limpeza e medição do espaço recuperado.

