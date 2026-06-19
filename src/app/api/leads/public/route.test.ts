/**
 * Route-handler tests for `POST /api/leads/public` (CRM lead intake).
 *
 * Test IDs: C03 (shared-secret verification timing-safe), C04 (de-dup on
 * email / phone + notes merge) in `rainey-stack/TESTS.md`.
 *
 * Catalog note: the entry labels this "HMAC + dedup"; the shipped
 * implementation is a shared-secret header compared in constant time
 * via `crypto.timingSafeEqual`. That is functionally equivalent against
 * timing-analysis attackers and is what these tests pin.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "intake-shared-secret-long-enough-for-prod";

type QueryMock = ReturnType<typeof vi.fn>;
const queryMock: QueryMock = vi.fn();

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost/api/leads/public", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Lead-Intake-Secret": SECRET,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/leads/public", () => {
  const originalSecret = process.env.CRM_LEAD_INTAKE_SECRET;

  beforeEach(() => {
    process.env.CRM_LEAD_INTAKE_SECRET = SECRET;
    queryMock.mockReset();
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      default: { query: queryMock },
    }));
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRM_LEAD_INTAKE_SECRET;
    else process.env.CRM_LEAD_INTAKE_SECRET = originalSecret;
    vi.resetModules();
    vi.doUnmock("@/lib/db");
  });

  describe("C03 - shared-secret verification", () => {
    it("returns 500 when CRM_LEAD_INTAKE_SECRET is unset on the server", async () => {
      delete process.env.CRM_LEAD_INTAKE_SECRET;
      const { POST } = await import("./route");
      const res = await POST(makeRequest({ name: "Ada", email: "a@b.test" }));
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/CRM_LEAD_INTAKE_SECRET not configured/);
    });

    it("returns 500 when the secret is still the placeholder", async () => {
      process.env.CRM_LEAD_INTAKE_SECRET = "change_me_to_a_long_random_string";
      const { POST } = await import("./route");
      const res = await POST(makeRequest({ name: "Ada", email: "a@b.test" }));
      expect(res.status).toBe(500);
    });

    it("returns 401 when X-Lead-Intake-Secret is missing", async () => {
      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost/api/leads/public", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Ada", email: "a@b.test" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("returns 401 when the secret is wrong", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ name: "Ada", email: "a@b.test" }, { "X-Lead-Intake-Secret": "wrong" }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 when the provided secret differs in length (no timingSafeEqual throw)", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest(
          { name: "Ada", email: "a@b.test" },
          { "X-Lead-Intake-Secret": SECRET + "extra-chars" },
        ),
      );
      expect(res.status).toBe(401);
    });

    it("accepts the correct secret and proceeds to DB call", async () => {
      queryMock
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // dedup lookup
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "lead-1" }] }); // insert
      const { POST } = await import("./route");
      const res = await POST(makeRequest({ name: "Ada", email: "a@b.test" }));
      expect(res.status).toBe(201);
    });
  });

  describe("input validation", () => {
    it("returns 400 on invalid JSON body", async () => {
      const { POST } = await import("./route");
      const res = await POST(makeRequest("not-json-at-all"));
      expect(res.status).toBe(400);
    });

    it("returns 400 when name is missing", async () => {
      const { POST } = await import("./route");
      const res = await POST(makeRequest({ email: "a@b.test" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when both email and phone are missing", async () => {
      const { POST } = await import("./route");
      const res = await POST(makeRequest({ name: "Ada" }));
      expect(res.status).toBe(400);
    });
  });

  describe("C04 - de-dup on email / phone + notes merge", () => {
    it("inserts a new lead when no match exists, returns 201 deduped:false", async () => {
      queryMock
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "lead-new" }] });
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({
          name: "Ada Lovelace",
          email: "ADA@Example.Test", // lowercased before lookup
          phone: "+51 (999) 888-777",
          district: "Barranco",
          niche: "café",
          notes: "Vía /contacto",
          source: "/contacto",
        }),
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { ok: boolean; id: string; deduped: boolean };
      expect(body).toMatchObject({ ok: true, id: "lead-new", deduped: false });

      // Verify the dedup SELECT was passed lowercased email + digits-only phone.
      const selectArgs = queryMock.mock.calls[0][1] as unknown[];
      expect(selectArgs[0]).toBe("ada@example.test");
      expect(selectArgs[1]).toBe("51999888777");

      // Verify the INSERT payload.
      const insertArgs = queryMock.mock.calls[1][1] as unknown[];
      expect(insertArgs[0]).toBe("Ada Lovelace");
      expect(insertArgs[3]).toBe("Barranco"); // district
      expect(insertArgs[4]).toBe("café"); // niche
      expect(insertArgs[6]).toBe("/contacto"); // source
    });

    it("appends notes to an existing lead when email matches", async () => {
      const existing = {
        id: "lead-existing",
        notes: "Previous note from last week",
      };
      queryMock
        .mockResolvedValueOnce({ rowCount: 1, rows: [existing] }) // dedup hit
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({
          name: "Ada",
          email: "ada@example.test",
          notes: "Wants a quote today",
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; id: string; deduped: boolean };
      expect(body).toMatchObject({ ok: true, id: "lead-existing", deduped: true });

      // Verify the UPDATE preserved old notes and appended the new dated note.
      const updateArgs = queryMock.mock.calls[1][1] as unknown[];
      expect(updateArgs[1]).toBe("lead-existing");
      expect(updateArgs[0] as string).toContain("Previous note from last week");
      expect(updateArgs[0] as string).toMatch(/\[\d{4}-\d{2}-\d{2}\] Wants a quote today/);
    });

    it("defaults district and niche to 'Otro' when unspecified", async () => {
      queryMock
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "lead-x" }] });
      const { POST } = await import("./route");
      await POST(makeRequest({ name: "Ada", email: "a@b.test" }));
      const insertArgs = queryMock.mock.calls[1][1] as unknown[];
      expect(insertArgs[3]).toBe("Otro"); // district
      expect(insertArgs[4]).toBe("Otro"); // niche
    });

    it("normalises phone to digits only for de-dup lookup", async () => {
      queryMock
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "lead-y" }] });
      const { POST } = await import("./route");
      await POST(makeRequest({ name: "Ada", phone: "+51 (999) 111-222" }));
      const selectArgs = queryMock.mock.calls[0][1] as unknown[];
      expect(selectArgs[1]).toBe("51999111222");
    });
  });

  describe("structured audit intake (#2)", () => {
    it("persists website_url, rounded score, and mapped audit_findings on insert", async () => {
      queryMock
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "lead-audit" }] });
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({
          name: "Ada",
          email: "a@b.test",
          source: "audit-tool",
          audit: {
            url: "https://prospect.test",
            score: 42.6,
            findings: [
              { severity: "high", title: "No HTTPS", detail: "Served over http" },
              { severity: "low", title: "Missing OG image" },
            ],
            runId: "abc123def456ghij",
            reportUrl: "https://raineylaguna.com/auditoria/r/abc123def456ghij",
          },
        }),
      );
      expect(res.status).toBe(201);

      const insertArgs = queryMock.mock.calls[1][1] as unknown[];
      expect(insertArgs[6]).toBe("audit-tool"); // source (structured, #1)
      expect(insertArgs[7]).toBe("https://prospect.test"); // website_url
      expect(insertArgs[8]).toBe(43); // digital_health_score (rounded)

      const findings = JSON.parse(insertArgs[9] as string);
      expect(findings.score).toBe(43);
      expect(findings.source).toBe("website-audit-tool");
      expect(findings.reportUrl).toContain("/auditoria/r/abc123def456ghij");
      expect(findings.flags).toHaveLength(2);
      expect(findings.flags[0]).toMatchObject({ severity: "high" });
      expect(findings.flags[0].label).toContain("No HTTPS");
    });

    it("leaves audit columns null when no audit is supplied", async () => {
      queryMock
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "lead-noaudit" }] });
      const { POST } = await import("./route");
      await POST(makeRequest({ name: "Ada", email: "a@b.test" }));
      const insertArgs = queryMock.mock.calls[1][1] as unknown[];
      expect(insertArgs[7]).toBeNull(); // website_url
      expect(insertArgs[8]).toBeNull(); // digital_health_score
      expect(insertArgs[9]).toBeNull(); // audit_findings
    });

    it("forwards audit values on dedupe for the guarded UPDATE", async () => {
      queryMock
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "lead-existing", notes: null }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] });
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({
          name: "Ada",
          email: "ada@example.test",
          audit: { url: "https://prospect.test", score: 80, runId: "r1" },
        }),
      );
      expect(res.status).toBe(200);
      const updateArgs = queryMock.mock.calls[1][1] as unknown[];
      expect(updateArgs[3]).toBe("https://prospect.test"); // website_url
      expect(updateArgs[4]).toBe(80); // digital_health_score
      expect(JSON.parse(updateArgs[5] as string).reportUrl).toBeNull();
    });
  });
});
