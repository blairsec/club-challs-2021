import express, {NextFunction, Request, Response} from "express";
import exphbs from "express-handlebars";
import cookieParser from "cookie-parser";
import {v4 as uuid} from "uuid";
import sqlite3 from "better-sqlite3";
import fs from "fs";

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

if (!process.env.FLAGS) {
    console.error(
        "WARNING: Should put JSON object mapping levels to flags or JSON string with flag in FLAGS env var."
    );
}

const LEVELS = ["ERROR", "DB", "DB_COL", "DB_TBL", "PW"];
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

// please don't try to brute force these :)
const COL_NAME = "supersecret" + Math.floor(Math.random() * 1000000000);
const TBL_NAME = "supersecret" + Math.floor(Math.random() * 1000000000);
const TBL_COL_NAME = "supersecret" + Math.floor(Math.random() * 1000000000);

try {
    fs.unlinkSync("login.db");
} catch (err) {}
try {
    fs.unlinkSync("factors.db");
} catch (err) {}

let loginDb = sqlite3("login.db");
let factorsDb = sqlite3("factors.db");
loginDb.exec("CREATE TABLE Users (username text, password text, sessid text)");
for (const [username, password] of [
    ["adam", uuid()],
    ["admin", FLAGS.PW],
    ["bob", uuid()],
    ["claire", uuid()],
]) {
    loginDb
        .prepare(
            "INSERT INTO Users (username, password, sessid) VALUES (?, ?, ?)"
        )
        .run(username, password, uuid());
}
factorsDb.exec(
    `CREATE TABLE Factors (number text, factors text, ${COL_NAME} text)`
);
factorsDb.exec(`CREATE TABLE ${TBL_NAME} (${TBL_COL_NAME} text)`);
for (const [num, facts] of [
    ["5", "5"],
    ["9", "3 * 3"],
    ["123", "3 * 41"],
    ["420", "2 * 2 * 3 * 5 * 7"],
    ["1337", "7 * 191"],
    ["31337", "31337"],
    ["13371337", "7 * 73 * 137 * 191"],
    ["1234567890", "2 * 3 * 3 * 5 * 3607 * 3803"],
]) {
    factorsDb
        .prepare(
            `INSERT INTO FACTORS (number, factors, ${COL_NAME}) VALUES (?, ?, 'not the flag')`
        )
        .run(num, facts);
}
factorsDb
    .prepare(
        `INSERT INTO Factors (number, factors, ${COL_NAME}) VALUES ('flag', ?, ?)`
    )
    .run(
        FLAGS.DB + " - your flag's in another column >:)",
        FLAGS.DB_COL + " - your flag's in another table >:)"
    );
factorsDb
    .prepare(`INSERT INTO ${TBL_NAME} (${TBL_COL_NAME}) VALUES (?)`)
    .run(FLAGS.DB_TBL + " - your flag's in the admin password >:)");

// no dropping tables >:(
loginDb.close();
loginDb = sqlite3("login.db", {
    readonly: true,
});
factorsDb.close();
factorsDb = sqlite3("factors.db", {
    readonly: true,
});

app.use(cookieParser());
app.use(express.urlencoded({extended: false}));

function needsAuth(req: Request, res: Response, next: NextFunction) {
    if (res.locals.authed) {
        next();
    } else {
        res.redirect("/login");
    }
}

function isValidField(x: unknown): boolean {
    return Boolean(typeof x === "string" && x.length > 0 && x.length <= 128);
}

app.use(express.static("./static"));

app.use(function (req, res, next) {
    const token: string | undefined = req.cookies.sessid;
    if (!token) {
        res.locals.authed = false;
    } else {
        const user = loginDb
            .prepare("SELECT 1 FROM Users WHERE sessid=?")
            .get(token);
        res.locals.authed = user !== undefined;
    }
    next();
});

app.get("/", needsAuth, function (req, res) {
    const query: string = req.query.q?.toString() ?? "";
    let factors: unknown[];
    try {
        factors = factorsDb
            .prepare(
                `SELECT number, factors FROM Factors WHERE number != '' AND number != 'flag' AND number LIKE '%${query}%' LIMIT 5`
            )
            .all();
    } catch (err) {
        res.render("home", {
            error: `Got an error, have a flag: ${FLAGS.ERROR} - your flag's in the database >:)`,
            factors: [],
        });
        return;
    }
    res.render("home", {factors});
});

app.get("/login", function (req, res) {
    if (res.locals.authed) {
        res.redirect("/");
        return;
    }
    res.render("login");
});

app.post("/login", function (req, res) {
    if (!isValidField(req.body.username) || !isValidField(req.body.password)) {
        res.status(400).render("login", {
            error: "Login must include a username and password with length 1-128.",
        });
        return;
    }
    let sessid: string | undefined;
    try {
        sessid = loginDb
            .prepare(
                `SELECT sessid FROM Users WHERE username='${req.body.username}' AND password='${req.body.password}'`
            )
            .get()?.sessid;
    } catch (err) {
        res.status(500).render("login", {
            error: "Unknown database error.",
        });
        return;
    }
    if (!sessid) {
        res.status(400).render("login", {
            error: "Invalid username or password.",
        });
        return;
    }
    res.cookie("sessid", sessid, {
        httpOnly: true,
        sameSite: "strict",
    });
    res.redirect("/");
});

app.get("/logout", function (req, res) {
    res.clearCookie("sessid");
    res.redirect("/login");
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}.`);
    console.log("Loaded flags:");
    for (const level of LEVELS) {
        console.log(` - ${level}: ${FLAGS[level]}`);
    }
});
