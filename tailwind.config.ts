import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        corporate: {
          slate: "#07111f",
          panel: "#ffffff",
          ink: "#0f172a",
          muted: "#64748b",
          brown: "#3a2416",
          emerald: "#10b981",
          amber: "#f59e0b",
          danger: "#ef4444"
        }
      },
      boxShadow: {
        panel: "0 18px 60px rgba(2, 6, 23, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
