# Consulta Geral — preparação da migração Turso

## Estado desta entrega

Esta é a fase preparatória, com cópia verificável e leitura paralela. **A migração operacional definitiva ainda não está implementada nem liberada.** O Supabase permanece a autoridade para metadados, ponteiro ativo, publicação, histórico e todas as leituras operacionais. `turso` retorna `SIGEM_CUTOVER_NOT_READY` deliberadamente. Não basta configurar uma variável para ativá-lo.

Não há limpeza de registros, troca de ponteiro, retenção automática nem upgrade de serviço nesta entrega. Não declarar economia de espaço antes da limpeza autorizada e medição física.

## Diagnóstico real em 23/10/2026

Banco `kvyrttccwzdhasplfxnr`, main base `cfb294123e4bfe8193e5e321c4a900ec56ebf4c0`. Nenhum PR aberto na inspeção. Deploy Cloudflare desse commit aprovado.

| Medida | Bytes / quantidade |
|---|---:|
| PostgreSQL completo | 1.140.681.875 bytes |
| Tabela com índices | 939.032.576 bytes |
| Heap | 697.901.056 bytes |
| Índices | 240.910.336 bytes |
| Snapshots | 35 |
| Linhas | 817.351 |
| Ativo | 1 snapshot / 25.092 linhas |
| Arquivados | 34 snapshots / 792.259 linhas |

Números anteriores a novos uploads; renovar antes da migração/limpeza. `sourceBytes` e `databaseBytes` no painel são globais; contagens de snapshots/linhas são por contrato. Tamanho Turso é o banco completo, não uma soma por contrato.

## Dependências verificadas

Inspeção de `pg_proc` no banco real encontrou dez funções privadas que referenciam diretamente `grcon_sigem_query_rows`:

- `grcon_document_task_deadlines`: presença documental exata em versões ativas e arquivadas não excluídas.
- `grcon_master_query`: retorna payload integral, pesquisa e paginação por fonte.
- `grcon_monitored_documents_list`: status e título da versão ativa.
- `grcon_run_sigem_comparison`: diferenças e notificações, disparadas dentro da publicação SQL.
- `grcon_sigem_comparison_rows`: comparação histórica por código/revisão.
- `grcon_sigem_query_chunk`: normalização e gravação da importação atual.
- `grcon_sigem_query_history`: informações derivadas por snapshot.
- `grcon_sigem_query_page`: payload integral paginado.
- `grcon_sigem_query_publish`: validação, CAS do ativo, comparação/notificações e auditoria na mesma transação.
- `grcon_vault_operations`: Registro Mestre, pesquisa consolidada e payload SIGEM.

Não foram encontradas views nem triggers de usuário diretamente sobre a tabela. O cron de prazos é uma dependência indireta comprovada no Worker. A publicação em background continua passando por `cloudflare/background-report.mjs` e pela Edge Function `grcon-background-processor`; deve ser adaptada antes do corte definitivo. Não remover a tabela antiga enquanto essas funções dependerem dela.

## O que foi implementado

- `cloudflare/sigem-turso.mjs`: cliente remoto somente servidor pelo protocolo oficial SQL over HTTP `/v2/pipeline`. Escolha evita dependências nativas e mantém SQL parametrizado, timeout, fechamento de conexão e bloqueio de redirects. Exige host `*.turso.io` e banco libSQL; não aceita motor `turso://`.
- Tabelas `sigem_snapshots`, `sigem_rows`, `sigem_import_jobs`. Sem deduplicação física nesta fase: nenhuma igualdade é presumida. Snapshots e contratos nunca são fundidos.
- Payload completo **e todas as colunas de origem** preservados em `row_json`; metadados completos em `source_json`. Índices só para chave primária e identidade documental exata.
- `cloudflare/sigem-storage.mjs`: autenticação Supabase e autorização SQL por contrato a cada operação. Inventário/cópia/status exclusivos do Proprietário Master. Nenhum parâmetro `actor_id` forjado pelo navegador.
- Nova RPC aditiva `grcon_sigem_storage_control`. Permissão explícita de execução, sem acesso direto às tabelas; `search_path` vazio. Não altera funções existentes.
- `/api/sigem-storage/page`: fonte oficial Supabase. Em `shadow`, comparação exata com snapshot verificado no Turso; divergência, versão ausente ou serviço indisponível nunca substituem a origem oficial. Resultado é sinalizado por header/evento e log técnico sem payload.
- Administração → Infraestrutura e armazenamento: conexão, medidas, cópias validadas, relatório e início/retomada da cópia. Sair da seção encerra a sequência após o lote atual. Não há botões de corte ou exclusão.
- CLI administrativa e restauração independente em SQLite.

