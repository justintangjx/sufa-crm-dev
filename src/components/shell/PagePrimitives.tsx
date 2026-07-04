import type { ReactNode } from "react";
import { DiscMark } from "./DiscMark";

export function LoadingPage() {
  return (
    <main className="loading-screen">
      <DiscMark className="loading-disc" />
      <p className="muted">Loading SUFA CRM...</p>
    </main>
  );
}

export function PageHead({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "danger" | "ok" | "warn";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function StatCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "accent" | "danger" | "neutral" | "ok" | "warn";
}) {
  return (
    <section className={`card stat stat-card ${tone}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {detail ? <p className="muted">{detail}</p> : null}
    </section>
  );
}
