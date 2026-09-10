/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { DollarSign, RefreshCw, Calculator, Search } from "lucide-react";
import {
  normalizeSaleReceipt,
  printCommittedSaleAfterDelay,
} from "../services/printService";

interface Product {
  _id: string;
  name: string;
  sku?: string;
  stock: number;
  price?: number;
  region?: "Butembo" | "China";
  regionCode?: "Bbbb" | "Cnnn";
}

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  region?: "Butembo" | "China";
  regionCode?: "Bbbb" | "Cnnn";
}

interface ExchangeRate {
  _id: string;
  rate: number;
  effectiveFrom: string;
  lastUpdated: string;
}

interface WalkInCustomer {
  _id: string;
  name: string;
  phone: string;
}

const API_BASE = import.meta.env.VITE_API_URL;

type UiPayment = "cash" | "mpesa" | "card" | "bank" | "other";
type ModelPayment = "cash" | "card" | "transfer" | "other";

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

export default function NewSale() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [loadingRate, setLoadingRate] = useState(true);
  const [walkInCustomer, setWalkInCustomer] = useState<WalkInCustomer | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Get the current user from your auth context
  const { user: currentUser } = useAuth();

  const [form, setForm] = useState({
    productId: "",
    quantity: "",
    unitPrice: "",
    priceInFC: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    isWalkIn: true,
    paymentMethod: "cash" as UiPayment,
    currencyMode: "usd" as "usd" | "fc" // New field for currency mode
  });

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if user is admin
  const isAdmin = currentUser?.role === "admin";

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Load exchange rate
  const loadExchangeRate = async () => {
    try {
      setLoadingRate(true);
      const response = await fetch(`${API_BASE}/exchange-rates/current`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setExchangeRate(data);
      } else {
        console.warn('Failed to load exchange rate');
      }
    } catch (error) {
      console.error('Error loading exchange rate:', error);
    } finally {
      setLoadingRate(false);
    }
  };

  // Load the permanent Walk-in Customer record, so the default customer
  // sent with a sale always matches the real system record instead of a
  // hardcoded guess.
  const loadWalkInCustomer = async () => {
    try {
      const response = await fetch(`${API_BASE}/customers/walkin`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setWalkInCustomer(data);
      } else {
        console.warn("Failed to load walk-in customer");
      }
    } catch (error) {
      console.error("Error loading walk-in customer:", error);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      setLoadingProducts(true);
      setError(null);

      try {
        // Load products, exchange rate, and the walk-in customer concurrently
        await Promise.all([
          loadProducts(),
          loadExchangeRate(),
          loadWalkInCustomer()
        ]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load initial data");
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    }

    async function loadProducts() {
      try {
        const res = await fetch(`${API_BASE}/products`, {
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
        const list: Product[] = Array.isArray((data as any)?.products)
          ? (data as any).products
          : Array.isArray(data) && !(data as any).__nonJson
          ? (data as any)
          : [];
        if (!cancelled) setProducts(list);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load products");
      }
    }

    loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  const product = useMemo(
    () => products.find((p) => p._id === form.productId),
    [products, form.productId]
  );

  // Filter products based on search term
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    return products.filter(product =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [products, searchTerm]);

  // Calculate USD price when FC price changes
  useEffect(() => {
    if (form.currencyMode === "fc" && form.priceInFC && exchangeRate) {
      const fcPrice = parseFloat(form.priceInFC) || 0;
      const usdPrice = fcPrice / exchangeRate.rate;
      setForm(prev => ({
        ...prev,
        unitPrice: usdPrice.toFixed(2)
      }));
    }
  }, [form.priceInFC, form.currencyMode, exchangeRate]);

  // Calculate FC price when USD price changes
  useEffect(() => {
    if (form.currencyMode === "usd" && form.unitPrice && exchangeRate) {
      const usdPrice = parseFloat(form.unitPrice) || 0;
      const fcPrice = usdPrice * exchangeRate.rate;
      setForm(prev => ({
        ...prev,
        priceInFC: Math.round(fcPrice).toString()
      }));
    }
  }, [form.unitPrice, form.currencyMode, exchangeRate]);

  const quantity = parseInt(form.quantity) || 0;
  const unitPrice = parseFloat(form.unitPrice) || 0;
  const itemTotal = quantity * unitPrice;
  const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);

  const isFormValid =
    cart.length > 0 &&
    (form.isWalkIn ||
      (form.customerName.trim() !== "" && form.customerPhone.trim() !== ""));

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  // Handle product selection from search
  const handleProductSelect = (selectedProduct: Product) => {
    setForm(prev => ({
      ...prev,
      productId: selectedProduct._id,
      unitPrice: selectedProduct.price ? selectedProduct.price.toString() : "",
      priceInFC: ""
    }));
    setSearchTerm(selectedProduct.name);
    setShowSearchResults(false);
  };

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setShowSearchResults(true);
    if (!e.target.value) {
      setForm(prev => ({ ...prev, productId: "" }));
    }
  };

  // Check if adding to cart would result in negative stock
  const checkStockAfterAdd = (productId: string, quantityToAdd: number): boolean => {
    const productToCheck = products.find(p => p._id === productId);
    if (!productToCheck) return false;

    // Calculate current stock minus what's already in cart
    const currentCartQuantity = cart
      .filter(item => item.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
    
    const availableStock = productToCheck.stock - currentCartQuantity;
    return availableStock >= quantityToAdd;
  };

  // Toggle between USD and FC input modes
  const toggleCurrencyMode = () => {
    setForm(prev => ({
      ...prev,
      currencyMode: prev.currencyMode === "usd" ? "fc" : "usd",
      unitPrice: "",
      priceInFC: ""
    }));
  };

  // Function to display stock information based on user role
  const renderStockInfo = (product: Product) => {
    if (isAdmin) {
      // Admin sees exact stock numbers
      return `(Stock: ${product.stock})`;
    } else {
      // Staff sees stock status instead of exact numbers
      if (product.stock === 0) {
        return "(En rupture)";
      } else if (product.stock <= 5) { // You can adjust this threshold
        return "(Stock faible)";
      } else {
        return "(En stock)";
      }
    }
  };

  // Function to display available stock message based on user role
  const renderAvailableStockMessage = (product: Product, quantity: number) => {
    const canAddToCart = product && quantity > 0 && checkStockAfterAdd(product._id, quantity);
    
    if (isAdmin) {
      // Admin sees exact numbers
      const currentCartQuantity = cart
        .filter(item => item.productId === product._id)
        .reduce((sum, item) => sum + item.quantity, 0);
      
      const availableStock = product.stock - currentCartQuantity;
      
      return (
        <p className="text-sm text-gray-600 mb-4">
          Stock disponible: <strong>{product.stock}</strong>
          {currentCartQuantity > 0 && (
            <span className="ml-2 text-blue-600">
              (Déjà dans panier: {currentCartQuantity})
            </span>
          )}
          {quantity > 0 && (
            <span className={`ml-4 ${canAddToCart ? 'text-green-600' : 'text-red-600'}`}>
              Stock restant après vente:{" "}
              {availableStock - quantity >= 0
                ? availableStock - quantity
                : "❌ pas assez de stock!"}
            </span>
          )}
        </p>
      );
    } else {
      // Staff sees status messages
      if (product.stock === 0) {
        return (
          <p className="text-sm text-red-600 mb-4">
            <strong>❌ En rupture de stock</strong>
          </p>
        );
      } else if (product.stock <= 5) {
        return (
          <p className="text-sm text-orange-600 mb-4">
            <strong>⚠️ Stock faible</strong>
          </p>
        );
      } else if (quantity > 0 && !canAddToCart) {
        return (
          <p className="text-sm text-red-600 mb-4">
            <strong>❌ Quantité demandée non disponible</strong>
          </p>
        );
      } else if (quantity > 0) {
        return (
          <p className="text-sm text-green-600 mb-4">
            <strong>✅ Stock suffisant</strong>
          </p>
        );
      } else {
        return (
          <p className="text-sm text-green-600 mb-4">
            <strong>✅ En stock</strong>
          </p>
        );
      }
    }
  };

  function handleAddToCart() {
    // Comprehensive validation
    if (!product) {
      setError("Veuillez sélectionner un produit");
      return;
    }

    if (!product.regionCode) {
      setError("Ce produit n'a pas de région assignée. Contactez un administrateur.");
      return;
    }

    if (quantity <= 0) {
      setError("La quantité doit être supérieure à zéro");
      return;
    }

    if (unitPrice <= 0) {
      setError("Le prix unitaire doit être supérieur à zéro");
      return;
    }

    // Check if adding this quantity would result in negative stock
    if (!checkStockAfterAdd(product._id, quantity)) {
      setError("Stock insuffisant pour ajouter cette quantité au panier");
      return;
    }

    // Clear any previous errors
    setError(null);

    // Check if product with same ID AND same price already exists in cart
    const existingItemIndex = cart.findIndex(
      (item) => item.productId === product._id && item.unitPrice === unitPrice
    );

    if (existingItemIndex >= 0) {
      // Update existing item (same product + same price)
      const updatedCart = [...cart];
      updatedCart[existingItemIndex] = {
        ...updatedCart[existingItemIndex],
        quantity: updatedCart[existingItemIndex].quantity + quantity,
        total: (updatedCart[existingItemIndex].quantity + quantity) * unitPrice,
      };
      setCart(updatedCart);
    } else {
      // Add new item (either different product OR same product but different price)
      setCart([
        ...cart,
        {
          productId: product._id,
          name: product.name,
          quantity,
          unitPrice,
          total: itemTotal,
          region: product.region,
          regionCode: product.regionCode,
        },
      ]);
    }

    // Update local product stock (for display purposes only)
    // The actual stock validation is done in checkStockAfterAdd
    setProducts((prevProducts) =>
      prevProducts.map((p) =>
        p._id === product._id ? { ...p, stock: p.stock - quantity } : p
      )
    );

    // Reset form fields
    setForm((f) => ({
      ...f,
      quantity: "",
      unitPrice: product.price ? product.price.toString() : "",
      priceInFC: ""
    }));
    setSearchTerm("");
  }

  function removeFromCart(index: number) {
    const itemToRemove = cart[index];
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);

    // Restore stock when item is removed from cart
    setProducts((prevProducts) =>
      prevProducts.map((p) =>
        p._id === itemToRemove.productId
          ? { ...p, stock: p.stock + itemToRemove.quantity }
          : p
      )
    );
  }

  function authHeader(): Record<string, string> {
    const token =
      localStorage.getItem("authToken") || localStorage.getItem("token") || "";
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function handleSale(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const body = {
        customer: form.isWalkIn
          ? {
              name: form.customerName,
              phone: "",
              email: "",
              isWalkIn: true,
            }
          : {
              name: form.customerName,
              phone: form.customerPhone,
              email: form.customerEmail || "",
            },
        items: cart.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          price: item.unitPrice,
          region: item.region,
          regionCode: item.regionCode,
        })),
        subtotal: cartTotal,
        total: cartTotal,
        paymentMethod: uiToModelPayment(form.paymentMethod),
        salesPerson: currentUser?.username || "unknown",
        // Lock the rate that was active at the moment of sale
        exchangeRateSnapshot: exchangeRate
          ? {
              rateId: exchangeRate._id,
              rate: exchangeRate.rate,
              effectiveFrom: exchangeRate.effectiveFrom,
            }
          : null,
      };

      const res = await fetch(`${API_BASE}/sales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
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

      // Always print from the committed server snapshot, never from the mutable cart.
      const newReceiptData = normalizeSaleReceipt(data, {
        type: "sale",
        exchangeRate: exchangeRate?.rate,
      });

      // Reset form and cart
      setForm({
        productId: "",
        quantity: "",
        unitPrice: "",
        priceInFC: "",
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        isWalkIn: true,
        paymentMethod: form.paymentMethod,
        currencyMode: "usd"
      });
      setCart([]);
      setSearchTerm("");

      setMessage(
        "✅ Vente effectuée avec succès ! Impression du reçu et de la souche..."
      );
      try {
        await printCommittedSaleAfterDelay(newReceiptData);
      } catch (printError: unknown) {
        setError(printError instanceof Error
          ? printError.message
          : "La vente est enregistrée, mais l'impression a échoué.");
      }
    } catch (e: any) {
      setError(e?.message || "La vente n'a pas pu être effectuée");
    } finally {
      setSubmitting(false);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatFc = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount) + ' FC';
  };

  // Check if the product can be added to cart (comprehensive validation)
  const canAddToCart = product && quantity > 0 && unitPrice > 0 && checkStockAfterAdd(product._id, quantity);

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-6xl mx-auto">
        {/* Header with Exchange Rate */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Nouvelle Vente</h2>
              <p className="text-gray-600 mt-1">Créez une nouvelle vente avec gestion multi-devises</p>
            </div>
            
            {/* Exchange Rate Display */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 min-w-[280px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-blue-900">Taux du jour:</span>
                </div>
                {loadingRate ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                ) : exchangeRate ? (
                  <div className="text-right">
                    <div className="font-bold text-blue-800 text-lg">
                      1 USD = {new Intl.NumberFormat('fr-FR').format(exchangeRate.rate)} FC
                    </div>
                    <div className="text-xs text-blue-600">
                      Effectif depuis {new Date(exchangeRate.effectiveFrom).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                ) : (
                  <span className="text-red-600 text-sm">Taux non disponible</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
        )}

        <div className="bg-white shadow-lg rounded-xl p-6 mb-6 border border-gray-200">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Ajouter les articles</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="relative" ref={searchRef}>
              <label className="block mb-2 font-medium text-gray-700">Articles</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onFocus={() => setShowSearchResults(true)}
                  placeholder="Rechercher un article..."
                  className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loadingProducts || products.length === 0}
                />
              </div>
              
              {/* Search Results Dropdown */}
              {showSearchResults && filteredProducts.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {filteredProducts.map((product) => (
                    <div
                      key={product._id}
                      className="px-4 py-3 cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                      onClick={() => handleProductSelect(product)}
                    >
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        {product.name}
                        {product.regionCode && (
                          <span className="inline-flex px-1.5 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800">
                            {product.regionCode}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 flex justify-between">
                        <span>{product.sku && `SKU: ${product.sku}`}</span>
                        <span className={product.stock === 0 ? "text-red-600" : product.stock <= 5 ? "text-orange-600" : "text-green-600"}>
                          {renderStockInfo(product)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* No Results Message */}
              {showSearchResults && searchTerm && filteredProducts.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
                  Aucun article trouvé
                </div>
              )}
            </div>

            <div>
              <label className="block mb-2 font-medium text-gray-700">Nombre de pièces</label>
              <input
                type="number"
                name="quantity"
                value={form.quantity}
                onChange={handleChange}
                placeholder="Entrer le nombre de pièces"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min={1}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block font-medium text-gray-700">Prix unitaire</label>
                <button
                  type="button"
                  onClick={toggleCurrencyMode}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  <Calculator className="w-3 h-3" />
                  {form.currencyMode === 'usd' ? 'USD → FC' : 'FC → USD'}
                </button>
              </div>
              
              {form.currencyMode === 'usd' ? (
                <input
                  type="number"
                  step="0.01"
                  name="unitPrice"
                  value={form.unitPrice}
                  onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                  placeholder={product?.price ? `ex: ${product.price}` : "Entrer le prix en USD"}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min={0.01}
                />
              ) : (
                <input
                  type="number"
                  name="priceInFC"
                  value={form.priceInFC}
                  onChange={(e) => setForm({ ...form, priceInFC: e.target.value })}
                  placeholder="Entrer le prix en FC"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min={1}
                />
              )}
              
              {/* Conversion Display */}
              {form.unitPrice && form.currencyMode === 'usd' && exchangeRate && (
                <p className="text-xs text-green-600 mt-1">
                  ≈ {formatFc(parseFloat(form.unitPrice) * exchangeRate.rate)}
                </p>
              )}
              {form.priceInFC && form.currencyMode === 'fc' && exchangeRate && (
                <p className="text-xs text-green-600 mt-1">
                  ≈ {formatCurrency(parseFloat(form.priceInFC) / exchangeRate.rate)}
                </p>
              )}
            </div>
          </div>

          {product && renderAvailableStockMessage(product, quantity)}

          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!canAddToCart}
            className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 ${
              canAddToCart
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                : "bg-gray-400 cursor-not-allowed text-white"
            } transition-colors`}
          >
            <RefreshCw className="w-4 h-4" />
            Ajouter au panier
          </button>

          {cart.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">Articles du panier</h3>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Articles</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Pièces</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Prix unitaire</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {cart.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {item.name}
                          {item.regionCode && (
                            <span className="ml-2 inline-flex px-1.5 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800">
                              {item.regionCode}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-center text-gray-600">{item.quantity}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {formatCurrency(item.unitPrice)}
                          {exchangeRate && (
                            <div className="text-xs text-gray-500">
                              ≈ {formatFc(item.unitPrice * exchangeRate.rate)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {formatCurrency(item.total)}
                          {exchangeRate && (
                            <div className="text-xs text-gray-500">
                              ≈ {formatFc(item.total * exchangeRate.rate)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => removeFromCart(index)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Enlever
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        Total:
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        {formatCurrency(cartTotal)}
                        {exchangeRate && (
                          <div className="text-xs text-gray-500">
                            ≈ {formatFc(cartTotal * exchangeRate.rate)}
                          </div>
                        )}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">
            Informations du client
          </h3>

          <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.isWalkIn}
              onChange={(e) =>
                setForm((f) => ({ ...f, isWalkIn: e.target.checked }))
              }
              className="w-4 h-4 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
            />
            <span className="font-medium text-gray-700">
              Client de passage (Walk-in Customer)
            </span>
          </label>

          {form.isWalkIn ? (
            <div className="mb-6 space-y-3 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
              <label className="block font-medium text-gray-700" htmlFor="walkInCustomerName">
                Nom du client de passage (optionnel)
              </label>
              <input
                id="walkInCustomerName"
                type="text"
                name="customerName"
                value={form.customerName}
                onChange={handleChange}
                placeholder={walkInCustomer?.name || "Walk-in Customer"}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p>Décochez la case ci-dessus pour sélectionner un client enregistré.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block mb-2 font-medium text-gray-700">
                  Nom du client <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="customerName"
                  value={form.customerName}
                  onChange={handleChange}
                  placeholder="Entrer le nom du client"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block mb-2 font-medium text-gray-700">
                  Numéro de téléphone du client <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="customerPhone"
                  value={form.customerPhone}
                  onChange={handleChange}
                  placeholder="Entrer le numéro de téléphone"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block mb-2 font-medium text-gray-700">
                  Email du client (optionnel)
                </label>
                <input
                  type="email"
                  name="customerEmail"
                  value={form.customerEmail}
                  onChange={handleChange}
                  placeholder="Entrer l'email du client"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block mb-2 font-medium text-gray-700">
                Méthode de paiement
              </label>
              <select
                name="paymentMethod"
                value={form.paymentMethod}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa ou Airtel Money (Transfert)</option>
                <option value="bank">Transfert Bank</option>
                <option value="card">Carte Visa</option>
                <option value="other">Autres</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            onClick={handleSale}
            disabled={!isFormValid || submitting}
            className={`px-8 py-3 rounded-lg font-medium text-lg ${
              isFormValid && !submitting
                ? "bg-green-600 hover:bg-green-700 text-white shadow-sm"
                : "bg-gray-400 cursor-not-allowed text-white"
            } transition-colors`}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                En cours d'enregistrement...
              </span>
            ) : (
              "Enregistrer la vente"
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
