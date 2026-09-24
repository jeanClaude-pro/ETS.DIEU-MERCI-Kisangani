/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { ArrowRight, CheckCircle2, Minus, Plus, RefreshCw, Search, ShoppingCart, Trash2, UserRound } from "lucide-react";
import { Alert, CurrencyToggle, EmptyState, ExchangeRateChip, PageHeader } from "../components/ui";
import {
  normalizeSaleReceipt,
  printCommittedSaleAfterDelay,
} from "../services/printService";
import { useConnectivity } from "../context/ConnectivityContext";
import { canSellOffline } from "../services/authorizationService";
import { generateBarcodeToken, formatReceiptNumber, generateClientSaleId } from "../utils/barcodeId.ts";
import { offlineDb, commitOfflineSale, type OfflineSale } from "../lib/offlineDb";
import { refreshFromServer, subscribeLocal } from "../services/offlineProductSnapshot";
import { useOfflineReadiness } from "../hooks/useOfflineReadiness";
import { cacheServerSales, type BusinessSale } from "../services/localBusinessReadModel";

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
  const [lastSnapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Get the current user from your auth context
  const { activeUser: currentUser, token } = useAuth();
  const connectivity = useConnectivity();
  const offlineReadiness = useOfflineReadiness();

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

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeLocal(
      (snapshot) => {
        if (cancelled) return;
        setProducts(snapshot.products.map((item) => ({ ...item, _id: item.productId })));
        setExchangeRate(snapshot.exchangeRate);
        setWalkInCustomer(snapshot.walkInCustomer);
        setSnapshotAt(snapshot.lastUpdated);
        setLoadingProducts(false);
        setLoadingRate(false);
      },
      (cause) => {
        if (cancelled) return;
        setLoadingProducts(false);
        setLoadingRate(false);
        setError(cause instanceof Error ? cause.message : "Impossible de lire les données locales.");
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // This background refresh never blocks the local first paint. The live
  // subscription above applies only a fully committed trusted snapshot.
  useEffect(() => {
    if (connectivity.status !== "online" || !token) return;
    let cancelled = false;
    void refreshFromServer(token).catch(async (cause) => {
      if (!cancelled && await offlineDb.products.count() === 0) {
        setError(cause instanceof Error ? cause.message : "Aucune donnée produit n'est disponible.");
      }
    });
    return () => { cancelled = true; };
  }, [connectivity.status, token]);

  const product = useMemo(
    () => products.find((p) => p._id === form.productId),
    [products, form.productId]
  );

  // Product search is intentionally independent of categories.
  const filteredProducts = useMemo(() => {
    return products.filter(product =>
      (!searchTerm.trim() ||
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase())))
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
        <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
          <span className="ui-badge ui-badge-neutral tabular-nums">Stock disponible : {product.stock}</span>
          {currentCartQuantity > 0 && (
            <span className="ui-badge ui-badge-info tabular-nums">Déjà dans le panier : {currentCartQuantity}</span>
          )}
          {quantity > 0 && (
            <span className={`ui-badge tabular-nums ${canAddToCart ? "ui-badge-success" : "ui-badge-danger"}`}>
              Stock restant après vente :{" "}
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

  function buildSaleCustomer() {
    return form.isWalkIn
      ? { name: form.customerName, phone: "", email: "", isWalkIn: true }
      : { name: form.customerName, phone: form.customerPhone, email: form.customerEmail || "" };
  }

  function resetFormAndCart() {
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
  }

  // Genuinely unavailable — never navigator.onLine alone (Part F). A device
  // can have Wi-Fi while the API/MongoDB itself is unreachable.
  /**
   * Durable local sale creation (Part F/G). Validates against the cached
   * product projection, writes sale + stock projection + audit ledger
   * atomically to IndexedDB, and only then prints. If persistence fails,
   * nothing is reported as saved and nothing is printed.
   */
  async function submitOffline(options?: {
    clientSaleId: string;
    barcodeToken: string;
    receiptNumber: string;
    occurredAt: string;
    syncState: "PENDING" | "PENDING_CONFIRMATION";
    origin: "offline" | "online";
  }) {
    const authorization = canSellOffline();
    if (!authorization.allowed) {
      throw new Error(authorization.reason || "Vente hors-ligne non autorisée sur cet appareil.");
    }

    // Spec: never silently fall back to 1 USD = 1 FC. If this device has
    // never cached a trusted exchange rate, offline selling must be blocked
    // outright rather than recording a sale with no rate snapshot.
    if (!offlineReadiness.hasExchangeRate) {
      throw new Error("Aucun taux de change fiable n'est enregistré sur cet appareil. Connectez-vous en ligne au moins une fois avant de vendre hors ligne.");
    }

    const canonicalItems: Array<{
      productId: string; name: string; quantity: number; price: number;
      region: "Butembo" | "China"; regionCode: "Bbbb" | "Cnnn";
      unit?: string; unitCost?: number;
    }> = [];
    for (const item of cart) {
      const cached = await offlineDb.products.get(item.productId);
      if (!cached) throw new Error(`Article introuvable dans les données locales : ${item.name}`);
      if (cached.stock < item.quantity) {
        throw new Error(`Stock local insuffisant pour ${cached.name}. Disponible : ${cached.stock}`);
      }
      canonicalItems.push({
        productId: cached.productId,
        name: cached.name,
        quantity: item.quantity,
        price: item.unitPrice,
        region: cached.region,
        regionCode: cached.regionCode,
        unit: cached.unit,
        unitCost: cached.unitCost,
      });
    }

    const barcodeToken = options?.barcodeToken || generateBarcodeToken();
    const receiptNumber = options?.receiptNumber || formatReceiptNumber(barcodeToken) || barcodeToken;
    const clientSaleId = options?.clientSaleId || generateClientSaleId();
    const occurredAt = options?.occurredAt || new Date().toISOString();
    const customer = buildSaleCustomer();
    // A PIN-only offline session has no `currentUser` (no token/user at
    // all) — attribute the sale to whichever of the two paths actually
    // authorized it above.
    const salesPerson = authorization.identity?.username || currentUser?.username || "unknown";
    const rateSnapshot = exchangeRate
      ? { rateId: exchangeRate._id, rate: exchangeRate.rate, effectiveFrom: exchangeRate.effectiveFrom }
      : null;

    const paymentMethod = uiToModelPayment(form.paymentMethod);

    // Built once, up front, and stored verbatim on the record — a later
    // reprint (from the sync center or a future offline-reprint action)
    // must reproduce exactly this receipt, never recompute it from mutable
    // state.
    const receipt = normalizeSaleReceipt({
      _id: clientSaleId,
      receiptNumber,
      barcodeToken,
      createdAt: occurredAt,
      customer,
      items: canonicalItems.map((item) => ({ name: item.name, unit: item.unit, quantity: item.quantity, price: item.price, regionCode: item.regionCode })),
      subtotal: cartTotal,
      total: cartTotal,
      paymentMethod,
      salesPerson,
      status: "completed",
      type: "sale",
      exchangeRateSnapshot: rateSnapshot ?? undefined,
    }, { type: "sale", exchangeRate: exchangeRate?.rate });

    const offlineSale: OfflineSale = {
      clientSaleId,
      barcodeToken,
      receiptNumber,
      occurredAt,
      payload: {
        customer,
        items: canonicalItems,
        subtotal: cartTotal,
        total: cartTotal,
        paymentMethod,
        salesPerson,
        exchangeRateSnapshot: rateSnapshot,
        clientSaleId,
        barcodeToken,
        receiptNumber,
        clientOccurredAt: occurredAt,
        origin: options?.origin || "offline",
      },
      receiptSnapshot: receipt,
      syncState: options?.syncState || "PENDING",
      attempts: 0,
      lastError: null,
      lastAttemptAt: null,
      syncedSaleId: null,
      syncedAt: null,
      createdAt: occurredAt,
    };

    const stockDeltas = canonicalItems.map((item) => ({ productId: item.productId, quantityDelta: -item.quantity }));

    // Atomic: if this throws, no partial sale/stock/ledger write happened,
    // and nothing below (print, form reset) runs — the sale is never
    // reported as saved.
    await commitOfflineSale(offlineSale, stockDeltas);

    resetFormAndCart();
    setMessage(options?.syncState === "PENDING_CONFIRMATION"
      ? "Vente conservée en sécurité. Confirmation du serveur en attente; elle sera vérifiée automatiquement sans créer de doublon."
      : "Vente enregistrée hors ligne. Reçu enregistré et ajouté à la file de synchronisation.");
    try {
      // The ESC/POS implementation is the remote Express endpoint. The
      // connectivity check already proved it unreachable, so print this
      // committed IndexedDB snapshot locally without probing Render.
      await printCommittedSaleAfterDelay(receipt, { directPrintMode: "none" });
    } catch (printError: unknown) {
      setError(printError instanceof Error
        ? printError.message
        : "La vente hors-ligne est enregistrée, mais l'impression a échoué.");
    }
  }

  async function handleSale(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const connectivityState = await connectivity.checkNow();

      if (connectivityState !== "online") {
        await submitOffline();
        return;
      }

      // Create one permanent identity before transmission. If the response
      // is lost, the same identity is persisted and retried idempotently.
      const barcodeToken = generateBarcodeToken();
      const receiptNumber = formatReceiptNumber(barcodeToken) || barcodeToken;
      const clientSaleId = generateClientSaleId();
      const occurredAt = new Date().toISOString();

      const body = {
        customer: buildSaleCustomer(),
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
        // Makes a lost response safely retryable (Part V) without risking a
        // duplicate sale/stock decrement — the server recognizes a repeat.
        clientSaleId,
        barcodeToken,
        receiptNumber,
      };

      let res: Response;
      try {
        res = await fetch(`${API_BASE}/sales`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader(),
          },
          body: JSON.stringify(body),
        });
      } catch {
        // The server may have committed before the response disappeared.
        // Persist this same identity; never manufacture a second sale.
        connectivity.reportNetworkFailure();
        await submitOffline({
          clientSaleId,
          barcodeToken,
          receiptNumber,
          occurredAt,
          syncState: "PENDING_CONFIRMATION",
          origin: "online",
        });
        return;
      }

      const data = await readJsonSafe(res);
      if (!res.ok) {
        const msg =
          (data as any)?.error ||
          (data as any)?.text ||
          `Sale failed (${res.status})`;
        throw new Error(msg);
      }

      // Keep the durable operational snapshot authoritative after an online
      // sale, so an immediate later outage cannot expose pre-sale stock.
      try {
        const token = localStorage.getItem("token") || "";
        await refreshFromServer(token);
      } catch {
        // The server already committed. Conservatively project the known
        // quantities locally until the next authenticated refresh succeeds.
        try {
          await offlineDb.transaction("rw", offlineDb.products, async () => {
            for (const item of cart) {
              const cached = await offlineDb.products.get(item.productId);
              if (cached) await offlineDb.products.update(item.productId, { stock: Math.max(0, cached.stock - item.quantity) });
            }
          });
        } catch { /* Receipt printing must still proceed for the committed sale. */ }
      }

      // Always print from the committed server snapshot, never from the mutable cart.
      const newReceiptData = normalizeSaleReceipt(data, {
        type: "sale",
        exchangeRate: exchangeRate?.rate,
      });
      // A just-committed online transaction is also part of the next offline
      // read base; do not wait for SalesHistory to be opened before caching it.
      await cacheServerSales([data as BusinessSale]).catch(() => undefined);

      resetFormAndCart();

      setMessage(
        "Vente effectuée avec succès ! Impression du reçu et de la souche..."
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
  const cartUnits = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Stepper buttons only rewrite the same quantity field the input edits.
  const stepQuantity = (delta: number) =>
    setForm((f) => ({ ...f, quantity: String(Math.max(1, (parseInt(f.quantity) || 0) + delta)) }));

  const scrollToCheckout = () =>
    document.getElementById("pos-checkout")?.scrollIntoView({ behavior: "smooth", block: "start" });

  // The running-total bar is redundant while the checkout panel itself is on
  // screen; this only toggles its visibility.
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  useEffect(() => {
    const panel = document.getElementById("pos-checkout");
    if (!panel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCheckoutVisible(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`ui-page ui-page-wide ${cart.length > 0 ? "pb-28 lg:pb-7" : ""}`}>
      <PageHeader
        eyebrow="Point de vente"
        title="Nouvelle vente"
        description="Ajoutez les articles, identifiez le client puis encaissez."
        actions={<ExchangeRateChip loading={loadingRate} rate={exchangeRate?.rate} effectiveFrom={exchangeRate?.effectiveFrom} />}
      />

      {connectivity.status !== "online" && (
        offlineReadiness.ready ? (
          <Alert tone="info" title="Mode hors ligne prêt">
            Cette vente sera enregistrée sur cet appareil et synchronisée automatiquement lorsque la connexion sera rétablie.
            {lastSnapshotAt && <span className="mt-1 block text-xs opacity-80">Données mises à jour à {new Date(lastSnapshotAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
          </Alert>
        ) : (
          <Alert tone="warning" title="Mode hors ligne non préparé">
            Reconnectez cet appareil pour télécharger les données nécessaires (produits, taux de change) avant de pouvoir vendre hors ligne.
          </Alert>
        )
      )}

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-start xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-5">
          {/* Add items */}
          <section className="ui-card" aria-labelledby="pos-add-title">
            <div className="ui-card-header">
              <h2 id="pos-add-title" className="ui-section-title flex items-center gap-2"><Search className="h-4 w-4 text-blue-700" />Ajouter un article</h2>
              {products.length > 0 && <span className="text-xs text-slate-500">{products.length} articles disponibles</span>}
            </div>
            <div className="ui-card-body space-y-4">
              <div className="relative" ref={searchRef}>
                <label htmlFor="pos-product-search" className="ui-label">Article</label>
                <div className="relative">
                  <Search className="ui-field-icon" aria-hidden="true" />
                  <input
                    id="pos-product-search"
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
                    aria-controls="pos-product-results"
                    aria-autocomplete="list"
                  />
                </div>

                {/* Search Results Dropdown */}
                {showSearchResults && filteredProducts.length > 0 && (
                  <div id="pos-product-results" role="listbox" className="absolute inset-x-0 z-20 mt-1 max-h-[min(20rem,55dvh)] overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
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
                  <label htmlFor="pos-quantity" className="ui-label">Nombre de pièces</label>
                  <div className="flex items-stretch gap-2">
                    <button type="button" onClick={() => stepQuantity(-1)} className="ui-btn ui-btn-secondary w-11 shrink-0 px-0" aria-label="Diminuer la quantité"><Minus /></button>
                    <input
                      id="pos-quantity"
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
                  <label htmlFor="pos-unit-price" className="ui-label">
                    Prix unitaire <span className="font-normal text-slate-500">({form.currencyMode === 'usd' ? 'USD' : 'FC'})</span>
                  </label>
                  <div className="flex items-stretch gap-2">
                  <div className="min-w-0 flex-1">
                  {form.currencyMode === 'usd' ? (
                    <input
                      id="pos-unit-price"
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
                      id="pos-unit-price"
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
          <section className="ui-card" aria-labelledby="pos-customer-title">
            <div className="ui-card-header">
              <h2 id="pos-customer-title" className="ui-section-title flex items-center gap-2"><UserRound className="h-4 w-4 text-blue-700" />Client</h2>
            </div>
            <div className="ui-card-body space-y-4">
              <label className="flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <input
                  type="checkbox"
                  checked={form.isWalkIn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isWalkIn: e.target.checked }))
                  }
                  className="ui-checkbox"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-900">Client de passage</span>
                  <span className="block text-xs text-slate-500">Décochez pour saisir un client enregistré.</span>
                </span>
              </label>

              {form.isWalkIn ? (
                <div>
                  <label className="ui-label" htmlFor="walkInCustomerName">
                    Nom du client <span className="font-normal text-slate-500">(optionnel)</span>
                  </label>
                  <input
                    id="walkInCustomerName"
                    type="text"
                    name="customerName"
                    value={form.customerName}
                    onChange={handleChange}
                    placeholder={walkInCustomer?.name || "Walk-in Customer"}
                    className="ui-input"
                    autoComplete="off"
                  />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="pos-customer-name" className="ui-label">
                      Nom du client <span className="ui-required">*</span>
                    </label>
                    <input
                      id="pos-customer-name"
                      type="text"
                      name="customerName"
                      value={form.customerName}
                      onChange={handleChange}
                      placeholder="Nom complet"
                      className="ui-input"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label htmlFor="pos-customer-phone" className="ui-label">
                      Téléphone <span className="ui-required">*</span>
                    </label>
                    <input
                      id="pos-customer-phone"
                      type="tel"
                      name="customerPhone"
                      value={form.customerPhone}
                      onChange={handleChange}
                      placeholder="+243 …"
                      className="ui-input"
                      autoComplete="off"
                      inputMode="tel"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="pos-customer-email" className="ui-label">
                      Email <span className="font-normal text-slate-500">(optionnel)</span>
                    </label>
                    <input
                      id="pos-customer-email"
                      type="email"
                      name="customerEmail"
                      value={form.customerEmail}
                      onChange={handleChange}
                      placeholder="client@exemple.com"
                      className="ui-input"
                      autoComplete="off"
                      inputMode="email"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Order summary / checkout */}
        <aside id="pos-checkout" className="ui-card min-w-0 scroll-mt-20 lg:sticky lg:top-20" aria-labelledby="pos-cart-title">
          <div className="ui-card-header">
            <h2 id="pos-cart-title" className="ui-section-title flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-blue-700" />Panier</h2>
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
              <span className="text-sm font-medium text-slate-600">Total à payer</span>
              <span className="text-right">
                <span className="block text-2xl font-semibold tracking-tight tabular-nums text-slate-950">{formatCurrency(cartTotal)}</span>
                {exchangeRate && <span className="block text-sm font-medium tabular-nums text-slate-500">≈ {formatFc(cartTotal * exchangeRate.rate)}</span>}
              </span>
            </div>

            <div>
              <label htmlFor="pos-payment-method" className="ui-label">Méthode de paiement</label>
              <select
                id="pos-payment-method"
                name="paymentMethod"
                value={form.paymentMethod}
                onChange={handleChange}
                className="ui-input"
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa ou Airtel Money (Transfert)</option>
                <option value="bank">Transfert Bank</option>
                <option value="card">Carte Visa</option>
                <option value="other">Autres</option>
              </select>
            </div>

            {!form.isWalkIn && cart.length > 0 && !isFormValid && (
              <p className="text-xs font-medium text-amber-700">Renseignez le nom et le téléphone du client pour continuer.</p>
            )}

            <button
              type="submit"
              onClick={handleSale}
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
                  Enregistrer la vente
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
