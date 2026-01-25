import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import Header from "./Header.jsx";
import ControlPanel from "./ControlPanel.jsx";
import EmbeddingView from "./EmbeddingView.jsx";
import DiffExprView from "./DiffExprView.jsx";
import Drug2CellView from "./Drug2CellView.jsx";
import AssistantPanel from "./AssistantPanel.jsx";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { useAssistantChat } from "../hooks/useAssistantChat.js";
import SessionDebugPanel from "./SessionDebugPanel.jsx";
import { useDataset } from "../hooks/useDataset.js";
import { useEmbeddingData } from "../hooks/useEmbeddingData.js";
import { useDraggable } from "../hooks/useDraggable.js";

export default function App() {
  const {
    dataset,
    resolvedDataset,
    hasBackendDataset,
    obsAttributes,
    geneOptions,
    embeddings,
    selectedEmbedding,
    setSelectedEmbedding,
    selectedObs,
    setSelectedObs,
  } = useDataset();

  const [colorMode, setColorMode] = useState("obs");
  const [geneInput, setGeneInput] = useState("");
  const [activeGene, setActiveGene] = useState("");
  const [sampleFraction, setSampleFraction] = useState(0.15);
  const [pointSize, setPointSize] = useState(2);
  const [pointOpacity, setPointOpacity] = useState(1.0);
  const [pointEdgeWidth, setPointEdgeWidth] = useState(0);
  const [pointEdgeColor, setPointEdgeColor] = useState("#000000");
  const [customCategoryColors, setCustomCategoryColors] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedPointScale, setSelectedPointScale] = useState(1.0);
  const [unselectedPointScale, setUnselectedPointScale] = useState(1.0);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState("canvas"); // "canvas", "deg", or "drug2cell"
  // Per-obs-field visible category whitelist for categorical visualization (null/undefined => show all).
  const [visibleCategoriesByField, setVisibleCategoriesByField] = useState({});

  // Colorbar control states (for continuous color mapping)
  const [colorScaleName, setColorScaleName] = useState("turbo");
  const [colorRangeMin, setColorRangeMin] = useState(null);
  const [colorRangeMax, setColorRangeMax] = useState(null);

  const { embeddingData, embeddingLoading } = useEmbeddingData({
    hasBackendDataset,
    dataset,
    selectedEmbedding,
    colorMode,
    selectedObs,
    activeGene,
    obsAttributes,
    sampleFraction,
  });

  const canvasRef = useRef(null);
  const { position: buttonPos, isDragging, hasDragged, handleDragStart } = useDraggable({
    initialX: 16,
    initialY: 16,
    containerRef: canvasRef,
  });

  const { messages, isLoading, sendMessage } = useAssistantChat();
  const lastAppliedFilterMessageIdRef = useRef(null);
  const lastAppliedActionMessageIdRef = useRef(null);

  const handleButtonClick = useCallback(() => {
    // Only toggle chat if we haven't dragged
    if (!hasDragged) {
      setChatOpen(!chatOpen);
    }
  }, [chatOpen, hasDragged]);

  // Handle derived effects
  useEffect(() => {
    setSelectedIds([]);
  }, [selectedEmbedding, colorMode, selectedObs, activeGene, dataset, sampleFraction, visibleCategoriesByField]);

  const getPointCategoryLabel = useCallback((point) => {
    if (!point) return "other";
    return point.label || point.cluster || "other";
  }, []);

  // Extract categories when in categorical mode
  const categories = useMemo(() => {
    if (embeddingData.colorMode !== "categorical" || !embeddingData.points.length) {
      return [];
    }
    const cats = new Set();
    embeddingData.points.forEach(p => {
      const label = getPointCategoryLabel(p);
      cats.add(label);
    });
    return Array.from(cats).sort();
  }, [embeddingData.points, embeddingData.colorMode, getPointCategoryLabel]);

  const visibleCategories = useMemo(() => {
    if (!selectedObs) return null;
    const entry = visibleCategoriesByField[selectedObs];
    return entry === undefined ? null : entry;
  }, [visibleCategoriesByField, selectedObs]);

  const filteredEmbeddingPoints = useMemo(() => {
    if (embeddingData.colorMode !== "categorical") return embeddingData.points;
    if (!Array.isArray(embeddingData.points) || !embeddingData.points.length) return embeddingData.points;
    if (visibleCategories === null) return embeddingData.points;

    const allowed = new Set(Array.isArray(visibleCategories) ? visibleCategories.map(String) : []);
    return embeddingData.points.filter((p) => allowed.has(String(getPointCategoryLabel(p))));
  }, [embeddingData.points, embeddingData.colorMode, visibleCategories, getPointCategoryLabel]);

  // Extract data range when in continuous mode
  const dataValueRange = useMemo(() => {
    if (embeddingData.colorMode !== "continuous" || !embeddingData.points.length) {
      return { min: null, max: null };
    }
    const values = embeddingData.points
      .map(p => (typeof p.value === "number" ? p.value : null))
      .filter(v => v !== null && Number.isFinite(v));
    if (!values.length) {
      return { min: null, max: null };
    }
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [embeddingData.points, embeddingData.colorMode]);

  // Extract default category colors from backend attributes
  const defaultCategoryColors = useMemo(() => {
    if (colorMode !== "obs" || !selectedObs || !obsAttributes) return {};
    const attr = obsAttributes.find(a => a.name === selectedObs);
    return attr?.colors || {};
  }, [colorMode, selectedObs, obsAttributes]);

  // Apply assistant-provided filters as a categorical visibility whitelist (frontend-only visualization).
  useEffect(() => {
    const last = [...messages]
      .reverse()
      .find((m) => m?.role === "assistant" && Array.isArray(m?.annotations?.filters) && m.annotations.filters.length);
    if (!last) return;
    if (lastAppliedFilterMessageIdRef.current === last.id) return;

    const grouped = new Map();
    last.annotations.filters.forEach((f) => {
      const dim = String(f?.dimension || "").trim();
      const value = String(f?.value || "").trim();
      if (!dim || !value) return;
      if (!grouped.has(dim)) grouped.set(dim, new Set());
      grouped.get(dim).add(value);
    });

    if (grouped.size) {
      setVisibleCategoriesByField((prev) => {
        const next = { ...(prev || {}) };
        grouped.forEach((values, dim) => {
          next[dim] = Array.from(values);
        });
        return next;
      });
    }

    lastAppliedFilterMessageIdRef.current = last.id;
  }, [messages]);

  // Apply assistant-provided actions to control the UI deterministically.
  useEffect(() => {
    const last = [...messages]
      .reverse()
      .find((m) => m?.role === "assistant" && Array.isArray(m?.annotations?.actions) && m.annotations.actions.length);
    if (!last) return;
    if (lastAppliedActionMessageIdRef.current === last.id) return;

    const actions = last.annotations.actions;
    actions.forEach((action) => {
      const type = String(action?.type || "").trim();
      const value = String(action?.value || "").trim();
      if (!type) return;

      switch (type) {
        case "set_color_mode":
          if (value) setColorMode(value);
          return;
        case "set_gene":
          if (!value) return;
          setActiveGene(value);
          setGeneInput(value);
          return;
        case "set_active_workspace":
          if (value) setActiveWorkspace(value);
          return;
        case "set_embedding":
          if (value) setSelectedEmbedding(value);
          return;
        default:
          return;
      }
    });

    lastAppliedActionMessageIdRef.current = last.id;
  }, [messages]);

  const datasetContext = useMemo(
    () => ({
      datasetId: dataset?.id,
      activeEmbedding: selectedEmbedding || dataset?.activeEmbedding,
      colorMode,
      colorSelection: colorMode === "gene" ? activeGene : selectedObs,
      embedding: selectedEmbedding,
      sampleFraction,
      pointSize,
      pointOpacity,
      pointEdgeWidth,
      pointEdgeColor,
      selectedIds,
    }),
    [dataset, colorMode, activeGene, selectedObs, selectedEmbedding, sampleFraction, pointSize, pointOpacity, pointEdgeWidth, pointEdgeColor, selectedIds]
  );

  const handleGeneApply = (value) => {
    const nextValue = typeof value === "string" ? value : geneInput;
    const trimmed = nextValue.trim();
    if (!trimmed) return;
    setActiveGene(trimmed);
    setGeneInput(trimmed);
    setColorMode("gene");
  };

  const handleEmbeddingSelect = (value) => {
    if (!value) return;
    setSelectedEmbedding(value);
  };

  const handleSampleFractionChange = (value) => {
    const numeric = Math.max(0.05, Math.min(1, value));
    setSampleFraction(parseFloat(numeric.toFixed(2)));
  };

  const handlePointSizeChange = (value) => {
    const numeric = Math.max(1, Math.min(10, value));
    setPointSize(numeric);
  };

  const handlePointOpacityChange = (value) => {
    const numeric = Math.max(0.1, Math.min(1, value));
    setPointOpacity(parseFloat(numeric.toFixed(1)));
  };

  const handlePointEdgeWidthChange = (value) => {
    const numeric = Math.max(0, Math.min(2, value));
    setPointEdgeWidth(parseFloat(numeric.toFixed(1)));
  };

  const handlePointEdgeColorChange = (value) => {
    setPointEdgeColor(value);
  };

  const handleColorScaleChange = (value) => {
    setColorScaleName(value);
  };

  const handleColorRangeChange = (min, max) => {
    setColorRangeMin(min);
    setColorRangeMax(max);
  };

  const handleResetColorRange = () => {
    setColorRangeMin(null);
    setColorRangeMax(null);
  };

  const handleDownloadSelection = async () => {
    if (!selectedIds.length) return;

    try {
      // Build the text file content
      const content = selectedIds.join('\n');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `selected_cells_${timestamp}.txt`;

      // Create and download the file
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      console.log(`Saved ${selectedIds.length} cell IDs to ${filename}`);
    } catch (error) {
      console.error('Failed to download cell IDs:', error);
    }
  };

  const handleSelectionChange = (ids) => {
    setSelectedIds(ids);
  };

  const handleViewGene = (gene) => {
    // Robustly find the matching gene in options to ensure UI consistency
    const match = geneOptions?.find(opt =>
      (opt.name && opt.name.toLowerCase() === gene.toLowerCase()) ||
      (opt.symbol && opt.symbol.toLowerCase() === gene.toLowerCase())
    );

    const canonicalName = match ? (match.symbol || match.name) : gene;

    setActiveGene(canonicalName);
    setGeneInput(canonicalName);
    setColorMode("gene");
    setActiveWorkspace("canvas");
  };

  const handleViewSignature = (signatureName) => {
    // When viewing a signature score in embedding, we use the obs column that 
    // sc.tl.score_genes created (e.g., "score_signature")
    const scoreColumn = `score_${signatureName}`;
    setSelectedObs(scoreColumn);
    setColorMode("obs");
    setActiveWorkspace("canvas");
  };

  return (
    <div className="app-shell">
      {import.meta.env.DEV && <SessionDebugPanel />}
      <Header />
      <PanelGroup direction="horizontal" className="layout-root">
        <Panel defaultSize={22} minSize={16} collapsible>
          <ControlPanel
            embeddings={embeddings}
            selectedEmbedding={selectedEmbedding}
            onSelectEmbedding={handleEmbeddingSelect}
            obsAttributes={obsAttributes}
            colorMode={colorMode}
            onColorModeChange={setColorMode}
            selectedObs={selectedObs}
            onSelectObs={(value) => {
              setSelectedObs(value);
              if (colorMode !== "gene") setColorMode("obs");
            }}
            geneInput={geneInput}
            onGeneInputChange={setGeneInput}
            onApplyGene={handleGeneApply}
            activeGene={activeGene}
            geneOptions={geneOptions}
            sampleFraction={sampleFraction}
            onSampleFractionChange={handleSampleFractionChange}
            pointSize={pointSize}
            onPointSizeChange={handlePointSizeChange}
            pointOpacity={pointOpacity}
            onPointOpacityChange={handlePointOpacityChange}
            pointEdgeWidth={pointEdgeWidth}
            onPointEdgeWidthChange={handlePointEdgeWidthChange}
            pointEdgeColor={pointEdgeColor}
            onPointEdgeColorChange={handlePointEdgeColorChange}
            categories={categories}
            visibleCategories={visibleCategories}
            onVisibleCategoriesChange={(nextVisible) => {
              if (!selectedObs) return;
              setVisibleCategoriesByField((prev) => ({
                ...(prev || {}),
                [selectedObs]: nextVisible,
              }));
            }}
            defaultCategoryColors={defaultCategoryColors}
            customCategoryColors={customCategoryColors}
            onCustomCategoryColorChange={setCustomCategoryColors}
            dataset={resolvedDataset}
            selectedIds={selectedIds}
            onDownloadSelection={handleDownloadSelection}
            selectedPointScale={selectedPointScale}
            onSelectedPointScaleChange={setSelectedPointScale}
            unselectedPointScale={unselectedPointScale}
            onUnselectedPointScaleChange={setUnselectedPointScale}
            colorScaleName={colorScaleName}
            onColorScaleChange={handleColorScaleChange}
            colorRangeMin={colorRangeMin}
            colorRangeMax={colorRangeMax}
            onColorRangeChange={handleColorRangeChange}
            onResetColorRange={handleResetColorRange}
            isContinuousMode={embeddingData.colorMode === "continuous"}
            dataValueRange={dataValueRange}
          />
        </Panel>
        <PanelResizeHandle className="resize-handle vertical" />
        <Panel defaultSize={78} minSize={50}>
          <div className="canvas-workspace" ref={canvasRef} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="workspace-tabs">
              <button
                className={`workspace-tab ${activeWorkspace === "canvas" ? "active" : ""}`}
                onClick={() => setActiveWorkspace("canvas")}
              >
                Cell Panorama
              </button>
              <button
                className={`workspace-tab ${activeWorkspace === "deg" ? "active" : ""}`}
                onClick={() => setActiveWorkspace("deg")}
              >
                Gene Cartography
              </button>
              <button
                className={`workspace-tab ${activeWorkspace === "drug2cell" ? "active" : ""}`}
                onClick={() => setActiveWorkspace("drug2cell")}
              >
                Drug2Cell Bridge
              </button>
            </div>

            <div className="workspace-content">
              {activeWorkspace === "canvas" ? (
                <div className="embedding-pane full-height">
                  <EmbeddingView
                    embeddingName={embeddingData.embeddingName || selectedEmbedding || resolvedDataset.activeEmbedding}
                    points={filteredEmbeddingPoints}
                    totalCells={embeddingData.totalCells}
                    colorMode={embeddingData.colorMode}
                    loading={embeddingLoading}
                    dimensions={embeddingData.dimensions}
                    pointSize={pointSize}
                    pointOpacity={pointOpacity}
                    pointEdgeWidth={pointEdgeWidth}
                    pointEdgeColor={pointEdgeColor}
                    defaultCategoryColors={defaultCategoryColors}
                    customCategoryColors={customCategoryColors}
                    onSelectionChange={handleSelectionChange}
                    selectedIds={selectedIds}
                    selectedPointScale={selectedPointScale}
                    unselectedPointScale={unselectedPointScale}
                    colorScaleName={colorScaleName}
                    colorRangeMin={colorRangeMin}
                    colorRangeMax={colorRangeMax}
                  />
                </div>
              ) : activeWorkspace === "deg" ? (
                <DiffExprView
                  selectedIds={selectedIds}
                  onViewGene={handleViewGene}
                  obsAttributes={obsAttributes}
                  onViewSignature={handleViewSignature}
                />
              ) : (
                <Drug2CellView
                  obsAttributes={obsAttributes}
                />
              )}

              {/* Draggable Chat Toggle Button - keep it in workspace */}
              <button
                className={`chat-toggle-btn ${chatOpen ? "open" : ""} ${isDragging ? "dragging" : ""}`}
                style={{
                  left: buttonPos.x,
                  bottom: buttonPos.y,
                }}
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
                onClick={handleButtonClick}
                aria-label={chatOpen ? "Close chat" : "Open chat"}
              >
                <span className="chat-toggle-icon">
                  {chatOpen ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                  )}
                </span>
                {!chatOpen && <span className="chat-toggle-label">AI Assistant</span>}
              </button>
            </div>
          </div>
        </Panel>
      </PanelGroup>

      {/* Chat Drawer Overlay */}
      <div
        className={`chat-drawer-overlay ${chatOpen ? "visible" : ""}`}
        onClick={() => setChatOpen(false)}
      />

      {/* Chat Drawer */}
      <div className={`chat-drawer ${chatOpen ? "open" : ""}`}>
        <AssistantPanel
          messages={messages}
          isLoading={isLoading}
          onSend={sendMessage}
          datasetContext={datasetContext}
          activeObsDimension={selectedObs}
          onSwitchObsDimension={(dim) => {
            if (!dim) return;
            setSelectedObs(dim);
            setColorMode("obs");
            setActiveWorkspace("canvas");
          }}
          onClose={() => setChatOpen(false)}
        />
      </div>
    </div>
  );
}
