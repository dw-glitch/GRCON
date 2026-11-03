# GRCON — Robô Auditor Preventivo 2.0
## Fase 0: diagnóstico, isolamento e linha de base (2026-11-03)

**Repositório:** `dw-glitch/GRCON`  
**Branch isolada:** `feat/auditor-preventivo-fase0-20261103`  
**Base da branch:** `main` em `4fb07f763eefb7f4f6da0182ebf8059440f16d06`  
**Método:** inspeção dos arquivos do repositório via GitHub e comparação `main...branch`; sem modificação da produção, sem Actions disparadas e sem acesso a documentos corporativos.

### 1. Missão funcional confirmada

O robô executará **auditoria preventiva antes do envio à fiscalização**. Ele deverá aceitar alocações externas produzidas fora do Gerador e alocações feitas dentro do GRCON. Os comentários anteriores da Fiscal 01 são precedentes históricos de aprendizagem e comparação, **não** a origem operacional principal dos arquivos a auditar. O robô não é uma ferramenta de processamento de alocações devolvidas pela fiscalização.

Interface-alvo: **Gerador de Alocação único**, com o **mascote oficial flutuante** e um chat lateral não bloqueante. Não criar módulo independente. A importação deve iniciar a análise após validação, permitindo complementar as LDs e continuar a conversa. Não emitir novo número oficial ao simplesmente revisar alocação externa.

### 2. Inventário por dependência

| Camada | Arquivos/elementos identificados | Preservar/adaptar |
| --- | --- | --- |
| Gerador e entrada | `src/react/allocation/AllocationApp.tsx`, `src/react/allocation/index.tsx`, `src/react/allocation/service.ts` | Preservar Gerador e seus exportadores; montar o assistente dentro do Gerador |
| UI atual do Auditor | `src/react/allocation-auditor/AllocationAuditorApp.tsx`, `AllocationAssistant.tsx`, `index.tsx`, `allocation-auditor.css` | Migrar chat; retirar tela operacional separada apenas após substituir seu bootstrap |
| Estado conversacional | `src/react/allocation-auditor/assistantStore.ts` | Preservar sessões e comandos; automatizar início da auditoria após upload |
| Serviço, RPC e persistência | `src/react/allocation-auditor/service.ts`, RPCs `grcon_allocation_auditor` e `grcon_allocation_assistant` | Preservar autenticação e isolamento de contrato; desacoplar serviço da interface separada |
| Motor de regras | `allocation_auditor_core.js`, `allocation_auditor_assistant.js` | Manter rastreabilidade, evidências e precedentes |
| Worker / planilhas | `workers/allocation-auditor.worker.js`, `workers/allocation.worker.js`, `allocation_auditor_revision.js`, `allocation_ld_export.js`, `allocation_auditor_package.js` | Preservar verificações de XLSX/OOXML/ZIP, hashes e modelos oficiais |
| IA opcional | `cloudflare/allocation-audit-ai.mjs`, rota autenticada do Worker | Não permitir que a IA invente prova normativa ou bloqueie a auditoria determinística |
| Mascote | `grcon_mascot_controller_v4.js`, `docs/mascote-video.md`, runtime `GrconMascot` | Reusar instância e vídeos oficiais; sem mascote genérico |
| Navegação/build | `index.html`, `grcon_module_loader.js`, `vite.config.ts`, `package.json` | Retirar cartão independente e adaptar lazy-loading sem quebrar os bundles |
| Dados/permissões | `supabase/migrations/20261028192535_allocation_assistant_sessions_rules.sql`, `20261030010508_allocation_assistant_release_safety.sql`, habilitação `allocationAuditAssistant` | Não alterar RLS nem executar migração destrutiva; preservar histórico |
| Configuração | `contract_admin_app.js`, módulo Proprietário ADM | Habilitação controlada no contrato, sem expor dados entre contratos |

### 3. Desvios comprovados por leitura de código

1. **Módulo ainda duplicado:** `index.html` contém cartão `data-grcon-view="allocation-auditor"` e painel próprio; `grcon_module_loader.js` mantém rota e carregamento separados.
2. **Acesso não flutuante:** o `AllocationApp.tsx` apresenta um botão `Auditar com o Robô`/`Auditar Alocação`; não há um acionador permanente do mascote dentro do Gerador.
3. **Chat modal bloqueante:** `AllocationAssistant.tsx` usa portal para `document.body`, `role="dialog"` com `aria-modal="true"` e CSS `.aac-backdrop` em tela inteira. Deve virar painel contextual lateral não modal.
4. **Upload sem execução automática:** `assistantStore.ts` aceita anexos, mas pede nova instrução para começar a conferência.
5. **Suporte externo restritivo:** `service.importMany` aceita até 20 arquivos, mas o caminho automático só escolhe aba identificada inequivocamente como `official-16`; outros layouts exigem alternativa. Não prometer suporte universal sem validador de mapeamento.
6. **Risco de perda de estado ao adicionar LD:** `importAssistantLd` chama `importLd`; a implementação de `importLd` faz `clearResults()`. Existe uma recuperação para `checkpoint`, mas é necessário testar e corrigir anexação normal de LD após alocação.
7. **Revisão x emissão misturadas na UI:** o chat expõe `Nova alocação e linhas da Central`; esta ação utiliza numeração oficial e deve ser segregada da auditoria preventiva/correção de arquivo externo.
8. **Recurso condicionado ao contrato:** o Gerador decide entre robô e auditor clássico por `allocationAuditAssistant`; planejar controle/ativação sem rotas vazias e sem afetar outros contratos.
9. **Documentação e realidade de release exigem reconciliação:** `docs/allocation-assistant-2-implementation.md` descreve PR #343 como rascunho sem publicação na data da escrita; arquivos do assistente já estão na `main`. A existência dos arquivos não prova deploy autenticado da experiência atual.

