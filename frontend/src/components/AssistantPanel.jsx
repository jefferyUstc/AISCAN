import PropTypes from "prop-types";
import { useEffect, useMemo, useRef } from "react";
import MarkdownMessage from "./MarkdownMessage.jsx";

function MessageAnnotations({ annotations, activeObsDimension, onSwitchObsDimension }) {
  const title = typeof annotations?.title === "string" ? annotations.title.trim() : "";
  const summary = typeof annotations?.summary === "string" ? annotations.summary.trim() : "";
  const citations = Array.isArray(annotations?.citations)
    ? annotations.citations.filter(Boolean).map((item) => String(item))
    : [];
  const filters = Array.isArray(annotations?.filters) ? annotations.filters : [];
  const filterDimensions = useMemo(() => {
    const dims = new Set();
    filters.forEach((f) => {
      const dim = String(f?.dimension || "").trim();
      if (dim) dims.add(dim);
    });
    return Array.from(dims);
  }, [filters]);

  if (!title && !summary && citations.length === 0 && filters.length === 0) return null;

  return (
    <div className="assistant-annotations">
      {title ? <div className="assistant-annotation-title">{title}</div> : null}

      {summary ? (
        <div className="assistant-annotation-block assistant-summary">
          <div className="assistant-annotation-label">Summary</div>
          <MarkdownMessage content={summary} className="assistant-annotation-body" />
        </div>
      ) : null}

      {citations.length ? (
        <details className="assistant-annotation-block assistant-citations">
          <summary className="assistant-annotation-label">
            Sources <span className="assistant-annotation-count">({citations.length})</span>
          </summary>
          <ol className="assistant-citations-list">
            {citations.map((citation, index) => (
              <li key={`citation-${index}`}>
                <MarkdownMessage content={citation} className="assistant-citation" />
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {filters.length ? (
        <details className="assistant-annotation-block assistant-filters" open>
          <summary className="assistant-annotation-label">
            Filters <span className="assistant-annotation-count">({filters.length})</span>
          </summary>
          <ul className="assistant-filters-list">
            {filters.map((filter, index) => (
              <li key={`filter-${index}`}>
                <code>{String(filter?.dimension || "")}:{String(filter?.value || "")}</code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {typeof onSwitchObsDimension === "function" &&
      filterDimensions.length > 0 &&
      activeObsDimension &&
      filterDimensions.some((dim) => dim !== activeObsDimension) ? (
        <div className="assistant-annotation-block assistant-filter-hint">
          <div className="assistant-annotation-label">维度提示</div>
          <div className="assistant-annotation-body">
            <div style={{ marginBottom: 6 }}>
              当前分类维度是 <code>{activeObsDimension}</code>，但筛选包含{" "}
              {filterDimensions
                .filter((dim) => dim !== activeObsDimension)
                .map((dim) => (
                  <code key={`dim-${dim}`} style={{ marginRight: 6 }}>
                    {dim}
                  </code>
                ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {filterDimensions
                .filter((dim) => dim !== activeObsDimension)
                .map((dim) => (
                  <button
                    key={`switch-${dim}`}
                    type="button"
                    className="small-btn"
                    onClick={() => onSwitchObsDimension(dim)}
                    title={`切换到 ${dim} 并应用筛选`}
                  >
                    切换到 {dim}
                  </button>
                ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AssistantPanel({
  messages,
  isLoading,
  onSend,
  datasetContext,
  onClose,
  activeObsDimension,
  onSwitchObsDimension,
}) {
  const placeholder = useMemo(() => {
    if (!datasetContext?.datasetId) return "Ask about your dataset";
    return `Ask me anything about ${datasetContext.datasetId}…`;
  }, [datasetContext]);

  const messagesRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  const handleMessagesScroll = () => {
    const el = messagesRef.current;
    if (!el) return;
    const threshold = 140;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < threshold;
  };

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (shouldAutoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isLoading]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const form = event.target;
    const textarea = form.elements.prompt;
    const value = textarea.value;
    if (!value.trim()) return;
    onSend(value, datasetContext);
    textarea.value = "";
  };

  return (
    <section className="chat-panel drawer-mode">
      <header>
        <div className="chat-panel-title">
          <strong>AI Assistant</strong>
          <span className="chat-panel-subtitle">Conversational Analysis</span>
        </div>
        <div className="chat-header-actions">
          {isLoading && <span className="chat-status">Thinking…</span>}
          {onClose && (
            <button className="chat-close-btn" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </header>
      <div
        className="chat-messages"
        data-testid="chat-messages"
        ref={messagesRef}
        onScroll={handleMessagesScroll}
      >
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <MarkdownMessage content={message.content} />
            {message.role === "assistant" ? (
              <MessageAnnotations
                annotations={message.annotations}
                activeObsDimension={activeObsDimension}
                onSwitchObsDimension={onSwitchObsDimension}
              />
            ) : null}
          </div>
        ))}
        {isLoading ? (
          <div className="message assistant" style={{ opacity: 0.7 }}>
            <span>Processing request…</span>
          </div>
        ) : null}
      </div>
      <div className="chat-input">
        <form onSubmit={handleSubmit}>
          <textarea
            name="prompt"
            placeholder={placeholder}
            rows={2}
            aria-label="Enter prompt"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading}>
            Send
          </button>
        </form>
      </div>
    </section>
  );
}

MessageAnnotations.propTypes = {
  annotations: PropTypes.shape({
    title: PropTypes.string,
    summary: PropTypes.string,
    filters: PropTypes.arrayOf(
      PropTypes.shape({
        dimension: PropTypes.string,
        value: PropTypes.string,
      })
    ),
    citations: PropTypes.arrayOf(PropTypes.string),
  }),
  activeObsDimension: PropTypes.string,
  onSwitchObsDimension: PropTypes.func,
};

MessageAnnotations.defaultProps = {
  annotations: null,
  activeObsDimension: null,
  onSwitchObsDimension: null,
};

AssistantPanel.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      role: PropTypes.oneOf(["user", "assistant"]).isRequired,
      content: PropTypes.string.isRequired,
      annotations: PropTypes.shape({
        title: PropTypes.string,
        summary: PropTypes.string,
        filters: PropTypes.arrayOf(
          PropTypes.shape({
            dimension: PropTypes.string,
            value: PropTypes.string,
          })
        ),
        citations: PropTypes.arrayOf(PropTypes.string),
      }),
    })
  ).isRequired,
  isLoading: PropTypes.bool,
  onSend: PropTypes.func.isRequired,
  datasetContext: PropTypes.shape({
    datasetId: PropTypes.string,
    activeEmbedding: PropTypes.string,
  }),
  onClose: PropTypes.func,
  activeObsDimension: PropTypes.string,
  onSwitchObsDimension: PropTypes.func,
};

AssistantPanel.defaultProps = {
  isLoading: false,
  datasetContext: null,
  onClose: null,
  activeObsDimension: null,
  onSwitchObsDimension: null,
};
