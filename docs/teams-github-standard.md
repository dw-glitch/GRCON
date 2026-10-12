# Confirmação Teams com GitHub e conectores padrão

O Power Automate publica o cartão, aguarda a resposta autenticada e cria um
registro JSON em uma issue de um repositório **privado**. O workflow desse
repositório envia o registro ao Worker com um token temporário OIDC do GitHub.
O Worker valida assinatura, audiência, validade, IDs imutáveis do repositório
e proprietário, ator, visibilidade privada, branch e caminho do workflow.
Nenhum token permanente do GitHub ou segredo de callback é necessário.

O servidor valida contrato, tentativa, conversa, funcionário, horário e seleção
de documentos antes de confirmar no banco e emitir a notificação do GRCON.
Um recibo privado conserva o resultado e a reserva do anúncio: repetir a
entrega da mesma issue devolve o mesmo resultado; outra issue não pode reservar
um segundo anúncio para a mesma tentativa. Um registro alterado é rejeitado.

O Power Automate consulta o resultado da issue por até dez minutos. Só depois
da aceitação pelo GRCON atualiza o cartão e publica a confirmação uma vez.
Um segundo registro privado informa o ID do anúncio e se o cartão foi
atualizado. Falhas ou resultados incertos não são anunciados novamente
automaticamente. A declaração humana continua distinta da Consulta Geral,
que comprova a situação do documento no SIGEM.

## Configuração

1. Criar o repositório privado da ponte, sem colaboradores extras.
2. Instalar `integrations/teams-github/relay.yml` como
   `.github/workflows/relay.yml` na branch `main` desse repositório.
3. Aplicar a migração `teams_github_standard` no banco.
4. Configurar no Worker `GRCON_TEAMS_GITHUB_REPOSITORY`,
   `GRCON_TEAMS_GITHUB_REPOSITORY_ID`, `GRCON_TEAMS_GITHUB_OWNER_ID`,
   `GRCON_MICROSOFT_TENANT_ID` e `GRCON_TEAMS_CONVERSATION_ID`.
   `SUPABASE_SECRET_KEY` permanece somente no servidor.
5. Manter `GRCON_TEAMS_TRACEABILITY_ENABLED=false` durante a preparação.
   O retorno OIDC pode ser testado sem criar registros de GRDT.
6. Exportar uma cópia atual do fluxo operacional e gerar os pacotes:

```bash
python3 scripts/build-teams-github-package.py fluxo-original.zip \
  fluxo-interativo-exportado.zip pasta-pacotes \
  --repository proprietario/ponte-privada --tenant UUID-CORPORATIVO \
  --test-recipient conta-corporativa@empresa.example
```

7. Importar primeiro o teste privado como fluxo novo, mapeando conexões Teams
   e GitHub autorizadas. O cartão é claramente identificado como teste e
   enviado somente à conta informada. Nenhuma GRDT é alterada.
8. Importar o pacote operacional como **atualização do fluxo atual**, preservando
   sua URL de webhook e o caminho antigo dos avisos sem rastreabilidade.
9. Conferir o designer, os parâmetros e zero avisos Premium. Somente após
   validar a ponte e o cartão, ativar a flag com transporte `github`.

## Custos e limites

Teams e GitHub são conectores padrão. Não é necessária licença Premium para
essas ações. O repositório privado usa a franquia gratuita de GitHub Actions;
as execuções consomem minutos dessa franquia. Não habilitar cobrança adicional
para continuar a execução. O retorno pode levar dezenas de segundos e depende
da disponibilidade e dos limites de GitHub Actions e Power Automate.

## Verificação e recuperação

`npm run test:teams-github` verifica OIDC com assinaturas reais, isolamento entre
contratos, confirmação parcial, replay, reserva persistente do anúncio, efeito
no cartão, RLS e uma sonda sem dados operacionais. Os testes existentes de
rastreabilidade verificam histórico, notificações e as colunas do Excel.

Issues abertas ou rejeitadas indicam importação pendente. Conferir a execução
GitHub e o fluxo antes de reenviar. Não reexecutar uma mensagem de anúncio com
resultado incerto. Reentregar a mesma issue ao Worker é idempotente. Excluir
uma issue não exclui a auditoria preservada no banco.
