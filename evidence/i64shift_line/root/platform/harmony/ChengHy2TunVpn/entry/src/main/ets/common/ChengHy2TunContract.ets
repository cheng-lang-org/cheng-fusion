import { vpnExtension } from '@kit.NetworkKit';
import { Want } from '@kit.AbilityKit';

export const CHENG_HY2_TUN_BUNDLE = 'com.cheng.hy2tunvpn';
export const CHENG_HY2_TUN_MODULE = 'entry';
export const CHENG_HY2_TUN_EXTENSION = 'ChengHy2TunVpnAbility';
export const CHENG_HY2_TUN_DEFAULT_DNS = '198.18.0.1';
export const CHENG_HY2_TUN_STATUS_EVENT = 'com.cheng.hy2tunvpn.STATUS_CHANGED';
export const CHENG_HY2_TUN_STATUS_REQUEST_EVENT = 'com.cheng.hy2tunvpn.STATUS_REQUEST';
export const CHENG_HY2_TUN_STOP_REQUEST_EVENT = 'com.cheng.hy2tunvpn.STOP_REQUEST';
export const CHENG_HY2_TUN_MODE_TUN = 'tun';
export const CHENG_HY2_TUN_MODE_PAC = 'pac';
export const CHENG_HY2_TUN_ROUTE_FAST = 'fast';
export const CHENG_HY2_TUN_ROUTE_GLOBAL = 'global';
export const CHENG_HY2_TUN_UDP_QUIC_PORT = 7443;
export const CHENG_HY2_TUN_TCP_TLS_FORWARD_PORT = 443;

export interface ChengHy2TunPlatformConfig {
  configJson: string;
  certDerName: string;
  keyPk8DerName: string;
  trustRootDerName: string;
  tunAddress: string;
  tunPrefixLength: number;
  mtu: number;
  dnsAddress: string;
  productMode: string;
  routeMode: string;
  transport: string;
  authFileName: string;
}

export interface ChengHy2TunStatusEventPayload {
  state: string;
  configPath: string;
  connected: boolean;
  sessionId: number;
  tunFd: number;
  coreAvailable: boolean;
  rxBytes: number;
  txBytes: number;
  memAlloc: number;
  memFree: number;
  memLive: number;
  text: string;
  lastError: string;
}

interface ChengHy2TunIpv4AddressParts {
  address: string;
  prefixLength: number;
}

export function chengHy2TunWant(): Want {
  return {
    deviceId: '',
    bundleName: CHENG_HY2_TUN_BUNDLE,
    moduleName: CHENG_HY2_TUN_MODULE,
    abilityName: CHENG_HY2_TUN_EXTENSION
  };
}

export function chengHy2TunRequireConfigPath(configPath: string): string {
  const path = configPath.trim();
  if (path.length === 0) {
    throw new Error('config_path is empty');
  }
  if (path.indexOf('://') >= 0) {
    throw new Error('config_path must be an app sandbox file path');
  }
  return path;
}

function objectAt(value: Object, path: string): Record<string, Object> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid object field: ' + path);
  }
  return value as Record<string, Object>;
}

function requiredString(node: Record<string, Object>, key: string): string {
  const value = node[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('missing string field: ' + key);
  }
  return value;
}

function optionalString(node: Record<string, Object>, key: string, defaultValue: string): string {
  const value = node[key];
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value !== 'string') {
    throw new Error('invalid string field: ' + key);
  }
  return value.length > 0 ? value : defaultValue;
}

function optionalSiblingFileName(node: Record<string, Object>, key: string): string {
  const value = optionalString(node, key, '');
  if (value.length === 0) {
    return '';
  }
  if (value.indexOf('/') >= 0 || value.indexOf('\\') >= 0 || value.indexOf('..') >= 0 || value.indexOf('://') >= 0) {
    throw new Error(key + ' must be a file name in config directory');
  }
  return value;
}

function optionalInteger(node: Record<string, Object>, key: string, defaultValue: number): number {
  const value = node[key];
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value !== 'number' || Math.floor(value) !== value) {
    throw new Error('invalid integer field: ' + key);
  }
  return value;
}

function requiredObject(node: Record<string, Object>, key: string): Record<string, Object> {
  return objectAt(node[key] as Object, key);
}

function optionalObjectArrayFirst(node: Record<string, Object>, key: string): Record<string, Object> {
  const value = node[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('missing array field: ' + key);
  }
  return objectAt(value[0] as Object, key + '[0]');
}

function supportedTransport(raw: string): string {
  const value = raw.length > 0 ? raw : 'udp-quic';
  if (value === 'udp-quic' || value === 'tcp-tls-forward') {
    return value;
  }
  throw new Error('unsupported exit transport: ' + value);
}

