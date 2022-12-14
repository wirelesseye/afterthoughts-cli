import * as vite from "vite";
import path from "path";
import fs from "fs";
import url from "url";
import { JSDOM } from "jsdom";
import fetch from "node-fetch";

import { col, Color, Logger, Task, trim } from "./cli-utils";
import generate from "./generate";

import type { AftApp } from "afterthoughts";
import type * as Fetch from "node-fetch";
import type ReactNS from "react";
import type ReactDOMServerNS from "react-dom/server";

const React: typeof ReactNS = (
    await import(path.resolve(process.cwd(), "node_modules/react/index.js"))
).default;
const ReactDOMServer: typeof ReactDOMServerNS = (
    await import(
        path.resolve(process.cwd(), "node_modules/react-dom/server.js")
    )
).default;

const dirname = url.fileURLToPath(new URL(".", import.meta.url));
const outDirPath = path.resolve(process.cwd(), "dist");

const productionConfig = (await vite.loadConfigFromFile(
    {
        command: "build",
        mode: "production",
    },
    path.resolve(dirname, "../vite.config.ts")
))!.config;
productionConfig.logLevel = "error";

const logger = new Logger();

const prerenderConfig = (await vite.loadConfigFromFile(
    {
        command: "build",
        mode: "prerender",
    },
    path.resolve(dirname, "../vite.prerender.config.ts")
))!.config;
prerenderConfig.logLevel = "error";

export default async function build() {
    await generate();
    await new Task("Building javascript bundles", buildJSBundles).start();
    await new Task("Running pre-rendering jobs", prerender).start();
    await new Task("Building static pages", async () => {
        const app: AftApp = (
            await import(
                path.resolve(process.cwd(), ".afterthoughts/build/app.js")
            )
        ).default;
        const template = fs.readFileSync(
            path.resolve(process.cwd(), "dist/index.html"),
            "utf8"
        );
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
function isAbsolute(url: string) {
    return reg.test(url);
}

async function buildPage(
    app: AftApp,
    template: string,
    pathname: string,
    factory: () => Promise<{ default: React.ComponentType<any> }>
) {
    const module = await factory();
    const Page = module.default;

    app.clearFetchRequests();
    ReactDOMServer.renderToString(
        React.createElement(app, {
            renderPathname: pathname,
            renderPage: Page,
        })
    );

    const fetchRequests = app.getFetchRequests();
    const data: Record<string, any> = {};
    for (const identifier in fetchRequests) {
        const [input, init, callback] = fetchRequests[identifier];

        const inputUrl =
            input instanceof Request
                ? input.url
                : input instanceof URL
                ? input.href
                : input;

        let response: Response;
        if (isAbsolute(inputUrl)) {
            response = (await fetch(
                input as Fetch.RequestInfo,
                init as Fetch.RequestInit
            )) as Response;
        } else {
            const filePath = path.join(process.cwd(), "public", inputUrl);
            const file = fs.readFileSync(filePath);
            response = new Response(file);
        }
        const result = await callback(response);
        data[identifier] = result;
    }

    const renderResult = ReactDOMServer.renderToString(
        React.createElement(app, {
            renderPathname: pathname,
            renderPage: Page,
            renderData: data,
        })
    );

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
            JSON.stringify(data).replace(/</g, "\\u003c") ;
        const firstScript = document.head.getElementsByTagName("script").item(0)!;
        document.head.insertBefore(newScript, firstScript);
    }

    fs.writeFileSync(filePath, dom.serialize(), "utf8");

    const relPath = path.relative(
        path.resolve(process.cwd(), "dist"),
        filePath
    );
    const stats = fs.statSync(filePath);
    const sizeInKiB = stats.size / 1024;

    logger.push(
        col("dist/", Color.Dim) +
            col(trim(relPath, 35), Color.FgCyan) +
            " ".repeat(5) +
            col(sizeInKiB.toFixed(2) + " KiB", Color.Dim)
    );
}

function getFilePath(pathname: string) {
    let filePath = path.resolve(outDirPath, path.relative("/pages", pathname));
    const basename = path.parse(filePath).name;

    if (basename === "index") {
        filePath = path.resolve(path.dirname(filePath), basename + ".html");
    } else if (basename.startsWith("_")) {
        filePath = path.resolve(
            path.dirname(filePath),
            basename.slice(1) + ".html"
        );
    } else {
        filePath = path.resolve(path.dirname(filePath), basename, "index.html");
    }

    return filePath;
}
