/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import {
  Search,
  ShoppingCart,
  Trash2,
  User,
  CreditCard,
  DollarSign,
  Receipt,
} from "lucide-react";

// Types
interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string;
  image?: string;
  barcode?: string;
}

interface CartItem extends Product {
  quantity: number;
}

interface Customer {
  name: string;
  phone: string;
  email?: string;
}

interface Sale {
  _id?: string;
  saleId?: string;
  customer: Customer;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    price: number;
    total?: number;
  }>;
  subtotal: number;
  total: number;
  status?: "completed" | "pending" | "cancelled";
  createdAt?: string;
}

type UiPayment = "cash" | "mpesa" | "card" | "bank" | "other";
type ModelPayment = "cash" | "card" | "transfer" | "other";

// ✅ Ensure we always have a base URL (prevents fetch to "undefined/products")
const serverUrl = import.meta.env.VITE_API_URL;

function uiToModelPayment(pm: UiPayment): ModelPayment {
  if (pm === "cash") return "cash";
  if (pm === "card") return "card";
  if (pm === "mpesa" || pm === "bank") return "transfer";
  return "other";
}

async function readJsonSafe(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text();
  return { __nonJson: true, text };
}

export default function Pos() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer>({ name: "", phone: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState<UiPayment>("cash");
  const [loading, setLoading] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categories = [
    { id: "all", name: "All Categories" },
    { id: "electronics", name: "Electronics" },
    { id: "clothing", name: "Clothing" },
    { id: "food", name: "Food & Beverages" },
    { id: "books", name: "Books" },
    { id: "home", name: "Home & Garden" },
  ];

  // Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${serverUrl}/products`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        });
        const data = await readJsonSafe(res);
        if (!res.ok) {
          const msg =
            (data as any)?.error ||
            (data as any)?.text ||
            `Products fetch failed: ${res.status}`;
          throw new Error(msg);
        }

        // normalize: map Mongo _id -> id, coerce numeric price
        const normalized = (data as any[]).map((p: any) => ({
          ...p,
          id: p._id,
          price: Number(p.price ?? 0),
          stock: Number(p.stock ?? 0),
        }));

        setProducts(normalized);
      } catch (err: any) {
        console.error("Error fetching products:", err);
        setError(err?.message || "Failed to load products");
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  // Lookup existing customer by phone on blur
  const lookupCustomerByPhone = async () => {
    const phone = (customer.phone || "").trim();
    if (!phone) return;
    try {
      const res = await fetch(
        `${serverUrl}/customers/phone/${encodeURIComponent(phone)}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        }
      );
      const data = await readJsonSafe(res);
      if (!res.ok) return; // not found is fine
      const c = data as any;
      setCustomer((prev) => ({
        ...prev,
        name: c.name || prev.name,
        email: c.email || prev.email,
      }));
    } catch {
      // non-fatal
    }
  };

  // Filter products
  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.barcode || "").includes(searchTerm);
    const matchesCategory =
      selectedCategory === "all" || product.category === selectedCategory;
    return matchesSearch && matchesCategory && Number(product.stock) > 0;
  });

  // Cart functions
  const addToCart = (product: Product) => {
    const price = Number(product.price) || 0;
    const p = { ...product, price };
    const existing = cart.find((i) => i.id === p.id);
    if (existing) {
      if (existing.quantity < p.stock) {
        setCart((prev) =>
          prev.map((i) =>
            i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i
          )
        );
      }
    } else {
      setCart((prev) => [...prev, { ...p, quantity: 1 }]);
    }
  };

  const updateCartQuantity = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }
    const prod = products.find((p) => p.id === productId);
    if (prod && newQty <= prod.stock) {
      setCart((prev) =>
        prev.map((i) => (i.id === productId ? { ...i, quantity: newQty } : i))
      );
    }
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.id !== productId));
  };

  const clearCart = () => setCart([]);

  // Totals
  const subtotal = cart.reduce(
    (sum, item) =>
      sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
    0
  );
  const total = subtotal;

  // Quick local validation against stock to avoid 409 where possible
  const validateCartAgainstStock = () => {
    for (const it of cart) {
      const prod = products.find((p) => p.id === it.id);
      if (!prod) return `Product not found: ${it.name}`;
      if (Number(prod.stock) < Number(it.quantity)) {
        return `Insufficient stock for ${it.name}. Available: ${prod.stock}`;
      }
    }
    return null;
  };

  // Process sale -> POST /api/sales
  const processSale = async () => {
    if (cart.length === 0) return;
    if (!customer.name || !customer.phone) {
      setError("Please fill customer name and phone.");
      return;
    }

    const stockErr = validateCartAgainstStock();
    if (stockErr) {
      setError(stockErr);
      alert(stockErr);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const body = {
        customer: {
          name: customer.name,
          phone: customer.phone,
          email: customer.email || "",
        },
        items: cart.map((item) => ({
          productId: item.id, // mapped from _id earlier
          name: item.name,
          quantity: Number(item.quantity) || 0,
          price: Number(item.price),
        })),
        // backend recomputes; we still send for convenience
        subtotal: Number(total) || 0,
        total: Number(total) || 0,
        paymentMethod: uiToModelPayment(paymentMethod),
      };

      const token =
        localStorage.getItem("authToken") ||
        localStorage.getItem("token") ||
        "";

      const res = await fetch(`${serverUrl}/sales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        const msg =
          (data as any)?.error ||
          (data as any)?.text ||
          `Sale failed (${res.status})`;
        throw new Error(msg);
      }

      // The route returns the saved Sale document
      const saved = data as any;

      // Build a local Sale object for potential receipt rendering
      const saleForReceipt: Sale = {
        _id: saved?._id,
        saleId: saved?.saleId,
        customer: saved?.customer ?? body.customer,
        items:
          saved?.items?.map((i: any) => ({
            productId: i.productId,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
            total: i.total,
          })) ?? body.items,
        subtotal: Number(saved?.subtotal ?? total),
        total: Number(saved?.total ?? total),
        status: saved?.status,
        createdAt: saved?.createdAt,
      };

      setLastSale(saleForReceipt);

      // Clear cart and decrement local stock so UI feels instant
      const dec: Record<string, number> = {};
      cart.forEach((i) => (dec[i.id] = (dec[i.id] || 0) + i.quantity));
      setProducts((prev) =>
        prev.map((p) =>
          dec[p.id] ? { ...p, stock: Math.max(0, p.stock - dec[p.id]) } : p
        )
      );
      setCart([]);

      alert(
        `Sale processed successfully${
          saleForReceipt.saleId ? ` (Receipt: ${saleForReceipt.saleId})` : ""
        }`
      );
    } catch (err: any) {
      console.error("Error processing sale:", err);
      setError(err?.message || "Error processing sale");
      alert(err?.message || "Error processing sale");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Point de vente</h1>
            <p className="text-gray-600">Traiter Les Nouvelles Ventes</p>
          </div>
          {lastSale?.saleId && (
            <div className="flex items-center gap-2 text-sm text-gray-700 bg-white px-3 py-2 rounded border">
              <Receipt className="w-4 h-4" />
              <span>Dernier reçu: </span>
              <span className="font-semibold">{lastSale.saleId}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Customer + Product selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Details */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5" />
                Détails du client
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Numéro De Téléphone
                  </label>
                  <input
                    type="tel"
                    value={customer.phone}
                    onChange={(e) =>
                      setCustomer({ ...customer, phone: e.target.value })
                    }
                    onBlur={lookupCustomerByPhone}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Entrez Le Numéro De Téléphone"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom Du Client
                  </label>
                  <input
                    type="text"
                    value={customer.name}
                    onChange={(e) =>
                      setCustomer({ ...customer, name: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Entrez Le Nom Du Client"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email (optionnel)
                  </label>
                  <input
                    type="email"
                    value={customer.email || ""}
                    onChange={(e) =>
                      setCustomer({ ...customer, email: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="client@example.com"
                  />
                </div>
              </div>
            </div>

            {/* Product Search & Filter */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Search className="w-5 h-5" />
                Sélection de produits
              </h2>

              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Rechercher des produits par nom ou code-barres..."
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Products Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="col-span-full text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-gray-500 mt-2">
                      Chargement des produits...
                    </p>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    Aucun produit trouvé
                  </div>
                ) : (
                  filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => addToCart(product)}
                    >
                      <div className="aspect-square bg-gray-100 rounded-md mb-3 flex items-center justify-center">
                        {product.image ? (
                          <img
                            src={product.image || "/placeholder.svg"}
                            alt={product.name}
                            className="w-full h-full object-cover rounded-md"
                          />
                        ) : (
                          <div className="text-gray-400 text-4xl">📦</div>
                        )}
                      </div>
                      <h3 className="font-medium text-gray-900 text-sm mb-1 truncate">
                        {product.name}
                      </h3>
                      <p className="text-xs text-gray-500">
                        Stock: {product.stock}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right: Cart & Checkout */}
          <div className="space-y-6">
            {/* Cart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Shopping Cart ({cart.length})
                </h2>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>Cart is empty</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 border border-gray-200 rounded-md"
                    >
                      <div className="w-12 h-12 bg-gray-100 rounded flex-shrink-0 flex items-center justify-center">
                        {item.image ? (
                          <img
                            src={item.image || "/placeholder.svg"}
                            alt={item.name}
                            className="w-full h-full object-cover rounded"
                          />
                        ) : (
                          <span className="text-gray-400">📦</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm text-gray-900 truncate">
                          {item.name}
                        </h4>
                        <p className="text-blue-600 font-semibold text-sm">
                          ${(Number(item.price) || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            updateCartQuantity(
                              item.id,
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="w-16 border border-gray-300 rounded px-2 text-center"
                        />
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-6 h-6 rounded-full bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center ml-2"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Totals */}
              {cart.length > 0 && (
                <div className="border-t border-gray-300 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t border-gray-300 pt-2">
                    <span>Total:</span>
                    <span className="text-blue-600">${total.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Checkout */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Checkout
              </h2>

              {/* Payment method */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as UiPayment)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="cash">Cash</option>
                  <option value="mpesa">M-Pesa (Transfer)</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <button
                onClick={processSale}
                disabled={
                  cart.length === 0 ||
                  loading ||
                  !customer.name ||
                  !customer.phone
                }
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <DollarSign className="w-4 h-4" />
                    Process Sale
                  </>
                )}
              </button>

              {cart.length === 0 && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Add items to cart to checkout
                </p>
              )}
              {(!customer.name || !customer.phone) && cart.length > 0 && (
                <p className="text-xs text-red-500 mt-2 text-center">
                  Please fill customer details
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
