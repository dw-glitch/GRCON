# PR E — N-381 / Adicionar Capa e Conferência

Baseline: main `566478b`, GRCON 5.44.6. Entrega: 5.44.7.

## Fonte e decisões

Fonte primária: PDF fornecido N-0381 revisão M, maio/2022, errata junho/2022. Foram relidos o escopo (§1.3–1.6), a legenda (§3.5.1–3.5.4), os campos e as exceções; a revisão coincide com o inventário confirmado da fase 0. O catálogo de março/2025 é a referência da base, não uma promessa de verificação contínua de vigência.

| Regra | Fonte | Decisão |
|---|---|---|
| Número/revisão inequívocos no PDF × destino escolhido | Concordância operacional GRCON, campos 15/16 da N-381 | BLOQUEIO em página preservada |
| Revisão diferente na primeira capa que será substituída | Operação de substituir capa | ALERTA, permite corrigir a capa |
| Revisão por folha explicitamente declarada | Exceção contextual do controle documental | Divergência de revisão vira ALERTA; número continua conferido |
| Execução/verificação/aprovação/data preenchidas | §3.5.4 campos 8/9/10/13 | BLOQUEIO somente com aplicabilidade confirmada e fonte promovível |
| Execução diferente de verificação | §3.5.4 campos 8–9, nota 2 | Mesmo guard de escopo/fonte |
| Título/categoria/data/finalidade/responsáveis/projeto/classificação/formato | §3.5.4 | Comparação quando ambos os valores existem; divergência é ALERTA |
| Total de folhas e dimensões mínimas A4 | §3.5.4 campo 14; §3.1 | ALERTA; não inferir numeração física absoluta nem rejeitar formato composto |
| Texto ausente, legenda ambígua, campo indisponível ou extração parcial | Evidência técnica insuficiente | Inconclusivo/ALERTA; nunca BLOQUEIO inferido |

Revisões antigas de LD, Consulta Geral e Histórico são referências auditáveis. Não substituem a revisão manual de destino. O operador pode escolher explicitamente uma referência na Conferência. Uma diferença histórica A→B não é, por si só, erro.

## Implementação

- `n381_concordance.js`: extração conservadora de rótulos, regras centralizadas e snapshots pelo motor normativo existente. `source.kind=operational` distingue concordância interna de obrigação normativa; cada resultado informa campo, página, norma, seção, revisão, fonte, encontrado, esperado e correção.
- PDF.js 4.10.38, fixado no lockfile, e worker do mesmo pacote. Parser/worker locais; nenhum PDF é enviado a serviço externo. `isEvalSupported=false`, recuperação de erro conservadora e descarte do documento/worker ao concluir.
- Leitor carregado somente no anexo de PDF ou por solicitação na Conferência. Não é executado no lote normal da análise de GRDT.
- Adicionar Capa: escopo não confirmado por padrão, revisão exclusivamente manual, comparação da capa desejada com páginas preservadas; revalidação imediatamente antes da geração. Preserva a contracapa real e os fluxos PDF/DOCX anteriores.
- Conferência: painel sob demanda, referência explícita de Consulta Geral ou arquivo registrado em GRDT/Histórico. Relatório JSON com evidências e snapshot. Fontes são atualizadas ao atualizar a base, sem remontar o formulário.
- Histórico local da capa recebe snapshot compacto (regras, normas, contagens, alertas, bloqueios, fontes, contexto e versão). Registros antigos não são recalculados. Falha de armazenamento é comunicada; relatório pode ser baixado.
- Service Worker conserva parser, worker e regras para uso offline após instalação/cache. Build Vite e pacote Cloudflare incluem todos os recursos. Verificações em páginas de 50 resultados, priorizando bloqueios.

## Limites explícitos

- Até 40 MB, 200 páginas e 45 segundos por extração. O resultado informa extração parcial/indisponível, sem declarar conformidade total.
- Não há OCR. Texto extraído não certifica assinatura, desenho, todos os quadros de legenda ou conformidade visual com as figuras do Anexo A.
- Campos sem rótulo inequívoco ou com vários valores não são deduzidos do nome do arquivo, do corpo do texto ou da tabela de revisões. Layouts ainda não reconhecidos exigem revisão manual.
- A preservação dos dados da emissão original (§3.5.4 campos 22–25) não é certificada pela geração de nova capa. Em revisões diferentes de 0, há alerta específico para conferir o histórico de datas e responsáveis; dados históricos não são reconstruídos por inferência.
- Projeto/classificação sem evidência permanecem inconclusivos; respeita a alternativa de classificação via AIP prevista na fonte. O template operacional existente não recebe campos inventados nem novo projeto/classificação por inferência.
- DOCX conserva a geração editável; conferência interna de legenda limita-se ao PDF textual. Contagem Word continua baseada em metadado/operador.
- A Conferência informa bloqueios do confronto PDF × destino; não altera situação de postagem SIGEM, não muda registros históricos nem reenvia GRDTs.
- A aplicabilidade confirmada e a declaração de revisão por folha ficam no snapshot. Governança central de contratos, permissões e exceções formais permanece nos PRs F/G/H.

## Validação reproduzível

`node tests/n381_concordance.cjs`: concordância/divergência, escopo, capa substituída, revisão por folha, número errado, ambiguidade, PDF sem texto, limite parcial, responsáveis, histórico e revisão normativa diferente.

`node scripts/validar-n381-browser.cjs`: PDF real com texto, worker real, divergência bloqueada, revisão por folha, PDF sem texto e painel da Conferência. `scripts/validar-cover-document-browser.cjs` continua cobrindo geração real, capa/contracapa, Word, revisão manual, navegação e offline.

Checks obrigatórios: `npm run verify`, Chromium, `npm run build:cloudflare` e `npm run verify:cloudflare`. CI integra ambos os scripts Chromium na entrega de Capa.

Próxima fase do plano: PR F — matriz disciplinar / ReconDocs, usando os PDFs de cada disciplina como fontes e mantendo LD/SCON/escopo como autoridades contratuais.
