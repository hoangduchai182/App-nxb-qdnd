const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
} = require("electron");
const fs = require("fs");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const axios = require("axios");
const dns = require("dns");

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

const appName = "app-desktop-quan-su";
app.setPath("userData", path.join(app.getPath("appData"), appName));
// QUAN TRỌNG: Bỏ qua lỗi chứng chỉ bảo mật (cho các web https tự ký nội bộ)
// Nếu không có dòng này, vào web nội bộ https sẽ bị chặn.
app.commandLine.appendSwitch("ignore-certificate-errors");
// Tùy chọn: Cho phép nội dung http và https lẫn lộn
app.commandLine.appendSwitch("allow-insecure-localhost", "true");

let mainWindow;
const gotTheLock = app.requestSingleInstanceLock();
let isQuit = false;

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  async function createWindow() {
    const isDev = !app.isPackaged;
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 800,
      webPreferences: {
        preload: `${__dirname}/preload.js`,
        contextIsolation: true,
        enableRemoteModule: false,
        nodeIntegration: true,
        devTools: isDev,
      },
    });

    mainWindow.loadFile(path.join(__dirname, `../index.html`));
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setMenu(null);
    mainWindow.openDevTools();

    mainWindow.webContents.on("did-finish-load", async () => {
      const currentURL = mainWindow.webContents.getURL();
      if (currentURL.indexOf("index.html") === -1) return;
      const isOnline = await checkInternetConnection();
      if (!isOnline) {
        console.log("Backend: Không có internet -> Gửi signal cho Frontend");
        mainWindow.webContents.send("no-internet");
      } else {
        try {
          console.log("Backend: Có mạng -> Đang lấy data config...");
          let data = await getDataUrl();
          mainWindow.webContents.send("data-config", data);
        } catch (error) {
          console.error("Lỗi khi lấy dữ liệu từ firebase:", error);
        }
      }
    });

    // Hàm hiển thị menu chuột phải
    ipcMain.handle("show-context-menu", async (event, { x, y }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const menu = Menu.buildFromTemplate([
        {
          label: "Reload",
          role: "reload",
        },
        {
          label: "Force Reload",
          role: "forceReload",
        },
        {
          label: "Toggle DevTools",
          role: "toggleDevTools",
        },
        { type: "separator" },
        {
          label: "Copy",
          role: "copy",
        },
        {
          label: "Paste",
          role: "paste",
        },
        {
          label: "Select All",
          role: "selectAll",
        },
        { type: "separator" },
        {
          label: "Inspect Element",
          click: () => {
            if (win) {
              win.webContents.inspectElement(x, y);
              win.webContents.devToolsWebContents?.focus();
            }
          },
        },
      ]);

      menu.popup({ window: win });
    });

    // Cập nhật ------------------------------------------------------------------------------------------------------
    function showUpdate(message) {
      mainWindow.webContents.send("checking-update", message);
    }
    ipcMain.handle("check-download", () => {
      mainWindow.webContents.send(
        "current-version",
        `Phiên bản hiện tại: ${app.getVersion()}`
      );
      showUpdate("Đang kiểm tra phiên bản cập nhật...");
      autoUpdater.checkForUpdates();
    });
    autoUpdater.on("update-available", (info) => {
      showUpdate("Xuất hiện bản cập nhật mới !");
      mainWindow.webContents.send("update-available");
    });
    autoUpdater.on("update-not-available", (info) => {
      showUpdate("Không có bản cập nhật mới !");
    });
    ipcMain.handle("accept-download", () => {
      autoUpdater.downloadUpdate();
      showUpdate("Đang chuẩn bị tải xuống bản cập nhật mới...");
    });
    autoUpdater.on("download-progress", (progressObj) => {
      showUpdate("Đang tải xuống...");
      let log_message = "Download speed: " + progressObj.bytesPerSecond;
      log_message = log_message + " - Downloaded " + progressObj.percent + "%";
      log_message =
        log_message +
        " (" +
        progressObj.transferred +
        "/" +
        progressObj.total +
        ")";
      mainWindow.webContents.send("update-progress", progressObj.percent);
    });
    autoUpdater.on("update-downloaded", (info) => {
      mainWindow.webContents.send(
        "checking-install",
        "Bản cập nhật tải xuống thành công, bạn muốn cài đặt ngay bây giờ không ?"
      );
    });
    autoUpdater.on("error", (err) => {
      showUpdate("Error in auto-updater: " + err);
    });
    ipcMain.handle("install-now", () => {
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.quitAndInstall();
    });

    // Lắng nghe sự kiện 'close' của mainWindow
    mainWindow.on("close", async (e) => {
      if (!isQuit) {
        e.preventDefault();

        const response = dialog.showMessageBoxSync(mainWindow, {
          type: "question",
          buttons: ["Có", "Không"],
          title: "Xác nhận thoát",
          message: "Bạn có chắc chắn muốn đóng ứng dụng ?",
        });

        if (response === 0) {
          isQuit = true;
          app.quit();
        } else if (response === 1) {
          return;
        }
      }
    });
  }

  app.whenReady().then(async () => {
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

async function getDataUrl() {
  const functionUrl =
    "https://us-central1-data-app-quan-su.cloudfunctions.net/getDataConfig";

  try {
    const response = await axios.post(functionUrl);

    console.log("Thong tin api key:", response.data);
    return response.data;
  } catch (error) {
    throw new Error("Lỗi khi cập nhật đến server: " + error.response.data);
  }
}
function checkInternetConnection() {
  return new Promise((resolve) => {
    // Thử lookup google.com, nếu lỗi nghĩa là không có internet
    dns.lookup("google.com", (err) => {
      if (err && (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN")) {
        resolve(false); // Không có mạng
      } else {
        resolve(true); // Có mạng
      }
    });
  });
}
