import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", ".scratch/", ".codex/", "node_modules/"] },
  js.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
