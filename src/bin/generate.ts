import fs from "fs-extra";
import path from "path";
import dayjs from "dayjs";
import { Task, trim } from "./cli-utils";
import parseMD from "parse-md";
import esbuild from "esbuild";

import type { AftConfig, PostInfo } from "afterthoughts";

const buildDirPath = path.resolve(process.cwd(), ".afterthoughts/build");
const generateDirPath = path.resolve(process.cwd(), "public/generate");
const dataDirPath = path.resolve(generateDirPath, "data");

export default async function generate() {
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

async function generateConfig() {
    await esbuild.build({
        entryPoints: [path.resolve(process.cwd(), "user/config.ts")],
        bundle: false,
        format: "esm",
        outfile: path.resolve(buildDirPath, "config.js"),
    });

    const config: AftConfig = (
        await import(path.resolve(buildDirPath, "config.js"))
    ).default;
    fs.writeFileSync(
        path.resolve(generateDirPath, "config.json"),
        JSON.stringify(config)
    );
    return config;
}

async function generatePosts(config: AftConfig) {
    const postsPath = path.resolve(process.cwd(), "user/posts");
    fs.copySync(postsPath, path.resolve(generateDirPath, "posts"));

    const posts: PostInfo[] = [];

    const postsDir = fs.readdirSync(postsPath);
    for (const postFilename of postsDir) {
        const postFile = fs.readFileSync(
            path.join(postsPath, postFilename),
            "utf8"
        );
        const { metadata, content } = parseMD(postFile);
        const filename = path.parse(postFilename).name;
        const synopsis = trim(content, config.posts.synopsisMaxLength);

        posts.push({
            filename,
            metadata: metadata as Record<string, string>,
            synopsis,
        });
    }

    posts.sort(
        (a, b) =>
            dayjs(getMetaEntry(b.filename, b.metadata, "date")).unix() -
            dayjs(getMetaEntry(a.filename, a.metadata, "date")).unix()
    );

    const numPerPage = config.posts.numPerPage;
    const chunks = splitArray(posts, numPerPage);

    const postsData = {
        numPages: chunks.length,
    };
    fs.writeFileSync(
        path.resolve(dataDirPath, "posts.json"),
        JSON.stringify(postsData),
        "utf8"
    );

    fs.mkdirSync(path.resolve(dataDirPath, "posts"));
    for (let i = 0; i < chunks.length; i++) {
        fs.writeFileSync(
            path.resolve(dataDirPath, "posts", `${i + 1}.json`),
            JSON.stringify(chunks[i]),
            "utf8"
        );
    }
}

function getMetaEntry(
    filename: string,
    metadata: any,
    key: string,
    throwsErr?: boolean
) {
    const result = metadata[key];
    if (result !== undefined || !throwsErr) {
        return result;
    } else {
        throw Error(`metadata ${key} does not exist in file ${filename}`);
    }
}

function splitArray<T>(arr: T[], chunkSize: number) {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        chunks.push(chunk);
    }
    return chunks;
}
