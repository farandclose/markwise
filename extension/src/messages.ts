// The webview <-> host message contract, validated at the bridge (KTD6, R7). The server's
// loopback/host and custom-header CSRF gates are meaningless over postMessage and are dropped - but
// their job is not: every inbound message is validated here against a closed type set with typed
// fields before any value reaches the engine. The webview's transport shim (media/bridge.js) turns
// the previewer's `fetch('/api/...')` calls into `apiRequest` messages; the host replies with
// `apiResponse`. `refresh` is the only host->webview signal besides responses (U5).

/** A bridged previewer API call. Mirrors the request the localhost server used to receive over HTTP. */
export interface ApiRequestMessage {
  type: 'apiRequest';
  /** Correlates the response back to the awaiting fetch in the webview. */
  id: number;
  method: 'GET' | 'POST';
  /** An `/api/...` path. No scheme or host - the webview never names a remote origin. */
  url: string;
  /** The x-mw-version precondition the previewer echoes on every mutation (undefined on reads). */
  version?: string;
  /** Whether the x-mw-handoff header was present (the previewer's handoff doorbell). */
  handoff: boolean;
  /** The parsed JSON body, if any. Always a plain object once validated. */
  body?: Record<string, unknown>;
}

export type InboundMessage = ApiRequestMessage;

/** The host's reply to one `apiRequest`. Shaped so the shim can present it as a fetch Response. */
export interface ApiResponseMessage {
  type: 'apiResponse';
  id: number;
  ok: boolean;
  status: number;
  body: unknown;
}

/** Host -> webview: the file changed underneath the panel; re-pull and repaint (U5). */
export interface RefreshMessage {
  type: 'refresh';
}

export type OutboundMessage = ApiResponseMessage | RefreshMessage;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate a raw postMessage payload into an InboundMessage, or null if it is not one. The closed
 * type set is enforced here (only `apiRequest`), as are the field types and the `/api/` path shape;
 * anything malformed or unexpected is rejected before it reaches a mutate call (R7). Route-level
 * field validation (kind / type / start ...) happens in the request handler, mirroring the server.
 */
export function parseInboundMessage(raw: unknown): InboundMessage | null {
  if (!isObject(raw)) return null;
  if (raw.type !== 'apiRequest') return null;
  if (typeof raw.id !== 'number' || !Number.isFinite(raw.id)) return null;
  if (raw.method !== 'GET' && raw.method !== 'POST') return null;
  if (typeof raw.url !== 'string' || !raw.url.startsWith('/api/')) return null;
  if (raw.version !== undefined && typeof raw.version !== 'string') return null;
  let body: Record<string, unknown> | undefined;
  if (raw.body !== undefined) {
    if (!isObject(raw.body)) return null;
    body = raw.body;
  }
  return {
    type: 'apiRequest',
    id: raw.id,
    method: raw.method,
    url: raw.url,
    version: raw.version,
    handoff: raw.handoff === true,
    body,
  };
}
