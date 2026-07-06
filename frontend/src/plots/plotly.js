// Single shared Plotly binding. Both plot views must import Plot from here so
// the app bundles Plotly exactly once, via the lightweight `plotly.js-dist-min`
// build (NOT react-plotly.js's default entry, which pulls in the full plotly.js).
import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";

const Plot = createPlotlyComponent(Plotly);

export default Plot;
export { Plotly };
