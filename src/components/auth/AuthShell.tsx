import Link from "next/link";

export function AuthField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function AuthInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none ${props.className ?? ""}`}
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
        ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.30)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
        props.onBlur?.(e);
      }}
    />
  );
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-8 space-y-5"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(12px)",
      }}
    >
      {children}
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
      className="w-full rounded-xl py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 active:opacity-70 disabled:opacity-35"
      style={{ background: "#ffffff" }}
    >
      {loading && loadingLabel ? loadingLabel : label}
    </button>
  );
}

export function AuthShell({
  children,
  showHomeLink = false,
}: {
  children: React.ReactNode;
  showHomeLink?: boolean;
}) {
  return (
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={{ background: "#050505" }}
    >
      {/* Background: layered glows + grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-0 -translate-x-1/2"
          style={{
            width: "700px",
            height: "500px",
            background: "radial-gradient(ellipse at center top, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 45%, transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
          }}
        />
      </div>

      {/* Nav */}
      <nav className="relative z-10 px-8 py-6 sm:px-14">
        {showHomeLink ? (
          <Link
            href="/"
            className="text-base font-bold tracking-tight"
            style={{ letterSpacing: "-0.02em" }}
          >
            ✦ Cockpit
          </Link>
        ) : (
          <span className="text-base font-bold" style={{ letterSpacing: "-0.02em" }}>
            ✦ Cockpit
          </span>
        )}
      </nav>

      <main className="relative z-10 flex min-h-[calc(100vh-76px)] items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}

export function AuthIconBadge({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl text-xl"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
    >
      {children}
    </div>
  );
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
      <span className="text-xs" style={{ color: "rgba(255,255,255,0.22)" }}>
        {label}
      </span>
      <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
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
    <p className="mt-6 text-center text-sm" style={{ color: "rgba(255,255,255,0.18)" }}>
      <Link href={href} className="transition-colors hover:text-white/50">
        {children}
      </Link>
    </p>
  );
}
