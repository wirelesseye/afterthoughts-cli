import * as vite from "vite";
import path from "path";
import url from "url";
import { printLn, Task } from "./cli-utils";

const dirname = url.fileURLToPath(new URL(".", import.meta.url));
const viteConfig = (
    await vite.loadConfigFromFile(
        {
            command: "serve",
            mode: "production",
        },
        path.resolve(dirname, "../vite.config.ts")
    )
)?.config;

export default async function preview() {
    const server = await new Task("Starting preview server", () =>
        vite.preview(viteConfig)
    ).start();

    printLn();
    server.printUrls();
    printLn();
}
