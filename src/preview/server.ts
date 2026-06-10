import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { buildDocPayload } from './payload.js';
import type { DocPayload } from './types.js';
import { fixText } from '../fix.js';
import { lintText } from '../lint.js';
import { shortHash } from '../hash.js';
import { appendReply, resolveNote, createNote, discardNote, NoteMutationError } from './mutate.js';

// Static assets live next to the compiled server (dist/preview/assets/, populated by the build's
// copy step). Resolved relative to this module so it works whether run from source-test or dist.
const ASSET_DIR = new URL('./assets/', import.meta.url);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// The server binds to 127.0.0.1, but binding alone does not authenticate the *origin* of a
// request: any webpage open in the same browser can fire requests at localhost ports, and DNS
// rebinding can point an attacker-controlled hostname at 127.0.0.1. Two cheap gates close this:
//  - every request's Host header must actually be a loopback name (rebinding sends its own domain);
//  - every mutation must carry the x-mw-version precondition header. Custom headers cannot be
//    attached to cross-origin requests without a CORS preflight, which this server never answers,
//    so a hostile page cannot forge a write even with the port number in hand.
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(`http://${hostHeader}`).hostname);
  } catch {
    return false;
  }
}

/**
 * Read and JSON-parse a request body. Empty body -> {}. Caps size, rejects invalid JSON, and
 * rejects a non-empty body that is not declared application/json (a cross-origin no-cors POST can
 * only declare text/plain, so this also backs up the x-mw-version preflight gate).
 */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    req.setEncoding('utf8'); // decode at the stream level so multi-byte chars never split across chunks
    let data = '';
    req.on('data', (chunk) => {
      if (data.length > 1_000_000) {
        reject(new NoteMutationError('request body too large', 413));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (data.trim() === '') return resolve({});
      const ctype = req.headers['content-type'] ?? '';
      if (!ctype.toLowerCase().startsWith('application/json')) {
        return reject(new NoteMutationError('body must be application/json', 415));
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new NoteMutationError('invalid JSON body', 400));
      }
    });
    req.on('error', reject);
  });
}

/**
 * The one write path: read the file fresh, check the caller's version precondition against it,
 * apply `transform`, re-stabilize anchors with fixText, validate with lintText, and write only if
 * there are no error-level findings. Never persists a file that would not lint, and never applies
 * a mutation built against content that has since changed (the browser's offsets and note ids
 * would silently land on the wrong text). Returns the fresh payload for the browser to repaint from.
 */
function persist(
  filePath: string,
  expectedVersion: string | undefined,
  transform: (src: string) => string
): DocPayload {
  const source = readFileSync(filePath, 'utf8');
  if (expectedVersion === undefined || expectedVersion === '') {
    throw new NoteMutationError('missing x-mw-version header (reload the page)', 428);
  }
  if (shortHash(source) !== expectedVersion) {
    throw new NoteMutationError('document changed on disk since the page loaded', 409);
  }
  const mutated = transform(source); // throws NoteMutationError on bad input
  const fixed = fixText(mutated).output;
  const findings = lintText(fixed);
  if (findings.some((f) => f.severity === 'error')) {
    throw new NoteMutationError(
      'the change would produce an invalid document; run `markwise lint` on the file first',
      422
    );
  }
  writeFileSync(filePath, fixed, 'utf8');
  return buildDocPayload(fixed, filePath);
}

/** Write a JSON error response, mapping a NoteMutationError to its status (else 500). */
function sendError(res: ServerResponse, err: unknown): void {
  const status = err instanceof NoteMutationError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'error';
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: message }));
}

/**
 * A localhost-only HTTP server for one document. GET /api/doc re-reads the file every request (so
 * external edits and, later, our own writes show up on refresh) and returns buildDocPayload(...).
 * Everything else is a static asset served from ASSET_DIR. Bind with `.listen(0, '127.0.0.1')`.
 */
export function createPreviewServer(filePath: string): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

      // DNS-rebinding gate: a request whose Host is not a loopback name was addressed to some
      // other (attacker-controlled) hostname that merely resolves here. Refuse everything.
      if (!isLoopbackHost(req.headers.host)) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'forbidden host' }));
        return;
      }

      const versionHeader = req.headers['x-mw-version'];
      const version = typeof versionHeader === 'string' ? versionHeader : undefined;

      const mutateRoute = /^\/api\/note\/([^/]+)\/(reply|resolve|discard)$/.exec(url.pathname);
      if (req.method === 'POST' && mutateRoute) {
        const id = decodeURIComponent(mutateRoute[1]!);
        const verb = mutateRoute[2]!;
        try {
          const now = new Date().toISOString();
          let payload: DocPayload;
          if (verb === 'reply') {
            const parsed = await readJsonBody(req);
            const body = isObj(parsed) && typeof parsed.body === 'string' ? parsed.body : '';
            payload = persist(filePath, version, (src) => appendReply(src, id, body, now));
          } else if (verb === 'discard') {
            payload = persist(filePath, version, (src) => discardNote(src, id));
          } else {
            payload = persist(filePath, version, (src) => resolveNote(src, id, now));
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(payload));
        } catch (err) {
          sendError(res, err);
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/note') {
        try {
          const parsed = await readJsonBody(req);
          const rawKind = isObj(parsed) ? parsed.kind : undefined;
          if (rawKind !== 'point' && rawKind !== 'span') {
            throw new NoteMutationError('kind must be "point" or "span"', 400);
          }
          const kind: 'point' | 'span' = rawKind;
          const rawType = isObj(parsed) && typeof parsed.type === 'string' ? parsed.type : 'comment';
          if (rawType !== 'comment' && rawType !== 'insert' && rawType !== 'delete' && rawType !== 'replace') {
            throw new NoteMutationError('type must be "comment", "insert", "delete", or "replace"', 400);
          }
          const type: 'comment' | 'insert' | 'delete' | 'replace' = rawType;
          const start = isObj(parsed) && typeof parsed.start === 'number' ? parsed.start : NaN;
          const end = isObj(parsed) && typeof parsed.end === 'number' ? parsed.end : undefined;
          const body = isObj(parsed) && typeof parsed.body === 'string' ? parsed.body : '';
          const text = isObj(parsed) && typeof parsed.text === 'string' ? parsed.text : undefined;
          const now = new Date().toISOString();
          let createdId = '';
          const payload = persist(filePath, version, (src) => {
            const r = createNote(src, { kind, start, end, body, at: now, type, text });
            createdId = r.id;
            return r.output;
          });
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ...payload, createdId }));
        } catch (err) {
          sendError(res, err);
        }
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/doc') {
        const source = readFileSync(filePath, 'utf8');
        const payload = buildDocPayload(source, filePath);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(payload));
        return;
      }

      if (req.method === 'GET') {
        const name = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
        // No path traversal: a single flat filename with a known extension only.
        if (/^[a-zA-Z0-9._-]+$/.test(name) && MIME[extname(name)]) {
          try {
            const data = await readFile(new URL(name, ASSET_DIR));
            res.writeHead(200, { 'content-type': MIME[extname(name)]! });
            res.end(data);
            return;
          } catch {
            // fall through to 404
          }
        }
      }

      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Server error');
    }
  });
}
