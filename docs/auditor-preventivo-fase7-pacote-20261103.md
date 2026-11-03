# GRCON — Robô Auditor Preventivo 2.0 — Fase 7: relatório e pacote final

**Data:** 03/11/2026 · Módulo: `allocation_auditor_package.js` (v2.0.0), Worker `assistant-package`.

## Estrutura do ZIP (`GRCON_Auditoria_Preventiva.zip`)
```
GRCON_Auditoria_Preventiva/
  01_Relatorio_Auditoria.xlsx      RESUMO + DETALHAMENTO (duas abas)
  02_LDs_Corrigidas/…              somente LDs realmente corrigidas
  03_Alocacoes_Corrigidas/…        somente cópias realmente corrigidas e verificadas
  04_Linhas_Central*.xlsx          somente se houve emissão oficial confirmada
  05_Manifesto.json
```
Nada é criado "para parecer completo": o que não foi produzido aparece em `manifest.omitted` com justificativa. Nomes de cópias: `<nome-original>_CORRIGIDA.xlsx` (hash curto apenas em colisão).

## Relatório
- **RESUMO**: contrato, identificação, data, alocações, documentos, correções executadas/autorizadas, propostas pendentes, verificações inconclusivas, documentos sem problemas, cópias de LD/alocação, fontes (com SHA-256), versões das referências, estado final e limitações.
- **DETALHAMENTO** (19 colunas pedidas): erro confirmado, verificação pendente e sugestão preventiva (precedente fiscal) têm severidades e cores distintas; erros confirmados vêm primeiro; evidência legível; filtros, congelamento, quebra de texto; proteção contra injeção de fórmula.

## Estados finais
`Pronta para conferência final e envio` · `Correção necessária antes do envio` (erro confirmado sem cópia verificada) · `Verificação complementar necessária` (pendência, exceção ou bases indisponíveis). "Pronta" nunca significa aprovação fiscal.

## Manifesto
Identificação, contrato, versões do motor/assistente/pacote, fontes e hashes, versões de bases, contagens, correções propostas/autorizadas/executadas/verificadas (com célula, regra e responsável), exceções, saídas com SHA-256 e tamanho, omissões, limitações e `numbering.consumed`. Sem tokens/segredos.

## Integração ao chat
Após a auditoria: *Gerar arquivos corrigidos* baixa o ZIP completo (relatório + cópias + manifesto) em um clique. Cada cópia oficial passa por segunda auditoria antes de entrar no pacote.

## Testes
`tests/allocation_auditor_package_phase7.cjs`: ZIP/CRC, hashes, manifesto, relatório com dados reais e contagens, separação erro/pendência/sugestão, cópia corrigida real com 16 colunas, segunda auditoria, Central, nomes inseguros/duplicados, falha parcial, três estados, 2.500 documentos (~1,3 s) e fórmulas.
**Pendente:** download real no navegador (script Playwright existente, ver Fase 9).
