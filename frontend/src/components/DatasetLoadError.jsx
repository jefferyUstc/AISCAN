import PropTypes from "prop-types";

// Shown when the dataset can't be loaded — the backend is unreachable OR an
// endpoint (overview / options) returned an error. Failing loudly beats
// rendering a silently-empty UI.
export default function DatasetLoadError({ error, onRetry }) {
  const detail = error?.message;
  return (
    <div className="app-status app-status--error" role="alert">
      <h2>Couldn&apos;t load the dataset</h2>
      <p>
        The AISCAN backend is unreachable or returned an error. Make sure the API server is
        running, then retry.
      </p>
      {detail ? <p>{detail}</p> : null}
      <button type="button" className="plot-btn plot-btn--accent" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

DatasetLoadError.propTypes = {
  error: PropTypes.shape({ message: PropTypes.string }),
  onRetry: PropTypes.func.isRequired,
};
