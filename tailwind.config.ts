import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Public Sans"', '"Segoe UI"', "system-ui", "sans-serif"],
      },
      colors: {
        paper: "#F5F6F8",
        ink: "#17222D",
        muted: "#5B6874",
        line: "#E2E7EC",
        card: "#FFFFFF",
        teal: {
          DEFAULT: "#0E7A66",
          dark: "#0A5C4D",
          soft: "#E3F0ED",
        },
        navy: "#24537F",
        plum: "#7A4E7E",
        amber: "#B7791F",
        brick: "#B0413E",
        leaf: "#3E7C4F",
      },
    },
  },
  plugins: [],
};
export default config;
