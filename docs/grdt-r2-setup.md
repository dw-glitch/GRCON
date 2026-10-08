# Cofre GRCON — Cloudflare R2 + Worker

## Estado em 06/10/2026

O Cofre usa uma arquitetura privada e same-origin:

```text
GRCON no navegador
  → /api/document-vault/* (Cloudflare Worker)
  → Supabase GRCON (catálogo/metadados)
  → binding R2 GRCON_DOCUMENTS (binário)
```

O navegador **não acessa o R2 diretamente** e não recebe credenciais administrativas.

## Bucket

Bucket de produção: `grcon-documents`.

- manter acesso público desativado;
- não habilitar `r2.dev` para os documentos;
- não é necessário domínio público no bucket;
- CORS do R2 não é necessário para o fluxo atual, porque upload e download passam pelo Worker.

## Binding do Worker

O `wrangler.jsonc` versionado contém:

```json
"r2_buckets": [
  {
    "binding": "GRCON_DOCUMENTS",
    "bucket_name": "grcon-documents"
  }
]
```

O código acessa somente `env.GRCON_DOCUMENTS`. Não são necessárias `R2_ACCESS_KEY_ID` nem `R2_SECRET_ACCESS_KEY` para este desenho.

## Variáveis e segredo

Variáveis de texto:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | `https://kvyrttccwzdhasplfxnr.supabase.co` |
| `R2_BUCKET_NAME` | `grcon-documents` |

Secret obrigatório no Worker:

| Nome | Uso |
|---|---|
| `SUPABASE_SECRET_KEY` | autenticar o backend do Cofre no projeto Supabase GRCON |

Use preferencialmente uma chave Supabase `sb_secret_...` exclusiva para esse backend. O Worker também preserva compatibilidade com o `service_role` JWT legado durante a migração. O segredo deve existir apenas em **Workers & Pages → grcon-cloudflare → Settings → Variables and Secrets**, nunca em GitHub, JavaScript do navegador, HTML ou logs.

O endpoint `GET /api/document-vault/health` confirma se Supabase e R2 estão configurados e também retorna somente os booleanos `powerAutomateConfigured` e `powerAutomateUrlValid`. Nenhum valor de segredo, webhook ou chave é exposto. Assim, após o deploy, o próprio log do workflow permite confirmar se `POWER_AUTOMATE_EGRDT_WEBHOOK_URL` chegou ao Worker e se o formato é aceito, sem abrir o painel Cloudflare.

O deploy usa `keep_vars: true` para preservar variáveis de texto cadastradas no painel. Sem essa opção, o Wrangler substitui variáveis de texto pelas declaradas no arquivo de configuração. Secrets são preservados pelo Cloudflare independentemente dessa opção. `keep_vars` não recupera valores que já tenham sido removidos.

Um HTTP 503 nesse endpoint não prova que uma chave cadastrada foi apagada ou recusada pelo Supabase: verifique separadamente `supabaseConfigured` e `r2Configured`. O nome esperado no Worker de produção `grcon-cloudflare` é exatamente `SUPABASE_SECRET_KEY`; uma chave cadastrada apenas no Supabase, em outro Worker, em outro ambiente ou com outro nome não chega a essa configuração. Não recadastre nem gere uma nova chave sem identificar a causa.

## Catálogo Supabase

O catálogo em produção é privado:

- `private.grcon_document_files`;
- RPC pública `grcon_document_catalog`, executável somente pelo papel de servidor;
- RPC pública `grcon_document_vault_list`, executável somente pelo papel de servidor;\n- RPC pública `grcon_document_vault_lookup`, executável somente pelo papel de servidor, para localizar em lote códigos usados pela Central de GRDT;
- autenticação do usuário é validada pelo Worker antes de informar `actor_id`;
- membership ativa no workspace é conferida novamente pelas funções do banco;
- Documentos Previstos é a fonte oficial de `allocated`.

As migrations aplicadas em produção estão versionadas no repositório com os mesmos números registrados em `supabase_migrations.schema_migrations`.

## Upload e integridade

1. O navegador calcula SHA-256 em `document_hash_worker.js`.
2. `/init` confere binário idêntico e identidade documento+revisão.
3. Arquivo idêntico pode reutilizar o objeto existente sem duplicar R2.
4. Até 64 MiB, o Worker faz upload único.
5. Acima disso, usa multipart; partes confirmadas ficam registradas para retomada.
6. Ao final, o Worker confere o tamanho no R2 e só então marca o catálogo como `ready`.
7. Download passa por autenticação e autorização antes de `GRCON_DOCUMENTS.get`.

O arquivo original não é renomeado nem alterado fisicamente. A chave R2 é interna e não depende da pasta local.

## Validação final após deploy

- `/api/document-vault/health` deve retornar HTTP 200 com `ok: true`;
- login válido → lista paginada;
- upload pequeno → catálogo + objeto R2;
- download → mesmo SHA-256;
- mesmo binário → sem novo objeto;
- mesma identidade com hash diferente → conflito explícito antes de aceitar variante;
- multipart → pausar, retomar e concluir;
- arquivo inexistente no R2 → erro controlado sem apagar catálogo;
- Alocado/Não alocado → conferir contra o snapshot ativo de Documentos Previstos;
- códigos colados na Central de GRDT → busca exata em lote no Cofre → revisão escolhida quando houver mais de uma → arquivos encontrados entram no mesmo seletor e motor do Fazer GRDT;\n- a busca da Central é isolada pelo contrato ativo e nunca substitui automaticamente um código inexistente por outro parecido.

A publicação automática continua restrita à `main` pelo workflow `Deploy Cloudflare`.
