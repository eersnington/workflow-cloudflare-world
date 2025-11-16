import { Buffer } from 'node:buffer';
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'node:http';

export async function createRequestFromNode(
  req: IncomingMessage
): Promise<Request> {
  const method = (req.method ?? 'GET').toUpperCase();
  const headers = normalizeHeaders(req.headers);
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
  };

  if (
    method !== 'GET' &&
    method !== 'HEAD' &&
    method !== 'OPTIONS' &&
    method !== 'TRACE'
  ) {
    const bodyBuffer = await readBody(req);
    if (bodyBuffer) {
      init.body = bodyBuffer;
      init.duplex = 'half';
    }
  }

  return new Request(deriveRequestUrl(req), init);
}

export async function sendNodeResponse(
  res: ServerResponse,
  response: Response
): Promise<void> {
  res.statusCode = response.status;
  res.statusMessage = response.statusText || res.statusMessage;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const arrayBuffer = await response.arrayBuffer();
  res.end(Buffer.from(arrayBuffer));
}

function deriveRequestUrl(req: IncomingMessage): string {
  const originalUrl = req.url ?? '/';

  try {
    // Already an absolute URL
    return new URL(originalUrl).toString();
  } catch {
    const protocolHeader = req.headers['x-forwarded-proto'];
    const protocol = Array.isArray(protocolHeader)
      ? protocolHeader[0]
      : protocolHeader;
    const scheme = protocol?.split(',')[0]?.trim() || 'http';
    const host = req.headers.host || 'localhost';
    const pathname = originalUrl.startsWith('/')
      ? originalUrl
      : `/${originalUrl}`;
    return `${scheme}://${host}${pathname}`;
  }
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (!req.readable) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    if (chunk === null) {
      continue;
    }
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return Buffer.concat(chunks);
}

function normalizeHeaders(headers: IncomingHttpHeaders): Headers {
  const normalized = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        normalized.append(key, item);
      }
      continue;
    }
    normalized.append(key, value);
  }
  return normalized;
}
