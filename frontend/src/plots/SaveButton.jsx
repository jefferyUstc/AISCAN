import PropTypes from "prop-types";
import { Plotly } from "./plotly.js";

// Export the current Plotly figure (referenced by a react-plotly.js ref) as SVG.
export function savePlotSvg(ref, filename) {
  const el = ref?.current?.el || ref?.current;
  if (!el) return;
  const safeName = (filename || "plot").replace(/[^\w.-]+/g, "_");
  Plotly.downloadImage(el, {
    format: "svg",
    filename: safeName,
    width: el?.offsetWidth || undefined,
    height: el?.offsetHeight || undefined,
    scale: 5,
  }).catch((error) => {
    // Downloading can reject (e.g. a tainted canvas). Surface it instead of
    // leaving the user with a button that silently does nothing.
    console.error("Plot export failed:", error);
  });
}

export default function SaveButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="plot-save-btn" title="Save plot as SVG">
      <span>📷 Save</span>
    </button>
  );
}

SaveButton.propTypes = {
  onClick: PropTypes.func.isRequired,
};
