// Cross-platform install smoke test. Packs the package, installs the tarball into a throwaway
// prefix (NOT the real global), then verifies the installed CLI runs. Exits non-zero on failure.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const work = mkdtempSync(join(tmpdir(), 'markwise-smoke-'));
const prefix = join(work, 'prefix');

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', shell: isWin, ...opts });
}

let failure = null;
try {
  // 1. pack (runs prepare -> builds dist) into the work dir
  const packOut = run(npm, ['pack', '--pack-destination', work], { cwd: root });
  const tarball = join(work, packOut.trim().split('\n').pop().trim());
  if (!existsSync(tarball)) throw new Error(`pack produced no tarball:\n${packOut}`);

  // 2. install the tarball into a throwaway prefix (does not touch the real global)
  run(npm, ['install', '-g', '--prefix', prefix, tarball], { cwd: root });

  // 3. resolve the installed binary (posix: <prefix>/bin/markwise; win: <prefix>/markwise.cmd)
  const bin = isWin ? join(prefix, 'markwise.cmd') : join(prefix, 'bin', 'markwise');
  if (!existsSync(bin)) {
    throw new Error(`installed binary missing at ${bin}; prefix contents: ${readdirSync(prefix).join(', ')}`);
  }

  // 4. lint sample.md -> expect a clean result
  const lintOut = run(bin, ['lint', 'sample.md'], { cwd: root });
  if (!/clean/i.test(lintOut)) throw new Error(`lint did not report clean:\n${lintOut}`);
  console.log('[smoke] lint sample.md: clean');

  // 5. preview sample.md in the background -> expect a loopback URL, then kill it
  await new Promise((resolve, reject) => {
    const child = spawn(bin, ['preview', 'sample.md'], { cwd: root, shell: isWin });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`no URL in 10s:\n${out}`)); }, 10000);
    child.stdout.on('data', (d) => {
      out += d.toString();
      const m = out.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) { clearTimeout(timer); child.kill(); console.log('[smoke] preview sample.md: ' + m[0]); resolve(); }
    });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
  });

  console.log('[smoke] PASS');
} catch (e) {
  failure = e;
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (failure) { console.error('[smoke] FAIL: ' + failure.message); process.exit(1); }
