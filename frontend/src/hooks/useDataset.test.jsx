import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDataset } from "./useDataset.js";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useDataset", () => {
  it("surfaces an error and fabricates nothing when the backend is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const { result } = renderHook(() => useDataset(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.dataset).toBeNull();
    expect(result.current.hasBackendDataset).toBe(false);
    expect(result.current.embeddings).toEqual([]);
    expect(result.current.selectedEmbedding).toBeNull();
  });

  it("exposes the real dataset and derived selections on success", async () => {
    const overview = { dataset: { id: "d1", name: "D1", activeEmbedding: "umap" } };
    const options = {
      obsAttributes: [{ name: "leiden", kind: "categorical" }],
      geneOptions: [],
      embeddings: [{ name: "umap", dimensions: 2 }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((url) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(url.includes("options") ? options : overview),
        })
      )
    );

    const { result } = renderHook(() => useDataset(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.hasBackendDataset).toBe(true));
    expect(result.current.dataset?.name).toBe("D1");
    await waitFor(() => expect(result.current.selectedEmbedding).toBe("umap"));
    await waitFor(() => expect(result.current.selectedObs).toBe("leiden"));
  });

  it("surfaces an options-endpoint failure instead of degrading silently", async () => {
    const overview = { dataset: { id: "d1", name: "D1", activeEmbedding: "umap" } };
    vi.stubGlobal(
      "fetch",
      vi.fn((url) =>
        url.includes("options")
          ? Promise.resolve({
              ok: false,
              status: 500,
              json: () => Promise.resolve({ detail: "options boom" }),
            })
          : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(overview) })
      )
    );

    const { result } = renderHook(() => useDataset(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.hasBackendDataset).toBe(true));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("options boom");
  });
});
