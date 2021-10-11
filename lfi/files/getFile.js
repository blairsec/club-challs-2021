const fs = require("fs");
const path = require("path");

module.exports = (filepath) => {
    const traversals = filepath.match(/\.\.\//g) || [];
    if (traversals.length <= 1) {
        // How bad could it be?
        // I should just let it happen.
        // There's no way they can read the flag in ./stuff/flag.txt
    } else if (traversals.length == 2) {
        // Okay maybe this is kinda bad.
        filepath = filepath.replace(/\.\.\//g, "");
    } else {
        // Okay this is really bad.
        // This is completely safe by the way so look elsewhere.
        filepath = path.resolve("/", filepath);
    }
    return fs.readFileSync(path.join(__dirname, "stuff/things", filepath));
};
