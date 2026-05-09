/**
 * Route-handler tests for `PATCH /api/leads/bulk`.
 *
 * Pins the server-side column whitelist (`pipeline_stage`, `snoozed_until`)
 * and the two non-obvious SQL-shape contracts that keep bulk updates safe:
 *
 *   1. Unknown keys in `updates` are dropped before any SQL is built, so a
 *      buggy or malicious client cannot clobber `email`, `created_at`, etc.
 *   2. An empty string or `undefined` value for `snoozed_until` is compiled
 *      to a literal `SET snoozed_until = NULL` (not a parameterized NULL),
 *      which mirrors the "un-snooze" path invoked by the UI.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type QueryMock = ReturnType<typeof vi.fn>;
const queryMock: QueryMock = vi.fn();

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/leads/bulk", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/leads/bulk", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rowCount: 2, rows: [] });
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ default: { query: queryMock } }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/db");
  });

  it("400s when ids are missing or empty", async () => {
    const { PATCH } = await import("./route");
    const a = await PATCH(makeRequest({ ids: [], updates: { pipeline_stage: "Contacted" } }));
    expect(a.status).toBe(400);
    const b = await PATCH(makeRequest({ updates: { pipeline_stage: "Contacted" } }));
    expect(b.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("400s when no whitelisted columns are included in updates", async () => {
    const { PATCH } = await import("./route");
    // `email` is not in the ALLOWED list and MUST be silently dropped, leaving
    // no columns to update -> 400.
    const res = await PATCH(makeRequest({ ids: ["u1", "u2"], updates: { email: "x@y.test" } }));
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("updates pipeline_stage across selected ids with a parameterized query", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({ ids: ["u1", "u2"], updates: { pipeline_stage: "Contacted" } }),
    );
    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, values] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("UPDATE crm_leads SET pipeline_stage = $1");
    expect(sql).toContain("WHERE id = ANY($2::uuid[])");
    expect(values).toEqual(["Contacted", ["u1", "u2"]]);
  });

  it("updates snoozed_until with an ISO date", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({ ids: ["u1"], updates: { snoozed_until: "2026-05-20" } }),
    );
    expect(res.status).toBe(200);
    const [sql, values] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("snoozed_until = $1");
    expect(values).toEqual(["2026-05-20", ["u1"]]);
  });

  it("compiles empty-string snoozed_until to literal NULL (un-snooze path)", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({ ids: ["u1", "u2"], updates: { snoozed_until: "" } }),
    );
    expect(res.status).toBe(200);
    const [sql, values] = queryMock.mock.calls[0] as [string, unknown[]];
    // Literal NULL, not a $N placeholder, and only the ids array bound.
    expect(sql).toContain("snoozed_until = NULL");
    expect(sql).not.toContain("snoozed_until = $");
    expect(values).toEqual([["u1", "u2"]]);
  });

  it("passes explicit null snoozed_until as a parameter (un-snooze via JSON null)", async () => {
    // The UI sends `null` from the Unsnooze button; the server binds it as a
    // parameter so the pg driver converts it to SQL NULL.
    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({ ids: ["u1"], updates: { snoozed_until: null } }),
    );
    expect(res.status).toBe(200);
    const [sql, values] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("snoozed_until = $1");
    expect(values).toEqual([null, ["u1"]]);
  });

  it("drops unknown columns alongside allowed ones", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({
        ids: ["u1"],
        updates: { pipeline_stage: "Contacted", email: "x@y.test", created_at: "2020-01-01" },
      }),
    );
    expect(res.status).toBe(200);
    const [sql, values] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("pipeline_stage = $1");
    expect(sql).not.toMatch(/email\s*=/i);
    expect(sql).not.toMatch(/created_at\s*=/i);
    expect(values).toEqual(["Contacted", ["u1"]]);
  });
});
