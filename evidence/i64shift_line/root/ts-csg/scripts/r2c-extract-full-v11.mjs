#!/usr/bin/env node
// Full-project facts extraction for the r2c campaign census (v11: DeleteExpression operand).
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REACT_ROOT = '/Users/lbcheng/UniMaker/React.js';
const TSCSG = '/Users/lbcheng/cheng-lang/ts-csg';
const OUT = '/private/tmp/facts-v11-full.jsonl';

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(REACT_ROOT, []);
console.error(`extracting ${files.length} files -> ${OUT}`);
const args = [join(TSCSG, "dist", "cli.js"), "--emit", "csg-core", "--project", join(REACT_ROOT, "tsconfig.json")];

args.push('--root', REACT_ROOT, '--out', OUT);
const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 3600000, maxBuffer: 1 << 28 });
process.stderr.write((r.stderr || '').slice(-2000));
if (r.status !== 0) { console.error('EXTRACT FAILED rc=' + r.status); process.exit(1); }
const n = readFileSync(OUT, 'utf8').split('\n').filter(l => l.trim()).length;
const del = readFileSync(OUT, 'utf8').split('\n').filter(l => l.includes('DeleteExpression') && l.includes('"operand"')).length;
console.error(`OK facts=${n} deleteOpsWithOperand=${del}`);
