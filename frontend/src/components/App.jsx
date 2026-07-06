import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import Header from "./Header.jsx";
import ControlPanel from "./ControlPanel.jsx";
import AssistantPanel from "./AssistantPanel.jsx";
import SessionDebugPanel from "./SessionDebugPanel.jsx";

// Code-split the heavy workspace views so deck.gl (~1.2 MB) and Plotly (~4.8 MB)
// stay out of the initial bundle and load only when their tab is shown.
const EmbeddingView = lazy(() => import("./EmbeddingView.jsx"));
const DiffExprView = lazy(() => import("./DiffExprView.jsx"));
const Drug2CellView = lazy(() => import("./Drug2CellView.jsx"));
import { useAssistantChat } from "../hooks/useAssistantChat.js";
import { useDataset } from "../hooks/useDataset.js";
import { useEmbeddingData } from "../hooks/useEmbeddingData.js";
import { useDraggable } from "../hooks/useDraggable.js";
import { useViz } from "../state/VizContext.jsx";
import { getPointCategoryLabel } from "../utils/points.js";
import { downloadText } from "../utils/download.js";
import DatasetLoadError from "./DatasetLoadError.jsx";

const WORKSPACES = [
  { id: "canvas", label: "Cell Panorama" },
  { id: "deg", label: "Gene Cartography" },
  { id: "drug2cell", label: "Drug2Cell Bridge" },
];

