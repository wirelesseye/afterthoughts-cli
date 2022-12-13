import ts from "typescript";
import fs from "fs";
import path from "path";
import type { AftConfig } from "afterthoughts/dist";
import { Task } from "./cli-utils";

const buildDirPath = path.resolve(process.cwd(), ".afterthoughts/build");
const generateDirPath = path.resolve(process.cwd(), "public/assets/generate");

export default async function generate() {
    await new Task("Generating config", async () => {
        if (!fs.existsSync(buildDirPath)) {
            fs.mkdirSync(buildDirPath, { recursive: true });
        }
    
        if (fs.existsSync(generateDirPath)) {
            fs.rmSync(generateDirPath, { recursive: true, force: true });
        }
        fs.mkdirSync(generateDirPath, { recursive: true });

        compileConfig();
        const config: AftConfig = (await import(path.resolve(buildDirPath, "config.js"))).default;
        fs.writeFileSync(path.resolve(generateDirPath, "config.json"), JSON.stringify(config));
    }).start();
}

function compileConfig() {
    const configInput = fs.readFileSync(
        path.resolve(process.cwd(), "user/config.ts"),
        "utf8"
    );
    const configOutput = ts.transpileModule(configInput, {
        compilerOptions: { target: ts.ScriptTarget.ESNext },
    }).outputText;
    
    fs.writeFileSync(path.resolve(buildDirPath, "config.js"), configOutput, "utf8");
}
