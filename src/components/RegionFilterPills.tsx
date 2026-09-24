import { REGIONS } from "../utils/constants";
import type { RegionCodeFilter } from "../types";

type Props = {
  value: RegionCodeFilter;
  onChange: (value: RegionCodeFilter) => void;
};

const RegionFilterPills = ({ value, onChange }: Props) => {
  const options: { label: string; value: RegionCodeFilter }[] = [
    { label: "Toutes régions", value: "" },
    ...REGIONS.map((r) => ({ label: `${r.region} (${r.regionCode})`, value: r.regionCode })),
  ];

  return (
    <div className="grid w-full grid-cols-3 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm sm:inline-flex sm:w-auto" role="group" aria-label="Filtrer par région">
      {options.map((opt) => (
        <button
          key={opt.value || "all"}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`min-h-11 px-2 py-1.5 text-center text-xs font-semibold leading-tight transition-colors duration-150 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:min-h-10 sm:whitespace-nowrap sm:px-3 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-slate-200 ${
            value === opt.value
              ? "bg-blue-700 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

export default RegionFilterPills;
