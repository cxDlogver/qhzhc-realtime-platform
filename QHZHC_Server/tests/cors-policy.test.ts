import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCorsMiddleware, resolveCorsPolicy } from "../src/server/cors.js";

interface FakeResponse {
  headers: Record<string, string>;
  statusCode: number | null;
  ended: boolean;
}

function fakeResponse(): FakeResponse & Response {
  const headers: Record<string, string> = {};
  const fake = {
    headers,
    statusCode: null,
    ended: false,
    setHeader(key: string, value: string) {
      headers[key] = String(value);
    },
    getHeader(key: string) {
      return headers[key];
    },
    status(code: number) {
      fake.statusCode = code;
      return fake;
    },
    end() {
      fake.ended = true;
    },
  };
  return fake as unknown as FakeResponse & Response;
}

function dispatch(origin: string | undefined, method = "GET") {
  const response = fakeResponse();
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };
  const request = {
    headers: origin === undefined ? {} : { origin },
    method,
  } as Request;

  createCorsMiddleware()(request, response, next);
  return { response, nextCalled };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = "development";
  delete process.env.CORS_ALLOWED_ORIGINS;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("CORS middleware", () => {
  it("allows loopback debugging origins in development with credentials", () => {
    for (const origin of [
      "http://127.0.0.1:9527",
      "http://localhost:9527",
      "http://127.0.0.1:5173",
      "https://localhost:8080",
    ]) {
      const { response, nextCalled } = dispatch(origin);
      expect(response.headers["Access-Control-Allow-Origin"]).toBe(origin);
      expect(response.headers["Access-Control-Allow-Credentials"]).toBe("true");
      expect(response.headers["Vary"]).toBe("Origin");
      expect(nextCalled).toBe(true);
    }
  });

  it("answers preflight requests with 204 and stops the middleware chain", () => {
    const { response, nextCalled } = dispatch("http://127.0.0.1:9527", "OPTIONS");
    expect(response.statusCode).toBe(204);
    expect(response.ended).toBe(true);
    expect(nextCalled).toBe(false);
    expect(response.headers["Access-Control-Allow-Methods"]).toContain("PATCH");
    expect(response.headers["Access-Control-Max-Age"]).toBeTruthy();
  });

  it("emits no CORS headers for origins outside the policy", () => {
    const { response } = dispatch("http://evil.test:9527");
    expect(response.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(response.headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("honours an explicit comma separated allow list", () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://qhzhc.test, http://192.168.1.10:9527/";
    expect(resolveCorsPolicy().origins).toEqual(
      new Set(["https://qhzhc.test", "http://192.168.1.10:9527"]),
    );
    const allowed = dispatch("http://192.168.1.10:9527");
    expect(allowed.response.headers["Access-Control-Allow-Origin"]).toBe(
      "http://192.168.1.10:9527",
    );
    expect(dispatch("http://127.0.0.1:9527").response.headers).not.toHaveProperty(
      "Access-Control-Allow-Origin",
    );
  });

  it("drops credentials when every origin is allowed", () => {
    process.env.CORS_ALLOWED_ORIGINS = "*";
    const { response } = dispatch("https://anything.test");
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(response.headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("stays same-origin only in production without configuration", () => {
    process.env.NODE_ENV = "production";
    const policy = resolveCorsPolicy();
    expect(policy.allowDevLoopback).toBe(false);
    expect(dispatch("http://127.0.0.1:9527").response.headers).not.toHaveProperty(
      "Access-Control-Allow-Origin",
    );
  });

  it("keeps Vary values added by other middleware", () => {
    const response = fakeResponse();
    response.setHeader("Vary", "Accept-Encoding");
    createCorsMiddleware()(
      { headers: { origin: "http://127.0.0.1:9527" }, method: "GET" } as Request,
      response,
      () => undefined,
    );
    expect(response.headers.Vary).toBe("Accept-Encoding, Origin");
  });
});
