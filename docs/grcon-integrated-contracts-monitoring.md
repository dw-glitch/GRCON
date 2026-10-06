# Cofre, contratos e Consulta Geral — integração

## Fluxo operacional

- O Cofre recebe documentos de qualquer extensão, ignora compactados e identifica a revisão 0 quando o nome não possui sufixo. A escolha para emissão permanece na Central de Controle de GRDT: selecionar **Cofre**, colar códigos, localizar e preparar os encontrados.
- Todas as origens usam a mesma entrada e o mesmo motor de GRDT, Histórico, repostagem, disciplina e limite de lote. Não conformidades continuam consultivas; inclusão permanece uma decisão do operador.
- Contratos iniciais: UHDT-D, UCR, UDA, UGH e Pátio de Coque. Dados e usuários existentes foram vinculados à UHDT-D. Cada contrato possui workspace e configurações próprios.
- Trocar contrato recarrega o contexto para descartar arquivos, LDs e resultados que estavam em memória. UHDT mantém as chaves e bancos locais anteriores. Os demais contratos usam bancos, chaves e canais de comunicação separados. Envios ativos impedem a troca até terminarem.
- Sem autorização explícita para herdar regras, contratos diferentes da UHDT não recebem automaticamente suas validações documentais/normativas. O proprietário administra o perfil de regras de cada contrato.

## Administração

O proprietário cria/edita/desativa contratos e cria usuários associados ao contrato escolhido. Administradores administram os usuários do próprio contrato. Criação de conta passa por `owner-manage-users`, que valida a sessão real com Auth e verifica permissões no banco. A senha temporária é exibida apenas na resposta da criação. Nenhuma chave privilegiada vai para o navegador.

## Consulta Geral

Cada publicação mantém um snapshot e compara com o anterior do mesmo contrato, por código normalizado + revisão. Status originais são preservados. `Em workflow` e `Em análise` integram o mesmo grupo operacional; diferenças de caixa, acentos e espaços não criam falsas transições. Comparações manuais não geram notificações. Uma carga com status conflitantes para o mesmo código/revisão é rejeitada antes de ativar a nova base.

A tela oferece filtros por código/texto, tipo, status anterior/atual, revisão, disciplina, data e monitorados. Exibe 100 linhas por página; o Excel inclui todos os resultados filtrados, contrato, fontes e data da comparação. As respostas do banco são lidas em páginas para superar o limite de 1.000 linhas da API. Os KPIs de alterações abrem seus filtros. O total de ocorrências comparadas inclui também as que não mudaram; sua unidade é documento + revisão.

Documentos monitorados podem ser adicionados, editados, ativados, desativados e removidos. Sua saída de análise gera alerta de maior relevância; entrada e outras alterações geram aviso informativo. Notificações persistem no banco com leitura individual por usuário e contador de não lidas no cabeçalho. Uma reimportação operacionalmente idêntica não gera novos alertas.

## Modelo da resposta de e-mail

No Histórico, **Resposta de e-mail → Editar modelo da resposta** permite alterar mensagem, fonte/tamanho, tabela/cabeçalho, cores, bordas, espaçamento, largura, ordem, visibilidade, nomes e alinhamento das colunas. O HTML usa estilos inline e mantém a saída compatível com a tabela colada no Outlook. O modelo do contrato tem precedência sobre o global e o padrão interno. Salvar/restaurar cria uma nova versão; as anteriores permanecem preservadas. Edição do texto desta resposta continua disponível a todos os perfis que usam o Histórico.

## Banco e validação

Migrations de integração aplicadas no Supabase e versionadas no repositório:

- `20261006192113_grcon_integrated_contract_monitoring_hardening.sql`: normalização/idempotência, conflitos, permissões dos RPCs privados, proteção contra elevação de admin a owner, contador de não lidas e gravação serializada de templates.
- `20261006192354_grcon_monitoring_search_path.sql`: search_path fixo nos normalizadores puros.

As migrations originais das duas branches são preservadas. Catálogo R2 permanece privado; lookup exige membership e contrato do workspace. Testes funcionais de SQL executam migrations reais em PostgreSQL/PGlite isolado, sem inserir documentos de teste no banco operacional. QA Chromium usa fontes controladas e nunca cria usuários nem envia mensagens reais.

O diagnóstico de RLS sem políticas em tabelas `private` corresponde à arquitetura intencional: acesso direto revogado; APIs autorizadas consultam dados privados. A proteção de senhas vazadas é uma configuração do provedor Auth e permanece fora desta alteração.

## Resultado da validação integrada — 06/10/2026

- `npm run verify` passou: TypeScript, todos os builds React, sintaxe, referências, dependências, migrations e suíte de regressão.
- Pacote Cloudflare validado com 221 arquivos e referências locais íntegras.
- Chromium: 2.201 alterações carregadas, navegação com 100 linhas por página, filtro de monitorados e Excel com os três resultados filtrados e suas fontes.
- Chromium: notificações, histórico por documento, fechamento do histórico, administração e edição/salvamento do modelo de e-mail.
- Chromium: consulta de dois códigos no Cofre, um encontrado e um ausente; DOCX sem sufixo preparado e analisado como revisão 0, eGRDT XLS gerada pelo fluxo normal e histórico contendo o vínculo ao arquivo do Cofre.
- Teste do Worker real de triagem: outros contratos respeitam a configuração de herança das regras, e UHDT preserva a validação anterior.

O banco e a função de administração de usuários já receberam as correções. O código integrado está registrado localmente na branch `feat/grcon-cofre-contract-monitoring`. O envio ao GitHub e a publicação dessa versão no Cloudflare permanecem pendentes: a revisão automática exigiu autorização explícita para enviar ao repositório público `dw-glitch/GRCON`.
