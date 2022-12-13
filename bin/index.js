#!/usr/bin/env node
import { stdout, argv, exit } from 'node:process';
import { setInterval } from 'node:timers';
import * as vite from 'vite';
import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';
import ts from 'typescript';

class Task {
    static SPINNER_FRAMES = [
        "⠋",
        "⠙",
        "⠹",
        "⠸",
        "⠼",
        "⠴",
        "⠦",
        "⠧",
        "⠇",
        "⠏",
    ];
    interval = null;
    frame = 0;
    msg;
    task;
    constructor(msg, task) {
        this.msg = msg;
        this.task = task;
    }
    update() {
        stdout.clearLine(0);
        stdout.cursorTo(0);
        print(`${this.spinner()} ${this.msg}...`);
        this.frame++;
        if (this.frame >= Task.SPINNER_FRAMES.length) {
            this.frame = 0;
        }
    }
    spinner(c) {
        return col(c ? c : Task.SPINNER_FRAMES[this.frame], Color.FgGreen);
    }
    async start() {
        this.interval = setInterval(this.update.bind(this), 30);
        this.frame = 0;
        this.update();
        const result = await this.task();
        this.complete();
        return result;
    }
    complete(clear) {
        if (this.interval)
            clearInterval(this.interval);
        stdout.clearLine(0);
        stdout.cursorTo(0);
        if (!clear) {
            printLn(`${this.spinner("✓")} ${this.msg}`);
        }
    }
}
class Logger {
    logs = [];
    push(msg) {
        this.logs.push(msg);
    }
    print() {
        for (const msg of this.logs) {
            printLn(msg);
        }
    }
    clear() {
        this.logs = [];
    }
}
var Color;
(function (Color) {
    Color["Reset"] = "\u001B[0m";
    Color["Bright"] = "\u001B[1m";
    Color["Dim"] = "\u001B[2m";
    Color["Underscore"] = "\u001B[4m";
    Color["Blink"] = "\u001B[5m";
    Color["Reverse"] = "\u001B[7m";
    Color["Hidden"] = "\u001B[8m";
    Color["FgBlack"] = "\u001B[30m";
    Color["FgRed"] = "\u001B[31m";
    Color["FgGreen"] = "\u001B[32m";
    Color["FgYellow"] = "\u001B[33m";
    Color["FgBlue"] = "\u001B[34m";
    Color["FgMagenta"] = "\u001B[35m";
    Color["FgCyan"] = "\u001B[36m";
    Color["FgWhite"] = "\u001B[37m";
    Color["BgBlack"] = "\u001B[40m";
    Color["BgRed"] = "\u001B[41m";
    Color["BgGreen"] = "\u001B[42m";
    Color["BgYellow"] = "\u001B[43m";
    Color["BgBlue"] = "\u001B[44m";
    Color["BgMagenta"] = "\u001B[45m";
    Color["BgCyan"] = "\u001B[46m";
    Color["BgWhite"] = "\u001B[47m";
})(Color || (Color = {}));
function print(s) {
    stdout.write(s);
}
function printLn(s) {
    if (s === undefined) {
        print("\n");
    }
    else {
        print(s + "\n");
    }
}
function col(s, c) {
    return c + s + Color.Reset;
}
function trim(s, length) {
    if (s.length > length) {
        return s.slice(0, length - 3) + "...";
    }
    else if (s.length < length) {
        return s + " ".repeat(length - s.length);
    }
    else {
        return s;
    }
}

const dirname$2 = url.fileURLToPath(new URL(".", import.meta.url));
const viteConfig$1 = (await vite.loadConfigFromFile({
    command: "serve",
    mode: "development",
}, path.resolve(dirname$2, "../vite.config.ts")))?.config;
async function dev() {
    const server = await new Task("Starting development server", () => vite.createServer(viteConfig$1).then((server) => server.listen())).start();
    printLn();
    server.printUrls();
    printLn();
}

const buildDirPath = path.resolve(process.cwd(), ".afterthoughts/build");
const generateDirPath = path.resolve(process.cwd(), "public/assets/generate");
async function generate() {
    await new Task("Generating config", async () => {
        if (!fs.existsSync(buildDirPath)) {
            fs.mkdirSync(buildDirPath, { recursive: true });
        }
        if (fs.existsSync(generateDirPath)) {
            fs.rmSync(generateDirPath, { recursive: true, force: true });
        }
        fs.mkdirSync(generateDirPath, { recursive: true });
        compileConfig();
        const config = (await import(path.resolve(buildDirPath, "config.js"))).default;
        fs.writeFileSync(path.resolve(generateDirPath, "config.json"), JSON.stringify(config));
    }).start();
}
function compileConfig() {
    const configInput = fs.readFileSync(path.resolve(process.cwd(), "user/config.ts"), "utf8");
    const configOutput = ts.transpileModule(configInput, {
        compilerOptions: { target: ts.ScriptTarget.ESNext },
    }).outputText;
    fs.writeFileSync(path.resolve(buildDirPath, "config.js"), configOutput, "utf8");
}