### 4. Guardrails do domínio

- Entrada de alocação: **antes da fiscalização**. Histórico de apontamentos fiscais: **fonte de precedentes**, sem inferir regras normativas gerais automaticamente.
- Evitar falsos positivos sobre EAP parcial; múltiplas opções do mesmo código EAP exigem disciplina/Workflow e evidência.
- Preservar identidade `contrato + alocação + documento + revisão + ocorrência + origem + hash`.
- Corrigir em cópias das LDs de origem (quando requerido); não reescrever Central compartilhada, comentários fiscais ou arquivos originais.
- Separar três operações: **auditar**, **gerar cópias revisadas**, **emitir nova alocação com numeração oficial**. A terceira só ocorre por intenção explícita e autorização.
- PDFs/planilhas corporativos não devem ser guardados no R2; arquivo binário permanece no navegador, salvo alternativa autorizada.
- Sem regras automáticas corporativas novas sem homologação e autorização do Proprietário ADM.
- Retorno `pronta para conferência final e envio` deve especificar os limites de cobertura e nunca equivaler a aprovação fiscal.

### 5. Linha de base e resultados verificados nesta fase

| Verificação | Evidência nesta execução | Estado |
| --- | --- | --- |
| Acesso ao repositório GitHub | Leitura dos arquivos de referência via conector | Confirmado |
| Isolamento de trabalho | Branch `feat/auditor-preventivo-fase0-20261103` criada da `main` | Confirmado |
| Mesma base inicial | Comparação de branches retornou `identical`, 0 commits à frente/atrás; commit `4fb07f7...` | Confirmado |
| Estado combinado do commit base | Um contexto `Vercel – grcon` com status `success`; **não comprova build do Auditor nem deploy Cloudflare** | Evidência limitada |
| Histórico de validação anterior | `docs/allocation-assistant-2-validation.json` informa ensaios realizados em 29/10, inclusive 48 documentos reais em dois arquivos, 5 LDs, 15.441 linhas de histórico; **nenhuma correção automática homologada** | Evidência histórica, não novo teste |
| `npm run typecheck` e `npm run build` | Não executados nesta sessão (checkout completo/instalação indisponíveis no ambiente de execução conectado) | **Pendente** |
| `npm run test:allocation-auditor` e `npm run verify` | Não executados nesta sessão; nenhum GitHub Actions novo foi disparado | **Pendente** |
| Teste autenticado na produção Cloudflare | Não executado nesta fase | Pendente para homologação |
| Modificações na produção e bancos | Nenhuma realizada | Preservado |

**Importante:** a existência de CI histórico ou status Vercel de integração não autoriza declarar a branch testada. Não disparar workflows pagos automaticamente para suprir essa lacuna.

### 6. Regressões a proteger

- Gerador: importação LD, seleção de documentos, histórico e exportação modelo oficial de 16 colunas.
- Auditor: lote de arquivos externos, múltiplas origens, comparação de documentos/revisões e criticidade dos achados.
- Writer: SHA-256, verificação de valor anterior, fórmulas/células mescladas, preservação OOXML e integridade ZIP.
- Sessões: pausa, retomada e isolamento conta/contrato.
- Mascote: instância única, vídeos oficiais, sem animação fora de ações reais e respeitando movimento reduzido.
- Infra: carregamento lazy, autorização/RLS, Workers AI opcional, sem armazenamento R2.
- Navegação: links antigos redirecionados ao Gerador sem tela em branco, sem afetar outros módulos.

**Comandos de referência ao obter checkout completo e dependências:**
```bash
npm ci
npm run typecheck
npm run build
npm run test:allocation-auditor
npm run verify
```
Os testes de navegador `scripts/validar-allocation-assistant-browser.cjs` e `scripts/validar-allocation-publication-browser.cjs` complementam essa bateria. Executá-los só em ambiente autorizado, sem enviar arquivos corporativos para repositório ou serviços não aprovados.

### 7. Liberação para a Fase 1

O diagnóstico está documentado; a branch está isolada e há um mapa dos riscos. **A bateria executável de baseline permanece pendente** e deve ser rodada em ambiente com o projeto completo antes de mudanças de comportamento. A Fase 1 deve migrar o bootstrap do chat para o Gerador sem apagar o serviço nem tabelas. Depois, remover cartão/rota visível separados, manter redirecionamento legível e comprovar que o acesso ao motor permanece operacional.

Não realizar merge na `main`, deploy Cloudflare, publicação de arquivos corporativos, exclusão de tabelas, alteração de RLS ou consumo de numeração oficial nesta fase.
