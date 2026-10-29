# SIGEM × PW — Multiple reference sources and managerial controls

## Scope and nomenclature

The executive screen uses six business labels rather than data-source names:
`Documentos ativos`, `Cadastrados no PW`, `Emitidos no PW`, `Postados no SIGEM`,
`Em conformidade`, `Com pendências`.

These are **document-level** values. Legacy revision-level comparisons remain accessible
in the expandable operational view. The PW population is restricted to CSG/QTM via
**column C**, and only document codes within the union of active reference sources
can appear in the new official managerial values. Revision-level reporting is not
arithmetically interchangeable with document-level reporting.

## Importing multiple sources

Choose several Excel files in the `REFERÊNCIAS DOCUMENTAIS` card. Sources are
identified by normalized filenames. Re-importing the same filename replaces only
that source, while all other sources remain intact. The collapsed manager lists
active state, import timestamp and record count; toggling an entry excludes or
includes its records without deleting the raw source rows.

An older single-reference import is migrated on the next update in the browser.
Existing IndexedDB history is preserved; LD snapshots include their source records
so previously active versions can be reconstructed. An unsuccessful parse aborts
the entire batch before any persistence. Persisted updates use the existing
rollback path.

If active sources disagree about revision, title or original status, the
document is flagged `referenceConflict`. Conflicting values are intentionally
left unresolved, and the executive classification cannot declare compliance.

## Reconciliation and counters

The live dashboard sets `requireDocumentReference: true` in both its
Web Worker and its synchronous fallback; historical code calling the core
without this opt-in retains the prior historical calculation. The scope-fix
wrapper must forward the option unmodified.

PW registration does not prove emission: `Previsto` counts as registration
only; `Última emissão = Sim` is used as the current emission evidence.
A historically emitted revision marked `Não` is not automatically current.
SIGEM posting is inferred only from status values of its Consulta Geral
projection, never from the reference sheet's `EMITIDO` field.

When the PW/Consulta Geral data is missing, affected executive counters display
an em dash instead of an incorrect zero. Reference-only documents appear in the
managerial document table, including their recommended actions.

The compliance classification is deliberately conservative. A record with
insufficient revision or source evidence is not marked compliant. Decisions
must be reviewed against the upstream SIGEM status vocabulary during production
homologation.

## Coordinator XLSX

The `Exportar controle Excel` command generates:
- `N-1710` — the model's A–AF columns, three-row header, revision matrix 0–U.
- `REL. PW` — source PW records involved in the official scope.
- `SIGEM` — scoped Consulta Geral records.
- `RESUMO` — the six executive values and audit totals.
- `FORA DO ESCOPO` — excluded PW and SIGEM entries.
- `RASTREABILIDADE` — reference versions and conflicting codes.

The Excel calculation and screen read the same `reconcileManagerial` result.
Do not restore VLOOKUP/PROCV first-match logic; it can select an outdated revision.

## Validation

Focused tests added:
```bash
npm run test:sigem-pw-references
npm run test:sigem-pw-managerial
npm run test:sigem-pw-reference-sources
```

Full release gate before merging:
```bash
npm run typecheck
npm run build
npm test
```

Then inspect the dashboard in a real browser, import multiple source files,
toggle one, compare canceled and conflict records, and open the resulting XLSX
against the coordinator's original model. No corporate document should be copied
to R2 as part of this feature.

## Operational limits

The implementation continues using the existing browser-side LD persistence
and its scope/permissions. A centrally shared and synchronized LD registry
across workstations is a separate backend task and must not be presented as
already implemented. Cloudflare production was not changed by creating this
branch; integration and release require explicit validation and an approved merge.
