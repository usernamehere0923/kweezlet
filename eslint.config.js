import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".wrangler", "worker-configuration.d.ts", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Whatever the UI imports at runtime ships to the browser. From the worker
      // only these pure files may: the AI client and anything near a secret
      // (ZAI_API_KEY) must never end up in the bundle. Types are fine.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/worker/**", "!**/worker/languages", "!**/worker/progress", "!**/worker/grading"],
              allowTypeImports: true,
              message: "The UI may only import types from worker/ (plus languages, progress, grading).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.ts", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
