# Higgsfield + GRCON — execução UX, mascote e comunicação

Data: 07/10/2026

## Resumo

Esta execução usou Higgsfield como camada de **prototipação e mídia**, mantendo GitHub/Cloudflare/Supabase/Workers/R2 como arquitetura do GRCON. Nenhuma regra de GRDT, LD, EAP, revisão, alocação, SIGEM, ProjectWise, Cofre ou exportação foi alterada.

A implementação no app ficou deliberadamente limitada a mudanças de baixo risco:

- labels persistentes no formulário de monitoramento;
- ajuda contextual inline **Como funciona**;
- vocabulário consistente entre Monitoramento e Notificações;
- pipeline de alpha preparado para aceitar MP4 atuais do Higgsfield;
- nenhum piloto do mascote foi ativado antes de aprovação visual.

## 1. Prototipação UX/UI no Higgsfield

Foi capturada uma referência do GRCON em 1440×900 e enviada ao Higgsfield. A partir dela foram produzidos dois conceitos 2K com Seedream 5.0 Pro.

| Conceito | Job | Objetivo | Uso |
| --- | --- | --- | --- |
| Shell/cabeçalho | `1decf422-865e-476c-956a-dd8243bb556c` | reduzir competição no header, preservar Notificações, compactar atalhos/status e manter densidade corporativa | referência, não implementação automática |
| Tabela/ajuda contextual | `4a35fbb8-acbb-48e1-a6e5-444edae58adc` | toolbar consistente, tabela densa, estados vazios/loading/error e ajuda contextual | referência, não implementação automática |

Os prompts proibiram glassmorphism, gradientes decorativos, aparência de marketing, cards excessivos e fundos extensos para ET/N-1710.

Os conceitos são **referências**, não especificações pixel-perfect. As alterações de produção continuam regidas por código, acessibilidade, QA e regras operacionais.

## 2. UX/UI implementado nesta fase

### Monitoramento da Consulta Geral

**Antes**
- código, prioridade e observação dependiam principalmente de placeholders;
- a própria área não explicava o fluxo de monitoramento;
- coexistiam os termos “Documentos prioritários”, “Central de alertas” e “Notificações”.

**Agora**
- cada campo tem label persistente;
- existe `Como funciona` dentro da própria área;
- a ajuda explica três etapas: monitorar, comparação automática, receber notificação;
- abrir a ajuda não muda de módulo;
- “MONITORAMENTO” identifica configuração e “NOTIFICAÇÕES” identifica eventos recebidos.

### O que não foi alterado

A auditoria anterior continua recomendando, em fases futuras:
- consolidar APIs de toast/dialog/erro;
- reduzir duplicação de navegação;
- compactar o cabeçalho;
- padronizar table shell;
- migrar CSS legado gradualmente.

Esses pontos não foram aplicados nesta fase por terem superfície de regressão maior.

## 3. Mascote — pilotos Higgsfield

Elemento oficial reutilizado:

- nome: `grcon-mascot`
- element id: `5d684379-9c43-47db-913a-6af9d779e8b2`
- modelo: Seedance 2.0
- câmera: estática
- áudio: desativado
- duração: 5 s
- resolução de geração: 720×720

| Estado | Job | Alpha técnico | Tamanho alpha | Aprovado | Integrado |
| --- | --- | --- | ---: | --- | --- |
| `searching-files` | `42ebdce9-4561-4b66-9177-45ddb35cd726` | VP9, 640×640, 24 fps, `alpha_mode=1` | 655.186 B | NÃO | NÃO |
| `checking-document` | `662ace1a-f95e-45af-98ad-1ee6a0239b84` | VP9, 640×640, 24 fps, `alpha_mode=1` | 595.634 B | NÃO | NÃO |

No frame técnico de 2 s, `searching-files` apresentou cerca de 75,9% da área totalmente transparente e 10,84% com alpha parcial; `checking-document`, cerca de 74,65% transparente e 10,10% com alpha parcial.

Isso prova existência de canal alpha utilizável, mas **não prova fidelidade visual**. Sem uma revisão visual humana dos vídeos completos, não é correto aprovar identidade, deformações, halo ou movimento. Por isso os aliases atuais do runtime não foram alterados.

## 4. Ajuda contextual

Implementado primeiro no fluxo de Monitoramento porque havia ganho claro sem adicionar peso de mídia.

Formato escolhido:
- `<details>` acessível;
- três passos curtos;
- sem mudança de página;
- sem vídeo carregado;
- sem nova dependência.

Para os demais fluxos prioritários — Pasta local + Cofre, Revisão 0, todas as revisões, geração de eGRDT, Histórico e Documentos Previstos — recomenda-se aplicar ajuda somente quando o texto curto não for suficiente. Vídeo não deve ser o padrão.

## 5. Análise real de UX

Não foi executada análise comportamental cena a cena porque **não existe nesta tarefa uma gravação real de uma sessão do operador usando o GRCON**. Não foram inventadas conclusões de hesitação, cliques ou trajetória de cursor.

Quando uma gravação curta real estiver disponível, a análise deve priorizar clipes de 1–3 minutos por fluxo para maior precisão.

## 6. Conceito do vídeo de apresentação

Não foi gerado um vídeo final com interface fictícia. O material de produção deve usar capturas reais do GRCON.

Storyboard recomendado, 45–60 s:

1. **Abertura — GRCON** (3–4 s): logo, nome e “Central Operacional da Qualidade”.
2. **Consulta e fontes** (6–8 s): códigos informados; pasta local opcional; fallback para Cofre.
3. **Conferência** (6–8 s): validação de código/revisão/EAP sem insinuar inspeção de conteúdo PDF.
4. **SIGEM × PW** (8–10 s): Revisão 0 e todas as revisões como visões distintas.
5. **Cofre e rastreabilidade** (6–8 s): arquivo, alocação e armazenamento.
6. **GRDT/eGRDT** (6–8 s): seleção → lotes → geração.
7. **Histórico e monitoramento** (6–8 s): rastreabilidade e notificações contextuais.
8. **Fechamento** (3–4 s): GRCON + estado operacional.

Direção visual:
- gravação real de tela;
- zoom/pan discreto;
- sem efeitos cinematográficos;
- sem UI inventada;
- texto mínimo;
- 16:9, 1080p;
- trilha opcional e discreta, nunca necessária para compreender o fluxo.

## 7. Critérios para futuras integrações do mascote

Um piloto só pode substituir um alias atual quando todos estes itens passarem:

- identidade e proporções preservadas;
- ausência de deformação;
- alpha verdadeiro;
- ausência de halo/fundo residual;
- início/fim adequados;
- loop coerente quando aplicável;
- tamanho apropriado para web;
- `prefers-reduced-motion` preservado;
- nenhum movimento cobrindo workspace;
- regressão Chromium sem erros.

A corrida horizontal continua exclusiva da análise real.

## 8. Prototipação não é produção

Nenhum código gerado pelo Higgsfield substitui o GRCON. Os protótipos servem para comparar ideias. A fonte de verdade continua sendo `dw-glitch/GRCON`.
