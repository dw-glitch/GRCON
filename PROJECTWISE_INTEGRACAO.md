# GRCON — Integração SIGEM × ProjectWise

## Estado desta entrega

A primeira entrega funcional é **somente leitura** e implementa a **Conferência SIGEM × ProjectWise**. Nenhum upload, alteração de metadados, criação de versão ou autenticação ProjectWise é executado por esta versão.

Essa restrição é intencional: o repositório GRCON não contém endpoint ProjectWise, cadastro de aplicação Bentley, token corporativo, conta de serviço ou autorização de escrita. O GRCON não deve inferir esses dados nem contornar SSO/MFA.

## Método de integração recomendado

Ordem de preferência para o ambiente corporativo:

1. **Bentley Web Services Gateway (WSG REST API)**, quando o datasource corporativo estiver publicado no WSG e o acesso estiver autorizado. É a alternativa preferida para integração HTTP modular e permite descobrir em runtime os schemas/classes reais do datasource.
2. **ProjectWise SDK**, principalmente se a empresa exigir integração local/Windows, serviço ou cliente acoplado ao ProjectWise Explorer. O SDK é oficial, mas exige BDN e desenvolvimento C/C++/Windows.
3. **iTwin Platform / Storage API**, apenas se for confirmado que o repositório utilizado pela operação é realmente o armazenamento iTwin correspondente. Não deve ser tratado como substituto automático de um datasource ProjectWise Design Integration.
4. **PowerShell Bentley**, útil para automação administrativa/operacional quando homologado pela empresa, porém com suporte contratual inferior ao SDK/WSG.
5. **RPA de interface**, somente se a organização confirmar que nenhuma API/SDK suportada é utilizável.

Não usar integração por SQL direto no ProjectWise.

## O que precisa ser confirmado pela TI / administração ProjectWise

Para WSG:
- FQDN/URL oficial do WSG do ambiente;
- versão do ProjectWise Integration Server e do plugin ProjectWise para WSG;
- repository/datasource autorizado;
- método corporativo de autenticação/OIDC/SSO;
- CORS/origins permitidos, se houver chamada web;
- classes e propriedades reais de `PW_WSG` e schemas dinâmicos;
- permissões de leitura, criação de documento, criação de versão, atualização de atributos e acesso a arquivos;
- regra corporativa de pasta, environment, workflow/state e versionamento.

Para iTwin, caso aplicável:
- `iTwinId`;
- aplicação Bentley registrada;
- `client_id` e segredo mantidos exclusivamente em backend seguro;
- `storage_read` para leitura;
- `storage_write` apenas quando a fase de escrita for aprovada;
- inclusão da service application no projeto/Access Control.

Para SDK:
- acesso BDN/download do SDK compatível com a versão instalada;
- máquina/serviço Windows homologado;
- identidade autorizada para o datasource.

## Arquitetura proposta

```text
Consulta Geral SIGEM
        |
        v
projectwise_inventory_core
        |
        +----> TriagemCore (identidade documental central do GRCON)
        |
Inventário/Adapter ProjectWise
        |
        v
projectwise_reconciliation_core
        |
        +----> Dashboard / pesquisa em lote
        +----> Fila lógica
        +----> Dry Run
        +----> Excel
        +----> Persistência local de snapshot
        |
        v
[FASE FUTURA, BLOQUEADA]
Backend/Bridge autorizado
        |
        +----> WSG REST / SDK / iTwin quando confirmado
        |
        v
Pré-validação -> escrita -> reconsulta -> confirmação -> auditoria
```

A autenticação com segredo jamais deve ser implementada no JavaScript estático do GRCON. Se a integração escolhida exigir client secret/conta de serviço, ela deve ficar em backend corporativo ou função server-side autorizada.

## Regras de identidade reutilizadas do GRCON

O módulo usa o `TriagemCore` existente, evitando criar outro algoritmo de associação.

- EAP com quatro grupos é parte da identidade dos documentos ET;
- mesmo TAG em EAP diferente não é o mesmo documento;
- tipos diferentes (ex.: REP e RUFF) nunca são misturados;
- ET utiliza as chaves oficiais do GRCON para variações com/sem `nt-`;
- N-1710 preserva sua regra própria, sem aplicar `nt-`;
- o valor literal das fontes é preservado para exibição/relatório;
- normalização serve apenas para comparação interna.

