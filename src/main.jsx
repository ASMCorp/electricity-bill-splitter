import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import BillForm from "./BillForm.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BillForm />
  </StrictMode>,
);
