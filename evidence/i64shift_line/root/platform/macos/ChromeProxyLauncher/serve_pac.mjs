#!/usr/bin/env node
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const home = process.env.HOME;
if (!home) fail("HOME is required");

const host = process.env.CHENG_BROWSER_PAC_HOST || "127.0.0.1";
const portText = process.env.CHENG_BROWSER_PAC_PORT || "18080";
const port = Number(portText);
const pacPath = process.env.CHENG_BROWSER_PAC_PATH || join(home, ".config/cheng-proxy/cheng-gfw-split.pac");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  fail(`invalid_port=${portText}`);
}

function fail(message) {
  console.error(`browser_pac_server_error=${message}`);
  process.exit(1);
}

function servePac(response) {
  let body;
  let size;
  try {
    const stat = statSync(pacPath);
    if (!stat.isFile() || stat.size <= 0) {
      response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("PAC file is missing\n");
      return;
    }
    size = stat.size;
    body = readFileSync(pacPath);
  } catch (error) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`PAC read failed: ${error.message}\n`);
    return;
  }

  response.writeHead(200, {
    "Content-Type": "application/x-ns-proxy-autoconfig; charset=utf-8",
    "Content-Length": String(size),
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
  });
  response.end(body);
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  if (request.method === "GET" && url.pathname === "/cheng-gfw-split.pac") {
    servePac(response);
    return;
  }
  if (request.method === "GET" && url.pathname === "/healthz") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("ok\n");
    return;
  }
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("not found\n");
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(port, host, () => {
  console.log(`browser_pac_server_ready=1 host=${host} port=${port} path=${pacPath}`);
});
