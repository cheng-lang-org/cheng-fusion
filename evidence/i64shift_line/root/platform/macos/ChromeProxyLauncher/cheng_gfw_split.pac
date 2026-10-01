var CHENG_PROXY = "SOCKS5 127.0.0.1:10808; SOCKS 127.0.0.1:10808; DIRECT";
var CHENG_DIRECT = "DIRECT";

var CHENG_PROXY_SUFFIXES = [
  "anthropic.com",
  "cdninstagram.com",
  "chatgpt.com",
  "claude.ai",
  "discord.com",
  "discord.gg",
  "discordapp.com",
  "facebook.com",
  "fbcdn.net",
  "githubassets.com",
  "githubcopilot.com",
  "githubusercontent.com",
  "ggpht.com",
  "google.com",
  "googleapis.com",
  "googlesource.com",
  "googleusercontent.com",
  "gstatic.com",
  "instagram.com",
  "medium.com",
  "oaistatic.com",
  "oaiusercontent.com",
  "openai.com",
  "reddit.com",
  "redd.it",
  "t.co",
  "telegra.ph",
  "telegram.org",
  "t.me",
  "twimg.com",
  "twitter.com",
  "wikimedia.org",
  "wikipedia.org",
  "x.com",
  "youtu.be",
  "youtube.com",
  "youtubei.googleapis.com",
  "ytimg.com"
];

function chengHostLower(host) {
  return String(host || "").toLowerCase();
}

function chengIsPlainOrLocal(host) {
  if (isPlainHostName(host)) return true;
  if (dnsDomainIs(host, ".local")) return true;
  if (shExpMatch(host, "localhost")) return true;
  if (shExpMatch(host, "127.*")) return true;
  if (shExpMatch(host, "10.*")) return true;
  if (shExpMatch(host, "192.168.*")) return true;
  if (shExpMatch(host, "172.16.*") || shExpMatch(host, "172.17.*") ||
      shExpMatch(host, "172.18.*") || shExpMatch(host, "172.19.*") ||
      shExpMatch(host, "172.2?.*") || shExpMatch(host, "172.30.*") ||
      shExpMatch(host, "172.31.*")) return true;
  return false;
}

function chengSuffixMatch(host, suffix) {
  return host == suffix || dnsDomainIs(host, "." + suffix);
}

function FindProxyForURL(url, host) {
  var h = chengHostLower(host);
  if (chengIsPlainOrLocal(h)) return CHENG_DIRECT;

  for (var i = 0; i < CHENG_PROXY_SUFFIXES.length; i++) {
    if (chengSuffixMatch(h, CHENG_PROXY_SUFFIXES[i])) {
      return CHENG_PROXY;
    }
  }

  return CHENG_DIRECT;
}
