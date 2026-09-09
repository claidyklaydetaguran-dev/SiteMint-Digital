import { createRoot } from "react-dom/client";
import App from "./App";
import { purgeLegacyMotionPref } from "@/components/v5/motionPref";
import "./index.css";

// The retired "Reduce animation" switch (removed 2026-09-09) persisted its
// state in localStorage. Clear any leftover value before the first paint so
// a returning visitor who once turned it off is not left with a frozen hero
// and no control to undo it. Accessibility still follows the operating
// system's own reduced-motion setting.
purgeLegacyMotionPref();

createRoot(document.getElementById("root")!).render(<App />);
