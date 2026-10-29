# Consulta Geral no Turso e encerramento do Cofre R2

A publicação de novas Consultas Gerais passa por `import-begin`, `import-chunk`
e `import-publish` no Worker. O conteúdo completo é gravado e relido no Turso em
lotes imutáveis de 250 registros. O Supabase recebe somente documento, revisão,
status, título e disciplina para os controles transacionais existentes. Essa
projeção é compartilhada entre versões idênticas, separadamente por contrato.

A publicação SQL original continua responsável pelo CAS da versão ativa,
comparações, notificações, prazos e auditoria. Ela só é chamada depois do selo
Turso. Uma falha anterior preserva a base ativa. Uma resposta perdida depois da
publicação pode ser repetida. Não há fallback de escrita para o Supabase: as
RPCs antigas ficam sem permissão para clientes e o processador antigo rejeita
novas importações. A leitura integral passa pelo Worker e retorna os payloads
originais do Turso; o Registro Mestre também hidrata seus resultados nessa fonte.

## Implantação e bases anteriores

1. Executar os testes PostgreSQL/SQLite e a validação geral do repositório.
2. Conferir recuperação real do backup e os recibos da auditoria integral atual.
3. Aplicar a migração SQL versionada e publicar o Worker/frontend juntos. Durante
   esse intervalo, o cliente antigo rejeita publicação em vez de voltar ao PostgreSQL.
4. Para cada base antiga, conferir recibo, manifesto R2 e destino Turso. A API
   `release-base` exige `GRCON_SIGEM_RELEASE_ENABLED=true` e reconfirma tudo no
   servidor. A função privada de liberação preserva e compara todos os campos
   operacionais antes de remover os payloads completos do PostgreSQL.
5. Confirmar que a tabela legada não tem linhas. Somente então, sob bloqueio curto
   e sem CASCADE, truncar a tabela vazia para devolver seu espaço físico. Medir o
   tamanho total do banco e das projeções; não apresentar DELETE como economia física.
6. Conferir base ativa, histórico, exportação e Registro Mestre pela aplicação.

O modo global legado não autoriza ignorar uma base externa: sua localização é
registrada individualmente. O Supabase conserva autenticação, permissões,
metadados e projeções mínimas; as planilhas completas ficam no Turso.

## Autonomia do Master

Administração → Infraestrutura e armazenamento lista versão, data, arquivo e
quantidade de registros. Bases arquivadas têm exclusão permanente, com confirmação.
A base ativa é protegida no cliente e em transação SQL. Uma interrupção mantém a
base indisponível e permite concluir a limpeza, sem reativá-la acidentalmente.
A remoção alcança o payload Turso, o índice PostgreSQL e o prefixo de backup
exclusivo daquela base. Metadados mínimos e registro de auditoria permanecem.

## Cofre R2 desativado

Uploads, downloads, consultas do catálogo e manutenção agendada do Cofre retornam
`DOCUMENT_STORAGE_RETIRED`, independentemente de variáveis antigas no painel.
Ferramentas de alocação, IA, histórico de eGRDTs e os arquivos locais continuam
usando seus próprios fluxos. A limpeza administrativa cancela multipartes e remove
somente `workspaces/<workspace>/documents/`, inclusive objetos sem catálogo e
variantes retidas. Ela verifica o prefixo vazio antes de limpar o catálogo.

Os prefixos `sigem-backups/`, `sigem-migration-jobs/` e `operations/` são separados:
não são removidos junto com PDFs. O bucket não é excluído nem recebe nova finalidade.
Nenhuma migração para OneDrive é ativada por essa mudança.

## Validação

`tests/sigem_live.cjs` executa o SQL de publicação instalado em PostgreSQL PGlite,
com o protocolo HTTP e SQLite reais do adaptador. Cobre fidelidade integral,
projeções mínimas, repetição, conflitos, falhas, contratos, bloqueio de escrita
legada e liberação de payloads antigos preservando os campos operacionais.
`tests/storage_retirement.cjs` cobre 2.607 objetos, limites de prefixo, multipartes,
falhas, repetição e preservação dos backups da Consulta Geral.
