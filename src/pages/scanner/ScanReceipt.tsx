import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, HelpCircle, RotateCcw, ScanLine, Server, HardDrive } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useZxingScanner } from "../../hooks/useZxingScanner";
import { isValidBarcodeToken } from "../../utils/barcodeId";
import { getOfflineSaleByBarcode } from "../../lib/offlineDb";
import { serverUrl } from "../../utils/constants";

type ScanState = "idle" | "looking-up" | "found" | "not-found" | "malformed" | "error";

interface ScanResult {
  receiptNumber: string;
  occurredAt: string;
  customerName: string;
  totalUSD: number;
  totalFC: number | null;
  paymentMethod: string;
  salesPerson: string;
  itemCount: number;
  status: string;
  type: string;
  source: "server" | "local";
  pendingSync?: boolean;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lubumbashi" });
}

export default function ScanReceipt() {
  const { token } = useAuth();
  const connectivity = useConnectivity();
  const [state, setState] = useState<ScanState>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");

  const lookup = useCallback(async (rawValue: string) => {
    const value = rawValue.trim().toUpperCase();
    if (!value) return;
    if (!isValidBarcodeToken(value)) {
      setState("malformed");
      setResult(null);
      return;
    }
    setState("looking-up");

    const online = await connectivity.forceCheck();
    if (online) {
      try {
        const response = await fetch(`${serverUrl}/sales/barcode/${value}`, {
          headers: { Authorization: `Bearer ${token || ""}` },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.found) {
            setResult({ ...data, source: "server" });
            setState("found");
            return;
          }
          setState("not-found");
          setResult(null);
          return;
        }
      } catch {
        // fall through to local lookup below
      }
    }

    // Offline, or the server lookup itself failed — fall back to this
    // device's own local records and say so clearly (Part M/N).
    const localSale = await getOfflineSaleByBarcode(value);
    if (!localSale) {
      setState("not-found");
      setResult(null);
      return;
    }
    const itemCount = localSale.payload.items.reduce((sum, item) => sum + item.quantity, 0);
    const rate = localSale.payload.exchangeRateSnapshot?.rate;
    setResult({
      receiptNumber: localSale.receiptNumber,
      occurredAt: localSale.occurredAt,
      customerName: localSale.payload.customer.isWalkIn ? "Walk-in Customer" : localSale.payload.customer.name,
      totalUSD: localSale.payload.total,
      totalFC: rate ? Math.round(localSale.payload.total * rate) : null,
      paymentMethod: localSale.payload.paymentMethod,
      salesPerson: localSale.payload.salesPerson,
      itemCount,
      status: "completed",
      type: "sale",
      source: "local",
      pendingSync: localSale.syncState !== "SYNCED",
    });
    setState("found");
  }, [connectivity, token]);

  const { videoRef, permission } = useZxingScanner({
    active: cameraOn,
    onDecode: (text) => {
      setInputValue(text);
      void lookup(text);
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, [state]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void lookup(inputValue);
  }

  function reset() {
    setState("idle");
    setResult(null);
    setInputValue("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-auto">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Scanner un reçu</h2>
          <p className="text-gray-600 mt-1">Utilisez la caméra ou un lecteur USB pour vérifier un reçu à partir de son code-barres.</p>
        </div>

        {/* Camera viewport */}
        <div className="rounded-2xl border border-gray-200 bg-gray-900 overflow-hidden relative">
          {cameraOn ? (
            <div className="relative aspect-[4/3] sm:aspect-video">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-4/5 max-w-xs aspect-[3/1] rounded-lg border-2 border-white/70" />
              </div>
              {permission === "requesting" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm gap-2">
                  <Camera className="h-4 w-4 animate-pulse" /> Demande d'accès à la caméra…
                </div>
              )}
              {permission === "denied" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white text-sm gap-2 p-4 text-center">
                  <CameraOff className="h-5 w-5" />
                  Accès à la caméra refusé. Autorisez-le dans les paramètres du navigateur, ou utilisez un lecteur USB ci-dessous.
                </div>
              )}
              {permission === "unavailable" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white text-sm gap-2 p-4 text-center">
                  <CameraOff className="h-5 w-5" />
                  Aucune caméra disponible sur cet appareil. Utilisez un lecteur USB ci-dessous.
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-[4/3] sm:aspect-video flex items-center justify-center text-white/70 text-sm gap-2">
              <CameraOff className="h-4 w-4" /> Caméra désactivée
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCameraOn((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]"
        >
          {cameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {cameraOn ? "Désactiver la caméra" : "Activer la caméra"}
        </button>

        {/* USB scanner / manual entry — same field, same lookup path */}
        <form onSubmit={handleSubmit} className="space-y-2">
          <label htmlFor="scan-input" className="block text-sm font-medium text-gray-700">
            Code du reçu (lecteur USB ou saisie manuelle)
          </label>
          <div className="flex gap-2">
            <input
              id="scan-input"
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Scannez ou saisissez le code"
              className="flex-1 min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-base tracking-wide uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoComplete="off"
              autoFocus
            />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 min-h-[44px]"
            >
              <ScanLine className="h-4 w-4" /> Vérifier
            </button>
          </div>
          <p className="text-xs text-gray-500">Un lecteur USB tape automatiquement le code puis "Entrée" — il suffit que ce champ soit sélectionné.</p>
        </form>

        {/* Result surface */}
        {state === "looking-up" && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">Vérification en cours…</div>
        )}

        {state === "malformed" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <HelpCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">Code illisible</p>
              <p className="text-sm text-amber-700">Ce code ne correspond pas au format attendu d'un reçu. Réessayez le scan.</p>
            </div>
          </div>
        )}

        {state === "not-found" && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-start gap-3">
            <HelpCircle className="h-5 w-5 text-gray-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-800">Reçu introuvable</p>
              <p className="text-sm text-gray-600">Aucun reçu ne correspond à ce code{connectivity.status === "offline" ? " dans les données locales" : ""}.</p>
            </div>
          </div>
        )}

        {state === "found" && result && (
          <div className="rounded-xl border border-emerald-200 bg-white overflow-hidden">
            <div className={`px-4 py-2 text-xs font-semibold flex items-center gap-1.5 ${result.source === "server" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
              {result.source === "server" ? <Server className="h-3.5 w-3.5" /> : <HardDrive className="h-3.5 w-3.5" />}
              {result.source === "server" ? "Résultat officiel du serveur" : "Résultat local hors-ligne (non vérifié par le serveur)"}
              {result.pendingSync && " — synchronisation en attente"}
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="font-semibold text-gray-900">{result.receiptNumber}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">Date</dt>
                <dd className="text-gray-900">{formatDate(result.occurredAt)}</dd>
                <dt className="text-gray-500">Client</dt>
                <dd className="text-gray-900">{result.customerName}</dd>
                <dt className="text-gray-500">Total</dt>
                <dd className="text-gray-900 font-semibold">{result.totalUSD.toFixed(2)} USD{result.totalFC ? ` · ${result.totalFC.toLocaleString("fr-FR")} FC` : ""}</dd>
                <dt className="text-gray-500">Paiement</dt>
                <dd className="text-gray-900">{result.paymentMethod.toUpperCase()}</dd>
                <dt className="text-gray-500">Agent</dt>
                <dd className="text-gray-900">{result.salesPerson}</dd>
                <dt className="text-gray-500">Articles</dt>
                <dd className="text-gray-900">{result.itemCount}</dd>
                <dt className="text-gray-500">Statut</dt>
                <dd className="text-gray-900">{result.status}</dd>
              </dl>
            </div>
          </div>
        )}

        {state !== "idle" && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]"
          >
            <RotateCcw className="h-4 w-4" /> Scanner un autre reçu
          </button>
        )}
      </div>
    </div>
  );
}
