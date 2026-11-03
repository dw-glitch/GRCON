# GRCON — Robô Auditor Preventivo 2.0 — Fase 9: homologação técnica e preparação de publicação

**Branch:** `claude/vigilant-bardeen-p1hval` · **PR (rascunho):** dw-glitch/GRCON#373 · **Nada foi mesclado nem publicado.**

## Evidências executadas
| Verificação | Resultado |
|---|---|
| `npm ci`, `npm run typecheck`, `npm run build` | aprovados (após corrigir erro TS7006 pré-existente) |
| `npm run verify` completo (typecheck, build, sintaxe, workers, referências, versões, dependências, supabase, `npm test` com >140 suítes, vault-performance, `test:allocation-auditor`) | **código 0** |
| `test:allocation-auditor` | 25 testes de motor + 9 da Fase 5 + suítes de Worker/API/DOM/LD/banco + Fase 6 (20 verificações) + Fase 7 + Fase 8 + escala |
| Navegador real (Chromium, Workers reais, runtime oficial do mascote) `scripts/validar-allocation-assistant-browser.cjs` | aprovado: multi-alocação, 2 cópias corrigidas no ZIP baixado, pergunta qualificada, treino ADM sem JSON, fechar/reabrir, checkpoint (700 linhas)/retomada, emissão incompleta bloqueada, troca de contrato, movimento reduzido, 1280/1440 px, **0 erros de página** |
| `npm run build:cloudflare` / `verify:cloudflare` | aprovados (340 arquivos, referências íntegras) |
| Escala sintética (6.000 apontamentos históricos) | auditoria 100/500/1.000/2.500 docs em 22/43/81/275 ms (Worker, sem congelar a UI); pacote completo (relatório) 2.500 docs ≈ 8 s |

O script de navegador estava desatualizado desde a Fase 2 (não montava o Gerador, esperava textos antigos, corrida com auditoria rápida); foi ajustado — o aplicativo estava correto.

## Segurança e regressão
- Sem escrita em R2/cofre/armazenamento local pelo Auditor (teste estático); única rede é a IA opcional autenticada, sem conteúdo de arquivos. O binding R2 do Worker pertence ao cofre e não foi alterado.
- Nomes de arquivo saneados, injeção de fórmula neutralizada, ZIP verificado (CRC e SHA-256), originais nunca sobrescritos, numeração oficial não consumida.
- Demais módulos: cobertos pelas suítes de `npm test`; nenhuma refatoração fora do escopo.

## Não realizado / pendências
1. **RLS/RPCs contra banco real** e troca de contrato em ambiente autenticado (somente inspeção do SQL e suítes estáticas).
2. **Precisão (falsos positivos/negativos):** sem conjunto de referência validado e autorizado, nenhum indicador foi inventado.
3. **Homologação normativa** (N-1710, ET Rev. aplicável, EAP, Data Book, Fiscal 01) com amostras reais autorizadas.
4. Teste em produção Cloudflare autenticado; outros scripts de navegador do repositório (regressão visual de módulos não relacionados) não foram executados individualmente.
5. Nenhuma regra de correção automática homologada: correções ficam em B até o Proprietário ADM ativar regras.
6. Telemetria de memória/tempo de abertura do chat não medida.

## Estado final por fase
- Fases 0–5: implementadas; **testes executados e verdes** após 2 correções; homologação normativa pendente.
- Fase 6, 7: implementadas, testadas (unidade + navegador).
- Fase 8: implementada; segurança de banco aguardando teste real.
- Fase 9: homologação técnica concluída; homologação normativa/produção pendentes.

## Para publicar (somente com sua autorização)
Revisar o PR #373 → merge em `main` → `npm run build:cloudflare` + deploy do Worker `grcon-cloudflare` pelo fluxo existente.

## Atualização — melhorias após teste em produção (03/11/2026)
- **Relatório Excel** em linguagem objetiva (parecer, conclusão, guia das abas, colunas "Valor atual / Valor sugerido / Valor corrigido") e duas abas novas ao lado: **ALOCAÇÃO CORRIGIDA** (16 colunas oficiais, células alteradas em destaque, coluna "Alterações nesta linha", código sugerido) e **TÍTULOS DA LD** (título atual × sugerido, termos alterados, origem na LD; só existe quando há sugestão).
- **Motor 1.4.0:** (1) código com `nt-` cujo TAG consta no cadastro → remover o `nt-`; (2) código sem `nt-` com TAG fora do cadastro → sugerir `nt-` (só quando o cadastro de TAGs está carregado); (3) ortografia do título por similaridade com termos recorrentes da LD (só com ≥50 registros de LD; ignora plural/gênero; exige vizinho único e muito mais frequente), espaços e palavra repetida; (4) código digitado quase igual a um da LD (priorizando trocas O/0, I/1, S/5, B/8); (5) caminho de Data Book e Workflow parecidos com os cadastrados.
- Todas essas detecções são **sugestões a conferir** (severidade pendente), sem prova normativa, e **nunca** correção automática; mudança de código não é aplicada em arquivo.
- **Limite honesto:** a verificação ortográfica é por similaridade com a própria LD, não um dicionário completo do português; erros em palavras raras ou que não aparecem na LD não são detectados.
- Legenda flutuante do lançador: borda acompanha o texto.
