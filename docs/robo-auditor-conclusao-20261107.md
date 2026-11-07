> Estado atualizado do banco e da publicação: veja `docs/robo-auditor-publicacao-20261107.md`. As restrições e estados abaixo registram a preparação anterior.

# Continuidade do Robô Auditor — 07/11/2026

Base do Claude: PR #431 em rascunho, branch `claude/robo-auditor-etapas-1-3`, commit `8ffce5f5295566eed1064982af93d027880d022f`. Trabalho local em `fix/robo-auditor-conclusao-20261107`. Nenhum commit, push, merge, deploy ou alteração em produção nesta continuidade.

A atualização #430 da main `0c3572b1768e28408409e56048e38460799d001e` foi preservada em `grcon_cloud_app.js` e `tests/history_pull_dedupe.cjs`, sem executar merge.

## Correções sobre o trabalho entregue

- Consulta de validações indisponível descarta as aprovações anteriores antes de calcular nova auditoria.
- Revisão e SHA-256 são filtros cumulativos de validação e homologação. O hash de homologação permanece no adaptador de registros.
- Declaração de aplicabilidade e flags legadas não elevam o nível da referência. Responsável, data e evidência são necessários; a ET exige também prova de vigência. Registros completos não são sobrescritos por flags.
- O motor usa o catálogo validado na decisão de confirmar achados da ET. Flag sem prova gera pendência, sem marcar regra como verificada.
- A aba Arquivos permite selecionar explicitamente N/P/Q/R e a referência que determina o escopo. Isso não homologa norma nem transplanta o catálogo R para outra revisão.
- Bases vazias não contam como carregadas. A data de referência da conferência é mantida no checkpoint, evitando mudança de vigência no meio da retomada.
- O RPC compara todos os campos de um reenvio, inclusive revisão, hash, data e vigência. Serializa o limite de 500 registros; reenvio idêntico funciona mesmo no limite. Rejeita datas futuras de validação e datas impossíveis de vigência.
- Formulário conserva a evidência em caso de falha. Retry após resposta perdida reutiliza requestId, sem duplicar registro.
- Motor atualizado para 1.6.1, exigindo reanálise de históricos calculados pela versão anterior.

A migração `20261107120824_allocation_auditor_reference_validations.sql` foi corrigida no branch ainda não integrado; não foi aplicada em produção. Se uma cópia anterior já tiver sido aplicada em outro ambiente, revisar o estado da função antes de atualizar; não reenviar uma migration já registrada como se fosse nova.

## Verificação

`npm run build`, `npm test` (inclui as 40 rotinas do auditor), `npm run test:allocation-auditor`, `build:cloudflare` e `verify:cloudflare`. PGlite prova as migrations e os rollbacks, com dados sintéticos; não substitui PostgreSQL de homologação com o ambiente de acesso real.

Teste adicional de dados reais, sem modificar originais:

`GRCON_AUDIT_SOURCES=/diretorio/de/copias/autorizadas npm run test:allocation-auditor-real`

Lê as cinco LDs, compara a importação legada do Gerador com o comportamento anterior, confere a leitura estrita do Auditor e executa 100 documentos no motor. Os 28.806 registros foram preservados. O comando exige os arquivos, que não fazem parte do repositório ou do pacote de entrega. Ausência do acervo é bloqueio, não aprovação.

O teste de Chromium foi tentado, mas o executor negou criação de socket (`Operation not permitted`, `process_singleton_posix.cc`). Os testes React/JSDOM passaram; a conferência visual real desta versão continua pendente.

## Limites e liberação

- RA-07: mecanismo técnico corrigido e testado; homologação das referências reais depende do responsável técnico. Arquivo localizado não habilita regra.
- RA-12: infraestrutura e testes sintéticos disponíveis; treinamento real continua bloqueado por autorização do acervo e rótulos humanos.
- RA-16: avançou para dados reais de leitura e amostra no motor; falta fluxo autenticado de homologação e aceitação visual/operacional.
- Não foram simuladas aprovações normativas. N/P/Q não recebem automaticamente o validador da revisão R; validações indisponíveis continuam bloqueadas.
- Antes de publicar: revisão do PR, homologação das duas migrations e rollbacks, conferência de capacidade do banco e desempenho, confirmação das fontes e autorização de publicação. Não é necessário contratar serviço nesta entrega.

O PR remoto não foi alterado por esta continuidade. As correções locais devem ser revisadas antes de qualquer commit/push. O merge na main pode disparar deploy no Cloudflare.

## Continuidade solicitada: pendências técnicas adicionais

Foi acrescentada, na aba Arquivos do chat, a seção **Preparar aprendizado com histórico**. Ela lê a Central/histórico local em Worker, exige seleção da aba, gera um Excel com instruções, lacunas e campos de revisão humana e conserva todas as linhas. Não grava no banco, não mistura retornos com a auditoria preventiva e não inicia treinamento. Testes `allocation_auditor_ml_preparation_stage14.cjs` e `allocation_auditor_ml_preparation_dom_stage14.cjs` incluídos na suíte padrão (agora 42 comandos).

A Central real disponível foi exercitada nesse fluxo: 15.441 registros; revisão e título enviado ausentes em todos; 16 sem LD/versão; 299 sem data válida de retorno; 1.761 sem decisão fiscal comprovada. Esses grupos podem se sobrepor. A versão atual das LDs não foi usada para preencher retrospectivamente tais lacunas. Hash do original preservado; nenhum modelo real treinado.

O módulo ML 1.0.1 rejeita datas impossíveis, autorização futura, validade inválida e revisão humana anterior ao evento/futura. Validade inclui o último dia informado. Reapresentações do mesmo documento em datas diferentes não são excluídas como duplicatas do conjunto de aprendizado; isso não apaga nem altera o histórico original.

Nova tentativa de Chromium segue bloqueada por `socket() failed: Operation not permitted`. O navegador compartilhado também não alcançou o servidor loopback local (`ERR_CONNECTION_REFUSED`). A conta conectada tem apenas o projeto de produção e nenhuma branch de homologação. Não se criou serviço com custo nem se usou produção como ambiente de testes.
