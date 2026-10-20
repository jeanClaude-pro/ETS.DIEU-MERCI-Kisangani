import { useMemo, useState } from "react";
import { Check, ChevronDown, Eye, MapPin, ShieldCheck, X } from "lucide-react";
import type { Role } from "../../types/auth";
import { navigationSections, defaultModulesForRole, SHAREHOLDER_MODULES } from "../../components/navigationConfig";
import { cx } from "../../components/ui";
import { REGION_SCOPE_OPTIONS, ROLE_PROFILE, ROLE_PROFILES, regionScopeProblem, scopeForRole, type RoleAccess } from "../../utils/roles";

// Everything except "management": only admins have it, and admins bypass
// the module checklist entirely.
const ASSIGNABLE_SECTIONS = navigationSections
  .map((section) => ({ ...section, items: section.items.filter((item) => item.id !== "management") }))
  .filter((section) => section.items.length > 0);
const MODULE_LABELS = Object.fromEntries(ASSIGNABLE_SECTIONS.flatMap((section) => section.items).map((item) => [item.id, item.label]));

type Props = {
  value: RoleAccess;
  onChange: (value: RoleAccess) => void;
  disabled?: boolean;
};

/**
 * Role cards with what each role can and cannot do, then the region and
 * the module list. Used both to create an account and to change one.
 */
export default function RoleAccessPicker({ value, onChange, disabled }: Props) {
  const [customizing, setCustomizing] = useState(false);
  const profile = ROLE_PROFILE[value.role];
  const allowedModules = useMemo(
    () => (value.role === "shareholder" ? SHAREHOLDER_MODULES : ASSIGNABLE_SECTIONS.flatMap((section) => section.items.map((item) => item.id))),
    [value.role],
  );

  const selectRole = (role: Role) => {
    // A new role starts from that role's default modules.
    onChange({ role, regionScope: scopeForRole(role, value.regionScope), modules: role === "admin" ? [] : defaultModulesForRole(role) });
  };
  const toggleModule = (id: string) => onChange({
    ...value,
    modules: value.modules.includes(id) ? value.modules.filter((module) => module !== id) : [...value.modules, id],
  });

  return (
    <div className="space-y-5">
      <fieldset disabled={disabled}>
        <legend className="ui-label">Rôle</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ROLE_PROFILES.map((option) => {
            const selected = option.role === value.role;
            return (
              <label
                key={option.role}
                className={cx(
                  "relative flex min-h-[4.5rem] cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 transition-colors duration-150",
                  selected ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <input type="radio" name="role" value={option.role} checked={selected} onChange={() => selectRole(option.role)} className="sr-only" />
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  {option.readOnly ? <Eye className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />}
                  {option.label}
                </span>
                <span className="text-xs leading-snug text-slate-500">{option.summary}</span>
                {selected && <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-blue-700" aria-hidden="true" />}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* What the selected role can do, shown before it is assigned. */}
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3.5" aria-live="polite" aria-labelledby="role-capabilities-title">
        <h3 id="role-capabilities-title" className="text-sm font-semibold text-slate-900">Ce que peut faire : {profile.label}</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <ul className="space-y-1.5">
            {profile.can.map((line) => (
              <li key={line} className="flex gap-2 text-sm text-slate-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /><span>{line}</span>
              </li>
            ))}
          </ul>
          <ul className="space-y-1.5">
            {profile.cannot.map((line) => (
              <li key={line} className="flex gap-2 text-sm text-slate-500">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" /><span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <fieldset disabled={disabled}>
        <legend className="ui-label flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Région visible</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {REGION_SCOPE_OPTIONS.map((option) => {
            const blocked = Boolean(regionScopeProblem(value.role, option.value));
            const selected = value.regionScope === option.value;
            return (
              <label
                key={option.value}
                className={cx(
                  "flex min-h-14 flex-col justify-center rounded-lg border px-3 py-2 transition-colors duration-150",
                  blocked ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50" : "cursor-pointer",
                  selected && !blocked ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : !blocked && "border-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name="regionScope"
                  value={option.value}
                  checked={selected}
                  disabled={blocked}
                  onChange={() => onChange({ ...value, regionScope: option.value })}
                  className="sr-only"
                />
                <span className="text-sm font-semibold text-slate-900">{option.label}</span>
                <span className="text-xs text-slate-500">{option.description}</span>
              </label>
            );
          })}
        </div>
        <p className="ui-help">
          {profile.allRegions
            ? "Un administrateur voit toujours les deux régions."
            : profile.singleRegion
              ? "Un actionnaire voit une seule région : ses articles, opérations et transactions."
              : "Limiter à une région masque entièrement l'autre région pour ce compte."}
        </p>
      </fieldset>

      {value.role !== "admin" && (
        <div>
          <button
            type="button"
            onClick={() => setCustomizing((open) => !open)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
            aria-expanded={customizing}
          >
            <span>
              <span className="font-semibold text-slate-900">Modules autorisés</span>
              <span className="block text-xs text-slate-500">
                {value.modules.length ? value.modules.map((id) => MODULE_LABELS[id]).filter(Boolean).join(", ") : "Aucun module"}
              </span>
            </span>
            <ChevronDown className={cx("h-4 w-4 shrink-0 text-slate-500 transition-transform", customizing && "rotate-180")} aria-hidden="true" />
          </button>
          {customizing && (
            <div className="mt-2 max-h-72 space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {ASSIGNABLE_SECTIONS.map((section) => {
                const items = section.items.filter((item) => allowedModules.includes(item.id));
                if (!items.length) return null;
                return (
                  <div key={section.title}>
                    <p className="ui-kicker">{section.title}</p>
                    <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {items.map((item) => (
                        <label key={item.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-slate-700 hover:bg-slate-50">
                          <input type="checkbox" className="ui-checkbox" checked={value.modules.includes(item.id)} onChange={() => toggleModule(item.id)} disabled={disabled} />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {value.role === "shareholder" && (
                <p className="text-xs text-slate-500">Un actionnaire ne peut recevoir que des modules de consultation.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
