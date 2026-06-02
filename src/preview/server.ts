import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { buildDocPayload } from './payload.js';

// Static assets live next to the compiled server (dist/preview/assets/, populated by the build's
// copy step). Resolved relative to this module so it works whether run from source-test or dist.
const ASSET_DIR = new URL('./assets/', import.meta.url);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

/**
 * A localhost-only HTTP server for one document. GET /api/doc re-reads the file every request (so
 * external edits and, later, our own writes show up on refresh) and returns buildDocPayload(...).
 * Everything else is a static asset served from ASSET_DIR. Bind with `.listen(0, '127.0.0.1')`.
 */
export function createPreviewServer(filePath: string): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

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
