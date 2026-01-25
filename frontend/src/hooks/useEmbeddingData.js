import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

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
    const [embeddingData, setEmbeddingData] = useState({
        points: [],
        totalCells: null,
        colorBy: null,
        colorMode: null,
        embeddingName: null,
        dimensions: 2,
    });
    const [embeddingLoading, setEmbeddingLoading] = useState(false);

    useEffect(() => {
        if (!hasBackendDataset) {
            setEmbeddingData({
                points: [],
                totalCells: null,
                colorBy: null,
                colorMode: null,
                embeddingName: selectedEmbedding,
                dimensions: 2,
            });
            return;
        }

        const effectiveMode = colorMode === "gene" && activeGene ? "gene" : "obs";
        const effectiveObs = selectedObs || obsAttributes[0]?.name || null;
        const colorParam =
            effectiveMode === "gene" && activeGene
                ? `gene:${activeGene}`
                : effectiveObs
                    ? `obs:${effectiveObs}`
                    : null;

        const query = new URLSearchParams();
        const clampedFraction = Math.max(0.05, Math.min(1, sampleFraction || 0));
        const totalCells = dataset?.cellCount;
        const computedLimit = totalCells
            ? Math.max(1, Math.round(totalCells * clampedFraction))
            : Math.max(1, Math.round(4000 * clampedFraction));
        query.set("limit", computedLimit.toString());
        if (selectedEmbedding) query.set("embedding", selectedEmbedding);
        if (colorParam) query.set("color_by", colorParam);

        let ignore = false;
        async function fetchEmbedding() {
            setEmbeddingLoading(true);
            try {
                const response = await fetch(`${API_BASE}/api/dataset/embedding?${query.toString()}`);
                if (!response.ok) throw new Error("Failed to load embedding");
                const data = await response.json();
                if (!ignore) {
                    setEmbeddingData({
                        points: data.points || [],
                        totalCells: data.totalCells || null,
                        colorBy: data.colorBy || colorParam,
                        colorMode: data.colorMode || (effectiveMode === "gene" ? "continuous" : "categorical"),
                        embeddingName: data.embedding || selectedEmbedding,
                        dimensions: data.dimensions || 2,
                    });
                }
            } catch (error) {
                if (!ignore) {
                    setEmbeddingData({
                        points: [],
                        totalCells: null,
                        colorBy: colorParam,
                        colorMode: null,
                        embeddingName: selectedEmbedding,
                        dimensions: 2,
                    });
                }
            } finally {
                if (!ignore) {
                    setEmbeddingLoading(false);
                }
            }
        }

        fetchEmbedding();

        return () => {
            ignore = true;
        };
    }, [
        hasBackendDataset,
        colorMode,
        selectedObs,
        activeGene,
        obsAttributes,
        selectedEmbedding,
        sampleFraction,
        dataset,
    ]);

    return { embeddingData, embeddingLoading };
}
