"use client";

import type React from "react";
import { useState, useEffect, useMemo } from "react";
import { Package, Plus, Search, Edit, Trash2, Eye, X } from "lucide-react";
import { toast } from "react-toastify";
import type { Product, Region } from "../../types";
import { getProductStatus, units, serverUrl, REGIONS, REGION_CODE_MAP, formatProductLabel } from "../../utils/constants";
import CategoriesDropdown from "../../components/CategoriesDropdown";
import { useConnectivity } from "../../context/ConnectivityContext";
import { EmptyState, LoadingState, PageHeader } from "../../components/ui";
import { refreshFromServer, subscribeLocal } from "../../services/offlineProductSnapshot";

interface User {
  _id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
}

export default function Products() {
  const connectivity = useConnectivity();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({
    name: "",
    description: "",
    price: 0,
    category: "",
    brand: "",
    stock: 0,
    minStock: 0,
    unit: "pcs",
    weight: 0,
    unitCost: 0,
    status: "active",
    region: "China",
    regionCode: "Cnnn",
  });

  // Get current user from localStorage
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        setCurrentUser(JSON.parse(userData));
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }
  }, []);

  const isAdmin = currentUser?.role === "admin";

  // API Functions
  const fetchProducts = async () => {
    try {
      setLoading(true);
      if (connectivity.status === "online") {
        await refreshFromServer(localStorage.getItem("token") || "");
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  const createProduct = async (productData: Partial<Product>) => {
    if (connectivity.status !== "online") {
      toast.info("Connexion requise pour ajouter un article.");
      return;
    }
    try {
      const response = await fetch(`${serverUrl}/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify(productData),
      });
      if (response.ok) {
        const newProduct = await response.json();
        setProducts((prev) => [...prev, newProduct]);
        setShowAddModal(false);
        resetForm();
        toast.success("Article ajouté avec succès");
      } else {
        toast.error("Échec de l'ajout de l'article");
      }
    } catch (error) {
      console.error("erreur d'ajout de l'Article:", error);
      toast.error("Erreur lors de l'ajout de l'article");
    }
  };

  const updateProduct = async (id: string, productData: Partial<Product>) => {
    if (connectivity.status !== "online") {
      toast.info("Connexion requise pour modifier un article.");
      return;
    }
    try {
      const response = await fetch(`${serverUrl}/products/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify(productData),
      });
      if (response.ok) {
        const updatedProduct = await response.json();
        setProducts((prev) =>
          prev.map((p) => (p._id === id ? updatedProduct : p))
        );
        setShowEditModal(false);
        resetForm();
        toast.success("Article mis à jour avec succès");
      } else {
        toast.error("Échec de la mise à jour de l'article");
      }
    } catch (error) {
      console.error("Error updating product:", error);
      toast.error("Erreur lors de la mise à jour de l'article");
    }
  };

  const deleteProduct = async (id: string) => {
    if (connectivity.status !== "online") {
      toast.info("Connexion requise pour supprimer un article.");
      return;
    }
    if (!confirm("Voulez-vous vraiment supprimer cet article ?")) return;
    try {
      const response = await fetch(`${serverUrl}/products/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      if (response.ok) {
        setProducts((prev) => prev.filter((p) => p._id !== id));
        toast.success("Article supprimé");
      } else {
        toast.error("Échec de la suppression de l'article");
      }
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("Erreur lors de la suppression de l'article");
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeLocal((snapshot) => {
      setProducts(snapshot.products.map((product) => ({
        _id: product.productId,
        name: product.name,
        description: "",
        price: product.price || 0,
        category: product.category || "",
        brand: "",
        stock: product.stock,
        minStock: product.minStock,
        unit: product.unit,
        weight: 0,
        unitCost: product.unitCost,
        status: product.status,
        region: product.region,
        regionCode: product.regionCode,
        createdAt: "",
        updatedAt: product.serverUpdatedAt || "",
      })));
      setLoading(false);
    }, () => setLoading(false));
    void fetchProducts();
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectivity.status]);

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      price: 0,
      category: "",
      brand: "",
      stock: 0,
      minStock: 0,
      unit: "pcs",
      weight: 0,
      unitCost: 0,
      status: "active",
      region: "China",
      regionCode: "Cnnn",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showEditModal && selectedProduct) {
      updateProduct(selectedProduct._id, formData);
    } else {
      createProduct(formData);
    }
  };

  const openEditModal = (product: Product) => {
    setSelectedProduct(product);
    setFormData(product);
    setShowEditModal(true);
  };

  const openViewModal = (product: Product) => {
    setSelectedProduct(product);
    setShowViewModal(true);
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = product.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesCategory =
        !selectedCategory || product.category === selectedCategory;
      const matchesRegion =
        !selectedRegion || product.region === selectedRegion;
      return matchesSearch && matchesCategory && matchesRegion;
    });
  }, [products, searchTerm, selectedCategory, selectedRegion]);

  // Function to display stock information based on user role
  const renderStockInfo = (product: Product) => {
    if (isAdmin) {
      // Admin sees exact stock numbers
      return (
        <span className="inline-flex items-center gap-2">
          <span className={`tabular-nums ${product.stock <= product.minStock ? "font-semibold text-red-700" : "text-slate-900"}`}>
            {product.stock} {product.unit}
          </span>
          {product.stock === 0 ? (
            <span className="ui-badge ui-badge-danger">Rupture</span>
          ) : product.stock <= product.minStock ? (
            <span className="ui-badge ui-badge-warning">Faible</span>
          ) : null}
        </span>
      );
    } else {
      // Staff sees stock status instead of exact numbers
      if (product.stock === 0) {
        return (
          <span className="ui-badge ui-badge-danger">En rupture</span>
        );
      } else if (product.stock <= product.minStock) {
        return (
          <span className="ui-badge ui-badge-warning">Stock faible</span>
        );
      } else {
        return (
          <span className="ui-badge ui-badge-success">En stock</span>
        );
      }
    }
  };

  // Function to display stock details in view modal based on user role
  const renderStockDetails = (product: Product) => {
    if (isAdmin) {
      // Admin sees all stock details
      return (
        <>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Stock actuel</span>
            <span
              className={`font-medium tabular-nums ${
                product.stock <= product.minStock
                  ? "text-red-700"
                  : "text-slate-900"
              }`}
            >
              {product.stock} {product.unit}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Stock minimal</span>
            <span className="font-medium tabular-nums text-slate-900">
              {product.minStock} {product.unit}
            </span>
          </div>
        </>
      );
    } else {
      // Staff sees only stock status
      return (
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">Statut du stock</span>
          {product.stock === 0 ? (
            <span className="ui-badge ui-badge-danger">En rupture</span>
          ) : product.stock <= product.minStock ? (
            <span className="ui-badge ui-badge-warning">Stock faible</span>
          ) : (
            <span className="ui-badge ui-badge-success">En stock</span>
          )}
        </div>
      );
    }
  };

  const closeFormModal = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    resetForm();
  };
  const money = (value?: number) =>
    typeof value === "number" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value) : "—";

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Stock"
        title="Articles & stock"
        description="Gérez votre catalogue d’articles, les prix et les niveaux de stock."
        meta={!isAdmin ? <span className="ui-badge ui-badge-neutral">Vue personnel</span> : undefined}
        actions={
          <button type="button" onClick={() => setShowAddModal(true)} className="ui-btn ui-btn-primary">
            <Plus />
            Ajouter un article
          </button>
        }
      />

      {/* Filters */}
      <section className="ui-card p-4 sm:p-5" aria-label="Filtres des articles">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_12rem] md:items-start">
          <div className="relative">
            <label htmlFor="product-search" className="sr-only">Rechercher un article</label>
            <Search className="ui-field-icon" aria-hidden="true" />
            <input
              id="product-search"
              type="search"
              placeholder="Rechercher un article par nom…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ui-input ui-input-icon"
            />
          </div>
          <CategoriesDropdown
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            emptyLabel="Toutes les catégories"
          />
          <div>
            <label htmlFor="product-region" className="sr-only">Région</label>
            <select
              id="product-region"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="ui-input"
            >
              <option value="">Toutes les régions</option>
              {REGIONS.map((r) => (
                <option key={r.regionCode} value={r.region}>
                  {r.region} ({r.regionCode})
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Products table */}
      <section className="ui-card overflow-hidden" aria-labelledby="products-title">
        <div className="ui-card-header">
          <h2 id="products-title" className="ui-section-title flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-700" />
            Catalogue
            {!loading && <span className="ui-badge ui-badge-neutral tabular-nums">{filteredProducts.length}</span>}
          </h2>
        </div>
        {loading ? (
          <LoadingState label="Chargement des articles…" />
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Aucun article trouvé"
            description="Modifiez la recherche ou les filtres pour afficher d’autres articles."
          />
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Article</th>
                  <th scope="col">Catégorie</th>
                  <th scope="col" className="text-right">Prix de vente</th>
                  {isAdmin && <th scope="col" className="text-right">Coût unitaire</th>}
                  <th scope="col">Stock</th>
                  <th scope="col">Statut</th>
                  <th scope="col" className="ui-sticky-end text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product, idx) => (
                  <tr key={product._id ?? idx}>
                    <td className="min-w-[14rem]">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-6 shrink-0 text-xs tabular-nums text-slate-400">{idx + 1}</span>
                        <span className="min-w-0">
                          <span className="block break-words font-medium text-slate-900">{product.name}</span>
                          {product.brand && <span className="block text-xs text-slate-500">{product.brand}</span>}
                        </span>
                        {product.regionCode && <span className="ui-tag">{product.regionCode}</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{product.category || <span className="text-slate-400">—</span>}</td>
                    <td className="ui-num whitespace-nowrap font-medium text-slate-900">{money(product.price)}</td>
                    {isAdmin && <td className="ui-num whitespace-nowrap text-slate-600">{money(product.unitCost)}</td>}
                    <td className="whitespace-nowrap">{renderStockInfo(product)}</td>
                    <td>
                      <span className={`ui-badge ${product.status === "active" ? "ui-badge-success" : "ui-badge-neutral"}`}>
                        {getProductStatus(product.status)}
                      </span>
                    </td>
                    <td className="ui-sticky-end">
                      <div className="ui-row-actions">
                        <button
                          type="button"
                          onClick={() => openViewModal(product)}
                          className="ui-icon-btn ui-icon-btn-primary"
                          aria-label={`Voir ${product.name}`}
                          title="Voir"
                        >
                          <Eye />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(product)}
                              className="ui-icon-btn ui-icon-btn-warning"
                              aria-label={`Modifier ${product.name}`}
                              title="Modifier"
                            >
                              <Edit />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteProduct(product._id)}
                              className="ui-icon-btn ui-icon-btn-danger"
                              aria-label={`Supprimer ${product.name}`}
                              title="Supprimer"
                            >
                              <Trash2 />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add/Edit Product Modal - Only for Admin */}
      {(showAddModal || showEditModal) && isAdmin && (
        <div className="ui-dialog-overlay" role="presentation">
          <form onSubmit={handleSubmit} className="ui-dialog max-w-3xl" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
            <div className="ui-dialog-header">
              <div>
                <h2 id="product-form-title" className="ui-dialog-title">
                  {showEditModal ? "Modifier l'article" : "Ajouter un article"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">Les champs marqués <span className="ui-required">*</span> sont obligatoires.</p>
              </div>
              <button type="button" onClick={closeFormModal} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Basic Information */}
                <fieldset className="space-y-4">
                  <legend className="ui-kicker mb-3">Informations générales</legend>

                  <div>
                    <label htmlFor="product-name" className="ui-label">Nom de l'article <span className="ui-required">*</span></label>
                    <input
                      id="product-name"
                      type="text"
                      required
                      value={formData.name}
                      readOnly={showEditModal}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      className={`ui-input ${showEditModal ? "cursor-not-allowed bg-slate-50 text-slate-600" : ""}`}
                    />
                    {showEditModal && (
                      <p className="ui-help">Le nom original est permanent et ne peut pas être traduit.</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="product-description" className="ui-label">Description</label>
                    <textarea
                      id="product-description"
                      rows={3}
                      value={formData.description}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      className="ui-input"
                    />
                  </div>

                  <div>
                    <label htmlFor="product-category" className="ui-label">Catégorie <span className="ui-required">*</span></label>
                    <CategoriesDropdown
                      id="product-category"
                      selectedCategory={formData.category || ""}
                      setSelectedCategory={(categoryName) =>
                        setFormData((prev) => ({
                          ...prev,
                          category: categoryName,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label htmlFor="product-brand" className="ui-label">Marque</label>
                    <input
                      id="product-brand"
                      type="text"
                      value={formData.brand}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          brand: e.target.value,
                        }))
                      }
                      className="ui-input"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="product-status" className="ui-label">Statut</label>
                      <select
                        id="product-status"
                        value={formData.status}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            status: e.target.value as "active" | "inactive",
                          }))
                        }
                        className="ui-input"
                      >
                        <option value="active">Actif</option>
                        <option value="inactive">Inactif</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="product-region-field" className="ui-label">Région <span className="ui-required">*</span></label>
                      <select
                        id="product-region-field"
                        required
                        value={formData.region || ""}
                        onChange={(e) => {
                          const region = e.target.value as Region;
                          setFormData((prev) => ({
                            ...prev,
                            region,
                            regionCode: REGION_CODE_MAP[region],
                          }));
                        }}
                        className="ui-input"
                      >
                        {REGIONS.map((r) => (
                          <option key={r.regionCode} value={r.region}>
                            {r.region} ({r.regionCode})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </fieldset>

                {/* Pricing & Inventory */}
                <fieldset className="space-y-4">
                  <legend className="ui-kicker mb-3">Stock & coût</legend>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="product-stock" className="ui-label">Stock total</label>
                      <input
                        id="product-stock"
                        type="number"
                        value={formData.stock}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            stock: Number.parseInt(e.target.value) || 0,
                          }))
                        }
                        className="ui-input tabular-nums"
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <label htmlFor="product-unit" className="ui-label">Unité</label>
                      <select
                        id="product-unit"
                        value={formData.unit}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            unit: e.target.value,
                          }))
                        }
                        className="ui-input"
                      >
                        {units.map((unit, idx) => (
                          <option key={idx} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="product-min-stock" className="ui-label">Stock minimum</label>
                      <input
                        id="product-min-stock"
                        type="number"
                        value={formData.minStock}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            minStock: Number.parseInt(e.target.value) || 0,
                          }))
                        }
                        className="ui-input tabular-nums"
                        inputMode="numeric"
                      />
                      <p className="ui-help">Seuil d’alerte de stock faible.</p>
                    </div>
                    <div>
                      <label htmlFor="product-unit-cost" className="ui-label">Coût unitaire (USD)</label>
                      <input
                        id="product-unit-cost"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.unitCost ?? 0}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            unitCost: Number.parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="ui-input tabular-nums"
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                </fieldset>
              </div>
            </div>

            {/* Form Actions */}
            <div className="ui-dialog-footer">
              <button type="button" onClick={closeFormModal} className="ui-btn ui-btn-ghost">
                Annuler
              </button>
              <button type="submit" className="ui-btn ui-btn-primary">
                {showEditModal ? "Mettre à jour l'article" : "Ajouter l'article"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick View Modal */}
      {showViewModal && selectedProduct && (
        <div className="ui-dialog-overlay" role="presentation">
          <div className="ui-dialog max-w-xl" role="dialog" aria-modal="true" aria-labelledby="product-view-title">
            <div className="ui-dialog-header">
              <h2 id="product-view-title" className="ui-dialog-title">Détails de l'article</h2>
              <button type="button" onClick={() => setShowViewModal(false)} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-5">
              <div>
                <h3 className="break-words text-lg font-semibold text-slate-950">
                  {formatProductLabel(selectedProduct)}
                </h3>
                {selectedProduct.brand && <p className="mt-0.5 text-sm text-slate-500">{selectedProduct.brand}</p>}
                {selectedProduct.description && <p className="mt-2 text-sm text-slate-700">{selectedProduct.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {typeof selectedProduct.price === "number" && (
                    <span className="text-2xl font-semibold tabular-nums text-slate-950">
                      ${selectedProduct.price.toFixed(2)}
                    </span>
                  )}
                  <span className={`ui-badge ${selectedProduct.status === "active" ? "ui-badge-success" : "ui-badge-neutral"}`}>
                    {getProductStatus(selectedProduct.status)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="ui-muted-panel space-y-2 text-sm">
                  <h4 className="ui-kicker">Informations</h4>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Catégorie</span>
                    <span className="text-right font-medium text-slate-900">{selectedProduct.category || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Unité</span>
                    <span className="font-medium text-slate-900">{selectedProduct.unit}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Région</span>
                    <span className="text-right font-medium text-slate-900">
                      {selectedProduct.region} ({selectedProduct.regionCode})
                    </span>
                  </div>
                </div>

                <div className="ui-muted-panel space-y-2 text-sm">
                  <h4 className="ui-kicker">Stock</h4>
                  {renderStockDetails(selectedProduct)}
                </div>
              </div>

              {selectedProduct.weight > 0 && (
                <div className="ui-muted-panel flex justify-between text-sm">
                  <span className="text-slate-500">Poids</span>
                  <span className="font-medium tabular-nums text-slate-900">{selectedProduct.weight} kg</span>
                </div>
              )}
            </div>

            <div className="ui-dialog-footer">
              <button type="button" onClick={() => setShowViewModal(false)} className="ui-btn ui-btn-ghost">
                Fermer
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowViewModal(false);
                    openEditModal(selectedProduct);
                  }}
                  className="ui-btn ui-btn-primary"
                >
                  <Edit />
                  Modifier l'article
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
