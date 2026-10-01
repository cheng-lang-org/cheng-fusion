function openCreateElement(tagName: string): Element {
  return document.createElement(tagName);
}

function topLevelListener(event: Event): void {
  event.preventDefault();
}

function selectMeta(selector: string): Element | null {
  return document.querySelector(selector);
}

const topLevelRoot = document.getElementById("root");
const topLevelQuery = document.querySelector("main");
window.addEventListener("load", topLevelListener);
void topLevelRoot;
void topLevelQuery;

export function main(): number {
  const div = document.createElement("div");
  const body = document.body;
  const head = document.head;
  const rootElement = document.documentElement;
  const hidden = document.hidden;
  const visibility = document.visibilityState;
  const bodyDataset = document.body.dataset;
  const encoded = new TextEncoder().encode("hello");
  const decoded = new TextDecoder().decode(encoded);
  const encoder = new TextEncoder();
  const namedEncoded = encoder.encode("world");
  const decoder = new TextDecoder();
  const namedDecoded = decoder.decode(namedEncoded);
  const base64Value = btoa("hello");
  const decodedBase64Value = atob(base64Value);
  const syntheticClick = new Event("click");
  const eventWithOptions = new Event("click", { bubbles: true, cancelable: true });
  const syntheticMouse = new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 });
  const syntheticKey = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", ctrlKey: true });
  const syntheticCustom = new CustomEvent("ready", { detail: "ok" });
  const clickType = syntheticMouse.type;
  const clickButton = syntheticMouse.button;
  const keyName = syntheticKey.key;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollTop = window.scrollY;
  const wideViewport = window.matchMedia("(min-width: 768px)").matches;
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const mediaQueryHandler = (): void => undefined;
  mediaQuery.addEventListener("change", mediaQueryHandler);
  mediaQuery.removeEventListener("change", mediaQueryHandler);
  mediaQuery.addListener(mediaQueryHandler);
  mediaQuery.removeListener(mediaQueryHandler);
  const frameId = window.requestAnimationFrame(() => undefined);
  window.cancelAnimationFrame(frameId);
  const currentLocation = window.location;
  const currentHref = window.location.href;
  const currentPath = window.location.pathname;
  const currentSearch = window.location.search;
  const globalHref = location.href;
  const nav = navigator;
  const language = navigator.language;
  const endpoint = new URL("/search?q=1", window.location.href);
  endpoint.searchParams.set("page", "2");
  const queryValue = endpoint.searchParams.get("q");
  endpoint.searchParams.delete("unused");
  const endpointHref = endpoint.toString();
  const endpointText = endpoint.searchParams.toString();
  const params = new URLSearchParams("mode=test");
  params.set("ready", "1");
  const timeoutId = window.setTimeout(() => undefined, 1);
  window.clearTimeout(timeoutId);
  const globalTimeoutId = globalThis.setTimeout(() => undefined, 1);
  globalThis.clearTimeout(globalTimeoutId);
  document.body.dataset.ready = "1";
  div.style.setProperty("display", "block", "important");
  const currentDisplay = div.style.display;
  const bodyOverflow = document.body.style.overflow;
  Object.assign(div.style, {
    width: "100px",
    height: "40px",
  } as Partial<CSSStyleDeclaration>);
  const doc: Document = document;
  const section = doc.createElement("section");
  const extra = doc.createElement("span");
  const threshold = 0.15;
  const intersectionObserver = new IntersectionObserver((entries) => {
    void entries;
  }, { threshold });
  intersectionObserver.observe(section);
  intersectionObserver.disconnect();
  div.append(section, "tail");
  div.appendChild(extra);
  const containsSection = div.contains(section);
  div.setAttribute("id", "run");
  const foundById = document.getElementById("run");
  const foundSection = document.querySelector("div section");
  const foundMeta = selectMeta('meta[name="description"]');
  const foundItems = document.querySelectorAll("div");
  const sectionMatches = section.matches("section");
  const closestDiv = section.closest("div");
  extra.remove();
  div.setAttribute("role", "button");
  const role = div.getAttribute("role");
  const hasRole = div.hasAttribute("role");
  div.classList.add("ready");
  document.body.classList.add("body-ready");
  div.classList.toggle("active", true);
  const active = div.classList.contains("active");
  div.classList.remove("ready");
  div.removeAttribute("role");
  const clickHandler = (event: Event): void => {
    event.preventDefault();
  };
  const resizeHandler = (event: Event): void => {
    event.stopPropagation();
  };
  div.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  div.addEventListener("click", clickHandler, { once: true });
  div.removeEventListener("click", clickHandler, false);
  document.addEventListener("keydown", clickHandler, true);
  window.addEventListener("resize", resizeHandler, { capture: true, once: true });
  window.removeEventListener("resize", resizeHandler, { capture: true });
  div.dispatchEvent(new Event("click"));
  div.dispatchEvent(syntheticClick);
  document.dispatchEvent(new Event("keydown"));
  window.dispatchEvent(new Event("resize"));
  void div;
  void body;
  void head;
  void rootElement;
  void hidden;
  void visibility;
  void bodyDataset;
  void decoded;
  void namedDecoded;
  void decodedBase64Value;
  void syntheticClick;
  void eventWithOptions;
  void syntheticMouse;
  void syntheticKey;
  void syntheticCustom;
  void clickType;
  void clickButton;
  void keyName;
  void viewportWidth;
  void viewportHeight;
  void scrollTop;
  void wideViewport;
  void mediaQuery;
  void currentLocation;
  void currentHref;
  void currentPath;
  void currentSearch;
  void globalHref;
  void nav;
  void language;
  void queryValue;
  void endpointHref;
  void endpointText;
  void params;
  void intersectionObserver;
  void role;
  void hasRole;
  void active;
  void containsSection;
  void foundById;
  void foundSection;
  void foundMeta;
  void foundItems;
  void sectionMatches;
  void closestDiv;
  void currentDisplay;
  void bodyOverflow;
  void section;
  void extra;
  void openCreateElement("span");
  return 7;
}
