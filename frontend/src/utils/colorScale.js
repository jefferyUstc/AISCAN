import { scaleSequential } from "d3-scale";
import { rgb as d3Rgb } from "d3-color";
import { PALETTE, COLOR_SCALES } from "./colors";
import { getPointCategoryLabel } from "./points.js";
import { cssColorToRgbArray } from "./color-format.js";

const FALLBACK_RGBA = [148, 163, 184, 220];
const CONTINUOUS_FALLBACK = [236, 72, 153, 220];

// Single source of truth for a category's base [r, g, b], honoring the
// precedence custom > backend-provided > palette. Shared by the ControlPanel
// swatches and the rendered scatter points so the two never drift.
export function resolveCategoryColor(label, index, customColors = {}, backendColors = {}) {
  const custom = customColors[label] ? cssColorToRgbArray(customColors[label]) : null;
  if (custom) return custom;
  const backend = backendColors[label] ? cssColorToRgbArray(backendColors[label]) : null;
  if (backend) return backend;
  return PALETTE[index % PALETTE.length] ?? [148, 163, 184];
}

export function buildColorScale(
  points,
  colorMode,
  customColorRange = null,
  selectedColorScale = "turbo",
  customCategoryColors = {},
  defaultCategoryColors = {}
) {
  if (colorMode === "continuous") {
    const values = points
      .map((point) => (typeof point.value === "number" ? point.value : null))
      .filter((value) => value !== null && Number.isFinite(value));
    if (!values.length) {
      return { accessor: () => CONTINUOUS_FALLBACK, legend: null };
    }

    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const min =
      customColorRange && typeof customColorRange.min === "number" ? customColorRange.min : dataMin;
    const max =
      customColorRange && typeof customColorRange.max === "number" ? customColorRange.max : dataMax;
    const colorScale = COLOR_SCALES[selectedColorScale] || COLOR_SCALES.turbo;

    if (max - min < 1e-5) {
      return {
        accessor: () => CONTINUOUS_FALLBACK,
        legend: { type: "continuous", min, max, interpolator: colorScale.interpolator },
      };
    }

    const scale = scaleSequential(colorScale.interpolator).domain([min, max]);
    return {
      accessor: (point) => {
        const value = typeof point.value === "number" ? point.value : min;
        const { r, g, b } = d3Rgb(scale(value));
        return [r, g, b, 220];
      },
      legend: { type: "continuous", min, max, interpolator: colorScale.interpolator },
    };
  }

  const labels = Array.from(new Set(points.map((point) => getPointCategoryLabel(point)))).sort();
  const assignments = new Map();
  labels.forEach((label, index) => {
    const [r, g, b] = resolveCategoryColor(label, index, customCategoryColors, defaultCategoryColors);
    assignments.set(label, [r, g, b, 220]);
  });

  return {
    accessor: (point) => assignments.get(getPointCategoryLabel(point)) ?? FALLBACK_RGBA,
    legend: {
      type: "categorical",
      entries: labels.map((label) => ({ label, color: assignments.get(label) ?? FALLBACK_RGBA })),
    },
  };
}
