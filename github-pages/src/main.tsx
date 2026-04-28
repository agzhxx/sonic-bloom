import { createRoot } from "react-dom/client";
import { SonicBloom } from "../../app/SonicBloom";
import "../../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Sonic Bloom root element was not found.");
}

createRoot(root).render(<SonicBloom />);
