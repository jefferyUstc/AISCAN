import { describe, it, expect } from "vitest";
import { resolveCategoryColor, buildColorScale } from "./colorScale.js";
import { PALETTE } from "./colors.js";

describe("resolveCategoryColor", () => {
  it("prefers a custom color over everything", () => {
    expect(resolveCategoryColor("A", 0, { A: "#ff0000" }, { A: "#00ff00" })).toEqual([255, 0, 0]);
  });

  it("falls back to the backend color", () => {
    expect(resolveCategoryColor("A", 0, {}, { A: "#00ff00" })).toEqual([0, 255, 0]);
  });

  it("falls back to the palette by index", () => {
    expect(resolveCategoryColor("A", 1, {}, {})).toEqual(PALETTE[1]);
    // Index wraps around the palette length.
    expect(resolveCategoryColor("A", PALETTE.length, {}, {})).toEqual(PALETTE[0]);
  });
});

describe("buildColorScale categorical", () => {
  const points = [
    { id: "1", label: "b" },
    { id: "2", label: "a" },
    { id: "3", cluster: "a" },
  ];

  it("builds a sorted categorical legend", () => {
    const { legend } = buildColorScale(points, "categorical");
    expect(legend.type).toBe("categorical");
    expect(legend.entries.map((e) => e.label)).toEqual(["a", "b"]);
  });

  it("accessor returns an rgba tuple for a point", () => {
    const { accessor } = buildColorScale(points, "categorical");
    const color = accessor(points[0]);
    expect(color).toHaveLength(4);
    expect(color[3]).toBe(220);
  });
});

describe("buildColorScale continuous", () => {
  const points = [
    { id: "1", value: 0 },
    { id: "2", value: 10 },
  ];

  it("derives the legend range from the data", () => {
    const { legend } = buildColorScale(points, "continuous");
    expect(legend.type).toBe("continuous");
    expect(legend.min).toBe(0);
    expect(legend.max).toBe(10);
  });

  it("honors a custom color range", () => {
    const { legend } = buildColorScale(points, "continuous", { min: -5, max: 5 });
    expect(legend.min).toBe(-5);
    expect(legend.max).toBe(5);
  });

  it("returns no legend when there are no numeric values", () => {
    const { legend } = buildColorScale([{ id: "1" }], "continuous");
    expect(legend).toBeNull();
  });
});
