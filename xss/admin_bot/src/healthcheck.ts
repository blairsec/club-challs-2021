import net from "net";
import http from "http";
import fs from "fs/promises";
import {URL} from "url";

export function sendAndReceive(
    socket: string,
    msg: string,
    stopNewline: boolean = false
): Promise<string> {
    return new Promise((res, rej) => {
        const sock = net.connect(socket);
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

const PORT = 1337;
const HOST = "127.0.0.1";
const ALPHA = "abcdefghijklmnopqrstuvwxyz";

const visitedPaths: Set<String> = new Set();
const server = http.createServer((req, res) => {
    visitedPaths.add(new URL(req.url!, "http://a").pathname);
    res.end("good");
});

async function main() {
    let rand = "";
    for (let i = 0; i < 32; i++) {
        rand += ALPHA[Math.floor(Math.random() * ALPHA.length)];
    }
    const visitRes = await sendAndReceive(
        (await fs.readFile("/tmp/sockfile", "utf8")).trim(),
        JSON.stringify({
            type: "VISIT",
            value: {
                url: `http://${HOST}:${PORT}/${rand}`,
                cookies: [],
            },
        }) + "\n",
        true
    );
    const parsedVisit = JSON.parse(visitRes.trim());
    if (parsedVisit.type !== "VISIT_RESULT" || !parsedVisit.value) {
        throw new Error("Visit failed.");
    }
    if (!visitedPaths.has("/" + rand)) {
        throw new Error("Random path not visited.");
    }
    console.log("Healthcheck passed.");
    server.close();
}

server.listen(PORT, "0.0.0.0", main);
