# SIGEM × PW — Fase 7: consolidação, compatibilidade e gates de integração

## Escopo entregue
Continua a Fase 6 da modernização do painel e do Controle Excel do coordenador, sem alterar nomenclatura, ordem de colunas, fontes autorizadas nem regras de emissão/postagem.

### Correções
- **Fidelidade integral dos dados PW:** o parser de CSV mantém `sourceRecords` contendo todas as linhas **preenchidas**, inclusive linhas cujo campo de documento está vazio/inválido. Cada ocorrência retém `pwRawCells` e `sourceRow` de origem, na ordem correta. `records` continua apenas com códigos válidos e o reconciliador exclui `pwRawInvalid` de todas as contagens por empresa, emissão e documento. O Excel de referência preserva a linha bruta em `REL. PW`.
- **Histórico e reprocessamento LD:** `sourceRecords` percorre o mesmo mecanismo de persistência e snapshots existente; uma nova importação de PW preserva dados brutos reusáveis em próximas revisões.
- **QA Chromium:** ativação e exclusão da Consulta Geral histórica por teclado (foco/Enter) para verificar acionamento real sem corrida de rolagem automática; exportação legada exercitada por acionamento do próprio elemento quando a lista fica dentro de um painel técnico recolhível. O comportamento de negócio continua comprovado pelas asserções.
- **Testes:** `tests/sigem_pw_pw_raw_fidelity.cjs` valida invalidade separada dos indicadores e cabeçalhos/células/linhas brutos; `tests/sigem_pw_coordinator_workbook_phase5.cjs` reabre XLSX e confirma a linha não documental em `REL. PW`.

### Riscos e restrições
- **Não recuperar dados retroativamente:** bases antigas que foram importadas antes desta correção e já perderam linhas inválidas precisam de uma **nova importação do CSV original**.
- **Não inventar confidencialidade:** os 70 campos de PW podem conter conteúdo corporativo que requer autorização formal para compartilhamento; a execução nesta branch só utiliza testes sintéticos.
- **Sem remoção de funções de outros módulos:** a Fase 7 remove inconsistência de dados da própria exportação e corrige QA; não toca em módulos GRDT, Cofre, Neon, Turso, Supabase ou R2.
- **Não há integração com `main` nem deploy de produção**; todas as PRs permanecem empilhadas para revisão.
- **A fonte real `LD x PW 2.xlsx` ainda é obrigatória** para homologar fórmulas originais F:I, cabeçalhos, as 12 variantes de AÇÃO e resultados em Excel da empresa.
- O teste de 29.421 × 70 do plano Excel não substitui ensaio de memória e escrita do XLSX em navegador corporativo com dados reais.

## Sequência de integração — somente após liberação dos gates
1. Revisar e integrar #357 (regras do coordenador) na `main`.
2. Atualizar base de #359 (UI da Fase 3) para receber a nova `main`; integrar depois de QA de regressão.
3. Atualizar e integrar #361 (PW bruto da Fase 4) validando persistência e autorização para os atributos.
4. Atualizar e integrar #362 (Excel da Fase 5) após homologação de modelo e capacidade.
5. Atualizar e integrar #363 (QA da Fase 6), depois esta PR da Fase 7.
6. Revalidar `main`, medir carga real e só então publicar no Cloudflare, com rollback documentado. Nenhuma PR rascunho deve ser mesclada automaticamente.

## Verificações
```sh
npm run test:sigem-pw-pw-fidelity
npm run test:sigem-pw-coordinator
npm run test:sigem-pw-phase6
npm run test:sigem-pw-managerial
npm run typecheck
npm run build
```

A evidência automatizada da Fase 7 fica no workflow da PR. Falhas de setup das GitHub Actions devem ser distinguidas de falhas de código. As ações de homologação anteriores ainda exigem revisão antes de concluir o release.
