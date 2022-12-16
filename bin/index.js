#!/usr/bin/env node
import { stdout, argv, exit } from 'node:process';
import { setInterval } from 'node:timers';
import * as vite from 'vite';
import path from 'node:path';
import url from 'node:url';
import fs$1 from 'node:fs';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import fs from 'fs-extra';
import dayjs from 'dayjs';
import parseMD from 'parse-md';
import nodeFetch from 'node-fetch';

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
const generateDirPath = path.resolve(process.cwd(), "public/generate");
const dataDirPath = path.resolve(generateDirPath, "data");
async function generate() {
    if (!fs.existsSync(buildDirPath)) {
        fs.mkdirSync(buildDirPath, { recursive: true });
    }
    if (fs.existsSync(generateDirPath)) {
        fs.rmSync(generateDirPath, { recursive: true, force: true });
    }
    fs.mkdirSync(generateDirPath, { recursive: true });
    fs.mkdirSync(dataDirPath, { recursive: true });
    const config = await new Task("Generating config", generateConfig).start();
    await new Task("Generating posts", () => generatePosts(config)).start();
}
function compileConfig() {
    const configInput = fs.readFileSync(path.resolve(process.cwd(), "user/config.ts"), "utf8");
    const configOutput = ts.transpileModule(configInput, {
        compilerOptions: { target: ts.ScriptTarget.ESNext },
    }).outputText;
    fs.writeFileSync(path.resolve(buildDirPath, "config.js"), configOutput, "utf8");
}
async function generateConfig() {
    compileConfig();
    const config = (await import(path.resolve(buildDirPath, "config.js"))).default;
    fs.writeFileSync(path.resolve(generateDirPath, "config.json"), JSON.stringify(config));
    return config;
}
async function generatePosts(config) {
    const postsPath = path.resolve(process.cwd(), "user/posts");
    fs.copySync(postsPath, path.resolve(generateDirPath, "posts"));
    const posts = [];
    const postsDir = fs.readdirSync(postsPath);
    for (const postFilename of postsDir) {
        const postFile = fs.readFileSync(path.join(postsPath, postFilename), "utf8");
        const { metadata, content } = parseMD(postFile);
        posts.push({
            filename: postFilename,
            metadata: metadata,
            synopsis: content,
        });
    }
    posts.sort((a, b) => dayjs(getMetaEntry(b, "date")).unix() -
        dayjs(getMetaEntry(a, "date")).unix());
    const numPerPage = config.posts.numPerPage;
    const chunks = splitArray(posts, numPerPage);
    const postsData = {
        numPages: chunks.length,
    };
    fs.writeFileSync(path.resolve(dataDirPath, "posts.json"), JSON.stringify(postsData), "utf8");
    fs.mkdirSync(path.resolve(dataDirPath, "posts"));
    for (let i = 0; i < chunks.length; i++) {
        fs.writeFileSync(path.resolve(dataDirPath, "posts", `${i}.json`), JSON.stringify(chunks[i]), "utf8");
    }
}
function getMetaEntry(post, key, throwsErr) {
    const result = post.metadata[key];
    if (result !== undefined || !throwsErr) {
        return result;
    }
    else {
        throw `key ${key} does not exist in file ${post.filename}`;
    }
}
function splitArray(arr, chunkSize) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        chunks.push(chunk);
    }
    return chunks;
}

