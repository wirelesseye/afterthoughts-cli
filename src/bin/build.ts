import * as vite from "vite";
import path from "path";
import fs from "fs";
import url from "url";
import { JSDOM } from "jsdom";

import { col, Color, Logger, Task, trim } from "./cli-utils";
import generate from "./generate";

import { AftApp, getPathParams, PageParams, PageType } from "afterthoughts";
import type ReactNS from "react";
import type ReactDOMServerNS from "react-dom/server";
import {
    getOutputFilePath,
    fetch,
    getParamCombs,
    fillPathParams,
    getOutputDirPathnames,
} from "./build-utils";

const React: typeof ReactNS = (
    await import(path.resolve(process.cwd(), "node_modules/react/index.js"))
).default;
const ReactDOMServer: typeof ReactDOMServerNS = (
    await import(
        path.resolve(process.cwd(), "node_modules/react-dom/server.js")
    )
).default;

const dirname = url.fileURLToPath(new URL(".", import.meta.url));
const productionConfig = (await vite.loadConfigFromFile(
    {
        command: "build",
        mode: "production",
    },
    path.resolve(dirname, "../vite.config.js")
))!.config;
productionConfig.logLevel = "error";
const prerenderConfig = (await vite.loadConfigFromFile(
    {
        command: "build",
        mode: "prerender",
    },
    path.resolve(dirname, "../vite.prerender.config.js")
))!.config;
prerenderConfig.logLevel = "error";

const logger = new Logger();

export default async function build() {
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
    if (fs.existsSync(buildPath)) {
        fs.rmSync(buildPath, { recursive: true, force: true });
    }
    await vite.build(prerenderConfig);
}

async function buildStaticPages() {
    const app: AftApp = (
        await import(path.resolve(process.cwd(), ".afterthoughts/build/app.js"))
    ).default;
    const template = fs.readFileSync(
        path.resolve(process.cwd(), "dist/index.html"),
        "utf8"
    );
    const pages = app.pages;

    for (const filepath in pages) {
        await buildPage(app, template, filepath, pages);
    }
}

async function buildPage(
    app: AftApp,
    template: string,
    filepath: string,
    pages: Record<string, () => Promise<PageType>>
) {
    // import module
    const module = await pages[filepath]();
    const Page = module.default;
    if (Page === undefined) {
        return;
    }

    const pathname = path.join("/", path.relative("/pages", filepath));
    const basename = path.basename(pathname);
    const parentPathnames = await getOutputDirPathnames(
        path.dirname(pathname),
        pages
    );

    const pathParams = getPathParams(basename);
    if (pathParams.length > 0) {
        const getPageParams: (parent: string) => Promise<PageParams> =
            module.getPageParams;
        if (getPageParams === undefined) {
            throw Error(
                `page '${pathname}' has parameters but does not provide a 'getPageParams' function`
            );
        }

        for (const parentPathname of parentPathnames) {
            const parent = path.basename(parentPathname);
            const pageParams = await getPageParams(parent);
            const paramCombs = getParamCombs(pageParams);
            if (paramCombs.length === 0) {
                continue;
            }

            for (const key of pathParams) {
                if (paramCombs[0][key] === undefined) {
                    throw Error(
                        `the 'getPageParams' function of page '${pathname}' does not return the values of parameter '${key}'`
                    );
                }
            }

            for (const comb of paramCombs) {
                const subpageBasename = fillPathParams(basename, comb);
                const subpagePathname = path.join(
                    parentPathname,
                    subpageBasename
                );
                await buildSubpage(app, template, subpagePathname, Page, comb);
            }
        }
    } else {
        for (const parentPathname of parentPathnames) {
            const subpagePathname = path.join(parentPathname, basename);
            await buildSubpage(app, template, subpagePathname, Page, {});
        }
    }
}

async function buildSubpage(
    app: AftApp,
    template: string,
    pathname: string,
    Page: React.ComponentType<any>,
    params: Record<string, string>
) {
    // new document from template
    const dom = new JSDOM(template);
    const document = dom.window.document;
    globalThis.document = document;

    // get output file path
    const outputFilePath = getOutputFilePath(pathname);
    if (!fs.existsSync(path.dirname(outputFilePath))) {
        fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
    }

    // first rendering, to get preload fetches
    const headTags: React.ReactElement[] = [];

    app.resetPreloadDataMap();
    ReactDOMServer.renderToString(
        React.createElement(app, {
            renderPathname: pathname,
            renderPage: Page,
            renderParams: params,
            renderHeadTags: headTags,
        })
    );
    const preloadFetches = app.getPreloadDataMap();

    // fetch data
    const data: Record<string, any> = {};
    for (const identifier in preloadFetches) {
        const { input, init, callback } = preloadFetches[identifier];
        const res = await fetch(input, init);
        data[identifier] = await callback(res);
    }

    // second rendering
    const renderResult = ReactDOMServer.renderToString(
        React.createElement(app, {
            renderPathname: pathname,
            renderPage: Page,
            renderParams: params,
            renderHeadTags: headTags,
            renderData: data,
        })
    );

    // render head
    const headContent = ReactDOMServer.renderToString(headTags as any);

    // inject rendering results into the template
    const root = document.getElementById("root");
    if (!root) {
        throw Error("cannot find root element");
    }
    root.innerHTML = renderResult;
    document.head.innerHTML += headContent;

    // inject preload data
    if (Object.keys(data).length > 0) {
        const newScript = document.createElement("script");
        newScript.id = "preload-data";
        newScript.innerHTML =
            "window.__PRELOADED_DATA__=" +
            JSON.stringify(data).replace(/</g, "\\u003c");
        const firstScript = document.head
            .getElementsByTagName("script")
            .item(0)!;
        document.head.insertBefore(newScript, firstScript);
    }

    // write to html file
    fs.writeFileSync(outputFilePath, dom.serialize(), "utf8");

    // print message
    const relPath = path.relative(
        path.resolve(process.cwd(), "dist"),
        outputFilePath
    );
    const stats = fs.statSync(outputFilePath);
    const sizeInKiB = stats.size / 1024;

    logger.push(
        col("dist/", Color.Dim) +
            col(trim(relPath, 35), Color.FgCyan) +
            " ".repeat(5) +
            col(sizeInKiB.toFixed(2) + " KiB", Color.Dim)
    );
}
