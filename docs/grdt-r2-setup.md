# Preparar o R2 para o GRCON pelo painel web

**Estado desta etapa:** as fases B–E estão na branch da migração. Document API, Cofre e upload ainda dependem da fase F. Os nomes abaixo reservam a configuração dessa fase; nenhum binding/secret foi aplicado nesta entrega. Criar somente o binding não adiciona upload ao aplicativo.

## 1. Manter o bucket existente

No painel Cloudflare, abra **R2 Object Storage → grcon-documents → Settings**. Preserve a classe Standard e o acesso público desativado. Não habilite `r2.dev` nem um domínio público para documentos operacionais. Não é necessário criar outro bucket de produção.

## 2. Preparar o binding do Worker

Em **Workers & Pages → grcon-cloudflare → Bindings → Add binding**, escolha **R2 bucket**, variável **GRCON_DOCUMENTS**, bucket **grcon-documents**. Esse é o nome reservado para a Document API na fase F.

Na implementação, manter o mesmo binding no `wrangler.jsonc` (fonte de configuração do deploy GitHub). Exemplo que a fase F deverá incorporar:

```json
"r2_buckets": [
  { "binding": "GRCON_DOCUMENTS", "bucket_name": "grcon-documents" }
]
```

Não copiar o exemplo inteiro sobre a configuração existente. Preservar nome, ASSETS e roteamento `/api/*`. A produção continua com o Worker existente. Preview deve usar armazenamento local R2 ou bucket privado separado, sem `remote:true` para produção.

## 3. Credenciais para upload direto autorizado

Em **R2 Object Storage → Overview → Account Details → API Tokens → Manage**, criar um token de conta quando seu perfil permitir; senão, token de usuário. Escolher **Object Read & Write**, limitado somente a **grcon-documents**. Guardar **Access Key ID** e **Secret Access Key**. A chave secreta só é exibida na criação.

O binding permite acesso do Worker ao R2 sem token S3. As credenciais S3 são adicionais: servem para a API assinar autorizações temporárias para upload direto do navegador; não serão entregues ao frontend.

Em **Workers & Pages → grcon-cloudflare → Settings → Variables and Secrets**, cadastrar como **Secret**, nomes reservados para a fase F:

| Nome | Valor |
|---|---|
| `R2_ACCESS_KEY_ID` | Access Key ID do token restrito ao bucket |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key correspondente |

Variáveis não secretas previstas:

| Nome | Valor |
|---|---|
| `R2_ACCOUNT_ID` | Account ID da conta Cloudflare |
| `R2_BUCKET_NAME` | `grcon-documents` |
| `SUPABASE_URL` | `https://kvyrttccwzdhasplfxnr.supabase.co` |

A credencial privilegiada do catálogo será definida após conferir schema/RLS do GRCON. Se necessária, ficará como Secret no Worker; nunca usar a chave de outro projeto nem uma variável pública. Não colocar chaves no chat, no GitHub ou em `grcon_cloud_config.js`.

## 4. CORS do bucket para upload direto

Abra **R2 → grcon-documents → Settings → CORS policy**. A fase F fornecerá a regra final conforme os cabeçalhos assinados. Base de configuração para PUT direto:

```json
[
  {
    "AllowedOrigins": ["https://URL-REAL-DO-GRCON"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "If-None-Match"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Substituir a origem pelo endereço real usado para abrir o GRCON na Cloudflare, somente `https://host`, sem caminho nem barra final. Não usar o endereço do bucket. Se a versão Vercel também precisar do Cofre, a API precisa de roteamento e autorização para ela; permitir a origem no R2, isoladamente, não conecta a Document API. Não usar origem universal `*`. Headers/checksums e multipart serão ajustados aos endpoints efetivamente implementados.

CORS não torna o bucket público. A permissão continua vindo da autorização temporária criada pelo backend, após validar a sessão e o workspace.

## 5. Conectar o banco correto antes da ativação

Na conexão Supabase do ChatGPT, permitir o projeto **GRCON**, ref **kvyrttccwzdhasplfxnr**. Nesta conversa só está acessível **CCP CONSAG**, outro projeto. Este impedimento bloqueou a conferência de schema e aplicação de migrations da fase F.

Com o acesso correto, a próxima implementação fará catálogo de metadados, RLS, auditoria e vínculos ao Histórico. Os binários ficarão no R2, não no PostgreSQL.

## 6. Ativação e validação final

Depois de implementar F–K e publicar L:

1. Entrar no GRCON com um usuário autorizado e enviar um arquivo pequeno pelo Cofre.
2. Conferir registro/código/revisão/tamanho/hash e download autenticado.
3. Comparar SHA-256 antes e depois para provar igualdade binária.
4. Testar identidade repetida, binário idêntico e conflito de hash sem sobrescrita.
5. Testar pausa/retomada, pasta com subpastas e uso direto do Cofre na GRDT.
6. Só então importar a carga de aproximadamente 3.015 arquivos/13,7 GB pela fila recuperável.

## Referências oficiais consultadas

- [Bindings R2 e acesso do Worker](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)
- [Tokens R2 e restrição por bucket](https://developers.cloudflare.com/r2/api/tokens/)
- [Autorizações temporárias por URL assinada](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [CORS pelo painel](https://developers.cloudflare.com/r2/buckets/cors/)
