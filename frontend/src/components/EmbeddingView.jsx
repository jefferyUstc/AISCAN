import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer, TextLayer, GeoJsonLayer } from "@deck.gl/layers";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import { OrthographicView, OrbitView, OrbitController } from "@deck.gl/core";
import { SphereGeometry } from "@luma.gl/engine";
import { EditableGeoJsonLayer } from "@nebula.gl/layers";
import { DrawPolygonMode, DrawPolygonByDraggingMode } from "@nebula.gl/edit-modes";
import { scaleSequential } from "d3-scale";
import { rgb as d3Rgb } from "d3-color";
import {
  interpolateTurbo,
  interpolateViridis,
  interpolatePlasma,
  interpolateInferno,
  interpolateMagma,
  interpolateCividis,
  interpolateWarm,
  interpolateCool,
  interpolateRdYlBu,
  interpolateSpectral
} from "d3-scale-chromatic";
import { PALETTE, COLOR_SCALES, generateColorbarGradient } from "../utils/colors";



const toRgbObject = (color) => ({ r: color[0], g: color[1], b: color[2], a: color[3] ?? 255 });



// Generate CSS gradient for colorbar visualization
// function generateColorbarGradient ... (removed)

// Point-in-polygon test using ray casting algorithm
function pointInPolygon(point, polygon) {
  const [x, y] = point;
  const coords = polygon.geometry.coordinates[0]; // Get the outer ring
  let inside = false;

  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, yi] = coords[i];
    const [xj, yj] = coords[j];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

