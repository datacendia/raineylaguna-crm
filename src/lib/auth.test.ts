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

  it("verifySession returns null when lastSeenAt is older than idle window (7d)", async () => {
    const { signSession, verifySession, IDLE_LIFETIME_MS } = await import("./auth");
    const eightDaysAgo = Date.now() - (IDLE_LIFETIME_MS + 60_000);
    const token = await signSession({
      uid: "u1",
      email: "op@test",
      role: "admin",
      lastSeenAt: eightDaysAgo,
    });
    expect(await verifySession(token)).toBeNull();
  });

  it("verifySession accepts a recently-touched session within idle window", async () => {
    const { signSession, verifySession } = await import("./auth");
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const token = await signSession({
      uid: "u1",
      email: "op@test",
      role: "admin",
      lastSeenAt: oneDayAgo,
    });
    const payload = await verifySession(token);
    expect(payload).toMatchObject({ uid: "u1" });
  });

  it("touchSession only refreshes the cookie after TOUCH_INTERVAL_MS", async () => {
    const { touchSession, TOUCH_INTERVAL_MS } = await import("./auth");
    const fresh = { uid: "u1", email: "op@test", role: "admin", lastSeenAt: Date.now() };
    expect(await touchSession(fresh)).toBeNull();

    const stale = { ...fresh, lastSeenAt: Date.now() - (TOUCH_INTERVAL_MS + 1000) };
    expect(await touchSession(stale)).not.toBeNull();
  });
});
