import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client.js";

const EMPTY_ARRAY = [];

function pickDefaultObs(attributes) {
  return (
    attributes.find((attribute) => attribute.name === "leiden")?.name ||
    attributes.find((attribute) => attribute.kind !== "numeric")?.name ||
    attributes[0]?.name ||
    null
  );
}

export function useDataset() {
  const overviewQuery = useQuery({
    queryKey: ["dataset", "overview"],
    queryFn: () => apiGet("/api/dataset/overview"),
  });

  const hasBackendDataset = overviewQuery.isSuccess;
  const dataset = overviewQuery.data?.dataset ?? null;

  const optionsQuery = useQuery({
    queryKey: ["dataset", "options"],
    queryFn: () => apiGet("/api/dataset/options"),
    enabled: hasBackendDataset,
  });

  const obsAttributes = optionsQuery.data?.obsAttributes ?? EMPTY_ARRAY;
  const geneOptions = optionsQuery.data?.geneOptions ?? EMPTY_ARRAY;
  const activeEmbedding = dataset?.activeEmbedding ?? null;

  const embeddings = useMemo(() => {
    const raw = optionsQuery.data?.embeddings;
    if (Array.isArray(raw) && raw.length) {
      return raw.map((item) => ({
        name: item.name,
        key: item.key || item.name,
        dimensions: item.dimensions || 2,
      }));
    }
    // Backend is up but this dataset didn't enumerate named embeddings: fall
    // back to its active embedding so the canvas still has one to request.
    if (activeEmbedding) {
      return [{ name: activeEmbedding, key: activeEmbedding, dimensions: 2 }];
    }
    return EMPTY_ARRAY;
  }, [optionsQuery.data, activeEmbedding]);

  const [selectedEmbedding, setSelectedEmbedding] = useState(null);
  const [selectedObs, setSelectedObs] = useState(null);

  // Keep the embedding selection valid as the available list resolves/changes.
  useEffect(() => {
    if (!embeddings.length) {
      setSelectedEmbedding(null);
      return;
    }
    setSelectedEmbedding((current) => {
      if (current && embeddings.some((entry) => entry.name === current)) return current;
      if (activeEmbedding && embeddings.some((entry) => entry.name === activeEmbedding)) {
        return activeEmbedding;
      }
      return embeddings[0].name;
    });
  }, [embeddings, activeEmbedding]);

  // Keep the obs selection valid, defaulting to the leiden-preferred attribute.
  useEffect(() => {
    if (!obsAttributes.length) {
      setSelectedObs(null);
      return;
    }
    setSelectedObs((current) => {
      if (current && obsAttributes.some((attribute) => attribute.name === current)) return current;
      return pickDefaultObs(obsAttributes);
    });
  }, [obsAttributes]);

  return {
    dataset,
    hasBackendDataset,
    // Only the initial overview blocks with a loading state; options load
    // progressively. But an options *error* is surfaced too — otherwise a
    // failed /options silently renders an empty control panel.
    isLoading: overviewQuery.isPending,
    isError: overviewQuery.isError || optionsQuery.isError,
    error: overviewQuery.error || optionsQuery.error,
    retry: () => {
      overviewQuery.refetch();
      optionsQuery.refetch();
    },
    obsAttributes,
    geneOptions,
    embeddings,
    selectedEmbedding,
    setSelectedEmbedding,
    selectedObs,
    setSelectedObs,
  };
}
