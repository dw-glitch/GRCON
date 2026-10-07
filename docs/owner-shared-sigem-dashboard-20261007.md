# Administração e Consulta Geral integrada

A Administração exige proprietário confirmado: o menu inicia oculto, recusa abertura manual, fecha e limpa dados ao sair da sessão. A Edge Function consulta a membership no servidor e recusa administradores/operadores/consulta. RLS de alteração de memberships e configurações de contrato também exige proprietário.

A data operacional permanece em `metadata.referenceDate`, separada de `importedAt`/`published_at`. Edição usa o ID persistente, controle otimista de concorrência e a mesma RPC para versões ativas/arquivadas. Não republica base, incrementa versão nem cria comparação ou alerta. Conferência, Dashboard, seletores de comparação e projeções locais do histórico/evolução recebem o metadado. BroadcastChannel sincroniza abas; polling confirma mudanças remotas. Cache offline não transforma falha local em falsa falha do salvamento remoto.

O Dashboard lista metadados compartilhados, baixa somente a versão escolhida e mantém no máximo três versões históricas em memória. Seleção temporária nunca chama ativação/publicação/exclusão, preserva fonte oficial e permite PW independente. Alteração somente de data reutiliza o modelo calculado. Erro de carregamento remove os números anteriores e oferece nova tentativa. Excel captura combinação, escopo e filtros junto com as linhas exportadas.

## Validação

- TypeScript, builds, suíte completa e pacote Cloudflare.
- PostgreSQL/PGlite: owner/admin/viewer, anonimato, isolamento por contrato, versão histórica, concorrência, preservação de conteúdo/contagens e bloqueio de gerenciamento por admin.
- Edge Function executada com memberships simuladas: admin/operador/consulta e owner inativo recusados, claims editáveis não concedem autorização.
- Chromium no workflow: 20 mil registros, quatro combinações SIGEM/PW, revisão 0/todas, exportação XLSX, seleção preservada e data bidirecional. O ambiente local proíbe sockets usados pelo Chromium; o workflow executa a prova de navegador.

A migration `shared_sigem_history_management` já existente no banco é espelhada sem modificação como pré-requisito. A nova migration adiciona leitura leve de metadados e fortalece as permissões. A Edge Function deve ser publicada com sua autenticação customizada existente preservada.
