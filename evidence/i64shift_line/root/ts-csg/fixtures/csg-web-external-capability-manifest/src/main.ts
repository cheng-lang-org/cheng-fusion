declare global {
  interface Window {
    electronAPI?: { send?(channel: string, payload?: unknown): void };
  }

  interface Document {
    agentRunning?: boolean;
  }
}

export async function loadExternalSurface(): Promise<number> {
  const hostBridge = window.electronAPI;
  const running = document.agentRunning === true ? 1 : 0;
  await fetch("/manifest.json");
  navigator.geolocation.getCurrentPosition(() => undefined);
  const registrations = await navigator.serviceWorker.getRegistrations();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  await navigator.clipboard.writeText("external capability manifest");
  return (hostBridge ? 1 : 0) + running + registrations.length + stream.getTracks().length;
}
