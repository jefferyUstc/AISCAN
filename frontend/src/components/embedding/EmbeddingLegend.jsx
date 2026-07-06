import PropTypes from "prop-types";
import { generateColorbarGradient } from "../../utils/colors";

const MAX_CATEGORICAL_ENTRIES = 20;

export default function EmbeddingLegend({ legend }) {
  if (legend?.type === "continuous") {
    return (
      <div className="legend gradient">
        <div className="gradient-header">
          <span>{legend.min.toFixed(2)}</span>
          <span>{legend.max.toFixed(2)}</span>
        </div>
        <div
          className="gradient-bar"
          style={{
            background: generateColorbarGradient(legend.interpolator),
            height: "16px",
            borderRadius: "4px",
          }}
        />
      </div>
    );
  }

  if (legend?.type === "categorical") {
    const shown = legend.entries.slice(0, MAX_CATEGORICAL_ENTRIES);
    const overflow = legend.entries.length - MAX_CATEGORICAL_ENTRIES;
    return (
      <div className="legend categorical">
        {shown.map((entry) => (
          <div key={entry.label} className="legend-item">
            <span
              style={{
                backgroundColor: `rgba(${entry.color[0]}, ${entry.color[1]}, ${entry.color[2]}, ${entry.color[3] / 255})`,
              }}
            />
            <p>{entry.label}</p>
          </div>
        ))}
        {overflow > 0 ? <p>+{overflow} more...</p> : null}
      </div>
    );
  }

  return null;
}

EmbeddingLegend.propTypes = {
  legend: PropTypes.shape({
    type: PropTypes.oneOf(["continuous", "categorical"]),
    min: PropTypes.number,
    max: PropTypes.number,
    interpolator: PropTypes.func,
    entries: PropTypes.array,
  }),
};
