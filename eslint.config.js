import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import { designSystemGuard } from "@kasumi/ui/eslint";

export default [
  { ignores: ["dist", "node_modules", "data"] },
  js.configs.recommended,
  {
    files: ["server/**/*.js", "shared/**/*.js", "scripts/**/*.js", "test/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: globals.node },
  },
  {
    files: ["e2e/**/*.js", "playwright.config.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["web/src/**/*.{js,jsx}"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules, "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }] },
  },
  designSystemGuard,
];
