import * as vite from "vite";
import path from "path";
import url from "url";
import { printLn, Task } from "./cli-utils";

const dirname = url.fileURLToPath(new URL(".", import.meta.url));
const viteConfig = (
    await vite.loadConfigFromFile(
        {
            command: "serve",
            mode: "development",
        },
        path.resolve(dirname, "../vite.config.js")
    )
)?.config;

export default async function dev() {
    const server = await new Task("Starting development server", () =>
        vite.createServer(viteConfig).then((server) => server.listen())
    ).start();

    printLn();
    server.printUrls();
    printLn();
}
