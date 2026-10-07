# Auditoria UX/UI — GRCON

Data: 07/10/2026  
Escopo: shell global, Controle de GRDT, Consultas, Consulta Geral × SIGEM, Histórico, Postagem SIGEM, SIGEM × PW/evolução, Ferramentas adicionais, Cofre, administração/configurações e sistema de notificações.

## 1. Visão geral

A base atual do GRCON já possui pontos positivos importantes: tokens centrais em `design-system.css`, tabelas com wrappers de rolagem em módulos de alto volume, carregamento modular/React em áreas pesadas, shell responsivo para desktop/notebook e separação entre regras documentais e interface.

O principal problema de experiência encontrado nesta tarefa era a perda de contexto ao usar **Notificações**: uma ação global do cabeçalho enviava o usuário para Consultas. Isso foi corrigido nesta branch com uma central flutuante ancorada ao botão, sem navegação. O aviso em tempo real também foi transformado em toast transitório, mais legível e coerente com um produto corporativo.

A auditoria do restante do aplicativo não autoriza um redesign amplo automático. Os itens abaixo formam o backlog recomendado, priorizado por impacto e risco.

## 2. Implementado nesta tarefa

### Central de notificações

**Como estava**

`Notificações → Consultas → Consulta Geral × SIGEM → Central de alertas`

**Problema**

Uma ação global obrigava troca de módulo, retirava o usuário do fluxo atual e misturava consulta operacional com consumo de notificações.

**Como ficou**

`Notificações → popover ancorado no cabeçalho`

A central:
- mantém o módulo atual;
- mostra lidas e não lidas;
- possui contador sincronizado;
- permite marcar uma ou todas como lidas;
- fecha por botão, clique fora ou `Esc`;
- devolve foco ao botão ao fechar com teclado;
- possui estado vazio;
- possui rolagem interna para listas longas;
- mantém leitura individual por usuário;
- continua limitada às notificações produzidas pelos documentos monitorados.

### Toast de mudança de documento monitorado

O aviso persistente anterior foi substituído por um toast compacto que:
- informa claramente que um documento monitorado foi atualizado;
- destaca código e transição de status;
- mostra horário relativo;
- não usa aparência de erro para uma atualização normal;
- abre a central flutuante sem mudar de módulo;
- desaparece automaticamente após alguns segundos;
- não marca a notificação como lida ao desaparecer;
- respeita `prefers-reduced-motion`.

## 3. Problemas de alta prioridade

| Área | Problema | Impacto | Recomendação | Prioridade | Complexidade |
| --- | --- | --- | --- | --- | --- |
| Feedback global | Existem múltiplas implementações/fallbacks de toast, `alert()`, `confirm()` e `prompt()` em módulos diferentes. | Mensagens e confirmações têm aparência e comportamento inconsistentes; alguns erros bloqueiam a interface. | Consolidar em uma API única: toast, confirmação, diálogo e erro orientativo, mantendo detalhes técnicos apenas no console. | ALTO | Média |
| Sistema visual | O produto mantém muitas folhas CSS por geração/módulo, com tokens modernos convivendo com regras legadas e muitos fallbacks hard-coded. | Pequenas mudanças podem gerar regressões e componentes equivalentes parecem de produtos diferentes. | Migrar gradualmente componentes comuns para tokens e primitives do design system, sem reescrever regras documentais. | ALTO | Alta |
| Navegação | O HTML mantém duas superfícies para os mesmos destinos (sidebar e navegação compacta), com rótulos que já divergem: por exemplo “Gerar eGRDT” × “Controle de GRDT” e “Histórico” × “Histórico de eGRDTs”. | Aumenta custo de manutenção e risco de nomenclatura/estado ativo divergirem. | Definir uma fonte de configuração única para destinos, rótulos, ícones e permissões; renderizar as duas apresentações a partir dela. | ALTO | Média |
| Cabeçalho | RECON, Vincula, estado do app, notificações, contrato/conta e outros controles competem pelo mesmo espaço. | Em notebook/zoom o usuário recebe densidade alta e quebra de linha com muitos elementos globais. | Manter Notificações visível e agrupar atalhos secundários/estado técnico em um menu ou cluster compacto. | ALTO | Média |
| Formulários | Ainda existem formulários com explicação dependente de placeholder; o monitoramento por código é um exemplo claro. | Piora leitura, acessibilidade e recuperação do contexto após preenchimento. | Usar labels persistentes, ajuda curta e validação por campo; placeholder apenas como exemplo. | ALTO | Baixa/Média |
| Erros | Alguns módulos ainda usam `alert()` como fallback para erros técnicos. | Interrompe o fluxo e expõe linguagem pouco coerente com o restante do app. | Padronizar mensagem amigável + ação de retry quando aplicável; console mantém stack/erro bruto. | ALTO | Baixa/Média |

