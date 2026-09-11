from pathlib import Path

path = Path("GRCON_TESTES_5.31.6.mjs")
text = path.read_text(encoding="utf-8")

old_name_1 = 'check("Em Workflow na revisão 0 libera a revisão A sem repetir a postagem da 0", () => {'
new_name_1 = 'check("Em Workflow na revisão 0 se comporta como Em Análise e não abre a revisão A", () => {'
if text.count(old_name_1) != 1:
    raise SystemExit("Teste legado 1 de Em Workflow não encontrado de forma inequívoca")
text = text.replace(old_name_1, new_name_1, 1)

old_assertions_1 = '''  assert.equal(result.decision, Core.READY);
  assert.equal(result.revision, "A");
  assert.equal(result.status, "Não Postado");
  assert.match(result.reason, /0 \\(Em Workflow\\).*primeira combinação DOCUMENTO-REVISÃO ausente.*A/i);
  assert.equal(Core.decisionMessage(result).code, Core.DECISION_CODES.READY);
'''
new_assertions_1 = '''  assert.equal(result.decision, Core.DISCARD);
  assert.equal(result.revision, "0");
  assert.equal(result.status, "Em Workflow");
  assert.equal(result.statusOriginal, "Em Workflow");
  assert.equal(result.statusOperational, "Em Análise");
  assert.match(result.reason, /Em Workflow.*equivale a Em Análise.*não é preparada uma nova revisão/i);
  assert.equal(Core.decisionMessage(result).code, Core.DECISION_CODES.POSTED_BY_LD);
'''
if text.count(old_assertions_1) != 1:
    raise SystemExit("Asserções legadas 1 de Em Workflow não encontradas")
text = text.replace(old_assertions_1, new_assertions_1, 1)

old_name_2 = 'check("Em Workflow avança por todas as revisões já registradas", () => {'
new_name_2 = 'check("Em Workflow interrompe a progressão de revisões como Em Análise", () => {'
if text.count(old_name_2) != 1:
    raise SystemExit("Teste legado 2 de Em Workflow não encontrado de forma inequívoca")
text = text.replace(old_name_2, new_name_2, 1)

old_assertions_2 = '''  assert.equal(result.decision, Core.READY);
  assert.equal(result.revision, "B");
'''
new_assertions_2 = '''  assert.equal(result.decision, Core.DISCARD);
  assert.notEqual(result.revision, "B");
  assert.equal(result.status, "Em Workflow");
  assert.equal(result.statusOperational, "Em Análise");
  assert.equal(Core.decisionMessage(result).code, Core.DECISION_CODES.IN_ANALYSIS_RECENT);
'''
# Este par aparece em outros testes; restringe a troca ao trecho do segundo caso.
marker = new_name_2
start = text.index(marker)
end = text.index('check("Conforme Construído libera', start)
segment = text[start:end]
if segment.count(old_assertions_2) != 1:
    raise SystemExit("Asserções legadas 2 de Em Workflow não encontradas no caso esperado")
segment = segment.replace(old_assertions_2, new_assertions_2, 1)
text = text[:start] + segment + text[end:]

path.write_text(text, encoding="utf-8")
