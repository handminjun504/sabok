/**
 * Thin desktop shell: Next.js 개발 서버 또는 배포 URL을 그대로 표시합니다.
 * 사용법: 터미널 1 — npm run dev (Windows 에서는 run-dev.mjs 로 CMD 창 억제)
 *         터미널 2 — npm run desktop
 */

const { app, BrowserWindow } = require("electron");

const startUrl = process.env.SABOK_URL || "http://localhost:10002";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  win.loadURL(startUrl);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