## 4. Melhorias de prioridade média

| Área | Problema | Impacto | Recomendação | Prioridade | Complexidade |
| --- | --- | --- | --- | --- | --- |
| Semântica de navegação | A navegação compacta usa `role="tablist"`, mas inclui um link externo de Solicitações com `role="tab"` sem controlar um painel local. | Semântica incorreta para tecnologias assistivas. | Separar links externos dos tabs ou usar navegação comum com `aria-current`. | MÉDIO | Baixa |
| Diálogos | Há dialogs modernos junto com `confirm()`/ `prompt()` nativos e dialogs criados ad hoc. | Botões, foco, dimensão e fechamento variam entre módulos. | Criar `AppDialog`/confirm reutilizável com foco, `Esc`, ação primária/secundária e tamanho padronizado. | MÉDIO | Média |
| Tabelas | Os módulos possuem várias implementações próprias de tabela, sticky header, filtros e wrappers. | A experiência muda entre Conferência, Histórico, SIGEM × PW, Evolução, Cofre e Solicitações. | Criar contrato visual comum para cabeçalho, filtros, truncamento, tooltip, densidade, scroll e estados vazios. | MÉDIO | Alta |
| Estados vazios | Nem todas as áreas explicam por que não há dados ou qual é a próxima ação. | Usuário pode interpretar “vazio” como falha de carregamento. | Padronizar `empty-state` com título, causa e próxima ação quando houver. | MÉDIO | Baixa |
| Loading/performance percebida | Módulos modernos possuem lazy loading e debounce, mas o padrão de loading ainda é desigual entre legado e React. | Algumas ações parecem travadas mesmo quando estão trabalhando. | Padronizar skeleton/progresso contextual e evitar loaders globais para operações locais. | MÉDIO | Média |
| Microcopy | “Central de alertas”, “Notificações”, “Prioritários” e “Monitorados” coexistem para conceitos próximos. | Aumenta carga cognitiva. | Adotar vocabulário: **Monitoramento** = configuração; **Notificações** = eventos recebidos; **Alerta** apenas para severidade. | MÉDIO | Baixa |
| Ações por linha | Várias tabelas concentram múltiplas ações textuais na mesma linha. | Densidade e risco de clique acidental crescem em telas menores. | Manter 1–2 ações primárias visíveis e agrupar secundárias em menu contextual quando houver excesso. | MÉDIO | Média |

## 5. Refinamentos visuais

### Consistência de componentes

O `design-system.css` já define tokens de superfície, borda, tipografia, estados e foco. O ganho maior não virá de criar mais estilos, mas de reduzir variações paralelas.

Recomendações:
- uma família de botão primário/secundário/texto/destrutivo;
- uma família de badge/pill;
- um padrão de card;
- um padrão de toolbar/filtros;
- um padrão de dialog/popover;
- um padrão de toast;
- um padrão de estado vazio;
- um padrão de table shell.

### Cores

Manter a decisão de **não usar fundos coloridos extensos para ET e N-1710**. Quando a classificação precisar ser visível, usar texto, badge discreto, ícone ou marcador lateral, sem transformar áreas inteiras em blocos de cor.

Cores semânticas devem ser reservadas principalmente para:
- sucesso;
- informação;
- aviso;
- erro/perigo;
- foco/seleção.

## 6. Responsividade desktop/notebook

O GRCON é desktop-first. A auditoria não recomenda investir em uma versão mobile completa neste momento.

A validação da presente tarefa cobre 1920×920, 1440×760, 1366×615, 1280×600, 1092×492, 1024×568, 800×600, 600×600 e 390×844 para evitar regressões do shell. Para o uso real, a prioridade deve permanecer em desktop e notebook.

Pontos a preservar:
- header nunca cortado;
- sem overflow horizontal da página;
- workspace com rolagem própria em desktop;
- tabelas com rolagem interna quando necessário;
- popovers dentro da viewport;
- dialogs limitados pela altura real disponível.

## 7. Acessibilidade

Prioridades:
1. labels persistentes em campos;
2. remover tab semantics de links externos;
3. consolidar foco/retorno de foco em dialogs e popovers;
4. garantir foco visível em componentes legados;
5. não depender somente de cor;
6. padronizar `aria-live` de status sem gerar excesso de anúncios.

A nova central de notificações já aplica `aria-haspopup`, `aria-expanded`, role de diálogo não modal, `Esc`, retorno de foco e ação textual além do indicador visual.

## 8. Performance percebida

Pontos positivos existentes:
- módulos React carregados sob demanda;
- paginação em bases grandes;
- debounce e workers em áreas de SIGEM × PW;
- fallback de notificações limitado a 15 s, sem polling agressivo;
- tabelas com scroll interno.

