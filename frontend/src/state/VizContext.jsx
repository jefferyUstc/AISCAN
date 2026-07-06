import { createContext, useContext, useMemo, useReducer } from "react";
import PropTypes from "prop-types";
import { initialVizState, vizReducer } from "./vizReducer.js";

const VizContext = createContext(null);

export function VizProvider({ children }) {
  const [state, dispatch] = useReducer(vizReducer, initialVizState);

  const actions = useMemo(
    () => ({
      setColorMode: (value) => dispatch({ type: "SET_COLOR_MODE", value }),
      setGeneInput: (value) => dispatch({ type: "SET_GENE_INPUT", value }),
      applyGene: (value) => dispatch({ type: "APPLY_GENE", value }),
      setActiveGene: (value) => dispatch({ type: "SET_ACTIVE_GENE", value }),
      setSampleFraction: (value) => dispatch({ type: "SET_SAMPLE_FRACTION", value }),
      setPointSize: (value) => dispatch({ type: "SET_POINT_SIZE", value }),
      setPointOpacity: (value) => dispatch({ type: "SET_POINT_OPACITY", value }),
      setPointEdgeWidth: (value) => dispatch({ type: "SET_POINT_EDGE_WIDTH", value }),
      setPointEdgeColor: (value) => dispatch({ type: "SET_POINT_EDGE_COLOR", value }),
      setCustomCategoryColors: (value) => dispatch({ type: "SET_CUSTOM_CATEGORY_COLORS", value }),
      setSelectedIds: (value) => dispatch({ type: "SET_SELECTED_IDS", value }),
      clearSelection: () => dispatch({ type: "CLEAR_SELECTION" }),
      setSelectedPointScale: (value) => dispatch({ type: "SET_SELECTED_POINT_SCALE", value }),
      setUnselectedPointScale: (value) => dispatch({ type: "SET_UNSELECTED_POINT_SCALE", value }),
      setVisibleCategories: (field, value) =>
        dispatch({ type: "SET_VISIBLE_CATEGORIES", field, value }),
      mergeVisibleCategories: (value) => dispatch({ type: "MERGE_VISIBLE_CATEGORIES", value }),
      setColorScaleName: (value) => dispatch({ type: "SET_COLOR_SCALE", value }),
      setColorRange: (min, max) => dispatch({ type: "SET_COLOR_RANGE", min, max }),
      resetColorRange: () => dispatch({ type: "RESET_COLOR_RANGE" }),
    }),
    []
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <VizContext.Provider value={value}>{children}</VizContext.Provider>;
}

VizProvider.propTypes = {
  children: PropTypes.node,
};

export function useViz() {
  const ctx = useContext(VizContext);
  if (!ctx) throw new Error("useViz must be used within a VizProvider");
  return ctx;
}
