import path from "path";
import fs from "fs";
import nodeFetch from "node-fetch";
import { PageParams } from "afterthoughts";

import type * as NodeFetch from "node-fetch";
import type ReactNS from "react";

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

const outputPathnameMap: Record<string, string[]> = {};

export async function getOutputDirPathnames(
    input: string,
    pages: Record<
        string,
        () => Promise<{
            default: ReactNS.ComponentType<any>;
        }>
    >
) {
    if (input in outputPathnameMap) {
        return outputPathnameMap[input];
    }

    const parentPathname = path.dirname(input);
    const outParentPathnames =
        parentPathname !== "/"
            ? await getOutputDirPathnames(parentPathname, pages)
            : ["/"];

    const basename = path.basename(input);
    const nameParams = getNameParams(basename);

    const result: string[] = [];

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

        const module: any = await pages[modulePath]();
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
                result.push(
                    fillPathParams(path.join(outParentPathname, basename), comb)
                );
            }
        }
    } else {
        for (const outParentPathname of outParentPathnames) {
            result.push(path.join(outParentPathname, basename));
        }
    }

    outputPathnameMap[input] = result;
    return result;
}
