# Organização de pendências — fase 4

A aba Documentos pendentes reutiliza o julgamento do último envio e aceita
prioridade, responsável em texto livre, prazo e observação. Esses dados são
compartilhados por contrato; não há campo para substituir o status da conferência.
A anotação permanece se o documento sair da fila, permitindo reaproveitá-la em
uma pendência futura. Não são enviados avisos por atribuição.

Owner, administrador e operador podem editar; visualizador pode consultar.
Gravações usam a versão lida, impedindo sobrescrita concorrente. A auditoria
registra documento, prioridade, versão e autor, sem replicar a observação.
Tabelas privadas usam RLS e não têm acesso direto pelo navegador.

Filtros de prioridade e responsável alcançam a lista e o Excel. A ordenação
prioriza urgência, prazo e código; os eventos do documento continuam preservados.
Até 20 visualizações de filtros podem ser salvas neste navegador por conta e
contrato. Visualizações não incluem os dados dos documentos.

Testes: Postgres com papéis, CAS e isolamento; cliente com 1.001 registros,
resposta tardia e contas distintas; Chromium com edição, filtros, salvar/aplicar/
excluir visualização e regressões de última eGRDT. A migration foi aplicada como
20261020132354. O recurso não é um cadastro de usuários nem um motor de notificações.
