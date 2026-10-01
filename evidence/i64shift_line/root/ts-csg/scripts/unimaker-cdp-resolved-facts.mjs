#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startManagedProcess } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const defaultProjectRoot = "/Users/lbcheng/UniMaker/React.js";
const schema = "unimaker.cdp.resolved_facts.v1";
const distributedContentStorageKey = "unimaker_distributed_contents_v1";
const contentSnapshotSchema = "unimaker.pwa.content_snapshot.v1";

const styleProperties = [
  "display",
  "position",
  "box-sizing",
  "width",
  "height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "color",
  "background-color",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-radius",
  "opacity",
  "overflow-x",
  "overflow-y",
  "transform",
  "z-index",
];

let server = null;
let browser = null;
let browserConnected = false;
let contentSnapshotWritten = false;
const allFacts = [];

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
  } else {
    const projectRoot = resolvePath(options.projectRoot);
    if (!options.baseUrl && !existsSync(join(projectRoot, "package.json"))) {
      fail(`missing UniMaker PWA package.json: ${join(projectRoot, "package.json")}`);
    }

    const baseUrl = options.baseUrl || `http://127.0.0.1:${options.port}/`;
    if (!options.baseUrl) {
      server = startManagedProcess("npm", [
        "run",
        "dev",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        String(options.port),
        "--strictPort",
      ], {
        cwd: projectRoot,
        env: { ...process.env, BROWSER: "none" },
      });
      await waitForHttp(baseUrl, options.serverTimeoutMs);
    }

    const puppeteer = (await import("puppeteer")).default;
    if (options.browserWsEndpoint) {
      browser = await puppeteer.connect({ browserWSEndpoint: options.browserWsEndpoint });
      browserConnected = true;
    } else {
      const executablePath = options.chromePath || chromeExecutablePath();
      browser = await puppeteer.launch({
        headless: options.headless,
        executablePath,
        pipe: true,
        args: [
          "--no-sandbox",
          "--disable-gpu",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
        timeout: options.browserTimeoutMs,
      });
    }

    allFacts.push({
      schema,
      kind: "unimaker.cdp.resolved_facts.run",
      projectRoot,
      route: "*",
      capturedAt: new Date().toISOString(),
      url: normalizeBaseUrl(baseUrl),
      routes: options.routes,
      viewport: options.viewportText,
      mode: options.baseUrl ? "connected-base-url" : "started-dev-server",
    });

    for (const route of options.routes) {
      const page = await browser.newPage();
      try {
        const routeFacts = await collectRouteFacts(page, {
          baseUrl,
          projectRoot,
          route,
          options,
        });
        allFacts.push(...routeFacts);
      } finally {
        await page.close().catch(() => {});
      }
    }

    writeJsonl(allFacts, options.out);
  }
} catch (err) {
  process.stderr.write(`unimaker-cdp-resolved-facts: ${err?.stack || err?.message || String(err)}\n`);
  process.exitCode = 1;
} finally {
  if (browser) {
    if (browserConnected) {
      await browser.disconnect();
    } else {
      await browser.close().catch(() => {});
    }
  }
  if (server) {
    await server.stop().catch(() => {});
  }
}

