# SIGEM × PW — Homologação de conteúdo e implantação controlada (GRCON)

## Decisão confirmada em 30/10/2026
A planilha **LD x PW 2.xlsx** é uma referência das INFORMAÇÕES desejadas pelo coordenador, **não** um molde obrigatório de layout ou um catálogo de ações a ser copiado literalmente. O GRCON deve usar sua linguagem visual e estrutura intuitiva, sem criar indicadores falsos nem omitir informações de origem.

## Entrega do Excel gerencial
A exportação do GRCON contém 3 abas úteis:
1. **Resumo**: indicadores consistentes com o painel do GRCON, conflitos de referências, contagens fora do escopo, empresa CSG/QTM e proveniência das fontes.
2. **N-1710**: controle dos documentos com código, revisão, título, status da referência, status do SIGEM, situação de cadastro/emissão PW, conferência de revisões, providência gerencial e histórico das revisões. O nome técnico da aba permanece para facilitar identificação contratual, mas a apresentação usa as cores/filtros do GRCON.
3. **REL. PW**: todos os **70 campos** originais da consulta CSV PW (inclusive vazios, não classificados e outras empresas), como texto literal, para auditoria das fontes. Nenhuma coluna PW original é artificialmente descartada.

A antiga aba **SIGEM** era vazia no exemplo e foi substituída pela aba Resumo; a verdadeira fonte da situação SIGEM é a **Consulta Geral** do GRCON.

## Teste correto: equivalência funcional
O comparador de homologação `scripts/sigem-pw-semantic-parity.cjs` foi criado para verificar:
- Existência de documento, revisão e providência no controle;
- Mesmo universo de documento+revisão **quando ambas as exportações usarem as mesmas fontes**;
- Mesmos atributos PW (incluindo nomes repetidos e número de ocorrências) e **todas as linhas/valores**, independentemente da ordem de colunas ou linhas;
- Ausência de células de AÇÃO em branco.
  
**Não** é requisito repetir cabeçalhos, fórmulas ou os 12 textos da planilha modelo em sequência idêntica. A interface pode empregar a taxonomia gerencial do GRCON (com distinção de ressalvas e recusa), desde que a providência seja correta e auditável.

Com os dois XLSX no ambiente local autorizado, sem enviá-los ao GitHub/CI:
```sh
npm run check:sigem-pw-release -- "LD x PW 2.xlsx" "GRCON_SIGEM_PW_GERENCIAL_YYYYMMDD.xlsx"
```
Esse comando informa **apenas contagens**, diferenças e alertas, não lista documentos nem atributos sensíveis. O modo anterior `scripts/sigem-pw-release-parity.cjs` continua disponível para auditoria histórica *opcional*, mas **não é gate de layout**.

## Gates antes da liberação real
- [x] Modelo original recuperado da Biblioteca do usuário, 6.041 documentos e 29.421 linhas PW, 70 atributos (observação de referência, não universo fixo).
- [x] Excel adaptado ao GRCON, aba Resumo, proveniência e fonte PW original.
- [x] Comparação funcional sem exigir layout idêntico.
- [ ] Validar XLSX real gerado no navegador (incluindo abertura no Excel corporativo e volume completo).
- [ ] Corrigir e comprovar Chromium de exportação `#spw-export`, com repetição de downloads.
- [ ] Verificar autorização corporativa para replicar atributos PW brutos em banco/terceiros; as linhas PW sem código são preservadas **localmente**, mas o RPC `grcon_pw_base` atual não aceita replicá-las. **Não** modificar política de armazenamento nem fazer upload dessas linhas sem aprovação.
- [ ] Confirmar CI/QA do commit final e rollback/saúde Cloudflare.

Não executar operações destrutivas no R2, Supabase, Consulta Geral ou Turso/Neon como parte desta modernização. A migração do banco é um fluxo separado.

## Validação
```sh
npm run test:sigem-pw-coordinator
npm run test:sigem-pw-phase6
npm run test:sigem-pw-semantic
npm run typecheck
npm run build
```

Um build Vite bem-sucedido **não** é prova de paridade dos dados reais nem de aprovação do compartilhamento PW. Nunca declarar a publicação concluída sem confirmação da implantação Cloudflare no SHA final.
