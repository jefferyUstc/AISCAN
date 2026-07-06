// Trigger a browser download from a Blob. Centralizes the anchor dance so
// callers don't each re-implement (and each subtly differ on) cleanup.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  URL.revokeObjectURL(url);
}

// Trigger a download from an already-formed URL (e.g. a data: URL).
export function downloadUrl(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function downloadText(text, filename, type = "text/plain") {
  downloadBlob(new Blob([text], { type }), filename);
}
