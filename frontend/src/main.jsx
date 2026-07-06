import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./components/App.jsx";
import { queryClient } from "./api/queryClient.js";
import { VizProvider } from "./state/VizContext.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <VizProvider>
        <App />
      </VizProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