const React = (await import(path.resolve(process.cwd(), "node_modules/react/index.js"))).default;
const ReactDOMServer = (await import(path.resolve(process.cwd(), "node_modules/react-dom/server.js"))).default;
const dirname$1 = url.fileURLToPath(new URL(".", import.meta.url));
const outDirPath = path.resolve(process.cwd(), "dist");
const productionConfig = (await vite.loadConfigFromFile({
    command: "build",
    mode: "production",
}, path.resolve(dirname$1, "../vite.config.ts"))).config;
productionConfig.logLevel = "error";
const logger = new Logger();
const prerenderConfig = (await vite.loadConfigFromFile({
    command: "build",
    mode: "prerender",
}, path.resolve(dirname$1, "../vite.prerender.config.ts"))).config;
prerenderConfig.logLevel = "error";
async function build() {
    await generate();
    await new Task("Building javascript bundles", buildJSBundles).start();
    await new Task("Running pre-rendering jobs", prerender).start();
    await new Task("Building static pages", async () => {
        const app = (await import(path.resolve(process.cwd(), ".afterthoughts/build/app.js"))).default;
        const template = fs.readFileSync(path.resolve(process.cwd(), "dist/index.html"), "utf8");
        const pages = app.pages;
        for (const pathname in pages) {
            await buildPage(app, template, pathname, pages[pathname]);
        }
    }).start();
    logger.print();
}
async function buildJSBundles() {
    await vite.build(productionConfig);
}
async function prerender() {
    const buildPath = path.resolve(process.cwd(), ".afterthoughts/build");
    if (fs.existsSync(buildPath)) {
        fs.rmSync(buildPath, { recursive: true, force: true });
    }
    await vite.build(prerenderConfig);
}
const reg = new RegExp("^(?:[a-z+]+:)?//", "i");
function isAbsolute(url) {
    return reg.test(url);
}
async function buildPage(app, template, pathname, factory) {
    const module = await factory();
    const Page = module.default;
    app.clearFetchRequests();
    ReactDOMServer.renderToString(React.createElement(app, {
        renderPathname: pathname,
        renderPage: Page,
    }));
    const fetchRequests = app.getFetchRequests();
    const data = {};
    for (const identifier in fetchRequests) {
        const [input, init, callback] = fetchRequests[identifier];
        const inputUrl = input instanceof Request
            ? input.url
            : input instanceof URL
                ? input.href
                : input;
        let response;
        if (isAbsolute(inputUrl)) {
            response = (await fetch(input, init));
        }
        else {
            const filePath = path.join(process.cwd(), "public", inputUrl);
            const file = fs.readFileSync(filePath);
            response = new Response(file);
        }
        const result = await callback(response);
        data[identifier] = result;
    }
    const renderResult = ReactDOMServer.renderToString(React.createElement(app, {
        renderPathname: pathname,
        renderPage: Page,
        renderData: data,
    }));
    const filePath = getFilePath(pathname);
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    const dom = new JSDOM(template);
    const document = dom.window.document;
    const root = document.getElementById("root");
    if (!root) {
        throw "cannot find root element";
    }
    root.innerHTML = renderResult;
    if (Object.keys(data).length > 0) {
        const newScript = document.createElement("script");
        newScript.id = "preload-data";
        newScript.innerHTML =
            "window.__PRELOADED_DATA__=" +
                JSON.stringify(data).replace(/</g, "\\u003c");
        const firstScript = document.head.getElementsByTagName("script").item(0);
        document.head.insertBefore(newScript, firstScript);
    }
    fs.writeFileSync(filePath, dom.serialize(), "utf8");
    const relPath = path.relative(path.resolve(process.cwd(), "dist"), filePath);
    const stats = fs.statSync(filePath);
    const sizeInKiB = stats.size / 1024;
    logger.push(col("dist/", Color.Dim) +
        col(trim(relPath, 35), Color.FgCyan) +
        " ".repeat(5) +
        col(sizeInKiB.toFixed(2) + " KiB", Color.Dim));
}
function getFilePath(pathname) {
    let filePath = path.resolve(outDirPath, path.relative("/pages", pathname));
    const basename = path.parse(filePath).name;
    if (basename === "index") {
        filePath = path.resolve(path.dirname(filePath), basename + ".html");
    }
    else if (basename.startsWith("_")) {
        filePath = path.resolve(path.dirname(filePath), basename.slice(1) + ".html");
    }
    else {
        filePath = path.resolve(path.dirname(filePath), basename, "index.html");
    }
    return filePath;
}

const dirname = url.fileURLToPath(new URL(".", import.meta.url));
const viteConfig = (await vite.loadConfigFromFile({
    command: "serve",
    mode: "production",
}, path.resolve(dirname, "../vite.config.ts")))?.config;
async function preview() {
    const server = await new Task("Starting preview server", () => vite.preview(viteConfig)).start();
    printLn();
    server.printUrls();
    printLn();
}

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