## Variáveis e configuração externa

| Nome | Tipo | Valor inicial |
|---|---|---|
| `TURSO_DATABASE_URL` | Secret no Worker | URL `libsql://…turso.io` do banco libSQL |
| `TURSO_AUTH_TOKEN` | Secret no Worker | token exclusivo do banco, leitura/gravação |
| `GRCON_SIGEM_STORAGE_MODE` | variável do servidor | `supabase` (também é o padrão se ausente) |
| `GRCON_SIGEM_EXTERNAL_STORAGE_AUTHORIZED` | variável do servidor | somente `true` depois de autorização corporativa confirmada |
| `GRCON_SIGEM_MIGRATION_PREFLIGHT_APPROVED` | variável do servidor | somente `true` depois de conferir espaço e franquias Turso/R2 e registrar autorização |

Nenhum segredo no frontend, `.env` versionado ou chat. O token Turso não é o token de sessão do GRCON. Não habilitar cobranças extras.

1. Entrar em https://app.turso.tech/ e permanecer no plano Free. Criar `grcon-sigem` com **libSQL**. A documentação oficial comprova `turso db create grcon-sigem` para libSQL, sem `--tursodb`; se a interface não oferecer libSQL, interromper e verificar a opção atual em vez de criar outro motor. Menus do painel Turso ainda precisam de verificação visual na conta do usuário.
2. Obter URL e criar token do banco. Nunca enviar o token no chat.
3. https://dash.cloudflare.com/ → Workers & Pages → `grcon-cloudflare` → Settings → Variables and Secrets → Add. Para URL e token selecionar tipo **Secret**. Para as flags, variável do servidor. Manter `supabase`.
4. Revisar e usar Deploy. Isso publica uma versão da configuração. Alternativa técnica: `wrangler versions secret put` cria versão sem deploy imediato; `wrangler secret put` publica imediatamente. Não executar comandos com token na linha.
5. Abrir Administração → Infraestrutura e armazenamento → Verificar conexão. Confirmar autorização corporativa antes de habilitar a flag de armazenamento externo e iniciar cópia.

As instruções de Cloudflare e limites foram conferidas na documentação em 23/10/2026. Turso Free anunciado: 5 GB, 500 milhões de linhas lidas/mês, 10 milhões escritas/mês, 3 GB de sync e recuperação de 1 dia. A conta e as franquias reais precisam ser verificadas antes da cópia. O R2 atual exige inventário de consumo/limites e autorização antes do uso; nenhum espaço disponível foi presumido.

## Operações e protocolo de cópia

- `GET /api/sigem-storage/status?workspace=<uuid>` — master, sem segredos na resposta.
- `GET /api/sigem-storage/inventory?workspace=<uuid>` — todos os snapshots publicados, inclusive exclusão lógica; informa uploads pendentes separadamente.
- `POST /api/sigem-storage/copy` — `{workspace,snapshot,after}`; cursor múltiplo de 250. O Worker lê dados diretamente do Supabase; não aceita linhas enviadas pelo cliente.
- `POST /api/sigem-storage/seal` — `{workspace,snapshot}`; exige checkpoints contíguos e contagem exata.
- `POST /api/sigem-storage/audit` — `{workspace,snapshot,after}`; segunda passagem de 250 linhas, exclusiva Master, após o selo. Reconsulta a origem e compara cada campo, checkpoint, destino e backup. Não escreve no Turso nem no R2. Exige as mesmas autorizações e preflight da cópia.
- `POST /api/sigem-storage/page` — `{workspace,snapshot,after,size}`; limite 1.000, preserva contrato e semântica offline do consumidor.

