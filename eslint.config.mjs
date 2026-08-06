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
        // Close the placeholder-answer class (2026-08 dogfood, second
        // occurrence): the profile extractor writes the literal "Unknown" for
        // fields it cannot infer, so `attrs.x?.trim()` reads as "the value, if
        // any" while actually returning a non-answer. That scored health
        // points, satisfied gates, and briefed agents with "STACK: Unknown".
        // hasAnswer(attrs.x) for the boolean, answer(attrs.x) for the value —
        // both from lib/project-display, so they can never disagree.
        ...["callee.object.object.name='attrs'", "callee.object.object.property.name='attrs'"].map(
          (attrsRef) => ({
            selector: `CallExpression[callee.property.name='trim'][${attrsRef}]`,
            message:
              "Don't trim a project attribute directly — use answer(attrs.x) for the value or hasAnswer(attrs.x) for the check (@/lib/project-display). A raw .trim() treats the extractor's literal \"Unknown\" as a filled field.",
          }),
        ),
        // Same class, one level up: the bulk GitHub import stamped projects with
        // the description "Local repository", which PLACEHOLDER_DESCRIPTIONS is
        // meant to swallow. Handing the raw field to a prop skips that — it was
        // printing under the project title on prod 2026-08-05, and shipping to
        // a PUBLIC OrangeCat profile from orangecat-publish.
        ...["object.name='project'", "object.property.name='project'"].map((projectRef) => ({
          selector: `JSXExpressionContainer > MemberExpression[property.name='description'][${projectRef}]`,
          message:
            "Pass cleanDescription(project.description), not the raw field — the import placeholder (\"Local repository\") is not a description and must never render or publish.",
        })),
      ],
    },
  },
]);

export default eslintConfig;
