import express, {Response} from "express";
import exphbs from "express-handlebars";
import cookieParser from "cookie-parser";
import {hash, formatDuration, sendAndReceive} from "./util.js";
import {User, Note} from "./types.js";
import {v4 as uuid} from "uuid";
import fetch from "node-fetch";

const app = express();

app.engine(
    "hbs",
    exphbs({
        extname: "hbs",
    })
);
app.set("view engine", "hbs");

if (!process.env.PORT) {
    throw new Error("Must put port or unix socket in PORT env var.");
}

const PORT = process.env.PORT;
const EXPIRATION_TIME =
    Number(process.env.EXPIRATION_TIME) || 24 * 60 * 60 * 1000;
const LEVELS_TO_NAME: Record<string, string> = {
    STATIC: "static note",
    DYNAMIC: "dynamic note",
    IMAGE: "image note",
    FILTERED: "filtered note",
};
const LEVELS = Object.keys(LEVELS_TO_NAME);

if (!process.env.FLAGS) {
    console.error(
        "WARNING: Should put JSON object mapping levels to flags or JSON string with flag in FLAGS env var."
    );
}

const FLAGS: Record<string, string> = {};
for (const level of LEVELS) {
    FLAGS[level] = "flag{placeholder_flag}";
}
let parsedFlag: any;
try {
    parsedFlag = JSON.parse(process.env.FLAGS!);
    if (typeof parsedFlag === "string") {
        for (const level of LEVELS) {
            FLAGS[level] = parsedFlag;
        }
    } else if (typeof parsedFlag === "object") {
        for (const level of LEVELS) {
            if (!(level in parsedFlag)) {
                console.error(
                    `WARNING: Level ${level} not specified in FLAGS. Using placeholder flag instead.`
                );
            } else {
                FLAGS[level] = parsedFlag[level];
            }
        }
    } else {
        console.error(
            "WARNING: FLAGS env var is neither JSON object nor string. Using placeholder flags instead."
        );
    }
} catch (err) {
    console.error("WARNING: FLAGS env var isn't valid JSON. Ignoring.");
}
let COOKIE_FLAG: string | null = null;
if (process.env.COOKIE_FLAG) {
    COOKIE_FLAG = process.env.COOKIE_FLAG;
}

let RECAPTCHA_KEYS: {
    site: string;
    secret: string;
} | null = null;
if (process.env.RECAPTCHA_KEYS) {
    const [site, secret] = process.env.RECAPTCHA_KEYS.split(":");
    if (!site || !secret) {
        console.error(
            "WARNING: RECAPTCHA_KEYS needs to be in the format site_key:secret_key. Ignoring."
        );
    } else {
        RECAPTCHA_KEYS = {
            site,
            secret,
        };
    }
}
const LB_HOST = process.env.LB_HOST;
if (!LB_HOST) {
    throw new Error("Must include LB_HOST environment variable.");
}
const LB_PORT = Number(process.env.LB_PORT);
if (!LB_PORT) {
    throw new Error("Must include LB_PORT environment variable.");
}
let SELF_LOC = process.env.SELF_LOC;
if (!SELF_LOC) {
    throw new Error("Must include SELF_LOC environment variable.");
}
if (!SELF_LOC.endsWith("/")) {
    SELF_LOC += "/";
}
const SELF_DOMAIN = SELF_LOC.split("://")[1].split("/")[0];

const adminIds: Record<string, string> = {};
const revAdminIds: Record<string, string> = {};
const users: Record<string, User> = {};
const notes: Record<string, Note> = {};
for (const level of LEVELS) {
    const id = uuid();
    adminIds[level] = id;
    revAdminIds[id] = level;
    users[id] = {
        notes: {},
        created: new Date(),
        id,
    };
}

