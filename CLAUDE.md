# GRCON — notas para sessões de trabalho

## Títulos e codificação de documentos
Antes de mexer no **Auditor de Títulos** (`workers/title-corrector.worker.js`, `src/react/title-corrector/`) ou em qualquer regra de título/código de documento, leia `docs/titulacao-documental-fiscal-20261105.md` (orientação da fiscal + regras do proprietário). Pontos que não podem ser esquecidos:
- Título completo e inequívoco: **TIPO DOCUMENTAL – O QUÊ – ONDE/QUANDO**; nada genérico.
- **O nome do relatório (Grupo 6) vem da ET, Tabela 13, e abre o título**, com a redação oficial exata (ex.: `RELATÓRIO DE MONTAGEM DE ESTRUTURAS METÁLICAS`); variante errada na LD é identificada e corrigida na recomendação.
- **A TAG do código fica sempre no final do título** (`TÍTULO - TAG`).
- **`nt-` não faz parte da TAG**: em documento `nt-` a TAG do final é o Grupo 7 **sem** o `nt-` (`…_nt-EMT-R-32003` → `- EMT-R-32003`).
- O Auditor é um **reunidor**: junta o título atual da LD com o que as bases oficiais trazem, **sem retirar** nada que o título atual já diz, e fecha com a TAG. Título atual rico é mantido por inteiro; pobre usa o das bases como esqueleto.
- Campo 7 tagueado: TAG como no Anexo I — AP.3, trocando `_` e `/` por `-`; não tagueado começa com `nt-`.

## Regras de trabalho acordadas com o proprietário
- Merge só quando o proprietário pedir; antes de mesclar, esperar a revisão do Codex terminar e ler os comentários.
- Mudanças em banco de produção exigem autorização explícita.
