import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ControlPanel from "./ControlPanel.jsx";
import { VizProvider } from "../state/VizContext.jsx";

function renderPanel(overrides = {}) {
  const props = {
    embeddings: [{ name: "umap", dimensions: 2 }],
    selectedEmbedding: "umap",
    onSelectEmbedding: () => {},
    obsAttributes: [{ name: "leiden", label: "Leiden", kind: "categorical" }],
    selectedObs: "leiden",
    onSelectObs: () => {},
    geneOptions: [],
    dataset: { name: "PBMC 10k", cellCount: 10327, geneCount: 2000 },
    categories: [],
    visibleCategories: null,
    defaultCategoryColors: {},
    isContinuousMode: false,
    dataValueRange: { min: null, max: null },
    onDownloadSelection: () => {},
    ...overrides,
  };
  return render(
    <VizProvider>
      <ControlPanel {...props} />
    </VizProvider>
  );
}

describe("ControlPanel", () => {
  it("renders the dataset summary with formatted counts", () => {
    renderPanel();
    expect(screen.getByText("PBMC 10k")).toBeInTheDocument();
    expect(screen.getByText("10.3K")).toBeInTheDocument();
    expect(screen.getByText("2.0K")).toBeInTheDocument();
  });

  it("renders available embeddings as options", () => {
    renderPanel();
    expect(screen.getByRole("option", { name: /UMAP/ })).toBeInTheDocument();
  });

  it("shows the empty selection hint when nothing is selected", () => {
    renderPanel();
    expect(screen.getByText(/No cells selected/i)).toBeInTheDocument();
  });
});