app.use(cookieParser());
app.use(express.urlencoded({extended: false}));
app.use(function (req, res, next) {
    const token: string | undefined = req.cookies.sessid;
    let user: User;
    if (!token || !(token in users)) {
        const newToken = uuid();
        user = {
            notes: {},
            created: new Date(),
            id: newToken,
        };
        users[newToken] = user;
        res.cookie("sessid", newToken, {
            httpOnly: true,
            sameSite: "strict",
            expires: new Date(Date.now() + EXPIRATION_TIME),
        });
    } else {
        user = users[token];
    }
    res.locals.user = user;
    next();
});

function renderHome(res: Response, error?: string, text: string = "") {
    res.render("home", {
        levels: Object.entries(LEVELS_TO_NAME),
        notes: Object.entries((res.locals.user as User).notes)
            .sort((a, b) => b[1].created.getTime() - a[1].created.getTime())
            .map((x) => ({
                type: x[1].type,
                typename: LEVELS_TO_NAME[x[1].type],
                id: x[1].id,
                time: formatDuration(x[1].created, new Date()),
            })),
        error,
        text,
    });
}

function getNoteContent(note: Note): string {
    if (note.type === "IMAGE") {
        return `<img src="${note.content}">`;
    } else {
        return note.content;
    }
}

app.get("/", function (req, res) {
    renderHome(res);
});

app.get("/flag", function (req, res) {
    const adminLevel = revAdminIds[req.cookies.sessid];
    if (adminLevel) {
        res.type("text/plain").send(FLAGS[adminLevel]);
    } else {
        res.type("text/plain").status(401).send("no flag for you :)");
    }
});

app.post("/note", function (req, res) {
    if (!req.body.content || typeof req.body.content !== "string") {
        res.status(400);
        renderHome(res, "Must include a non-empty note content.");
        return;
    }
    if (
        !req.body.type ||
        typeof req.body.type !== "string" ||
        !(req.body.type in LEVELS_TO_NAME)
    ) {
        res.status(400);
        renderHome(res, "Must include a valid note type.");
        return;
    }
    if (req.body.content.length > 500) {
        res.status(400);
        renderHome(res, "Content must be at most 500 chars.");
        return;
    }
    const user: User = res.locals.user;
    let content = req.body.content.trim();
    const noteHash = hash(req.body.type + " " + content);
    if (noteHash in user.notes) {
        res.status(400);
        renderHome(res, "Note with identical type and content already exists.");
        return;
    }
    const id = uuid();
    const note: Note = {
        type: req.body.type,
        content: content,
        created: new Date(),
        id,
        hash: noteHash,
    };
    if (note.type === "FILTERED") {
        const normalized = note.content.toLowerCase();
        for (const ban of [
            "script",
            "img",
            "onerror",
            "iframe",
            "fetch",
            "window",
            "eval",
            "function",
            "then",
            "{",
            "}",
            "xmlhttprequest",
            "navigator",
            "location",
            "self",
        ]) {
            if (normalized.includes(ban)) {
                res.status(400);
                renderHome(
                    res,
                    `Filtered notes can't contain \"${ban}\".`,
                    note.content
                );
                return;
            }
        }
    }
    notes[note.id] = note;
    user.notes[note.hash] = note;
    res.redirect("/");
});

app.get("/api/notes/:noteid", function (req, res) {
    if (!(req.params.noteid in notes)) {
        res.status(400).send("Could not find note.");
        return;
    }
    const note = notes[req.params.noteid];
    res.send(getNoteContent(note));
});

app.get("/api/notes/raw/:noteid", function (req, res) {
    if (!(req.params.noteid in notes)) {
        res.status(400).send("Could not find note.");
        return;
    }
    const note = notes[req.params.noteid];
    res.send(note.content);
});

app.get("/notes/:noteid", function (req, res) {
    if (!(req.params.noteid in notes)) {
        res.status(400).render("error_page", {
            error: "Could not find note.",
        });
        return;
    }
    const note = notes[req.params.noteid];
    if (note.type === "STATIC") {
        res.render("static_note", {
            content: getNoteContent(note),
            id: note.id,
        });
    } else if (["DYNAMIC", "IMAGE", "FILTERED"].includes(note.type)) {
        res.render("dynamic_note", {
            id: note.id,
        });
    } else {
        res.status(400);
        res.render("error_page", {
            error: "Unrenderable note type.",
        });
        return;
    }
});

