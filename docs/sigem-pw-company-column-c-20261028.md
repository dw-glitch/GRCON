# SIGEM × PW — escopo de empresas pela coluna C (CSG/QTM)

Data: 2026-10-28. Origem da regra: operação GRCON/Consag.

## Regra obrigatória

- A exportação CSV da consulta ProjectWise contém a **sigla da empresa na coluna C** (índice 2).
- O motor usa **apenas essa coluna**; perfis de importação não podem redirecioná-la.
- Admite `CSG` ou `QTM`, normalizando espaços e caixa. Siglas múltiplas separadas devem conter um desses valores completos.
- Demais siglas, campos vazios e arquivos com cabeçalho incompatível ficam fora dos KPIs. Registros são preservados para auditoria.
- A presença da sigla `C1O` no código documental **não comprova** pertencimento. A classificação técnica de famílias ET/N-1710/CV permanece independente.
- A presença no PW filtrado comprova **cadastro**; `PREVISTO` significa cadastrado e não emitido; `SIM` e `NÃO` conservam a evidência de emissão (atual/histórica) já usada no módulo.

## Migração segura

1. Publicar o novo código somente após as verificações de integração.
2. Reimportar a consulta do ProjectWise com a sigla da empresa na coluna C. Bases antigas que não comprovam essa origem não produzem números oficiais no Dashboard.
3. Conferir metadados: `companyColumn=C`, `scopeVersion >= 8`, `scopeCompanyCounts`, `scopeExcludedReasons`.
4. Comparar os indicadores antes/depois com a mesma data operacional e revisão.
5. Conferir o painel "Registros PW de outras empresas" e o Excel de auditoria.
6. Se a coluna C tiver mudado de posição ou de significado, **não** usar índice alternativo silenciosamente; corrigir o layout da consulta.
7. Não apagar snapshots históricos originais para aplicar a regra.

## Limitações operacionais

A base SIGEM pode não ter uma sigla de empresa confiável. A comparação preserva seus registros; a condição `SIGEM sem PW` deve ser conferida em caso de dúvidas sobre o pertencimento, pois a inexistência no PW filtrado não demonstra sozinha que um código SIGEM é de responsabilidade de CSG/QTM.

## Testes realizados nesta alteração

- A coluna D com uma sigla admissível **não** torna um registro elegível se C não for CSG/QTM.
- `C1O` de empresa diversa não entra; CSG/QTM sem `C1O` entra.
- Revisões e duplicatas preservadas; cadastro distinto da emissão; `PREVISTO` sem emissão.
- Fluxos do core, dashboard, readiness, auditoria e evolução exercitados com dados sintéticos.
- Execução sintética de 1.200 linhas: 960 elegíveis e 240 excluídas.

**Antes da mesclagem/publicação:** executar `npm run typecheck`, `npm run build`, `node tests/sigem_pw_company_column_c.cjs` e os testes de regressão do SIGEM × PW. Os testes antigos que presumiam C1O como pertencimento precisam de fixtures ajustadas; não são comprovação válida da nova regra.
