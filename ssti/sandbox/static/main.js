const {
    upload,
    uploadt: uploadText,
} = "ping upload pingt uploadt result turl".split(" ").reduce((o, x) => {
    o[x] = document.getElementById(x);
    return o;
}, {});

upload.addEventListener("click", function () {
    location.href = "/render?t=" + encodeURIComponent(uploadText.value);
});