async function collectRouteFacts(page, context) {
  const { baseUrl, projectRoot, route, options: opts } = context;
  const capturedAt = new Date().toISOString();
  const url = truthRouteUrl(baseUrl, route);
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error?.stack || error?.message || String(error));
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({
      url: request.url(),
      errorText: request.failure()?.errorText || "",
    });
  });

  await page.setViewport({
    width: opts.viewport.width,
    height: opts.viewport.height,
    deviceScaleFactor: opts.deviceScaleFactor,
    isMobile: opts.isMobile,
  });

  const client = await page.target().createCDPSession();
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  await client.send("Performance.enable");

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: opts.navigationTimeoutMs,
  });
  await waitForRouteRuntimeState(page, route, opts.routeTimeoutMs);
  await page.evaluate(async () => {
    if (!("fonts" in document)) {
      throw new Error("document.fonts is not available");
    }
    await document.fonts.ready;
  });
  if (opts.settleMs > 0) {
    await sleep(opts.settleMs);
  }
  if (pageErrors.length > 0) {
    fail(`page runtime error on route ${route}: ${pageErrors.join("\n")}`);
  }
  if (consoleErrors.length > 0 && opts.failOnConsoleError) {
    fail(`console error on route ${route}: ${consoleErrors.join("\n")}`);
  }
  if (opts.writeContentSnapshotFile && !contentSnapshotWritten) {
    await writePwaContentSnapshotFromPage(page, opts.writeContentSnapshotFile, url);
    contentSnapshotWritten = true;
  }

  const cdpSnapshot = await collectCdpSnapshotSummary(client);
  const pageFacts = await page.evaluate(collectResolvedPageFacts, {
    route,
    styleProperties,
    nodeLimit: opts.nodeLimit,
    isMobile: opts.isMobile,
    deviceScaleFactor: opts.deviceScaleFactor,
  });
  const perfMetrics = await client.send("Performance.getMetrics");
  pageFacts.runtime.performanceMetrics = summarizePerformanceMetrics(perfMetrics.metrics);
  pageFacts.runtime.requestFailures = requestFailures;
  pageFacts.runtime.consoleErrors = consoleErrors;

  const base = {
    schema,
    projectRoot,
    route,
    capturedAt,
    url,
  };

  const facts = [];
  facts.push({
    ...base,
    kind: "unimaker.cdp.resolved_facts.route_state",
    routeState: pageFacts.routeState,
  });
  facts.push({
    ...base,
    kind: "unimaker.cdp.resolved_facts.viewport",
    viewport: pageFacts.viewport,
  });
  facts.push({
    ...base,
    kind: "unimaker.cdp.resolved_facts.dom_node_summary",
    cdpSnapshot,
    documentNodeCount: pageFacts.dom.documentNodeCount,
    visibleNodeCount: pageFacts.dom.visibleNodeCount,
    nodes: pageFacts.dom.nodes,
  });
  for (const item of pageFacts.styles) {
    facts.push({
      ...base,
      kind: "unimaker.cdp.resolved_facts.computed_style",
      nodeOrdinal: item.nodeOrdinal,
      selector: item.selector,
      tagName: item.tagName,
      styles: item.styles,
    });
  }
  for (const item of pageFacts.rects) {
    facts.push({
      ...base,
      kind: "unimaker.cdp.resolved_facts.layout_rect",
      nodeOrdinal: item.nodeOrdinal,
      selector: item.selector,
      tagName: item.tagName,
      rect: item.rect,
    });
  }
  facts.push({
    ...base,
    kind: "unimaker.cdp.resolved_facts.resource_natural_size",
    performanceResources: pageFacts.resources.performanceResources,
    naturalResources: pageFacts.resources.naturalResources,
    backgroundResources: pageFacts.resources.backgroundResources,
  });
  facts.push({
    ...base,
    kind: "unimaker.cdp.resolved_facts.document_fonts",
    status: pageFacts.fonts.status,
    faceCount: pageFacts.fonts.faceCount,
    faces: pageFacts.fonts.faces,
  });

  const hashPayload = {
    routeState: pageFacts.routeState,
    viewport: pageFacts.viewport,
    cdpSnapshot,
    dom: pageFacts.dom,
    styles: pageFacts.styles,
    rects: pageFacts.rects,
    resources: pageFacts.resources,
    fonts: pageFacts.fonts,
    runtime: pageFacts.runtime,
  };
  const runtimeStateHash = sha256Hex(stableJson(hashPayload));
  facts.push({
    ...base,
    kind: "unimaker.cdp.resolved_facts.runtime_state_hash",
    hashAlgorithm: "sha256",
    runtimeStateHash,
    hashedFactKinds: [
      "unimaker.cdp.resolved_facts.route_state",
      "unimaker.cdp.resolved_facts.viewport",
      "unimaker.cdp.resolved_facts.dom_node_summary",
      "unimaker.cdp.resolved_facts.computed_style",
      "unimaker.cdp.resolved_facts.layout_rect",
      "unimaker.cdp.resolved_facts.resource_natural_size",
      "unimaker.cdp.resolved_facts.document_fonts",
    ],
  });

  validateRouteFacts(route, facts);
  return facts;
}

async function waitForRouteRuntimeState(page, route, timeoutMs) {
  try {
    await page.waitForFunction((expectedRoute) => {
      const state = window.__UNIMAKER_R2C_RUNTIME_STATE;
      return Boolean(
        state &&
        state.route_state === expectedRoute &&
        state.render_ready === true &&
        state.semantic_nodes_loaded === true
      );
    }, { timeout: timeoutMs }, route);
  } catch (err) {
    const state = await page.evaluate(() => ({
      href: window.location.href,
      readyState: document.readyState,
      runtimeState: window.__UNIMAKER_R2C_RUNTIME_STATE ?? null,
    })).catch((evalErr) => ({ evalError: evalErr?.message || String(evalErr) }));
    fail(`route runtime state not ready for ${route}: ${JSON.stringify(state)}`);
  }
}

