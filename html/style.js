var title_element = document.getElementById("title");
title_element.style.lineHeight = title_element.clientHeight + "px";

window.addEventListener("resize", () => {
    title_element.style.lineHeight = title_element.clientHeight + "px";
});

var force_update = () => {
    title_element.style.lineHeight = title_element.clientHeight + "px";
    setTimeout(force_update, 10);
}

// force_update();
