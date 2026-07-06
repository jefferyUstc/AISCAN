// Pure reducer for all visualization settings. Kept free of React so it can be
// unit-tested in isolation and so clamping lives in exactly one place.

export const initialVizState = {
  colorMode: "obs", // "obs" | "gene"
  geneInput: "",
  activeGene: "",
  sampleFraction: 0.15,
  pointSize: 2,
  pointOpacity: 1.0,
  pointEdgeWidth: 0,
  pointEdgeColor: "#000000",
  customCategoryColors: {},
  selectedIds: [],
  selectedPointScale: 1.0,
  unselectedPointScale: 1.0,
  visibleCategoriesByField: {}, // field -> string[] | null (null/undefined => show all)
  colorScaleName: "turbo",
  colorRangeMin: null,
  colorRangeMax: null,
};

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const round = (value, digits) => parseFloat(value.toFixed(digits));

export function vizReducer(state, action) {
  switch (action.type) {
    case "SET_COLOR_MODE":
      return { ...state, colorMode: action.value };
    case "SET_GENE_INPUT":
      return { ...state, geneInput: action.value };
    case "APPLY_GENE": {
      const trimmed = String(action.value ?? "").trim();
      if (!trimmed) return state;
      return { ...state, activeGene: trimmed, geneInput: trimmed, colorMode: "gene" };
    }
    case "SET_ACTIVE_GENE": {
      const trimmed = String(action.value ?? "").trim();
      if (!trimmed) return state;
      return { ...state, activeGene: trimmed, geneInput: trimmed };
    }
    case "SET_SAMPLE_FRACTION":
      return { ...state, sampleFraction: round(clamp(action.value, 0.05, 1), 2) };
    case "SET_POINT_SIZE":
      return { ...state, pointSize: clamp(action.value, 1, 10) };
    case "SET_POINT_OPACITY":
      return { ...state, pointOpacity: round(clamp(action.value, 0.1, 1), 1) };
    case "SET_POINT_EDGE_WIDTH":
      return { ...state, pointEdgeWidth: round(clamp(action.value, 0, 2), 1) };
    case "SET_POINT_EDGE_COLOR":
      return { ...state, pointEdgeColor: action.value };
    case "SET_CUSTOM_CATEGORY_COLORS":
      return { ...state, customCategoryColors: action.value };
    case "SET_SELECTED_IDS":
      return { ...state, selectedIds: action.value };
    case "CLEAR_SELECTION":
      return state.selectedIds.length ? { ...state, selectedIds: [] } : state;
    case "SET_SELECTED_POINT_SCALE":
      return { ...state, selectedPointScale: action.value };
    case "SET_UNSELECTED_POINT_SCALE":
      return { ...state, unselectedPointScale: action.value };
    case "SET_VISIBLE_CATEGORIES": {
      if (!action.field) return state;
      return {
        ...state,
        visibleCategoriesByField: {
          ...state.visibleCategoriesByField,
          [action.field]: action.value,
        },
      };
    }
    case "MERGE_VISIBLE_CATEGORIES":
      return {
        ...state,
        visibleCategoriesByField: { ...state.visibleCategoriesByField, ...action.value },
      };
    case "SET_COLOR_SCALE":
      return { ...state, colorScaleName: action.value };
    case "SET_COLOR_RANGE":
      return { ...state, colorRangeMin: action.min, colorRangeMax: action.max };
    case "RESET_COLOR_RANGE":
      return { ...state, colorRangeMin: null, colorRangeMax: null };
    default:
      return state;
  }
}
