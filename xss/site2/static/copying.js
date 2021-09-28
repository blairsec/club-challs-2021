const content = document.getElementById("content");

for (const ele of document.querySelectorAll("a.copy")) {
    ele.addEventListener("click", function () {
        fetch("/api/sites/raw/" + ele.dataset.id)
            .then((res) => res.text())
            .then((text) => {
                content.innerText = text;
            });
    });
}