Cada lote de 250 é serializado canonicamente, gravado no R2 e lido de volta antes de gravar o destino. A inserção de linhas é uma única instrução SQL atômica, sem transação atravessando requisições. As linhas são lidas de volta do Turso e comparadas integralmente; só então o checkpoint é gravado. Repetir um lote confere o conteúdo anterior e rejeita conflito. A finalização lê o diário validado, verifica sequência/contagem e salva manifesto com hash. A revalidação completa e restauração integral são etapas adicionais, necessárias antes do corte.

Canonicalização `sorted-keys-json-v1`: objetos com chaves ordenadas, arrays na ordem original, valores JSON preservados; números inteiros fora da faixa segura são rejeitados em vez de arredondados. SHA-256 do lote sobre UTF-8 da serialização canônica. Hash do snapshot: `h0 = 64 zeros`; `hn = SHA256(h(n-1) + "\n" + SHA256(lote_n))`. Não compará-lo diretamente ao checksum antigo do frontend, que usa outra serialização e apenas payloads.

A metadata de origem deve permanecer idêntica durante uma cópia. Mudança de data, ativação, exclusão lógica ou nova versão exige reconciliação; não sobrescrever silenciosamente o manifesto já iniciado. Nenhuma cópia é autoridade de publicação.

CLI (executada pelo responsável técnico, com token de sessão curto do Master em ambiente seguro; nunca pedir ao usuário para colá-lo no chat):

```sh
node scripts/migrate-sigem-turso.mjs inventory <workspace-uuid>
node scripts/migrate-sigem-turso.mjs copy <workspace-uuid> <relatorio-novo.json>
```

`GRCON_ACCESS_TOKEN` no ambiente do processo. O token Turso permanece no Worker. O driver repete lotes com limite, interrompe por autorização/erro definitivo e compara inventário antes/depois. Após selar cada snapshot, executa uma segunda passagem integral pela rota `audit` e recompõe o hash total. O relatório registra `validatedRecords` e `fullAudit`; somente termina com `complete:true` se os hashes conferirem, o inventário permanecer idêntico e não houver uploads pendentes. Mudança no inventário ou upload pendente produz código de saída 2 e relatório incompleto. Erros interrompem a execução, sem considerar o snapshot aprovado. O selo isolado não substitui essa segunda passagem.

## Backup e restauração

Prefixo privado isolado dos documentos: `sigem-backups/v1/<workspace>/<contract>/<snapshot>/`. Objetos por lote são endereçados pelo conteúdo. Manifesto inclui metadados, sequência, chaves e hashes. Não há rota pública de download desses objetos.

O operador técnico precisa baixar o prefixo pelo acesso autorizado ao R2, preservando as chaves relativas e obter o hash do manifesto de um registro independente confiável. Restaurar para um arquivo novo:

```sh
node scripts/restore-sigem-backup.mjs <raiz-local> <chave-manifesto> <sha256-manifesto> <novo-arquivo.sqlite>
```

O utilitário valida manifesto, cada lote, ordem, hash total, integridade e chaves estrangeiras. Publica o arquivo privado (0600) por hard link exclusivo após validação; recusa destino existente mesmo em concorrência e links simbólicos de entrada que escapem da raiz. Falha remove o parcial. Teste automatizado restaura um snapshot sintético completo. **Restauração de snapshot corporativo completo ainda não executada.**

### Recuperação em PostgreSQL isolado

