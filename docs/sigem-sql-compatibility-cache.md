# Projeção SQL da Consulta Geral

Estado: implementação em validação isolada; **não aplicada à produção**.

A migração preserva o contrato de leitura das nove colunas de
`private.grcon_sigem_query_rows`. A tabela original passa a ser a área de envio
`grcon_sigem_raw_rows`, e uma view privada combina essa área com um cache sem
perda de conteúdo. A ativação da representação compacta é atômica por snapshot.
Aplicar o DDL não apaga linhas.

O cache mantém o conteúdo completo uma vez por igualdade comprovada dentro do
mesmo contrato, mais o mapa independente de cada versão e posição da planilha.
Os campos `id` e `sourceRow` são reconstruídos somente quando o padrão derivado
coincide exatamente com o JSON original; valores excepcionais, ausentes e nulos
são preservados separadamente. Um SHA-256 serve para localizar candidatos;
o conteúdo completo também precisa ser igual. A preparação confere todas as
nove colunas de cada linha e recusa lacunas e colisões.

As onze funções instaladas que consultam as linhas são recompiladas com suas
regras de autorização originais. O escritor de uploads pendentes continua
fazendo `ON CONFLICT` na tabela física. O indicador de espaço soma os objetos
reais de armazenamento. Comparações, monitoramento, prazos, histórico, busca e
Registro Mestre continuam recebendo os campos completos e as mesmas identidades.

As tabelas e views são privadas, têm acesso direto revogado e usam RLS ou
`security_invoker`. As operações de preparação, liberação e restauração são
exclusivas da administração SQL, sem novas funções públicas ou novas credenciais.
Não existe exclusão automática ou agendada nesta implementação.

A liberação da cópia bruta é uma operação separada. Exige cache completo, nova
comparação integral com as linhas originais e comprovante de auditoria Turso/R2
conferido independentemente pelo administrador. O backend ainda precisa integrar
esse comprovante com a troca de leitura antes de habilitar a operação em produção.
`grcon_sigem_cache_restore_raw` reconstitui os dados brutos em transação usando o
cache local, sem depender da disponibilidade de outro serviço.

Validação local: PostgreSQL PGlite, 1.539 linhas completas em três snapshots,
igualdade de todas as colunas e de JSON com valores excepcionais, isolamento de
contrato, preparação interrompida, reenvio idempotente, envio pendente existente,
paginação/autorização, digest adulterado, recusa de liberação divergente e
restauração operacional. O ensaio de backup também testa essa representação em
PostgreSQL isolado quando `GRCON_RECOVERY_VERIFY_COMPATIBILITY=true`. O resultado
corporativo desse novo ensaio ainda deve ser executado e registrado.

O tamanho liberado será medido no banco real após a remoção autorizada dos dados
brutos e a manutenção adequada. Remover linhas logicamente não garante redução
imediata dos arquivos físicos. Nenhum ganho estimado equivale a espaço recuperado.