async function writePwaContentSnapshotFromPage(page, outPath, sourceUrl) {
  const storageJson = await page.evaluate((key) => window.localStorage.getItem(key) ?? "", distributedContentStorageKey);
  if (!storageJson) {
    fail(`PWA localStorage missing ${distributedContentStorageKey}; cannot write content snapshot`);
  }
  const contents = parsePwaContentStorageJson(storageJson, "browser-localStorage");
  validatePwaContentSnapshotContents(contents, "browser-localStorage");
  const resolved = resolvePath(outPath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, JSON.stringify({
    schema: contentSnapshotSchema,
    storageKey: distributedContentStorageKey,
    capturedAt: new Date().toISOString(),
    sourceUrl,
    contents,
  }, null, 2) + "\n", "utf8");
  process.stdout.write(`unimaker-cdp-resolved-facts wrote PWA content snapshot -> ${resolved}\n`);
}

function parsePwaContentStorageJson(value, source) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    fail(`invalid ${distributedContentStorageKey} JSON from ${source}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed)) fail(`${distributedContentStorageKey} from ${source} is not an array`);
  return parsed;
}

function validatePwaContentSnapshotContents(contents, source) {
  if (!Array.isArray(contents) || contents.length === 0) fail(`PWA content snapshot ${source} has no contents`);
  if (!contents.some((item) => item && item.type === "video")) fail(`PWA content snapshot ${source} has no video item`);
  if (!contents.some((item) => item && item.type === "image")) fail(`PWA content snapshot ${source} has no image item`);
  for (let index = 0; index < contents.length; index += 1) {
    const item = contents[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) fail(`PWA content snapshot ${source} item ${index} must be an object`);
    for (const key of ["id", "type", "publishCategory", "userId", "userName", "avatar", "content"]) {
      if (typeof item[key] !== "string") fail(`PWA content snapshot ${source} item ${index} missing string ${key}`);
    }
    for (const key of ["likes", "comments", "timestamp"]) {
      if (typeof item[key] !== "number" || !Number.isFinite(item[key])) fail(`PWA content snapshot ${source} item ${index} missing finite number ${key}`);
    }
  }
}

async function collectCdpSnapshotSummary(client) {
  const snapshot = await client.send("DOMSnapshot.captureSnapshot", {
    computedStyles: styleProperties,
    includeDOMRects: true,
    includePaintOrder: true,
  });
  const documents = snapshot.documents || [];
  let nodeCount = 0;
  let layoutNodeCount = 0;
  let textBoxCount = 0;
  for (const doc of documents) {
    nodeCount += doc.nodes?.nodeName?.length || 0;
    layoutNodeCount += doc.layout?.nodeIndex?.length || 0;
    textBoxCount += doc.textBoxes?.layoutIndex?.length || 0;
  }
  return {
    documentCount: documents.length,
    nodeCount,
    layoutNodeCount,
    textBoxCount,
  };
}

function collectResolvedPageFacts(input) {
  const route = input.route;
  const props = input.styleProperties;
  const nodeLimit = input.nodeLimit;

  const routeState = collectRouteState(route);
  const viewport = collectViewport();
  const collected = collectDomNodes(props, nodeLimit);
  const resources = collectResources();
  const fonts = collectFonts();

  return {
    routeState,
    viewport,
    dom: {
      documentNodeCount: document.querySelectorAll("*").length,
      visibleNodeCount: collected.visibleNodeCount,
      nodes: collected.nodes,
    },
    styles: collected.styles,
    rects: collected.rects,
    resources,
    fonts,
    runtime: {
      location: window.location.href,
      runtimeState: window.__UNIMAKER_R2C_RUNTIME_STATE ?? null,
      localStorageKeys: safeLocalStorageKeys(),
    },
  };

  function collectRouteState(expectedRoute) {
    const params = new URLSearchParams(window.location.search);
    const runtimeState = window.__UNIMAKER_R2C_RUNTIME_STATE;
    return {
      expectedRoute,
      actualRouteState: String(runtimeState?.route_state ?? ""),
      renderReady: runtimeState?.render_ready === true,
      semanticNodesLoaded: runtimeState?.semantic_nodes_loaded === true,
      truthMode: params.get("r2c_truth") === "1",
      truthRoute: String(params.get("r2c_route") ?? ""),
      documentReadyState: document.readyState,
      title: document.title,
      href: window.location.href,
    };
  }

  function collectViewport() {
    const visualViewport = window.visualViewport
      ? {
          width: roundNumber(window.visualViewport.width),
          height: roundNumber(window.visualViewport.height),
          scale: roundNumber(window.visualViewport.scale),
          offsetLeft: roundNumber(window.visualViewport.offsetLeft),
          offsetTop: roundNumber(window.visualViewport.offsetTop),
        }
      : undefined;
    const result = {
      width: window.innerWidth,
      height: window.innerHeight,
      deviceScaleFactor: input.deviceScaleFactor,
      isMobile: Boolean(input.isMobile),
      userAgent: navigator.userAgent,
      userAgentMobile: navigator.userAgent.includes("Mobile"),
      devicePixelRatio: window.devicePixelRatio || 1,
    };
    if (visualViewport) {
      result.visualViewport = visualViewport;
    }
    return result;
  }

  function collectDomNodes(styleProps, limit) {
    const all = Array.from(document.querySelectorAll("*"));
    const selected = [];
    let visibleNodeCount = 0;

    for (const element of all) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = isVisible(element, style, rect);
      if (visible) visibleNodeCount += 1;
      if (shouldSelectElement(element, style, rect, visible)) {
        selected.push({ element, style, rect, visible });
      }
      if (selected.length >= limit) break;
    }

    if (selected.length === 0 && document.body) {
      const style = window.getComputedStyle(document.body);
      selected.push({
        element: document.body,
        style,
        rect: document.body.getBoundingClientRect(),
        visible: true,
      });
    }

    const nodes = [];
    const styles = [];
    const rects = [];
    for (let index = 0; index < selected.length; index += 1) {
      const item = selected[index];
      const ordinal = index;
      const selector = selectorFor(item.element);
      const tagName = item.element.tagName.toLowerCase();
      nodes.push({
        ordinal,
        selector,
        tagName,
        nodeName: item.element.nodeName,
        id: item.element.id || "",
        className: typeof item.element.className === "string" ? item.element.className : "",
        role: item.element.getAttribute("role") || "",
        ariaLabel: item.element.getAttribute("aria-label") || "",
        text: textSample(item.element),
        attributes: attributeSubset(item.element),
        childElementCount: item.element.childElementCount,
        depth: nodeDepth(item.element),
        visible: item.visible,
        interactive: isInteractive(item.element),
      });
      const styleMap = {};
      for (const prop of styleProps) {
        styleMap[prop] = item.style.getPropertyValue(prop);
      }
      styles.push({
        nodeOrdinal: ordinal,
        selector,
        tagName,
        styles: styleMap,
      });
      rects.push({
        nodeOrdinal: ordinal,
        selector,
        tagName,
        rect: rectToJson(item.rect),
      });
    }

    return { visibleNodeCount, nodes, styles, rects };
  }

  function collectResources() {
    const performanceResources = performance.getEntriesByType("resource").map((entry) => {
      const resource = {
        name: String(entry.name || ""),
        initiatorType: String(entry.initiatorType || ""),
        transferSize: finiteNumber(entry.transferSize),
        encodedBodySize: finiteNumber(entry.encodedBodySize),
        decodedBodySize: finiteNumber(entry.decodedBodySize),
        durationMs: roundNumber(finiteNumber(entry.duration)),
      };
      if (typeof entry.responseStatus === "number") {
        resource.responseStatus = entry.responseStatus;
      }
      return resource;
    });

    const naturalResources = [];
    const mediaElements = Array.from(document.querySelectorAll("img,video,canvas,svg,image"));
    for (let index = 0; index < mediaElements.length; index += 1) {
      const element = mediaElements[index];
      const tagName = element.tagName.toLowerCase();
      const item = {
        ordinal: index,
        selector: selectorFor(element),
        tagName,
        source: mediaSource(element),
        currentSource: currentMediaSource(element),
        rect: rectToJson(element.getBoundingClientRect()),
      };
      if (tagName === "img") {
        item.complete = Boolean(element.complete);
        item.naturalWidth = finiteNumber(element.naturalWidth);
        item.naturalHeight = finiteNumber(element.naturalHeight);
      } else if (tagName === "video") {
        item.videoWidth = finiteNumber(element.videoWidth);
        item.videoHeight = finiteNumber(element.videoHeight);
        item.readyState = finiteNumber(element.readyState);
      } else if (tagName === "canvas") {
        item.canvasWidth = finiteNumber(element.width);
        item.canvasHeight = finiteNumber(element.height);
      } else if (tagName === "svg") {
        item.svgWidth = roundNumber(finiteNumber(element.getBoundingClientRect().width));
        item.svgHeight = roundNumber(finiteNumber(element.getBoundingClientRect().height));
      } else if (tagName === "image") {
        const href = element.getAttribute("href") || element.getAttribute("xlink:href") || "";
        item.source = href;
        item.currentSource = href;
      }
      naturalResources.push(item);
    }

    const backgroundResources = [];
    const elements = Array.from(document.querySelectorAll("*"));
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const style = window.getComputedStyle(element);
      const urls = extractCssUrls(style.backgroundImage);
      if (urls.length === 0) continue;
      backgroundResources.push({
        ordinal: backgroundResources.length,
        selector: selectorFor(element),
        urls,
        rect: rectToJson(element.getBoundingClientRect()),
      });
    }

    return { performanceResources, naturalResources, backgroundResources };
  }

  function collectFonts() {
    const fontSet = document.fonts;
    const faces = [];
    for (const face of fontSet) {
      faces.push({
        family: String(face.family || ""),
        style: String(face.style || ""),
        weight: String(face.weight || ""),
        stretch: String(face.stretch || ""),
        status: String(face.status || ""),
        display: String(face.display || ""),
        unicodeRange: String(face.unicodeRange || ""),
      });
    }
    return {
      status: String(fontSet.status || ""),
      faceCount: faces.length,
      faces,
    };
  }

  function shouldSelectElement(element, style, rect, visible) {
    if (element === document.documentElement || element === document.body || element.id === "root") {
      return true;
    }
    if (!visible) return false;
    if (isInteractive(element)) return true;
    const tagName = element.tagName.toLowerCase();
    if (["main", "header", "footer", "nav", "section", "article", "img", "video", "canvas", "svg"].includes(tagName)) {
      return true;
    }
    if (element.getAttribute("role") || element.getAttribute("aria-label")) return true;
    if (textSample(element).length > 0 && rect.width > 0 && rect.height > 0) return true;
    return style.position === "fixed" || style.position === "sticky";
  }

  function isVisible(element, style, rect) {
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    return true;
  }

  function isInteractive(element) {
    const tagName = element.tagName.toLowerCase();
    if (["button", "a", "input", "textarea", "select", "option", "summary"].includes(tagName)) return true;
    const role = element.getAttribute("role") || "";
    if (["button", "link", "tab", "menuitem", "checkbox", "switch", "textbox"].includes(role)) return true;
    return element.hasAttribute("onclick") || element.tabIndex >= 0;
  }

  function mediaSource(element) {
    return String(
      element.getAttribute("src") ||
      element.getAttribute("href") ||
      element.getAttribute("xlink:href") ||
      ""
    );
  }

  function currentMediaSource(element) {
    return String(element.currentSrc || mediaSource(element));
  }

  function attributeSubset(element) {
    const names = [
      "id",
      "class",
      "role",
      "aria-label",
      "aria-hidden",
      "type",
      "name",
      "placeholder",
      "href",
      "src",
      "alt",
      "title",
      "data-state",
      "data-route-state",
    ];
    const out = [];
    for (const name of names) {
      if (element.hasAttribute(name)) {
        out.push({ name, value: String(element.getAttribute(name) || "") });
      }
    }
    return out;
  }

  function textSample(element) {
    let text = "";
    if ("value" in element && typeof element.value === "string" && element.value.trim()) {
      text = element.value;
    } else {
      text = element.innerText || element.textContent || "";
    }
    return text.replace(/\s+/g, " ").trim().slice(0, 220);
  }

  function selectorFor(element) {
    if (element === document.documentElement) return "html";
    if (element === document.body) return "body";
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
      const tag = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`${tag}#${simpleCssIdent(current.id)}`);
        break;
      }
      const className = typeof current.className === "string"
        ? current.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(simpleCssIdent).join(".")
        : "";
      const classPart = className ? `.${className}` : "";
      parts.unshift(`${tag}${classPart}:nth-of-type(${nthOfType(current)})`);
      current = current.parentElement;
      if (parts.length >= 5) break;
    }
    return parts.join(" > ") || element.tagName.toLowerCase();
  }

  function nthOfType(element) {
    let index = 1;
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === element.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    return index;
  }

  function simpleCssIdent(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function nodeDepth(element) {
    let depth = 0;
    let current = element.parentElement;
    while (current) {
      depth += 1;
      current = current.parentElement;
    }
    return depth;
  }

  function rectToJson(rect) {
    return {
      x: roundNumber(rect.x),
      y: roundNumber(rect.y),
      width: roundNumber(rect.width),
      height: roundNumber(rect.height),
      top: roundNumber(rect.top),
      right: roundNumber(rect.right),
      bottom: roundNumber(rect.bottom),
      left: roundNumber(rect.left),
    };
  }

  function finiteNumber(value) {
    return Number.isFinite(value) ? Number(value) : 0;
  }

  function roundNumber(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 1000) / 1000;
  }

  function extractCssUrls(value) {
    const urls = [];
    const re = /url\((["']?)(.*?)\1\)/g;
    let match;
    while ((match = re.exec(value || ""))) {
      const url = String(match[2] || "").trim();
      if (url) urls.push(url);
    }
    return urls;
  }

  function safeLocalStorageKeys() {
    try {
      return Object.keys(window.localStorage || {}).sort();
    } catch {
      return [];
    }
  }
}

function validateRouteFacts(route, facts) {
  const byKind = new Map(facts.map((fact) => [fact.kind, fact]));
  const requiredKinds = [
    "unimaker.cdp.resolved_facts.route_state",
    "unimaker.cdp.resolved_facts.viewport",
    "unimaker.cdp.resolved_facts.dom_node_summary",
    "unimaker.cdp.resolved_facts.resource_natural_size",
    "unimaker.cdp.resolved_facts.document_fonts",
    "unimaker.cdp.resolved_facts.runtime_state_hash",
  ];
  for (const kind of requiredKinds) {
    if (!byKind.has(kind)) fail(`missing required fact ${kind} for route ${route}`);
  }
  if (!facts.some((fact) => fact.kind === "unimaker.cdp.resolved_facts.computed_style")) {
    fail(`missing computed style facts for route ${route}`);
  }
  if (!facts.some((fact) => fact.kind === "unimaker.cdp.resolved_facts.layout_rect")) {
    fail(`missing layout rect facts for route ${route}`);
  }

  const routeState = byKind.get("unimaker.cdp.resolved_facts.route_state").routeState;
  if (routeState.truthMode !== true) fail(`truth mode is not active for route ${route}`);
  if (routeState.truthRoute !== route) fail(`truth route mismatch: expected ${route}, got ${routeState.truthRoute}`);
  if (routeState.actualRouteState !== route) {
    fail(`runtime route_state mismatch: expected ${route}, got ${routeState.actualRouteState}`);
  }
  if (routeState.renderReady !== true || routeState.semanticNodesLoaded !== true) {
    fail(`runtime route state not ready for route ${route}`);
  }

  const viewport = byKind.get("unimaker.cdp.resolved_facts.viewport").viewport;
  if (!positiveFinite(viewport.width) || !positiveFinite(viewport.height)) {
    fail(`invalid viewport fact for route ${route}`);
  }

  const dom = byKind.get("unimaker.cdp.resolved_facts.dom_node_summary");
  if (!positiveFinite(dom.cdpSnapshot.documentCount) || !positiveFinite(dom.cdpSnapshot.nodeCount)) {
    fail(`CDP DOM snapshot is empty for route ${route}`);
  }
  if (!Array.isArray(dom.nodes) || dom.nodes.length === 0) {
    fail(`DOM node summary is empty for route ${route}`);
  }

  for (const fact of facts) {
    if (fact.kind === "unimaker.cdp.resolved_facts.computed_style") {
      for (const prop of styleProperties) {
        if (!(prop in fact.styles)) {
          fail(`computed style missing ${prop} for route ${route} node ${fact.selector}`);
        }
      }
    }
    if (fact.kind === "unimaker.cdp.resolved_facts.layout_rect") {
      const rect = fact.rect;
      for (const key of ["x", "y", "width", "height", "top", "right", "bottom", "left"]) {
        if (!Number.isFinite(rect[key])) {
          fail(`layout rect ${key} is not finite for route ${route} node ${fact.selector}`);
        }
      }
    }
  }

  const resources = byKind.get("unimaker.cdp.resolved_facts.resource_natural_size");
  if (!Array.isArray(resources.performanceResources) || resources.performanceResources.length === 0) {
    fail(`performance resource sizes are empty for route ${route}`);
  }
  if (!Array.isArray(resources.naturalResources)) {
    fail(`natural resource array missing for route ${route}`);
  }
  for (const resource of resources.naturalResources) {
    if (resource.tagName === "img" && (resource.source || resource.currentSource)) {
      if (resource.complete !== true) {
        fail(`image did not complete for route ${route}: ${resource.selector} ${resource.currentSource || resource.source}`);
      }
      if (!positiveFinite(resource.naturalWidth) || !positiveFinite(resource.naturalHeight)) {
        fail(`image natural size missing for route ${route}: ${resource.selector} ${resource.currentSource || resource.source}`);
      }
    }
    if (resource.tagName === "video" && (resource.source || resource.currentSource) && positiveFinite(resource.readyState)) {
      if (!positiveFinite(resource.videoWidth) || !positiveFinite(resource.videoHeight)) {
        fail(`video natural size missing for route ${route}: ${resource.selector} ${resource.currentSource || resource.source}`);
      }
    }
  }

  const fonts = byKind.get("unimaker.cdp.resolved_facts.document_fonts");
  if (fonts.status !== "loaded") {
    fail(`document.fonts status is ${fonts.status} for route ${route}`);
  }

  const hash = byKind.get("unimaker.cdp.resolved_facts.runtime_state_hash");
  if (!/^[0-9a-f]{64}$/.test(hash.runtimeStateHash)) {
    fail(`invalid runtime state hash for route ${route}`);
  }
}

function summarizePerformanceMetrics(metrics) {
  const out = {};
  for (const metric of metrics || []) {
    if (typeof metric.name === "string" && Number.isFinite(metric.value)) {
      out[metric.name] = Math.round(metric.value * 1000) / 1000;
    }
  }
  return out;
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err?.message || String(err);
    }
    await sleep(250);
  }
  fail(`UniMaker dev server did not become ready at ${url}: ${lastError}`);
}

