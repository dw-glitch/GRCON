# Controle de Solicitações compartilhado e organização do Cofre

Esta extensão está na PR da migração; ainda não foi publicada no GRCON. A migration foi testada em Postgres local e não foi aplicada ao projeto de produção. O Cofre e sua interface dependem das fases F–I.

## Fontes e regras

| Informação | Fonte | Regra |
|---|---|---|
| Alocado / Não alocado | Documentos Previstos compartilhado | Presença exata do código na coluna DOCUMENTO; sem base disponível, a alocação fica a confirmar |
| Alocação vinculada | Controle de Solicitações → Central de alocação | Todas as ocorrências do documento, com número da alocação e linha de origem |
| Status da alocação | STATUS DA ALOCAÇÃO | Texto original da planilha, sem converter CONCLUÍDA em confirmação de postagem |
| Workflow | Workflow | Informação própria, exibida junto ao vínculo |
| Primeira postagem / Nova revisão / Repostagem | Histórico real | Documento + revisão; independente de alocação |
| Postagem no SIGEM | Consulta Geral SIGEM / evidência atual existente | Não substituída pelo status da Central |

Se o documento existir na Central e não constar em Documentos Previstos, continua Não alocado e recebe uma ressalva. Se houver várias alocações, todas são exibidas. Nenhuma alocação é escolhida arbitrariamente. O fluxo usa o número da Central quando há um único número e as duas fontes foram carregadas; os demais campos de emissão permanecem definidos pelo fluxo atual.

O serviço `document_allocation_context.js` fornece os filtros Todos, Alocados, Não alocados e A confirmar para a futura interface do Cofre. A consulta é calculada em memória a partir de versões completas compartilhadas, sem chamadas por arquivo nem criação de pastas R2 por status. Atualizar uma base reclassifica a visualização sem mover ou alterar os binários.

## Como publicar após a ativação

1. Entrar no GRCON como proprietário do workspace.
2. Abrir Configurações da análise → **Controle de Solicitações · Central de alocação**.
3. Selecionar o arquivo Excel, conferir a prévia e clicar **Publicar Central para a equipe**.
4. A versão anterior continua ativa durante o envio. A troca só acontece após confirmar todos os vínculos.
5. Os membros recebem a versão compartilhada na próxima consulta/análise. **Atualizar consulta** permite carregá-la novamente. Uma análise anterior precisa ser refeita se a versão publicada mudou.

O importador lê somente a aba Central de alocação. Reconhece NomeDocumento/Documento, Alocação e Status da Alocação no cabeçalho; também lê Workflow, Documento Ativo, ABA, Versão da LD, Data do envio da ALOC e Caminho Data Book quando presentes. Colunas mescladas verticalmente são herdadas somente quando há uma mescla real no Excel. Cabeçalhos repetidos são rejeitados.

Não são publicados o Excel completo, e-mails, responsáveis ou comentários fiscais. A versão encontrada para validação tinha 3.546 vínculos; o arquivo real ficou fora do repositório. Testes versionados usam dados sintéticos.

## Ativar o banco correto

É necessário permitir o projeto Supabase GRCON (`kvyrttccwzdhasplfxnr`) na conexão desta conversa. O projeto disponível continua sendo CCP CONSAG, que não deve receber estas tabelas.

Depois de conferir as funções existentes de membership/roles e a tabela de auditoria no GRCON, aplicar `supabase/migrations/20261006143737_shared_allocation_registry.sql`. A migration verifica essas dependências antes de criar objetos. Não confundir execução local dos testes com aplicação em produção.

A migration cria duas tabelas privadas com RLS e sem acesso direto pelos papéis de cliente. Funções internas verificam sessão, workspace e papel; wrappers públicos usam SECURITY INVOKER. Somente o proprietário publica; membros consultam. Publicação é atômica, verifica contagem, detecta atualização concorrente e permite repetir a confirmação após perda da resposta. A versão anterior fica disponível para leituras já iniciadas, com retenção limitada.

Após aplicar, validar com contas de proprietário e membro: publicar, consultar em outra sessão, rejeitar publicação pelo membro, isolar workspaces e preservar a base anterior quando o envio falhar. Os testes locais cobrem esses contratos; ainda falta confirmar schema/RLS no projeto real.

## Validação desta extensão

- Parser exercitado com a estrutura da planilha real e com células mescladas, cabeçalho duplicado, múltiplas alocações e divergência entre as fontes.
- Testes do contexto compartilhado: filtros do Cofre, ausência de base, referência desatualizada e snapshot no Histórico.
- Postgres local: privilégios, leitura por membro, publicação pelo proprietário, rejeição de carga parcial, retry, atualização concorrente, troca atômica e auditoria.
- Chromium: selecionar planilha, prévia de 61 vínculos, publicar, receber páginas de apenas 10 registros, usar a Central na análise/GRDT e salvar o snapshot no Histórico. Contrato do filtro do Cofre validado com 40 alocados e 20 não alocados. A interface do Cofre ainda não foi entregue.

O preparo do armazenamento permanece descrito em `docs/grdt-r2-setup.md`.
