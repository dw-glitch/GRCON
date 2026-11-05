# GRCON — notas para sessões de trabalho

## Títulos e codificação de documentos
Antes de mexer no **Corretor Inteligente de Títulos** (`workers/title-corrector.worker.js`, `src/react/title-corrector/`) ou em qualquer regra de título/código de documento, leia `docs/titulacao-documental-fiscal-20261105.md` (orientação da fiscal + regras do proprietário). Pontos que não podem ser esquecidos:
- Título completo e inequívoco: **TIPO DOCUMENTAL – O QUÊ – ONDE/QUANDO**; nada genérico.
- **A TAG do código fica sempre no final do título** (`TÍTULO - TAG`).
- **`nt-` não é TAG**: documentos `nt-` não recebem TAG no título.
- O corretor **recolhe** informações do título atual da LD que as bases não têm e as cruza com as bases para montar o título mais detalhado possível.
- Campo 7 tagueado: TAG como no Anexo I — AP.3, trocando `_` e `/` por `-`; não tagueado começa com `nt-`.

## Regras de trabalho acordadas com o proprietário
- Merge só quando o proprietário pedir; antes de mesclar, esperar a revisão do Codex terminar e ler os comentários.
- Mudanças em banco de produção exigem autorização explícita.
