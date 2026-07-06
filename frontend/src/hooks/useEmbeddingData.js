import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client.js";

const DEFAULT_EMBEDDING_DATA = {
  points: [],
  totalCells: null,
  colorBy: null,
  colorMode: null,
  embeddingName: null,
  dimensions: 2,
};

export function useEmbeddingData({
  hasBackendDataset,
  dataset,
  selectedEmbedding,
  colorMode,
  selectedObs,
  activeGene,
  obsAttributes,
  sampleFraction,
}) {
  const effectiveMode = colorMode === "gene" && activeGene ? "gene" : "obs";
  const effectiveObs = selectedObs || obsAttributes[0]?.name || null;
  const colorParam =
    effectiveMode === "gene" && activeGene
      ? `gene:${activeGene}`
      : effectiveObs
        ? `obs:${effectiveObs}`
        : null;

  const clampedFraction = Math.max(0.05, Math.min(1, sampleFraction || 0));
  const totalCells = dataset?.cellCount;
  const limit = totalCells
    ? Math.max(1, Math.round(totalCells * clampedFraction))
    : Math.max(1, Math.round(4000 * clampedFraction));

  const query = useQuery({
    queryKey: ["dataset", "embedding", { embedding: selectedEmbedding, colorParam, limit }],
    queryFn: () =>
      apiGet("/api/dataset/embedding", {
        limit,
        embedding: selectedEmbedding || undefined,
        color_by: colorParam || undefined,
      }),
    enabled: hasBackendDataset,
    placeholderData: keepPreviousData,
  });

  const embeddingData = useMemo(() => {
    if (!hasBackendDataset) {
      return { ...DEFAULT_EMBEDDING_DATA, embeddingName: selectedEmbedding };
    }
    const data = query.data;
    if (!data) {
      return { ...DEFAULT_EMBEDDING_DATA, colorBy: colorParam, embeddingName: selectedEmbedding };
    }
    return {
      points: data.points || [],
      totalCells: data.totalCells || null,
      colorBy: data.colorBy || colorParam,
      colorMode: data.colorMode || (effectiveMode === "gene" ? "continuous" : "categorical"),
      embeddingName: data.embedding || selectedEmbedding,
      dimensions: data.dimensions || 2,
    };
  }, [hasBackendDataset, query.data, selectedEmbedding, colorParam, effectiveMode]);

  return { embeddingData, embeddingLoading: query.isFetching };
}
