import { describe, it, expect } from "vitest";
import { vizReducer, initialVizState } from "./vizReducer.js";

describe("vizReducer clamping", () => {
  it("clamps and rounds the sample fraction", () => {
    expect(vizReducer(initialVizState, { type: "SET_SAMPLE_FRACTION", value: 5 }).sampleFraction).toBe(1);
    expect(vizReducer(initialVizState, { type: "SET_SAMPLE_FRACTION", value: 0 }).sampleFraction).toBe(0.05);
    expect(vizReducer(initialVizState, { type: "SET_SAMPLE_FRACTION", value: 0.333 }).sampleFraction).toBe(0.33);
  });

  it("clamps point size to [1, 10]", () => {
    expect(vizReducer(initialVizState, { type: "SET_POINT_SIZE", value: 99 }).pointSize).toBe(10);
    expect(vizReducer(initialVizState, { type: "SET_POINT_SIZE", value: -3 }).pointSize).toBe(1);
  });

  it("clamps and rounds opacity and edge width", () => {
    expect(vizReducer(initialVizState, { type: "SET_POINT_OPACITY", value: 2 }).pointOpacity).toBe(1);
    expect(vizReducer(initialVizState, { type: "SET_POINT_EDGE_WIDTH", value: 9 }).pointEdgeWidth).toBe(2);
  });
});

describe("vizReducer gene actions", () => {
  it("APPLY_GENE trims, sets gene, and switches to gene mode", () => {
    const next = vizReducer(initialVizState, { type: "APPLY_GENE", value: "  CD8A  " });
    expect(next.activeGene).toBe("CD8A");
    expect(next.geneInput).toBe("CD8A");
    expect(next.colorMode).toBe("gene");
  });

  it("APPLY_GENE ignores empty input", () => {
    expect(vizReducer(initialVizState, { type: "APPLY_GENE", value: "   " })).toBe(initialVizState);
  });

  it("SET_ACTIVE_GENE sets the gene without forcing color mode", () => {
    const next = vizReducer(initialVizState, { type: "SET_ACTIVE_GENE", value: "GAPDH" });
    expect(next.activeGene).toBe("GAPDH");
    expect(next.colorMode).toBe("obs");
  });
});

describe("vizReducer selection + categories", () => {
  it("CLEAR_SELECTION returns the same reference when already empty", () => {
    expect(vizReducer(initialVizState, { type: "CLEAR_SELECTION" })).toBe(initialVizState);
  });

  it("CLEAR_SELECTION empties a non-empty selection", () => {
    const withSelection = { ...initialVizState, selectedIds: ["a", "b"] };
    expect(vizReducer(withSelection, { type: "CLEAR_SELECTION" }).selectedIds).toEqual([]);
  });

  it("SET_VISIBLE_CATEGORIES writes per-field and ignores a missing field", () => {
    const next = vizReducer(initialVizState, {
      type: "SET_VISIBLE_CATEGORIES",
      field: "leiden",
      value: ["1", "2"],
    });
    expect(next.visibleCategoriesByField.leiden).toEqual(["1", "2"]);
    expect(vizReducer(initialVizState, { type: "SET_VISIBLE_CATEGORIES", field: "" })).toBe(
      initialVizState
    );
  });

  it("MERGE_VISIBLE_CATEGORIES merges multiple fields", () => {
    const seeded = { ...initialVizState, visibleCategoriesByField: { a: ["1"] } };
    const next = vizReducer(seeded, {
      type: "MERGE_VISIBLE_CATEGORIES",
      value: { b: ["2"], c: ["3"] },
    });
    expect(next.visibleCategoriesByField).toEqual({ a: ["1"], b: ["2"], c: ["3"] });
  });

  it("SET_COLOR_RANGE and RESET_COLOR_RANGE update both bounds", () => {
    const set = vizReducer(initialVizState, { type: "SET_COLOR_RANGE", min: 1, max: 9 });
    expect([set.colorRangeMin, set.colorRangeMax]).toEqual([1, 9]);
    const reset = vizReducer(set, { type: "RESET_COLOR_RANGE" });
    expect([reset.colorRangeMin, reset.colorRangeMax]).toEqual([null, null]);
  });
});
