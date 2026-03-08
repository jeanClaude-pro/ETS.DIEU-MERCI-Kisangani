"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { Package, Plus, Search, Edit, Trash2, Eye, X } from "lucide-react";
import { getProductStatus } from "../../utils/constants";
import { toast } from "react-toastify";
import type { Product } from "../../types";
import { units, serverUrl } from "../../utils/constants";
import CategoriesDropdown from "../../components/CategoriesDropdown";

interface User {
  _id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
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
    status: "active",
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
      const response = await fetch(`${serverUrl}/products`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      } else {
        console.error("Failed to fetch products:", await response.text());
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  const createProduct = async (productData: Partial<Product>) => {
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
        toast.success("Article ajouté avec succès!");
      } else {
        toast.error("echec de l'ajout de l'Article");
      }
    } catch (error) {
      console.error("erreur d'ajout de l'Article:", error);
      toast.error("Error creating product");
    }
  };

  const updateProduct = async (id: string, productData: Partial<Product>) => {
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
        toast.success("Product updated successfully!");
      } else {
        toast.error("Failed to update product");
      }
    } catch (error) {
      console.error("Error updating product:", error);
      toast.error("Error updating product");
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
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
        toast.success("Product deleted");
      } else {
        toast.error("Failed to delete product");
      }
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("Error deleting product");
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

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
      status: "active",
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

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesCategory =
      !selectedCategory || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Function to display stock information based on user role
  const renderStockInfo = (product: Product) => {
    if (isAdmin) {
      // Admin sees exact stock numbers
      return (
        <span
          className={`text-sm ${
            product.stock <= product.minStock
              ? "text-red-600 font-medium"
              : "text-gray-900"
          }`}
        >
          {product.stock} {product.unit}
        </span>
      );
    } else {
      // Staff sees stock status instead of exact numbers
      if (product.stock === 0) {
        return (
          <span className="text-sm text-red-600 font-medium">En rupture</span>
        );
      } else if (product.stock <= product.minStock) {
        return (
          <span className="text-sm text-orange-600 font-medium">Stock faible</span>
        );
      } else {
        return (
          <span className="text-sm text-green-600 font-medium">En stock</span>
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
          <div className="flex justify-between">
            <span className="text-gray-600">Stock Actuel:</span>
            <span
              className={`font-medium ${
                product.stock <= product.minStock
                  ? "text-red-600"
                  : "text-gray-900"
              }`}
            >
              {product.stock} {product.unit}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Stock minimal:</span>
            <span className="font-medium">
              {product.minStock} {product.unit}
            </span>
          </div>
        </>
      );
    } else {
      // Staff sees only stock status
      return (
        <div className="flex justify-between">
          <span className="text-gray-600">Statut du stock:</span>
          {product.stock === 0 ? (
            <span className="font-medium text-red-600">En rupture</span>
          ) : product.stock <= product.minStock ? (
            <span className="font-medium text-orange-600">Stock faible</span>
          ) : (
            <span className="font-medium text-green-600">En stock</span>
          )}
        </div>
      );
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Articles</h1>
          <p className="text-gray-600">Gérez votre catalogue des Articles</p>
          {!isAdmin && (
            <p className="text-sm text-blue-600 mt-1">
              Staff
            </p>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4 " />
          Ajouter un nouvel Article
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-300">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Recherchez des Articles par nom..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none focus:border-transparent"
              />
            </div>
          </div>
          <div className="sm:w-64">
            <CategoriesDropdown
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
            />
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-300">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Chargement des Articles......</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Aucun article trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Article
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categorie
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProducts.map((product, idx) => (
                  <tr key={product._id ?? idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {idx + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {product.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {product.brand}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.category}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderStockInfo(product)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          product.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {getProductStatus(product.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openViewModal(product)}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => openEditModal(product)}
                              className="text-green-600 hover:text-green-900 p-1 rounded"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteProduct(product._id)}
                              className="text-red-600 hover:text-red-900 p-1 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
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
      </div>

      {/* Add/Edit Product Modal - Only for Admin */}
      {(showAddModal || showEditModal) && isAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {showEditModal ? "Modifier l'Article" : "Ajouter un Article"}
                </h2>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Information Basique
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nom de l'Article *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      value={formData.description}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Categorie *
                    </label>
                    <CategoriesDropdown
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Marques
                    </label>
                    <input
                      type="text"
                      value={formData.brand}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          brand: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Statut
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          status: e.target.value as "active" | "inactive",
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none focus:border-transparent"
                    >
                      <option value="active">Actif</option>
                      <option value="inactive">Inactif</option>
                    </select>
                  </div>
                </div>

                {/* Pricing & Inventory */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Stock
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Stock Total
                      </label>
                      <input
                        type="number"
                        value={formData.stock}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            stock: Number.parseInt(e.target.value) || 0,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unité
                      </label>
                      <select
                        value={formData.unit}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            unit: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none focus:border-transparent"
                      >
                        {units.map((unit, idx) => (
                          <option key={idx} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Stock minimum
                      </label>
                      <input
                        type="number"
                        value={formData.minStock}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            minStock: Number.parseInt(e.target.value) || 0,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  {showEditModal ? "Mettre à jour l'Article" : "Ajouter l'Article"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick View Modal */}
      {showViewModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  Détails de l'Article
                </h2>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex items-start gap-6">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900">
                    {selectedProduct.name}
                  </h3>
                  <p className="text-gray-600 mt-1">{selectedProduct.brand}</p>
                  <p className="text-gray-700 mt-2">
                    {selectedProduct.description}
                  </p>
                  <div className="mt-4 flex items-center gap-4">
                    {typeof selectedProduct.price === "number" && (
                      <span className="text-2xl font-bold text-green-600">
                        ${selectedProduct.price.toFixed(2)}
                      </span>
                    )}
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        selectedProduct.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {selectedProduct.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900">
                    Informations sur l'Article
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Categorie:</span>
                      <span className="font-medium">
                        {selectedProduct.category}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Unité:</span>
                      <span className="font-medium">
                        {selectedProduct.unit}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900">Stock</h4>
                  <div className="space-y-2 text-sm">
                    {renderStockDetails(selectedProduct)}
                  </div>
                </div>
              </div>

              {selectedProduct.weight > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900">
                    Propriétés physiques
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Poids:</span>
                      <span className="font-medium">
                        {selectedProduct.weight} kg
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {isAdmin && (
                <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowViewModal(false);
                      openEditModal(selectedProduct);
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Modifier l'Article
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}