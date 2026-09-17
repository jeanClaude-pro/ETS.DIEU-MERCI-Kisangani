import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Existing operational tables remain semantic tables on larger screens. On
// phones, this adds their column headings as labels so CSS can present each row
// as a readable native-style record card without duplicating page data/actions.
export default function ResponsiveTableEnhancer() {
  const location = useLocation();
  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll<HTMLTableElement>(".app-main table").forEach((table) => {
        table.classList.add("responsive-data-table");
        const headings = Array.from(table.querySelectorAll("thead th")).map((heading) => heading.textContent?.trim() || "");
        table.querySelectorAll("tbody tr").forEach((row) => {
          Array.from(row.children).forEach((cell, index) => {
            if (cell instanceof HTMLTableCellElement) cell.dataset.label = headings[index] || "Détail";
          });
        });
      });
    };
    enhance();
    const observer = new MutationObserver(enhance);
    const main = document.querySelector(".app-main");
    if (main) observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname]);
  return null;
}
