#!/usr/bin/env node

import { argv, exit } from "process";
import { Color, col, printLn } from "./cli-utils";
import dev from "./dev";
import build from "./build";
import generate from "./generate";
import preview from "./preview";

printLn(col(`afterthoughts-cli v${process.env.npm_package_version}`, Color.FgCyan));

const command = argv[2];
switch (command) {
    case "dev":
        dev();
        break;
    case "build":
        build();
        break;
    case "preview":
        preview();
        break;
    case "generate":
        generate();
        break;
    default:
        printLn(`Usage: npx aft ${col("<command>", Color.Dim)}`);
        printLn("Available commands: dev, build, preview, generate");
        exit(1);
}
