import { ImageResponse } from "next/og";

/*
 * The LifeOS home-screen icon: the dawn sun rising over a hairline horizon.
 * Colours mirror the tokens in globals.css (--ink, --dawn, --line); an icon
 * is rendered outside the page, so it can't read CSS variables.
 */
const INK = "#13151d";
const DAWN = "#e6b470";
const LINE = "#3a3f52";

export function appIcon(size: number, { maskable = false } = {}) {
  // Maskable icons get cropped to a circle on Android, so keep the mark small.
  const scale = maskable ? 0.72 : 1;
  const sun = Math.round(size * 0.5 * scale);
  const horizon = Math.round(size * 0.62 * scale);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: INK,
        }}
      >
        <div
          style={{
            width: sun,
            height: sun / 2,
            background: DAWN,
            borderTopLeftRadius: sun / 2,
            borderTopRightRadius: sun / 2,
            marginTop: size * 0.08 * scale,
          }}
        />
        <div style={{ width: horizon, height: Math.max(2, Math.round(size * 0.022)), background: LINE }} />
      </div>
    ),
    { width: size, height: size },
  );
}