function computeBounds(points) {
  if (!points.length) {
    return {
      center: [0, 0, 0],
      extent: 1,
    };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  points.forEach((point) => {
    const { x, y, z = 0 } = point;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  });
  const center = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
  const extent = Math.max(maxX - minX, maxY - minY, Math.max(maxZ - minZ, 1e-3));
  return { center, extent, min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

function useInitialView(points, viewMode) {
  const { center, extent } = useMemo(() => computeBounds(points), [points]);
  return useMemo(() => {
    if (viewMode === "3d") {
      return {
        id: "orbit",
        target: center,
        rotationOrbit: 0,
        rotationX: 30,
        zoom: Math.log2(320 / extent),
      };
    }
    return {
      id: "ortho",
      target: [center[0], center[1], 0],
      zoom: Math.log2(500 / extent),
      minZoom: -5,
      maxZoom: 20,
    };
  }, [center, extent, viewMode]);
}

function buildColorScale(points, colorMode, customColorRange = null, selectedColorScale = "turbo", customCategoryColors = {}, defaultCategoryColors = {}) {
  if (colorMode === "continuous") {
    const values = points
      .map((point) => (typeof point.value === "number" ? point.value : null))
      .filter((value) => value !== null && Number.isFinite(value));
    if (!values.length) {
      return { accessor: () => [236, 72, 153, 220], legend: null };
    }

    // Calculate data range
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);

    // Use custom range if provided, otherwise use data range
    const min = (customColorRange && typeof customColorRange.min === 'number') ? customColorRange.min : dataMin;
    const max = (customColorRange && typeof customColorRange.max === 'number') ? customColorRange.max : dataMax;

    const colorScale = COLOR_SCALES[selectedColorScale] || COLOR_SCALES.turbo;

    if (max - min < 1e-5) {
      return {
        accessor: () => [236, 72, 153, 220],
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

  const labels = Array.from(new Set(points.map((point) => point.label || point.cluster || "other"))).sort();
  const assignments = new Map();
  labels.forEach((label, index) => {
    let color;
    if (customCategoryColors[label]) {
      const c = d3Rgb(customCategoryColors[label]);
      color = [c.r, c.g, c.b];
    } else if (defaultCategoryColors[label]) {
      const c = d3Rgb(defaultCategoryColors[label]);
      color = [c.r, c.g, c.b];
    } else {
      color = PALETTE[index % PALETTE.length] ?? [148, 163, 184];
    }
    assignments.set(label, [...color, 220]);
  });
  return {
    accessor: (point) => assignments.get(point.label || point.cluster || "other") ?? [148, 163, 184, 220],
    legend: {
      type: "categorical",
      entries: labels.map((label) => ({ label, color: assignments.get(label) ?? [148, 163, 184, 220] })),
    },
  };
}

function EmbeddingView({
  embeddingName,
  points,
  totalCells,
  colorMode,
  loading,
  dimensions,
  pointSize,
  pointOpacity,
  pointEdgeWidth,
  pointEdgeColor,
  customCategoryColors,
  defaultCategoryColors,
  selectedIds,
  selectedPointScale,
  unselectedPointScale,
  onSelectionChange,
  colorScaleName,
  colorRangeMin,
  colorRangeMax,
}) {
  const supports3D = dimensions >= 3;
  const [viewMode, setViewMode] = useState("2d");
  const initialView = useInitialView(points, viewMode === "3d" && supports3D ? "3d" : "2d");
  const [viewState, setViewState] = useState(initialView);
  const deckRef = useRef(null);
  const [activeLassoTool, setActiveLassoTool] = useState(null); // 'lasso1', 'lasso2', or null
  const lassoEnabled = activeLassoTool !== null;
  // const [lassoEnabled, setLassoEnabled] = useState(false); // Refactored to derived state
  const [lassoData, setLassoData] = useState({
    type: "FeatureCollection",
    features: []
  });

  // Derived color range from props
  const customColorRange = useMemo(() => {
    if (colorRangeMin !== null && colorRangeMax !== null) {
      return { min: colorRangeMin, max: colorRangeMax };
    }
    if (colorRangeMin !== null) {
      return { min: colorRangeMin, max: null };
    }
    if (colorRangeMax !== null) {
      return { min: null, max: colorRangeMax };
    }
    return null;
  }, [colorRangeMin, colorRangeMax]);

  // Use colorScaleName from props
  const selectedColorScale = colorScaleName || "turbo";

  // Background color states
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [canvasBgColor, setCanvasBgColor] = useState("rgba(15, 23, 42, 0.55)");
  const [customHexInput, setCustomHexInput] = useState("");

  // Preset background colors
  const PRESET_BG_COLORS = [
    { name: "Default Dark", value: "rgba(15, 23, 42, 0.55)", hex: "#0f172a" },
    { name: "Pure Black", value: "#000000", hex: "#000000" },
    { name: "Charcoal", value: "#1a1a2e", hex: "#1a1a2e" },
    { name: "Dark Slate", value: "#1e293b", hex: "#1e293b" },
    { name: "Midnight Blue", value: "#191970", hex: "#191970" },
    { name: "White", value: "#ffffff", hex: "#ffffff" },
    { name: "Light Gray", value: "#f1f5f9", hex: "#f1f5f9" },
    { name: "Warm White", value: "#faf5f0", hex: "#faf5f0" },
    { name: "Transparent", value: "transparent", hex: "transparent" },
  ];

  useEffect(() => {
    if (!supports3D && viewMode === "3d") {
      setViewMode("2d");
    }
  }, [supports3D, viewMode]);

  useEffect(() => {
    setViewState(initialView);
  }, [initialView, viewMode, embeddingName]);

  // Selection Mode State
  const [selectionMode, setSelectionMode] = useState("new"); // "new", "union", "subtract"

  // Label Overlay Logic
  const [showLabels, setShowLabels] = useState(false);
  const labelsData = useMemo(() => {
    if (!showLabels || !points.length) return [];

    // Group points by label
    const groups = {};
    points.forEach(p => {
      const label = p.label || p.cluster;
      if (!label) return;
      if (!groups[label]) groups[label] = { x: 0, y: 0, z: 0, count: 0 };
      groups[label].x += p.x;
      groups[label].y += p.y;
      groups[label].z += (p.z || 0);
      groups[label].count++;
    });

    return Object.entries(groups).map(([label, data]) => {
      // If we are in 2D view, we should flatten Z to 0 so labels render on plane
      const z = viewMode === "3d" && supports3D ? (data.z / data.count) : 0;
      return {
        text: label,
        position: [data.x / data.count, data.y / data.count, z],
      };
    });
  }, [points, showLabels, viewMode, supports3D]);

  // View Controls Logic
  const [autoRotate, setAutoRotate] = useState(false);

  useEffect(() => {
    let animationFrame;
    if (autoRotate && viewMode === "3d") {
      const animate = () => {
        setViewState(v => ({
          ...v,
          rotationOrbit: (v.rotationOrbit + 0.5) % 360,
        }));
        animationFrame = requestAnimationFrame(animate);
      };
      animate();
    }
    return () => cancelAnimationFrame(animationFrame);
  }, [autoRotate, viewMode]);

  const performPolygonSelection = (polygon) => {
    const pointsInPolygon = [];
    points.forEach(point => {
      if (pointInPolygon([point.x, point.y], polygon)) {
        pointsInPolygon.push(point.id);
      }
    });

    if (pointsInPolygon.length > 0) {
      if (selectionMode === "new") {
        onSelectionChange(pointsInPolygon);
      } else if (selectionMode === "union") {
        const newSet = new Set([...selectedIds, ...pointsInPolygon]);
        onSelectionChange(Array.from(newSet));
      } else if (selectionMode === "subtract") {
        const toRemove = new Set(pointsInPolygon);
        const newSelection = selectedIds.filter(id => !toRemove.has(id));
        onSelectionChange(newSelection);
      }
    } else if (selectionMode === "new") {
      // Clear selection if lasso captures nothing in 'new' mode
      onSelectionChange([]);
    }
  };

  useEffect(() => {
    if (!lassoEnabled) return;
    const handler = (event) => {
      if (event.key === "Escape") {
        setActiveLassoTool(null);
        setLassoData({ type: "FeatureCollection", features: [] });
        // Clear selection on Escape
        onSelectionChange([]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lassoEnabled, onSelectionChange]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const { accessor: colorAccessor, legend } = useMemo(() => buildColorScale(points, colorMode, customColorRange, selectedColorScale, customCategoryColors, defaultCategoryColors), [points, colorMode, customColorRange, selectedColorScale, customCategoryColors, defaultCategoryColors]);

  const layers = useMemo(() => {
    if (!points.length) return [];
    const bounds = computeBounds(points);

    const baseColor = (point) => {
      const base = colorAccessor ? colorAccessor(point) : [56, 189, 248, 220];
      if (selectedSet.has(point.id)) {
        return [base[0], base[1], base[2], 255];
      }
      return base;
    };

    // Calculate radius based on selection state
    const hasSelection = selectedIds.length > 0;
    const getPointRadius = (point) => {
      if (!hasSelection) return pointSize;
      const scale = selectedSet.has(point.id) ? selectedPointScale : unselectedPointScale;
      return pointSize * scale;
    };

    const commonProps = {
      id: "embedding-points",
      data: points,
      pickable: true,
      getFillColor: baseColor,
      updateTriggers: {
        getFillColor: [colorAccessor, selectedIds],
        getRadius: [selectedIds, selectedPointScale, unselectedPointScale, pointSize],
      },
    };

    const composedLayers = [];

    if (viewMode === "3d" && supports3D) {
      // Use SimpleMeshLayer with SphereGeometry for true 3D spheres
      const sphereMesh = new SphereGeometry({
        radius: 1,
        nlat: 12,
        nlong: 12,
      });

      // Calculate sphere scale based on data extent and point size
      // The scale factor converts pixel-like size to world units
      const baseScale = (bounds.extent / 300) * pointSize;

      const getSphereScale = (point) => {
        let scale = baseScale;
        if (hasSelection) {
          const selectionScale = selectedSet.has(point.id) ? selectedPointScale : unselectedPointScale;
          scale = baseScale * selectionScale;
        }
        return [scale, scale, scale];
      };

      composedLayers.push(new SimpleMeshLayer({
        ...commonProps,
        id: "embedding-spheres-3d",
        mesh: sphereMesh,
        getPosition: (point) => [point.x, point.y, point.z ?? 0],
        getScale: getSphereScale,
        getColor: baseColor,
        getOrientation: [0, 0, 0],
        material: {
          ambient: 0.5,
          diffuse: 0.6,
          shininess: 32,
          specularColor: [60, 64, 175],
        },
        autoHighlight: !lassoEnabled,
        highlightColor: [255, 255, 255, 200],
        updateTriggers: {
          ...commonProps.updateTriggers,
          getScale: [pointSize, selectedIds, selectedPointScale, unselectedPointScale],
        },
      }));
    } else {
      composedLayers.push(new ScatterplotLayer({
        ...commonProps,
        opacity: pointOpacity,
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        getPosition: (point) => [point.x, point.y],
        getRadius: getPointRadius,
        stroked: pointEdgeWidth > 0,
        getLineWidth: pointEdgeWidth,
        getLineColor: (() => {
          const c = d3Rgb(pointEdgeColor);
          return [c.r, c.g, c.b, 255];
        })(),
        autoHighlight: !lassoEnabled,
        highlightColor: toRgbObject([255, 255, 255, 255]),
        updateTriggers: {
          ...commonProps.updateTriggers,
          getLineWidth: [pointEdgeWidth],
          getLineColor: [pointEdgeColor],
        },
      }));
    }

    const extraLayers = [];

    if (showLabels && labelsData.length > 0) {
      extraLayers.push(new TextLayer({
        id: "text-layer",
        data: labelsData,
        pickable: false,
        getPosition: d => d.position,
        getText: d => d.text,
        getSize: 16,
        getColor: [255, 255, 255, 255],
        getAngle: 0,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        background: true,
        getBackgroundColor: [0, 0, 0, 1000],
        backgroundPadding: [4, 2],
      }));
    }



    return [...composedLayers, ...extraLayers];
  }, [points, colorAccessor, viewMode, supports3D, pointSize, pointOpacity, pointEdgeWidth, pointEdgeColor, selectedIds, selectedPointScale, unselectedPointScale, lassoEnabled, onSelectionChange, selectedSet, showLabels, labelsData]);

  const selectionLayer = useMemo(() => {
    // If drawing is active, use Editable layer
    if (activeLassoTool) {
      return new EditableGeoJsonLayer({
        id: "selection-editable",
        data: lassoData,
        mode: activeLassoTool === 'lasso2' ? new DrawPolygonByDraggingMode() : new DrawPolygonMode(),
        selectedFeatureIndexes: [],

        // Styling based on mode
        getTentativeLineColor: () => selectionMode === "subtract" ? [255, 80, 80, 255] : [255, 215, 0, 255],
        getTentativeFillColor: () => selectionMode === "subtract" ? [255, 80, 80, 80] : [255, 215, 0, 80],
        getLineColor: (feature) => feature.properties?.mode === "subtract" ? [255, 80, 80, 255] : [255, 215, 0, 255],
        getFillColor: (feature) => feature.properties?.mode === "subtract" ? [255, 80, 80, 80] : [255, 215, 0, 80],
        lineWidthMinPixels: 3,
        filled: true,
        stroked: true,

        onEdit: ({ updatedData, editType }) => {
          if (editType === "addFeature" && updatedData.features.length > 0) {
            const newFeature = updatedData.features[updatedData.features.length - 1];
            // Tag feature with current mode
            newFeature.properties = { mode: selectionMode };

            let newLassoData;
            if (selectionMode === "new") {
              newLassoData = { type: "FeatureCollection", features: [newFeature] };
            } else {
              newLassoData = {
                type: "FeatureCollection",
                features: [...lassoData.features, newFeature]
              };
            }

            setLassoData(newLassoData);
            performPolygonSelection(newFeature);
          } else {
            setLassoData(updatedData);
          }
        },

        pickable: true,
        autoHighlight: false
      });
    }

    // If drawing is NOT active, but we have data, use static GeoJsonLayer
    // This allows "shadows" to persist without blocking interactions (fix freeze)
    if (lassoData.features.length > 0) {
      return new GeoJsonLayer({
        id: "selection-static",
        data: lassoData,
        pickable: false, // Ensure it doesn't steal clicks
        stroked: true,
        filled: true,
        lineWidthMinPixels: 3,
        getLineColor: (feature) => feature.properties?.mode === "subtract" ? [255, 80, 80, 255] : [255, 215, 0, 255],
        getFillColor: (feature) => feature.properties?.mode === "subtract" ? [255, 80, 80, 80] : [255, 215, 0, 80],
      });
    }

    return null;
  }, [activeLassoTool, lassoData, points, onSelectionChange, selectionMode]);

  const tooltip = useMemo(
    () =>
      ({ object }) => {
        if (!object) return null;
        const lines = [];
        if (object.id) lines.push(`bc: ${object.id}`);
        if (typeof object.value === "number") lines.push(`Value: ${object.value.toFixed(3)}`);
        return { text: lines.join("\n") };
      },
    []
  );

  const handleSnapshot = () => {
    const deck = deckRef.current?.deck;
    if (!deck) return;

    const takeSnapshot = () => {
      try {
        const canvas = deck.canvas;
        if (!canvas) return;

        const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
        if (gl) {
          gl.flush();
          gl.finish();
        }

        const url = canvas.toDataURL("image/png", 1.0);
        const BLANK_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

        if (url === BLANK_IMAGE) {
          deck.redraw();
          setTimeout(() => {
            const retryUrl = canvas.toDataURL("image/png", 1.0);
            downloadImage(retryUrl);
          }, 200);
          return;
        }

        downloadImage(url);
      } catch (error) {
        console.error("PNG export failed:", error);
      }
    };

    const downloadImage = (url) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `embedding-${embeddingName || "visualization"}-${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    };

    deck.redraw();
    requestAnimationFrame(() => {
      requestAnimationFrame(takeSnapshot);
    });
  };

  // Validate and apply hex color
  const handleHexColorSubmit = () => {
    let hex = customHexInput.trim();
    if (!hex.startsWith("#")) {
      hex = "#" + hex;
    }
    // Validate hex color format
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (hexRegex.test(hex)) {
      setCanvasBgColor(hex);
      setShowBgPicker(false);
      setCustomHexInput("");
    }
  };

  const currentLayers = useMemo(() => {
    if (selectionLayer) {
      return [...layers, selectionLayer];
    }
    return layers;
  }, [layers, selectionLayer]);

  const views = useMemo(() => {
    if (viewMode === "3d" && supports3D) {
      return [new OrbitView({ id: "orbit", fovy: 50 })];
    }
    return [new OrthographicView({ id: "ortho" })];
  }, [viewMode, supports3D]);

  const controller = useMemo(() => {
    // If lasso is active, strictly disable the view controller to prevent camera movement.
    // Events will still pass to the layer (EditableGeoJsonLayer) for drawing.
    if (lassoEnabled) {
      return false;
    }
    // If lasso is inactive, strictly enable the default view controller (Orbit/Orthographic).
    // This ensures all interaction flags (pan/zoom) are reset to their default enabled state.
    return true;
  }, [lassoEnabled]);

  const cellCountLabel = loading
    ? "Loading embedding coordinates..."
    : `Displaying ${points.length.toLocaleString()} cells (out of ${totalCells?.toLocaleString() || "?"})`;

  return (
    <div className="embedding-card">
      <div className="embedding-header">
        <div className="embedding-title">
          <h2>{embeddingName?.toUpperCase() || "EMBEDDING"}</h2>
          <span className="embedding-count">{cellCountLabel}</span>
        </div>
        <div className="embedding-meta">
          <span>{viewMode === "3d" && supports3D ? "3D view" : "2D view"}</span>
        </div>
      </div>
      <div className="embedding-canvas" style={{ backgroundColor: canvasBgColor }}>
        <div className="embedding-tools">
          {supports3D ? (
            <button type="button" onClick={() => setViewMode(viewMode === "3d" ? "2d" : "3d")}>Toggle {viewMode === "3d" ? "2D" : "3D"}</button>
          ) : null}
          <div className="bg-picker-container">
            <button
              type="button"
              onClick={() => setShowBgPicker(!showBgPicker)}
              className="bg-picker-toggle"
              title="Change background color"
            >
              <span
                className="bg-color-preview"
                style={{ backgroundColor: canvasBgColor === "transparent" ? "#fff" : canvasBgColor }}
              />
              BG
            </button>
            {showBgPicker && (
              <div className="bg-picker-dropdown">
                <div className="bg-picker-title">Background Color</div>
                <div className="bg-preset-grid">
                  {PRESET_BG_COLORS.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      className={`bg-preset-btn ${canvasBgColor === color.value ? "active" : ""}`}
                      onClick={() => {
                        setCanvasBgColor(color.value);
                        setShowBgPicker(false);
                      }}
                      title={color.name}
                    >
                      <span
                        className="bg-preset-swatch"
                        style={{
                          backgroundColor: color.value === "transparent" ? "#fff" : color.value,
                          backgroundImage: color.value === "transparent"
                            ? "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)"
                            : "none",
                          backgroundSize: "8px 8px",
                          backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px"
                        }}
                      />
                      <span className="bg-preset-name">{color.name}</span>
                    </button>
                  ))}
                </div>
                <div className="bg-hex-input">
                  <label>Custom Hex:</label>
                  <div className="bg-hex-row">
                    <input
                      type="text"
                      placeholder="#RRGGBB"
                      value={customHexInput}
                      onChange={(e) => setCustomHexInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleHexColorSubmit();
                        }
                      }}
                    />
                    <button type="button" onClick={handleHexColorSubmit}>Apply</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className={activeLassoTool === 'lasso1' ? "active" : ""}
            onClick={() => {
              if (activeLassoTool === 'lasso1') {
                // Toggle off
                setActiveLassoTool(null);
                setLassoData({ type: "FeatureCollection", features: [] });
              } else {
                setActiveLassoTool('lasso1');
              }
            }}
            title="Click to draw polygon"
          >
            Lasso 1
          </button>
          <button
            type="button"
            className={activeLassoTool === 'lasso2' ? "active" : ""}
            onClick={() => {
              if (activeLassoTool === 'lasso2') {
                setActiveLassoTool(null);
                setLassoData({ type: "FeatureCollection", features: [] });
              } else {
                setActiveLassoTool('lasso2');
              }
            }}
            title="Drag to draw region"
          >
            Lasso 2
          </button>

          {lassoEnabled && (
            <div className="toolbar-group">
              <button
                type="button"
                className={selectionMode === "new" ? "active" : ""}
                onClick={() => setSelectionMode("new")}
                title="New Selection"
              >
                New
              </button>
              <button
                type="button"
                className={selectionMode === "union" ? "active" : ""}
                onClick={() => setSelectionMode("union")}
                title="Add to Selection"
              >
                Add
              </button>
              <button
                type="button"
                className={selectionMode === "subtract" ? "active" : ""}
                onClick={() => setSelectionMode("subtract")}
                title="Remove from Selection"
              >
                Sub
              </button>
            </div>
          )}

          <div className="toolbar-divider" />

          {(!supports3D || viewMode !== "3d") && (
            <button
              type="button"
              className={showLabels ? "active" : ""}
              onClick={() => setShowLabels(!showLabels)}
              title="Toggle Labels"
            >
              Labels
            </button>
          )}

          <button
            type="button"
            onClick={() => setViewState(initialView)}
            title="Reset View"
          >
            Reset
          </button>

          {supports3D && viewMode === "3d" && (
            <>
              <button
                type="button"
                className={autoRotate ? "active" : ""}
                onClick={() => setAutoRotate(!autoRotate)}
                title="Auto Rotate"
              >
                Rotate
              </button>
            </>
          )}

          <button type="button" onClick={handleSnapshot}>Save PNG</button>
          {selectedIds.length ? <button type="button" onClick={() => {
            onSelectionChange([]);
            setLassoData({ type: "FeatureCollection", features: [] });
            setActiveLassoTool(null);
          }}>Clear ({selectedIds.length})</button> : null}
        </div>
        <DeckGL
          ref={deckRef}
          layers={currentLayers}
          views={views}
          controller={controller}
          initialViewState={initialView}
          viewState={viewState}
          onViewStateChange={({ viewState: nextState }) => setViewState(nextState)}
          getTooltip={tooltip}
          pickingRadius={5}
          clearColor={[0, 0, 0, 0]}
          getCursor={({ isDragging, isHovering }) => {
            if (lassoEnabled) return 'crosshair';
            if (isDragging) return 'grabbing';
            if (isHovering) return 'pointer';
            return 'default';
          }}
          glOptions={{
            preserveDrawingBuffer: true,
            antialias: true,
            alpha: true
          }}
          style={{ position: 'absolute', inset: 0 }}
        />
        {legend?.type === "continuous" ? (
          <div className="legend gradient">
            <div className="gradient-header">
              <span>{legend.min.toFixed(2)}</span>
              <span>{legend.max.toFixed(2)}</span>
            </div>
            <div
              className="gradient-bar"
              style={{
                background: generateColorbarGradient(legend.interpolator),
                height: '16px',
                borderRadius: '4px',
              }}
            />
          </div>
        ) : null}
        {legend?.type === "categorical" ? (
          <div className="legend categorical">
            {legend.entries.slice(0, 20).map((entry) => (
              <div key={entry.label} className="legend-item">
                <span style={{ backgroundColor: `rgba(${entry.color[0]}, ${entry.color[1]}, ${entry.color[2]}, ${entry.color[3] / 255})` }} />
                <p>{entry.label}</p>
              </div>
            ))}
            {legend.entries.length > 20 ? <p>+{legend.entries.length - 20} more...</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

EmbeddingView.propTypes = {
  embeddingName: PropTypes.string,
  points: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      x: PropTypes.number.isRequired,
      y: PropTypes.number.isRequired,
      z: PropTypes.number,
      cluster: PropTypes.string,
      condition: PropTypes.string,
      label: PropTypes.string,
      value: PropTypes.number,
    })
  ),
  totalCells: PropTypes.number,
  colorMode: PropTypes.string,
  loading: PropTypes.bool,
  dimensions: PropTypes.number,
  pointSize: PropTypes.number,
  pointOpacity: PropTypes.number,
  pointEdgeWidth: PropTypes.number,
  pointEdgeColor: PropTypes.string,
  customCategoryColors: PropTypes.object,
  selectedIds: PropTypes.arrayOf(PropTypes.string),
  selectedPointScale: PropTypes.number,
  unselectedPointScale: PropTypes.number,
  onSelectionChange: PropTypes.func.isRequired,
  colorScaleName: PropTypes.string,
  colorRangeMin: PropTypes.number,
  colorRangeMax: PropTypes.number,
};

EmbeddingView.defaultProps = {
  embeddingName: "umap",
  points: [],
  totalCells: null,
  colorMode: null,
  loading: false,
  dimensions: 2,
  pointSize: 4,
  pointOpacity: 1.0,
  pointEdgeWidth: 0,
  pointEdgeColor: "#000000",
  customCategoryColors: {},
  selectedIds: [],
  selectedPointScale: 1.0,
  unselectedPointScale: 1.0,
  colorScaleName: "turbo",
  colorRangeMin: null,
  colorRangeMax: null,
};

export default EmbeddingView;