function truthRouteUrl(baseUrl, route) {
  const url = new URL("/", normalizeBaseUrl(baseUrl));
  url.searchParams.set("r2c_truth", "1");
  url.searchParams.set("r2c_route", route);
  return url.toString();
}

function normalizeBaseUrl(raw) {
  const url = new URL(raw);
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  return url.toString();
}

function parseArgs(args) {
  const parsed = {
    projectRoot: defaultProjectRoot,
    baseUrl: "",
    browserWsEndpoint: "",
    chromePath: "",
    out: "",
    port: 45229,
    viewportText: "390x844",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    routes: [],
    nodeLimit: 80,
    settleMs: 1200,
    serverTimeoutMs: 60000,
    navigationTimeoutMs: 45000,
    routeTimeoutMs: 30000,
    browserTimeoutMs: 120000,
    headless: "new",
    failOnConsoleError: false,
    writeContentSnapshotFile: "",
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) fail(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--project-root") parsed.projectRoot = next();
    else if (arg === "--base-url") parsed.baseUrl = next();
    else if (arg === "--browser-ws-endpoint") parsed.browserWsEndpoint = next();
    else if (arg === "--chrome-path") parsed.chromePath = next();
    else if (arg === "--out") parsed.out = next();
    else if (arg === "--write-content-snapshot-file") parsed.writeContentSnapshotFile = next();
    else if (arg === "--port") parsed.port = positiveInteger(next(), "--port");
    else if (arg === "--viewport") {
      parsed.viewportText = next();
      parsed.viewport = parseViewport(parsed.viewportText);
    } else if (arg === "--device-scale-factor") parsed.deviceScaleFactor = positiveNumber(next(), "--device-scale-factor");
    else if (arg === "--desktop") parsed.isMobile = false;
    else if (arg === "--mobile") parsed.isMobile = true;
    else if (arg === "--route") parsed.routes.push(nonEmpty(next(), "--route"));
    else if (arg === "--routes") parsed.routes.push(...parseRouteList(next()));
    else if (arg === "--routes-file") parsed.routes.push(...parseRouteFile(next()));
    else if (arg === "--node-limit") parsed.nodeLimit = positiveInteger(next(), "--node-limit");
    else if (arg === "--settle-ms") parsed.settleMs = nonNegativeInteger(next(), "--settle-ms");
    else if (arg === "--server-timeout-ms") parsed.serverTimeoutMs = positiveInteger(next(), "--server-timeout-ms");
    else if (arg === "--navigation-timeout-ms") parsed.navigationTimeoutMs = positiveInteger(next(), "--navigation-timeout-ms");
    else if (arg === "--route-timeout-ms") parsed.routeTimeoutMs = positiveInteger(next(), "--route-timeout-ms");
    else if (arg === "--browser-timeout-ms") parsed.browserTimeoutMs = positiveInteger(next(), "--browser-timeout-ms");
    else if (arg === "--headful") parsed.headless = false;
    else if (arg === "--fail-on-console-error") parsed.failOnConsoleError = true;
    else if (arg === "--allow-console-error") parsed.failOnConsoleError = false;
    else fail(`unknown argument: ${arg}`);
  }

  if (parsed.routes.length === 0) {
    parsed.routes = ["home_default"];
  }
  parsed.routes = [...new Set(parsed.routes.map((route) => route.trim()).filter(Boolean))];
  if (parsed.routes.length === 0) fail("empty route list");
  return parsed;
}

