import puppeteer from "puppeteer";
import net from "net";
import path from "path";
import {v4 as uuid} from "uuid";
import fs from "fs/promises";

async function main() {
    const browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    async function makeVisit(
        url: string,
        cookies: puppeteer.Protocol.Network.CookieParam[]
    ) {
        const context = await browser.createIncognitoBrowserContext();
        const page = await context.newPage();
        await page.setCookie(...cookies);
        await page.goto(url);
        await page.waitForNetworkIdle({
            timeout: 5000,
        });
        await page.close();
        await context.close();
    }

    async function handleMessage(msg: any, conn: net.Socket) {
        function sendMsg(msg: unknown, exit: boolean = false) {
            conn.write(JSON.stringify(msg) + "\n");
            if (exit) {
                conn.destroy();
            }
        }
        function sendError(error: string) {
            sendMsg(
                {
                    type: "ERROR",
                    value: error,
                },
                true
            );
        }
        if (typeof msg !== "object") {
            sendError("Message must be a JSON object.");
            return;
        }
        if (!msg.type || typeof msg.type !== "string") {
            sendError("Message must have a valid type field.");
            return;
        }
        if (!("value" in msg)) {
            sendError("Message must have a value field.");
            return;
        }
        let cast = msg as {
            type: string;
            value: unknown;
        };
        if (cast.type === "VISIT") {
            const val = cast.value as {
                url: string;
                cookies: puppeteer.Protocol.Network.CookieParam[];
            };
            if (!val || !val.url || !val.cookies) {
                sendError("Visits must have a url and cookies field.");
                return;
            }
            try {
                await makeVisit(val.url, val.cookies);
                sendMsg({
                    type: "VISIT_RESULT",
                    value: true,
                });
            } catch (err) {
                console.error("Got error", err);
                sendMsg({
                    type: "VISIT_RESULT",
                    value: false,
                });
            }
        }
    }

    function sendAndReceive(
        port: number,
        host: string,
        msg: string
    ): Promise<string> {
        return new Promise((res, rej) => {
            const sock = net.connect(port, host);
            sock.on("connect", function () {
                sock.write(msg);
            });
            let totalData = "";
            sock.on("data", function (chunk) {
                totalData += chunk.toString("utf8");
            });
            sock.on("close", function () {
                res(totalData);
            });
            sock.on("error", function (err) {
                rej(err);
            });
        });
    }

    const server = net.createServer(function (conn) {
        let data = "";
        async function dataListener(chunk: Buffer) {
            data += chunk.toString("utf8");
            while (true) {
                const nl = data.indexOf("\n");
                if (nl !== -1) {
                    let totalData = data.slice(0, nl);
                    data = data.slice(nl + 1);
                    let parsed: unknown;
                    try {
                        parsed = JSON.parse(totalData);
                    } catch (err) {
                        conn.write(
                            JSON.stringify({
                                type: "ERROR",
                                value: "Message must be valid JSON.",
                            }) + "\n"
                        );
                        conn.destroy();
                        return;
                    }
                    await handleMessage(parsed, conn);
                } else {
                    break;
                }
            }
        }
        conn.on("data", dataListener);
    });
    server.on("error", function (err) {
        throw err;
    });
    const SOCKDIR = process.env.SOCKDIR;
    if (!SOCKDIR) {
        throw new Error("Must include SOCKDIR environment variable.");
    }
    const SOCKFILE = path.join(SOCKDIR, uuid() + ".sock");
    const LB_HOST = process.env.LB_HOST;
    if (!LB_HOST) {
        throw new Error("Must include LB_HOST environment variable.");
    }
    const LB_PORT = Number(process.env.LB_PORT);
    if (!LB_PORT) {
        throw new Error("Must include LB_PORT environment variable.");
    }
    const HEALTHCHECK_FREQ = Number(process.env.HEALTHCHECK_FREQ) || 20000;
    const connRes = await sendAndReceive(
        LB_PORT,
        LB_HOST,
        "r" + SOCKFILE + "\n"
    );
    if (connRes.trim() !== "f") {
        throw new Error(
            "Load balancer returned non-successful result on connection."
        );
    }
    setInterval(async function () {
        const connRes = await sendAndReceive(
            LB_PORT,
            LB_HOST,
            "h" + SOCKFILE + "\n"
        );
        if (connRes.trim() !== "f") {
            console.error(
                "WARNING: Healthcheck returned non-successful result."
            );
            const connRes = await sendAndReceive(
                LB_PORT,
                LB_HOST,
                "r" + SOCKFILE + "\n"
            );
            if (connRes.trim() !== "f") {
                throw new Error(
                    "Load balancer returned non-successful result on re-connection."
                );
            }
        }
    }, HEALTHCHECK_FREQ);
    await fs.writeFile("/tmp/sockfile", SOCKFILE + "\n", "utf8");
    try {
        await fs.unlink(SOCKFILE);
    } catch (err) {}
    server.listen(SOCKFILE, function () {
        console.log(`Server listening at socket ${SOCKFILE}.`);
    });
}

main();
