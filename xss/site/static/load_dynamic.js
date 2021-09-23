const path = location.pathname.split("/");
const noteId = path[path.length - 1];
const display = document.getElementById("note-display");
fetch("/api/notes/" + noteId)
    .then((res) => {
        if (res.status !== 200) {
            display.classList.add("error-msg");
        }
        return res.text();
    })
    .then((text) => {
        display.innerHTML = text;
    });
