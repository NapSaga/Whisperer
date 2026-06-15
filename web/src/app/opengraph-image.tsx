import { ImageResponse } from "next/og";

export const alt = "Whisperer recall measured: 0/10 to 10/10";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

const colors = {
  zinc950: "#09090b",
  zinc900: "#18181b",
  zinc800: "#27272a",
  text: "#fafafa",
  muted: "#a1a1aa",
  recall: "#00794c",
  voiceAccent: "#3759a6",
};

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px 52px",
          color: colors.text,
          fontFamily:
            'Geist, "Geist Fallback", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          background: `linear-gradient(135deg, ${colors.zinc950} 0%, ${colors.zinc900} 58%, ${colors.zinc950} 100%)`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 82% 22%, rgba(55, 89, 166, 0.24), transparent 310px), radial-gradient(circle at 16% 88%, rgba(0, 121, 76, 0.22), transparent 300px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 72,
            right: 72,
            top: 64,
            bottom: 52,
            border: `1px solid ${colors.zinc800}`,
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 34,
              fontWeight: 720,
              letterSpacing: 0,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                background: colors.voiceAccent,
                borderRadius: 999,
                boxShadow: `0 0 36px ${colors.voiceAccent}`,
              }}
            />
            Whisperer
          </div>
          <div
            style={{
              color: colors.muted,
              fontSize: 24,
              fontWeight: 500,
            }}
          >
            memory layer for voice agents
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 28,
              fontSize: 156,
              lineHeight: 0.9,
              fontWeight: 820,
              letterSpacing: 0,
            }}
          >
            <span>0/10</span>
            <span style={{ color: colors.muted }}>→</span>
            <span
              style={{
                color: colors.recall,
                textShadow: "0 0 42px rgba(0, 121, 76, 0.42)",
              }}
            >
              10/10
            </span>
          </div>
          <div
            style={{
              color: colors.text,
              fontSize: 38,
              lineHeight: 1.18,
              fontWeight: 560,
              maxWidth: 960,
            }}
          >
            recall measured — drop-in memory layer for voice agents
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: colors.muted,
            fontSize: 24,
            fontWeight: 520,
            position: "relative",
          }}
        >
          <span>HackRome · giugno 2026</span>
          <span style={{ color: colors.recall }}>$0.30 → $0.23 · 1.3x</span>
        </div>
      </div>
    ),
    size,
  );
}
