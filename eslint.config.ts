import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    'dist',
    'dev-dist',
    'node_modules',
    'coverage',
    // arquivo gerado pelo `supabase gen types`
    'src/types/database.ts',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // Usamos `flat.recommended` e não `recommended-latest`: este último ainda
    // declara `plugins: ["react-hooks"]` no formato eslintrc, que o flat
    // config do ESLint 10 rejeita em runtime. A única regra que ele tem a
    // mais entra à mão logo abaixo.
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    rules: {
      'react-hooks/void-use-memo': 'error',

      // "TypeScript em tudo" — sem porta dos fundos.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description', 'ts-nocheck': true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Scripts de banco e configs rodam em Node, não no browser.
  {
    files: ['scripts/**/*.ts', 'vite.config.ts', 'eslint.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
    },
  },

  // Testes podem repetir literais e usar não-null assertion à vontade.
  {
    files: ['**/*.test.{ts,tsx}', 'src/teste/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
])
