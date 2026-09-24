import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getCachedCategories, refreshCategorySnapshot } from "../services/offlineCategorySnapshot";
import type { Category } from "../types";

type Props = {
  selectedCategory: string;
  setSelectedCategory: (categoryName: string) => void;
  emptyLabel?: string;
  emptyValue?: string;
  showSearch?: boolean;
  /** Lets a surrounding <label htmlFor> name the select. */
  id?: string;
};

const CategoriesDropdown = ({
  selectedCategory,
  setSelectedCategory,
  emptyLabel = "Sélectionner la catégorie",
  emptyValue = "",
  showSearch = true,
  id,
}: Props) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      // Hydrate from the durable local cache first so the filter never goes
      // blank just because the network call hasn't resolved (or fails) —
      // mirrors NewSale.tsx's product-snapshot hydration pattern.
      const cached = await getCachedCategories().catch(() => []);
      if (!cancelled && cached.length) {
        setCategories(cached.map((category) => ({ _id: category.id, name: category.name, description: "" })));
        setLoading(false);
      }

      try {
        const token = localStorage.getItem("authToken") || localStorage.getItem("token") || "";
        const fresh = await refreshCategorySnapshot(token);
        if (!cancelled) {
          setCategories([...fresh].map((category) => ({ _id: category._id, name: category.name, description: "" }))
            .sort((left, right) => left.name.localeCompare(right.name, "fr")));
          setLoadError(false);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
        // A failed refresh must never erase a previously valid local cache —
        // only surface an error when there is truly nothing to show.
        if (!cancelled && cached.length === 0) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadCategories();
    return () => { cancelled = true; };
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

  if (loading) return <div className="ui-skeleton h-11 w-full rounded-lg" role="status" aria-label="Chargement des catégories…" />;

  return (
    <div className="w-full space-y-2">
      {showSearch && categories.length > 10 && (
        <div className="relative">
          <Search aria-hidden="true" className="ui-field-icon" />
          <input
            aria-label="Rechercher une catégorie"
            className="ui-input ui-input-icon"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une catégorie…"
            type="search"
            value={query}
          />
        </div>
      )}
      <select
        id={id}
        aria-label={id ? undefined : "Catégorie"}
        value={selectedCategory}
        onChange={handleChange}
        className="ui-input"
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
        <p className="ui-error-text mt-0" role="alert">
          Les catégories n&apos;ont pas pu être chargées.
        </p>
      )}
      {!loadError && query && visibleCategories.length === 0 && (
        <p className="ui-help mt-0">Aucune catégorie correspondante.</p>
      )}
    </div>
  );
};

export default CategoriesDropdown;
