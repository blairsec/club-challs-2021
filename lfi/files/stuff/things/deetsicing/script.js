function yayeet() {
    return Math.random() * 3 + 1;
}

function wawoot() {
    setTimeout(function () {
        archbtw.classList.add("scary");
        setTimeout(function () {
            archbtw.classList.remove("scary");
            wawoot();
        }, 300);
    }, yayeet() * 1000);
}

wawoot();
