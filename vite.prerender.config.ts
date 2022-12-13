import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
    mode: "prerender",
    build: {
        minify: false,
        rollupOptions: {
            input: {
                app: "app.tsx",
            },
            output: {
                dir: ".afterthoughts/build",
                entryFileNames: "app.js",
            },
            preserveEntrySignatures: "strict",
            external: [
                "react",
                "react-dom",
                "react/jsx-runtime",
                "process",
                "fs",
                "path",
            ],
        },
    },
    define: {
        global: {
            "import.meta.url": "import.meta.url",
        },
    },
    plugins: [react()],
});
