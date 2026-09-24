/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { useConnectivity } from "../context/ConnectivityContext";
import { cacheServerSales, type BusinessSale } from "../services/localBusinessReadModel";
import { ArrowRight, CheckCircle2, Minus, Plus, RefreshCw, Search, ShoppingCart, Trash2, UserRound } from "lucide-react";
import { Alert, CurrencyToggle, EmptyState, ExchangeRateChip, PageHeader } from "../components/ui";
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

export default function Reservation() {
  const connectivity = useConnectivity();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [loadingRate, setLoadingRate] = useState(true);
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
    paymentMethod: "cash" as UiPayment,
    notes: "",
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

  useEffect(() => {
    let cancelled = false;
    
    async function loadInitialData() {
      setLoadingProducts(true);
      setError(null);
      
      try {
        // Load products and exchange rate concurrently
        await Promise.all([
          loadProducts(),
          loadExchangeRate()
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
    form.customerName.trim() !== "" &&
    form.customerPhone.trim() !== "";

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
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
        <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
          <span className="ui-badge ui-badge-neutral tabular-nums">Stock disponible : {product.stock}</span>
          {currentCartQuantity > 0 && (
            <span className="ui-badge ui-badge-info tabular-nums">Déjà dans le panier : {currentCartQuantity}</span>
          )}
          {quantity > 0 && (
            <span className={`ui-badge tabular-nums ${canAddToCart ? "ui-badge-success" : "ui-badge-danger"}`}>
              Stock restant après réservation :{" "}
              {availableStock - quantity >= 0
                ? availableStock - quantity
                : "stock insuffisant"}
            </span>
          )}
        </div>
      );
    } else {
      // Staff sees status messages
      if (product.stock === 0) {
        return (
          <p className="ui-badge ui-badge-danger" aria-live="polite">En rupture de stock</p>
        );
      } else if (product.stock <= 5) {
        return (
          <p className="ui-badge ui-badge-warning" aria-live="polite">Stock faible</p>
        );
      } else if (quantity > 0 && !canAddToCart) {
        return (
          <p className="ui-badge ui-badge-danger" aria-live="polite">Quantité demandée non disponible</p>
        );
      } else if (quantity > 0) {
        return (
          <p className="ui-badge ui-badge-success" aria-live="polite">Stock suffisant</p>
        );
      } else {
        return (
          <p className="ui-badge ui-badge-success" aria-live="polite">En stock</p>
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

    // ✅ UPDATED: Check if product with same ID AND same price already exists in cart
    const existingItemIndex = cart.findIndex(
      (item) => item.productId === product._id && item.unitPrice === unitPrice
    );

    if (existingItemIndex >= 0) {
      // ✅ UPDATED: Update existing item (same product + same price)
      const updatedCart = [...cart];
      updatedCart[existingItemIndex] = {
        ...updatedCart[existingItemIndex],
        quantity: updatedCart[existingItemIndex].quantity + quantity,
        total: (updatedCart[existingItemIndex].quantity + quantity) * unitPrice,
      };
      setCart(updatedCart);
    } else {
      // ✅ UPDATED: Add new item (either different product OR same product but different price)
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

  const formatCurrency = (amount: number) => new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
  }).format(amount);

  const formatFc = (amount: number) => `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)} FC`;

  const canAddToCart = product && quantity > 0 && unitPrice > 0 &&
    checkStockAfterAdd(product._id, quantity);

  async function handleReservation(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;
    if (connectivity.status !== "online") {
      setError("Connexion requise pour créer une réservation en toute sécurité.");
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      // Get current date and time for reservation
      const now = new Date();
      const reservationDate = now.toLocaleDateString("fr-FR");
      const reservationTime = now.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const body = {
        customer: {
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
        reservationDate: reservationDate,
        reservationTime: reservationTime,
        notes: form.notes || "",
        type: "reservation",
        // Preserve the rate that was active when this reservation was saved.
        exchangeRateSnapshot: exchangeRate
          ? {
              rateId: exchangeRate._id,
              rate: exchangeRate.rate,
              effectiveFrom: exchangeRate.effectiveFrom,
            }
          : null,
      };

      // Use the sales endpoint to create the reservation (money recorded immediately)
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
          `Reservation failed (${res.status})`;
        throw new Error(msg);
      }

      // Keep the reservation document distinct, but print its committed Sale snapshot.
      const newReceiptData = normalizeSaleReceipt(data, {
        type: "reservation",
        exchangeRate: exchangeRate?.rate,
      });
      await cacheServerSales([data as BusinessSale]).catch(() => undefined);

      // Reset form and cart
      setForm({
        productId: "",
        quantity: "",
        unitPrice: "",
        priceInFC: "",
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        paymentMethod: form.paymentMethod,
        notes: "",
        currencyMode: "usd"
      });
      setCart([]);
      setSearchTerm("");

      setMessage(
        "Reservation effectuée avec succès ! Impression du reçu et de la souche..."
      );
      try {
        await printCommittedSaleAfterDelay(newReceiptData);
      } catch (printError: unknown) {
        setError(printError instanceof Error
          ? printError.message
          : "La réservation est enregistrée, mais l'impression a échouée.");
      }
    } catch (e: any) {
      setError(e?.message || "La reservation n'a pas pu être effectuée");
    } finally {
      setSubmitting(false);
    }
  }

  const cartUnits = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Stepper buttons only rewrite the same quantity field the input edits.
  const stepQuantity = (delta: number) =>
    setForm((f) => ({ ...f, quantity: String(Math.max(1, (parseInt(f.quantity) || 0) + delta)) }));

  const scrollToCheckout = () =>
    document.getElementById("reservation-checkout")?.scrollIntoView({ behavior: "smooth", block: "start" });

  // The running-total bar is redundant while the checkout panel itself is on
  // screen; this only toggles its visibility.
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  useEffect(() => {
    const panel = document.getElementById("reservation-checkout");
    if (!panel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCheckoutVisible(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`ui-page ui-page-wide ${cart.length > 0 ? "pb-28 lg:pb-7" : ""}`}>
      <PageHeader
        eyebrow="Réservations"
        title="Nouvelle réservation"
        description="Préparez une commande à retirer plus tard ; le paiement est enregistré immédiatement."
        actions={<ExchangeRateChip loading={loadingRate} rate={exchangeRate?.rate} effectiveFrom={exchangeRate?.effectiveFrom} />}
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-start xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-5">
          {/* Add items */}
          <section className="ui-card" aria-labelledby="reservation-add-title">
            <div className="ui-card-header">
              <h2 id="reservation-add-title" className="ui-section-title flex items-center gap-2"><Search className="h-4 w-4 text-blue-700" />Articles à réserver</h2>
              {products.length > 0 && <span className="text-xs text-slate-500">{products.length} articles disponibles</span>}
            </div>
            <div className="ui-card-body space-y-4">
              <div className="relative" ref={searchRef}>
                <label htmlFor="reservation-product-search" className="ui-label">Article</label>
                <div className="relative">
                  <Search className="ui-field-icon" aria-hidden="true" />
                  <input
                    id="reservation-product-search"
                    type="text"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    onFocus={() => setShowSearchResults(true)}
                    placeholder={loadingProducts ? "Chargement des articles…" : "Rechercher par nom ou SKU…"}
                    className="ui-input ui-input-icon"
                    disabled={loadingProducts || products.length === 0}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={showSearchResults && filteredProducts.length > 0}
                    aria-controls="reservation-product-results"
                    aria-autocomplete="list"
                  />
                </div>

                {/* Search Results Dropdown */}
                {showSearchResults && filteredProducts.length > 0 && (
                  <div id="reservation-product-results" role="listbox" className="absolute inset-x-0 z-20 mt-1 max-h-[min(20rem,55dvh)] overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {filteredProducts.map((product) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={form.productId === product._id}
                        key={product._id}
                        className="flex w-full min-w-0 flex-col gap-0.5 px-3.5 py-2.5 text-left transition-colors hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"
                        onClick={() => handleProductSelect(product)}
                      >
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900">
                          <span className="truncate">{product.name}</span>
                          {product.regionCode && <span className="ui-tag">{product.regionCode}</span>}
                        </span>
                        <span className="flex justify-between gap-3 text-xs text-slate-500">
                          <span className="truncate">{product.sku && `SKU : ${product.sku}`}</span>
                          <span className={`shrink-0 font-medium ${product.stock === 0 ? "text-red-600" : product.stock <= 5 ? "text-amber-700" : "text-emerald-700"}`}>
                            {renderStockInfo(product)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* No Results Message */}
                {showSearchResults && searchTerm && filteredProducts.length === 0 && (
                  <div className="absolute inset-x-0 z-20 mt-1 rounded-lg border border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500 shadow-lg">
                    Aucun article trouvé
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="reservation-quantity" className="ui-label">Nombre de pièces</label>
                  <div className="flex items-stretch gap-2">
                    <button type="button" onClick={() => stepQuantity(-1)} className="ui-btn ui-btn-secondary w-11 shrink-0 px-0" aria-label="Diminuer la quantité"><Minus /></button>
                    <input
                      id="reservation-quantity"
                      type="number"
                      name="quantity"
                      value={form.quantity}
                      onChange={handleChange}
                      placeholder="0"
                      className="ui-input text-center font-semibold tabular-nums"
                      min={1}
                      inputMode="numeric"
                    />
                    <button type="button" onClick={() => stepQuantity(1)} className="ui-btn ui-btn-secondary w-11 shrink-0 px-0" aria-label="Augmenter la quantité"><Plus /></button>
                  </div>
                </div>

                <div>
                  <label htmlFor="reservation-unit-price" className="ui-label">
                    Prix unitaire <span className="font-normal text-slate-500">({form.currencyMode === 'usd' ? 'USD' : 'FC'})</span>
                  </label>
                  <div className="flex items-stretch gap-2">
                    <div className="min-w-0 flex-1">
                      {form.currencyMode === 'usd' ? (
                        <input
                          id="reservation-unit-price"
                          type="number"
                          step="0.01"
                          name="unitPrice"
                          value={form.unitPrice}
                          onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                          placeholder={product?.price ? `ex : ${product.price}` : "Prix en USD"}
                          className="ui-input tabular-nums"
                          min={0.01}
                          inputMode="decimal"
                        />
                      ) : (
                        <input
                          id="reservation-unit-price"
                          type="number"
                          name="priceInFC"
                          value={form.priceInFC}
                          onChange={(e) => setForm({ ...form, priceInFC: e.target.value })}
                          placeholder="Prix en FC"
                          className="ui-input tabular-nums"
                          min={1}
                          inputMode="numeric"
                        />
                      )}
                    </div>
                    <CurrencyToggle mode={form.currencyMode} onToggle={toggleCurrencyMode} label="Devise du prix" />
                  </div>

                  {/* Conversion Display */}
                  {form.unitPrice && form.currencyMode === 'usd' && exchangeRate && (
                    <p className="ui-help tabular-nums">≈ {formatFc(parseFloat(form.unitPrice) * exchangeRate.rate)}</p>
                  )}
                  {form.priceInFC && form.currencyMode === 'fc' && exchangeRate && (
                    <p className="ui-help tabular-nums">≈ {formatCurrency(parseFloat(form.priceInFC) / exchangeRate.rate)}</p>
                  )}
                </div>
              </div>

              {product && renderAvailableStockMessage(product, quantity)}

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  {quantity > 0 && unitPrice > 0 ? (
                    <>Sous-total : <span className="font-semibold tabular-nums text-slate-900">{formatCurrency(itemTotal)}</span></>
                  ) : (
                    "Sélectionnez un article, une quantité et un prix."
                  )}
                </p>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!canAddToCart}
                  className="ui-btn ui-btn-primary w-full sm:w-auto"
                >
                  <ShoppingCart />
                  Ajouter au panier
                </button>
              </div>
            </div>
          </section>

          {/* Customer */}
          <section className="ui-card" aria-labelledby="reservation-customer-title">
            <div className="ui-card-header">
              <h2 id="reservation-customer-title" className="ui-section-title flex items-center gap-2"><UserRound className="h-4 w-4 text-blue-700" />Client</h2>
            </div>
            <div className="ui-card-body grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="reservation-customer-name" className="ui-label">Nom du client <span className="ui-required">*</span></label>
                <input
                  id="reservation-customer-name"
                  type="text"
                  name="customerName"
                  value={form.customerName}
                  onChange={handleChange}
                  placeholder="Nom complet"
                  className="ui-input"
                  autoComplete="off"
                  required
                />
              </div>

              <div>
                <label htmlFor="reservation-customer-phone" className="ui-label">Téléphone <span className="ui-required">*</span></label>
                <input
                  id="reservation-customer-phone"
                  type="tel"
                  name="customerPhone"
                  value={form.customerPhone}
                  onChange={handleChange}
                  placeholder="+243 …"
                  className="ui-input"
                  inputMode="tel"
                  autoComplete="off"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="reservation-customer-email" className="ui-label">Email <span className="font-normal text-slate-500">(optionnel)</span></label>
                <input
                  id="reservation-customer-email"
                  type="email"
                  name="customerEmail"
                  value={form.customerEmail}
                  onChange={handleChange}
                  placeholder="client@exemple.com"
                  className="ui-input"
                  inputMode="email"
                  autoComplete="off"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="reservation-notes" className="ui-label">Notes <span className="font-normal text-slate-500">(optionnel)</span></label>
                <textarea
                  id="reservation-notes"
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="Notes supplémentaires pour la réservation"
                  className="ui-input"
                  rows={3}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Order summary / checkout */}
        <aside id="reservation-checkout" className="ui-card min-w-0 scroll-mt-20 lg:sticky lg:top-20" aria-labelledby="reservation-cart-title">
          <div className="ui-card-header">
            <h2 id="reservation-cart-title" className="ui-section-title flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-blue-700" />Panier de réservation</h2>
            <span className="ui-badge ui-badge-neutral tabular-nums">{cart.length} ligne{cart.length === 1 ? "" : "s"} · {cartUnits} pièce{cartUnits === 1 ? "" : "s"}</span>
          </div>

          {cart.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Panier vide" description="Les articles ajoutés apparaîtront ici." className="py-10" />
          ) : (
            <ul className="max-h-[22rem] divide-y divide-slate-100 overflow-y-auto">
              {cart.map((item, index) => (
                <li key={index} className="flex min-w-0 items-start gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-900">
                      <span className="break-words">{item.name}</span>
                      {item.regionCode && <span className="ui-tag">{item.regionCode}</span>}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                      {item.quantity} × {formatCurrency(item.unitPrice)}
                      {exchangeRate && <span className="text-slate-400"> · ≈ {formatFc(item.unitPrice * exchangeRate.rate)}</span>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(item.total)}</p>
                    {exchangeRate && <p className="text-xs tabular-nums text-slate-500">≈ {formatFc(item.total * exchangeRate.rate)}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(index)}
                    className="ui-icon-btn ui-icon-btn-danger -mr-2 -mt-1.5"
                    aria-label={`Enlever ${item.name} du panier`}
                    title="Enlever"
                  >
                    <Trash2 />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-4 border-t border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5">
            <div className="flex items-end justify-between gap-3">
              <span className="text-sm font-medium text-slate-600">Total de la réservation</span>
              <span className="text-right">
                <span className="block text-2xl font-semibold tracking-tight tabular-nums text-slate-950">{formatCurrency(cartTotal)}</span>
                {exchangeRate && <span className="block text-sm font-medium tabular-nums text-slate-500">≈ {formatFc(cartTotal * exchangeRate.rate)}</span>}
              </span>
            </div>

            <div>
              <label htmlFor="reservation-payment-method" className="ui-label">Méthode de paiement</label>
              <select
                id="reservation-payment-method"
                name="paymentMethod"
                value={form.paymentMethod}
                onChange={handleChange}
                className="ui-input"
                required
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa ou Airtel Money (Transfert)</option>
                <option value="bank">Transfert Bank</option>
                <option value="card">Carte Visa</option>
                <option value="other">Autres</option>
              </select>
            </div>

            {cart.length > 0 && !isFormValid && (
              <p className="text-xs font-medium text-amber-700">Renseignez le nom et le téléphone du client pour continuer.</p>
            )}

            <button
              type="submit"
              onClick={handleReservation}
              disabled={!isFormValid || submitting}
              className="ui-btn ui-btn-success ui-btn-lg ui-btn-block"
            >
              {submitting ? (
                <>
                  <RefreshCw className="animate-spin" />
                  Enregistrement en cours…
                </>
              ) : (
                <>
                  <CheckCircle2 />
                  Confirmer la réservation
                </>
              )}
            </button>
          </div>
        </aside>
      </div>

      {/* Phone/tablet checkout bar: running total always in reach. */}
      {cart.length > 0 && !checkoutVisible && (
        <div className="pos-checkout-bar lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">{cartUnits} pièce{cartUnits === 1 ? "" : "s"} · Total</p>
              <p className="truncate text-lg font-semibold leading-tight tabular-nums text-slate-950">
                {formatCurrency(cartTotal)}
                {exchangeRate && <span className="ml-1.5 text-xs font-medium text-slate-500">≈ {formatFc(cartTotal * exchangeRate.rate)}</span>}
              </p>
            </div>
            <button type="button" onClick={scrollToCheckout} className="ui-btn ui-btn-primary shrink-0">
              Finaliser
              <ArrowRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