export default function App() {
  const { state: viz, actions } = useViz();
  const {
    dataset,
    hasBackendDataset,
    isLoading: datasetLoading,
    isError: datasetError,
    error: datasetErrorObj,
    retry: retryDataset,
    obsAttributes,
    geneOptions,
    embeddings,
    selectedEmbedding,
    setSelectedEmbedding,
    selectedObs,
    setSelectedObs,
  } = useDataset();

  const [chatOpen, setChatOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState("canvas");

  const { embeddingData, embeddingLoading } = useEmbeddingData({
    hasBackendDataset,
    dataset,
    selectedEmbedding,
    colorMode: viz.colorMode,
    selectedObs,
    activeGene: viz.activeGene,
    obsAttributes,
    sampleFraction: viz.sampleFraction,
  });

  const canvasRef = useRef(null);
  const { position: buttonPos, isDragging, getHasDragged, handleDragStart } = useDraggable({
    initialX: 16,
    initialY: 16,
    containerRef: canvasRef,
  });

  const handleButtonClick = useCallback(() => {
    if (!getHasDragged()) setChatOpen((open) => !open);
  }, [getHasDragged]);

  // Apply assistant annotations (categorical filters + deterministic UI actions)
  // exactly once per new assistant message.
  const handleAssistantMessage = useCallback(
    (message) => {
      const annotations = message?.annotations;
      if (!annotations) return;

      if (Array.isArray(annotations.filters) && annotations.filters.length) {
        const grouped = {};
        annotations.filters.forEach((filter) => {
          const dim = String(filter?.dimension || "").trim();
          const value = String(filter?.value || "").trim();
          if (!dim || !value) return;
          (grouped[dim] ||= new Set()).add(value);
        });
        const merged = Object.fromEntries(
          Object.entries(grouped).map(([dim, values]) => [dim, Array.from(values)])
        );
        if (Object.keys(merged).length) actions.mergeVisibleCategories(merged);
      }

      if (Array.isArray(annotations.actions)) {
        annotations.actions.forEach((action) => {
          const type = String(action?.type || "").trim();
          const value = String(action?.value || "").trim();
          if (!type) return;
          switch (type) {
            case "set_color_mode":
              if (value) actions.setColorMode(value);
              break;
            case "set_gene":
              if (value) actions.setActiveGene(value);
              break;
            case "set_active_workspace":
              if (value) setActiveWorkspace(value);
              break;
            case "set_embedding":
              if (value) setSelectedEmbedding(value);
              break;
            default:
              break;
          }
        });
      }
    },
    [actions, setSelectedEmbedding]
  );

  const { messages, isLoading, sendMessage } = useAssistantChat({
    onAssistantMessage: handleAssistantMessage,
  });

  // Reset selection whenever the underlying view or dataset changes.
  useEffect(() => {
    actions.clearSelection();
  }, [
    actions,
    selectedEmbedding,
    selectedObs,
    dataset,
    viz.colorMode,
    viz.activeGene,
    viz.sampleFraction,
    viz.visibleCategoriesByField,
  ]);

  const categories = useMemo(() => {
    if (embeddingData.colorMode !== "categorical" || !embeddingData.points.length) return [];
    const cats = new Set();
    embeddingData.points.forEach((point) => cats.add(getPointCategoryLabel(point)));
    return Array.from(cats).sort();
  }, [embeddingData.points, embeddingData.colorMode]);

  const visibleCategories = useMemo(() => {
    if (!selectedObs) return null;
    const entry = viz.visibleCategoriesByField[selectedObs];
    return entry === undefined ? null : entry;
  }, [viz.visibleCategoriesByField, selectedObs]);

  const filteredEmbeddingPoints = useMemo(() => {
    if (embeddingData.colorMode !== "categorical") return embeddingData.points;
    if (!Array.isArray(embeddingData.points) || !embeddingData.points.length) {
      return embeddingData.points;
    }
    if (visibleCategories === null) return embeddingData.points;
    const allowed = new Set(Array.isArray(visibleCategories) ? visibleCategories.map(String) : []);
    return embeddingData.points.filter((point) =>
      allowed.has(String(getPointCategoryLabel(point)))
    );
  }, [embeddingData.points, embeddingData.colorMode, visibleCategories]);

  const dataValueRange = useMemo(() => {
    if (embeddingData.colorMode !== "continuous" || !embeddingData.points.length) {
      return { min: null, max: null };
    }
    const values = embeddingData.points
      .map((point) => (typeof point.value === "number" ? point.value : null))
      .filter((value) => value !== null && Number.isFinite(value));
    if (!values.length) return { min: null, max: null };
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [embeddingData.points, embeddingData.colorMode]);

  const defaultCategoryColors = useMemo(() => {
    if (viz.colorMode !== "obs" || !selectedObs || !obsAttributes) return {};
    const attr = obsAttributes.find((attribute) => attribute.name === selectedObs);
    return attr?.colors || {};
  }, [viz.colorMode, selectedObs, obsAttributes]);

  // Compact view descriptor sent to the assistant. Deliberately excludes
  // rendering-only fields and the (potentially huge) selectedIds — the backend
  // only reads `filters`, and none of the point-style/selection state is useful
  // context for it.
  const datasetContext = useMemo(
    () => ({
      datasetId: dataset?.id,
      activeEmbedding: selectedEmbedding || dataset?.activeEmbedding,
      embedding: selectedEmbedding,
      colorMode: viz.colorMode,
      colorSelection: viz.colorMode === "gene" ? viz.activeGene : selectedObs,
    }),
    [dataset, selectedEmbedding, selectedObs, viz.colorMode, viz.activeGene]
  );

  const handleDownloadSelection = useCallback(() => {
    if (!viz.selectedIds.length) return;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    downloadText(viz.selectedIds.join("\n"), `selected_cells_${timestamp}.txt`);
  }, [viz.selectedIds]);

  const handleViewGene = useCallback(
    (gene) => {
      const match = geneOptions?.find(
        (opt) =>
          (opt.name && opt.name.toLowerCase() === gene.toLowerCase()) ||
          (opt.symbol && opt.symbol.toLowerCase() === gene.toLowerCase())
      );
      actions.applyGene(match ? match.symbol || match.name : gene);
      setActiveWorkspace("canvas");
    },
    [geneOptions, actions]
  );

  const handleViewSignature = useCallback(
    (signatureName) => {
      setSelectedObs(`score_${signatureName}`);
      actions.setColorMode("obs");
      setActiveWorkspace("canvas");
    },
    [setSelectedObs, actions]
  );

  const handleSelectObs = useCallback(
    (value) => {
      setSelectedObs(value);
      if (viz.colorMode !== "gene") actions.setColorMode("obs");
    },
    [setSelectedObs, viz.colorMode, actions]
  );

  const handleSwitchObsDimension = useCallback(
    (dim) => {
      if (!dim) return;
      setSelectedObs(dim);
      actions.setColorMode("obs");
      setActiveWorkspace("canvas");
    },
    [setSelectedObs, actions]
  );

  return (
    <div className="app-shell">
      {import.meta.env.DEV && <SessionDebugPanel />}
      <Header />
      {datasetError ? (
        <DatasetLoadError error={datasetErrorObj} onRetry={retryDataset} />
      ) : datasetLoading ? (
        <div className="app-status">Loading dataset…</div>
      ) : (
        <>
          <PanelGroup direction="horizontal" className="layout-root">
        <Panel defaultSize={22} minSize={16} collapsible>
          <ControlPanel
            embeddings={embeddings}
            selectedEmbedding={selectedEmbedding}
            onSelectEmbedding={setSelectedEmbedding}
            obsAttributes={obsAttributes}
            selectedObs={selectedObs}
            onSelectObs={handleSelectObs}
            geneOptions={geneOptions}
            dataset={dataset}
            categories={categories}
            visibleCategories={visibleCategories}
            defaultCategoryColors={defaultCategoryColors}
            isContinuousMode={embeddingData.colorMode === "continuous"}
            dataValueRange={dataValueRange}
            onDownloadSelection={handleDownloadSelection}
          />
        </Panel>
        <PanelResizeHandle className="resize-handle vertical" />
        <Panel defaultSize={78} minSize={50}>
          <div
            className="canvas-workspace"
            ref={canvasRef}
            style={{ display: "flex", flexDirection: "column" }}
          >
            <div className="workspace-tabs">
              {WORKSPACES.map((workspace) => (
                <button
                  key={workspace.id}
                  className={`workspace-tab ${activeWorkspace === workspace.id ? "active" : ""}`}
                  onClick={() => setActiveWorkspace(workspace.id)}
                >
                  {workspace.label}
                </button>
              ))}
            </div>

            <div className="workspace-content">
              <Suspense
                fallback={<div className="workspace-loading">Loading workspace…</div>}
              >
                {activeWorkspace === "canvas" ? (
                  <div className="embedding-pane full-height">
                    <EmbeddingView
                      embeddingName={
                        embeddingData.embeddingName ||
                        selectedEmbedding ||
                        dataset?.activeEmbedding
                      }
                      points={filteredEmbeddingPoints}
                      totalCells={embeddingData.totalCells}
                      colorMode={embeddingData.colorMode}
                      loading={embeddingLoading}
                      dimensions={embeddingData.dimensions}
                      defaultCategoryColors={defaultCategoryColors}
                    />
                  </div>
                ) : activeWorkspace === "deg" ? (
                  <DiffExprView
                    onViewGene={handleViewGene}
                    obsAttributes={obsAttributes}
                    onViewSignature={handleViewSignature}
                  />
                ) : (
                  <Drug2CellView obsAttributes={obsAttributes} />
                )}
              </Suspense>

              {/* Draggable Chat Toggle Button - kept inside the workspace */}
              <button
                className={`chat-toggle-btn ${chatOpen ? "open" : ""} ${isDragging ? "dragging" : ""}`}
                style={{ left: buttonPos.x, bottom: buttonPos.y }}
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
                onClick={handleButtonClick}
                aria-label={chatOpen ? "Close chat" : "Open chat"}
              >
                <span className="chat-toggle-icon">
                  {chatOpen ? (
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
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

      {/* Chat Drawer */}
      <div
        className={`chat-drawer-overlay ${chatOpen ? "visible" : ""}`}
        onClick={() => setChatOpen(false)}
      />
      <div className={`chat-drawer ${chatOpen ? "open" : ""}`}>
        <AssistantPanel
          messages={messages}
          isLoading={isLoading}
          onSend={sendMessage}
          datasetContext={datasetContext}
          activeObsDimension={selectedObs}
          onSwitchObsDimension={handleSwitchObsDimension}
          onClose={() => setChatOpen(false)}
        />
      </div>
        </>
      )}
    </div>
  );
}
