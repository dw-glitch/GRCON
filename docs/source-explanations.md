# Consulta e explicações com fontes — fase 7

O Registro Mestre oferece cinco consultas: disponibilidade das fontes,
interpretação da conferência, revisões apresentadas, arquivos/versionamento e
emissões do histórico. As respostas usam os registros da página consultada e
oferecem acesso às seções de origem. Nenhuma consulta escreve dados, altera
revisão, confirma norma, gera GRDT ou envia mensagem.

A classificação da conferência só é reproduzida quando código, contrato,
snapshot SIGEM e último envio correspondem ao resultado calculado pelo motor.
Resultado de outra base, outro contrato, outra eGRDT ou página histórica não é
tratado como confirmação atual. Ausência de base e ausência de correspondência
são estados diferentes. Histórico confirmado sem presença atual permanece
explicitamente histórico. O texto de status SIGEM não substitui a classificação.

As contagens se referem à página; fontes com mais páginas não são apresentadas
como um total. Consultar outra página atualiza somente a origem daquela fonte,
sem atribuir novos metadados às páginas de outras fontes já abertas. Arquivos
históricos mantêm seus identificadores para download exato.

O botão Consultar fontes usa regras e dados verificáveis. Explicar com IA usa
Workers AI opcionalmente, por ação explícita, com limites persistentes e fontes
verificadas no servidor. A IA não substitui o motor da Conferência. Consulte
`docs/workers-ai-sources.md` para limites, dados enviados e controle de consumo.

Testes: snapshot/último envio/contrato divergentes, paginação, fonte indisponível,
revisão física, ausência de mutação e Chromium com respostas vinculadas às fontes,
limitações, navegação de páginas e proteção contra associação errada de origens.
