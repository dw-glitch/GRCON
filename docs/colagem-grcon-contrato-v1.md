# Contrato operacional — Colar GRCON (v1)

## Fonte do arquivo
Histórico de eGRDTs → Relação por período → aba **Colar GRCON**.

A exportação possui cinco colunas permanentes, na ordem abaixo:

| Coluna | Cabeçalho | Origem |
|---|---|---|
| A | DATA DA GERAÇÃO / POSTAGEM | Horário registrado da emissão no histórico |
| B | EGRDT | Identificação da eGRDT |
| C | DOCUMENTO | Código literal do documento |
| D | REVISÃO ENVIADA NA GRDT | Revisão efetivamente emitida |
| E | VERSÃO DA LD ENVIADA | Prazo literal registrado na LD durante a geração |

**Contrato fixo:** A1:E1 é apenas instrução, A2:E2 são os cabeçalhos e os dados começam em A3. Não inserir, reordenar ou renomear colunas sem novo contrato versionado e migração da planilha de solicitações.

## Colagem
Copie o intervalo **A2:E(última linha)** desta aba e cole como **valores** em **Colar GRCON!A2** no Controle de Solicitações. Antes de colar, apague apenas os dados antigos A3:E(última linha); não apagar as fórmulas auxiliares das colunas F e G. Preserve A1, as tabelas e as outras abas.

Uma única linha por documento + revisão + eGRDT; formatos PDF e XLSX duplicados na mesma emissão são consolidados. Repostagens/emissões distintas e revisões distintas são preservadas. Campos de LD ausentes em históricos antigos permanecem vazios.

## Dependências na planilha Controle de Solicitações
- Colar GRCON F3:F... = data da coluna A convertida para número de data/hora do Excel.
- Colar GRCON G3:G... = concatenação de C & "|" & TEXT(F,"0,0000000000").
- Solicitações P = eGRDT obtida na coluna B, localizada por Y.
- Solicitações X = data mais recente a partir do recebimento (C), usando Colar GRCON C e F.
- Solicitações Y = MATCH do documento J e data X contra Colar GRCON G.
- Solicitações L = versão LD em E da linha localizada por Y; senão a versão da Central de alocação B, chave J.

A aba **Documentos** permanece completa e **não** deve ser usada para alimentar Colar GRCON.
