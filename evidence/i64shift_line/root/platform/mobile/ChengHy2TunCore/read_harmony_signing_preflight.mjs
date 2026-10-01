#!/usr/bin/env node
import fs from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("missing_build_profile");
  process.exit(1);
}

const doc = JSON.parse(fs.readFileSync(path, "utf8"));
const products = (((doc || {}).app || {}).products || []);
const signingName = (products[0] || {}).signingConfig || "default";
const configs = (((doc || {}).app || {}).signingConfigs || []);
const config = configs.find((item) => item.name === signingName) || configs[0] || {};
const material = config.material || {};

const required = [
  ["certpath", material.certpath],
  ["profile", material.profile],
  ["storeFile", material.storeFile],
  ["keyAlias", material.keyAlias],
  ["keyPassword", material.keyPassword],
  ["storePassword", material.storePassword],
];

for (const [key, value] of required) {
  if (!value || String(value).length === 0) {
    console.error(`missing_${key}`);
    process.exit(1);
  }
}

for (const [key, value] of required.slice(0, 3)) {
  if (!fs.existsSync(String(value))) {
    console.error(`missing_${key}_file`);
    process.exit(1);
  }
}

console.log(`harmony_signing_config=${signingName}`);
console.log("harmony_signing_material=present");
