window.electron.ipcRenderer.receive("data-config", (data) => {
  main(data);
});
window.electron.ipcRenderer.receive("no-internet", () => {
  console.log("No internet connection");
  addClass(".main-screen", "d-none");
  removeClass("#no-internet", "d-none");
});
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  window.electron.openContextMenu({ x: e.x, y: e.y });
});

async function main(data) {
  let link = data.link;
  if (link && link.trim() !== "") {
    link = link.trim();
    console.log("Navigating to:", link);
    window.location.href = link;
  }
}

function addClass(element, className) {
  document.querySelectorAll(element).forEach((el) => {
    el.classList.add(className);
  });
}
function removeClass(element, className) {
  document.querySelectorAll(element).forEach((el) => {
    el.classList.remove(className);
  });
}
