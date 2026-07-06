import { useCallback, useEffect, useMemo, useState } from "react";
import { GeoJsonLayer } from "@deck.gl/layers";
import { EditableGeoJsonLayer } from "@nebula.gl/layers";
import { DrawPolygonMode, DrawPolygonByDraggingMode } from "@nebula.gl/edit-modes";
import { pointInPolygon } from "../utils/geometry.js";

const EMPTY_FEATURE_COLLECTION = { type: "FeatureCollection", features: [] };

const lineColorFor = (mode) => (mode === "subtract" ? [255, 80, 80, 255] : [255, 215, 0, 255]);
const fillColorFor = (mode) => (mode === "subtract" ? [255, 80, 80, 80] : [255, 215, 0, 80]);

// Encapsulates lasso drawing state, the deck.gl selection layer, and the
// polygon -> selection reconciliation (new / union / subtract).
export function useLassoSelection({ points, selectedIds, onSelectionChange }) {
  const [activeLassoTool, setActiveLassoTool] = useState(null); // 'lasso1' | 'lasso2' | null
  const [selectionMode, setSelectionMode] = useState("new"); // 'new' | 'union' | 'subtract'
  const [lassoData, setLassoData] = useState(EMPTY_FEATURE_COLLECTION);
  const lassoEnabled = activeLassoTool !== null;

  const resetLasso = useCallback(() => {
    setActiveLassoTool(null);
    setLassoData(EMPTY_FEATURE_COLLECTION);
  }, []);

  const performPolygonSelection = useCallback(
    (polygon) => {
      const captured = [];
      points.forEach((point) => {
        if (pointInPolygon([point.x, point.y], polygon)) captured.push(point.id);
      });

      if (captured.length === 0) {
        if (selectionMode === "new") onSelectionChange([]);
        return;
      }
      if (selectionMode === "union") {
        onSelectionChange(Array.from(new Set([...selectedIds, ...captured])));
      } else if (selectionMode === "subtract") {
        const remove = new Set(captured);
        onSelectionChange(selectedIds.filter((id) => !remove.has(id)));
      } else {
        onSelectionChange(captured);
      }
    },
    [points, selectedIds, selectionMode, onSelectionChange]
  );

  // Escape cancels the lasso and clears the current selection.
  useEffect(() => {
    if (!lassoEnabled) return undefined;
    const handler = (event) => {
      if (event.key === "Escape") {
        resetLasso();
        onSelectionChange([]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lassoEnabled, onSelectionChange, resetLasso]);

  const selectionLayer = useMemo(() => {
    if (activeLassoTool) {
      return new EditableGeoJsonLayer({
        id: "selection-editable",
        data: lassoData,
        mode:
          activeLassoTool === "lasso2"
            ? new DrawPolygonByDraggingMode()
            : new DrawPolygonMode(),
        selectedFeatureIndexes: [],
        getTentativeLineColor: () => lineColorFor(selectionMode),
        getTentativeFillColor: () => fillColorFor(selectionMode),
        getLineColor: (feature) => lineColorFor(feature.properties?.mode),
        getFillColor: (feature) => fillColorFor(feature.properties?.mode),
        lineWidthMinPixels: 3,
        filled: true,
        stroked: true,
        onEdit: ({ updatedData, editType }) => {
          if (editType === "addFeature" && updatedData.features.length > 0) {
            const newFeature = updatedData.features[updatedData.features.length - 1];
            newFeature.properties = { mode: selectionMode };
            setLassoData(
              selectionMode === "new"
                ? { type: "FeatureCollection", features: [newFeature] }
                : { type: "FeatureCollection", features: [...lassoData.features, newFeature] }
            );
            performPolygonSelection(newFeature);
          } else {
            setLassoData(updatedData);
          }
        },
        pickable: true,
        autoHighlight: false,
      });
    }

    // Not drawing: keep drawn shapes as a static, non-interactive overlay.
    if (lassoData.features.length > 0) {
      return new GeoJsonLayer({
        id: "selection-static",
        data: lassoData,
        pickable: false,
        stroked: true,
        filled: true,
        lineWidthMinPixels: 3,
        getLineColor: (feature) => lineColorFor(feature.properties?.mode),
        getFillColor: (feature) => fillColorFor(feature.properties?.mode),
      });
    }

    return null;
  }, [activeLassoTool, lassoData, selectionMode, performPolygonSelection]);

  return {
    activeLassoTool,
    setActiveLassoTool,
    selectionMode,
    setSelectionMode,
    lassoEnabled,
    resetLasso,
    selectionLayer,
  };
}
