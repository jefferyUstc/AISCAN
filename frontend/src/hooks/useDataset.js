import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const FALLBACK_DATASET = {
    id: "pbmc_10k",
    name: "PBMC 10k",
    organism: "Human",
    cellCount: 10327,
    geneCount: 2000,
    activeEmbedding: "umap",
};

export function useDataset() {
    const [dataset, setDataset] = useState(null);
    const [hasBackendDataset, setHasBackendDataset] = useState(false);
    const [obsAttributes, setObsAttributes] = useState([]);
    const [geneOptions, setGeneOptions] = useState([]);
    const [embeddings, setEmbeddings] = useState([{ name: "umap", dimensions: 2 }]);
    const [selectedEmbedding, setSelectedEmbedding] = useState("umap");
    const [selectedObs, setSelectedObs] = useState(null);

    // Fetch dataset metadata
    useEffect(() => {
        let ignore = false;

        async function fetchDataset() {
            try {
                const response = await fetch(`${API_BASE}/api/dataset/overview`);
                if (!response.ok) throw new Error("Failed to load dataset metadata");
                const data = await response.json();
                if (!ignore) {
                    setDataset(data.dataset);
                    setHasBackendDataset(true);
                }
            } catch (error) {
                if (!ignore) {
                    setDataset(FALLBACK_DATASET);
                    setEmbeddings([{ name: "umap", key: "umap", dimensions: 2 }]);
                    setSelectedEmbedding("umap");
                    setHasBackendDataset(false);
                }
            }
        }

        fetchDataset();

        return () => {
            ignore = true;
        };
    }, []);

    // Fetch dataset options (attributes, genes, embeddings)
    useEffect(() => {
        if (!hasBackendDataset) {
            setObsAttributes([]);
            setGeneOptions([]);
            setSelectedObs(null);
            const fallbackEmbedding = dataset?.activeEmbedding || "umap";
            setEmbeddings([{ name: fallbackEmbedding, key: fallbackEmbedding, dimensions: 2 }]);
            setSelectedEmbedding(fallbackEmbedding);
            return;
        }

        let ignore = false;
        async function fetchOptions() {
            try {
                const response = await fetch(`${API_BASE}/api/dataset/options`);
                if (!response.ok) throw new Error("Failed to load dataset options");
                const data = await response.json();
                if (!ignore) {
                    const attributes = data.obsAttributes || [];
                    setObsAttributes(attributes);
                    setGeneOptions(data.geneOptions || []);
                    const embeddingList = (data.embeddings || []).map((item) => ({
                        name: item.name,
                        key: item.key || item.name,
                        dimensions: item.dimensions || 2,
                    }));
                    const fallbackEmbedding = dataset?.activeEmbedding || embeddingList[0]?.name || "umap";
                    const nextEmbeddings = embeddingList.length
                        ? embeddingList
                        : [{ name: fallbackEmbedding, key: fallbackEmbedding, dimensions: 2 }];
                    setEmbeddings(nextEmbeddings);
                    setSelectedEmbedding((prev) => {
                        if (prev && nextEmbeddings.some((entry) => entry.name === prev)) {
                            return prev;
                        }
                        return fallbackEmbedding;
                    });
                    const defaultObs =
                        attributes.find((attribute) => attribute.name === "leiden")?.name ||
                        attributes.find((attribute) => attribute.kind !== "numeric")?.name ||
                        attributes[0]?.name;
                    setSelectedObs(defaultObs || null);
                }
            } catch (error) {
                if (!ignore) {
                    setObsAttributes([]);
                    setGeneOptions([]);
                    setSelectedObs(null);
                    const fallbackEmbedding = dataset?.activeEmbedding || "umap";
                    setEmbeddings([{ name: fallbackEmbedding, key: fallbackEmbedding, dimensions: 2 }]);
                    setSelectedEmbedding(fallbackEmbedding);
                }
            }
        }

        fetchOptions();

        return () => {
            ignore = true;
        };
    }, [hasBackendDataset, dataset]);

    // Ensure selectedObs is valid when attributes change
    useEffect(() => {
        if (!obsAttributes.length) {
            setSelectedObs(null);
            return;
        }

        setSelectedObs((current) => {
            if (current && obsAttributes.some((attribute) => attribute.name === current)) {
                return current;
            }
            const preferred =
                obsAttributes.find((attribute) => attribute.name === "leiden")?.name ||
                obsAttributes[0]?.name ||
                null;
            return preferred;
        });
    }, [obsAttributes]);

    // Ensure selectedEmbedding is valid when embeddings change
    useEffect(() => {
        if (!embeddings.length) {
            return;
        }

        setSelectedEmbedding((current) => {
            if (current && embeddings.some((item) => item.name === current)) {
                return current;
            }
            return embeddings[0]?.name || null;
        });
    }, [embeddings]);

    const resolvedDataset = dataset ?? FALLBACK_DATASET;

    return {
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
    };
}
