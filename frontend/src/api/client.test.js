import { describe, it, expect, vi, afterEach } from "vitest";
import { apiGet, apiPost } from "./client.js";

function mockFetchOnce({ ok = true, status = 200, json } = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(json),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiGet", () => {
  it("builds a query string and drops null/empty params", async () => {
    const fetchMock = mockFetchOnce({ json: { ok: 1 } });
    const result = await apiGet("/api/x", { a: 1, b: "two", skip: null, empty: "" });
    expect(result).toEqual({ ok: 1 });
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("/api/x?");
    expect(url).toContain("a=1");
    expect(url).toContain("b=two");
    expect(url).not.toContain("skip");
    expect(url).not.toContain("empty");
  });

  it("omits the query string when no params are given", async () => {
    const fetchMock = mockFetchOnce({ json: {} });
    await apiGet("/api/x");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/x");
  });

  it("throws an ApiError carrying the backend detail on failure", async () => {
    mockFetchOnce({ ok: false, status: 422, json: { detail: "bad thing" } });
    await expect(apiGet("/api/x")).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      message: "bad thing",
    });
  });
});

describe("apiPost", () => {
  it("sends a JSON body with method and content-type", async () => {
    const fetchMock = mockFetchOnce({ json: { done: true } });
    const result = await apiPost("/api/y", { body: { hello: "world" } });
    expect(result).toEqual({ done: true });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({ hello: "world" });
  });

  it("sends no body/header when only params are provided", async () => {
    const fetchMock = mockFetchOnce({ json: {} });
    await apiPost("/api/y", { params: { use_raw: true } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("use_raw=true");
    expect(options.body).toBeUndefined();
    expect(options.headers).toBeUndefined();
  });
});
