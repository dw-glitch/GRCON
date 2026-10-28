# GRCON — Cofre oculto até aprovação corporativa (28/10/2026)

## Comportamento por padrão

- Cofre ausente do menu lateral e das abas. O módulo não é montado no DOM.
- Opção de envio de arquivos ao Cofre retirada da geração de GRDT.
- Sem progresso, contadores, métricas ou notificações do Cofre na operação.
- Busca automática no Cofre desativada: geração de GRDT usa a pasta documental disponibilizada pelo operador.
- Banco, metadados, bucket e funções do serviço R2 **não** são excluídos.
- Novos uploads, multipart, inicialização, exclusões, alterações de metadados e reinício de upload rejeitados no Worker com HTTP 403 `STORAGE_WRITES_DISABLED` antes de gravar dados.
- Leitura existente continua sujeita à autenticação e autorização do Worker; nenhum controle de segurança é removido.
- Histórico preserva dados de proveniência, sem mostrar navegação ou ação de recuperação no Cofre.
- Nenhuma rotina copia dados ao OneDrive nesta fase.

## Configuração atual

`grcon_storage_policy.js` define `showStorageUI=false`, `enableAutomaticUpload=false`, `enableManualUpload=false`, `enableAutomaticLookup=false`. Os valores não são controlados por query string, localStorage ou parâmetros de usuário.

Backend: `GRCON_DOCUMENT_UPLOADS_ENABLED` (variável de ambiente do Cloudflare Worker) precisa ser **literalmente `true`** para permitir operações de gravação. Ausente ou diferente de `true`, o Worker nega novas gravações e exclusões. **Não** configurar esta variável enquanto não houver aprovação corporativa. Aprovação e manutenção de acessos/retensão continuam necessárias.

A proteção do Worker tem precedência sobre qualquer interface ou cliente. Reativar a UI sem liberar gravações não autoriza uploads.

## Preparação para possível OneDrive for Business

Adotar no momento aprovado a interface comum de armazenamento (`upload`, `download`, `lookup`, `exists`, `delete`, `usage`) com adaptadores R2 e Microsoft Graph. A implementação exige validação de permissões Microsoft Entra ID, política de retenção, contas corporativas, consentimento administrativo e escopos mínimos. A futura migração deve separar *metadados*, *binários* e *proveniência por documento/revisão*, com verificação de checksum e operação reversível; não ativar nem realizar migração antes da aprovação.

## Verificação e reversão

1. Verificar no navegador que não há item Cofre nem opção para salvar GRDT no Cofre.
2. Gerar uma GRDT com arquivos locais, sem chamadas de escrita ao R2.
3. Com usuário autorizado, validar leitura de dados antigos, sem publicar novos arquivos.
4. Tentar `POST /api/document-vault/init` e confirmar `403 STORAGE_WRITES_DISABLED` enquanto a escrita estiver suspensa.
5. Avaliar a implantação sem alterar o bucket e sem migrar ou excluir objetos.
6. Para reativação futura, exigir aprovação e revisão de segurança; atualizar a política de UI, testes e backend numa mudança explícita. **Não habilitar a variável de escrita isoladamente**.

## Atenção

Ocultar elementos da interface não substitui a autorização formal da organização, nem revoga permissões históricas. Serviços já hospedados precisam de avaliação de conformidade, inclusive política de retenção e eliminação, pela organização responsável.
