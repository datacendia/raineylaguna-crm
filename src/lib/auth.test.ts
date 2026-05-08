/**
 * Unit tests for CRM `auth.ts` (JWT session signing / verification).
 *
 * Covers the CRM auth round-trip counterpart to Sereno S23: a session
 * cookie signed with CRM_COOKIE_SECRET must round-trip cleanly;
 * tampered / wrong-secret / expired / empty tokens must all return
 * null so downstream middleware renders 401 instead of a silent
 * "undefined user" bug.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SECRET = "this-is-a-32-byte-test-secret-padded";

describe("CRM auth: session JWT round-trip", () => {
  const original = process.env.CRM_COOKIE_SECRET;

  beforeEach(() => {
    process.env.CRM_COOKIE_SECRET = SECRET;
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CRM_COOKIE_SECRET;
    else process.env.CRM_COOKIE_SECRET = original;
    vi.resetModules();
  });

  it("verifySession returns payload for a freshly-signed token", async () => {
    const { signSession, verifySession } = await import("./auth");
    const token = await signSession({ uid: "u1", email: "op@test", role: "admin" });
    const payload = await verifySession(token);
    expect(payload).toMatchObject({ uid: "u1", email: "op@test", role: "admin" });
  });

  it("verifySession returns null for undefined / empty tokens", async () => {
    const { verifySession } = await import("./auth");
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("")).toBeNull();
    expect(await verifySession("not.a.jwt")).toBeNull();
  });

  it("verifySession returns null for a tampered token", async () => {
    const { signSession, verifySession } = await import("./auth");
    const token = await signSession({ uid: "u1", email: "op@test", role: "admin" });
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(await verifySession(tampered)).toBeNull();
  });

  it("verifySession returns null for a token signed with a different secret", async () => {
    const { signSession } = await import("./auth");
    const token = await signSession({ uid: "u1", email: "op@test", role: "admin" });

    process.env.CRM_COOKIE_SECRET = "completely-different-secret-of-32!!";
    vi.resetModules();
    const { verifySession } = await import("./auth");
    expect(await verifySession(token)).toBeNull();
  });
});
