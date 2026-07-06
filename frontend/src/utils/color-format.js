import { rgb as d3Rgb } from "d3-color";

const toHexByte = (value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");

// [r, g, b] (0-255) -> "#rrggbb"
export function rgbArrayToHex([r, g, b]) {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

// Any CSS color string -> [r, g, b], or null if unparseable.
export function cssColorToRgbArray(color) {
  const parsed = d3Rgb(color);
  if (!parsed || Number.isNaN(parsed.r)) return null;
  return [parsed.r, parsed.g, parsed.b];
}
