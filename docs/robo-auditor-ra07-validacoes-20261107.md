# RA-07 — registro de validações e homologações de referências — 07/11/2026

**Situação:** implementado e testado localmente. **Depende da migração `20261107090000_allocation_auditor_reference_validations.sql`, ainda não aplicada em produção** (consulta somente-leitura: a função e a tabela não existem lá). Sem a migração a tela avisa e a auditoria segue (referências ficam "carregadas"; nada é validado por omissão).

## O que mudou
- **Tela** (aba *Arquivos*, seção *Validações de referências*): lista as validações do contrato e, para **proprietário/administrador**, um formulário: tipo (validação ou homologação), referência (ET-5290, N-1710, N-381, Anexo I Ap. 3, Anexo III Ap. A, Caminho do Data Book, Caminho das Pastas, WORKFLOWS_UHDT-D, Memorial UHDT-D), **revisão** (obrigatória para a ET: nunca presumida), **responsável**, **data**, **evidência** e, opcionalmente, início da vigência **com a evidência da vigência**. Revogar exige motivo. Demais perfis só leem.
- **Banco** (migração + RPC `grcon_allocation_reference_validations`): tabela privada com RLS e acesso só pela função; registro **append-only** (revogar não apaga: guarda quem, quando e por quê); idempotência por `requestId`; limites de tamanho e de quantidade; isolamento por contrato; validações no servidor (responsável ≥ 3 e evidência ≥ 5 caracteres, ET com revisão, data não futura, hash e vigência coerentes).
- **Motor**: o registro alimenta o catálogo de referências (`fromRecords` → `buildCatalog`). **Validação ≠ carga**: só valida o que está carregado; validação de uma revisão não vale para outra; **homologação exige validação**; vigência só passa de "declarada" a "documentada" com evidência. Mudar as validações invalida a retomada de análises antigas (entram no hash das referências quando existem).
- **Compatibilidade:** erro `VALIDATIONS_UNAVAILABLE` explicado ("o banco aguarda uma atualização… nunca viram conformidade").

## Evidência
`tests/allocation_auditor_reference_validations_stage13.cjs` (PGlite: permissões, validações do servidor, idempotência, revogação, isolamento, tabela privada, rollback e reaplicação), `tests/allocation_auditor_validations_dom_stage13.cjs` (React real: formulário e travas, registro com `requestId`, a validação chega ao contexto do motor, revogação com motivo, somente leitura para não-administradores, banco sem a função), e ampliação de `tests/allocation_auditor_references.cjs`.

## Limites
Não há banco de homologação (a migração e o rollback só foram provados em PGlite). A tela **registra** a validação; **conferir** a norma continua sendo trabalho humano (a ferramenta não valida o conteúdo da evidência). Uma validação de revisão não carregada (ex.: Rev. Q sem arquivo carregado) não muda o nível. Rollback: `supabase/rollback/20261107090000_allocation_auditor_reference_validations.down.sql` (recusa apagar registros sem confirmação).
