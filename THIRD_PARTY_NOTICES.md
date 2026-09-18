# Bibliotecas de terceiros

O GRCON distribui bibliotecas JavaScript vendorizadas para operar também offline. Os cabeçalhos originais devem ser preservados.

| Arquivo | Projeto | Versão identificável | Origem |
| --- | --- | --- | --- |
| `exceljs.min.js` | ExcelJS | cabeçalho de build 2023-10-19 | https://github.com/exceljs/exceljs |
| `jszip.min.js` | JSZip | 3.10.1 | https://github.com/Stuk/jszip |
| `xlsx.full.min.js` | SheetJS Community Edition | não declarada no bundle | https://git.sheetjs.com/sheetjs/sheetjs |
| `supabase.min.js` | Supabase JavaScript | não declarada no bundle | https://github.com/supabase/supabase-js |
| `pdf-lib.min.js` | pdf-lib | 1.17.1 | https://github.com/Hopding/pdf-lib |

Os hashes SHA-256 aceitos estão em `vendor-manifest.json` e são conferidos pelo CI. Uma atualização deve registrar versão, origem, licença e novo hash antes da publicação.

Este aviso não substitui os textos de licença dos projetos de origem.
O texto da licença do pdf-lib acompanha o pacote em `pdf-lib.LICENSE.md`.
O GSAP 3.13.0 é distribuído sob a licença padrão sem cobrança indicada no cabeçalho do bundle e em https://gsap.com/standard-license.

## React e ReactDOM (ilha de Consultas)

A tela de Consultas (`src/react/consultas/`) usa React e ReactDOM 18 como
dependências npm (licença MIT — https://github.com/facebook/react),
compiladas por Vite/TypeScript em `react-dist/consultas-app.js`. Diferente
das bibliotecas da tabela acima, não são arquivos vendorizados soltos no
repositório: `package.json`/`package-lock.json` fixam a versão e o build
acontece só em ambiente remoto (Vercel/GitHub Actions), nunca na máquina do
desenvolvedor.
