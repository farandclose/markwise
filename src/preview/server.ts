import { createServer, type Server, type IncomingMessage } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { buildDocPayload } from './payload.js';
import type { DocPayload } from './types.js';
import { fixText } from '../fix.js';
import { lintText } from '../lint.js';
import { appendReply, resolveNote, NoteMutationError } from './mutate.js';

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

/** Read and JSON-parse a request body. Empty body -> {}. Caps size and rejects invalid JSON. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
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
 * The one write path: read the file fresh, apply `transform`, re-stabilize anchors with fixText,
 * validate with lintText, and write only if there are no error-level findings. Never persists a
 * file that would not lint. Returns the fresh payload for the browser to repaint from.
 */
function persist(filePath: string, transform: (src: string) => string): DocPayload {
  const source = readFileSync(filePath, 'utf8');
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

/**
 * A localhost-only HTTP server for one document. GET /api/doc re-reads the file every request (so
 * external edits and, later, our own writes show up on refresh) and returns buildDocPayload(...).
 * Everything else is a static asset served from ASSET_DIR. Bind with `.listen(0, '127.0.0.1')`.
 */
export function createPreviewServer(filePath: string): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

      const mutateRoute = /^\/api\/note\/([^/]+)\/(reply|resolve)$/.exec(url.pathname);
      if (req.method === 'POST' && mutateRoute) {
        const id = decodeURIComponent(mutateRoute[1]!);
        const verb = mutateRoute[2]!;
        try {
          const now = new Date().toISOString();
          let payload: DocPayload;
          if (verb === 'reply') {
            const parsed = await readJsonBody(req);
            const body = isObj(parsed) && typeof parsed.body === 'string' ? parsed.body : '';
            payload = persist(filePath, (src) => appendReply(src, id, body, now));
          } else {
            payload = persist(filePath, (src) => resolveNote(src, id, now));
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(payload));
        } catch (err) {
          const status = err instanceof NoteMutationError ? err.status : 500;
          const message = err instanceof Error ? err.message : 'error';
          res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: message }));
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
