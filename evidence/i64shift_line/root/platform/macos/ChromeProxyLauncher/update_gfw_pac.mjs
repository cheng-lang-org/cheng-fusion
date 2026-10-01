#!/usr/bin/env node
import { domainToASCII } from "node:url";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const home = process.env.HOME;
if (!home) fail("HOME is required");

const gfwlistUrl = process.env.CHENG_GFWLIST_URL || "https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt";
const fetchProxy = process.env.CHENG_GFWLIST_FETCH_PROXY || "socks5h://127.0.0.1:10808";
const proxySpec = process.env.CHENG_BROWSER_PAC_PROXY_SPEC || "SOCKS5 127.0.0.1:10808; SOCKS 127.0.0.1:10808";
const pacPath = process.env.CHENG_BROWSER_PAC_PATH || join(home, ".config/cheng-proxy/cheng-gfw-split.pac");
const reportPath = process.env.CHENG_BROWSER_PAC_REPORT || `${pacPath}.report.json`;
const manualProxyPath = process.env.CHENG_BROWSER_MANUAL_PROXY_DOMAINS || join(scriptDir, "manual_proxy_domains.txt");
const manualDirectPath = process.env.CHENG_BROWSER_MANUAL_DIRECT_DOMAINS || join(scriptDir, "manual_direct_domains.txt");

function fail(message) {
  console.error(`gfw_pac_update_error=${message}`);
  process.exit(1);
}

function runCurl(url) {
  const args = [
    "--fail",
    "--location",
    "--show-error",
    "--silent",
    "--connect-timeout",
    "15",
    "--max-time",
    "60",
  ];
  if (fetchProxy) {
    args.push("--proxy", fetchProxy);
  }
  args.push(url);
  const proc = spawnSync("/usr/bin/curl", args, {
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    const err = Buffer.isBuffer(proc.stderr) ? proc.stderr.toString("utf8") : String(proc.stderr || "");
    fail(`fetch_failed status=${proc.status} stderr=${JSON.stringify(err.slice(0, 300))}`);
  }
  return proc.stdout;
}

function decodeGfwList(raw) {
  const compact = raw.toString("utf8").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) {
    fail("gfwlist_not_base64");
  }
  const decoded = Buffer.from(compact, "base64").toString("utf8");
  if (!decoded.includes("[AutoProxy") && !decoded.includes("!") && !decoded.includes("||")) {
    fail("decoded_gfwlist_shape_invalid");
  }
  return decoded;
}

