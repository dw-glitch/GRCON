# Registro Mestre — fase 3

Cada fonte dispõe de páginas de 100 registros. O servidor associa a página à
revisão do resultado; se uma base ou o histórico mudar entre páginas, pede nova
consulta. O endpoint anterior permanece compatível.

As fontes SIGEM, PW e Solicitações mostram arquivo, data e disponibilidade da
base. Fonte sem base publicada é distinguida de documento sem correspondência.
O PW compartilhado é consultado no servidor; o dispositivo só é usado como
alternativa quando não há publicação compartilhada acessível. Nessa situação,
a origem local ou em cache é informada.

As ações abrem a Central SIGEM, a pesquisa do Cofre, versões/auditoria do arquivo
e a emissão encontrada no histórico acessível. As permissões existentes seguem
valendo. Nenhuma destas ações publica ou modifica revisão.

Testes: Postgres/PGlite com 205 registros, páginas sem duplicação, concorrência,
fonte ausente, resultados vazios, isolamento e API autenticada; Chromium com
origem, ida/volta de página, arquivos históricos e mudança de contrato.

Limites: busca global mantém o limite informado de 100 resultados compartilhados;
a paginação desta entrega se aplica às fontes do documento aberto. A revisão
para impedir desvio entre páginas é calculada sobre os resultados desse código,
com custo proporcional ao histórico do documento. A migration foi aplicada pelo
fluxo normal e registrada como 20261020131411.