`scripts/restore-sigem-postgres.mjs` valida o mesmo backup integral em SQLite temporário privado e gera SQL transacional para um **novo schema isolado**. Não abre conexão com PostgreSQL, não escreve no Supabase de produção e não troca o ponteiro ativo. Somente admite nomes `grcon_sigem_restore` ou `grcon_sigem_restore_<sufixo>`; schema existente aborta a transação. Tabelas possuem RLS habilitada e não concedem acesso ao PUBLIC. Os campos das tabelas foram conferidos contra o catálogo real em 23/10/2026; campos novos desconhecidos interrompem a geração, em vez de desaparecer silenciosamente.

```sh
node scripts/restore-sigem-postgres.mjs <raiz-local> <chave-manifesto> <sha256-manifesto> <novo-arquivo.sql> grcon_sigem_restore_homologacao
```

O responsável técnico deve revisar e executar o SQL **em banco de homologação isolado**, com parada no primeiro erro. Exemplo com conexão segura já configurada no ambiente/libpq: `psql --set=ON_ERROR_STOP=1 --file=<novo-arquivo.sql>`. Não usar produção para o ensaio. O SQL recria os campos tipados dos snapshots e linhas, preserva o JSON integral da origem no manifesto, valida contagem e limites da sequência e mantém chaves primárias/estrangeiras. Não recria auth, memberships, auditoria ou permissões do sistema operacional.

Teste com PostgreSQL embarcado PGlite restaurou 501 linhas sintéticas e comparou **todas** as colunas e payloads, incluindo Unicode, aspas e conteúdo semelhante a SQL. O teste verifica metadados integrais, RLS, recusa de sobrescrita e preservação de uma tabela operacional separada. Isso comprova a ferramenta de recuperação isolada; a reintegração às tabelas `private` e a reversão operacional após o corte continuam exigindo protocolo próprio, homologação e autorização.

Retenção: nenhuma exclusão automática de backup nesta fase. Definir política aprovada e conferir capacidade antes da carga. Não prometer franquia gratuita com base apenas na capacidade nominal do Turso.

## Trabalho restante antes do corte definitivo

1. Autorização externa corporativa, banco/segredos libSQL, confirmação de capacidade R2/Turso e homologação.
2. Copiar todos os snapshots de todos os contratos, inclusive exclusões lógicas. Reconciliar imports recentes e pendentes; metadados alterados devem ser tratados explicitamente.
3. Implementar publicação/reativação no Turso com ID de operação, outbox/CAS do ponteiro oficial no Supabase, preparo e reconciliação, sem notificações antes da confirmação. Adaptar também importação em background.
4. Substituir dependências das dez funções SQL por projeções mínimas e/ou consultas servidoras ao Turso. Preservar as consultas históricas de prazos e comparações; não reduzir a uma projeção apenas do ativo. Medir tamanho real das projeções.
5. Persistir divergências do shadow/auditoria e métricas de uso (leituras/escritas), definir rate limiting e exercitar falhas reais dos serviços.
6. Homologar GRDT, conferência, repostagem, SIGEM × PW, consulta avançada, Registro Mestre, Cofre, notificações, exportações, múltiplos contratos e perfis em navegador com bases reais.
7. Restaurar snapshot corporativo completo em ambiente isolado com as ferramentas SQLite/PostgreSQL; homologar reintegração às tabelas operacionais e reversão após corte. A ferramenta PostgreSQL isolada já está implementada e testada com dados sintéticos.
8. Liberar modo `turso` somente após essa homologação. Nesta entrega ele continua bloqueado no código.
9. Pedir autorização específica para retirar registros antigos, com quantidades, evidências de backup e recuperação, impacto e riscos. Depois avaliar espaço físico (VACUUM/reconstrução), custos, bloqueios e margem livre. Nunca executar VACUUM FULL sem avaliação.

## Referências oficiais

- https://turso.tech/pricing
- https://docs.turso.tech/quickstart
- https://docs.turso.tech/libsql
- https://docs.turso.tech/sdk/http/reference
- https://developers.cloudflare.com/workers/tutorials/connect-to-turso-using-workers/
- https://developers.cloudflare.com/workers/configuration/secrets/

