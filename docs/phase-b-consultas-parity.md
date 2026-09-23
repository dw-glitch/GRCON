# FASE B — Inventário de paridade: Consultas

Base auditada: `main@ea6aa19eae622b1ab357f9b8854926154b62292c`.

## Pré-condições
- Consultas é uma ilha React/TypeScript montada em `#grcon-consultas-root`.
- Estado/orquestração: `src/react/consultas/hooks/useConsultas.ts`.
- Fronteira com legado: `src/react/consultas/services/consultasAdapter.ts`.
- Motores continuam em `core.js`, `requests_core.js`, `requests_report.js`, `allocation_center.js` e módulos auxiliares.
- `requests_app.js` permanece apenas para Modelos de exportação.
- Não há segunda UI de consulta concorrente.
- Bundle é carregado sob demanda pelo grupo `requests` do `grcon_module_loader.js`.

## Controles e entradas
- Upload múltiplo de LD (.xlsx/.xls/.xlsm), drag-and-drop, remoção individual e remoção de todas.
- Reutilização orientativa da última LD.
- Central de alocação opcional: anexar/remover Controle de Solicitações.
- Entrada de documentos por textarea, Ctrl/Cmd+Enter e leitura da área de transferência.
- Seleção individual, selecionar todos e limpar seleção.

## Ações
- Consultar todos.
- Consultar selecionados.
- Remover duplicados.
- Copiar resultados.
- Selecionar modelo de exportação.
- Exportar para Excel.
- Repetir última exportação.
- Desfazer.
- Limpar consulta.

## Filtros e ordenação
- Busca por código, título ou LD.
- Situação: Todas / Localizado / Requer validação manual / Não localizado.
- Alocação: Todas / Alocado / Não alocado / A revisar.
- Ordem: entrada / código / situação / LD.

## Dados exibidos antes da FASE B
- Situação.
- Documento informado.
- Código localizado na LD.
- Título na LD.
- Taxonomia Interna.
- Alocado?
- Última GRDT.
- Emitido pelo GRCON / eGRDT.
- Revisão emitida no SIGEM.
- Revisão na Colar SIGEM.
- Status SIGEM.
- Status da alocação na central.
- Resposta da fiscal.
- LD e quantidade de ocorrências/LDs.
- Evidências de busca com/sem `nt-`, ajuste de código, regra e validação manual.

## Estados e mensagens
- LD em leitura, válida ou com erro.
- Central ausente, válida ou com erro.
- Consulta em execução com progresso real `done/total`.
- Toasts de sucesso, aviso, informação e erro via `GrconNotify`.
- Estado vazio antes da primeira consulta.
- Resultado com Localizado / Validar / Não localizado.
- Falhas assíncronas permanecem no console; usuário recebe mensagem orientativa.

## Persistência/integrações
- Última LD e último modelo exportado.
- Modelos locais/equipe.
- Histórico GRDT/eGRDT lido pelo adapter.
- Exportação mantém `GrconRequestsReport` como fonte da estrutura Excel.

## Checklist obrigatório depois do redesign
- Nenhuma ação acima pode desaparecer.
- Nenhum filtro acima pode desaparecer funcionalmente.
- Exportação/cópia devem usar todas as linhas consultadas, não apenas as renderizadas.
- 1 documento continua correspondendo a 1 registro operacional; paginação é apenas apresentação.
- Toda evidência removida da tabela principal precisa continuar acessível no detalhe.
- Nenhuma regra documental pode ser implementada em React.
