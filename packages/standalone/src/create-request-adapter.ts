import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';
import { ensureFetchSupport } from './fetch-support.js';

type HeaderRecord = Record<string, string | string[] | undefined>;

export type AdaptableRequest =
  | Request
  | {
      method?: string;
      url: string;
      headers?: HeadersInit | IncomingHttpHeaders | HeaderRecord;
      body?: Readable | Uint8Array | ArrayBuffer | string | null;
    };

export interface RequestAdapterOptions {
  baseUrl?: string;
  ensureFetch?: boolean;
}

export function createRequestAdapter(options: RequestAdapterOptions = {}) {
  return async (input: AdaptableRequest): Promise<Request> => {
    if (input instanceof Request) {
      return input;
    }

    if (options.ensureFetch !== false) {
      await ensureFetchSupport();
    }

    const method = (input.method ?? 'GET').toUpperCase();
    const rawUrl = input.url;

    const resolvedUrl = resolveUrl(rawUrl, options.baseUrl);
    const headers = normalizeHeaders(input.headers);

    const init: RequestInit = {
      method,
      headers,
    };

    if (
      input.body !== undefined &&
      input.body !== null &&
      method !== 'GET' &&
      method !== 'HEAD'
    ) {
      init.body = input.body as BodyInit;
      (init as Record<string, unknown>).duplex = 'half';
    }

    return new Request(resolvedUrl, init);
  };
}

function resolveUrl(url: string, baseUrl?: string): string {
  try {
    return new URL(url).toString();
  } catch {
    const base = baseUrl ?? 'http://localhost';
    return new URL(url, base).toString();
  }
}

function normalizeHeaders(
  headers?: HeadersInit | IncomingHttpHeaders | HeaderRecord
): Headers {
  const result = new Headers();

  if (!headers) {
    return result;
  }

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result.append(key, value);
    });
    return result;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      result.append(key, value);
    }
    return result;
  }

  const record = headers as HeaderRecord;

  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }
      continue;
    }
    result.append(key, value as string);
  }

  return result;
}
