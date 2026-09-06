import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "supabase/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Clean Architecture dependency direction (CLAUDE.md §6): domain depends on nothing,
    // application never reaches for framework or infrastructure concerns.
    files: ["src/modules/*/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react-*",
                "@supabase/*",
                "**/infrastructure/**",
                "**/presentation/**",
                "**/application/**",
              ],
              message:
                "domain/ must not depend on frameworks, infrastructure, presentation or application. Keep it pure.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/*/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@supabase/*",
                "next/navigation",
                "**/infrastructure/**",
                "**/presentation/**",
              ],
              message:
                "application/ must talk to infrastructure through domain ports, never import it directly.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
