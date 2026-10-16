# Proprietário master e administração de usuários

O proprietário master é uma capacidade global vinculada a um único UUID do Supabase Auth, guardado na tabela privada `private.grcon_master_owner`. Os vínculos por contrato mantêm os papéis `owner`, `admin`, `operator` e o legado `viewer`; ter `owner` não concede master.

O banco limita o cadastro master a uma linha. Nenhuma rota do aplicativo, Edge Function, metadado do usuário ou seletor de funções cria, transfere ou remove essa concessão. Uma alteração exige SQL administrativo direto após verificar a identidade da conta. Não existe atribuição automática por nome, e-mail ou primeira conta a entrar.

A conta master já foi identificada e vinculada no banco de produção durante esta implantação. As migrações de estrutura não contêm identificadores pessoais nem concedem master em instalações novas. Se o registro estiver vazio ou a verificação falhar, as ações privilegiadas ficam bloqueadas.

Somente master tem o atalho **Administração** no cabeçalho. Ele abre uma tela inteira com navegação entre **Usuários e acessos**, **Contratos**, **Tarefas**, **Painel técnico** e **Registro de atividades**. Os três atalhos anteriores não são montados para o master. Usuários e acessos concentra criação de contas, edição de nome e função, ativação e desativação, alteração de senhas e convites pendentes. A criação de contratos foi retirada do menu pessoal e fica na seção Contratos. Não há opção master no seletor. A própria conta master aparece protegida e não pode ser rebaixada, desativada ou ter a senha redefinida por esses fluxos. A troca da própria senha continua no menu pessoal.

Tarefas e diagnósticos são renderizados dentro da mesma tela, sem abrir outra janela por cima. O seletor de contrato administrado não altera o contrato operacional do aplicativo; tarefas enviadas continuam vinculadas ao contrato operacional. O painel técnico apresenta todos os contratos. A atualização automática é interrompida ao sair da seção ou fechar a tela, e respostas antigas não repovoam a seção depois da navegação.

Outros usuários não recebem o conteúdo da tela. O atalho operacional Tarefas continua disponível para a equipe, sem diagnósticos nem administração. A abertura programática também exige validação master; sair da conta, perder a capacidade ou trocar de contrato fecha a tela e limpa o conteúdo privilegiado. O menu da conta mantém a lista da equipe apenas para consulta, sem edição de perfil ou ações administrativas. A função especial aparece somente para o próprio master; os vínculos públicos continuam sendo `owner`.

## Controles no servidor

- `grcon_is_master_owner()` informa apenas se o chamador é o master; a consulta usa o UUID autenticado e os vínculos ativos do banco.
- `grcon_master_save_user()` altera perfil, vínculo e auditoria na mesma transação, sem expor credenciais de serviço.
- As Edge Functions validam o JWT e consultam a capacidade com o token do chamador. O serviço de Auth permanece exclusivamente no servidor.
- As RPCs antigas de gestão de usuários e exclusão de histórico também exigem master. RLS restritiva e triggers impedem contornar os controles usando escritas diretas ou RPCs antigas com `SECURITY DEFINER`.
- Aceitar convite não muda função nem reativa acessos existentes. Somente convites emitidos pelo master podem criar um novo vínculo.
- A retenção automática não executa limpezas durante uma gravação feita por outro perfil. As gravações operacionais continuam funcionando.

## Validação

`npm test` inclui testes PostgreSQL com PGlite para unicidade, autorização, escritas diretas, conta protegida, login, convites e retenção. `scripts/validar-master-owner-browser.cjs` testa o fluxo visual com dados fictícios, incluindo entrada única, navegação das cinco seções, tarefas e diagnóstico embutidos, isolamento do contrato operacional, edição de proprietário comum, senha, criação de conta, limpeza de senha temporária, layouts de notebook e remoção completa da tela ao revogar a capacidade ou sair da conta. Também verifica bloqueio da abertura programática para owner/admin/operator/viewer e preservação das tarefas operacionais da equipe.

A validação do banco de produção usa transação com rollback: comprova a permissão master, a edição de um proprietário comum e os bloqueios, sem manter alterações nos colaboradores nem apagar histórico.
