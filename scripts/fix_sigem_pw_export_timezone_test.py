from pathlib import Path

path = Path("tests/sigem_pw_revision_export.cjs")
text = path.read_text(encoding="utf-8")
old = '  const name = Report.downloadName(filters({ situation: Core.SITUATIONS.NOT_FOUND }), new Date("2026-09-11T12:05:30-03:00"));\n'
new = '  const name = Report.downloadName(filters({ situation: Core.SITUATIONS.NOT_FOUND }), new Date(2026, 8, 11, 12, 5, 30));\n'
if text.count(old) != 1:
    raise SystemExit(f"Trecho do timestamp esperado uma vez; encontrado {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
