import path from "path";
import fs from "fs";
import nodeFetch from "node-fetch";

import type * as NodeFetch from "node-fetch";
import { PageParams } from "afterthoughts";

export async function fetch(
    input: RequestInfo | URL,
    init?: RequestInit | undefined
): Promise<Response> {
    const inputUrl =
        input instanceof Request
            ? input.url
            : input instanceof URL
            ? input.href
            : input;

    return isAbsoluteUrl(inputUrl)
        ? ((await nodeFetch(
              input as NodeFetch.RequestInfo,
              init as NodeFetch.RequestInit
          )) as Response)
        : new Response(
              fs.readFileSync(path.join(process.cwd(), "public", inputUrl))
          );
}
globalThis.fetch = fetch;

const reg = new RegExp("^(?:[a-z+]+:)?//", "i");
export function isAbsoluteUrl(url: string) {
    return reg.test(url);
}

export function getOutputFilePath(pathname: string) {
    const outDirPath = path.resolve(process.cwd(), "dist");
    let filePath = path.join(outDirPath, pathname);
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

export function getNameParams(basename: string) {
    const params: string[] = [];
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

export function fillPathParams(
    pathname: string,
    params: Record<string, string>
) {
    let result = pathname;
    for (const param in params) {
        result = result.replace(`{${param}}`, params[param]);
    }
    return result;
}

function splitParamValues(
    key: string,
    values: any[]
): Record<string, string>[] {
    return values.map((value) => ({
        [key]: String(value),
    }));
}

export function getParamCombs(params: PageParams) {
    const paramCombs: Record<string, string>[][] = Object.keys(params).map(
        (key) => {
            const values = params[key];

            if (Array.isArray(values)) {
                const split = splitParamValues(key, values);
                return split;
            }

            const thisParamCombs = splitParamValues(key, values.values);

            const results: Record<string, string>[] = [];
            for (const recordX of thisParamCombs) {
                const childrenParams =
                    values.children instanceof Function
                        ? values.children(recordX[key])
                        : values.children;
                const childrenParamCombs = getParamCombs(childrenParams);
                for (const recordY of childrenParamCombs) {
                    results.push({ ...recordX, ...recordY });
                }
            }
            return results;
        }
    );

    return paramCombs.reduce((x, y) => {
        const results: Record<string, string>[] = [];
        for (const recordX of x) {
            for (const recordY of y) {
                results.push({ ...recordX, ...recordY });
            }
        }
        return results;
    });
}
