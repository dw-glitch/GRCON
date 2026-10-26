# Cópia durável da Consulta Geral

A cópia pode continuar no servidor depois que o navegador for fechado. A ação
**Copiar em segundo plano** permanece exclusiva do Master e exige as mesmas
autorizações externas e de capacidade da cópia interativa. Não troca a fonte
oficial nem permite exclusão no Supabase.

O servidor confere a sessão real antes de gravar a autorização privada no R2.
Ela registra somente identidade do solicitante, contrato e inventário original,
sem token de sessão. A função SQL delegada é executável exclusivamente por
`service_role` e reconfirma a associação ativa do Master em cada lote.

São usadas até três execuções do Workflow já existente. Os lotes são agrupados
para manter o plano atual abaixo de 900 passos por execução e 2.400 passos no
total, reservando margem em relação à franquia Free de 3.000 passos/dia. Não é
habilitado upgrade nem cobrança. O consumo de outras tarefas compartilha essa
franquia: uma limitação externa ainda pode interromper a execução e deve aparecer
como falha, nunca como conclusão. O estado do Workflow armazena apenas cursores,
checksums e metadados, sem payloads das linhas.

Cada lote continua usando a mesma cópia verificada Turso/R2 e a mesma segunda
passagem de auditoria integral. As páginas têm limites inferior e superior
explícitos, permitindo gravação fora de ordem sem confundir uma lacuna com o
lote seguinte. O hash é composto na ordem original. A conclusão exige contagem,
hash e inventário estável, sem importações pendentes.

A chamada interna ao próprio Worker usa service binding e HMAC com expiração
de dois minutos; o segredo nunca é enviado na requisição. Alteração do corpo,
assinatura inválida, contrato incorreto ou revogação do Master interrompem a ação.
Os relatórios privados persistem no R2. A retomada de execução falha reaproveita
os lotes e confere novamente seu conteúdo; não remove nem sobrescreve a origem.

A preparação SQL está em `supabase/sql/sigem_storage_background.sql`. Deve ser
aplicada antes de usar a nova ação. Testes executam SQLite, restauração/auditoria
reais de conteúdo sintético, falha de hash, revogação e ACL em PostgreSQL PGlite.

Referências oficiais consultadas em 26/10/2026:
- https://developers.cloudflare.com/workflows/reference/limits/
- https://developers.cloudflare.com/workflows/reference/pricing/
- https://developers.cloudflare.com/workflows/build/workers-api/
