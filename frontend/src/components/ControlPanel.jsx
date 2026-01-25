import PropTypes from "prop-types";
import { useState } from "react";
import { PALETTE, COLOR_SCALES } from "../utils/colors";



export default function ControlPanel({
  embeddings,
  selectedEmbedding,
  onSelectEmbedding,
  obsAttributes,
  colorMode,
  onColorModeChange,
  selectedObs,
  onSelectObs,
  geneInput,
  onGeneInputChange,
  onApplyGene,
  activeGene,
  geneOptions,
  sampleFraction,
  onSampleFractionChange,
  pointSize,
  onPointSizeChange,
  pointOpacity,
  onPointOpacityChange,
  pointEdgeWidth,
  onPointEdgeWidthChange,
  pointEdgeColor,
  onPointEdgeColorChange,
  categories,
  visibleCategories,
  onVisibleCategoriesChange,
  customCategoryColors,
  defaultCategoryColors,
  onCustomCategoryColorChange,
  dataset,
  selectedIds,
  onDownloadSelection,
  selectedPointScale,
  onSelectedPointScaleChange,
  unselectedPointScale,
  onUnselectedPointScaleChange,
  colorScaleName,
  onColorScaleChange,
  colorRangeMin,
  colorRangeMax,
  onColorRangeChange,
  onResetColorRange,
  isContinuousMode,
  dataValueRange,
}) {
  // Local state for color range inputs
  const [localMin, setLocalMin] = useState("");
  const [localMax, setLocalMax] = useState("");
  const formatNumber = (value) => {
    if (typeof value !== "number" || Number.isNaN(value)) return "—";
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const handleModeChange = (mode) => () => {
    onColorModeChange(mode);
  };

  const handleGeneSelect = (event) => {
    const value = event.target.value || "";
    onGeneInputChange(value);
    if (value) {
      onApplyGene(value);
    }
  };

  const handleGeneSubmit = (event) => {
    event.preventDefault();
    onApplyGene();
  };

  const datasetName = dataset?.name || "Dataset";
  const datasetStats = [
    { label: "Cells", value: formatNumber(dataset?.cellCount) },
    { label: "Features", value: formatNumber(dataset?.geneCount) },
  ];

  const continuousAttributes = obsAttributes.filter((attribute) => attribute.kind === "numeric");
  const categoricalAttributes = obsAttributes.filter((attribute) => attribute.kind !== "numeric");
  const samplingPercent = Math.round((sampleFraction || 0) * 100);
  const normalizedCategories = Array.isArray(categories) ? categories.filter(Boolean).map(String) : [];
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
            onClick={handleModeChange("obs")}
          >
            Attributes
          </button>
          <button
            type="button"
            className={colorMode === "gene" ? "active" : ""}
            onClick={handleModeChange("gene")}
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
                const secondary = gene.symbol && gene.symbol !== gene.name ? gene.name : gene.metadata?.metabolites;
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
              onChange={(event) => onSampleFractionChange(parseFloat(event.target.value))}
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
              onChange={(event) => onPointSizeChange(parseInt(event.target.value, 10))}
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
              onChange={(event) => onPointOpacityChange(parseFloat(event.target.value))}
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
              onChange={(event) => onPointEdgeWidthChange(parseFloat(event.target.value))}
            />
          </div>
          <div className="field color-field-row">
            <label htmlFor="point-edge-color">Color</label>
            <div className="color-input-wrapper">
              <input
                id="point-edge-color"
                type="color"
                value={pointEdgeColor}
                onChange={(event) => onPointEdgeColorChange(event.target.value)}
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
                onChange={(e) => onColorScaleChange(e.target.value)}
                className="colormap-select"
              >
                {Object.entries(COLOR_SCALES).map(([key, { name }]) => (
                  <option key={key} value={key}>{name}</option>
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
                  value={localMin || (colorRangeMin !== null ? colorRangeMin : (dataValueRange?.min !== null ? dataValueRange.min.toFixed(2) : ""))}
                  onChange={(e) => setLocalMin(e.target.value)}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      onColorRangeChange(val, colorRangeMax);
                    }
                    setLocalMin("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) {
                        onColorRangeChange(val, colorRangeMax);
                      }
                      setLocalMin("");
                      e.target.blur();
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
                  value={localMax || (colorRangeMax !== null ? colorRangeMax : (dataValueRange?.max !== null ? dataValueRange.max.toFixed(2) : ""))}
                  onChange={(e) => setLocalMax(e.target.value)}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      onColorRangeChange(colorRangeMin, val);
                    }
                    setLocalMax("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) {
                        onColorRangeChange(colorRangeMin, val);
                      }
                      setLocalMax("");
                      e.target.blur();
                    }
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              className="reset-range-btn"
              onClick={onResetColorRange}
            >
              Reset Range
            </button>
          </div>
        )}

        {categories && categories.length > 0 && (
          <div className="control-section category-section">
            <div className="section-label">Category Colors</div>
            {typeof onVisibleCategoriesChange === "function" ? (
              <div className="category-toolbar">
                <button
                  type="button"
                  className="small-btn"
                  onClick={() => onVisibleCategoriesChange(null)}
                  title="Show all categories"
                >
                  Show all
                </button>
                <button
                  type="button"
                  className="small-btn danger"
                  onClick={() => onVisibleCategoriesChange([])}
                  title="Hide all categories"
                >
                  Hide all
                </button>
              </div>
            ) : null}
            <div className="category-list">
              {categories.map((cat, index) => {
                const catLabel = String(cat);
                const defaultColor = PALETTE[index % PALETTE.length];
                const hexDefault = `#${defaultColor[0].toString(16).padStart(2, '0')}${defaultColor[1].toString(16).padStart(2, '0')}${defaultColor[2].toString(16).padStart(2, '0')}`;

                const backendColor = defaultCategoryColors?.[catLabel];
                const baseColor = backendColor || hexDefault;
                const currentColor = customCategoryColors[catLabel] || baseColor;
                const checked = visibleSet ? visibleSet.has(catLabel) : true;

                return (
                  <div key={catLabel} className="category-item">
                    {typeof onVisibleCategoriesChange === "function" ? (
                      <div className="category-visibility-toggle">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            if (!normalizedCategories.length) return;
                            const nextAll = normalizedCategories;
                            let nextVisible;
                            if (visibleSet === null) {
                              // Start from "all visible" and remove one.
                              nextVisible = new Set(nextAll);
                            } else {
                              nextVisible = new Set(visibleSet);
                            }
                            if (isChecked) {
                              nextVisible.add(catLabel);
                            } else {
                              nextVisible.delete(catLabel);
                            }
                            // If all visible, store null to represent "no filtering".
                            if (nextVisible.size === nextAll.length) {
                              onVisibleCategoriesChange(null);
                              return;
                            }
                            onVisibleCategoriesChange(Array.from(nextVisible));
                          }}
                          aria-label={`Toggle category ${catLabel}`}
                        />
                      </div>
                    ) : null}
                    <div className="category-color-picker">
                      <input
                        type="color"
                        value={currentColor}
                        onChange={(e) => {
                          onCustomCategoryColorChange({
                            ...customCategoryColors,
                            [catLabel]: e.target.value
                          });
                        }}
                      />
                    </div>
                    <span className="category-label" title={catLabel}>{catLabel}</span>
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
            <div className="empty-state">No cells selected. Use the lasso tool to choose cells.</div>
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
            <label htmlFor="selected-point-scale">Selected {Math.round(selectedPointScale * 100)}%</label>
            <input
              id="selected-point-scale"
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={selectedPointScale}
              onChange={(event) => onSelectedPointScaleChange(parseFloat(event.target.value))}
            />
          </div>
          <div className="field slider-field">
            <label htmlFor="unselected-point-scale">Unselected {Math.round(unselectedPointScale * 100)}%</label>
            <input
              id="unselected-point-scale"
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={unselectedPointScale}
              onChange={(event) => onUnselectedPointScaleChange(parseFloat(event.target.value))}
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
      label: PropTypes.string.isRequired,
      kind: PropTypes.string,
      dtype: PropTypes.string,
      cardinality: PropTypes.number,
    })
  ),
  colorMode: PropTypes.oneOf(["obs", "gene"]).isRequired,
  onColorModeChange: PropTypes.func.isRequired,
  selectedObs: PropTypes.string,
  onSelectObs: PropTypes.func.isRequired,
  geneInput: PropTypes.string.isRequired,
  onGeneInputChange: PropTypes.func.isRequired,
  onApplyGene: PropTypes.func.isRequired,
  activeGene: PropTypes.string,
  geneOptions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      symbol: PropTypes.string,
      metadata: PropTypes.object,
    })
  ),
  sampleFraction: PropTypes.number.isRequired,
  onSampleFractionChange: PropTypes.func,
  pointSize: PropTypes.number.isRequired,
  onPointSizeChange: PropTypes.func.isRequired,
  pointOpacity: PropTypes.number,
  onPointOpacityChange: PropTypes.func,
  pointEdgeWidth: PropTypes.number,
  onPointEdgeWidthChange: PropTypes.func,
  pointEdgeColor: PropTypes.string,
  onPointEdgeColorChange: PropTypes.func,
  categories: PropTypes.arrayOf(PropTypes.string),
  visibleCategories: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.string), PropTypes.oneOf([null])]),
  onVisibleCategoriesChange: PropTypes.func,
  customCategoryColors: PropTypes.object,
  defaultCategoryColors: PropTypes.object,
  onCustomCategoryColorChange: PropTypes.func,
  dataset: PropTypes.shape({
    name: PropTypes.string,
    cellCount: PropTypes.number,
    geneCount: PropTypes.number,
  }),
  selectedIds: PropTypes.arrayOf(PropTypes.string),
  onDownloadSelection: PropTypes.func,
  selectedPointScale: PropTypes.number,
  onSelectedPointScaleChange: PropTypes.func,
  unselectedPointScale: PropTypes.number,
  onUnselectedPointScaleChange: PropTypes.func,
  colorScaleName: PropTypes.string,
  onColorScaleChange: PropTypes.func,
  colorRangeMin: PropTypes.number,
  colorRangeMax: PropTypes.number,
  onColorRangeChange: PropTypes.func,
  onResetColorRange: PropTypes.func,
  isContinuousMode: PropTypes.bool,
  dataValueRange: PropTypes.shape({
    min: PropTypes.number,
    max: PropTypes.number,
  }),
};

