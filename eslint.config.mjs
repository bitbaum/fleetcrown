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
    ".python-vendor/**",
    "packages/agent/**",
  ]),
  {
    rules: {
      // Close the keystroke-hijack class (2026-07 dogfood): a global keyboard
      // shortcut's "is the user typing?" guard must inspect the COMPOSED path
      // leaf, not e.target. When a keystroke crosses a shadow-DOM boundary
      // (an embedded widget's input), e.target is retargeted to the shadow
      // host and the guard misreads a text field as "not typing", so the
      // shortcut fires and eats the keystroke. Pass e.composedPath()[0], never
      // a bare `.target`, into the typing guard.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='isTypingTarget'] > MemberExpression.arguments[property.name='target']",
          message:
            "Pass the composed-path leaf to isTypingTarget (e.composedPath()[0] ?? e.target), not a bare e.target — a bare .target is shadow-DOM-blind and reintroduces the keystroke-hijack bug.",
        },
      ],
    },
  },
]);

export default eslintConfig;
