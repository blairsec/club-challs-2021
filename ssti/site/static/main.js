const { ping, upload, pingt: pingText, uploadt: uploadText, result } = "ping upload pingt uploadt result"
    .split(" ")
    .reduce((o, x) => {
        o[x] = document.getElementById(x);
        return o;
    }, {});

ping.addEventListener("click", async function() {
    result.classList.remove("error");
    result.innerText = "pinging...";
    const res = await fetch("/ping", {
        method: "POST",
        body: "site=" + encodeURIComponent(pingText.value),
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    });
    const text = await res.text();
    if (res.status !== 200) {
        result.classList.add("error");
        result.innerText = "Error while pinging: " + text;
    } else {
        result.innerText = "Ping result: " + text;
    }
});

upload.addEventListener("click", async function() {
    result.classList.remove("error");
    result.innerText = "uploading...";
    const res = await fetch("/add_site", {
        method: "POST",
        body: "site=" + encodeURIComponent(uploadText.value),
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    });
    const text = await res.text();
    if (res.status !== 200) {
        result.classList.add("error");
        result.innerText = "Error while uploading: " + text;
    } else {
        const url = "/t/" + text;
        result.innerText = "Uploaded successfully to: " + url;
        window.open(url);
    }
});
