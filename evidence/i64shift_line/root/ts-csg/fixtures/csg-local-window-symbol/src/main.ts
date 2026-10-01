import type { BrowserWindow } from "./electron-shim.js";

export async function readPanelWidth(window: BrowserWindow): Promise<number> {
  const value = await window.webContents.executeJavaScript("window.__panelWidth");
  return Number(value);
}
