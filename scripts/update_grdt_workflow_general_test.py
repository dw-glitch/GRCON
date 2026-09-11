from pathlib import Path

path = Path("GRCON_TESTES_5.31.6.mjs")
text = path.read_text(encoding="utf-8")

old_name = 'check("qualquer status diferente de Não Postado e de Em Análise avança da revisão 0 para A", () => {'
new_name = 'check("status concluídos avançam da revisão 0 para A; Em Workflow segue a regra de Em Análise", () => {'
if text.count(old_name) != 1:
    raise SystemExit("Teste agrupado de status não encontrado de forma inequívoca")
text = text.replace(old_name, new_name, 1)

old_list = '''  const statuses = [
    "Em Workflow",
    "Com Comentários",
'''
new_list = '''  const statuses = [
    "Com Comentários",
'''
if text.count(old_list) != 1:
    raise SystemExit("Em Workflow não encontrado no início da lista agrupada")
text = text.replace(old_list, new_list, 1)

marker = '''  statuses.forEach((status, index) => {
'''
start = text.index(new_name)
loop_start = text.index(marker, start)
loop_end_marker = '''  });
});

check("Em Análise nunca avança sozinho'''
loop_end = text.index(loop_end_marker, loop_start)
insert_at = loop_end + len('''  });
''')
workflow_case = '''

  const workflowHistory = {
    ...technical,
    sheet: "Colar SIGEM",
    row: statuses.length + 3,
    status: "Em Workflow",
    sigemStatus: "Em Workflow",
  };
  const workflowResult = Core.triageOne(
    { id: "workflow-equivalente-analise", name: `${ntDocument}.pdf` },
    Core.buildIndex([technical], [workflowHistory]),
    {},
  );
  assert.equal(workflowResult.decision, Core.DISCARD, "Em Workflow");
  assert.equal(workflowResult.revision, "0", "Em Workflow");
  assert.equal(workflowResult.status, "Em Workflow", "Em Workflow");
  assert.equal(workflowResult.statusOperational, "Em Análise", "Em Workflow");
'''
text = text[:insert_at] + workflow_case + text[insert_at:]

old_comment = '''  // Diferente dos demais retornos (Em Workflow, Recusado, Conforme
  // Construído...), o documento já está sob análise em andamento no SIGEM.
'''
new_comment = '''  // Em Análise e Em Workflow representam análise em andamento para as regras
  // operacionais do GRCON; os demais retornos concluídos podem avançar.
'''
if text.count(old_comment) != 1:
    raise SystemExit("Comentário legado sobre Em Workflow não encontrado")
text = text.replace(old_comment, new_comment, 1)

old_reason_assert = '  assert.match(result.reason, /Em Análise.*n[ãa]o avan[çc]a/i);\n'
new_reason_assert = '  assert.match(result.reason, /Em Análise.*(não é preparada uma nova revisão|n[ãa]o avan[çc]a)/i);\n'
if text.count(old_reason_assert) != 1:
    raise SystemExit("Asserção textual legada de Em Análise não encontrada")
text = text.replace(old_reason_assert, new_reason_assert, 1)

path.write_text(text, encoding="utf-8")
