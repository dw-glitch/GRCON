import { copyFile } from 'node:fs/promises';
await copyFile(new URL('../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), new URL('../react-dist/pdf.worker.min.mjs', import.meta.url));
