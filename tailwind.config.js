/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Amarillo marca
        brand: {
          50:  "#FFF7CC",
          100: "#FFEFA3",
          200: "#FFE066",
          300: "#FFD233",
          400: "#FFC700",
          500: "#FCC800", // color pedido
          600: "#E0B000",
          700: "#B38900",
          800: "#7A5C00",
          900: "#4A3700",
        },
        // Café (UI secundaria, títulos, texto base)
        coffee: {
          DEFAULT: "#33282c", // café de marca
          50:  "#F6F1EB",
          100: "#EADFCC",
          200: "#D9C3A1",
          300: "#C6A276",
          400: "#A67945",
          500: "#8B5E2C",
          600: "#724B23",
          700: "#5B3C1B",
          800: "#432C13",
          900: "#2D1C0C",
        },
        // Neutros y estados
        ink: { DEFAULT: "#0B0B0B" }, // negro “UI”
        success: {
          50:  "#ECFDF5",
          100: "#D1FAE5",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
        },
        warning: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          500: "#F59E0B", // naranjo
          600: "#D97706",
        },
        danger: {
          50:  "#FEF2F2",
          100: "#FEE2E2",
          500: "#EF4444", // rojo
          600: "#DC2626",
        },
      },
    },
  },
  plugins: [],
};
