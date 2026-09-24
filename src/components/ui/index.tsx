/* eslint-disable react-refresh/only-export-components */
import type React from "react";
import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, DollarSign, Info, RefreshCw, X } from "lucide-react";

// Presentation-only primitives shared by every module. They take content and
// callbacks as props and hold no business state of their own.

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

type PageHeaderProps = {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons rendered on the right on desktop, stacked full-width on phones. */
  actions?: React.ReactNode;
  /** Status chips shown under the description (offline notice, role scope…). */
  meta?: React.ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cx("flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
        <h1 className={cx("ui-title", Boolean(eyebrow) && "mt-1")}>{title}</h1>
        {description && <p className="ui-subtitle mt-1">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && (
        <div className="flex w-full min-w-0 flex-wrap gap-2 [&>*]:flex-1 [&>*]:basis-[9.5rem] lg:w-auto lg:flex-nowrap lg:justify-end lg:[&>*]:flex-none lg:[&>*]:basis-auto">
          {actions}
        </div>
      )}
    </header>
  );
}

type Tone = "info" | "success" | "warning" | "danger";
const alertIcons: Record<Tone, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

type AlertProps = {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
};

export function Alert({ tone = "info", title, children, onDismiss, className }: AlertProps) {
  const Icon = alertIcons[tone];
  return (
    <div className={cx("ui-alert", `ui-alert-${tone}`, className)} role={tone === "danger" ? "alert" : "status"}>
      <Icon aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(Boolean(title) && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="-my-1 -mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current" aria-label="Fermer le message">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

type EmptyStateProps = {
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx("ui-empty", className)}>
      <span className="ui-empty-icon" aria-hidden="true"><Icon /></span>
      <p className="ui-empty-title">{title}</p>
      {description && <p className="ui-empty-text">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Chargement…", className }: { label?: string; className?: string }) {
  return (
    <div className={cx("flex items-center justify-center gap-3 px-6 py-12 text-sm font-medium text-slate-500", className)} role="status" aria-live="polite">
      <span className="ui-spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

type MetricCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** Neutral by default; semantic tones only where the number carries meaning. */
  tone?: "neutral" | "primary" | "success" | "danger" | "warning";
  to?: string;
  className?: string;
};

const metricToneValue: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  neutral: "",
  primary: "",
  success: "text-emerald-700",
  danger: "text-red-700",
  warning: "text-amber-700",
};
const metricToneIcon: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  neutral: "",
  primary: "bg-blue-50 text-blue-700",
  success: "bg-emerald-50 text-emerald-700",
  danger: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-700",
};

export function MetricCard({ label, value, hint, icon: Icon, tone = "neutral", to, className }: MetricCardProps) {
  // Value gets the full card width: money is never truncated.
  const body = (
    <>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="ui-metric-label pt-0.5">{label}</p>
        {Icon && <span className={cx("ui-metric-icon", metricToneIcon[tone])} aria-hidden="true"><Icon /></span>}
      </div>
      <p className={cx("ui-metric-value", metricToneValue[tone])}>{value}</p>
      {hint && <div className="ui-metric-hint">{hint}</div>}
    </>
  );
  return to ? (
    <Link to={to} className={cx("ui-metric ui-metric-link", className)}>{body}</Link>
  ) : (
    <div className={cx("ui-metric", className)}>{body}</div>
  );
}

type ExchangeRateChipProps = { loading: boolean; rate?: number | null; effectiveFrom?: string | null };

/** Read-only "taux du jour" display shared by every money-entry screen. */
export function ExchangeRateChip({ loading, rate, effectiveFrom }: ExchangeRateChipProps) {
  return (
    <div className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2 shadow-sm" aria-live="polite">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-700" aria-hidden="true">
        <DollarSign className="h-4 w-4" />
      </span>
      <div className="min-w-0 text-left">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Taux du jour</p>
        {loading ? (
          <p className="flex items-center gap-1.5 text-sm text-slate-500"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Chargement…</p>
        ) : rate ? (
          <p className="truncate text-sm font-semibold tabular-nums text-slate-900">
            1 USD = {new Intl.NumberFormat("fr-FR").format(rate)} FC
            {effectiveFrom && <span className="ml-1.5 font-normal text-slate-500">· depuis {new Date(effectiveFrom).toLocaleDateString("fr-FR")}</span>}
          </p>
        ) : (
          <p className="text-sm font-medium text-red-600">Taux non disponible</p>
        )}
      </div>
    </div>
  );
}

/** USD/FC input-mode switch. Only calls `onToggle` when the other mode is picked. */
export function CurrencyToggle({ mode, onToggle, label = "Devise de saisie" }: { mode: "usd" | "fc"; onToggle: () => void; label?: string }) {
  return (
    <div className="ui-segmented p-0.5" role="group" aria-label={label}>
      {(["usd", "fc"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => { if (mode !== option) onToggle(); }}
          className="ui-segment min-h-9 min-w-12 px-3 text-xs"
        >
          {option === "usd" ? "USD" : "FC"}
        </button>
      ))}
    </div>
  );
}