ControlPanel.defaultProps = {
  embeddings: [],
  selectedEmbedding: null,
  obsAttributes: [],
  selectedObs: null,
  activeGene: "",
  geneOptions: [],
  sampleFraction: 0.25,
  onSampleFractionChange: () => { },
  pointSize: 4,
  pointOpacity: 1.0,
  onPointOpacityChange: () => { },
  pointEdgeWidth: 0,
  onPointEdgeWidthChange: () => { },
  pointEdgeColor: "#000000",
  onPointEdgeColorChange: () => { },
  categories: [],
  visibleCategories: null,
  onVisibleCategoriesChange: null,
  customCategoryColors: {},
  defaultCategoryColors: {},
  onCustomCategoryColorChange: () => { },
  dataset: null,
  selectedIds: [],
  onDownloadSelection: () => { },
  selectedPointScale: 1.0,
  onSelectedPointScaleChange: () => { },
  unselectedPointScale: 1.0,
  onUnselectedPointScaleChange: () => { },
  colorScaleName: "turbo",
  onColorScaleChange: () => { },
  colorRangeMin: null,
  colorRangeMax: null,
  onColorRangeChange: () => { },
  onResetColorRange: () => { },
  isContinuousMode: false,
  dataValueRange: { min: null, max: null },
};
