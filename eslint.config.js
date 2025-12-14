/* eslint-disable @typescript-eslint/no-require-imports */
// https://docs.expo.dev/guides/using-eslint/
const { fixupPluginRules } = require('@eslint/compat')
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended')
const eslintReactNative = require('eslint-plugin-react-native')
const simpleImportSort = require('eslint-plugin-simple-import-sort')
const tseslint = require('typescript-eslint')

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', 'ios/**', 'android/**', '.expo/**', '**/.vscode/**', '**/experimental/**']
  },
  {
    plugins: {
      'simple-import-sort': simpleImportSort
    },
    rules: {
      'prettier/prettier': 'warn',
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ]
    }
  },
  // react-native
  {
    name: 'eslint-plugin-react-native',
    plugins: {
      'react-native': fixupPluginRules({
        rules: eslintReactNative.rules
      })
    },
    rules: {
      ...eslintReactNative.configs.all.rules,
      'react-native/sort-styles': 'warn',
      'react-native/no-inline-styles': 'warn',
      'react-native/no-unused-styles': 'warn',
      // 'react-native/no-inline-styles': 'off',
      'react-native/no-raw-text': 'off'
    }
  }
])
