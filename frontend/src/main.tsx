import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installGlobalErrorLogging } from "./lib/globalErrorLogging";
import { installZodErrorMap } from "./lib/i18n/zodErrorMap";

installGlobalErrorLogging();
installZodErrorMap();

createRoot(document.getElementById("root")!).render(<App />);
