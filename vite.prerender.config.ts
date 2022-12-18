import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

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
                "@emotion/react",
                "@emotion/react/jsx-runtime",
            ],
        },
    },
    define: {
        global: {
            "import.meta.url": "import.meta.url",
        },
    },
    plugins: [
        tsconfigPaths(),
        react({
            jsxImportSource: "@emotion/react",
            babel: {
                plugins: ["@emotion/babel-plugin"],
            },
        }),
    ],
});