function parseRouteList(raw) {
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

function parseRouteFile(path) {
  return readFileSync(resolvePath(path), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function parseViewport(text) {
  const match = /^(\d+)x(\d+)$/.exec(text);
  if (!match) fail(`invalid viewport ${text}; expected WxH`);
  const width = positiveInteger(match[1], "--viewport width");
  const height = positiveInteger(match[2], "--viewport height");
  return { width, height };
}

function writeJsonl(facts, outPath) {
  const text = facts.map((fact) => JSON.stringify(fact)).join("\n") + "\n";
  if (!outPath || outPath === "-") {
    process.stdout.write(text);
    return;
  }
  const resolved = resolvePath(outPath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, text, "utf8");
  process.stdout.write(`unimaker-cdp-resolved-facts wrote ${facts.length} facts -> ${resolved}\n`);
}

function chromeExecutablePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function stableJson(value) {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "0";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return "null";
}

function sha256Hex(text) {
  return createHash("sha256").update(text).digest("hex");
}

function positiveInteger(raw, label) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) fail(`${label} must be a positive integer`);
  return value;
}

function nonNegativeInteger(raw, label) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) fail(`${label} must be a non-negative integer`);
  return value;
}

function positiveNumber(raw, label) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) fail(`${label} must be a positive number`);
  return value;
}

