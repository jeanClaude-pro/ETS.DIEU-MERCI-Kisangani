import { Navigate, useNavigate } from "react-router-dom";
import { LogOut, ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { permittedNavigationItems } from "../components/navigationConfig";
import { ROLE_PROFILE } from "../utils/roles";

// No welcome screen: "/" opens each person's own main screen directly —
// the dashboard for an administrator or shareholder, Nouvelle vente for a
// cashier, the stock for a stock manager — following their role's priority
// and the modules they actually have.
export default function Landing() {
  const { activeUser, clearAuth } = useAuth();
  const navigate = useNavigate();
  const items = permittedNavigationItems(activeUser).filter((item) => item.id !== "home");
  const priority = activeUser ? ROLE_PROFILE[activeUser.role]?.priority ?? [] : [];
  const target = priority.map((id) => items.find((item) => item.id === id)).find(Boolean) ?? items[0];

  if (target) return <Navigate to={target.path} replace />;

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 px-4">
      <div className="ui-card max-w-sm p-6 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-amber-50 text-amber-700"><ShieldAlert className="h-5 w-5" aria-hidden="true" /></span>
        <h1 className="mt-3 text-base font-semibold text-slate-900">Aucun module autorisé</h1>
        <p className="mt-1 text-sm text-slate-600">Votre compte n'a accès à aucun écran. Demandez à l'administrateur de vous attribuer un rôle.</p>
        <button type="button" className="ui-btn ui-btn-secondary mt-4" onClick={() => { clearAuth(); navigate("/login", { replace: true }); }}>
          <LogOut /> Se déconnecter
        </button>
      </div>
    </div>
  );
}
