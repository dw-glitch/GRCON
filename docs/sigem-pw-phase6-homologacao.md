# SIGEM × PW — Fase 6: homologação funcional e visual

**Escopo:** continuidade da issue #353; depende das PRs #357 (regras), #359 (visão gerencial), #361 (dados PW) e #362 (Excel do coordenador). Esta fase é uma **PR empilhada**, não uma atualização de produção.

## Matriz de evidências

| Critério de aceite | Verificação automatizada | Estado |
|---|---|---|
| Gerência com seis KPIs, filtro interativo por documento único | `scripts/validar-owner-shared-sigem-browser.cjs` clica no cartão e verifica `aria-pressed` e apenas 25 linhas na página | Automatizado; aguarda CI da PR |
| Desktop e celular (painel) | Capturas sintéticas em `artifacts/owner-shared-sigem/phase6-manager-{desktop,mobile}.png` | Capturas CI; inspeção visual humana ainda necessária |
| Listas técnicas sem controles inacessíveis | O QA abre intencionalmente a área avançada; botão de situação deve abrir a lista correspondente | Automatizado; aguarda CI |
| Importar, cancelar, retomar e restaurar filtros após recarga | `scripts/validar-import-backup-browser.cjs` abre a seção antiga antes de testar filtros | Automatizado; aguarda CI |
| Igualdade de indicadores em tela e Excel | `tests/sigem_pw_phase6_homologation.cjs` utiliza o mesmo reconciliador, verifica seis totais e universo por código | Automatizado; aguarda CI |
| Escala comparável ao modelo do coordenador | Fixture **6.041** documentos + **29.421** linhas PW + **70** colunas; valida plano, fonte completa, fórmulas e integridade | Teste de planejamento em escala, não teste de XLSX completo de 2 milhões de células |
| Excel real abre e preserva fórmulas, dados e layout | `tests/sigem_pw_coordinator_workbook_phase5.cjs` cria e reabre XLSX com ExcelJS | Automatizado na Fase 5 |
| PW de empresas distintas da coluna C | Registro de empresa ABC permanece na aba fonte, excluído das contagens CSG/QTM | Automatizado |
| Aplicação de comentários e status SIGEM por revisão | `tests/sigem_pw_managerial_phase1.mjs` e o novo volume sintético | Automatizado |
| Sem novo armazenamento corporativo externo | Nenhuma gravação ao Cloudflare R2, Supabase, Neon ou Turso foi incluída nesta fase | Inspeção do diff |

## Critérios bloqueantes para produção (ainda pendentes)

1. **Modelo original do coordenador:** não há cópia disponível nesta execução do arquivo `LD x PW 2.xlsx`. É necessário comparar células, cabeçalhos, fórmulas F:I e as 12 variantes históricas de AÇÃO contra o arquivo autorizado. Não declarar identidade exata antes dessa comparação.
2. **Excel corporativo + grande volume:** teste ponta a ponta em navegador e Excel com aproximadamente 29,4 mil linhas × 70 colunas (emissão, tempo, memória e abertura). O teste de volume desta PR valida o **plano dos dados**, não a gravação integral de 2 milhões de células em `.xlsx`.
3. **Permissões corporativas:** conferir se os 70 atributos PW podem ser armazenados e compartilhados para o contrato atual; nenhuma homologação de privacidade foi presumida.
4. **Acessibilidade/visual:** capturas de tela desktop e celular são evidência auxiliar, não substituem revisão humana de contraste, navegação por teclado e legibilidade da tabela.
5. **PRs empilhadas:** revisar integrações e bases corretas antes da fusão. Vercel/Cloudflare em preview não equivalem a publicação de produção.

## Execução e artefatos

```bash
npm run test:sigem-pw-phase6
npm run test:sigem-pw-coordinator
npm run test:sigem-pw-pw-fidelity
npm run test:sigem-pw-managerial
npm run typecheck
npm run build
```

O workflow `QA — Administração e datas SIGEM integradas` gera duas capturas sintéticas quando bem-sucedido; o workflow `SIGEM × PW — Evolução React hardening` também executa `validar-import-backup-browser.cjs`. Todas as verificações usam dados de teste, não capturam credenciais nem publicam bases reais.
