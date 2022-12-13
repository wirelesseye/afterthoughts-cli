import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import commonjs from "@rollup/plugin-commonjs";
import external from "rollup-plugin-node-externals";
import shebang from "rollup-plugin-preserve-shebang";

export default [
    {
        input: "src/bin/index.ts",
        output: {
            file: "bin/index.js",
        },
        plugins: [
            nodeResolve({
                extensions: [".ts", ".js"],
            }),
            typescript({
                include: "src/bin/*",
                outDir: "bin",
            }),
            commonjs(),
            external(),
            shebang(),
        ],
        external: ["afterthoughts"],
    },
    {
        input: "src/lib/index.ts",
        output: {
            file: "dist/index.js",
        },
        plugins: [
            nodeResolve({
                extensions: [".ts", ".js"],
            }),
            typescript({
                include: "src/lib/*",
                outDir: "dist",
                declaration: true,
            }),
            commonjs(),
            external(),
        ],
        external: ["afterthoughts"],
    },
];
