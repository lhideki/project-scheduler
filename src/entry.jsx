import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { I18nProvider } from "./components/I18nProvider.jsx";

const root = createRoot(document.getElementById("root"));
root.render(<I18nProvider><App /></I18nProvider>);
