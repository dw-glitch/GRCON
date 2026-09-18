import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const historyBuild = mode === "historico-analises";
  const entry = historyBuild
    ? "src/react/historico-analises/index.tsx"
    : "src/react/consultas/index.tsx";
  const fileName = historyBuild ? "historico-analises-app.js" : "consultas-app.js";

  return {
    plugins: [react()],
    // Os bundles IIFE precisam substituir o guard do React em build-time;
    // deixar process.env.NODE_ENV no pacote quebra em navegadores sem global Node.
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
      outDir: "react-dist",
      // O primeiro build limpa a pasta; o segundo acrescenta a nova ilha.
      emptyOutDir: !historyBuild,
      assetsDir: ".",
      cssCodeSplit: false,
      lib: {
        entry: fileURLToPath(new URL(entry, import.meta.url)),
        name: historyBuild ? "GrconHistoricoAnalisesBundle" : "GrconConsultasBundle",
        formats: ["iife"],
        fileName: () => fileName,
      },
      rollupOptions: {
        output: {
          // Cada ilha continua sendo um script clássico autocontido, carregado
          // somente quando o módulo correspondente é ativado.
          inlineDynamicImports: true,
        },
      },
    },
  };
});
