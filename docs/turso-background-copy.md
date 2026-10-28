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
Os lotes são agrupados para manter o planejamento abaixo de 1.000 passos por
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

## Crescimento acima da franquia de etapas (28/10/2026)

Com 39 snapshots/919.639 registros, o plano estimado atingiu 2.765 etapas,
acima do teto operacional conservador de 2.700 por execução do GRCON. A
preparação anterior recusava toda a cópia com `SIGEM_JOB_STEP_LIMIT`.

O planejador agora separa as versões em **ondas** que respeitam os limites
de 2.700 etapas agregadas e até 1.000 por frente. Depois de concluir cópia,
selo, segunda auditoria integral e recibos válidos, o painel informa quantas
versões faltam e libera **Iniciar próxima etapa**. A etapa seguinte é iniciada
explicitamente após verificar o consumo diário de Workflows; não há execução
ilimitada ou contratação automática. A franquia Free anunciada pela Cloudflare
é de 3.000 etapas/dia, compartilhada com outros Workflows da conta.

Uma onda completa **não** é migração completa. O status só declara
`complete:true` quando o inventário original permanece estável, nenhuma
versão está pendente e cada snapshot tem um recibo íntegro de auditoria.
Para retomadas, o servidor reconfere os recibos anteriores no Turso e R2.
Uma alteração do inventário exige nova reconciliação. O modo `turso` como
fonte oficial e a limpeza do Supabase seguem bloqueados.

## Recuperação corporativa pelo GitHub Actions

O workflow manual `SIGEM — Recuperação real de backup` usa as credenciais
já existentes da publicação, limitadas ao passo de recuperação. Recebe apenas
UUIDs e o hash do manifesto conferido de forma independente no Turso. A API
R2 é usada somente com GET, no bucket existente e no prefixo exato da versão.
Não há alteração de permissões, criação de token ou modificação em produção.
Se o token de publicação não possuir leitura do R2, o workflow recusa com
`RECOVERY_R2_ACCESS_DENIED`; essa permissão não é presumida.

A ferramenta baixa manifesto e lotes para diretório privado temporário, confere
cada hash e restaura a versão inteira em SQLite e PostgreSQL PGlite isolados.
Todos os campos das linhas e metadados são comparados; timestamps tipados são
comparados pelo instante, preservando também o JSON original do manifesto.
O único artefato publicado é `summary.json`, com contagens e hashes. Payloads,
SQL e arquivos SQLite não são incluídos em logs ou artefatos e são removidos
ao fim do ensaio. Isso verifica a recuperação independente; não libera o corte
nem substitui a homologação das dependências operacionais.


## Continuação após diagnóstico real em 27/10/2026

O diagnóstico pela API Cloudflare confirmou `SIGEM_SUBREQUEST_LIMIT` no primeiro
passo `grant` de três instâncias de continuação (segmentos 17, 35 e 22). O próprio
pai não deve criar o próximo Workflow: as continuações agora usam uma caixa de
saída no R2, consumida pelo Cron em uma invocação independente. O estado aguardando
o próximo disparo não é falha. O Cron reconfirma a associação atual do Master e o
inventário antes de despachar ou recuperar uma execução, com até três tentativas
por segmento. Nenhum segredo de infraestrutura fica na autorização persistida.

A revisão 3 do executor reaproveita somente auditorias integrais concluídas. Cada
comprovante precisa bater com o hash do manifesto R2, a contagem, o checksum e os
metadados imutáveis do snapshot atual e do destino. A única mudança de ciclo de
vida aceita para esse reaproveitamento é ativa para arquivada; edição de data,
metadados ou conteúdo exige nova cópia e auditoria. Snapshots continuam separados
por contrato e versão. As contagens reaproveitadas aparecem no relatório.

A execução manual `40521670385` confirmou as três interrupções e repetiu com
sucesso a restauração corporativa de 22.430 registros em SQLite e PostgreSQL
isolados. A versão 37 foi arquivada na origem quando a versão 38 foi publicada;
a reconciliação dessa mudança mantém registro anterior e posterior no Turso.
A origem atual tem 38 snapshots e 893.493 registros. A cópia anterior parou em
317.002 copiados / 269.509 auditados, e não comprova a migração completa.
O corte, as projeções SQL e a limpeza no Supabase ainda não foram executados.
