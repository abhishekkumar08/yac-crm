import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@kasumi/ui/font";
import "./index.css";
import { ThemeProvider, NotificationProvider, ErrorBoundary } from "@kasumi/ui";
import App from "@/App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider defaultMaterial="solid" storageKey="yac-crm">
      <NotificationProvider>
        <ErrorBoundary>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ErrorBoundary>
      </NotificationProvider>
    </ThemeProvider>
  </StrictMode>,
);
