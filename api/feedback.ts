import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleFeedback, CLIENT_HEADER_NAME } from './_lib.js';

// Module scope: Fluid Compute reuses instances, so this survives across
// requests within an instance. Best-effort by design (see the spec).
const rateStore = new Map<string, number[]>();

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = process.env['FEEDBACK_GITHUB_TOKEN'];
  if (!token) {
    res.status(500).json({ error: 'relay not configured' });
    return;
  }
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
    req.socket.remoteAddress ??
    'unknown';
  const header = req.headers[CLIENT_HEADER_NAME];
  const result = await handleFeedback(
    {
      method: req.method ?? 'GET',
      clientHeader: typeof header === 'string' ? header : undefined,
      ip,
      body: req.body as unknown,
    },
    { fetchImpl: fetch, token, now: () => Date.now(), rateStore }
  );
  res.status(result.status).json(result.body);
}
