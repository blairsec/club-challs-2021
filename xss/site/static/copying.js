const content = document.getElementById("content");
const selType = document.getElementById("sel-type");

for (const ele of document.querySelectorAll("a.copy")) {
    ele.addEventListener("click", function () {
        fetch("/api/notes/raw/" + ele.dataset.id)
            .then((res) => res.text())
            .then((text) => {
                selType.value = ele.dataset.type;
                content.innerText = text;
            });
    });
}
