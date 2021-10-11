// Flag 3: flag{th3_s0urc3_n3v3r_t3lls_4_li3}
// Head over to the main page or to /sourceButBetter for a highlighted version :)
// this is all unimportant, scroll to the bottom
const express = require("express");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");
const { highlight } = require("highlight.js");
const getFile = require("./getFile.js");

const app = express();
const port = Number(process.env.PORT) || 8080;

const password = process.env.SECRET;
const debug = ["1", "true", "yes", "y", "t"].includes(process.env.DEBUG);
const templateDir = path.join(__dirname, "templates");

function numberLines(str) {
    const lines = str.trim().split("\n");
    const padLen = lines.length.toString().length;
    return lines
        .map(
            (line, num) =>
                `<span class="hljs-comment linenumber">${(num + 1)
                    .toString()
                    .padStart(padLen, " ")}| </span>${line}`
        )
        .join("\n");
}

function traverseDir(dir, relpath = dir) {
    const ret = [];
    for (const dirent of fs.readdirSync(dir, {
        withFileTypes: true,
    })) {
        const pushed = {
            name: dirent.name,
            fullpath: path.join(dir, dirent.name),
            relpath: path.join(relpath, dirent.name),
        };
        if (dirent.isDirectory()) {
            pushed.children = traverseDir(pushed.fullpath, pushed.relpath);
        }
        ret.push(pushed);
    }
    return ret;
}

function prettifyTrav(trav) {
    // handlebars? couldn't be me
    if ("children" in trav) {
        return `<p class="dir">${
            trav.name
        }</p><div class="dircontents">${trav.children
            .map((x) => prettifyTrav(x))
            .join("")}</div>`;
    } else {
        return `<p class="file">
            <a target="_blank" href="/readFile?filename=${encodeURIComponent(
                trav.relpath
            )}">
                ${trav.name}
            </a>
        </p>`;
    }
}

const source = fs.readFileSync(path.join(__dirname, "getFile.js"), "utf8");
const fullSource = fs.readFileSync(__filename, "utf8");
const hlSource = numberLines(highlight("javascript", source, true).value);
const hlFullSource = numberLines(
    highlight("javascript", fullSource, true).value
);

const trav = traverseDir(path.join(__dirname, "stuff/things"), "");
const prettyTrav = prettifyTrav({ name: "things", children: trav });

function nocache(req, res, next) {
    if (res.locals.nocache) {
        next();
        return;
    }
    res.locals.nocache = true;
    res.set({
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
    });
    next();
}

// ugh josh :rolling_eyes:
function limitedRead(filepath, limit = 20000) {
    const fd = fs.openSync(filepath, "r");
    const buf = Buffer.alloc(limit);
    const read = fs.readSync(fd, buf, 0, limit, 0);
    return buf.slice(0, read);
}

if (debug) {
    // prevent caching for development purposes
    app.use(nocache);
}

app.use(cookieParser());
// big brother is watching you :eyes:
if (!debug) {
    app.use(morgan("combined"));
}

app.use((req, res, next) => {
    if (req.cookies.super_secret_password === password) {
        res.locals.authed = true;
    } else {
        res.locals.authed = false;
    }
    next();
});

app.get("/favicon.ico", (req, res) => {
    res.sendFile(path.join(staticDir, "favicon.ico"));
});

// prevent caching for index page regardless of debugging
app.get("/", nocache, (req, res) => {
    let template = fs.readFileSync(
        path.join(templateDir, "index.html"),
        "utf8"
    );
    template = template
        .replace(
            /\$OSSPLUS\$/g,
            res.locals.authed
                ? `<h1 class="oss amazing">
            <a href="/sourceButBetter" target="_blank">
                we &lt;3 open source (even more)
            </a>
        </h1>`
                : ""
        )
        .replace(/\$FILELIST\$/g, prettyTrav);
    res.type("text/html").send(template);
});

app.get("/source", (req, res) => {
    let template = fs.readFileSync(
        path.join(templateDir, "source.html"),
        "utf8"
    );
    template = template.replace(/\$HLSOURCE\$/g, hlSource);
    res.type("text/html").send(template);
});

app.get("/sourceButBetter", (req, res, next) => {
    if (!res.locals.authed) {
        // no skipping steps :angry:
        next();
        return;
    }
    let template = fs.readFileSync(
        path.join(templateDir, "source.html"),
        "utf8"
    );
    template = template.replace(/\$HLSOURCE\$/g, hlFullSource);
    res.type("text/html").send(template);
});

app.get("/readFile", (req, res) => {
    const filename = req.query.filename;
    if (!filename) {
        res.type("text/plain").status(400).send("Please specify a filename.");
        return;
    }
    try {
        const contents = getFile(filename);
        if (contents.toString("utf8") === fullSource) {
            // you've leaked source, congrats
            res.cookie("super_secret_password", password, { httpOnly: true });
        }
        res.type(path.extname(filename) || "text/plain").send(contents);
    } catch (err) {
        res.type("text/plain").status(404).send("Invalid file.");
        return;
    }
});

// =========================================================
// this is where things get important
// =========================================================

const staticMount = "/static";
const staticDir = path.join(__dirname, "static");

// can you somehow get these values?
const superSecretFlag1 = process.env.LEFLAG;
const superSecretFlag2 = process.argv[2];

app.get(staticMount + "/*", (req, res) => {
    if (!req.originalUrl.startsWith(staticMount)) {
        res.type("text/plain")
            .status(400)
            .send("idk what wizardry you're pulling but I don't like it");
    }
    let filepath = req.originalUrl.substr(staticMount.length);
    if (!res.locals.authed && req.originalUrl.includes("../")) {
        // if you've leaked this source this won't be an issue
        // just make sure you send your requests with
        // the super_secret_password cookie
        res.type("text/plain")
            .status(400)
            .send("stop trying to skip steps smh my head");
    }
    const joined = path.join(staticDir, filepath);
    try {
        const contents = limitedRead(joined);
        res.type(path.extname(joined) || "text/plain").send(contents);
    } catch (err) {
        res.type("text/plain")
            .status(404)
            .send(debug ? `wtmoo there's no ${joined} file` : `file not found`);
    }
});

// this is now all unimportant again
if (!superSecretFlag1 || !superSecretFlag2 || !password) {
    console.error("You must specify two super secret flags and a password.");
    // exit with 123 so supervisor doesn't attempt to restart
    process.exit(123);
}

app.listen(port, () => {
    console.log(`Listening on port ${port} with debug ${debug}.`);
});
