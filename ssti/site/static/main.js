const {
    ping,
    upload,
    pingt: pingText,
    uploadt: uploadText,
    result,
    turl: templateUrl,
} = "ping upload pingt uploadt result turl".split(" ").reduce((o, x) => {
    o[x] = document.getElementById(x);
    return o;
}, {});

function intoCode(text) {
    const code = document.createElement("code");
    code.innerText = text;
    return code.outerHTML;
}

function intoPreCode(text) {
    return `<pre>${intoCode(text)}</pre>`;
}

ping.addEventListener("click", async function () {
    result.classList.remove("error");
    result.innerText = "pinging...";
    const res = await fetch("/ping", {
        method: "POST",
        body: "site=" + encodeURIComponent(pingText.value),
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
    });
    const text = await res.text();
    if (res.status !== 200) {
        result.classList.add("error");
        result.innerHTML = "Error while pinging: " + intoCode(text);
    } else {
        result.innerHTML = "Ping result: " + intoPreCode(text);
    }
});

upload.addEventListener("click", async function () {
    result.classList.remove("error");
    result.innerText = "uploading...";
    const res = await fetch("/add_site", {
        method: "POST",
        body: "site=" + encodeURIComponent(uploadText.value),
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
    });
    const text = await res.text();
    if (res.status !== 200) {
        result.classList.add("error");
        result.innerHTML = "Error while uploading: " + intoCode(text);
    } else {
        const url = "/t/" + text;
        result.innerHTML = "Uploaded successfully to: " + intoCode(url);
        window.open(url);
    }
});

templateUrl.addEventListener("click", function () {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(templateUrl);
    sel.removeAllRanges();
    sel.addRange(range);
});
