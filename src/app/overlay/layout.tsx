/**
 * Overlay Layout — shared by ALL /overlay/* routes.
 *
 * Key requirements for OBS Browser Source:
 *  • background must be fully transparent (no colour, no grid)
 *  • no nav bars, no scrollbars, no padding
 *  • viewport is exactly 1920×1080 (OBS sets this on the browser element)
 */
export const metadata = {
  title: "StreamKit Overlay",
  robots: "noindex, nofollow",
};

export default function OverlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "transparent",
        position: "relative",
      }}
    >
      <style>{`
        html, body {
          background: transparent !important;
          background-image: none !important;
        }
      `}</style>
      {children}
    </div>
  );
}