function positiveFinite(value) {
  return Number.isFinite(value) && value > 0;
}

function nonEmpty(value, label) {
  const text = String(value || "").trim();
  if (!text) fail(`${label} must not be empty`);
  return text;
}

function resolvePath(path) {
  return resolve(path.replace(/^~/, process.env.HOME || "~"));
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function fail(message) {
  throw new Error(message);
}

function helpText() {
  return `unimaker-cdp-resolved-facts - collect CDP resolved facts from UniMaker PWA truth routes

Usage:
  node scripts/unimaker-cdp-resolved-facts.mjs [options]

Options:
  --project-root <dir>          UniMaker React.js root (default ${defaultProjectRoot})
  --base-url <url>              Connect to an already running PWA server instead of starting npm run dev
  --browser-ws-endpoint <url>   Connect to an existing Chromium over CDP
  --chrome-path <path>          Chromium executable path
  --out <path|->                JSONL output path; default stdout
  --write-content-snapshot-file <path>
                                Write current PWA ${distributedContentStorageKey} snapshot for one-click
  --port <n>                    Dev server port when --base-url is absent (default 45229)
  --viewport <WxH>              Viewport in CSS px (default 390x844)
  --route <id>                  Add one truth route; repeatable
  --routes <a,b,c>              Add comma-separated truth routes
  --routes-file <path>          Add newline-separated truth routes
  --node-limit <n>              Max DOM nodes with style/rect facts per route (default 80)
  --settle-ms <n>               Extra wait after runtime state and fonts are ready (default 1200)
  --desktop                     Use non-mobile viewport mode
  --headful                     Run Chromium with a visible window
  --fail-on-console-error       Fail when the browser emits console.error

Minimal real collection:
  node scripts/unimaker-cdp-resolved-facts.mjs --route lang_select --viewport 390x844 --out -
`;
}
