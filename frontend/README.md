# AISCAN frontend

React + Vite single-page app for the AISCAN exploration experience.

## Prerequisites

- Node.js 18+
- npm 9+ (or pnpm/yarn if preferred)

## Environment


Set `VITE_API_BASE_URL` to override the backend origin for API calls. When unset, the dev server proxies `/api` to `http://localhost:8000`. You can create a `.env.local` file:

```
VITE_API_BASE_URL=http://localhost:8000
```

## Development

```bash
npm run dev
```

This starts Vite on http://localhost:5173 and proxies `/api/*` requests to the backend.

## Production build

```bash
npm run build
npm run preview
```

The build output lives under `dist/` and can be served by any static host.

The UI fetches metadata and embeddings from the FastAPI backend.

To switch datasets:
1. Replace the `.h5ad` file in `backend/data/`.
2. Refresh the browser.
The interface will automatically update to reflect the new dataset.
