const assert = require("assert");
const Scope = require("../sigem_pw_scope_fix.js");

(() => {
  const validN1710 = [
    "RL-5290.00-22313-ABC-C1O-001",
    "CE-5290.00-22313-856-C1O-002",
    "DE-5290.00-22313-001-C1O-1234",
    "PR-5290.00-22313-XYZ-C1O-999",
    "SIT-5290.00-22313-A1B-C1O-010",
    "I-RL-5290.00-22313-ABC-C1O-1234",
  ];
  validN1710.forEach((code) => {
    assert.strictEqual(Scope.documentClass(code), "N-1710", `deve aceitar primeiro grupo variável: ${code}`);
    assert.strictEqual(Scope.n1710ScopeInfo(code).eligible, true);
  });

  const rejected = [
    ["RL-5290.00-22314-ABC-C1O-001", "area_sistema_diferente_22313"],
    ["RL-5291.00-22313-ABC-C1O-001", "instalacao_diferente_5290_00"],
    ["RL-5290.00-22313-ABC-XXX-001", "origem_diferente_c1o"],
    ["RL-5290.00-22313-AB-C1O-001", "grupo_documental_invalido"],
    ["RL-5290.00-22313-ABC-C1O-X01", "sequencial_invalido"],
  ];
  rejected.forEach(([code, reason]) => {
    assert.strictEqual(Scope.documentClass(code), Scope.UNCLASSIFIED, `não deve classificar como N-1710: ${code}`);
    assert.strictEqual(Scope.n1710ScopeInfo(code).reason, reason);
  });

  const csv = [
    "NumeroDocumentoCliente;RevisaoCompleta;Revisao;TipoDocumento;TipoDocumentoDesc;Disciplina;DisciplinaDesc;o_statename;Última emissão",
    "RL-5290.00-22313-ABC-C1O-001;0;0;RL;Relatório;DOC;Documentação;Liberado;Sim",
    "RL-5290.00-22313-ABC-C1O-001;A;A;RL;Relatório;DOC;Documentação;Liberado;Não",
    "CE-5290.00-22313-856-C1O-002;A;A;CE;Certificado;DOC;Documentação;Superado;Não",
    "DE-5290.00-99999-856-C1O-003;0;0;DE;Desenho;PRJ;Projeto;Liberado;Sim",
    "RL-5290.00-22313-856-ABC-004;0;0;RL;Relatório;DOC;Documentação;Liberado;Sim",
    "ZZ-1111.00-99999-AAA-XXX-001;0;0;ZZ;Externo;EXT;Externo;Liberado;Sim",
  ].join("\n");

  const parsed = Scope.parsePwCsv(csv, { fileName: "pw.csv", importedAt: "2026-09-11T18:00:00Z" });
  assert.strictEqual(parsed.meta.sourceRowCount, 6, "parser preserva a origem para reprocessamento quando a LD mudar");
  assert.strictEqual(parsed.meta.recordCount, 6, "parser não decide pertencimento antes de receber a LD");
  const ld = {
    meta: { fileName: "LD.xlsx", importedAt: "2026-09-11T18:00:00Z" },
    records: [
      { document: "RL-5290.00-22313-ABC-C1O-001" },
      { document: "CE-5290.00-22313-856-C1O-002" },
    ],
  };
  const sanitized = Scope.sanitizePwBase(parsed, ld);
  assert.strictEqual(sanitized.meta.recordCount, 3, "somente documentos validados pela LD entram na base persistível");
  assert.strictEqual(sanitized.meta.validRevisionRecordCount, 3, "revisões 0 e A contam separadamente");
  assert.strictEqual(sanitized.meta.uniqueDocumentCount, 2);
  assert.strictEqual(sanitized.meta.emittedDocumentCount, 2);
  assert.strictEqual(sanitized.meta.scopeExcludedCount, 3, "quantidade excluída fica disponível apenas para controle técnico");
  assert.strictEqual(sanitized.meta.invalidCount, 0, "documento fora da LD não deve ser apresentado como inválido");
  assert.deepStrictEqual(sanitized.records.filter((record) => record.document.startsWith("RL-")).map((record) => record.revision), ["0", "A"]);
  assert.strictEqual(sanitized.records.every((record) => record.documentClass === "N-1710"), true);
  assert.strictEqual(Object.hasOwn(sanitized, "discardedRecords"), false);

  const stalePw = [
    { document: "RL-5290.00-22313-ABC-C1O-001", revision: "0", state: "Liberado", lastEmission: "Sim" },
    { document: "DE-5290.00-99999-856-C1O-003", revision: "0", state: "Liberado", lastEmission: "Sim" },
  ];
  const sigem = [
    { document: "RL-5290.00-22313-ABC-C1O-001", revision: "0", status: "Sem Comentários" },
    { document: "DE-5290.00-99999-856-C1O-003", revision: "0", status: "Sem Comentários" },
  ];
  const model = Scope.createModel(sigem, stalePw);
  assert.strictEqual(model.pwAll.size, 1, "base antiga contaminada deve ser saneada ao carregar");
  assert.strictEqual(model.sigemAll.size, 1, "comparação usa o mesmo universo documental");
  assert.strictEqual(model.scopeAudit.excludedCount, 1);

  console.log("sigem_pw_scope_filter: OK");
})();
