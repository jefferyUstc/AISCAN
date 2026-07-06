import PropTypes from "prop-types";
import { useState } from "react";
import { COLOR_SCALES } from "../utils/colors";
import { rgbArrayToHex } from "../utils/color-format.js";
import { resolveCategoryColor } from "../utils/colorScale.js";
import { useViz } from "../state/VizContext.jsx";

export default function ControlPanel({
  embeddings = [],
  selectedEmbedding = null,
  onSelectEmbedding,
  obsAttributes = [],
  selectedObs = null,
  onSelectObs,
  geneOptions = [],
  categories = [],
  visibleCategories = null,
  defaultCategoryColors = {},
  dataset = null,
  onDownloadSelection = () => {},
  isContinuousMode = false,
  dataValueRange = { min: null, max: null },
}) {
  const { state: viz, actions } = useViz();
  const {
    colorMode,
    geneInput,
    activeGene,
    sampleFraction,
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

  // Local buffers for the color-range number inputs so typing does not commit
  // on every keystroke.
  const [localMin, setLocalMin] = useState("");
  const [localMax, setLocalMax] = useState("");

  const formatNumber = (value) => {
    if (typeof value !== "number" || Number.isNaN(value)) return "—";
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const handleGeneSelect = (event) => {
    const value = event.target.value || "";
    actions.setGeneInput(value);
    if (value) actions.applyGene(value);
  };

  const handleGeneSubmit = (event) => {
    event.preventDefault();
    actions.applyGene(geneInput);
  };

  const handleVisibleCategoriesChange = (nextVisible) => {
    if (!selectedObs) return;
    actions.setVisibleCategories(selectedObs, nextVisible);
  };

  const datasetName = dataset?.name || "Dataset";
  const datasetStats = [
    { label: "Cells", value: formatNumber(dataset?.cellCount) },
    { label: "Features", value: formatNumber(dataset?.geneCount) },
  ];

  const continuousAttributes = obsAttributes.filter((attribute) => attribute.kind === "numeric");
  const categoricalAttributes = obsAttributes.filter((attribute) => attribute.kind !== "numeric");
  const samplingPercent = Math.round((sampleFraction || 0) * 100);
  const normalizedCategories = Array.isArray(categories)
    ? categories.filter(Boolean).map(String)
    : [];
  const visibleSet =
    visibleCategories === null || visibleCategories === undefined
      ? null
      : new Set(Array.isArray(visibleCategories) ? visibleCategories.map(String) : []);

  return (
    <aside className="control-panel">
      <div className="sidebar-card dataset-summary">
        <div className="sidebar-title">{datasetName}</div>
        <dl className="sidebar-stats">
          {datasetStats.map((stat) => (
            <div key={stat.label} className="sidebar-stat">
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="sidebar-card">
        <div className="sidebar-subtitle">Embedding layout</div>
        <div className="field">
          <label htmlFor="embedding-select">Embedding</label>
          <select
            id="embedding-select"
            value={selectedEmbedding || ""}
            onChange={(event) => onSelectEmbedding(event.target.value || null)}
            disabled={!embeddings.length}
          >
            {embeddings.length === 0 ? (
              <option value="">No embeddings available</option>
            ) : (
              embeddings.map((embedding) => (
                <option key={embedding.key || embedding.name} value={embedding.name}>
                  {embedding.name.toUpperCase()} {embedding.dimensions >= 3 ? "(3D)" : ""}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <div className="sidebar-card">
        <div className="sidebar-subtitle">Color mapping</div>
        <div className="color-mode-toggle minimal">
          <button
            type="button"
            className={colorMode === "obs" ? "active" : ""}
            onClick={() => actions.setColorMode("obs")}
          >
            Attributes
          </button>
          <button
            type="button"
            className={colorMode === "gene" ? "active" : ""}
            onClick={() => actions.setColorMode("gene")}
          >
            Genes
          </button>
        </div>

        {colorMode === "obs" ? (
          <div className="field-stack">
            <div className="field">
              <label htmlFor="continuous-obs">Continuous attribute</label>
              <select
                id="continuous-obs"
                value={
                  continuousAttributes.some((attribute) => attribute.name === selectedObs)
                    ? selectedObs
                    : ""
                }
                onChange={(event) => onSelectObs(event.target.value || null)}
                disabled={continuousAttributes.length === 0}
              >
                <option value="">None</option>
                {continuousAttributes.map((attribute) => (
                  <option key={attribute.name} value={attribute.name}>
                    {attribute.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="categorical-obs">Categorical attribute</label>
              <select
                id="categorical-obs"
                value={
                  categoricalAttributes.some((attribute) => attribute.name === selectedObs)
                    ? selectedObs
                    : ""
                }
                onChange={(event) => onSelectObs(event.target.value || null)}
                disabled={categoricalAttributes.length === 0}
              >
                <option value="">None</option>
                {categoricalAttributes.map((attribute) => (
                  <option key={attribute.name} value={attribute.name}>
                    {attribute.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <form className="field" onSubmit={handleGeneSubmit}>
            <label htmlFor="gene-select">Gene or feature</label>
            <select
              id="gene-select"
              value={geneInput || ""}
              onChange={handleGeneSelect}
              disabled={geneOptions.length === 0}
            >
              <option value="">Select a feature</option>
              {geneOptions.map((gene) => {
                const primary = gene.symbol || gene.name;
                const secondary =
                  gene.symbol && gene.symbol !== gene.name
                    ? gene.name
                    : gene.metadata?.metabolites;
                const label = secondary ? `${primary} — ${secondary}` : primary;
                return (
                  <option key={gene.id} value={primary}>
                    {label}
                  </option>
                );
              })}
            </select>
            {activeGene ? (
              <p className="active-gene">Current: {activeGene}</p>
            ) : (
              <p className="hint">Pick a gene to render continuous expression colours.</p>
            )}
          </form>
        )}
      </div>

      <div className="sidebar-card">
        <div className="sidebar-subtitle">Point Control</div>

        <div className="control-section">
          <div className="field slider-field">
            <label htmlFor="sampling-fraction">Sampling {samplingPercent}%</label>
            <input
              id="sampling-fraction"
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={sampleFraction}
              onChange={(event) => actions.setSampleFraction(parseFloat(event.target.value))}
            />
          </div>
        </div>

        <div className="control-section">
          <div className="section-label">Appearance</div>
          <div className="field slider-field">
            <label htmlFor="point-size">Size {pointSize}px</label>
            <input
              id="point-size"
              type="range"
              min="1"
              max="10"
              step="1"
              value={pointSize}
              onChange={(event) => actions.setPointSize(parseInt(event.target.value, 10))}
            />
          </div>
          <div className="field slider-field">
            <label htmlFor="point-opacity">Opacity {pointOpacity}</label>
            <input
              id="point-opacity"
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={pointOpacity}
              onChange={(event) => actions.setPointOpacity(parseFloat(event.target.value))}
            />
          </div>
        </div>

        <div className="control-section">
          <div className="section-label">Border</div>
          <div className="field slider-field">
            <label htmlFor="point-edge-width">Width {pointEdgeWidth}px</label>
            <input
              id="point-edge-width"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={pointEdgeWidth}
              onChange={(event) => actions.setPointEdgeWidth(parseFloat(event.target.value))}
            />
          </div>
          <div className="field color-field-row">
            <label htmlFor="point-edge-color">Color</label>
            <div className="color-input-wrapper">
              <input
                id="point-edge-color"
                type="color"
                value={pointEdgeColor}
                onChange={(event) => actions.setPointEdgeColor(event.target.value)}
              />
              <span className="color-value">{pointEdgeColor}</span>
            </div>
          </div>
        </div>

        {isContinuousMode && (
          <div className="control-section colorbar-section">
            <div className="section-label">Continuous Colors</div>
            <div className="field">
              <label htmlFor="colormap-select">Colormap</label>
              <select
                id="colormap-select"
                value={colorScaleName}
                onChange={(event) => actions.setColorScaleName(event.target.value)}
                className="colormap-select"
              >
                {Object.entries(COLOR_SCALES).map(([key, { name }]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="color-range-row">
              <div className="field mini-field">
                <label htmlFor="color-range-min">Min</label>
                <input
                  id="color-range-min"
                  type="number"
                  step="0.1"
                  placeholder={dataValueRange?.min !== null ? dataValueRange.min.toFixed(2) : "auto"}
                  value={
                    localMin ||
                    (colorRangeMin !== null
                      ? colorRangeMin
                      : dataValueRange?.min !== null
                        ? dataValueRange.min.toFixed(2)
                        : "")
                  }
                  onChange={(event) => setLocalMin(event.target.value)}
                  onBlur={(event) => {
                    const val = parseFloat(event.target.value);
                    if (!Number.isNaN(val)) actions.setColorRange(val, colorRangeMax);
                    setLocalMin("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      const val = parseFloat(event.target.value);
                      if (!Number.isNaN(val)) actions.setColorRange(val, colorRangeMax);
                      setLocalMin("");
                      event.target.blur();
                    }
                  }}
                />
              </div>
              <div className="field mini-field">
                <label htmlFor="color-range-max">Max</label>
                <input
                  id="color-range-max"
                  type="number"
                  step="0.1"
                  placeholder={dataValueRange?.max !== null ? dataValueRange.max.toFixed(2) : "auto"}
                  value={
                    localMax ||
                    (colorRangeMax !== null
                      ? colorRangeMax
                      : dataValueRange?.max !== null
                        ? dataValueRange.max.toFixed(2)
                        : "")
                  }
                  onChange={(event) => setLocalMax(event.target.value)}
                  onBlur={(event) => {
                    const val = parseFloat(event.target.value);
                    if (!Number.isNaN(val)) actions.setColorRange(colorRangeMin, val);
                    setLocalMax("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      const val = parseFloat(event.target.value);
                      if (!Number.isNaN(val)) actions.setColorRange(colorRangeMin, val);
                      setLocalMax("");
                      event.target.blur();
                    }
                  }}
                />
              </div>
            </div>
            <button type="button" className="reset-range-btn" onClick={actions.resetColorRange}>
              Reset Range
            </button>
          </div>
        )}

        {categories && categories.length > 0 && (
          <div className="control-section category-section">
            <div className="section-label">Category Colors</div>
            <div className="category-toolbar">
              <button
                type="button"
                className="small-btn"
                onClick={() => handleVisibleCategoriesChange(null)}
                title="Show all categories"
              >
                Show all
              </button>
              <button
                type="button"
                className="small-btn danger"
                onClick={() => handleVisibleCategoriesChange([])}
                title="Hide all categories"
              >
                Hide all
              </button>
            </div>
            <div className="category-list">
              {categories.map((cat, index) => {
                const catLabel = String(cat);
                const currentColor = rgbArrayToHex(
                  resolveCategoryColor(catLabel, index, customCategoryColors, defaultCategoryColors)
                );
                const checked = visibleSet ? visibleSet.has(catLabel) : true;

                return (
                  <div key={catLabel} className="category-item">
                    <div className="category-visibility-toggle">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (!normalizedCategories.length) return;
                          const nextVisible =
                            visibleSet === null
                              ? new Set(normalizedCategories)
                              : new Set(visibleSet);
                          if (event.target.checked) {
                            nextVisible.add(catLabel);
                          } else {
                            nextVisible.delete(catLabel);
                          }
                          if (nextVisible.size === normalizedCategories.length) {
                            handleVisibleCategoriesChange(null);
                            return;
                          }
                          handleVisibleCategoriesChange(Array.from(nextVisible));
                        }}
                        aria-label={`Toggle category ${catLabel}`}
                      />
                    </div>
                    <div className="category-color-picker">
                      <input
                        type="color"
                        value={currentColor}
                        onChange={(event) =>
                          actions.setCustomCategoryColors({
                            ...customCategoryColors,
                            [catLabel]: event.target.value,
                          })
                        }
                      />
                    </div>
                    <span className="category-label" title={catLabel}>
                      {catLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-card">
        <div className="sidebar-subtitle">Cell selection</div>
        <div className="selection-content">
          {selectedIds.length === 0 ? (
            <div className="empty-state">
              No cells selected. Use the lasso tool to choose cells.
            </div>
          ) : (
            <div className="selection-info">
              <div className="selection-count">
                <strong>{selectedIds.length}</strong> cells selected
              </div>
              <div className="selection-actions">
                <button
                  type="button"
                  className="download-btn"
                  onClick={onDownloadSelection}
                  title="Download selected cell IDs as a text file"
                >
                  Download cell IDs
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="control-section point-scale-section">
          <div className="section-label">Point Size Scale</div>
          <div className="field slider-field">
            <label htmlFor="selected-point-scale">
              Selected {Math.round(selectedPointScale * 100)}%
            </label>
            <input
              id="selected-point-scale"
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={selectedPointScale}
              onChange={(event) => actions.setSelectedPointScale(parseFloat(event.target.value))}
            />
          </div>
          <div className="field slider-field">
            <label htmlFor="unselected-point-scale">
              Unselected {Math.round(unselectedPointScale * 100)}%
            </label>
            <input
              id="unselected-point-scale"
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={unselectedPointScale}
              onChange={(event) => actions.setUnselectedPointScale(parseFloat(event.target.value))}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}

ControlPanel.propTypes = {
  embeddings: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      dimensions: PropTypes.number,
      key: PropTypes.string,
    })
  ),
  selectedEmbedding: PropTypes.string,
  onSelectEmbedding: PropTypes.func.isRequired,
  obsAttributes: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      label: PropTypes.string,
      kind: PropTypes.string,
    })
  ),
  selectedObs: PropTypes.string,
  onSelectObs: PropTypes.func.isRequired,
  geneOptions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      symbol: PropTypes.string,
      metadata: PropTypes.object,
    })
  ),
  categories: PropTypes.arrayOf(PropTypes.string),
  visibleCategories: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.string),
    PropTypes.oneOf([null]),
  ]),
  defaultCategoryColors: PropTypes.object,
  dataset: PropTypes.shape({
    name: PropTypes.string,
    cellCount: PropTypes.number,
    geneCount: PropTypes.number,
  }),
  onDownloadSelection: PropTypes.func,
  isContinuousMode: PropTypes.bool,
  dataValueRange: PropTypes.shape({
    min: PropTypes.number,
    max: PropTypes.number,
  }),
};
