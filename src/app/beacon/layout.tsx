export default function BeaconLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Prevent white flash before React hydrates — beacon is always dark */}
      <style>{`html,body{background:oklch(0.07 0 0);margin:0}`}</style>
      <div className="dark">{children}</div>
    </>
  );
}
