import React, { useState, useEffect, useMemo } from 'react';
import Plotly from 'plotly.js-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';
import { useDegData } from '../hooks/useDegData';

const Plot = createPlotlyComponent(Plotly);

const handleSavePlot = (ref, filename) => {
    const el = ref?.current?.el || ref?.current;
    if (!el) return;
    const safeName = (filename || 'plot').replace(/[^\w.-]+/g, '_');
    const width = el?.offsetWidth || undefined;
    const height = el?.offsetHeight || undefined;
    Plotly.downloadImage(el, {
        format: 'svg',
        filename: safeName,
        width,
        height,
        scale: 5
    }).catch(() => {
        // ignore download errors (e.g. canvas tainted)
    });
};

const SaveButton = ({ onClick }) => (
    <button
        type="button"
        onClick={onClick}
        style={{
            padding: '2px 8px',
            borderRadius: '4px',
            border: '1px solid rgba(148, 163, 184, 0.4)',
            backgroundColor: 'transparent',
            color: '#94a3b8',
            fontSize: '0.7rem',
            cursor: 'pointer',
            marginLeft: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
        }}
        onMouseOver={e => { e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.borderColor = '#3b82f6'; }}
        onMouseOut={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.4)'; }}
        title="Save plot as SVG"
    >
        <span>📷 Save</span>
    </button>
);

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export default function DiffExprView({ selectedIds, onViewGene, obsAttributes = [], onViewSignature }) {

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
        <div className="layout-root" style={{ gap: '16px', padding: '16px' }}>
            {/* Left Column: Controls & Gene List */}
            <div className="sidebar-card" style={{ width: '350px', display: 'flex', flexDirection: 'column', minWidth: '300px', padding: '0' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid rgba(148, 163, 184, 0.2)' }}>
                    <h3 className="sidebar-title" style={{ marginBottom: '12px' }}>DEGs</h3>
                    <div className="field">
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>COMPARE GROUP VS REST</label>
                        <select
                            value={selectedGroup || ''}
                            onChange={(e) => setSelectedGroup(e.target.value)}
                            style={{ width: '100%' }}
                        >
                            {groups.length === 0 && <option value="">Loading groups...</option>}
                            {groups.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                </div>

                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {loading && <div style={{ padding: '1rem', color: '#64748b', textAlign: 'center' }}>Loading analysis...</div>}
                    {error && <div style={{ padding: '1rem', color: '#ef4444' }}>Error: {error}</div>}

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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 'min-content' }}>
                    {/* Top: MA Plot */}
                    <div className="embedding-card" style={{ minHeight: '350px' }}>
                        <div className="embedding-header">
                            <div className="embedding-title" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                <h2>MA PLOT</h2>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                                    <span style={{ color: '#64748b' }}>X:</span>
                                    <input
                                        type="number"
                                        placeholder="Min"
                                        value={maXMin}
                                        onChange={e => setMaXMin(e.target.value)}
                                        style={{
                                            width: '60px',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(148, 163, 184, 0.4)',
                                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                            color: '#e2e8f0',
                                            fontSize: '0.75rem'
                                        }}
                                    />
                                    <span style={{ color: '#64748b' }}>-</span>
                                    <input
                                        type="number"
                                        placeholder="Max"
                                        value={maXMax}
                                        onChange={e => setMaXMax(e.target.value)}
                                        style={{
                                            width: '60px',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(148, 163, 184, 0.4)',
                                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                            color: '#e2e8f0',
                                            fontSize: '0.75rem'
                                        }}
                                    />
                                    <span style={{ color: '#64748b', marginLeft: '8px' }}>Y:</span>
                                    <input
                                        type="number"
                                        placeholder="Min"
                                        value={maYMin}
                                        onChange={e => setMaYMin(e.target.value)}
                                        style={{
                                            width: '60px',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(148, 163, 184, 0.4)',
                                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                            color: '#e2e8f0',
                                            fontSize: '0.75rem'
                                        }}
                                    />
                                    <span style={{ color: '#64748b' }}>-</span>
                                    <input
                                        type="number"
                                        placeholder="Max"
                                        value={maYMax}
                                        onChange={e => setMaYMax(e.target.value)}
                                        style={{
                                            width: '60px',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(148, 163, 184, 0.4)',
                                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                            color: '#e2e8f0',
                                            fontSize: '0.75rem'
                                        }}
                                    />
                                    <button
                                        onClick={() => {
                                            setMaXMin('');
                                            setMaXMax('');
                                            setMaYMin('');
                                            setMaYMax('');
                                        }}
                                        style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(148, 163, 184, 0.4)',
                                            backgroundColor: 'transparent',
                                            color: '#94a3b8',
                                            fontSize: '0.7rem',
                                            cursor: 'pointer',
                                            marginLeft: '4px'
                                        }}
                                    >
                                        Reset
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (dataRanges) {
                                                setMaXMin(String(dataRanges.xMin));
                                                setMaXMax(String(dataRanges.xMax));
                                                setMaYMin(String(dataRanges.yMin));
                                                setMaYMax(String(dataRanges.yMax));
                                            }
                                        }}
                                        style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(148, 163, 184, 0.4)',
                                            backgroundColor: 'transparent',
                                            color: '#94a3b8',
                                            fontSize: '0.7rem',
                                            cursor: 'pointer',
                                            marginLeft: '4px'
                                        }}
                                    >
                                        Auto
                                    </button>
                                    <SaveButton onClick={() => handleSavePlot(maPlotRef, 'ma_plot')} />
                                </div>
                            </div>
                        </div>
                        <div className="embedding-canvas" style={{ flex: 1, position: 'relative' }}>
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
                    <div className="embedding-card" style={{ minHeight: '300px' }}>
                        <div className="embedding-header">
                            <div className="embedding-title" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <h2>EXPRESSION DISTRIBUTION</h2>
                                    {selectedGene && <span className="embedding-count">{selectedGene}</span>}
                                    {selectedGene && <SaveButton onClick={() => handleSavePlot(exprPlotRef, `expression_${selectedGene}`)} />}
                                </div>
                                {selectedGene && onViewGene && (
                                    <button
                                        onClick={() => onViewGene(selectedGene)}
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid rgba(148, 163, 184, 0.4)',
                                            color: '#94a3b8',
                                            borderRadius: '4px',
                                            padding: '4px 8px',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                        onMouseOver={e => { e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.borderColor = '#3b82f6'; }}
                                        onMouseOut={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.4)'; }}
                                    >
                                        <span>🎨 View in Embedding</span>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="embedding-canvas" style={{ flex: 1, position: 'relative' }}>
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
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'rgba(226, 232, 240, 0.5)',
            fontSize: '0.9rem'
        }}>
            {message}
        </div>
    );
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

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <span style={{ opacity: 0.2, marginLeft: 4 }}>⇅</span>;
        return <span style={{ marginLeft: 4 }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Filter Controls */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '0.8rem',
                backgroundColor: 'rgba(241, 245, 249, 0.5)'
            }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontWeight: 600, color: '#64748b' }}>Min |LFC|</label>
                        <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={minLfc}
                            onChange={e => setMinLfc(parseFloat(e.target.value) || 0)}
                            style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.8rem',
                                width: '100%'
                            }}
                        />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontWeight: 600, color: '#64748b' }}>Max Adj P</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={maxPval}
                            onChange={e => setMaxPval(parseFloat(e.target.value) || 0)}
                            style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.8rem',
                                width: '100%'
                            }}
                        />
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                        type="checkbox"
                        id="onlyPositive"
                        checked={onlyPositive}
                        onChange={e => setOnlyPositive(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                    />
                    <label htmlFor="onlyPositive" style={{ cursor: 'pointer', color: '#475569', fontWeight: 500 }}>
                        Positive LFC only
                    </label>
                </div>
            </div>

            {/* Header */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr 1fr',
                padding: '10px 16px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#64748b',
                borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                backgroundColor: 'rgba(248, 250, 252, 0.8)',
                position: 'sticky',
                top: 0
            }}>
                <span
                    onClick={() => handleSort('name')}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                    GENE <SortIcon column="name" />
                </span>
                <span
                    onClick={() => handleSort('logfoldchanges')}
                    style={{ textAlign: 'right', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
                >
                    LFC <SortIcon column="logfoldchanges" />
                </span>
                <span
                    onClick={() => handleSort('pvals_adj')}
                    style={{ textAlign: 'right', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
                >
                    ADJ P <SortIcon column="pvals_adj" />
                </span>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {processedGenes.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                        No genes match criteria.
                    </div>
                ) : (
                    processedGenes.map(gene => {
                        const isActive = selectedGene === gene.name;
                        return (
                            <div
                                key={gene.id}
                                onClick={() => onSelect(gene.name)}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1.5fr 1fr 1fr',
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                    backgroundColor: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                    borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                                    fontSize: '0.85rem',
                                    alignItems: 'center',
                                    transition: 'background-color 0.15s ease'
                                }}
                                className={!isActive ? "hover:bg-slate-50" : ""}
                            >
                                <span style={{ fontWeight: 500, color: '#1e293b' }}>{gene.name}</span>
                                <span style={{ textAlign: 'right', color: gene.logfoldchanges > 0 ? '#ef4444' : '#3b82f6', fontWeight: 500 }}>
                                    {gene.logfoldchanges.toFixed(2)}
                                </span>
                                <span style={{ textAlign: 'right', color: '#64748b', fontSize: '0.8rem' }}>
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

const GeneExpressionPlot = React.forwardRef(({ gene }, ref) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!gene) return;

        let ignore = false;
        setLoading(true);

        const fetchData = async () => {
            try {
                const encoded = encodeURIComponent(gene);
                const res = await fetch(`${API_BASE}/api/dataset/gene_expression?gene=${encoded}`);
                if (!res.ok) throw new Error("Failed to fetch");
                const json = await res.json();
                if (!ignore) setData(json);
            } catch (err) {
                console.error(err);
            } finally {
                if (!ignore) setLoading(false);
            }
        };

        fetchData();

        return () => { ignore = true; };
    }, [gene]);

    if (loading) return <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Loading expression data...</div>;
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
            fetch(`${API_BASE}/api/dataset/pathways/categories`)
                .then(res => res.json())
                .then(data => {
                    setPresetCategories(data);
                    if (data.length > 0) setSelectedCategory(data[0]);
                })
                .catch(err => console.error(err))
                .finally(() => setLoadingPresets(false));
        }
    }, [inputMode]);

    // Fetch pathways when category changes
    useEffect(() => {
        if (!selectedCategory) return;
        setLoadingPresets(true);
        fetch(`${API_BASE}/api/dataset/pathways/${selectedCategory}/pathways`)
            .then(res => res.json())
            .then(data => {
                setPresetPathways(data);
                setSelectedPathway(''); // Reset pathway selection
            })
            .catch(err => console.error(err))
            .finally(() => setLoadingPresets(false));
    }, [selectedCategory]);

    // Fetch genes when pathway changes
    useEffect(() => {
        if (!selectedPathway || !selectedCategory) return;
        setLoadingPresets(true);
        // Use encodeURIComponent for safety, though backend expects path param
        const safeCat = selectedCategory;
        const safePath = selectedPathway; // Don't encode entire path if backend decodes, but let's see. 
        // FastAPI decodes path params automatically. 
        // However, if pathway has slash, it might break. 
        // Assuming names are simple or we encode.
        // Let's encode just to be safe if names have weird chars.
        fetch(`${API_BASE}/api/dataset/pathways/${safeCat}/${encodeURIComponent(safePath)}/genes`)
            .then(res => res.json())
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

            const params = new URLSearchParams({
                genes: normalizedGenes,
                groupby: selectedGroupby,
                signature_name: signatureName || 'signature'
            });

            const res = await fetch(`${API_BASE}/api/dataset/gene_signature_violin?${params}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to compute signature');
            }
            const data = await res.json();
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
        <div className="embedding-card" style={{ minHeight: `${cardMinHeight}px`, flex: 'none' }}>
            <div className="embedding-header">
                <div className="embedding-title" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h2>GENE SIGNATURE SCORING</h2>
                        {signatureData && (
                            <span className="embedding-count">
                                {signatureData.genes_found.length} genes
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {signatureData && <SaveButton onClick={() => handleSavePlot(sigPlotRef, `signature_${signatureData.signature_name}`)} />}
                        {signatureData && onViewSignature && (
                        <button
                            onClick={handleViewInEmbedding}
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(148, 163, 184, 0.4)',
                                color: '#94a3b8',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                            onMouseOver={e => { e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.borderColor = '#3b82f6'; }}
                            onMouseOut={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.4)'; }}
                        >
                            <span>🎨 View in Embedding</span>
                        </button>
                    )}
                </div>
            </div>
            </div>

            {/* Input Controls */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                backgroundColor: 'rgba(30, 41, 59, 0.3)'
            }}>
                {/* Input Mode Toggle */}
                <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#94a3b8', fontSize: '0.8rem' }}>
                        <input
                            type="radio"
                            name="inputMode"
                            checked={inputMode === 'manual'}
                            onChange={() => setInputMode('manual')}
                            style={{ accentColor: '#3b82f6' }}
                        />
                        Manual Input
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#94a3b8', fontSize: '0.8rem' }}>
                        <input
                            type="radio"
                            name="inputMode"
                            checked={inputMode === 'file'}
                            onChange={() => setInputMode('file')}
                            style={{ accentColor: '#3b82f6' }}
                        />
                        Upload File
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#94a3b8', fontSize: '0.8rem' }}>
                        <input
                            type="radio"
                            name="inputMode"
                            checked={inputMode === 'preset'}
                            onChange={() => setInputMode('preset')}
                            style={{ accentColor: '#3b82f6' }}
                        />
                        Preset Pathways
                    </label>
                </div>

                {/* Preset Selection UI */}
                {inputMode === 'preset' && (
                    <div style={{
                        display: 'flex',
                        gap: '12px',
                        marginBottom: '12px',
                        padding: '12px',
                        backgroundColor: 'rgba(15, 23, 42, 0.4)',
                        borderRadius: '6px',
                        flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                                    CATEGORY
                                </label>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '6px 10px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(148, 163, 184, 0.3)',
                                        backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                        color: '#e2e8f0',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    {presetCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                                    PATHWAY
                                </label>
                                <select
                                    value={selectedPathway}
                                    onChange={(e) => setSelectedPathway(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '6px 10px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(148, 163, 184, 0.3)',
                                        backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                        color: '#e2e8f0',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    <option value="">Select a pathway...</option>
                                    {presetPathways.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                        </div>
                        {geneInput && (
                            <div style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center' }}>
                                {loadingPresets ? 'Loading genes...' : `Loaded ${geneInput.split(',').length} genes`}
                            </div>
                        )}
                    </div>
                )}

                {/* Gene Input */}
                {inputMode === 'manual' ? (
                    <textarea
                        value={geneInput}
                        onChange={(e) => setGeneInput(e.target.value)}
                        placeholder="Enter genes (one per line or separated by commas)"
                        style={{
                            width: '100%',
                            minHeight: '60px',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid rgba(148, 163, 184, 0.3)',
                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                            color: '#e2e8f0',
                            fontSize: '0.85rem',
                            resize: 'vertical',
                            fontFamily: 'monospace'
                        }}
                    />
                ) : inputMode === 'file' ? (
                    <div style={{
                        border: '2px dashed rgba(148, 163, 184, 0.3)',
                        borderRadius: '6px',
                        padding: '16px',
                        textAlign: 'center',
                        backgroundColor: 'rgba(15, 23, 42, 0.4)'
                    }}>
                        <input
                            type="file"
                            accept=".txt,.csv"
                            onChange={handleFileUpload}
                            style={{ display: 'none' }}
                            id="gene-file-upload"
                        />
                        <label
                            htmlFor="gene-file-upload"
                            style={{
                                cursor: 'pointer',
                                color: '#94a3b8',
                                fontSize: '0.85rem'
                            }}
                        >
                            📁 Click to upload a text file (one gene per line)
                        </label>
                        {geneInput && (
                            <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                                Loaded: {geneInput.split(',').filter(g => g.trim()).length} genes
                            </div>
                        )}
                    </div>
                ) : null}

                {/* Options Row */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                            GROUP BY
                        </label>
                        <select
                            value={selectedGroupby}
                            onChange={(e) => setSelectedGroupby(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '6px 10px',
                                borderRadius: '4px',
                                border: '1px solid rgba(148, 163, 184, 0.3)',
                                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                color: '#e2e8f0',
                                fontSize: '0.85rem'
                            }}
                        >
                            {categoricalAttributes.map(attr => (
                                <option key={attr.name} value={attr.name}>{attr.label || attr.name}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                            SIGNATURE NAME
                        </label>
                        <input
                            type="text"
                            value={signatureName}
                            onChange={(e) => setSignatureName(e.target.value)}
                            placeholder="signature"
                            style={{
                                width: '100%',
                                padding: '6px 10px',
                                borderRadius: '4px',
                                border: '1px solid rgba(148, 163, 184, 0.3)',
                                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                color: '#e2e8f0',
                                fontSize: '0.85rem'
                            }}
                        />
                    </div>
                    <button
                        onClick={handleCompute}
                        disabled={loading || !geneInput.trim() || !selectedGroupby}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: loading ? '#475569' : '#3b82f6',
                            color: '#fff',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'background-color 0.2s',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {loading ? 'Computing...' : 'Compute'}
                    </button>
                </div>

                {/* Feedback Messages */}
                {error && (
                    <div style={{ marginTop: '8px', padding: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px', color: '#f87171', fontSize: '0.8rem' }}>
                        {error}
                    </div>
                )}
                {signatureData && signatureData.genes_not_found.length > 0 && (
                    <div style={{ marginTop: '8px', padding: '8px', backgroundColor: 'rgba(251, 191, 36, 0.1)', borderRadius: '4px', color: '#fbbf24', fontSize: '0.8rem' }}>
                        ⚠️ Genes not found: {signatureData.genes_not_found.join(', ')}
                    </div>
                )}
            </div>

            {/* Violin Plot */}
            <div className="embedding-canvas" style={{ flex: 1, position: 'relative', minHeight: signatureData ? '300px' : '60px' }}>
                {loading ? (
                    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                        Computing signature scores...
                    </div>
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
            const params = new URLSearchParams({
                group: selectedGroup,
                min_lfc: minLfc.toString(),
                max_pval: maxPval.toString(),
            });

            const res = await fetch(`${API_BASE}/api/dataset/go_enrichment?${params}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to run GO enrichment');
            }
            const data = await res.json();
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
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `GO_enrichment_${selectedGroup}_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
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
        <div className="embedding-card" style={{ minHeight: `${cardMinHeight}px`, flex: 'none' }}>
            <div className="embedding-header">
                <div className="embedding-title" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h2>GO ENRICHMENT</h2>
                        {enrichmentData && enrichmentData.terms.length > 0 && (
                            <span className="embedding-count">
                                {enrichmentData.filtered_genes.length} genes → {enrichmentData.terms.length} terms
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Top N selector */}
                        <select
                            value={topN}
                            onChange={(e) => setTopN(Number(e.target.value))}
                            style={{
                                padding: '5px 8px',
                                borderRadius: '4px',
                                border: '1px solid rgba(148, 163, 184, 0.3)',
                                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                color: '#e2e8f0',
                                fontSize: '0.75rem'
                            }}
                        >
                            <option value={10}>Top 10</option>
                            <option value={20}>Top 20</option>
                            <option value={30}>Top 30</option>
                        </select>

                        {/* Download button */}
                        {enrichmentData && enrichmentData.terms.length > 0 && (
                            <button
                                onClick={downloadCSV}
                                style={{
                                    padding: '5px 10px',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(148, 163, 184, 0.4)',
                                    backgroundColor: 'transparent',
                                    color: '#94a3b8',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    transition: 'all 0.2s'
                                }}
                                onMouseOver={e => { e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.borderColor = '#3b82f6'; }}
                                onMouseOut={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.4)'; }}
                                title="Download full enrichment table as CSV"
                            >
                                📥 CSV
                            </button>
                        )}

                        {enrichmentData && enrichmentData.terms.length > 0 && (
                            <SaveButton onClick={() => handleSavePlot(goPlotRef, `GO_enrichment_${selectedGroup}`)} />
                        )}

                        {/* Run button */}
                        <button
                            onClick={runEnrichment}
                            disabled={loading || !selectedGroup}
                            style={{
                                padding: '6px 16px',
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: loading ? '#475569' : '#10b981',
                                color: '#fff',
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                cursor: loading || !selectedGroup ? 'not-allowed' : 'pointer',
                                transition: 'background-color 0.2s',
                            }}
                        >
                            {loading ? 'Analyzing...' : '🧬 Run Enrichment'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Info Bar */}
            <div style={{
                padding: '8px 16px',
                backgroundColor: 'rgba(30, 41, 59, 0.3)',
                borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                fontSize: '0.75rem',
                color: '#94a3b8'
            }}>
                Using filters: Min LFC ≥ {minLfc}, Adj P ≤ {maxPval} (positive LFC only)
            </div>

            {/* Error */}
            {error && (
                <div style={{ padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', fontSize: '0.8rem' }}>
                    {error}
                </div>
            )}

            {/* Plot Area */}
            <div className="embedding-canvas" style={{ flex: 1, position: 'relative', minHeight: enrichmentData ? `${getPlotHeight()}px` : '80px' }}>
                {loading ? (
                    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
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
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#94a3b8',
                        gap: '8px'
                    }}>
                        <span>No enriched GO terms found</span>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
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
