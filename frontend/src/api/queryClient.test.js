import { describe, it, expect } from "vitest";
import { retry } from "./queryClient.js";
import { ApiError } from "./client.js";

describe("query retry policy", () => {
  it("does not retry deterministic 4xx errors", () => {
    expect(retry(0, new ApiError("not found", 404))).toBe(false);
    expect(retry(0, new ApiError("bad request", 400))).toBe(false);
    expect(retry(0, new ApiError("gone", 410))).toBe(false);
  });

  it("retries 5xx once", () => {
    const err = new ApiError("server error", 500);
    expect(retry(0, err)).toBe(true);
    expect(retry(1, err)).toBe(false);
  });

  it("retries network errors (no status) once", () => {
    const err = new TypeError("Failed to fetch");
    expect(retry(0, err)).toBe(true);
    expect(retry(1, err)).toBe(false);
  });
});