function cleanDomain(value) {
  let host = String(value || "").trim().toLowerCase();
  if (!host) return "";
  host = host.replace(/^https?:\/\//, "");
  host = host.replace(/^\|\|/, "");
  host = host.replace(/^\|/, "");
  host = host.replace(/^\*\./, "");
  host = host.replace(/^\./, "");
  host = host.replace(/\.$/, "");
  host = host.split("/")[0];
  host = host.split(":")[0];
  host = host.split("^")[0];
  host = host.replace(/^\.+/, "").replace(/\.+$/, "");
  if (!host || host.includes("*") || host.includes("|")) return "";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return "";
  const ascii = domainToASCII(host);
  if (!ascii || ascii.length > 253) return "";
  const labels = ascii.split(".");
  if (labels.length < 2) return "";
  for (const label of labels) {
    if (!/^[a-z0-9-]{1,63}$/.test(label)) return "";
    if (label.startsWith("-") || label.endsWith("-")) return "";
  }
  return ascii;
}

function cleanIPv4(value) {
  const host = String(value || "").trim();
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return "";
  const parts = host.split(".").map((item) => Number(item));
  if (parts.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return "";
  return parts.join(".");
}

function regexPatternFromRule(rawRule) {
  let rule = rawRule.trim();
  if (rule.startsWith("@@")) rule = rule.slice(2);
  if (!rule.startsWith("/")) return "";
  let pattern = rule.slice(1);
  if (!pattern) return "";
  if (pattern.endsWith("/") && !pattern.endsWith("\\/")) {
    pattern = pattern.slice(0, -1);
  }
  try {
    new RegExp(pattern);
  } catch {
    return "";
  }
  return pattern;
}

function hostPrefixFromRule(rawRule) {
  let rule = rawRule.trim();
  if (rule.startsWith("@@")) rule = rule.slice(2);
  if (!rule.startsWith("||")) return "";
  const value = rule.slice(2).split(/[\/\^\*\|]/, 1)[0].toLowerCase();
  if (!/^[a-z0-9-]{2,63}$/.test(value)) return "";
  return value;
}

function extractDomainsFromRule(rawRule) {
  let rule = rawRule.trim();
  if (!rule) return [];
  const optionIndex = rule.indexOf("$");
  if (optionIndex >= 0) rule = rule.slice(0, optionIndex);
  if (!rule || rule.startsWith("!") || rule.startsWith("[") || rule.startsWith("#")) return [];
  if (rule.startsWith("@@")) rule = rule.slice(2);
  rule = rule.trim();
  if (!rule) return [];

  const out = new Set();
  const add = (candidate) => {
    const domain = cleanDomain(candidate);
    if (domain) out.add(domain);
  };

  if (rule.startsWith("||")) {
    add(rule.slice(2).split(/[\/\^\*\|]/, 1)[0]);
  } else {
    const protocolMatch = rule.match(/https?:\/\/([^\/\^\*\|:]+)/i);
    if (protocolMatch) add(protocolMatch[1]);
    const anchoredDomain = rule.match(/^\|?\.?([a-z0-9][a-z0-9.-]+\.[a-z]{2,})(?:[\/\^\*]|$)/i);
    if (anchoredDomain) add(anchoredDomain[1]);
  }

  const scanTexts = [
    rule,
    rule.replace(/\\\./g, ".").replace(/\\\//g, "/"),
  ];
  for (const text of scanTexts) {
    const hostLike = text.match(/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/ig) || [];
    for (const item of hostLike) add(item);
  }

  return [...out];
}

function extractIPv4FromRule(rawRule) {
  const out = new Set();
  const matches = rawRule.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || [];
  for (const item of matches) {
    const ip = cleanIPv4(item);
    if (ip) out.add(ip);
  }
  return [...out];
}

function readManualDomains(path) {
  const text = readFileSync(path, "utf8");
  const out = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const domain = cleanDomain(line);
    if (!domain && line !== "local") {
      fail(`invalid_manual_domain path=${path} value=${line}`);
    }
    out.add(line === "local" ? "local" : domain);
  }
  return out;
}

function addRuleDomains(
  ruleText,
  proxyDomains,
  directDomains,
  proxyHosts,
  directHosts,
  proxyHostPrefixes,
  directHostPrefixes,
  proxyUrlRegexes,
  directUrlRegexes,
  stats
) {
  for (const raw of ruleText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("!") || line.startsWith("[") || line.startsWith("#")) continue;
    const direct = line.startsWith("@@");
    const domains = extractDomainsFromRule(line);
    const hosts = extractIPv4FromRule(line);
    const hostPrefix = domains.length === 0 ? hostPrefixFromRule(line) : "";
    const regexPattern = domains.length === 0 && hosts.length === 0 && !hostPrefix ? regexPatternFromRule(line) : "";
    if (domains.length === 0 && hosts.length === 0 && !hostPrefix && !regexPattern) {
      stats.ignoredRules += 1;
      if (stats.ignoredRuleSamples.length < 50) stats.ignoredRuleSamples.push(line);
      continue;
    }
    stats.parsedRules += 1;
    for (const domain of domains) {
      if (direct) directDomains.add(domain);
      else proxyDomains.add(domain);
    }
    for (const host of hosts) {
      if (direct) directHosts.add(host);
      else proxyHosts.add(host);
    }
    if (hostPrefix) {
      if (direct) directHostPrefixes.add(hostPrefix);
      else proxyHostPrefixes.add(hostPrefix);
    }
    if (regexPattern) {
      if (direct) directUrlRegexes.add(regexPattern);
      else proxyUrlRegexes.add(regexPattern);
    }
  }
}

function mapLiteral(domains) {
  const entries = [...domains]
    .sort()
    .map((domain) => `  ${JSON.stringify(domain)}: 1`);
  return `{\n${entries.join(",\n")}\n}`;
}

function arrayLiteral(values) {
  return `[\n${[...values].sort().map((value) => `  ${JSON.stringify(value)}`).join(",\n")}\n]`;
}

function regexArrayLiteral(values) {
  return `[\n${[...values].sort().map((value) => `  new RegExp(${JSON.stringify(value)})`).join(",\n")}\n]`;
}

function renderPac(
  proxyDomains,
  directDomains,
  proxyHosts,
  directHosts,
  proxyHostPrefixes,
  directHostPrefixes,
  proxyUrlRegexes,
  directUrlRegexes,
  meta,
  proxySpec
) {
  return `// Generated by update_gfw_pac.mjs. Do not edit installed copy by hand.\n`
    + `// source=${meta.url}\n`
    + `// source_sha256=${meta.sha256}\n`
    + `// generated_at=${meta.generatedAt}\n`
    + `// pac_proxy_spec=${proxySpec}\n`
    + `var CHENG_PROXY = ${JSON.stringify(proxySpec)};\n`
    + `var CHENG_DIRECT = "DIRECT";\n`
    + `var CHENG_PROXY_DOMAINS = ${mapLiteral(proxyDomains)};\n`
    + `var CHENG_DIRECT_DOMAINS = ${mapLiteral(directDomains)};\n\n`
    + `var CHENG_PROXY_HOSTS = ${mapLiteral(proxyHosts)};\n`
    + `var CHENG_DIRECT_HOSTS = ${mapLiteral(directHosts)};\n`
    + `var CHENG_PROXY_HOST_PREFIXES = ${arrayLiteral(proxyHostPrefixes)};\n`
    + `var CHENG_DIRECT_HOST_PREFIXES = ${arrayLiteral(directHostPrefixes)};\n`
    + `var CHENG_PROXY_URL_REGEXES = ${regexArrayLiteral(proxyUrlRegexes)};\n`
    + `var CHENG_DIRECT_URL_REGEXES = ${regexArrayLiteral(directUrlRegexes)};\n\n`
    + `function chengHostLower(host) {\n`
    + `  return String(host || "").toLowerCase();\n`
    + `}\n\n`
    + `function chengIsPlainOrLocal(host) {\n`
    + `  if (isPlainHostName(host)) return true;\n`
    + `  if (host == "localhost" || host == "local" || dnsDomainIs(host, ".local")) return true;\n`
    + `  if (shExpMatch(host, "127.*") || shExpMatch(host, "10.*") || shExpMatch(host, "192.168.*")) return true;\n`
    + `  if (shExpMatch(host, "172.16.*") || shExpMatch(host, "172.17.*") || shExpMatch(host, "172.18.*") ||\n`
    + `      shExpMatch(host, "172.19.*") || shExpMatch(host, "172.2?.*") || shExpMatch(host, "172.30.*") ||\n`
    + `      shExpMatch(host, "172.31.*")) return true;\n`
    + `  return false;\n`
    + `}\n\n`
    + `function chengDomainMapHas(host, map) {\n`
    + `  var h = host;\n`
    + `  while (h.length > 0) {\n`
    + `    if (map[h]) return true;\n`
    + `    var dot = h.indexOf(".");\n`
    + `    if (dot < 0) return false;\n`
    + `    h = h.substring(dot + 1);\n`
    + `  }\n`
    + `  return false;\n`
    + `}\n\n`
    + `function chengHostPrefixMatch(host, prefixes) {\n`
    + `  for (var i = 0; i < prefixes.length; i++) {\n`
    + `    var prefix = prefixes[i];\n`
    + `    if (host.indexOf(prefix) == 0) return true;\n`
    + `    if (host.indexOf("." + prefix) >= 0) return true;\n`
    + `  }\n`
    + `  return false;\n`
    + `}\n\n`
    + `function chengUrlRegexMatch(url, regexes) {\n`
    + `  for (var i = 0; i < regexes.length; i++) {\n`
    + `    if (regexes[i].test(url)) return true;\n`
    + `  }\n`
    + `  return false;\n`
    + `}\n\n`
    + `function FindProxyForURL(url, host) {\n`
    + `  var h = chengHostLower(host);\n`
    + `  if (chengIsPlainOrLocal(h)) return CHENG_DIRECT;\n`
    + `  if (CHENG_DIRECT_HOSTS[h]) return CHENG_DIRECT;\n`
    + `  if (chengDomainMapHas(h, CHENG_DIRECT_DOMAINS)) return CHENG_DIRECT;\n`
    + `  if (chengHostPrefixMatch(h, CHENG_DIRECT_HOST_PREFIXES)) return CHENG_DIRECT;\n`
    + `  if (chengUrlRegexMatch(url, CHENG_DIRECT_URL_REGEXES)) return CHENG_DIRECT;\n`
    + `  if (CHENG_PROXY_HOSTS[h]) return CHENG_PROXY;\n`
    + `  if (chengDomainMapHas(h, CHENG_PROXY_DOMAINS)) return CHENG_PROXY;\n`
    + `  if (chengHostPrefixMatch(h, CHENG_PROXY_HOST_PREFIXES)) return CHENG_PROXY;\n`
    + `  if (chengUrlRegexMatch(url, CHENG_PROXY_URL_REGEXES)) return CHENG_PROXY;\n`
    + `  return CHENG_DIRECT;\n`
    + `}\n`;
}

function writeAtomic(path, data) {
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

const raw = runCurl(gfwlistUrl);
const rawHash = createHash("sha256").update(raw).digest("hex");
const decoded = decodeGfwList(raw);
const proxyDomains = new Set();
const directDomains = readManualDomains(manualDirectPath);
const proxyHosts = new Set();
const directHosts = new Set();
const proxyHostPrefixes = new Set();
const directHostPrefixes = new Set();
const proxyUrlRegexes = new Set();
const directUrlRegexes = new Set();
for (const domain of readManualDomains(manualProxyPath)) proxyDomains.add(domain);

const stats = { parsedRules: 0, ignoredRules: 0, ignoredRuleSamples: [] };
addRuleDomains(
  decoded,
  proxyDomains,
  directDomains,
  proxyHosts,
  directHosts,
  proxyHostPrefixes,
  directHostPrefixes,
  proxyUrlRegexes,
  directUrlRegexes,
  stats
);
for (const domain of directDomains) proxyDomains.delete(domain);
for (const host of directHosts) proxyHosts.delete(host);
for (const prefix of directHostPrefixes) proxyHostPrefixes.delete(prefix);

if (proxyDomains.size < 1000) {
  fail(`too_few_proxy_domains count=${proxyDomains.size}`);
}
if (stats.ignoredRules !== 0) {
  fail(`unparsed_gfwlist_rules count=${stats.ignoredRules} samples=${JSON.stringify(stats.ignoredRuleSamples)}`);
}

const generatedAt = new Date().toISOString();
const pac = renderPac(
  proxyDomains,
  directDomains,
  proxyHosts,
  directHosts,
  proxyHostPrefixes,
  directHostPrefixes,
  proxyUrlRegexes,
  directUrlRegexes,
  { url: gfwlistUrl, sha256: rawHash, generatedAt },
  proxySpec
);
const report = {
  generated_at: generatedAt,
  source_url: gfwlistUrl,
  source_sha256: rawHash,
  proxy_domain_count: proxyDomains.size,
  direct_domain_count: directDomains.size,
  proxy_host_count: proxyHosts.size,
  direct_host_count: directHosts.size,
  proxy_host_prefix_count: proxyHostPrefixes.size,
  direct_host_prefix_count: directHostPrefixes.size,
  proxy_url_regex_count: proxyUrlRegexes.size,
  direct_url_regex_count: directUrlRegexes.size,
  parsed_rule_count: stats.parsedRules,
  ignored_rule_count: stats.ignoredRules,
  ignored_rule_samples: stats.ignoredRuleSamples,
  pac_path: resolve(pacPath),
  pac_proxy_spec: proxySpec,
  socks_proxy_no_direct_fallback: true,
};

writeAtomic(pacPath, pac);
writeAtomic(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`gfw_pac_generated=1`);
console.log(`gfw_pac_path=${resolve(pacPath)}`);
console.log(`gfw_pac_proxy_domain_count=${proxyDomains.size}`);
console.log(`gfw_pac_direct_domain_count=${directDomains.size}`);
console.log(`gfw_pac_source_sha256=${rawHash}`);
