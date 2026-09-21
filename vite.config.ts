import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BUILDS = {
  consultas: {
    entry: "src/react/consultas/index.tsx",
    fileName: "consultas-app.js",
    bundleName: "GrconConsultasBundle",
    emptyOutDir: true,
  },
  "historico-analises": {
    entry: "src/react/historico-analises/index.tsx",
    fileName: "historico-analises-app.js",
    bundleName: "GrconHistoricoAnalisesBundle",
    emptyOutDir: false,
  },
  "historico-egrdt": {
    entry: "src/react/historico-egrdt/index.tsx",
    fileName: "historico-egrdt-app.js",
    bundleName: "GrconHistoricoEgrdtBundle",
    emptyOutDir: false,
  },
  "pdf-tools": {
    entry: "src/react/pdf-tools/index.tsx",
    fileName: "pdf-tools-app.js",
    bundleName: "GrconPdfToolsBundle",
    emptyOutDir: false,
  },
} as const;

export default defineConfig(({ mode }) => {
  const selected = BUILDS[mode as keyof typeof BUILDS] || BUILDS.consultas;

  return {
    plugins: [react()],
    // Os bundles IIFE precisam substituir o guard do React em build-time;
    // deixar process.env.NODE_ENV no pacote quebra em navegadores sem global Node.
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
      outDir: "react-dist",
      // Consultas é sempre a primeira entrada do script de build e limpa a
      // pasta. As entradas seguintes apenas acrescentam seus próprios bundles.
      emptyOutDir: selected.emptyOutDir,
      assetsDir: ".",
      cssCodeSplit: false,
      lib: {
        entry: fileURLToPath(new URL(selected.entry, import.meta.url)),
        name: selected.bundleName,
        formats: ["iife"],
        fileName: () => selected.fileName,
      },
      rollupOptions: {
        output: {
          // Cada ilha continua sendo um script clássico autocontido e lazy.
          inlineDynamicImports: true,
        },
      },
    },
  };
});