function supportedProductMode(raw: string): string {
  const value = raw.length > 0 ? raw : CHENG_HY2_TUN_MODE_TUN;
  if (value === CHENG_HY2_TUN_MODE_TUN || value === CHENG_HY2_TUN_MODE_PAC) {
    return value;
  }
  throw new Error('unsupported client mode: ' + value);
}

export function chengHy2TunCanonicalConfigJson(configJson: string): string {
  const root = objectAt(JSON.parse(configJson) as Object, 'root');
  const client = requiredObject(root, 'client');
  const tun = requiredObject(client, 'tun');
  const address = tun['address'];
  let changed = false;
  if (typeof address === 'string' &&
    (address === '198.18.0.2/16' || address === '198.18.0.2/32' || address === '10.111.0.2/24')) {
    tun['address'] = '10.111.0.2/32';
    changed = true;
  }
  const dnsServer = tun['dns_server'];
  if (typeof dnsServer === 'string' && (dnsServer === '8.8.8.8' || dnsServer === '10.111.0.1')) {
    tun['dns_server'] = CHENG_HY2_TUN_DEFAULT_DNS;
    changed = true;
  }
  const exitsValue = root['exits'];
  if (Array.isArray(exitsValue)) {
    for (let i = 0; i < exitsValue.length; i++) {
      const entry = exitsValue[i] as Record<string, Object>;
      // Respect the configured exit port verbatim: the dosg deployment serves
      // tcp-tls-forward on 7443, so the previous cross-transport port swap
      // silently rewrote it to 443 and broke every dial.
      const transport = optionalString(entry, 'transport', 'udp-quic');
      const port = Number(entry['port']);
      if (!(Number.isFinite(port) && port > 0)) {
        entry['port'] = transport === 'udp-quic' ? CHENG_HY2_TUN_UDP_QUIC_PORT : CHENG_HY2_TUN_TCP_TLS_FORWARD_PORT;
        changed = true;
      }
    }
  }
  return changed ? JSON.stringify(root) : configJson;
}

export function chengHy2TunIsManagedDefaultConfig(configJson: string): boolean {
  try {
    const root = objectAt(JSON.parse(configJson) as Object, 'root');
    if (root['protocol'] !== 'hy2-tun-v1') {
      return false;
    }
    const client = objectAt(root['client'] as Object, 'client');
    if (optionalString(client, 'cert_der', '') !== 'transport.cert.der') {
      return false;
    }
    if (optionalString(client, 'key_pk8_der', '') !== 'transport.key.pk8') {
      return false;
    }
    if (optionalString(client, 'trust_root_der', '') !== 'transport.root.der') {
      return false;
    }
    const exitsValue = root['exits'];
    if (!Array.isArray(exitsValue) || exitsValue.length === 0) {
      return false;
    }
    for (let i = 0; i < exitsValue.length; i++) {
      const entry = objectAt(exitsValue[i] as Object, 'exits[' + i.toString() + ']');
      const inlineAuth = optionalString(entry, 'auth', '');
      if (inlineAuth.length > 0) {
        return false;
      }
      const authFile = optionalString(entry, 'auth_file', '');
      if (authFile.length > 0 && authFile !== 'auth.token') {
        return false;
      }
    }
    return true;
  } catch (_err) {
    return false;
  }
}

function parseDecimalOctet(value: string, label: string): number {
  if (value.length === 0 || value.length > 3) {
    throw new Error(label + ' octet is invalid');
  }
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 48 || code > 57) {
      throw new Error(label + ' octet is not decimal');
    }
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    throw new Error(label + ' octet out of range');
  }
  return parsed;
}

function parseIpv4AddressWithPrefix(raw: string, defaultPrefix: number): ChengHy2TunIpv4AddressParts {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('client.tun.address missing');
  }
  const slash = trimmed.indexOf('/');
  if (slash !== trimmed.lastIndexOf('/')) {
    throw new Error('client.tun.address prefix invalid');
  }
  const addressText = slash >= 0 ? trimmed.substring(0, slash) : trimmed;
  const prefixText = slash >= 0 ? trimmed.substring(slash + 1) : '';
  const prefixLength = slash >= 0 ? Number(prefixText) : defaultPrefix;
  if (!Number.isInteger(prefixLength) || prefixLength < 1 || prefixLength > 32) {
    throw new Error('client.tun.address prefix out of range');
  }
  const octets = addressText.split('.');
  if (octets.length !== 4) {
    throw new Error('client.tun.address must be IPv4');
  }
  const a = parseDecimalOctet(octets[0], 'client.tun.address');
  const b = parseDecimalOctet(octets[1], 'client.tun.address');
  const c = parseDecimalOctet(octets[2], 'client.tun.address');
  const d = parseDecimalOctet(octets[3], 'client.tun.address');
  return {
    address: a.toString() + '.' + b.toString() + '.' + c.toString() + '.' + d.toString(),
    prefixLength: prefixLength
  };
}

