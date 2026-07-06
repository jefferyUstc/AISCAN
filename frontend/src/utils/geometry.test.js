import { describe, it, expect } from "vitest";
import { pointInPolygon, computeBounds } from "./geometry.js";

const square = {
  geometry: {
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  },
};

describe("pointInPolygon", () => {
  it("detects a point inside the polygon", () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
  });

  it("detects a point outside the polygon", () => {
    expect(pointInPolygon([15, 5], square)).toBe(false);
    expect(pointInPolygon([-1, -1], square)).toBe(false);
  });
});

describe("computeBounds", () => {
  it("returns a unit box for empty input", () => {
    expect(computeBounds([])).toEqual({ center: [0, 0, 0], extent: 1 });
  });

  it("computes center and extent from points", () => {
    const bounds = computeBounds([
      { x: 0, y: 0 },
      { x: 10, y: 4 },
    ]);
    expect(bounds.center).toEqual([5, 2, 0]);
    expect(bounds.extent).toBe(10);
    expect(bounds.min).toEqual([0, 0, 0]);
    expect(bounds.max).toEqual([10, 4, 0]);
  });

  it("respects the z axis when present", () => {
    const bounds = computeBounds([
      { x: 0, y: 0, z: -2 },
      { x: 2, y: 2, z: 8 },
    ]);
    expect(bounds.center).toEqual([1, 1, 3]);
    expect(bounds.extent).toBe(10);
  });
});
