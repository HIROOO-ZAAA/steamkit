import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The local VoxCPM sidecar's virtualenv. Without this, `npm run lint`
    // walks every file in site-packages and reports ~55k problems from
    // third-party Python packages that ship stray .js files.
    ".venv/**",
  ]),
]);

export default eslintConfig;
