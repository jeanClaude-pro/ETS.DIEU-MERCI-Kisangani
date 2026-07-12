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
    <div className="flex w-full sm:w-auto rounded-lg border border-gray-300 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value || "all"}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 sm:flex-none px-3 py-2 text-sm transition-colors whitespace-nowrap ${
            value === opt.value
              ? "bg-blue-500 text-white"
              : "bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

export default RegionFilterPills;
