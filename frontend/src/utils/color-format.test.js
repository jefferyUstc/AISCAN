import { describe, it, expect } from "vitest";
import { rgbArrayToHex, cssColorToRgbArray } from "./color-format.js";

describe("rgbArrayToHex", () => {
  it("formats an rgb array as a hex string", () => {
    expect(rgbArrayToHex([59, 130, 246])).toBe("#3b82f6");
  });

  it("zero-pads single-digit channels", () => {
    expect(rgbArrayToHex([0, 5, 16])).toBe("#000510");
  });

  it("clamps out-of-range channels", () => {
    expect(rgbArrayToHex([300, -10, 255])).toBe("#ff00ff");
  });
});

describe("cssColorToRgbArray", () => {
  it("parses hex colors", () => {
    expect(cssColorToRgbArray("#3b82f6")).toEqual([59, 130, 246]);
  });

  it("parses named colors", () => {
    expect(cssColorToRgbArray("red")).toEqual([255, 0, 0]);
  });

  it("returns null for unparseable input", () => {
    expect(cssColorToRgbArray("not-a-color")).toBeNull();
  });

  it("round-trips with rgbArrayToHex", () => {
    expect(rgbArrayToHex(cssColorToRgbArray("#abcdef"))).toBe("#abcdef");
  });
});
