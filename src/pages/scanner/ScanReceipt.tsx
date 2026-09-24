import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, RotateCcw, ScanLine, Server, HardDrive } from "lucide-react";
import { Alert, LoadingState, PageHeader } from "../../components/ui";
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

    const online = await connectivity.checkNow();
    if (online === "online") {
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
    <div className="ui-page max-w-3xl">
      <PageHeader
        eyebrow="Contrôle"
        title="Scanner un reçu"
        description="Utilisez la caméra ou un lecteur USB pour vérifier un reçu à partir de son code-barres."
      />

      <section className="ui-card overflow-hidden" aria-label="Lecteur de code-barres">
        {/* Camera viewport */}
        <div className="relative bg-slate-900">
          {cameraOn ? (
            <div className="relative aspect-[4/3] overflow-hidden sm:aspect-video">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="aspect-[3/1] w-4/5 max-w-xs rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgb(2_6_23/0.35)]" />
              </div>
              {permission === "requesting" && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-950/60 text-sm text-white">
                  <Camera className="h-4 w-4 animate-pulse" /> Demande d'accès à la caméra…
                </div>
              )}
              {permission === "denied" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 p-4 text-center text-sm text-white">
                  <CameraOff className="h-5 w-5" />
                  Accès à la caméra refusé. Autorisez-le dans les paramètres du navigateur, ou utilisez un lecteur USB ci-dessous.
                </div>
              )}
              {permission === "unavailable" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 p-4 text-center text-sm text-white">
                  <CameraOff className="h-5 w-5" />
                  Aucune caméra disponible sur cet appareil. Utilisez un lecteur USB ci-dessous.
                </div>
              )}
            </div>
          ) : (
            <div className="flex aspect-[16/7] flex-col items-center justify-center gap-2 text-sm text-white/70 sm:aspect-[16/6]">
              <CameraOff className="h-5 w-5" /> Caméra désactivée
            </div>
          )}
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <button
            type="button"
            onClick={() => setCameraOn((v) => !v)}
            className={`ui-btn w-full sm:w-auto ${cameraOn ? "ui-btn-secondary" : "ui-btn-primary"}`}
            aria-pressed={cameraOn}
          >
            {cameraOn ? <CameraOff /> : <Camera />}
            {cameraOn ? "Désactiver la caméra" : "Activer la caméra"}
          </button>

          {/* USB scanner / manual entry — same field, same lookup path */}
          <form onSubmit={handleSubmit} className="border-t border-slate-100 pt-4">
            <label htmlFor="scan-input" className="ui-label">
              Code du reçu <span className="font-normal text-slate-500">(lecteur USB ou saisie manuelle)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="scan-input"
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Scannez ou saisissez le code"
                className="ui-input flex-1 uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
              />
              <button type="submit" className="ui-btn ui-btn-primary">
                <ScanLine /> <span className="hidden min-[380px]:inline">Vérifier</span>
              </button>
            </div>
            <p className="ui-help">Un lecteur USB tape automatiquement le code puis « Entrée » — il suffit que ce champ soit sélectionné.</p>
          </form>
        </div>
      </section>

      {/* Result surface */}
      <div aria-live="polite" className="space-y-4">
        {state === "looking-up" && (
          <div className="ui-card"><LoadingState label="Vérification en cours…" className="py-6" /></div>
        )}

        {state === "malformed" && (
          <Alert tone="warning" title="Code illisible">
            Ce code ne correspond pas au format attendu d'un reçu. Réessayez le scan.
          </Alert>
        )}

        {state === "not-found" && (
          <Alert tone="info" title="Reçu introuvable">
            Aucun reçu ne correspond à ce code{connectivity.status === "offline" ? " dans les données locales" : ""}.
          </Alert>
        )}

        {state === "found" && result && (
          <section className="ui-card overflow-hidden" aria-label="Reçu trouvé">
            <div className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold sm:px-5 ${result.source === "server" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
              {result.source === "server" ? <Server className="h-3.5 w-3.5" /> : <HardDrive className="h-3.5 w-3.5" />}
              {result.source === "server" ? "Résultat officiel du serveur" : "Résultat local hors ligne (non vérifié par le serveur)"}
              {result.pendingSync && " — synchronisation en attente"}
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="text-base font-semibold text-slate-950">{result.receiptNumber}</span>
              </div>
              <p className="text-2xl font-semibold tracking-tight tabular-nums text-slate-950">
                {result.totalUSD.toFixed(2)} USD
                {result.totalFC ? <span className="ml-2 text-base font-medium text-slate-500">· {result.totalFC.toLocaleString("fr-FR")} FC</span> : null}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-slate-500">Date</dt><dd className="text-slate-900">{formatDate(result.occurredAt)}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-slate-500">Client</dt><dd className="break-words text-slate-900">{result.customerName}</dd></div>
                <div><dt className="text-xs text-slate-500">Paiement</dt><dd className="text-slate-900">{result.paymentMethod.toUpperCase()}</dd></div>
                <div><dt className="text-xs text-slate-500">Agent</dt><dd className="text-slate-900">{result.salesPerson}</dd></div>
                <div><dt className="text-xs text-slate-500">Articles</dt><dd className="tabular-nums text-slate-900">{result.itemCount}</dd></div>
                <div><dt className="text-xs text-slate-500">Statut</dt><dd className="text-slate-900">{result.status}</dd></div>
              </dl>
            </div>
          </section>
        )}

        {state !== "idle" && (
          <button type="button" onClick={reset} className="ui-btn ui-btn-secondary w-full sm:w-auto">
            <RotateCcw /> Scanner un autre reçu
          </button>
        )}
      </div>
    </div>
  );
}
