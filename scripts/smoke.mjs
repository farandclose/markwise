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

// Tear down the spawned preview child. On Windows the installed binary is a cmd.exe shim around
// `node dist/cli.js`; child.kill() would only reach the shim and orphan the long-lived server
// (which never self-exits), leaving a file handle in the install prefix that breaks cleanup. So
// kill the whole tree with taskkill /t. Best-effort: the child may already be gone.
function killTree(child) {
  if (child.pid == null) return;
  try {
    if (isWin) execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    else child.kill();
  } catch {
    /* already exited */
  }
}

let failure = null;
try {
  // 1. pack (runs prepare -> builds dist) into the throwaway work dir
  run(npm, ['pack', '--pack-destination', work], { cwd: root });
  // The work dir was just created and holds only the packed tarball (prefix/ does not exist yet),
  // so resolve the tarball by listing the dir rather than parsing npm's stdout - the prepare build
  // also writes to stdout, which makes line-parsing fragile.
  const tgz = readdirSync(work).filter((f) => f.endsWith('.tgz'));
  if (tgz.length !== 1) {
    throw new Error(`expected exactly one .tgz in ${work}, found: ${tgz.join(', ') || '(none)'}`);
  }
  const tarball = join(work, tgz[0]);

  // 2. install the tarball into a throwaway prefix (does not touch the real global)
  run(npm, ['install', '-g', '--prefix', prefix, tarball], { cwd: root });

  // 3. resolve the installed binary (posix: <prefix>/bin/markwise; win: <prefix>/markwise.cmd)
  const bin = isWin ? join(prefix, 'markwise.cmd') : join(prefix, 'bin', 'markwise');
  if (!existsSync(bin)) {
    throw new Error(`installed binary missing at ${bin}; prefix contents: ${readdirSync(prefix).join(', ')}`);
  }

  // 4. lint sample.md -> expect a clean result (lint exits on its own)
  const lintOut = run(bin, ['lint', 'sample.md'], { cwd: root });
  if (!/:\s*clean\b/i.test(lintOut)) throw new Error(`lint did not report clean:\n${lintOut}`);
  console.log('[smoke] lint sample.md: clean');

  // 5. preview sample.md in the background -> expect a loopback URL, then tear it down
  await new Promise((resolve, reject) => {
    const child = spawn(bin, ['preview', 'sample.md'], { cwd: root, shell: isWin });
    let out = '';
    let err = '';
    let settled = false;
    let timer;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killTree(child);
      fn(arg);
    };
    timer = setTimeout(
      () => finish(reject, new Error(`no URL in 10s:\nstdout:\n${out}\nstderr:\n${err}`)),
      10000
    );
    child.stdout.on('data', (d) => {
      out += d.toString();
      const m = out.match(/http:\/\/127\.0\.0\.1:[1-9]\d*/);
      if (m) { console.log('[smoke] preview sample.md: ' + m[0]); finish(resolve); }
    });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => finish(reject, e));
    child.on('exit', (code) =>
      finish(reject, new Error(`preview exited early (code ${code}) before printing a URL:\nstdout:\n${out}\nstderr:\n${err}`))
    );
  });

  console.log('[smoke] PASS');
} catch (e) {
  failure = e;
} finally {
  // Best-effort cleanup: never let a temp-dir removal error mask the real test result.
  try {
    rmSync(work, { recursive: true, force: true });
  } catch (e) {
    console.error('[smoke] warning: could not remove temp dir ' + work + ': ' + e.message);
  }
}
if (failure) { console.error('[smoke] FAIL: ' + failure.message); process.exit(1); }
