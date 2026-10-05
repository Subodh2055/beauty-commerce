import { ImageResponse } from "next/og";

// Site-wide social card (routes can add their own opengraph-image to override).
export const alt = "Beauty — niche perfume and clean beauty, delivered across Nepal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand colours from the design system (ImageResponse can't read CSS variables).
const INK = "#17151f";
const CHAMPAGNE = "#d9be8a";
const IVORY = "#fbf8f4";
const BLUSH = "#e8a3b4";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: `radial-gradient(circle at 78% 42%, #3a2430 0%, ${INK} 58%)`,
          color: IVORY,
          padding: "72px 80px",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
          <div style={{ fontSize: 22, letterSpacing: 6, color: CHAMPAGNE, textTransform: "uppercase" }}>
            Niche perfume · Clean beauty
          </div>
          <div style={{ fontSize: 76, lineHeight: 1.05, marginTop: 24, fontWeight: 600 }}>
            Scent, the way it was meant to be worn.
          </div>
          <div style={{ fontSize: 28, marginTop: 28, color: "#cfc7d4" }}>
            Authentic fragrances from trusted sellers, delivered across Nepal.
          </div>
        </div>
        {/* Bottle silhouette */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginRight: 40 }}>
          <div style={{ width: 96, height: 80, background: CHAMPAGNE, borderRadius: 12 }} />
          <div style={{ width: 64, height: 24, background: "#b8995e" }} />
          <div
            style={{
              width: 250,
              height: 300,
              borderRadius: 52,
              border: `3px solid ${CHAMPAGNE}`,
              background: `linear-gradient(180deg, rgba(232,163,180,0.18) 0%, rgba(217,190,138,0.55) 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 64,
              fontWeight: 600,
              color: IVORY,
            }}
          >
            B<span style={{ color: BLUSH }}>.</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
