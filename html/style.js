var title_element = document.getElementById("title");
title_element.style.lineHeight = title_element.clientHeight + "px";

window.addEventListener("resize", () => {
    title_element.style.lineHeight = title_element.clientHeight + "px";
});