Melhorias recomendadas:
- medir abertura de cada módulo e tempo de primeira interação;
- evitar repetir carregamentos de bases já válidas;
- unificar cache de metadados compartilhados;
- usar skeleton apenas em blocos que realmente aguardam dados;
- evitar “flicker” em operações abaixo de aproximadamente 200 ms;
- manter exportações/processamentos pesados fora do thread principal quando possível.

## 9. Fluxos que podem ser simplificados

### Notificações — corrigido

Antes: cabeçalho → Consultas → subárea → notificações.  
Agora: cabeçalho → central flutuante.

### Administração/configurações

Revisar itens técnicos pouco usados no dia a dia. Diagnóstico, armazenamento e manutenção devem continuar disponíveis, mas não competir visualmente com ações operacionais.

### Consultas

Separar com clareza:
- consulta documental;
- modelos de exportação;
- monitoramento da Consulta Geral.

O usuário não deve precisar conhecer a implementação interna para encontrar uma função.

### Ferramentas adicionais

Manter somente ferramentas realmente auxiliares. Evitar nomes históricos/obsoletos nas descrições e impedir que recursos que se tornaram parte do fluxo principal permaneçam duplicados aqui.

## 10. Componentes que devem ser padronizados

1. `AppToast`
2. `AppDialog`
3. `AppPopover`
4. `AppEmptyState`
5. `AppDataTableShell`
6. `AppToolbar`
7. `AppStatusBadge`
8. `AppField`
9. `AppErrorState`
10. configuração única de navegação

Isso deve ocorrer por migração incremental. Não substituir todos os módulos ao mesmo tempo.

## 11. Melhorias recomendadas por módulo

### Controle de GRDT
- preservar foco na tarefa principal;
- reduzir explicações repetidas após o usuário já ter carregado as fontes;
- manter feedback claro durante análise, Cofre e geração;
- ações destrutivas/limpeza não devem competir com “Gerar”.

### Consultas
- tornar a diferença entre consulta documental, monitoramento e modelos mais explícita;
- padronizar filtros e estados vazios;
- não usar Consultas como destino de funções globais do shell.

### Histórico
- preservar sticky header e scroll interno;
- consolidar ações secundárias por registro;
- padronizar drawer/dialog de detalhes e exportação.

### Postagem SIGEM
- remover fallback visual de `alert()`;
- deixar estado da postagem e próxima ação sempre visíveis;
- mensagens técnicas ficam no console.

### SIGEM × PW / Evolução
- preservar a separação entre revisão 0 e todas as revisões;
- manter ET/N-1710 visualmente identificáveis sem fundos extensos;
- reutilizar padrões de filtro, exportação, histórico de bases e estados de carregamento.

### Cofre
- manter armazenamento, quantidade de arquivos e alocação como informações de rastreabilidade;
- diferenciar ação de localizar, selecionar e excluir;
- confirmações destrutivas devem usar dialog padrão.

### Configurações/Administração
- priorizar opções de uso frequente;
- agrupar diagnóstico e manutenção como avançado;
- padronizar confirmações e mensagens.

## 12. Plano de evolução por fases

### Fase 0 — concluída nesta tarefa
- central flutuante de notificações;
- toast profissional;
- leitura individual/em lote;
- acessibilidade e responsividade;
- testes de realtime, polling, isolamento e viewport.

### Fase 1 — feedback e componentes compartilhados
Impacto alto, risco baixo/médio.
- unificar toast;
- substituir `alert()` de fallback;
- criar confirmação/dialog compartilhado;
- consolidar estados vazio/erro/loading.

### Fase 2 — shell e arquitetura da informação
Impacto alto, risco médio.
- fonte única para navegação;
- revisar densidade do cabeçalho;
- separar corretamente links externos de tabs;
- uniformizar nomes dos módulos.

### Fase 3 — formulários, tabelas e acessibilidade
Impacto médio/alto, risco médio.
- labels persistentes;
- validação por campo;
- table shell comum;
- menus de ações;
- foco e ARIA de dialogs.

### Fase 4 — performance percebida e redução de legado
Impacto médio, risco médio/alto.
- medir módulos lentos;
- reduzir CSS duplicado;
- migrar regras visuais legadas para tokens;
- eliminar listeners/timers redundantes;
- revisar rerenders e carregamentos repetidos.

## 13. Critério para as próximas alterações

Uma mudança de UX/UI só deve entrar quando resolver ao menos um destes problemas:
- perda de contexto;
- excesso de cliques;
- falta de feedback;
- inconsistência;
- dificuldade de leitura;
- acessibilidade;
- responsividade;
- performance percebida.

Mudanças puramente decorativas não devem ter prioridade sobre estabilidade operacional.
