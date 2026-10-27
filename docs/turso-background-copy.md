# Cópia durável da Consulta Geral

A cópia pode continuar no servidor depois que o navegador for fechado. A ação
**Copiar em segundo plano** permanece exclusiva do Master e exige as mesmas
autorizações externas e de capacidade da cópia interativa. Não troca a fonte
oficial nem permite exclusão no Supabase.

O servidor confere a sessão real antes de gravar a autorização privada no R2.
Ela registra somente identidade do solicitante, contrato e inventário original,
sem token de sessão. A função SQL delegada é executável exclusivamente por
`service_role` e reconfirma a associação ativa do Master em cada lote.

São usadas até três frentes do Workflow já existente, cada uma continuada em
novas instâncias após no máximo 32 chamadas de página/selo. O limite de 50
subrequisições por instância do plano Free é independente do limite de passos;
agrupar páginas dentro de um passo não reinicia esse orçamento. Os cursores,
contagens e o hash parcial são persistidos antes de despachar a continuação.
Os lotes são agrupados para manter o planejamento abaixo de 900 passos por
frente e 2.700 passos no total, reservando margem em relação à franquia Free de
3.000 passos/dia. Não é
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

O estado visível acompanha a instância de continuação atual. Um processo pai
concluído não aprova um filho ainda em execução ou com falha. A revisão do
executor faz parte do identificador do trabalho para não reutilizar o histórico
de passos de uma implementação anterior. Falhas conhecidas de CPU e orçamento
de subrequisições recebem códigos locais, sem registrar respostas ou segredos.
O relatório baixado inclui o progresso do contrato correto, inclusive quando
uma mudança de inventário acompanha uma falha de execução.

Em 27/10/2026 a versão 36 tinha sido arquivada no Supabase após a publicação da
versão 37, mas permanecia ativa nos metadados de uma cópia parcial no Turso.
Todos os demais campos foram comparados e permaneceram idênticos. O estado foi
reconciliado por atualização condicional do registro parcial, preservando os
metadados anteriores e posteriores em `sigem_metadata_reconciliations`.
Essa operação não alterou payloads nem liberou o corte. A auditoria integral
continua obrigatória antes de considerar a versão aprovada.

A preparação SQL está em `supabase/sql/sigem_storage_background.sql`. Deve ser
aplicada antes de usar a nova ação. Testes executam SQLite, restauração/auditoria
reais de conteúdo sintético, falha de hash, revogação e ACL em PostgreSQL PGlite.

Referências oficiais consultadas em 26/10/2026:
- https://developers.cloudflare.com/workflows/reference/limits/
- https://developers.cloudflare.com/workflows/reference/pricing/
- https://developers.cloudflare.com/workflows/build/workers-api/
