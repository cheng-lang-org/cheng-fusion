export interface BrowserWindow {
  webContents: {
    executeJavaScript(script: string): Promise<unknown>;
  };
}
