# SIGEM × PW — Fase 4: fidelidade dos atributos ProjectWise

## Comportamento implementado

- O importador continua lendo o CSV PW sem alterar os critérios gerenciais e registra a lista `pwRawHeaders` na ordem exata das colunas da origem, inclusive cabeçalhos vazios ou duplicados.
- Cada documento com código reconhecível mantém `pwRawCells` com o valor textual de **cada coluna na posição original**. Não se convertem colunas repetidas em chaves de objeto; não se supõe que toda consulta terá exatamente 70 campos.
- Os dados originais ficam em `sourceRecords`; o modelo normalizado mantém apenas os atributos necessários aos indicadores. O histórico local e o histórico evolutivo preservam os registros originais na restauração de versões.
- `getPwOriginalMatrix(base)` fornece matriz posicional para a exportação do coordenador na próxima fase, com contagens de origem e falha explícita se a versão anterior não contiver a fonte bruta.
- Registros de PW de outras empresas permanecem em `sourceRecords` para auditoria e não entram em indicadores. Empresa é **sempre** coluna C; somente CSG e QTM são elegíveis.
- A quantidade de colunas originais aparece na tela de fontes, junto à indicação de versões antigas que requerem reimportação.

## Limites e cuidados

- Linhas sem código documental reconhecível continuam **excluídas do modelo e dos registros válidos preservados**; a contagem delas fica em `pwRawInvalidRowCount`. A origem CSV permanece necessária para recuperar integralmente essas linhas. Não afirmar que elas foram armazenadas.
- Não reconstruir colunas não preservadas em versões históricas antigas: é obrigatório reimportar o CSV original para disponibilizar os dados brutos.
- A exportação gerencial existente não mudou nesta fase; a Fase 5 precisa fazer a correspondência das colunas e proteger conteúdo textual contra interpretação como fórmulas.
- Publicações PW compartilhadas já utilizam o catálogo `sourceRecords` e os metadados; antes da liberação em produção, validar limites de payload, política de retenção e autorização do contrato para a nova quantidade de campos.
- Nenhuma nova cópia de PDF para R2, migração de banco ou publicação Cloudflare foi feita por esta fase.

## Validação

```bash
npm run test:sigem-pw-pw-fidelity
npm run test:sigem-pw-managerial
npm run test:sigem-pw-references
npm run typecheck
npm run build
```

Verificação adicional obrigatória em navegador corporativo: importar CSV autorizado com 70 colunas, ativar/desativar fontes, atualizar LD, comparar SIGEM × PW, conferir contagem CSG/QTM, recarregar o navegador e restaurar uma versão PW do histórico, confirmando que os campos posicionais não foram perdidos. Testar também publicação PW compartilhada com autorização de armazenamento e checar o formato recebido pelos demais usuários.
