import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDegData } from '../hooks/useDegData';
import { apiGet } from '../api/client.js';
import Plot from '../plots/plotly.js';
import SaveButton, { savePlotSvg } from '../plots/SaveButton.jsx';
import { downloadText } from '../utils/download.js';

export default function DiffExprView({ onViewGene, obsAttributes = [], onViewSignature }) {

    const { groups, selectedGroup, setSelectedGroup, degData, loading, error } = useDegData();
    const [selectedGene, setSelectedGene] = useState(null);
    const [minLfc, setMinLfc] = useState(0.5);
    const [maxPval, setMaxPval] = useState(0.05);

    // Refs for plots
    const maPlotRef = React.useRef(null);
    const exprPlotRef = React.useRef(null);

    // MA Plot axis range controls
    const [maXMin, setMaXMin] = useState('');
    const [maXMax, setMaXMax] = useState('');
    const [maYMin, setMaYMin] = useState('');
    const [maYMax, setMaYMax] = useState('');

    // Compute data ranges for MA Plot
    const dataRanges = useMemo(() => {
        if (!degData?.genes?.length) return null;
        const xValues = degData.genes.map(g => g.mean_expression);
        const yValues = degData.genes.map(g => g.logfoldchanges);
        return {
            xMin: Math.floor(Math.min(...xValues)),
            xMax: Math.ceil(Math.max(...xValues)),
            yMin: Math.floor(Math.min(...yValues)),
            yMax: Math.ceil(Math.max(...yValues))
        };
    }, [degData]);

    // Auto-select first group if available and none selected
    useEffect(() => {
        if (!selectedGroup && groups.length > 0) {
            setSelectedGroup(groups[0]);
        }
    }, [groups, selectedGroup, setSelectedGroup]);

    // Auto-select first gene and set default axis ranges when degData loads
    useEffect(() => {
        if (degData && degData.genes && degData.genes.length > 0) {
            setSelectedGene(degData.genes[0].name);
            // Set default axis ranges based on data
            if (dataRanges) {
                setMaXMin(String(dataRanges.xMin));
                setMaXMax(String(dataRanges.xMax));
                setMaYMin(String(dataRanges.yMin));
                setMaYMax(String(dataRanges.yMax));
            }
        }
    }, [degData, dataRanges]);

    // Filter categorical attributes for groupby dropdown
    const categoricalAttributes = useMemo(() => {
        return obsAttributes.filter(attr => attr.kind !== 'numeric');
    }, [obsAttributes]);

    return (
        <div className="layout-root plot-view">
            {/* Left Column: Controls & Gene List */}
            <div className="sidebar-card deg-sidebar">
                <div className="deg-sidebar-head">
                    <h3 className="sidebar-title">DEGs</h3>
                    <div className="field">
                        <label className="deg-compare-label">COMPARE GROUP VS REST</label>
                        <select
                            className="full-width"
                            value={selectedGroup || ''}
                            onChange={(e) => setSelectedGroup(e.target.value)}
                        >
                            {groups.length === 0 && <option value="">Loading groups...</option>}
                            {groups.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                </div>

                <div className="deg-body">
                    {loading && <div className="deg-status">Loading analysis...</div>}
                    {error && <div className="deg-status deg-status--error">Error: {error}</div>}

                    {!loading && degData && degData.genes && (
                        <GeneList
                            genes={degData.genes}
                            selectedGene={selectedGene}
                            onSelect={setSelectedGene}
                            minLfc={minLfc}
                            setMinLfc={setMinLfc}
                            maxPval={maxPval}
                            setMaxPval={setMaxPval}
                        />
                    )}
                </div>
            </div>

            {/* Right Column: Plots - Scrollable */}
            <div className="plot-main">
                <div className="deg-plots-stack">
                    {/* Top: MA Plot */}
                    <div className="embedding-card deg-ma-card">
                        <div className="embedding-header">
                            <div className="embedding-title plot-header-row plot-header-row--wrap">
                                <h2>MA PLOT</h2>
                                <div className="ma-axis">
                                    <span className="ma-axis-label">X:</span>
                                    <input
                                        type="number"
                                        placeholder="Min"
                                        value={maXMin}
                                        onChange={e => setMaXMin(e.target.value)}
                                        className="plot-number-input"
                                    />
                                    <span className="ma-axis-label">-</span>
                                    <input
                                        type="number"
                                        placeholder="Max"
                                        value={maXMax}
                                        onChange={e => setMaXMax(e.target.value)}
                                        className="plot-number-input"
                                    />
                                    <span className="ma-axis-label ma-axis-label--gap">Y:</span>
                                    <input
                                        type="number"
                                        placeholder="Min"
                                        value={maYMin}
                                        onChange={e => setMaYMin(e.target.value)}
                                        className="plot-number-input"
                                    />
                                    <span className="ma-axis-label">-</span>
                                    <input
                                        type="number"
                                        placeholder="Max"
                                        value={maYMax}
                                        onChange={e => setMaYMax(e.target.value)}
                                        className="plot-number-input"
                                    />
                                    <button
                                        className="plot-mini-btn"
                                        onClick={() => {
                                            setMaXMin('');
                                            setMaXMax('');
                                            setMaYMin('');
                                            setMaYMax('');
                                        }}
                                    >
                                        Reset
                                    </button>
                                    <button
                                        className="plot-mini-btn"
                                        onClick={() => {
                                            if (dataRanges) {
                                                setMaXMin(String(dataRanges.xMin));
                                                setMaXMax(String(dataRanges.xMax));
                                                setMaYMin(String(dataRanges.yMin));
                                                setMaYMax(String(dataRanges.yMax));
                                            }
                                        }}
                                    >
                                        Auto
                                    </button>
                                    <SaveButton onClick={() => savePlotSvg(maPlotRef, 'ma_plot')} />
                                </div>
                            </div>
                        </div>
                        <div className="embedding-canvas plot-canvas">
                            {degData ? (
                                <MaPlot
                                    ref={maPlotRef}
                                    genes={degData.genes}
                                    selectedGene={selectedGene}
                                    onSelectGene={setSelectedGene}
                                    minLfc={minLfc}
                                    xRange={[maXMin !== '' ? parseFloat(maXMin) : null, maXMax !== '' ? parseFloat(maXMax) : null]}
                                    yRange={[maYMin !== '' ? parseFloat(maYMin) : null, maYMax !== '' ? parseFloat(maYMax) : null]}
                                />
                            ) : (
                                <EmptyPlotState message="Select a group to generate MA Plot" />
                            )}
                        </div>
                    </div>

                    {/* Middle: Violin Plot */}
                    <div className="embedding-card deg-expr-card">
                        <div className="embedding-header">
                            <div className="embedding-title plot-header-row">
                                <div className="plot-header-group">
                                    <h2>EXPRESSION DISTRIBUTION</h2>
                                    {selectedGene && <span className="embedding-count">{selectedGene}</span>}
                                    {selectedGene && <SaveButton onClick={() => savePlotSvg(exprPlotRef, `expression_${selectedGene}`)} />}
                                </div>
                                {selectedGene && onViewGene && (
                                    <button className="plot-ghost-btn" onClick={() => onViewGene(selectedGene)}>
                                        <span>🎨 View in Embedding</span>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="embedding-canvas plot-canvas">
                            {selectedGene ? (
                                <GeneExpressionPlot ref={exprPlotRef} gene={selectedGene} />
                            ) : (
                                <EmptyPlotState message="Select a gene to view expression" />
                            )}
                        </div>
                    </div>

                    {/* Bottom: Gene Signature Scoring */}
                    <GeneSignatureScoring
                        categoricalAttributes={categoricalAttributes}
                        onViewSignature={onViewSignature}
                    />

                    {/* GO Enrichment Card */}
                    <GOEnrichmentCard
                        selectedGroup={selectedGroup}
                        minLfc={minLfc}
                        maxPval={maxPval}
                    />
                </div>
            </div>
        </div>
    );
}


function EmptyPlotState({ message }) {
    return <div className="plot-placeholder">{message}</div>;
}


function SortIcon({ column, sortConfig }) {
    if (sortConfig.key !== column) {
        return <span className="deg-sort-icon deg-sort-icon--idle">⇅</span>;
    }
    return <span className="deg-sort-icon">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
}

function GeneList({ genes, selectedGene, onSelect, minLfc, setMinLfc, maxPval, setMaxPval }) {
    const [sortConfig, setSortConfig] = useState({ key: 'logfoldchanges', direction: 'desc' });
    const [onlyPositive, setOnlyPositive] = useState(false);

    const processedGenes = useMemo(() => {
        let result = [...genes];

        // Filter
        result = result.filter(g => {
            const passLfc = Math.abs(g.logfoldchanges) >= minLfc;
            const passPval = g.pvals_adj <= maxPval;
            const passPos = onlyPositive ? g.logfoldchanges > 0 : true;
            return passLfc && passPval && passPos;
        });

        // Sort
        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                // Handle absolute value sort for LFC if desired? Usually standard numeric.
                // For LFC users often want to see top Up or top Down.
                // Standard sort works fine.

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [genes, minLfc, maxPval, sortConfig, onlyPositive]);

    const handleSort = (key) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    return (
        <div className="deg-list">
            {/* Filter Controls */}
            <div className="deg-filters">
                <div className="deg-filter-row">
                    <div className="deg-field">
                        <label>Min |LFC|</label>
                        <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={minLfc}
                            onChange={e => setMinLfc(parseFloat(e.target.value) || 0)}
                            className="deg-input"
                        />
                    </div>
                    <div className="deg-field">
                        <label>Max Adj P</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={maxPval}
                            onChange={e => setMaxPval(parseFloat(e.target.value) || 0)}
                            className="deg-input"
                        />
                    </div>
                </div>
                <div className="deg-check">
                    <input
                        type="checkbox"
                        id="onlyPositive"
                        checked={onlyPositive}
                        onChange={e => setOnlyPositive(e.target.checked)}
                    />
                    <label htmlFor="onlyPositive">Positive LFC only</label>
                </div>
            </div>

            {/* Header */}
            <div className="deg-gene-head">
                <span className="deg-sort" onClick={() => handleSort('name')}>
                    GENE <SortIcon column="name" sortConfig={sortConfig} />
                </span>
                <span className="deg-sort deg-sort--num" onClick={() => handleSort('logfoldchanges')}>
                    LFC <SortIcon column="logfoldchanges" sortConfig={sortConfig} />
                </span>
                <span className="deg-sort deg-sort--num" onClick={() => handleSort('pvals_adj')}>
                    ADJ P <SortIcon column="pvals_adj" sortConfig={sortConfig} />
                </span>
            </div>

            {/* List */}
            <div className="deg-gene-list">
                {processedGenes.length === 0 ? (
                    <div className="deg-gene-empty">No genes match criteria.</div>
                ) : (
                    processedGenes.map(gene => {
                        const isActive = selectedGene === gene.name;
                        return (
                            <div
                                key={gene.id}
                                onClick={() => onSelect(gene.name)}
                                className={`deg-gene-row ${isActive ? "active" : ""}`}
                            >
                                <span className="deg-gene-name">{gene.name}</span>
                                <span
                                    className={`deg-lfc ${gene.logfoldchanges > 0 ? "deg-lfc--up" : "deg-lfc--down"}`}
                                >
                                    {gene.logfoldchanges.toFixed(2)}
                                </span>
                                <span className="deg-pval">
                                    {gene.pvals_adj < 0.001 ? '< 0.001' : gene.pvals_adj.toFixed(3)}
                                </span>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

const COMMON_LAYOUT = {
    font: { family: 'Inter, sans-serif', color: '#e2e8f0' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 60, r: 20, t: 30, b: 40 },
    xaxis: {
        gridcolor: 'rgba(148, 163, 184, 0.1)',
        zerolinecolor: 'rgba(148, 163, 184, 0.2)',
        tickfont: { size: 11, color: '#94a3b8' },
        title: { font: { size: 12, color: '#94a3b8' }, text: '' } // Placeholder, override in use
    },
    yaxis: {
        gridcolor: 'rgba(148, 163, 184, 0.1)',
        zerolinecolor: 'rgba(148, 163, 184, 0.2)',
        tickfont: { size: 11, color: '#94a3b8' },
        title: { font: { size: 12, color: '#94a3b8' }, text: '' } // Placeholder
    },
    autosize: true,
    hovermode: 'closest'
};

const MaPlot = React.forwardRef(({ genes, selectedGene, onSelectGene, minLfc, xRange = [null, null], yRange = [null, null] }, ref) => {
    const trace = useMemo(() => {
        const x = [];
        const y = [];
        const text = [];
        const colors = [];

        genes.forEach(g => {
            x.push(g.mean_expression);
            y.push(g.logfoldchanges);
            text.push(g.name);

            const absLfc = Math.abs(g.logfoldchanges);
            const isSig = g.pvals_adj < 0.05;

            if (absLfc < minLfc || !isSig) {
                colors.push('rgba(148, 163, 184, 0.3)'); // grey
            } else if (g.logfoldchanges > 0) {
                colors.push('#f87171'); // red-400
            } else {
                colors.push('#60a5fa'); // blue-400
            }
        });

        return {
            x,
            y,
            text,
            mode: 'markers',
            type: 'scattergl',
            marker: { size: 5, color: colors, opacity: 0.7 },
            hoverinfo: 'text+x+y',
        };
    }, [genes, minLfc]);

    const highlightTrace = useMemo(() => {
        if (!selectedGene) return null;
        const gene = genes.find(g => g.name === selectedGene);
        if (!gene) return null;

        return {
            x: [gene.mean_expression],
            y: [gene.logfoldchanges],
            text: [gene.name],
            mode: 'markers',
            type: 'scatter',
            marker: { size: 14, color: '#facc15', symbol: 'circle-open', line: { width: 3, color: '#facc15' } }, // yellow
            hoverinfo: 'text',
        };
    }, [genes, selectedGene]);

    // Build axis config with optional range
    const xaxisConfig = {
        ...COMMON_LAYOUT.xaxis,
        title: { ...COMMON_LAYOUT.xaxis.title, text: 'Mean Expression' }
    };
    if (xRange[0] !== null || xRange[1] !== null) {
        xaxisConfig.range = [
            xRange[0] !== null ? xRange[0] : undefined,
            xRange[1] !== null ? xRange[1] : undefined
        ];
        xaxisConfig.autorange = false;
    }

    const yaxisConfig = {
        ...COMMON_LAYOUT.yaxis,
        title: { ...COMMON_LAYOUT.yaxis.title, text: 'Log Fold Change' }
    };
    if (yRange[0] !== null || yRange[1] !== null) {
        yaxisConfig.range = [
            yRange[0] !== null ? yRange[0] : undefined,
            yRange[1] !== null ? yRange[1] : undefined
        ];
        yaxisConfig.autorange = false;
    }

    return (
        <Plot
            ref={ref}
            data={highlightTrace ? [trace, highlightTrace] : [trace]}
            layout={{
                ...COMMON_LAYOUT,
                title: false,
                xaxis: xaxisConfig,
                yaxis: yaxisConfig,
                showlegend: false,
                shapes: [
                    {
                        type: 'line',
                        xref: 'paper', x0: 0, x1: 1,
                        yref: 'y', y0: minLfc, y1: minLfc,
                        line: { color: 'rgba(148, 163, 184, 0.6)', width: 2, dash: 'dashdot' }
                    },
                    {
                        type: 'line',
                        xref: 'paper', x0: 0, x1: 1,
                        yref: 'y', y0: -minLfc, y1: -minLfc,
                        line: { color: 'rgba(148, 163, 184, 0.6)', width: 2, dash: 'dashdot' }
                    }
                ]
            }}
            config={{ displayModeBar: false, responsive: true }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
            onClick={(data) => {
                if (data.points && data.points[0]) {
                    const idx = data.points[0].pointIndex;
                    if (data.points[0].curveNumber === 0) {
                        const geneName = genes[idx].name;
                        onSelectGene(geneName);
                    }
                }
            }}
        />
    );
});

MaPlot.displayName = "MaPlot";

const GeneExpressionPlot = React.forwardRef(({ gene }, ref) => {
    const { data, isFetching } = useQuery({
        queryKey: ['dataset', 'gene_expression', gene],
        queryFn: () => apiGet('/api/dataset/gene_expression', { gene }),
        enabled: Boolean(gene),
    });

    if (isFetching && !data) return <div className="plot-placeholder">Loading expression data...</div>;
    if (!data) return null;

    const x = data.points.map(p => p.group);
    const y = data.points.map(p => p.value);

    // Trace 0: Points only
    const pointTrace = {
        type: 'violin',
        x: x,
        y: y,
        points: 'all',
        jitter: 0.7,
        pointpos: 0,
        fillcolor: 'rgba(0,0,0,0)', // Transparent fill
        line: { color: 'rgba(0,0,0,0)' }, // Transparent line
        marker: { size: 3, color: '#cbd5e1', opacity: 0.6 },
        showlegend: false,
        hoverinfo: 'y'
    };

    // Trace 1: Violin only (No points)
    const violinTrace = {
        type: 'violin',
        x: x,
        y: y,
        points: false, // No points on this layer
        box: { visible: true, width: 0.2, line: { color: '#e2e8f0' } },
        meanline: { visible: true, color: '#fff' },
        line: { color: 'rgba(0,0,0,0)' },
        fillcolor: '#3b82f6', // blue-500
        opacity: 0.8,
        showlegend: false,
        hoverinfo: 'y'
    };

    return (
        <Plot
            ref={ref}
            data={[pointTrace, violinTrace]}
            layout={{
                ...COMMON_LAYOUT,
                title: false,
                xaxis: { ...COMMON_LAYOUT.xaxis, title: { ...COMMON_LAYOUT.xaxis.title, text: 'Group' }, tickangle: -45 },
                yaxis: { ...COMMON_LAYOUT.yaxis, title: { ...COMMON_LAYOUT.yaxis.title, text: 'Expression' } },
                margin: { l: 50, r: 20, t: 20, b: 80 },
                violinmode: 'overlay'
            }}
            config={{ displayModeBar: false, responsive: true }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
        />
    );
});

GeneExpressionPlot.displayName = "GeneExpressionPlot";

function GeneSignatureScoring({ categoricalAttributes, onViewSignature }) {
    const [inputMode, setInputMode] = useState('manual'); // 'manual' or 'file'
    const [geneInput, setGeneInput] = useState('');
    const [selectedGroupby, setSelectedGroupby] = useState('');
    const [signatureName, setSignatureName] = useState('signature');
    const [signatureData, setSignatureData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const sigPlotRef = React.useRef(null);

    // Preset Pathways State
    const [presetCategories, setPresetCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [presetPathways, setPresetPathways] = useState([]);
    const [selectedPathway, setSelectedPathway] = useState('');
    const [loadingPresets, setLoadingPresets] = useState(false);

    // Auto-select first categorical attribute
    useEffect(() => {
        if (categoricalAttributes.length > 0 && !selectedGroupby) {
            const preferred = categoricalAttributes.find(a => a.name === 'leiden') || categoricalAttributes[0];
            setSelectedGroupby(preferred.name);
        }
    }, [categoricalAttributes, selectedGroupby]);

    // Fetch categories when entering preset mode
    useEffect(() => {
        if (inputMode === 'preset' && presetCategories.length === 0) {
            setLoadingPresets(true);
            apiGet('/api/dataset/pathways/categories')
                .then(data => {
                    setPresetCategories(data);
                    if (data.length > 0) setSelectedCategory(data[0]);
                })
                .catch(err => console.error(err))
                .finally(() => setLoadingPresets(false));
        }
    }, [inputMode, presetCategories.length]);

    // Fetch pathways when category changes
    useEffect(() => {
        if (!selectedCategory) return;
        setLoadingPresets(true);
        apiGet(`/api/dataset/pathways/${selectedCategory}/pathways`)
            .then(data => {
                setPresetPathways(data);
                setSelectedPathway(''); // Reset pathway selection
            })
            .catch(err => console.error(err))
            .finally(() => setLoadingPresets(false));
    }, [selectedCategory]);

    // Fetch genes when pathway changes (encode the pathway segment for slashes/special chars)
    useEffect(() => {
        if (!selectedPathway || !selectedCategory) return;
        setLoadingPresets(true);
        apiGet(`/api/dataset/pathways/${selectedCategory}/${encodeURIComponent(selectedPathway)}/genes`)
            .then(data => {
                setGeneInput(data.join(', '));
                setSignatureName(selectedPathway);
            })
            .catch(err => console.error(err))
            .finally(() => setLoadingPresets(false));
    }, [selectedPathway, selectedCategory]);

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result;
            if (typeof content === 'string') {
                // Parse file: one gene per line
                const genes = content.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .join('\n');
                setGeneInput(genes);
            }
        };
        reader.readAsText(file);
    };

    const handleCompute = async () => {
        if (!geneInput.trim() || !selectedGroupby) return;

        setLoading(true);
        setError(null);
        setSignatureData(null);

        try {
            // Allow newlines or commas
            const normalizedGenes = geneInput.replace(/[\r\n]+/g, ',');
            const data = await apiGet('/api/dataset/gene_signature_violin', {
                genes: normalizedGenes,
                groupby: selectedGroupby,
                signature_name: signatureName || 'signature',
            });
            setSignatureData(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleViewInEmbedding = () => {
        if (signatureData && onViewSignature) {
            onViewSignature(signatureData.signature_name);
        }
    };

    // Dynamic card height
    const cardMinHeight = signatureData ? 450 : 180;

    return (
        <div className="embedding-card flex-none" style={{ minHeight: `${cardMinHeight}px` }}>
            <div className="embedding-header">
                <div className="embedding-title plot-header-row">
                    <div className="plot-header-group">
                        <h2>GENE SIGNATURE SCORING</h2>
                        {signatureData && (
                            <span className="embedding-count">
                                {signatureData.genes_found.length} genes
                            </span>
                        )}
                    </div>
                    <div className="plot-header-actions">
                        {signatureData && <SaveButton onClick={() => savePlotSvg(sigPlotRef, `signature_${signatureData.signature_name}`)} />}
                        {signatureData && onViewSignature && (
                            <button className="plot-ghost-btn" onClick={handleViewInEmbedding}>
                                <span>🎨 View in Embedding</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Input Controls */}
            <div className="plot-input-panel">
                {/* Input Mode Toggle */}
                <div className="sig-mode-row">
                    <label className="sig-radio">
                        <input
                            type="radio"
                            name="inputMode"
                            checked={inputMode === 'manual'}
                            onChange={() => setInputMode('manual')}
                        />
                        Manual Input
                    </label>
                    <label className="sig-radio">
                        <input
                            type="radio"
                            name="inputMode"
                            checked={inputMode === 'file'}
                            onChange={() => setInputMode('file')}
                        />
                        Upload File
                    </label>
                    <label className="sig-radio">
                        <input
                            type="radio"
                            name="inputMode"
                            checked={inputMode === 'preset'}
                            onChange={() => setInputMode('preset')}
                        />
                        Preset Pathways
                    </label>
                </div>

                {/* Preset Selection UI */}
                {inputMode === 'preset' && (
                    <div className="sig-preset">
                        <div className="sig-preset-row">
                            <div className="sig-preset-col">
                                <label className="plot-field-label">CATEGORY</label>
                                <select
                                    className="plot-select"
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                >
                                    {presetCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="sig-preset-col">
                                <label className="plot-field-label">PATHWAY</label>
                                <select
                                    className="plot-select"
                                    value={selectedPathway}
                                    onChange={(e) => setSelectedPathway(e.target.value)}
                                >
                                    <option value="">Select a pathway...</option>
                                    {presetPathways.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                        </div>
                        {geneInput && (
                            <div className="sig-hint">
                                {loadingPresets ? 'Loading genes...' : `Loaded ${geneInput.split(',').length} genes`}
                            </div>
                        )}
                    </div>
                )}

                {/* Gene Input */}
                {inputMode === 'manual' ? (
                    <textarea
                        className="sig-textarea"
                        value={geneInput}
                        onChange={(e) => setGeneInput(e.target.value)}
                        placeholder="Enter genes (one per line or separated by commas)"
                    />
                ) : inputMode === 'file' ? (
                    <div className="sig-dropzone">
                        <input
                            type="file"
                            accept=".txt,.csv"
                            onChange={handleFileUpload}
                            hidden
                            id="gene-file-upload"
                        />
                        <label htmlFor="gene-file-upload" className="sig-dropzone-label">
                            📁 Click to upload a text file (one gene per line)
                        </label>
                        {geneInput && (
                            <div className="sig-dropzone-hint">
                                Loaded: {geneInput.split(',').filter(g => g.trim()).length} genes
                            </div>
                        )}
                    </div>
                ) : null}

                {/* Options Row */}
                <div className="sig-options">
                    <div className="sig-field">
                        <label className="plot-field-label">GROUP BY</label>
                        <select
                            className="plot-select"
                            value={selectedGroupby}
                            onChange={(e) => setSelectedGroupby(e.target.value)}
                        >
                            {categoricalAttributes.map(attr => (
                                <option key={attr.name} value={attr.name}>{attr.label || attr.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="sig-field">
                        <label className="plot-field-label">SIGNATURE NAME</label>
                        <input
                            type="text"
                            className="plot-text-input"
                            value={signatureName}
                            onChange={(e) => setSignatureName(e.target.value)}
                            placeholder="signature"
                        />
                    </div>
                    <button
                        className="plot-btn plot-btn--accent"
                        onClick={handleCompute}
                        disabled={loading || !geneInput.trim() || !selectedGroupby}
                    >
                        {loading ? 'Computing...' : 'Compute'}
                    </button>
                </div>

                {/* Feedback Messages */}
                {error && <div className="plot-alert plot-alert--error">{error}</div>}
                {signatureData && signatureData.genes_not_found.length > 0 && (
                    <div className="plot-alert plot-alert--warn">
                        ⚠️ Genes not found: {signatureData.genes_not_found.join(', ')}
                    </div>
                )}
            </div>

            {/* Violin Plot */}
            <div
                className="embedding-canvas plot-canvas"
                style={{ minHeight: signatureData ? '300px' : '60px' }}
            >
                {loading ? (
                    <div className="plot-loading">Computing signature scores...</div>
                ) : signatureData ? (
                    <SignatureViolinPlot ref={sigPlotRef} data={signatureData} />
                ) : (
                    <EmptyPlotState message="Enter genes and click Compute to generate signature scores" />
                )}
            </div>
        </div>
    );
}

const SignatureViolinPlot = React.forwardRef(({ data }, ref) => (
    <Plot
        ref={ref}
        data={[
            {
                type: 'violin',
                x: (data?.points || []).map(p => p.group),
                y: (data?.points || []).map(p => p.value),
                points: 'all',
                jitter: 0.7,
                pointpos: 0,
                fillcolor: 'rgba(0,0,0,0)',
                line: { color: 'rgba(0,0,0,0)' },
                marker: { size: 3, color: '#cbd5e1', opacity: 0.6 },
                showlegend: false,
                hoverinfo: 'y'
            },
            {
                type: 'violin',
                x: (data?.points || []).map(p => p.group),
                y: (data?.points || []).map(p => p.value),
                points: false,
                box: { visible: true, width: 0.2, line: { color: '#e2e8f0' } },
                meanline: { visible: true, color: '#fff' },
                line: { color: 'rgba(0,0,0,0)' },
                fillcolor: '#8b5cf6', // purple-500 to differentiate from gene expression
                opacity: 0.8,
                showlegend: false,
                hoverinfo: 'y'
            }
        ]}
        layout={{
            ...COMMON_LAYOUT,
            title: false,
            xaxis: { ...COMMON_LAYOUT.xaxis, title: { ...COMMON_LAYOUT.xaxis.title, text: 'Group' }, tickangle: -45 },
            yaxis: { ...COMMON_LAYOUT.yaxis, title: { ...COMMON_LAYOUT.yaxis.title, text: 'Signature Score' } },
            margin: { l: 50, r: 20, t: 20, b: 80 },
            violinmode: 'overlay'
        }}
        config={{ displayModeBar: false, responsive: true }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
    />
));


SignatureViolinPlot.displayName = "SignatureViolinPlot";

function GOEnrichmentCard({ selectedGroup, minLfc, maxPval }) {
    const [enrichmentData, setEnrichmentData] = useState(null); // Full data from API
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [topN, setTopN] = useState(10);
    const goPlotRef = React.useRef(null);

    const runEnrichment = async () => {
        if (!selectedGroup) return;

        setLoading(true);
        setError(null);
        setEnrichmentData(null);

        try {
            const data = await apiGet('/api/dataset/go_enrichment', {
                group: selectedGroup,
                min_lfc: minLfc,
                max_pval: maxPval,
            });
            setEnrichmentData(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Terms to display (sliced by topN)
    const displayTerms = useMemo(() => {
        if (!enrichmentData || !enrichmentData.terms) return [];
        return enrichmentData.terms.slice(0, topN);
    }, [enrichmentData, topN]);

    // Download CSV function
    const downloadCSV = () => {
        if (!enrichmentData || enrichmentData.terms.length === 0) return;

        const headers = ['GO Term', 'P-value', 'Adjusted P-value', '-log10(Adj P)', 'Odds Ratio', 'Overlap Count', 'Gene Set Size', 'Genes'];
        const rows = enrichmentData.terms.map(t => [
            `"${t.term.replace(/"/g, '""')}"`,
            t.pval.toExponential(4),
            t.pval_adj.toExponential(4),
            t.neg_log10_pval_adj.toFixed(4),
            t.odds_ratio.toFixed(4),
            t.overlap_count,
            t.gene_set_size,
            `"${t.genes.join(', ')}"`
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        downloadText(
            csv,
            `GO_enrichment_${selectedGroup}_${new Date().toISOString().slice(0, 10)}.csv`,
            'text/csv;charset=utf-8;'
        );
    };

    // Truncate long GO term names
    const truncateTerm = (term, maxLen = 45) => {
        if (term.length <= maxLen) return term;
        return term.substring(0, maxLen - 3) + '...';
    };

    // Dynamic height calculation
    const getPlotHeight = () => {
        if (!displayTerms || displayTerms.length === 0) return 120;
        const termCount = displayTerms.length;
        return Math.max(200, termCount * 32 + 80);
    };

    const cardMinHeight = displayTerms && displayTerms.length > 0 ? getPlotHeight() + 100 : 180;


    return (
        <div className="embedding-card flex-none" style={{ minHeight: `${cardMinHeight}px` }}>
            <div className="embedding-header">
                <div className="embedding-title plot-header-row">
                    <div className="plot-header-group">
                        <h2>GO ENRICHMENT</h2>
                        {enrichmentData && enrichmentData.terms.length > 0 && (
                            <span className="embedding-count">
                                {enrichmentData.filtered_genes.length} genes → {enrichmentData.terms.length} terms
                            </span>
                        )}
                    </div>
                    <div className="plot-header-actions">
                        {/* Top N selector */}
                        <select
                            className="plot-select-sm"
                            value={topN}
                            onChange={(e) => setTopN(Number(e.target.value))}
                        >
                            <option value={10}>Top 10</option>
                            <option value={20}>Top 20</option>
                            <option value={30}>Top 30</option>
                        </select>

                        {/* Download button */}
                        {enrichmentData && enrichmentData.terms.length > 0 && (
                            <button
                                className="plot-ghost-btn"
                                onClick={downloadCSV}
                                title="Download full enrichment table as CSV"
                            >
                                📥 CSV
                            </button>
                        )}

                        {enrichmentData && enrichmentData.terms.length > 0 && (
                            <SaveButton onClick={() => savePlotSvg(goPlotRef, `GO_enrichment_${selectedGroup}`)} />
                        )}

                        {/* Run button */}
                        <button
                            className="plot-btn plot-btn--success"
                            onClick={runEnrichment}
                            disabled={loading || !selectedGroup}
                        >
                            {loading ? 'Analyzing...' : '🧬 Run Enrichment'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Info Bar */}
            <div className="plot-info-bar">
                Using filters: Min LFC ≥ {minLfc}, Adj P ≤ {maxPval} (positive LFC only)
            </div>

            {/* Error */}
            {error && <div className="plot-error-bar">{error}</div>}

            {/* Plot Area */}
            <div
                className="embedding-canvas plot-canvas"
                style={{ minHeight: enrichmentData ? `${getPlotHeight()}px` : '80px' }}
            >
                {loading ? (
                    <div className="plot-loading">
                        Running GO enrichment analysis...
                    </div>
                ) : displayTerms.length > 0 ? (
                    <Plot
                        ref={goPlotRef}
                        data={[{
                            type: 'bar',
                            orientation: 'h',
                            y: displayTerms.map(t => truncateTerm(t.term)).reverse(),
                            x: displayTerms.map(t => t.neg_log10_pval_adj).reverse(),
                            text: displayTerms.map(t => truncateTerm(t.term)).reverse(),
                            hovertext: displayTerms.map(t => t.term).reverse(),
                            textposition: 'inside',
                            texttemplate: '%{text}',
                            insidetextanchor: 'start',
                            textfont: { size: 10, color: '#e2e8f0' },
                            hovertemplate: '<b>%{hovertext}</b><br>-log₁₀(adj.p): %{x:.2f}; Overlap: %{customdata.overlap}/%{customdata.size} genes<extra></extra>',
                            customdata: displayTerms.map(t => ({
                                overlap: t.overlap_count,
                                size: t.gene_set_size
                            })).reverse(),
                            marker: {
                                color: displayTerms.map(t => t.neg_log10_pval_adj).reverse(),
                                colorscale: [
                                    [0, '#94a3b8'],
                                    [0.5, '#3b82f6'],
                                    [1, '#ef4444']
                                ],
                                showscale: true,
                                colorbar: {
                                    title: { text: '-log₁₀(p)', font: { size: 10, color: '#94a3b8' } },
                                    tickfont: { size: 9, color: '#94a3b8' },
                                    len: 0.5,
                                    thickness: 12
                                }
                            }
                        }]}
                        layout={{
                            ...COMMON_LAYOUT,
                            title: false,
                            height: getPlotHeight(),
                            xaxis: {
                                ...COMMON_LAYOUT.xaxis,
                                title: { ...COMMON_LAYOUT.xaxis.title, text: '-log₁₀(Adjusted P-value)' }
                            },
                            yaxis: {
                                ...COMMON_LAYOUT.yaxis,
                                title: { ...COMMON_LAYOUT.yaxis.title, text: '' },
                                tickfont: { size: 10, color: '#94a3b8' },
                                showticklabels: false,
                                automargin: true
                            },
                            margin: { l: 20, r: 60, t: 20, b: 50 },
                            bargap: 0.3
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '100%' }}
                    />
                ) : enrichmentData && enrichmentData.terms.length === 0 ? (
                    <div className="plot-empty">
                        <span>No enriched GO terms found</span>
                        <span className="plot-empty-sub">
                            {enrichmentData.filtered_genes.length} genes passed filters
                        </span>
                    </div>
                ) : (
                    <EmptyPlotState message="Select a group and click 'Run Enrichment' to analyze GO terms" />
                )}
            </div>
        </div>
    );
}
