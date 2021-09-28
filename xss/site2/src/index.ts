import express, {Response} from "express";
import exphbs from "express-handlebars";
import cookieParser from "cookie-parser";
import {hash, formatDuration, sendAndReceive} from "./util.js";
import {User, Site} from "./types.js";
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

let FLAG: string;
if (!process.env.FLAG) {
    console.error("WARNING: No FLAG env var. Using placeholder flag instead.");
    FLAG = "flag{placeholder_flag}";
} else {
    FLAG = process.env.FLAG;
}

const PORT = process.env.PORT;
const EXPIRATION_TIME =
    Number(process.env.EXPIRATION_TIME) || 24 * 60 * 60 * 1000;

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

const users: Record<string, User> = {};
const sites: Record<string, Site> = {};
const ADMIN_ID = uuid();
users[ADMIN_ID] = {
    sites: {},
    created: new Date(),
    id: ADMIN_ID
};

app.use(cookieParser());
app.use(express.urlencoded({extended: false}));
app.use(function (req, res, next) {
    // stay protected
    res.set("X-Frame-Options", "DENY");
    res.set("Content-Security-Policy", "default-src 'self'; frame-src 'none'; script-src 'self' https://www.google.com/recaptcha/api.js");

    const token: string | undefined = req.cookies.sessid;
    let user: User;
    if (!token || !(token in users)) {
        const newToken = uuid();
        user = {
            sites: {},
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
        sites: Object.entries((res.locals.user as User).sites)
            .sort((a, b) => b[1].created.getTime() - a[1].created.getTime())
            .map((x) => ({
                id: x[1].id,
                time: formatDuration(x[1].created, new Date()),
            })),
        error,
        text,
    });
}

function getSiteContent(site: Site): string {
    return site.content;
}

app.get("/", function (req, res) {
    renderHome(res);
});

app.get("/flag", function (req, res) {
    if (req.cookies.sessid === ADMIN_ID) {
        res.type("text/plain").send(FLAG);
    } else {
        res.type("text/plain").status(401).send("no flag for you :)");
    }
});

app.post("/site", function (req, res) {
    if (!req.body.content || typeof req.body.content !== "string") {
        res.status(400);
        renderHome(res, "Must include a non-empty site content.");
        return;
    }
    if (req.body.content.length > 1500) {
        res.status(400);
        renderHome(res, "Content must be at most 1500 chars.");
        return;
    }
    const user: User = res.locals.user;
    let content = req.body.content.trim();
    const siteHash = hash(content);
    if (siteHash in user.sites) {
        res.status(400);
        renderHome(res, "Site with identical content already exists.");
        return;
    }
    const id = uuid();
    const site: Site = {
        type: req.body.type,
        content: content,
        created: new Date(),
        id,
        hash: siteHash,
    };
    sites[site.id] = site;
    user.sites[site.hash] = site;
    res.redirect("/");
});

app.get("/api/sites/raw/:siteid", function (req, res) {
    if (!(req.params.siteid in sites)) {
        res.status(400).send("Could not find note.");
        return;
    }
    const site = sites[req.params.siteid];
    res.send(site.content);
});

app.get("/sites/:siteid", function (req, res) {
    if (!(req.params.siteid in sites)) {
        res.status(400).render("error_page", {
            error: "Could not find note.",
        });
        return;
    }
    const site = sites[req.params.siteid];
    res.type("text/html").send(getSiteContent(site));
});

app.get("/report/:siteid", function (req, res) {
    if (!(req.params.siteid in sites)) {
        res.status(400).render("error_page", {
            error: "Could not find site.",
        });
        return;
    }
    // disable csp on report site to run recaptcha scripts
    res.set("Content-Security-Policy", "");
    res.render("report", {
        recaptcha: RECAPTCHA_KEYS,
        id: req.params.siteid,
    });
});

app.post("/report/:siteid", async function (req, res) {
    if (!(req.params.siteid in sites)) {
        res.status(400).render("error_page", {
            error: "Could not find site.",
        });
        return;
    }
    const site = sites[req.params.siteid];
    const captcha = req.body["g-recaptcha-response"];
    if (RECAPTCHA_KEYS && (!captcha || typeof captcha !== "string")) {
        res.status(400).render("report", {
            recaptcha: RECAPTCHA_KEYS,
            id: req.params.siteid,
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
                id: req.params.siteid,
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
                    url: SELF_LOC + "sites/" + req.params.siteid,
                    cookies: [
                        {
                            name: "sessid",
                            value: ADMIN_ID,
                            sameSite: "Strict",
                            httpOnly: true,
                            domain: SELF_DOMAIN,
                        },
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
            id: req.params.siteid,
            error: "The report failed. Try reporting again?",
        });
    }
});

app.use(express.static("./static"));

// cleanup
setInterval(function () {
    const threshold = Date.now() - EXPIRATION_TIME;
    for (const key in users) {
        // don't remove admin
        if (key === ADMIN_ID) {
            continue;
        }
        if (users[key].created.getTime() < threshold) {
            delete users[key];
        }
    }
    for (const key in sites) {
        if (sites[key].created.getTime() < threshold) {
            delete sites[key];
        }
    }
}, 15000);

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}.`);
    console.log(`Using flag ${FLAG}.`);
    if (RECAPTCHA_KEYS) {
        console.log(
            `Using RECAPTCHA site key "${RECAPTCHA_KEYS.site}" and secret key "${RECAPTCHA_KEYS.secret}".`
        );
    } else {
        console.log("RECAPTCHA disabled.");
    }
});
