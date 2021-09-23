import {createHash} from "crypto";
import net from "net";

export function hash(data: string | Buffer | Uint8Array): string {
    return createHash("sha256").update(data).digest("base64");
}

export function randomToken(bytes: number = 32): string {
    const vals: Uint8Array = new Uint8Array(bytes);
    for (let i = 0; i < bytes; bytes++) {
        vals[i] = Math.floor(Math.random() * 256);
    }
    return Buffer.from(vals).toString("utf8");
}

export function getTotalHours(date: Date): number {
    return Math.floor(date.getTime() / (1000 * 60 * 60));
}

export function formatDuration(from: Date, to: Date): string {
    if (to.getTime() < from.getTime()) {
        throw new RangeError("Cannot format duration where `from > to`");
    }
    const hourDiff = getTotalHours(to) - getTotalHours(from);
    if (hourDiff > 0) {
        return `${hourDiff} hour${hourDiff === 1 ? "" : "s"} ago`;
    }
    const minDiff = to.getMinutes() - from.getMinutes();
    if (minDiff > 0) {
        return `${minDiff} minute${minDiff === 1 ? "" : "s"} ago`;
    }
    const secDiff = to.getSeconds() - from.getSeconds();
    if (secDiff > 0) {
        return `${secDiff} second${secDiff === 1 ? "" : "s"} ago`;
    }
    return "just now";
}

export function sendAndReceive(
    port: number,
    host: string,
    msg: string,
    stopNewline: boolean = false
): Promise<string> {
    return new Promise((res, rej) => {
        const sock = net.connect(port, host);
        sock.on("connect", function () {
            sock.write(msg);
        });
        let totalData = "";
        sock.on("data", function (chunk) {
            totalData += chunk.toString("utf8");
            if (stopNewline && totalData.includes("\n")) {
                sock.destroy();
            }
        });
        sock.on("close", function () {
            res(totalData);
        });
        sock.on("error", function (err) {
            rej(err);
        });
    });
}
