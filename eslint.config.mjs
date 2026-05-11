/**
 * ESLint flat config for raineylaguna-crm.
 *
 * Next 16 removed the `next lint` CLI in favour of running ESLint
 * directly. `eslint-config-next@16` ships native flat-config exports
 * (`./core-web-vitals`, `./typescript`), so we import them as-is.
 *
 * eslint@9 is pinned in devDependencies because eslint-plugin-react
 * (transitively bundled inside eslint-config-next) still uses an API
 * removed in ESLint 10 (`context.getFilename()` → `context.filename`).
 * Once eslint-plugin-react releases a v8 that targets ESLint 10, the
 * top-level dep can move forward.
 */

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "dist/**",
      "coverage/**",
      "next-env.d.ts",
      "*.config.{js,mjs,cjs,ts}",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "warn",
      // react-hooks v7 added a "purity" rule that flags any non-pure
      // call during render — including Date.now(), Math.random(), and
      // similar. The dashboard tables read Date.now() to compute UI
      // state ("snooze expired?"); these are intentional reads of
      // wall-clock time, not bugs. Downgrade to warn.
      "react-hooks/purity": "warn",
      // The unescaped-entities rule is style, not safety. Quotes
      // inside JSX text are fine for our content and translating them
      // to entities makes the source noisier.
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          // catch-clause `error` bindings are routinely unused —
          // we log via Sentry or surface a generic toast. Ignore
          // those instead of forcing `_error` everywhere.
          caughtErrorsIgnorePattern: "^(_|error$)",
        },
      ],
    },
  },
];
