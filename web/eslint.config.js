import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'src/contract/generated'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, __DATA_PATH__: 'readonly' },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Reports only where the React Compiler would skip optimising a component. This app is not
      // built with the React Compiler, so nothing would be skipped; the rule's other v7 siblings
      // (set-state-in-effect, immutability, refs, purity, ...) are general React guidance and stay.
      'react-hooks/preserve-manual-memoization': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // docs/06 §11.3: "The `aggregate/` and `filter/` layers import nothing from React. That
    // boundary is what makes the metric definitions testable as arithmetic, and it is enforced
    // by a lint rule rather than by intention."
    files: ['src/aggregate/**/*.ts', 'src/filter/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*', '@visx/*', '**/charts/*'],
              message:
                'aggregate/ and filter/ are pure layers (docs/06 B4, §11.3): no React, no rendering.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs}', 'vite.config.ts', 'vitest.setup.ts', 'scripts/**'],
    languageOptions: { globals: globals.node },
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
