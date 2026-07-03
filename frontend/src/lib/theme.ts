import { darkTheme } from "@rainbow-me/rainbowkit";

const customDarkTheme = darkTheme({
  accentColor: "#6EE7B7",
  accentColorForeground: "#0A0A0A",
  borderRadius: "medium",
});

export const linearTheme = {
  ...customDarkTheme,
  fonts: {
    body: "'DM Mono', monospace",
  },
  colors: {
    ...customDarkTheme.colors,
    modalBackground: "#0A0A0A",
    modalBorder: "rgba(255, 255, 255, 0.08)",
    generalBorder: "rgba(255, 255, 255, 0.08)",
    generalBorderDim: "rgba(255, 255, 255, 0.04)",
    actionButtonBorder: "rgba(255, 255, 255, 0.08)",
    actionButtonBorderMobile: "rgba(255, 255, 255, 0.08)",
    actionButtonSecondaryBackground: "rgba(255, 255, 255, 0.02)",
    connectionIndicator: "#6EE7B7",
    closeButtonBackground: "rgba(255, 255, 255, 0.02)",
    closeButton: "rgba(255, 255, 255, 0.6)",
    menuItemBackground: "rgba(255, 255, 255, 0.02)",
  },
  shadows: {
    ...customDarkTheme.shadows,
    dialog: "0 24px 64px rgba(0, 0, 0, 0.8)",
  },
};
