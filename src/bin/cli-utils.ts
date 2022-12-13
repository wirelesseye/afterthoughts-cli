import { stdout } from "process";
import { setInterval } from "timers";

export class Task<T> {
    private static SPINNER_FRAMES = [
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

    private interval: NodeJS.Timer | null = null;
    private frame: number = 0;
    private msg;
    private task: () => Promise<T>;

    constructor(msg: string, task: () => Promise<T>) {
        this.msg = msg;
        this.task = task;
    }

    private update() {
        stdout.clearLine(0);
        stdout.cursorTo(0);
        print(`${this.spinner()} ${this.msg}...`);
        this.frame++;
        if (this.frame >= Task.SPINNER_FRAMES.length) {
            this.frame = 0;
        }
    }

    private spinner(c?: string) {
        return col(c ? c : Task.SPINNER_FRAMES[this.frame], Color.FgGreen);
    }

    public async start() {
        this.interval = setInterval(this.update.bind(this), 30);
        this.frame = 0;
        this.update();
        const result = await this.task();
        this.complete();
        return result;
    }

    public complete(clear?: boolean) {
        if (this.interval) clearInterval(this.interval);
        stdout.clearLine(0);
        stdout.cursorTo(0);
        if (!clear) {
            printLn(`${this.spinner("✓")} ${this.msg}`);
        }
    }
}

export class Logger {
    private logs: string[] = [];

    public push(msg: string) {
        this.logs.push(msg);
    }

    public print() {
        for (const msg of this.logs) {
            printLn(msg);
        }
    }

    public clear() {
        this.logs = [];
    }
}

export enum Color {
    Reset = "\x1b[0m",
    Bright = "\x1b[1m",
    Dim = "\x1b[2m",
    Underscore = "\x1b[4m",
    Blink = "\x1b[5m",
    Reverse = "\x1b[7m",
    Hidden = "\x1b[8m",

    FgBlack = "\x1b[30m",
    FgRed = "\x1b[31m",
    FgGreen = "\x1b[32m",
    FgYellow = "\x1b[33m",
    FgBlue = "\x1b[34m",
    FgMagenta = "\x1b[35m",
    FgCyan = "\x1b[36m",
    FgWhite = "\x1b[37m",

    BgBlack = "\x1b[40m",
    BgRed = "\x1b[41m",
    BgGreen = "\x1b[42m",
    BgYellow = "\x1b[43m",
    BgBlue = "\x1b[44m",
    BgMagenta = "\x1b[45m",
    BgCyan = "\x1b[46m",
    BgWhite = "\x1b[47m",
}

export function print(s: string | Uint8Array) {
    stdout.write(s);
}

export function printLn(s?: string | Uint8Array) {
    if (s === undefined) {
        print("\n");
    } else {
        print(s + "\n");
    }
}

export function col(s: string, c: Color) {
    return c + s + Color.Reset;
}

export function trim(s: string, length: number) {
    if (s.length > length) {
        return s.slice(0, length - 3) + "...";
    } else if (s.length < length) {
        return s + " ".repeat(length - s.length);
    } else {
        return s;
    }
}
