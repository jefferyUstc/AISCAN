import PropTypes from "prop-types";
import { useState } from "react";

export const PRESET_BG_COLORS = [
  { name: "Default Dark", value: "rgba(15, 23, 42, 0.55)" },
  { name: "Pure Black", value: "#000000" },
  { name: "Charcoal", value: "#1a1a2e" },
  { name: "Dark Slate", value: "#1e293b" },
  { name: "Midnight Blue", value: "#191970" },
  { name: "White", value: "#ffffff" },
  { name: "Light Gray", value: "#f1f5f9" },
  { name: "Warm White", value: "#faf5f0" },
  { name: "Transparent", value: "transparent" },
];

const HEX_RE = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

const TRANSPARENT_CHECKER = {
  backgroundImage:
    "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
};

export default function BackgroundColorPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState("");

  const applyHex = () => {
    let hex = hexInput.trim();
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (HEX_RE.test(hex)) {
      onChange(hex);
      setOpen(false);
      setHexInput("");
    }
  };

  const select = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div className="bg-picker-container">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="bg-picker-toggle"
        title="Change background color"
      >
        <span
          className="bg-color-preview"
          style={{ backgroundColor: value === "transparent" ? "#fff" : value }}
        />
        BG
      </button>
      {open && (
        <div className="bg-picker-dropdown">
          <div className="bg-picker-title">Background Color</div>
          <div className="bg-preset-grid">
            {PRESET_BG_COLORS.map((color) => (
              <button
                key={color.name}
                type="button"
                className={`bg-preset-btn ${value === color.value ? "active" : ""}`}
                onClick={() => select(color.value)}
                title={color.name}
              >
                <span
                  className="bg-preset-swatch"
                  style={{
                    backgroundColor: color.value === "transparent" ? "#fff" : color.value,
                    ...(color.value === "transparent" ? TRANSPARENT_CHECKER : null),
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
                value={hexInput}
                onChange={(event) => setHexInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyHex();
                }}
              />
              <button type="button" onClick={applyHex}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

BackgroundColorPicker.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
