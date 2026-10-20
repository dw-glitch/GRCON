# Importação, retomada e relatórios — fase 5

Nas opções de importação do Dashboard, a revisão prévia pode ser habilitada para
SIGEM, PW e LD. A prévia é calculada antes da gravação e do registro no histórico;
mostra entradas, saídas, alterações e exemplos por documento/revisão. Cancelar ou
mudar de contrato preserva a base anterior. A opção é individual, fica recolhida
na interface e não interfere na publicação explícita de bases para a equipe.

O PW aceita perfis com nomes das colunas e separador. O perfil só é utilizado
quando selecionado; cabeçalhos ausentes ou ambíguos interrompem a importação.
Perfis, opção de prévia e retomada são separados por conta/contrato. A retomada
recupera filtros, escopo de revisão e identidades selecionadas por até sete dias;
identidades removidas retornam à base vigente. Arquivos físicos de pastas locais
precisam ser selecionados novamente quando não constam do Cofre.

O backup local inclui os dados duráveis, Conferência, bases/histórico do
Dashboard e registros PW originais com contexto verificável. Dados de outros
contratos são excluídos do arquivo e preservados na restauração. Bases locais
antigas sem contexto verificável não entram no arquivo; a cobertura informa a
exclusão. Novas importações e análises registram conta e contrato. Uma restauração verifica conta/contrato,
valida a estrutura e checksum, cria snapshot local e tenta rollback se falhar.
Os snapshots de recuperação são limitados a três por conta/contrato; o botão
Recuperar estado anterior permite utilizá-los. O checksum detecta corrupção acidental; não é assinatura criptográfica. Backups
antigos em JSON sem identificação de contratos mantêm compatibilidade; com
sessão ativa, sua restauração completa exige o proprietário master. Banco Supabase,
objetos R2 e anexos físicos não estão cobertos pelo backup local.

O relatório gerencial CSV permite selecionar colunas das pendências filtradas e
inclui organização compartilhada. Documento, contrato, arquivo e data da base são
obrigatórios. Valores que poderiam ser fórmulas são neutralizados. O Relatório
Excel e os modelos oficiais de eGRDT mantêm seus fluxos existentes.

Validação: testes do parser e do comparador, CSV com leitura real, suíte global e
Chromium com IndexedDB, botão de backup, dados originais, restauração, snapshot,
falha induzida/rollback, bloqueio de outra conta/contrato e prévia com cancelamento.
