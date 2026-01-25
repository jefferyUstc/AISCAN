import { useState, useEffect, useMemo, useRef } from 'react';
import Plot from 'react-plotly.js';
import Plotly from 'plotly.js-dist-min';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Minimal common layout for plots
const COMMON_LAYOUT = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'rgba(15, 23, 42, 0.3)',
    font: { color: '#e2e8f0', size: 11 },
    margin: { l: 50, r: 20, t: 30, b: 50 },
    xaxis: {
        color: '#94a3b8',
        gridcolor: 'rgba(148, 163, 184, 0.1)',
        zerolinecolor: 'rgba(148, 163, 184, 0.2)',
        title: { font: { size: 11 } }
    },
    yaxis: {
        color: '#94a3b8',
        gridcolor: 'rgba(148, 163, 184, 0.1)',
        zerolinecolor: 'rgba(148, 163, 184, 0.2)',
        title: { font: { size: 11 } }
    }
};

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

export default function Drug2CellView({ obsAttributes = [] }) {
    // Status state
    const [status, setStatus] = useState(null);
    const [statusLoading, setStatusLoading] = useState(true);

    // Computing state
    const [computing, setComputing] = useState(false);
    const [useRaw, setUseRaw] = useState(false);
    const [humanConfirmed, setHumanConfirmed] = useState(false);

    // Dotplot state
    const [selectedGroupby, setSelectedGroupby] = useState('');
    const [selectedSplitBy, setSelectedSplitBy] = useState('');  // '' means no split
    const [nGenes, setNGenes] = useState(10);
    const [dotplotData, setDotplotData] = useState(null);
    const [dotplotLoading, setDotplotLoading] = useState(false);
    const [dotplotError, setDotplotError] = useState(null);
    const dotplotRef = useRef(null);

    // Dotplot filter state (frontend real-time filtering)
    const [minMeanExpr, setMinMeanExpr] = useState(0);
    const [minFracExpr, setMinFracExpr] = useState(0);
    const [hiddenGroups, setHiddenGroups] = useState(new Set());  // Groups to hide

    // Get categorical attributes for groupby selection
    const categoricalAttributes = useMemo(() => {
        return obsAttributes.filter(attr => attr.kind !== 'numeric');
    }, [obsAttributes]);

    // Auto-select first categorical attribute
    useEffect(() => {
        if (categoricalAttributes.length > 0 && !selectedGroupby) {
            const preferred = categoricalAttributes.find(a => a.name === 'leiden') || categoricalAttributes[0];
            setSelectedGroupby(preferred.name);
        }
    }, [categoricalAttributes, selectedGroupby]);

    // Check status on mount
    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        setStatusLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/dataset/drug2cell/status`);
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
            }
        } catch (err) {
            console.error('Failed to fetch status:', err);
        } finally {
            setStatusLoading(false);
        }
    };

    const handleCompute = async () => {
        if (!humanConfirmed) return;

        setComputing(true);
        try {
            const params = new URLSearchParams({ use_raw: useRaw.toString() });
            const res = await fetch(`${API_BASE}/api/dataset/drug2cell/compute?${params}`, {
                method: 'POST'
            });
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
            }
        } catch (err) {
            console.error('Compute failed:', err);
        } finally {
            setComputing(false);
        }
    };

    const handleFetchDotplot = async () => {
        if (!selectedGroupby || status?.status !== 'ready') return;

        setDotplotLoading(true);
        setDotplotError(null);
        setDotplotData(null);

        try {
            const params = new URLSearchParams({
                groupby: selectedGroupby,
                n_genes: nGenes.toString()
            });
            if (selectedSplitBy) {
                params.append('split_by', selectedSplitBy);
            }
            const res = await fetch(`${API_BASE}/api/dataset/drug2cell/dotplot?${params}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to fetch dotplot');
            }
            const data = await res.json();
            setDotplotData(data);
        } catch (err) {
            setDotplotError(err.message);
        } finally {
            setDotplotLoading(false);
        }
    };

    const isReady = status?.status === 'ready';

    // Calculate filtered drug count for header display
    const filteredDrugCount = useMemo(() => {
        if (!dotplotData) return 0;
        const allDrugs = dotplotData.drugs || [];
        if (minMeanExpr === 0 && minFracExpr === 0) return allDrugs.length;

        // Calculate max values per drug across all groups (same logic as DotplotChart)
        const drugStats = {};
        for (const drug of allDrugs) {
            drugStats[drug] = { maxMeanExpr: 0, maxFracExpr: 0 };
        }
        for (const d of (dotplotData.data || [])) {
            const stats = drugStats[d.drug];
            if (stats) {
                stats.maxMeanExpr = Math.max(stats.maxMeanExpr, d.mean_expression);
                stats.maxFracExpr = Math.max(stats.maxFracExpr, d.fraction_expressing);
            }
        }
        // Count drugs that pass filter
        return allDrugs.filter(drug => {
            const stats = drugStats[drug];
            return stats.maxMeanExpr >= minMeanExpr && stats.maxFracExpr >= minFracExpr;
        }).length;
    }, [dotplotData, minMeanExpr, minFracExpr]);

    return (
        <div className="layout-root" style={{ gap: '16px', padding: '16px' }}>
            {/* Left Column: Controls */}
            <div className="sidebar-card" style={{ width: '350px', display: 'flex', flexDirection: 'column', minWidth: '300px', padding: '16px', gap: '16px', overflowY: 'auto', maxHeight: 'calc(100vh - 100px)' }}>

                {/* Status Card */}
                <div className="embedding-card" style={{ padding: '16px', flex: 'none' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#e2e8f0' }}>
                        🧬 Drug2Cell Status
                    </h3>

                    {statusLoading ? (
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Loading status...</div>
                    ) : (
                        <div style={{
                            padding: '10px 14px',
                            borderRadius: '8px',
                            backgroundColor: isReady ? 'rgba(16, 185, 129, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                            border: `1px solid ${isReady ? 'rgba(16, 185, 129, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`,
                            color: isReady ? '#10b981' : '#fbbf24',
                            fontSize: '0.85rem'
                        }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                                {isReady ? '✓ Ready' : '○ Not Computed'}
                            </div>
                            <div style={{ opacity: 0.8, fontSize: '0.8rem' }}>
                                {status?.message}
                            </div>
                        </div>
                    )}
                </div>

                {/* Compute Section */}
                {!isReady && (
                    <div className="embedding-card" style={{ padding: '16px', flex: 'none' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#e2e8f0' }}>
                            Compute Drug Scores
                        </h3>

                        {/* Human confirmation */}
                        <label style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            marginBottom: '12px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            color: '#cbd5e1'
                        }}>
                            <input
                                type="checkbox"
                                checked={humanConfirmed}
                                onChange={(e) => setHumanConfirmed(e.target.checked)}
                                style={{ marginTop: '3px' }}
                            />
                            <span>
                                I confirm this is <strong>human</strong> gene expression data
                                <br />
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                    Drug2Cell uses ChEMBL human drug targets
                                </span>
                            </span>
                        </label>

                        {/* Use raw option */}
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            marginBottom: '16px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            color: '#cbd5e1'
                        }}>
                            <input
                                type="checkbox"
                                checked={useRaw}
                                onChange={(e) => setUseRaw(e.target.checked)}
                            />
                            Use raw data layer
                        </label>

                        <button
                            onClick={handleCompute}
                            disabled={computing || !humanConfirmed}
                            style={{
                                width: '100%',
                                padding: '10px 16px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: computing || !humanConfirmed ? '#475569' : '#10b981',
                                color: '#fff',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                cursor: computing || !humanConfirmed ? 'not-allowed' : 'pointer',
                                transition: 'background-color 0.2s'
                            }}
                        >
                            {computing ? '⏳ Computing...' : '🧬 Score Cells'}
                        </button>
                    </div>
                )}

                {/* Dotplot Controls */}
                {isReady && (
                    <div className="embedding-card" style={{ padding: '16px', flex: 'none' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#e2e8f0' }}>
                            Group-Specific Drugs
                        </h3>

                        {/* Groupby selector */}
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>
                                Group By
                            </label>
                            <select
                                value={selectedGroupby}
                                onChange={(e) => setSelectedGroupby(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(148, 163, 184, 0.3)',
                                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                    color: '#e2e8f0',
                                    fontSize: '0.85rem'
                                }}
                            >
                                {categoricalAttributes.map(attr => (
                                    <option key={attr.name} value={attr.name}>{attr.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Split By selector (visualization only) */}
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>
                                Split By <span style={{ opacity: 0.6 }}>(optional)</span>
                            </label>
                            <select
                                value={selectedSplitBy}
                                onChange={(e) => setSelectedSplitBy(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(148, 163, 184, 0.3)',
                                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                    color: '#e2e8f0',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <option value="">None</option>
                                {categoricalAttributes
                                    .filter(attr => attr.name !== selectedGroupby)
                                    .map(attr => (
                                        <option key={attr.name} value={attr.name}>{attr.name}</option>
                                    ))}
                            </select>
                        </div>

                        {/* N genes selector */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>
                                Top Drugs per Group
                            </label>
                            <select
                                value={nGenes}
                                onChange={(e) => setNGenes(Number(e.target.value))}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(148, 163, 184, 0.3)',
                                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                    color: '#e2e8f0',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={15}>15</option>
                                <option value={20}>20</option>
                            </select>
                        </div>

                        <button
                            onClick={handleFetchDotplot}
                            disabled={dotplotLoading || !selectedGroupby}
                            style={{
                                width: '100%',
                                padding: '10px 16px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: dotplotLoading ? '#475569' : '#3b82f6',
                                color: '#fff',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                cursor: dotplotLoading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {dotplotLoading ? '⏳ Loading...' : '📊 Show Dotplot'}
                        </button>
                    </div>
                )}

                {/* Filter Controls - only show when dotplot is ready */}
                {dotplotData && (
                    <div className="embedding-card" style={{ padding: '16px', flex: 'none' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#e2e8f0' }}>
                            🔍 Filter Drugs
                        </h3>

                        {/* Min Mean Expression */}
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>
                                Min Mean Expression (all groups): {minMeanExpr.toFixed(2)}
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={minMeanExpr}
                                onChange={(e) => setMinMeanExpr(parseFloat(e.target.value))}
                                style={{ width: '100%' }}
                            />
                        </div>

                        {/* Min Fraction Expressing */}
                        <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>
                                Min % Expressing (all groups): {(minFracExpr * 100).toFixed(0)}%
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={minFracExpr}
                                onChange={(e) => setMinFracExpr(parseFloat(e.target.value))}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px' }}>
                            Drugs where max value across all groups is below threshold will be hidden
                        </div>
                    </div>
                )}

                {/* Filter Groups */}
                {dotplotData && (
                    <div className="embedding-card" style={{ padding: '16px', flex: 'none' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#e2e8f0' }}>
                            📊 Filter Groups
                        </h3>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px' }}>
                            Select groups to display ({dotplotData.groups.length - hiddenGroups.size} of {dotplotData.groups.length} shown)
                        </div>
                        <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {dotplotData.groups.map(group => (
                                <label
                                    key={group}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        color: hiddenGroups.has(group) ? '#64748b' : '#e2e8f0',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        backgroundColor: hiddenGroups.has(group) ? 'transparent' : 'rgba(59, 130, 246, 0.1)'
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={!hiddenGroups.has(group)}
                                        onChange={(e) => {
                                            const newHidden = new Set(hiddenGroups);
                                            if (e.target.checked) {
                                                newHidden.delete(group);
                                            } else {
                                                newHidden.add(group);
                                            }
                                            setHiddenGroups(newHidden);
                                        }}
                                    />
                                    {group}
                                </label>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button
                                onClick={() => setHiddenGroups(new Set())}
                                style={{
                                    flex: 1,
                                    padding: '6px',
                                    fontSize: '0.75rem',
                                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                    borderRadius: '4px',
                                    color: '#93c5fd',
                                    cursor: 'pointer'
                                }}
                            >
                                Show All
                            </button>
                            <button
                                onClick={() => setHiddenGroups(new Set(dotplotData.groups))}
                                style={{
                                    flex: 1,
                                    padding: '6px',
                                    fontSize: '0.75rem',
                                    backgroundColor: 'rgba(148, 163, 184, 0.1)',
                                    border: '1px solid rgba(148, 163, 184, 0.3)',
                                    borderRadius: '4px',
                                    color: '#94a3b8',
                                    cursor: 'pointer'
                                }}
                            >
                                Hide All
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Column: Visualization */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto' }}>
                <div className="embedding-card" style={{ flex: 1, minHeight: '500px' }}>
                    <div className="embedding-header">
                        <div className="embedding-title">
                            <h2>DRUG2CELL DOTPLOT</h2>
                            {dotplotData && (
                                <span className="embedding-count">
                                    {filteredDrugCount} drugs × {dotplotData.groups.length - hiddenGroups.size} groups
                                </span>
                            )}
                        </div>
                        {dotplotData && (
                            <SaveButton onClick={() => handleSavePlot(dotplotRef, 'drug2cell_dotplot')} />
                        )}
                    </div>

                    {/* Error */}
                    {dotplotError && (
                        <div style={{ padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', fontSize: '0.8rem' }}>
                            {dotplotError}
                        </div>
                    )}

                    {/* Plot Area */}
                    <div className="embedding-canvas" style={{ flex: 1, position: 'relative', overflow: 'auto', maxHeight: '80vh' }}>
                        {dotplotLoading ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                Loading dotplot...
                            </div>
                        ) : dotplotData ? (
                            <DotplotChart
                                data={dotplotData}
                                minMeanExpr={minMeanExpr}
                                minFracExpr={minFracExpr}
                                hiddenGroups={hiddenGroups}
                                plotRef={dotplotRef}
                            />
                        ) : !isReady ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', flexDirection: 'column', gap: '8px' }}>
                                <span>Compute Drug2Cell scores first</span>
                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    Confirm human data and click "Score Cells"
                                </span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', flexDirection: 'column', gap: '8px' }}>
                                <span>Select options and click "Show Dotplot"</span>
                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    View group-specific drug signatures
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function DotplotChart({ data, minMeanExpr = 0, minFracExpr = 0, hiddenGroups = new Set(), plotRef }) {
    // Filter drugs based on thresholds
    // A drug is kept if its MAX mean_expression across all groups >= minMeanExpr
    // AND its MAX fraction_expressing across all groups >= minFracExpr
    const { filteredData, filteredDrugList, filteredGroupList } = useMemo(() => {
        const uniqueGroups = Array.isArray(data?.groups)
            ? data.groups
            : Array.from(new Set((data?.data || []).map(d => d.group)));

        // Filter groups based on hiddenGroups
        const visibleGroups = uniqueGroups.filter(g => !hiddenGroups.has(g));
        const visibleGroupSet = new Set(visibleGroups);

        const allDrugs = Array.isArray(data?.drugs)
            ? data.drugs
            : Array.from(new Set((data?.data || []).map(d => d.drug)));

        // Calculate max values per drug across VISIBLE groups only
        const drugStats = {};
        for (const drug of allDrugs) {
            drugStats[drug] = { maxMeanExpr: 0, maxFracExpr: 0 };
        }
        for (const d of (data?.data || [])) {
            if (!visibleGroupSet.has(d.group)) continue;  // Skip hidden groups
            const stats = drugStats[d.drug];
            if (stats) {
                stats.maxMeanExpr = Math.max(stats.maxMeanExpr, d.mean_expression);
                stats.maxFracExpr = Math.max(stats.maxFracExpr, d.fraction_expressing);
            }
        }

        // Filter drugs
        const keptDrugs = allDrugs.filter(drug => {
            const stats = drugStats[drug];
            return stats.maxMeanExpr >= minMeanExpr && stats.maxFracExpr >= minFracExpr;
        });

        // Filter data points (both by drugs AND by visible groups)
        const keptDrugSet = new Set(keptDrugs);
        const filtered = (data?.data || []).filter(d => keptDrugSet.has(d.drug) && visibleGroupSet.has(d.group));

        return { filteredData: filtered, filteredDrugList: keptDrugs, filteredGroupList: visibleGroups };
    }, [data, minMeanExpr, minFracExpr, hiddenGroups]);

    // Dynamic sizing: height by drugs, width by groups
    const plotHeight = useMemo(() => {
        const perDrug = 30;
        const padding = 90; // aligns with top/bottom margins to avoid excess blank space
        return Math.max(200, filteredDrugList.length * perDrug + padding);
    }, [filteredDrugList.length]);

    const plotWidth = useMemo(() => {
        const perGroup = 40;
        const padding = 240; // aligns with left/right margins and colorbar space
        return Math.max(360, filteredGroupList.length * perGroup + padding);
    }, [filteredGroupList.length]);

    const longestGroupLabel = useMemo(() => {
        return filteredGroupList.reduce((maxLen, g) => Math.max(maxLen, String(g ?? '').length), 0);
    }, [filteredGroupList]);

    const bottomMargin = useMemo(() => {
        const base = 40;
        const labelAllowance = longestGroupLabel * 6; // room for -45° labels
        return Math.min(160, Math.max(50, base + labelAllowance));
    }, [longestGroupLabel]);

    const yRange = useMemo(() => {
        if (!filteredDrugList.length) return undefined;
        const lastIdx = filteredDrugList.length - 1;
        // Tighten top/bottom padding so the x-axis sits closer to the last drug row
        return [-0.65, lastIdx + 0.65];
    }, [filteredDrugList.length]);

    // Transform data for Plotly scatter plot (dotplot style)
    const x = filteredData.map(d => d.group);
    const y = filteredData.map(d => d.drug);
    const sizes = filteredData.map(d => Math.max(3, d.fraction_expressing * 30));
    const colors = filteredData.map(d => d.mean_expression);
    const hoverText = filteredData.map(d =>
        `<b>${d.drug}</b><br>Group: ${d.group}<br>Mean expr: ${d.mean_expression.toFixed(3)}<br>% expressing: ${(d.fraction_expressing * 100).toFixed(1)}%`
    );

    return (
        <Plot
            ref={plotRef}
            data={[{
                type: 'scatter',
                mode: 'markers',
                x: x,
                y: y,
                marker: {
                    size: sizes,
                    color: colors,
                    colorscale: 'Reds',
                    showscale: true,
                    colorbar: {
                        title: { text: 'Mean Expr', font: { size: 10, color: '#94a3b8' } },
                        tickfont: { size: 9, color: '#94a3b8' },
                        len: 0.5,
                        thickness: 12
                    }
                },
                hovertemplate: '%{text}<extra></extra>',
                text: hoverText
            }]}
            layout={{
                ...COMMON_LAYOUT,
                title: false,
                height: plotHeight,
                width: plotWidth,
                xaxis: {
                    ...COMMON_LAYOUT.xaxis,
                    title: { ...COMMON_LAYOUT.xaxis.title, text: 'Group' },
                    tickangle: -45,
                    automargin: true
                },
                yaxis: {
                    ...COMMON_LAYOUT.yaxis,
                    title: { ...COMMON_LAYOUT.yaxis.title, text: '' },
                    tickfont: { size: 9, color: '#94a3b8' },
                    automargin: true,
                    categoryorder: 'array',
                    categoryarray: filteredDrugList,
                    range: yRange
                },
                margin: { l: 170, r: 70, t: 22, b: bottomMargin }
            }}
            config={{ displayModeBar: false, responsive: true }}
            useResizeHandler={true}
            style={{ width: `${plotWidth}px`, height: `${plotHeight}px` }}
        />
    );
}
