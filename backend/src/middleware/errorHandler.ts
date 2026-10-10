// Central error handling. Route handlers throw ApiError for anything the
// client should see a clean message for; everything else is logged and
// hidden behind a generic 500 so internals never leak to the frontend.

import type { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }

  // express-oauth2-jwt-bearer throws its own error (missing/expired/invalid
  // token) — not an ApiError, but it carries the same status/code shape.
  // Handle it the same way instead of letting it fall through to a 500.
  if (typeof err === "object" && err !== null && "status" in err && typeof (err as { status: unknown }).status === "number") {
    const e = err as { status: number; code?: string; message?: string };
    return res.status(e.status).json({
      error: { code: e.code ?? "unauthorized", message: e.message ?? "Unauthorized" },
    });
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({
    error: { code: "internal_error", message: "Something went wrong on our end." },
  });
}