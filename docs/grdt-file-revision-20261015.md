# Revisão do arquivo na Central de GRDT — 5.44.14

A revisão do arquivo recebido governa a triagem e a seleção automática. LD e
Consulta Geral/Colar SIGEM continuam fornecendo identificação, metadados e o
status da combinação exata de documento e revisão.

| Nome recebido | Revisão |
| --- | --- |
| CODIGO.pdf | 0 |
| CODIGO_0.pdf | 0 |
| CODIGO_A.pdf | A |
| CODIGO_0001_A.pdf | A; 0001 identifica a folha |
| CODIGO_0001.pdf | 0; 0001 identifica a folha |
| CODIGO_01.pdf / CODIGO_A1.pdf / CODIGO_#1.pdf | 01 / A1 / #1 |
| CODIGO_ERRADO.pdf / CODIGO_0001_RIR.pdf | Não identificada; exige conferência manual |

Os underscores internos do código ET não são interpretados como revisão. A
comparação separa primeiro a identidade documental do sufixo. As variantes de
identidade já reconhecidas de forma inequívoca pela LD continuam aceitas.

Uma revisão A em análise, recusada ou já com retorno continua A depois da
atualização da base. O arquivo não avança automaticamente para B. Quando a
combinação exata já está postada, a linha fica desmarcada, com explicação e sem
bloqueio de seleção manual. Se não estiver postada, a própria revisão do arquivo
pode seguir, observadas as demais conferências existentes.

O agrupamento usa documento + revisão do arquivo. PDF A e nativo B não são mais
fundidos numa mesma linha. Arquivos sem revisão identificável ficam separados
para não ocultar divergências nem eliminar anexos por uma renomeação suposta.

A geração confere novamente o nome original de cada anexo. Divergências sem
intervenção manual ficam fora do plano; itens corretos continuam seguindo. A
marcação manual ou edição explícita da revisão permite prosseguir com aviso.
O histórico conserva a revisão enviada, a revisão identificada no arquivo e a
indicação de intervenção manual. Não há alteração retroativa dos históricos.

A tabela e o relatório distinguem revisão do arquivo e revisão da GRDT. A
próxima revisão disponível no histórico é informação de contexto, não uma
revisão atribuída ao anexo. O cache de análise inclui a versão da aplicação.

## Validação

- `npm test`: suíte integral, incluindo o novo teste `grdt_file_revision.cjs`.
- Novo teste: formatos, revisão 0, folhas, preliminares, identidade ET/N-1710/CV,
  evolução de status, revisão exata, agrupamento, emissão, overrides, histórico
  e execução real do script do Worker em contexto isolado.
- Typecheck, build, sintaxe, referências, versões, dependências e pacote Cloudflare.
- `scripts/validar-grdt-file-revision-browser.cjs`: upload de LD e cinco arquivos,
  quatro linhas por documento/revisão, seleção automática, marcação manual,
  edição/restauração da revisão e plano final, com Worker e modo legado.
- O Chromium não pôde ser instalado neste ambiente (download truncado); a
  verificação visual roda no workflow `grdt-file-revision.yml` da PR.
