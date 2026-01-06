const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: ipcRenderer.send.bind(ipcRenderer),
    invoke: ipcRenderer.invoke.bind(ipcRenderer),
    on: ipcRenderer.on.bind(ipcRenderer),
    receive: (channel, func) =>
      ipcRenderer.on(channel, (event, ...args) => func(...args)),
  },

  reloadApp: () => ipcRenderer.invoke("reload-app"),

  openContextMenu: (coords) => ipcRenderer.invoke("show-context-menu", coords),
});