app.get("/report/:noteid", function (req, res) {
    if (!(req.params.noteid in notes)) {
        res.status(400).render("error_page", {
            error: "Could not find note.",
        });
        return;
    }
    res.render("report", {
        recaptcha: RECAPTCHA_KEYS,
        id: req.params.noteid,
    });
});

app.post("/report/:noteid", async function (req, res) {
    if (!(req.params.noteid in notes)) {
        res.status(400).render("error_page", {
            error: "Could not find note.",
        });
        return;
    }
    const note = notes[req.params.noteid];
    const captcha = req.body["g-recaptcha-response"];
    if (RECAPTCHA_KEYS && (!captcha || typeof captcha !== "string")) {
        res.status(400).render("report", {
            recaptcha: RECAPTCHA_KEYS,
            id: req.params.noteid,
            error: "Missing RECAPTCHA. Is Javascript enabled?",
        });
        return;
    }
    if (RECAPTCHA_KEYS) {
        const validation = (await fetch(
            "https://www.google.com/recaptcha/api/siteverify",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    secret: RECAPTCHA_KEYS.secret,
                    response: captcha,
                }).toString(),
            }
        ).then((res) => res.json())) as {success: boolean};
        if (!validation.success) {
            res.status(400).render("report", {
                recaptcha: RECAPTCHA_KEYS,
                id: req.params.noteid,
                error: "Invalid RECAPTCHA. Try submitting again?",
            });
            return;
        }
    }
    const visitRes = await sendAndReceive(
        LB_PORT,
        LB_HOST,
        "c" +
            JSON.stringify({
                type: "VISIT",
                value: {
                    url: SELF_LOC + "notes/" + req.params.noteid,
                    cookies: [
                        {
                            name: "sessid",
                            value: adminIds[note.type],
                            sameSite: "Strict",
                            httpOnly: true,
                            domain: SELF_DOMAIN,
                        },
                        ...(COOKIE_FLAG
                            ? [
                                  {
                                      name: "cookie_flag",
                                      value: COOKIE_FLAG,
                                      sameSite: "Strict",
                                      httpOnly: false,
                                      domain: SELF_DOMAIN,
                                  },
                              ]
                            : []),
                    ],
                },
            }) +
            "\n",
        true
    );
    const parsedVisit = JSON.parse(visitRes.trim());
    if (parsedVisit.type === "VISIT_RESULT" && parsedVisit.value) {
        res.redirect("/");
    } else {
        res.status(400).render("report", {
            recaptcha: RECAPTCHA_KEYS,
            id: req.params.noteid,
            error: "The report failed. Try reporting again?",
        });
    }
});

app.use(express.static("./static"));

// cleanup
setInterval(function () {
    const threshold = Date.now() - EXPIRATION_TIME;
    for (const key in users) {
        // don't remove admins
        if (key in revAdminIds) {
            continue;
        }
        if (users[key].created.getTime() < threshold) {
            delete users[key];
        }
    }
    for (const key in notes) {
        if (notes[key].created.getTime() < threshold) {
            delete notes[key];
        }
    }
}, 15000);

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}.`);
    if (COOKIE_FLAG) {
        console.log("Using cookie flag: " + COOKIE_FLAG);
    } else {
        console.log("Cookie flag disabled.");
    }
    console.log("Loaded flags:");
    for (const level of LEVELS) {
        console.log(` - ${level}: ${FLAGS[level]}`);
    }
    if (RECAPTCHA_KEYS) {
        console.log(
            `Using RECAPTCHA site key "${RECAPTCHA_KEYS.site}" and secret key "${RECAPTCHA_KEYS.secret}".`
        );
    } else {
        console.log("RECAPTCHA disabled.");
    }
});