## Modelo de dados da conciliação

### SIGEM
- documento, revisão, status, título;
- disciplina, área, EAP, TAG e tipo documental;
- empreendimento/unidade e taxonomia;
- arquivo, quando a fonte realmente o informar;
- destino esperado, quando a fonte realmente o informar.

### ProjectWise
- Document Number / código PW;
- Revision/Version;
- ID/GUID;
- código SIGEM/LD explícito, quando existir mapeamento;
- Description/Title e FileName;
- FolderPath;
- Discipline, Area, EAP/WBS, TAG e Document Type;
- Project/Unit, Taxonomy, Environment, Workflow State;
- UpdateTime/FileSize.

Os nomes acima são aliases de importação, não uma afirmação de que sejam os nomes do ambiente corporativo. O schema real deverá ser descoberto no ambiente autorizado.

## Classificações atuais

- `MESMA_REVISAO`
- `REVISAO_PROJECTWISE_DESATUALIZADA`
- `PROJECTWISE_COM_REVISAO_SUPERIOR`
- `NAO_ENCONTRADO_PROJECTWISE`
- `POSSIVEL_DUPLICIDADE`
- `ASSOCIACAO_DUVIDOSA`
- `CODIFICACAO_IRREGULAR`

Ações lógicas: nenhuma, nova postagem, nova revisão ou validação humana.

## Proteções de escrita

Mesmo que um documento seja documentalmente apto, a escrita só poderá ser marcada como pronta quando, no mínimo:

1. arquivo físico correto estiver associado;
2. destino ProjectWise estiver determinado;
3. integração oficial estiver autorizada;
4. permissões de escrita estiverem confirmadas;
5. pré-validação imediatamente anterior ao upload tiver sido executada;
6. não houver duplicidade, revisão superior ou ambiguidade.

Nesta entrega `liveWriteEnabled=false` é deliberado, portanto nenhum item é executável no ProjectWise.

## Estratégia futura de upload

Quando o adapter oficial estiver confirmado:

1. resolver identidade e revisão;
2. localizar arquivo e calcular integridade/hash quando permitido;
3. resolver pasta/environment;
4. mapear metadados usando configuração do ambiente;
5. gerar Dry Run;
6. adquirir autorização de escrita;
7. **reconsultar ProjectWise imediatamente antes da escrita**;
8. criar documento ou nova versão conforme regra real do datasource;
9. preencher atributos;
10. reconsultar pelo ID retornado;
11. confirmar revisão, arquivo, atributos e pasta;
12. somente então marcar `POSTAGEM_PROJECTWISE_CONCLUIDA`;
13. persistir auditoria e resultado.

## Fases

1. **Descoberta** — identificar versão, WSG/SDK/iTwin e autenticação.
2. **Somente leitura** — concluída nesta entrega via inventário exportado.
3. **Conciliação** — implementada no módulo.
4. **Dashboard/pesquisa em lote** — implementados.
5. **Dry Run** — implementado, sempre sem escrita nesta fase.
6. **Piloto** — depende do adapter oficial e das permissões.
7. **Postagem em lote** — depende do piloto, fila durável server-side e auditoria.
8. **Rotina recorrente** — atualização diária da Consulta Geral e reprocessamento incremental.

## Riscos principais

- versão/arquitetura do ProjectWise corporativo ainda desconhecida;
- WSG pode não estar instalado/publicado ou pode exigir configuração CORS;
- metadados e environments são específicos do datasource;
- revisão no ProjectWise pode representar `Version` de forma diferente da revisão documental SIGEM;
- código PW pode ser uma taxonomia diferente do código SIGEM; nesses casos exige mapeamento explícito;
- browser não é local adequado para guardar segredos nem para uma fila de escrita crítica;
- arquivo físico pode estar em origem não acessível ao servidor da integração;
- regras de workflow/estado podem impedir atualização mesmo com permissão de documento.

## Critério para liberar escrita

Não alterar `liveWriteEnabled` para `true` apenas por configuração de interface. A liberação deve ocorrer somente quando existir um adapter oficial com testes de integração, autenticação server-side autorizada, permissões mínimas documentadas, pré-validação, idempotência e confirmação pós-postagem.
