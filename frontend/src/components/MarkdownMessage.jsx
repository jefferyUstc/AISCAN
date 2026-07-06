import PropTypes from "prop-types";
import { useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function sanitizeHref(href) {
  if (!href) return null;
  try {
    const url = new URL(href, "https://aiscan.local");
    if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
    return href;
  } catch {
    return null;
  }
}

function SafeLink({ href, children, ...props }) {
  const safeHref = sanitizeHref(href);
  if (!safeHref) {
    return <span className="markdown-link-invalid">{children}</span>;
  }

  const isExternal = safeHref.startsWith("http://") || safeHref.startsWith("https://");
  return (
    <a
      href={safeHref}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer noopener" : undefined}
      {...props}
    >
      {children}
    </a>
  );
}

function MarkdownCode({ inline, className, children, ...props }) {
  if (inline) {
    return (
      <code className="markdown-inline-code" {...props}>
        {children}
      </code>
    );
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

// Resolves to whether the copy succeeded so the button can show feedback.
// The Async Clipboard API is available in every browser this app targets, so
// the legacy execCommand path is not worth its complexity.
function copyToClipboard(text) {
  if (!text || !navigator?.clipboard?.writeText) return Promise.resolve(false);
  return navigator.clipboard
    .writeText(text)
    .then(() => true)
    .catch(() => false);
}

function CodeBlockPre({ children }) {
  const codeElement = Array.isArray(children) ? children[0] : children;
  const className = codeElement?.props?.className || "";
  const raw = codeElement?.props?.children;
  const codeText = String(Array.isArray(raw) ? raw.join("") : raw || "").replace(/\n$/, "");
  const language = className.match(/language-([a-z0-9_-]+)/i)?.[1] || "code";

  const [copyLabel, setCopyLabel] = useState("Copy");

  const handleCopy = useCallback(async () => {
    if (!codeText) return;
    const ok = await copyToClipboard(codeText);
    setCopyLabel(ok ? "Copied" : "Copy failed");
    window.setTimeout(() => setCopyLabel("Copy"), 1200);
  }, [codeText]);

  return (
    <div className="markdown-codeblock">
      <div className="markdown-codeblock-toolbar">
        <span className="markdown-codeblock-lang">{language}</span>
        <button
          type="button"
          className="markdown-codeblock-copy"
          onClick={handleCopy}
          disabled={!codeText}
          aria-label="Copy code to clipboard"
        >
          {copyLabel}
        </button>
      </div>
      <pre>
        <code className={className}>{codeText}</code>
      </pre>
    </div>
  );
}

export default function MarkdownMessage({ content = "", className = "" }) {
  const components = useMemo(
    () => ({
      a: SafeLink,
      pre: CodeBlockPre,
      code: MarkdownCode,
    }),
    []
  );

  return (
    <div className={`message-markdown ${className || ""}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {content || ""}
      </ReactMarkdown>
    </div>
  );
}

MarkdownMessage.propTypes = {
  content: PropTypes.string,
  className: PropTypes.string,
};

