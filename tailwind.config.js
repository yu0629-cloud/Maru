/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        cream: "#F7F4EE",
        ink: "#1F2933",
        maru: {
          500: "#E25C4A",
          600: "#C44738",
        },
      },
    },
  },
  plugins: [],
};
