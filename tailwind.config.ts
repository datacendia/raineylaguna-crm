import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        iron: "#0E0D0B",
        bone: "#F6F2E8",
        vermilion: "#E83C1E",
        oxide: "#8AA9A0",
      },
    },
  },
  plugins: [],
}
export default config
