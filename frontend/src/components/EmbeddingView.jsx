import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import { OrthographicView, OrbitView } from "@deck.gl/core";
import { SphereGeometry } from "@luma.gl/engine";
import { rgb as d3Rgb } from "d3-color";
import { buildColorScale } from "../utils/colorScale.js";
import { computeBounds } from "../utils/geometry.js";
import { downloadUrl } from "../utils/download.js";
import { useViz } from "../state/VizContext.jsx";
import { useLassoSelection } from "../hooks/useLassoSelection.js";
import EmbeddingLegend from "./embedding/EmbeddingLegend.jsx";
import BackgroundColorPicker from "./embedding/BackgroundColorPicker.jsx";

const BLANK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const toRgbObject = (color) => ({ r: color[0], g: color[1], b: color[2], a: color[3] ?? 255 });

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

function EmbeddingView({
  embeddingName,
  points,
  totalCells,
  colorMode,
  loading,
  dimensions,
  defaultCategoryColors,
}) {
  const { state: viz, actions } = useViz();
  const {
    pointSize,
    pointOpacity,
    pointEdgeWidth,
    pointEdgeColor,
    customCategoryColors,
    selectedIds,
    selectedPointScale,
    unselectedPointScale,
    colorScaleName,
    colorRangeMin,
    colorRangeMax,
  } = viz;
  const onSelectionChange = actions.setSelectedIds;

  const supports3D = dimensions >= 3;
  const [viewMode, setViewMode] = useState("2d");
  const initialView = useInitialView(points, viewMode === "3d" && supports3D ? "3d" : "2d");
  const [viewState, setViewState] = useState(initialView);
  const deckRef = useRef(null);

  const [canvasBgColor, setCanvasBgColor] = useState("rgba(15, 23, 42, 0.55)");
  const [showLabels, setShowLabels] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  const {
    activeLassoTool,
    setActiveLassoTool,
    selectionMode,
    setSelectionMode,
    lassoEnabled,
    resetLasso,
    selectionLayer,
  } = useLassoSelection({ points, selectedIds, onSelectionChange });

  const customColorRange = useMemo(() => {
    if (colorRangeMin !== null && colorRangeMax !== null) return { min: colorRangeMin, max: colorRangeMax };
    if (colorRangeMin !== null) return { min: colorRangeMin, max: null };
    if (colorRangeMax !== null) return { min: null, max: colorRangeMax };
    return null;
  }, [colorRangeMin, colorRangeMax]);
  const selectedColorScale = colorScaleName || "turbo";

  const bounds = useMemo(() => computeBounds(points), [points]);

  useEffect(() => {
    if (!supports3D && viewMode === "3d") setViewMode("2d");
  }, [supports3D, viewMode]);

  useEffect(() => {
    setViewState(initialView);
  }, [initialView, viewMode, embeddingName]);

  const labelsData = useMemo(() => {
    if (!showLabels || !points.length) return [];
    const groups = {};
    points.forEach((point) => {
      const label = point.label || point.cluster;
      if (!label) return;
      if (!groups[label]) groups[label] = { x: 0, y: 0, z: 0, count: 0 };
      groups[label].x += point.x;
      groups[label].y += point.y;
      groups[label].z += point.z || 0;
      groups[label].count++;
    });
    return Object.entries(groups).map(([label, data]) => {
      const z = viewMode === "3d" && supports3D ? data.z / data.count : 0;
      return { text: label, position: [data.x / data.count, data.y / data.count, z] };
    });
  }, [points, showLabels, viewMode, supports3D]);

  useEffect(() => {
    let animationFrame;
    if (autoRotate && viewMode === "3d") {
      const animate = () => {
        setViewState((v) => ({ ...v, rotationOrbit: (v.rotationOrbit + 0.5) % 360 }));
        animationFrame = requestAnimationFrame(animate);
      };
      animate();
    }
    return () => cancelAnimationFrame(animationFrame);
  }, [autoRotate, viewMode]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const { accessor: colorAccessor, legend } = useMemo(
    () =>
      buildColorScale(
        points,
        colorMode,
        customColorRange,
        selectedColorScale,
        customCategoryColors,
        defaultCategoryColors
      ),
    [points, colorMode, customColorRange, selectedColorScale, customCategoryColors, defaultCategoryColors]
  );

  const layers = useMemo(() => {
    if (!points.length) return [];

    const baseColor = (point) => {
      const base = colorAccessor ? colorAccessor(point) : [56, 189, 248, 220];
      if (selectedSet.has(point.id)) return [base[0], base[1], base[2], 255];
      return base;
    };

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
      const sphereMesh = new SphereGeometry({ radius: 1, nlat: 12, nlong: 12 });
      const baseScale = (bounds.extent / 300) * pointSize;
      const getSphereScale = (point) => {
        let scale = baseScale;
        if (hasSelection) {
          const selectionScale = selectedSet.has(point.id) ? selectedPointScale : unselectedPointScale;
          scale = baseScale * selectionScale;
        }
        return [scale, scale, scale];
      };

      composedLayers.push(
        new SimpleMeshLayer({
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
        })
      );
    } else {
      const edge = d3Rgb(pointEdgeColor);
      composedLayers.push(
        new ScatterplotLayer({
          ...commonProps,
          opacity: pointOpacity,
          radiusUnits: "pixels",
          lineWidthUnits: "pixels",
          getPosition: (point) => [point.x, point.y],
          getRadius: getPointRadius,
          stroked: pointEdgeWidth > 0,
          getLineWidth: pointEdgeWidth,
          getLineColor: [edge.r, edge.g, edge.b, 255],
          autoHighlight: !lassoEnabled,
          highlightColor: toRgbObject([255, 255, 255, 255]),
          updateTriggers: {
            ...commonProps.updateTriggers,
            getLineWidth: [pointEdgeWidth],
            getLineColor: [pointEdgeColor],
          },
        })
      );
    }

    if (showLabels && labelsData.length > 0) {
      composedLayers.push(
        new TextLayer({
          id: "text-layer",
          data: labelsData,
          pickable: false,
          getPosition: (d) => d.position,
          getText: (d) => d.text,
          getSize: 16,
          getColor: [255, 255, 255, 255],
          getAngle: 0,
          getTextAnchor: "middle",
          getAlignmentBaseline: "center",
          background: true,
          getBackgroundColor: [0, 0, 0, 1000],
          backgroundPadding: [4, 2],
        })
      );
    }

    return composedLayers;
  }, [
    points,
    bounds,
    colorAccessor,
    viewMode,
    supports3D,
    pointSize,
    pointOpacity,
    pointEdgeWidth,
    pointEdgeColor,
    selectedIds,
    selectedPointScale,
    unselectedPointScale,
    lassoEnabled,
    selectedSet,
    showLabels,
    labelsData,
  ]);

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

    const save = (url) =>
      downloadUrl(url, `embedding-${embeddingName || "visualization"}-${Date.now()}.png`);

    const takeSnapshot = () => {
      try {
        const canvas = deck.canvas;
        if (!canvas) return;
        const gl = canvas.getContext("webgl") || canvas.getContext("webgl2");
        if (gl) {
          gl.flush();
          gl.finish();
        }
        const url = canvas.toDataURL("image/png", 1.0);
        if (url === BLANK_IMAGE) {
          deck.redraw();
          setTimeout(() => save(canvas.toDataURL("image/png", 1.0)), 200);
          return;
        }
        save(url);
      } catch (error) {
        // toDataURL throws SecurityError on a tainted canvas; surface it rather
        // than leaving the user wondering why nothing downloaded.
        console.error("PNG export failed:", error);
      }
    };

    deck.redraw();
    requestAnimationFrame(() => requestAnimationFrame(takeSnapshot));
  };

  const currentLayers = useMemo(
    () => (selectionLayer ? [...layers, selectionLayer] : layers),
    [layers, selectionLayer]
  );

  const views = useMemo(
    () =>
      viewMode === "3d" && supports3D
        ? [new OrbitView({ id: "orbit", fovy: 50 })]
        : [new OrthographicView({ id: "ortho" })],
    [viewMode, supports3D]
  );

  // Disabling the controller while drawing keeps the camera still so lasso
  // events reach the editable layer.
  const controller = !lassoEnabled;

  const cellCountLabel = loading
    ? "Loading embedding coordinates..."
    : `Displaying ${points.length.toLocaleString()} cells (out of ${totalCells?.toLocaleString() || "?"})`;

  const toggleLasso = (tool) => {
    if (activeLassoTool === tool) resetLasso();
    else setActiveLassoTool(tool);
  };

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
            <button type="button" onClick={() => setViewMode(viewMode === "3d" ? "2d" : "3d")}>
              Toggle {viewMode === "3d" ? "2D" : "3D"}
            </button>
          ) : null}

          <BackgroundColorPicker value={canvasBgColor} onChange={setCanvasBgColor} />

          <button
            type="button"
            className={activeLassoTool === "lasso1" ? "active" : ""}
            onClick={() => toggleLasso("lasso1")}
            title="Click to draw polygon"
          >
            Lasso 1
          </button>
          <button
            type="button"
            className={activeLassoTool === "lasso2" ? "active" : ""}
            onClick={() => toggleLasso("lasso2")}
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

          <button type="button" onClick={() => setViewState(initialView)} title="Reset View">
            Reset
          </button>

          {supports3D && viewMode === "3d" && (
            <button
              type="button"
              className={autoRotate ? "active" : ""}
              onClick={() => setAutoRotate(!autoRotate)}
              title="Auto Rotate"
            >
              Rotate
            </button>
          )}

          <button type="button" onClick={handleSnapshot}>
            Save PNG
          </button>
          {selectedIds.length ? (
            <button
              type="button"
              onClick={() => {
                onSelectionChange([]);
                resetLasso();
              }}
            >
              Clear ({selectedIds.length})
            </button>
          ) : null}
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
            if (lassoEnabled) return "crosshair";
            if (isDragging) return "grabbing";
            if (isHovering) return "pointer";
            return "default";
          }}
          glOptions={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
          style={{ position: "absolute", inset: 0 }}
        />
        <EmbeddingLegend legend={legend} />
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
  defaultCategoryColors: PropTypes.object,
};

export default EmbeddingView;
