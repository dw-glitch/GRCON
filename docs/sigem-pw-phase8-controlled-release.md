# SIGEM × PW — Fase 8 | Integração controlada e liberação sem riscos

## Situação de release

**Não publicada.** As fases #357, #359, #361, #362, #363, #364 permanecem em PRs `draft` encadeadas; esta fase também é uma PR encadeada. Nenhuma verificação `mergeable` equivale a aceite de negócio ou autorização para publicar.

## O que esta fase entrega
- Comparador local, de leitura, entre a planilha original do coordenador (`LD x PW 2.xlsx`) e um XLSX exportado pelo GRCON.
- Bloqueadores verificáveis: três abas na ordem oficial, `N-1710` com 32 colunas A:AF e fórmulas F:I, `REL. PW` com 70 colunas A:BR e nomes originais, aba `SIGEM` vazia, ações em J pertencentes ao vocabulário do modelo (12 textos históricos).
- Saída resumida em JSON com diferenças, quantidades e bloqueadores. **Não imprime documentos, valores das células, nomes pessoais, nem envia o XLSX para serviços externos.**
- Testes sintéticos para estrutura, mudança de cabeçalho, ação inesperada, ausência de fórmula e aba extra.
- Ajustes de QA nos controles legados localizados dentro dos painéis recolhíveis, após modernização da interface.

## Comparação local obrigatória

Com os dois arquivos no ambiente autorizado (e nunca enviados a contas externas sem permissão):

```sh
node scripts/sigem-pw-release-parity.cjs "LD x PW 2.xlsx" "GRCON_SIGEM_PW_CONTROLE.xlsx"
```

Ou, usando o script `npm run check:sigem-pw-release -- "LD x PW 2.xlsx" "GRCON_SIGEM_PW_CONTROLE.xlsx"`.

A comparação **não é um certificador completo de regras**: os dados podem pertencer a datas e universos diferentes; ela verifica integridade do esquema, presença das fórmulas, nomes de colunas e alinhamento do vocabulário de ações. O resultado `readyForWorkbookReview: true` NÃO significa permissão de implantação. O campo `approvedForProduction` é sempre `false`, por design.

Sem os dois arquivos, a ferramenta bloqueia com erro claro. O arquivo real do coordenador não foi encontrado entre os arquivos acessíveis nesta execução.

## Gates antes de uma integração na main

| Gate | Evidência exigida | Resultado nesta fase |
|---|---|---|
| Paridade com modelo do coordenador | Comparador com os 2 XLSX originais, validação manual de fórmulas F:I e resultados | **Pendente** |
| Catálogo de 12 providências da coluna J | Confirmação expressa do coordenador nos casos reais | **Pendente** |
| Precisão das contagens | CSG/QTM da coluna C; Previsto registrado; LD ativa; exclusões segregadas; status/revisão corretos | Cobertura automatizada, validação final pendente |
| CSV PW de 70 colunas autorizado | Aprovação do contrato/área para reter e compartilhar atributos e histórico | **Pendente** |
| Volume corporativo | Geração e abertura em Excel de XLSX com aproximadamente 6.041 LD + 29.421 linhas PW, sem travamento | **Pendente** |
| Qualidade técnica | `npm run verify`, QA Chromium, CI do último SHA da `main` | Exigir verde no último SHA |
| Segurança | Sem inserção de arquivos internos em R2 ou novos serviços, nenhum segredo no repo ou chat | Sem novas integrações nesta fase |
| Retorno seguro | Snapshot/tag de versão anterior, plano de rollback, acesso ao Cloudflare permitido | **Pendente** |

Os testes sintéticos Fase 6 conferem a preparação do plano de 29.421 linhas PW, **não** a gravação do arquivo de mais de 2 milhões de células no navegador.

## Sequência exata quando todos os gates forem aprovados

1. Revisar a dif. e documentação de cada PR. Resolver bloqueios de CI em todo o encadeamento, sem mesclar apenas porque os commits individuais passam em testes.
2. Mesclar #357 na `main` sem excluir a base das PRs seguintes; atualizar #359 para a `main` e conferir diff/testes; integrar.
3. Repetir para #361, #362, #363, #364 e a PR da Fase 8; manter ordem e verificar se o GitHub reorientou bases/branches.
4. Criar identificação de rollback do SHA anterior da `main`. Confirmar janela com o usuário/área.
5. Executar **um único build/validação** do SHA final aprovado, observando consumo de GitHub Actions. Não introduzir workflows extras nem ativar limites pagos.
6. Publicar o pacote aprovado pelo processo Cloudflare Workers já existente no GRCON, sem alterar rotas de Supabase/Turso/Neon.
7. Confirmar no ambiente de produção: 3 fontes ativas, KPIs, clique nos cartões, 1 caso Previsto, 1 caso CV, 1 código fora da LD, uma revisão divergente, um caso com comentário fiscal, exportação XLSX com colunas e abas originais.
8. Se qualquer verificação pós-publicação falhar, **rollback** para versão anterior; não apagar bases PW, Consulta Geral ou LD, nem modificar históricos.

## Comandos técnicos de preparação

```sh
npm run typecheck
npm run test:sigem-pw-phase8
npm run test:sigem-pw-coordinator
npm run test:sigem-pw-pw-fidelity
npm run test:sigem-pw-phase6
npm run verify
```

O comparador de arquivos **não foi inserido no `npm run verify`**, justamente porque os XLSX oficiais não são distribuídos ao repositório. O teste sintético do comparador está no `npm test`.

**Regra permanente:** nunca publicar apenas em resposta ao comando "faça a próxima" enquanto faltar aprovação do modelo do coordenador, da permissão corporativa, do teste integral de volume ou de um CI bloqueante.
