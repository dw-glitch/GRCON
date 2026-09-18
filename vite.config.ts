import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Build da ilha React de Consultas.
 *
 * Gera um único arquivo autocontido, `react-dist/consultas-app.js`, que é
 * carregado como `<script>` clássico pelo `grcon_module_loader.js` (mesma
 * forma como todo o resto do GRCON carrega seus módulos) e listado em
 * `sw.js` para funcionar offline. Por isso o build usa formato IIFE (sem
 * `import`/`export` no bundle final) e embute React/ReactDOM — nada de CDN,
 * nada de módulos externos carregados em runtime.
 *
 * Rodar apenas em CI/Vercel (`npm run build`); não há Node.js neste
 * repositório para rodar isso localmente durante o desenvolvimento comum.
 */
export default defineConfig({
  plugins: [react()],
  // React/ReactDOM ainda contêm guards de ambiente escritos como
  // process.env.NODE_ENV. Em build de library/IIFE o Vite não garante essa
  // substituição sozinho; deixar "process" no bundle quebra no navegador.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "react-dist",
    emptyOutDir: true,
    assetsDir: ".",
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL("src/react/consultas/index.tsx", import.meta.url)),
      name: "GrconConsultasBundle",
      formats: ["iife"],
      fileName: () => "consultas-app.js",
    },
    rollupOptions: {
      output: {
        // Um único arquivo — sem code-splitting nem chunks adicionais,
        // exatamente como os demais módulos legados servidos estaticamente.
        inlineDynamicImports: true,
      },
    },
  },
});
