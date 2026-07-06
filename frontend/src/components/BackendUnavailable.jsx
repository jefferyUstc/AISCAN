import PropTypes from "prop-types";

export default function BackendUnavailable({ onRetry }) {
  return (
    <div className="app-status app-status--error" role="alert">
      <h2>Backend unavailable</h2>
      <p>
        Couldn&apos;t reach the AISCAN backend. Make sure the API server is running, then retry.
      </p>
      <button type="button" className="plot-btn plot-btn--accent" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

BackendUnavailable.propTypes = {
  onRetry: PropTypes.func.isRequired,
};
