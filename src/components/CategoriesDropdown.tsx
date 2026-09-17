import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { serverUrl } from "../utils/constants";
import type { Category } from "../types";

type Props = {
  selectedCategory: string;
  setSelectedCategory: (categoryName: string) => void;
  emptyLabel?: string;
  emptyValue?: string;
  showSearch?: boolean;
};

const CategoriesDropdown = ({
  selectedCategory,
  setSelectedCategory,
  emptyLabel = "Sélectionner la catégorie",
  emptyValue = "",
  showSearch = true,
}: Props) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const token = localStorage.getItem("authToken") || localStorage.getItem("token") || "";
        const response = await fetch(`${serverUrl}/categories`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) {
          console.error("Failed to fetch categories:", await response.text());
          setLoadError(true);
          return;
        }
        const data = await response.json() as Category[];
        setCategories([...data].sort((left, right) => left.name.localeCompare(right.name, "fr")));
      } catch (error) {
        console.error("Error fetching categories:", error);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // We emit the NAME so it matches product.category (string) used in the filter
    setSelectedCategory(e.target.value);
  };

  const visibleCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    const matches = normalizedQuery
      ? categories.filter((category) => category.name.toLocaleLowerCase("fr").includes(normalizedQuery))
      : categories;
    const selected = categories.find((category) => category.name === selectedCategory);
    return selected && !matches.some((category) => category._id === selected._id)
      ? [selected, ...matches]
      : matches;
  }, [categories, query, selectedCategory]);

  if (loading) return <p className="py-2 text-sm text-gray-600">Chargement des catégories…</p>;

  return (
    <div className="w-full space-y-2">
      {showSearch && categories.length > 10 && (
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            aria-label="Rechercher une catégorie"
            className="min-h-11 w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-base outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 sm:text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une catégorie…"
            type="search"
            value={query}
          />
        </div>
      )}
      <select
        aria-label="Catégorie"
        value={selectedCategory}
        onChange={handleChange}
        className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 sm:text-sm"
      >
        <option value={emptyValue}>{emptyLabel}</option>
        {selectedCategory && selectedCategory !== emptyValue &&
          !categories.some((category) => category.name === selectedCategory) && (
            <option value={selectedCategory}>{selectedCategory} (catégorie existante)</option>
          )}
        {visibleCategories.map((category) => (
          <option key={category._id} value={category.name}>
            {category.name}
          </option>
        ))}
      </select>
      {loadError && (
        <p className="text-xs text-red-700" role="alert">
          Les catégories n&apos;ont pas pu être chargées.
        </p>
      )}
      {!loadError && query && visibleCategories.length === 0 && (
        <p className="text-xs text-gray-500">Aucune catégorie correspondante.</p>
      )}
    </div>
  );
};

export default CategoriesDropdown;
