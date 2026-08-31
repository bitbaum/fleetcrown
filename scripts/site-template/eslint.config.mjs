import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ESLint 9 flat config, matching what the rest of the fleet's Next 16 apps use.
// Without a config file `eslint` exits non-zero with a migration notice, which
// would make a brand new site's first CI run red for reasons unrelated to its
// code — and a red first run is how a team learns to ignore CI.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
