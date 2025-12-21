/**
 * ESLint configuration for the project.
 * 
 * See https://eslint.style and https://typescript-eslint.io for additional linting options.
 */
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default [
  tseslint.config(
    {
      ignores: [
        'out',
        '**/vscode*.d.ts',
      ]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
    {
      plugins: {
        '@stylistic': stylistic
      },
      rules: {
        'curly': 'warn',
        '@stylistic/semi': ['warn', 'always'],
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/naming-convention': [
          'warn',
          {
            'selector': 'import',
            'format': ['camelCase', 'PascalCase']
          }
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            'argsIgnorePattern': '^_'
          }
        ]
      }
    }
  ),
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        chrome: 'readonly',
        browser: 'readonly',
        document: 'readonly',
        window: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        navigator: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off', // Allow console in extension context
      'prefer-const': 'error',
      'no-var': 'error'
    }
  }
];