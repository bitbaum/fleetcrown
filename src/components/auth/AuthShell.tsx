import Link from "next/link";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PUBLIC_SURFACE } from "@/config/ui";
import { PUBLIC_NAV_LINKS } from "@/config/auth";

export function AuthField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="ui-auth-label">{label}</label>
      {children}
    </div>
  );
}

export function AuthInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`ui-auth-input ${props.className ?? ""}`}
      style={props.style}
    />
  );
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui-auth-card">
      {children}
    </div>
  );
}

export function AuthHeading({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-10 text-center">
      {badge}
      <h1 className="ui-auth-title">{title}</h1>
      <p className="ui-auth-subtitle">{description}</p>
    </div>
  );
}

export function AuthSubmitButton({
  loading,
  disabled,
  label,
  loadingLabel,
  onClick,
}: {
  loading?: boolean;
  disabled?: boolean;
  label: string;
  loadingLabel?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={loading || disabled}
      className="ui-auth-submit-btn"
    >
      {loading && loadingLabel ? loadingLabel : label}
    </button>
  );
}

export function AuthShell({
  children,
  navRight,
}: {
  children: React.ReactNode;
  navRight?: React.ReactNode;
}) {
  return (
    <PublicSurface navLinks={PUBLIC_NAV_LINKS} right={navRight}>
      <main
        className="relative z-10 flex items-center justify-center px-4 pb-16"
        style={{ minHeight: `calc(100vh - ${PUBLIC_SURFACE.navHeightPx}px)` }}
      >
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </PublicSurface>
  );
}

export function AuthIconBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui-auth-icon-badge">
      {children}
    </div>
  );
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="ui-auth-divider-line" />
      <span className="ui-auth-divider-label">{label}</span>
      <div className="ui-auth-divider-line" />
    </div>
  );
}

export function AuthFooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <p className="ui-auth-footer">
      <Link href={href} className="ui-auth-footer-link">
        {children}
      </Link>
    </p>
  );
}

export function AuthSecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`ui-auth-secondary-btn ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
