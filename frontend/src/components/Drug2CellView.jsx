import { useState, useEffect, useMemo, useRef } from 'react';
import { apiGet, apiPost } from '../api/client.js';
import Plot from '../plots/plotly.js';
import SaveButton, { savePlotSvg } from '../plots/SaveButton.jsx';

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

    const fetchStatus = async () => {
        setStatusLoading(true);
        try {
            setStatus(await apiGet('/api/dataset/drug2cell/status'));
        } catch (err) {
            console.error('Failed to fetch status:', err);
        } finally {
            setStatusLoading(false);
        }
    };

    // Check status on mount
    useEffect(() => {
        fetchStatus();
    }, []);

    const handleCompute = async () => {
        if (!humanConfirmed) return;

        setComputing(true);
        try {
            const data = await apiPost('/api/dataset/drug2cell/compute', {
                params: { use_raw: useRaw },
            });
            setStatus(data);
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
            const data = await apiGet('/api/dataset/drug2cell/dotplot', {
                groupby: selectedGroupby,
                n_genes: nGenes,
                split_by: selectedSplitBy || undefined,
            });
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
        <div className="layout-root plot-view">
            {/* Left Column: Controls */}
            <div className="sidebar-card d2c-sidebar">

                {/* Status Card */}
                <div className="embedding-card plot-card">
                    <h3 className="plot-card-title">🧬 Drug2Cell Status</h3>

                    {statusLoading ? (
                        <div className="plot-muted">Loading status...</div>
                    ) : (
                        <div className={`d2c-status ${isReady ? "d2c-status--ready" : "d2c-status--pending"}`}>
                            <div className="d2c-status-title">
                                {isReady ? '✓ Ready' : '○ Not Computed'}
                            </div>
                            <div className="d2c-status-msg">{status?.message}</div>
                        </div>
                    )}
                </div>

                {/* Compute Section */}
                {!isReady && (
                    <div className="embedding-card plot-card">
                        <h3 className="plot-card-title">Compute Drug Scores</h3>

                        {/* Human confirmation */}
                        <label className="d2c-check d2c-check--confirm">
                            <input
                                type="checkbox"
                                checked={humanConfirmed}
                                onChange={(e) => setHumanConfirmed(e.target.checked)}
                            />
                            <span>
                                I confirm this is <strong>human</strong> gene expression data
                                <br />
                                <span className="d2c-check-sub">
                                    Drug2Cell uses ChEMBL human drug targets
                                </span>
                            </span>
                        </label>

                        {/* Use raw option */}
                        <label className="d2c-check">
                            <input
                                type="checkbox"
                                checked={useRaw}
                                onChange={(e) => setUseRaw(e.target.checked)}
                            />
                            Use raw data layer
                        </label>

                        <button
                            className="plot-btn plot-btn--success plot-btn--block"
                            onClick={handleCompute}
                            disabled={computing || !humanConfirmed}
                        >
                            {computing ? '⏳ Computing...' : '🧬 Score Cells'}
                        </button>
                    </div>
                )}

                {/* Dotplot Controls */}
                {isReady && (
                    <div className="embedding-card plot-card">
                        <h3 className="plot-card-title">Group-Specific Drugs</h3>

                        {/* Groupby selector */}
                        <div className="d2c-field">
                            <label className="d2c-label">Group By</label>
                            <select
                                className="d2c-select"
                                value={selectedGroupby}
                                onChange={(e) => setSelectedGroupby(e.target.value)}
                            >
                                {categoricalAttributes.map(attr => (
                                    <option key={attr.name} value={attr.name}>{attr.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Split By selector (visualization only) */}
                        <div className="d2c-field">
                            <label className="d2c-label">
                                Split By <span className="text-dim">(optional)</span>
                            </label>
                            <select
                                className="d2c-select"
                                value={selectedSplitBy}
                                onChange={(e) => setSelectedSplitBy(e.target.value)}
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
                        <div className="d2c-field--last">
                            <label className="d2c-label">Top Drugs per Group</label>
                            <select
                                className="d2c-select"
                                value={nGenes}
                                onChange={(e) => setNGenes(Number(e.target.value))}
                            >
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={15}>15</option>
                                <option value={20}>20</option>
                            </select>
                        </div>

                        <button
                            className="plot-btn plot-btn--accent plot-btn--block"
                            onClick={handleFetchDotplot}
                            disabled={dotplotLoading || !selectedGroupby}
                        >
                            {dotplotLoading ? '⏳ Loading...' : '📊 Show Dotplot'}
                        </button>
                    </div>
                )}

                {/* Filter Controls - only show when dotplot is ready */}
                {dotplotData && (
                    <div className="embedding-card plot-card">
                        <h3 className="plot-card-title">🔍 Filter Drugs</h3>

                        {/* Min Mean Expression */}
                        <div className="d2c-field">
                            <label className="d2c-label">
                                Min Mean Expression (all groups): {minMeanExpr.toFixed(2)}
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={minMeanExpr}
                                onChange={(e) => setMinMeanExpr(parseFloat(e.target.value))}
                                className="full-width"
                            />
                        </div>

                        {/* Min Fraction Expressing */}
                        <div className="d2c-field">
                            <label className="d2c-label">
                                Min % Expressing (all groups): {(minFracExpr * 100).toFixed(0)}%
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={minFracExpr}
                                onChange={(e) => setMinFracExpr(parseFloat(e.target.value))}
                                className="full-width"
                            />
                        </div>

                        <div className="d2c-hint">
                            Drugs where max value across all groups is below threshold will be hidden
                        </div>
                    </div>
                )}

                {/* Filter Groups */}
                {dotplotData && (
                    <div className="embedding-card plot-card">
                        <h3 className="plot-card-title">📊 Filter Groups</h3>
                        <div className="d2c-groups-count">
                            Select groups to display ({dotplotData.groups.length - hiddenGroups.size} of {dotplotData.groups.length} shown)
                        </div>
                        <div className="d2c-groups-list">
                            {dotplotData.groups.map(group => (
                                <label
                                    key={group}
                                    className={`d2c-group ${hiddenGroups.has(group) ? "d2c-group--hidden" : ""}`}
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
                        <div className="d2c-group-actions">
                            <button
                                className="d2c-group-btn d2c-group-btn--show"
                                onClick={() => setHiddenGroups(new Set())}
                            >
                                Show All
                            </button>
                            <button
                                className="d2c-group-btn d2c-group-btn--hide"
                                onClick={() => setHiddenGroups(new Set(dotplotData.groups))}
                            >
                                Hide All
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Column: Visualization */}
            <div className="plot-main">
                <div className="embedding-card d2c-plot-card">
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
                            <SaveButton onClick={() => savePlotSvg(dotplotRef, 'drug2cell_dotplot')} />
                        )}
                    </div>

                    {/* Error */}
                    {dotplotError && <div className="plot-error-bar">{dotplotError}</div>}

                    {/* Plot Area */}
                    <div className="embedding-canvas plot-canvas plot-canvas--scroll">
                        {dotplotLoading ? (
                            <div className="plot-loading">Loading dotplot...</div>
                        ) : dotplotData ? (
                            <DotplotChart
                                data={dotplotData}
                                minMeanExpr={minMeanExpr}
                                minFracExpr={minFracExpr}
                                hiddenGroups={hiddenGroups}
                                plotRef={dotplotRef}
                            />
                        ) : !isReady ? (
                            <div className="plot-empty">
                                <span>Compute Drug2Cell scores first</span>
                                <span className="plot-empty-sub">
                                    Confirm human data and click &quot;Score Cells&quot;
                                </span>
                            </div>
                        ) : (
                            <div className="plot-empty">
                                <span>Select options and click &quot;Show Dotplot&quot;</span>
                                <span className="plot-empty-sub">
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