async function fetch(input, init) {
    const inputUrl = input instanceof Request
        ? input.url
        : input instanceof URL
            ? input.href
            : input;
    return isAbsoluteUrl(inputUrl)
        ? (await nodeFetch(input, init))
        : new Response(fs$1.readFileSync(path.join(process.cwd(), "public", inputUrl)));
}
globalThis.fetch = fetch;
const reg = new RegExp("^(?:[a-z+]+:)?//", "i");
function isAbsoluteUrl(url) {
    return reg.test(url);
}
function getOutputFilePath(pathname) {
    const outDirPath = path.resolve(process.cwd(), "dist");
    let filePath = path.join(outDirPath, pathname);
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
function getNameParams(basename) {
    const params = [];
    let leftIndex = basename.indexOf("{");
    while (leftIndex !== -1) {
        const rightIndex = basename.indexOf("}", leftIndex);
        if (rightIndex === -1) {
            throw `invalid filename ${basename}: brackets do not match`;
        }
        params.push(basename.substring(leftIndex + 1, rightIndex));
        leftIndex = basename.indexOf("{", rightIndex);
    }
    return params;
}
function fillPathParams(pathname, params) {
    let result = pathname;
    for (const param in params) {
        result = result.replace(`{${param}}`, params[param]);
    }
    return result;
}
function splitParamValues(key, values) {
    return values.map((value) => ({
        [key]: String(value),
    }));
}
function getParamCombs(params) {
    const paramCombs = Object.keys(params).map((key) => {
        const values = params[key];
        if (Array.isArray(values)) {
            const split = splitParamValues(key, values);
            return split;
        }
        const thisParamCombs = splitParamValues(key, values.values);
        const results = [];
        for (const recordX of thisParamCombs) {
            const childrenParams = values.children instanceof Function
                ? values.children(recordX[key])
                : values.children;
            const childrenParamCombs = getParamCombs(childrenParams);
            for (const recordY of childrenParamCombs) {
                results.push({ ...recordX, ...recordY });
            }
        }
        return results;
    });
    return paramCombs.reduce((x, y) => {
        const results = [];
        for (const recordX of x) {
            for (const recordY of y) {
                results.push({ ...recordX, ...recordY });
            }
        }
        return results;
    });
}
const outputPathnameMap = {};
async function getOutputDirPathnames(input, pages) {
    if (input in outputPathnameMap) {
        return outputPathnameMap[input];
    }
    const parentPathname = path.dirname(input);
    const outParentPathnames = parentPathname !== "/"
        ? await getOutputDirPathnames(parentPathname, pages)
        : ["/"];
    const basename = path.basename(input);
    const nameParams = getNameParams(basename);
    const result = [];
    if (nameParams.length > 0) {
        const pathCandidates = [
            path.join("/pages", input, "index.tsx"),
            path.join("/pages", input, "index.ts"),
            path.join("/pages", input + ".tsx"),
            path.join("/pages", input + ".ts"),
        ];
        let modulePath = null;
        for (const candidate of pathCandidates) {
            if (candidate in pages) {
                modulePath = candidate;
                break;
            }
        }
        if (modulePath === null) {
            throw `unable to find the page corresponding to the directory '${input}' containing parameters`;
        }
        const module = await pages[modulePath]();
        const getPageParams = module.getPageParams;
        if (getPageParams === undefined) {
            throw `page '${modulePath}' has parameters but does not provide a 'getPageParams' function`;
        }
        for (const outParentPathname of outParentPathnames) {
            const parent = path.basename(outParentPathname);
            const pageParams = await getPageParams(parent);
            const paramCombs = getParamCombs(pageParams);
            if (paramCombs.length === 0) {
                throw `unable to create the directory ${input} that satisfies all parameters`;
            }
            for (const key of nameParams) {
                if (paramCombs[0][key] === undefined) {
                    throw `the 'getPageParams' function of page '${input}' does not return the values of parameter '${key}'`;
                }
            }
            for (const comb of paramCombs) {
                result.push(fillPathParams(path.join(outParentPathname, basename), comb));
            }
        }
    }
    else {
        for (const outParentPathname of outParentPathnames) {
            result.push(path.join(outParentPathname, basename));
        }
    }
    outputPathnameMap[input] = result;
    return result;
}

const React = (await import(path.resolve(process.cwd(), "node_modules/react/index.js"))).default;
const ReactDOMServer = (await import(path.resolve(process.cwd(), "node_modules/react-dom/server.js"))).default;
const dirname$1 = url.fileURLToPath(new URL(".", import.meta.url));
const productionConfig = (await vite.loadConfigFromFile({
    command: "build",
    mode: "production",
}, path.resolve(dirname$1, "../vite.config.ts"))).config;
productionConfig.logLevel = "error";
const prerenderConfig = (await vite.loadConfigFromFile({
    command: "build",
    mode: "prerender",
}, path.resolve(dirname$1, "../vite.prerender.config.ts"))).config;
prerenderConfig.logLevel = "error";
const logger = new Logger();
async function build() {
    await generate();
    await new Task("Building javascript bundles", buildJSBundles).start();
    await new Task("Running pre-rendering jobs", prerender).start();
    await new Task("Building static pages", buildStaticPages).start();
    logger.print();
}
async function buildJSBundles() {
    await vite.build(productionConfig);
}
async function prerender() {
    const buildPath = path.resolve(process.cwd(), ".afterthoughts/build");
    if (fs$1.existsSync(buildPath)) {
        fs$1.rmSync(buildPath, { recursive: true, force: true });
    }
    await vite.build(prerenderConfig);
}
async function buildStaticPages() {
    const app = (await import(path.resolve(process.cwd(), ".afterthoughts/build/app.js"))).default;
    const template = fs$1.readFileSync(path.resolve(process.cwd(), "dist/index.html"), "utf8");
    const pages = app.pages;
    for (const filepath in pages) {
        await buildPage(app, template, filepath, pages);
    }
}
async function buildPage(app, template, filepath, pages) {
    // import module
    const module = await pages[filepath]();
    const Page = module.default;
    if (Page === undefined) {
        return;
    }
    const pathname = path.join("/", path.relative("/pages", filepath));
    const basename = path.basename(pathname);
    const parentPathnames = await getOutputDirPathnames(path.dirname(pathname), pages);
    const nameParams = getNameParams(basename);
    if (nameParams.length > 0) {
        const getPageParams = module.getPageParams;
        if (getPageParams === undefined) {
            throw `page '${pathname}' has parameters but does not provide a 'getPageParams' function`;
        }
        for (const parentPathname of parentPathnames) {
            const parent = path.basename(parentPathname);
            const pageParams = await getPageParams(parent);
            const paramCombs = getParamCombs(pageParams);
            if (paramCombs.length === 0) {
                continue;
            }
            for (const key of nameParams) {
                if (paramCombs[0][key] === undefined) {
                    throw `the 'getPageParams' function of page '${pathname}' does not return the values of parameter '${key}'`;
                }
            }
            for (const comb of paramCombs) {
                const subpageBasename = fillPathParams(basename, comb);
                const subpagePathname = path.join(parentPathname, subpageBasename);
                await buildSubpage(app, template, subpagePathname, Page);
            }
        }
    }
    else {
        for (const parentPathname of parentPathnames) {
            const subpagePathname = path.join(parentPathname, basename);
            await buildSubpage(app, template, subpagePathname, Page);
        }
    }
}
async function buildSubpage(app, template, pathname, Page) {
    // get output file path
    const outputFilePath = getOutputFilePath(pathname);
    if (!fs$1.existsSync(path.dirname(outputFilePath))) {
        fs$1.mkdirSync(path.dirname(outputFilePath), { recursive: true });
    }
    // first rendering, to get preload fetches
    app.resetPreloadDataMap();
    ReactDOMServer.renderToString(React.createElement(app, {
        renderPathname: pathname,
        renderPage: Page,
    }));
    const preloadFetches = app.getPreloadDataMap();
    // fetch data
    const data = {};
    for (const identifier in preloadFetches) {
        const { input, init, callback } = preloadFetches[identifier];
        const res = await fetch(input, init);
        data[identifier] = await callback(res);
    }
    // second rendering
    const renderResult = ReactDOMServer.renderToString(React.createElement(app, {
        renderPathname: pathname,
        renderPage: Page,
        renderData: data,
    }));
    // inject rendering results into the template
    const dom = new JSDOM(template);
    const document = dom.window.document;
    const root = document.getElementById("root");
    if (!root) {
        throw "cannot find root element";
    }
    root.innerHTML = renderResult;
    // inject preload data
    if (Object.keys(data).length > 0) {
        const newScript = document.createElement("script");
        newScript.id = "preload-data";
        newScript.innerHTML =
            "window.__PRELOADED_DATA__=" +
                JSON.stringify(data).replace(/</g, "\\u003c");
        const firstScript = document.head
            .getElementsByTagName("script")
            .item(0);
        document.head.insertBefore(newScript, firstScript);
    }
    // write to html file
    fs$1.writeFileSync(outputFilePath, dom.serialize(), "utf8");
    // print message
    const relPath = path.relative(path.resolve(process.cwd(), "dist"), outputFilePath);
    const stats = fs$1.statSync(outputFilePath);
    const sizeInKiB = stats.size / 1024;
    logger.push(col("dist/", Color.Dim) +
        col(trim(relPath, 35), Color.FgCyan) +
        " ".repeat(5) +
        col(sizeInKiB.toFixed(2) + " KiB", Color.Dim));
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
