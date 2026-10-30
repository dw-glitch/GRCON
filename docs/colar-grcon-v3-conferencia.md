# Colar GRCON v3 e Controle de Solicitações

A exportação mantém as abas Resumo, eGRDTs, Documentos e Colar GRCON v2. A nova aba Colar GRCON v3 tem onze colunas A:K. A data da geração permanece numérica; a referência da Consulta Geral também é uma data numérica.

| Coluna | Conteúdo |
| --- | --- |
| A:F | Contrato legado, sem mudanças |
| G | Estado gerencial da conferência: POSTADO, AGUARDANDO RETORNO DO SIGEM ou NÃO VERIFICADO |
| H | SIM apenas com evidência atual de código e revisão exatos; demais casos INDETERMINADO |
| I | Revisão verificada |
| J | Data de referência da Consulta Geral |
| K | Identificador do snapshot |

Presença no SIGEM não significa aprovação. A coluna G mostra **somente três estados** para o Controle de Solicitações: **POSTADO** (código e revisão exatos presentes na Consulta Geral); **AGUARDANDO RETORNO DO SIGEM** (uma eGRDT foi gerada pelo GRCON para o documento, mas sua revisão ainda não está confirmada na Conferência, mesmo quando o motor exige análise ou a Consulta Geral antecede o envio); **NÃO VERIFICADO** (o registro não tem número de eGRDT ou código documental identificável). As classificações técnicas como Em Análise, Em Workflow, Recusado e revisão divergente continuam disponíveis no módulo Conferência, mas não geram novos rótulos na coluna G. A coluna H conserva a evidência SIM/INDETERMINADO; revisão divergente nunca recebe SIM. Base indisponível/desatualizada bloqueia a exportação operacional em vez de inventar um status. **A distinção entre solicitação de inclusão/alocação na LD e solicitação de postagem no SIGEM depende do tipo da solicitação na planilha de Controle de Solicitações, coluna G**, informação que não faz parte do Histórico de eGRDTs e por isso não é inferida pelo exportador. No modo de diagnóstico sem base, o relatório preserva **AGUARDANDO RETORNO DO SIGEM** para eGRDTs existentes, mas não atribui **POSTADO**; a exportação operacional exige Consulta Geral atualizada. Na planilha de Controle de Solicitações, a fórmula consulta a eGRDT específica da coluna Q para evitar reaproveitar a postagem de outra emissão.

O adaptador passa a base ativa e seu indicador de desatualização explicitamente ao worker. O worker carrega o motor oficial e suas dependências. Não consulta outra cópia de contrato pelo armazenamento local. A chave de vínculo dos eventos normaliza o instante para ISO, evitando falhas por representações equivalentes de data.

## Modelo operacional atualizado

Executar o migrador apenas sobre o modelo original de 29/10/2026:

```sh
python scripts/upgrade-requests-grcon-v3.py ORIGINAL.xlsx ATUALIZADO.xlsx AUDITORIA.json
```

O script conserva todas as partes OOXML não afetadas byte a byte e cria um backup antes de editar. Não regrava a Central, as bases, comentários, relacionamentos externos ou o histórico usando uma biblioteca de conversão. São preservadas seis abas, 1.441 solicitações e 9.126 envios do arquivo fornecido.

Na aba Colar GRCON, a chave é movida de G para L. A tabela GRCON_Envios passa a A:L, incluindo as mil linhas de fórmulas vazias já reservadas no original. As novas colunas de Solicitações são X:AA; os auxiliares existentes são deslocados quatro colunas e suas referências acompanham a mudança.

O título exportado inclui J1, quantidade de registros ativos, e K1, contrato GRCON_V3. Após copiar A:K e colar em A1, a chave L ignora as linhas remanescentes abaixo da nova quantidade. Assim uma exportação menor não reativa o final da colagem anterior. As linhas cruas históricas continuam preservadas.

Para um documento repetido, o envio vinculado fica entre a data de recebimento da solicitação e o próximo recebimento do mesmo documento. A última emissão nessa janela é a referência da solicitação. Os 48 grupos existentes de múltiplos documentos preservam seus 524 registros auxiliares e agregam a confirmação de todos os componentes. Novos grupos escritos em texto livre não são separados automaticamente por fórmulas; um código sem correspondência permanece não verificado. Envios com a mesma chave de documento e segundo ficam em análise, sem confirmação automática ambígua.

## Previsão de submissão

A exportação A:K não contém previsão real de submissão. O arquivo contém Data Prevista da alocação, que não comprova planejamento de submissão SIGEM. As 775 datas numéricas manuais são preservadas. As 74 fórmulas que copiavam a geração da eGRDT para a previsão são retiradas. Quando não há fonte comprovada, S fica vazia. Não criar preenchimento automático usando data de geração ou data da alocação.

## Uso

1. Exportar a relação no Histórico de eGRDTs com a Consulta Geral ativa e atualizada.
2. Na aba Colar GRCON v3, copiar A:K, incluindo linhas 1 e 2.
3. Colar em A1 da aba Colar GRCON do modelo atualizado. Não colar em L.
4. As colunas X:AA de Solicitações recalculam no Excel, inclusive offline.

O arquivo de relatório entregue neste trabalho foi reconstruído dos 9.126 envios da planilha fornecida, com o exportador oficial. Não contém uma Consulta Geral autenticada nova. Por isso todos os seus registros ficam NÃO VERIFICADO / INDETERMINADO, sem inventar evidências.

## Correção da fonte da exportação — 30/10/2026

O botão **Exportar relação** do Histórico agora exige a mesma Consulta Geral ativa
da Conferência antes de montar as colunas G:K da aba **Colar GRCON v3**.
Caso a base não esteja carregada, o aplicativo tenta atualizá-la. Se a base
estiver indisponível/desatualizada ou não possuir identificador do snapshot,
**a exportação é cancelada com erro explícito** em vez de preencher todos os
status como NÃO VERIFICADO. Nenhuma postagem é inferida só por existir eGRDT.

A preferência de uma Consulta Geral local importada permanece respeitada.
Se o contrato ou o snapshot mudar durante a geração, o download é cancelado,
para não entregar resultados de outra fonte. Se houver status SIGEM divergentes no mesmo instante para documento e revisão exatos, o módulo Conferência preserva a indicação de conflito. Na exportação gerencial, G permanece **POSTADO** se a presença exata estiver confirmada; H registra somente a presença da revisão, não aprovação técnica.

Esta alteração exige build e publicação do aplicativo antes de valer em produção;
a cópia antiga do Excel não se corrige sozinha. A importação da aba Colar GRCON
deve ser refeita a partir de uma nova exportação do aplicativo atualizado.

## Validação

`node tests/colar_grcon_v3.cjs` valida a lógica oficial, revisão exata e divergente, bases vazias/desatualizadas, repostagem, estados da evidência, 12 mil documentos e a execução real do worker via importScripts. O XLSX é aberto novamente e confere os tipos, as posições das onze colunas, a data e o contador do lote.

`node tests/history_colar_grcon.cjs` preserva a aba v2. A suíte npm test, build, typecheck e as verificações de sintaxe, referências, versões, dependências e workers complementam os testes.

A preservação do XLSX operacional é verificada por comparação dos registros e das partes do pacote. A inspeção visual usa recortes seletivos da planilha. O motor de cálculo disponível neste ambiente não reproduz corretamente MAXIFS com curingas; não se declara recálculo integral no Microsoft Excel. O arquivo solicita recálculo completo ao abrir no Excel. A colagem e a expansão das tabelas precisam de homologação nesse aplicativo antes de considerar a integração integralmente homologada.