export function chengHy2TunConfigFromJson(configJson: string): ChengHy2TunPlatformConfig {
  if (configJson.trim().length === 0) {
    throw new Error('configJson is empty');
  }
  const root = objectAt(JSON.parse(configJson) as Object, 'root');
  const protocol = requiredString(root, 'protocol');
  if (protocol !== 'hy2-tun-v1') {
    throw new Error('unsupported protocol: ' + protocol);
  }
  const client = requiredObject(root, 'client');
  const certDerName = requiredString(client, 'cert_der');
  const keyPk8DerName = requiredString(client, 'key_pk8_der');
  const trustRootDerName = requiredString(client, 'trust_root_der');
  const tun = requiredObject(client, 'tun');
  const enabled = tun['enabled'];
  if (enabled !== true) {
    throw new Error('client.tun.enabled required');
  }
  const address = parseIpv4AddressWithPrefix(requiredString(tun, 'address'), 32);
  const mtu = optionalInteger(tun, 'mtu', 1500);
  if (mtu < 576 || mtu > 9000) {
    throw new Error('invalid tun mtu');
  }
  const routeMode = optionalString(tun, 'route_mode', CHENG_HY2_TUN_ROUTE_FAST);
  if (routeMode !== CHENG_HY2_TUN_ROUTE_FAST && routeMode !== CHENG_HY2_TUN_ROUTE_GLOBAL) {
    throw new Error('unsupported tun route_mode: ' + routeMode);
  }
  const dnsMode = optionalString(tun, 'dns_mode', 'fake-ip');
  if (dnsMode !== 'fake-ip') {
    throw new Error('unsupported tun dns_mode: ' + dnsMode);
  }
  const fakeIpPrefix = optionalString(tun, 'fake_ip_prefix', '198.18.0.0/16');
  if (fakeIpPrefix !== '198.18.0.0/16') {
    throw new Error('unsupported tun fake_ip_prefix: ' + fakeIpPrefix);
  }
  const dnsAddress = optionalString(tun, 'dns_server', CHENG_HY2_TUN_DEFAULT_DNS);
  const productMode = supportedProductMode(optionalString(client, 'mode', CHENG_HY2_TUN_MODE_TUN));
  const firstExit = optionalObjectArrayFirst(root, 'exits');
  const transport = supportedTransport(optionalString(firstExit, 'transport', 'udp-quic'));
  const authFileName = optionalSiblingFileName(firstExit, 'auth_file');
  return {
    configJson: configJson,
    certDerName: certDerName,
    keyPk8DerName: keyPk8DerName,
    trustRootDerName: trustRootDerName,
    tunAddress: address.address,
    tunPrefixLength: address.prefixLength,
    mtu: mtu,
    dnsAddress: dnsAddress,
    productMode: productMode,
    routeMode: routeMode,
    transport: transport,
    authFileName: authFileName
  };
}

function chengHy2TunRoute(address: string, prefixLength: number, isDefaultRoute: boolean): vpnExtension.RouteInfo {
  return {
    // OpenHarmony RouteInfo.interface is required; samples use the fixed vNIC name.
    interface: 'vpn-tun',
    destination: {
      address: {
        address: address,
        family: 1,
        port: 0
      },
      prefixLength: prefixLength
    },
    gateway: {
      address: '0.0.0.0',
      family: 1,
      port: 0
    },
    hasGateway: false,
    isDefaultRoute: isDefaultRoute
  };
}

function chengHy2TunRoutes(routeMode: string): vpnExtension.RouteInfo[] {
  // [parity] 与安卓同款: OS 层全接管(default route 进 TUN), 分流完全由
  // cheng 策略层承担(fake-ip/白名单 IP→隧道, 其余→worker Direct 直连)。
  // 旧形 OS 级拆分路由只把 fake-ip+白名单段导进 TUN——浏览器 HTTPDNS/
  // 自带解析绕过 fake DNS 拿到白名单外真实 IP 时, 包不进 TUN 直连被墙
  // (鸿蒙浏览器 google.com 打不开的根因, 安卓无此问题因 VpnService 全接管)。
  const routes: vpnExtension.RouteInfo[] = [
    chengHy2TunRoute('0.0.0.0', 0, true),
    chengHy2TunRoute('198.18.0.0', 16, false)
  ];
  return routes;
}

export function chengHy2TunVpnConfig(config: ChengHy2TunPlatformConfig): vpnExtension.VpnConfig {
  if (config.productMode !== CHENG_HY2_TUN_MODE_TUN) {
    throw new Error('VpnExtension only supports tun mode');
  }
  return {
    addresses: [
      {
        address: {
          address: config.tunAddress,
          family: 1,
          port: 0
        },
        prefixLength: 32
      }
    ],
    routes: chengHy2TunRoutes(config.routeMode),
    dnsAddresses: [
      config.dnsAddress
    ],
    mtu: config.mtu,
    isIPv4Accepted: true,
    isIPv6Accepted: false,
    isBlocking: true
  };
}
