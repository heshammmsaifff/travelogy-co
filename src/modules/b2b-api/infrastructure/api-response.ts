import { NextResponse } from "next/server";
import type { AuthenticatedB2BContext } from "./api-auth.guard";

export type B2BApiMeta = {
  timestamp: string;
  requestId?: string;
  page?: number;
  pageSize?: number;
  total?: number;
};

export function createB2BHeaders(context?: AuthenticatedB2BContext): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
  };

  if (context) {
    headers["X-RateLimit-Limit"] = String(context.rateLimit);
    headers["X-RateLimit-Remaining"] = String(Math.max(0, context.remainingRequests));
    headers["X-RateLimit-Reset"] = String(context.resetSeconds);
  }

  return headers;
}

export function b2bSuccess<T>(
  data: T,
  options?: {
    status?: number;
    context?: AuthenticatedB2BContext;
    meta?: Record<string, unknown>;
  },
): NextResponse {
  const status = options?.status ?? 200;
  const headers = createB2BHeaders(options?.context);

  const payload = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...(options?.meta ?? {}),
    },
  };

  return NextResponse.json(payload, { status, headers });
}

export function b2bError(
  code: string,
  message: string,
  options?: {
    status?: number;
    context?: AuthenticatedB2BContext;
    details?: unknown;
  },
): NextResponse {
  const status = options?.status ?? 400;
  const headers = createB2BHeaders(options?.context);

  if (status === 429 && options?.context) {
    headers["Retry-After"] = String(options.context.resetSeconds);
  }

  const payload = {
    success: false,
    error: {
      code,
      message,
      ...(options?.details ? { details: options.details } : {}),
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json(payload, { status, headers });
}
