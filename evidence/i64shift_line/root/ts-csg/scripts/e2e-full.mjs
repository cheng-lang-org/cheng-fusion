import { readFileSync, writeFileSync, mkdirSync, cpSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

const TSCSG = '/Users/lbcheng/cheng-lang/ts-csg';
const REACT_ROOT = '/Users/lbcheng/UniMaker/React.js';
const CHENG = '/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3';
const MAIN_TREE = '/Users/lbcheng/cheng-lang';
const COMPONENT = 'useDistributedNode';
const SRC_FILE = join(REACT_ROOT, 'app', 'components', 'profile', COMPONENT + '.ts');

const scratch = mkdtempSync(join(tmpdir(), 'e2e-full-'));
mkdirSync(join(scratch, 'src'), { recursive: true });
writeFileSync(join(scratch, 'cheng-package.toml'), 'package_id = "e2e-full"\n');
cpSync(join(MAIN_TREE, 'src', 'std'), join(scratch, 'src', 'std'), { recursive: true });
cpSync(join(MAIN_TREE, 'src', 'core'), join(scratch, 'src', 'core'), { recursive: true });
cpSync(join(MAIN_TREE, 'src', 'apps'), join(scratch, 'src', 'apps'), { recursive: true });

// 1. extract
const factsPath = join(scratch, 'facts.jsonl');
const ex = spawnSync(process.execPath, [
  join(TSCSG, 'dist', 'cli.js'), '--emit', 'csg-core',
  '--file', SRC_FILE, '--root', REACT_ROOT, '--out', factsPath,
], { encoding: 'utf8', timeout: 300000 });
if (ex.status !== 0) { console.error('extract fail:', ex.stderr); process.exit(1); }
console.log('extract OK');

// 2. transpile
const { transpileR2c } = await import(pathToFileURL(join(TSCSG, 'dist', 'csg-cheng-transpiler.js')).href);
const facts = readFileSync(factsPath, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
const result = transpileR2c(facts, COMPONENT);
const failed = result.results.filter(x => !x.ok);
console.log('fns ok:', result.results.filter(x => x.ok).length, 'fail:', failed.length);
for (const f of failed) for (const d of f.diagnostics) console.log('  FAIL:', d.reason.slice(0, 140));

const NL = '\n';
const zeroInit = result.slots.map(s => `    ${s.slotVar} = 0`).join(NL);
const mainFn = `fn main(): int32 =${NL}    ${zeroInit}${NL}    ${COMPONENT}()${NL}    return 0${NL}`;
writeFileSync(join(scratch, 'src', 'prog.cheng'), result.code + NL + NL + mainFn);

// 3. compile
const exePath = join(scratch, 'prog');
const compile = spawnSync(CHENG, [
  'system-link-exec', `--root:${scratch}`, '--in:src/prog.cheng',
  '--emit:exe', '--target:arm64-apple-darwin',
  `--out:${exePath}`, `--report-out:${join(scratch, 'prog.report.txt')}`,
], { encoding: 'utf8', timeout: 600000 });
if (compile.status !== 0) { console.error('compile fail:', compile.stderr.slice(0, 500)); process.exit(1); }
console.log('compile OK');

// 4. run
chmodSync(exePath, 0o755);
const run = spawnSync(exePath, [], { encoding: 'utf8' });
console.log('run exit:', run.status);
process.exit(run.status === 0 ? 0 : 1);
