// eslint.config.cjs
// 程式碼檢查規則與適用範圍

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
      // 忽略
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'src/utils/emailTemplates.ts',
    ],
  },
  {
      // 文件
    files: ['**/*.ts'], // 只對 .ts 檔生效
      // 語言選項
    languageOptions: {
      parser: tsParser, // 指定 parser 為 typeScript parser
      ecmaVersion: 'latest', // 用最新的 ECMAScript 語法解析
      sourceType: 'module', // 用 ES module 模式解析 (import/export)
    },
      // 外掛
    plugins: {
      '@typescript-eslint': tsPlugin, // 註冊規則
    },
      // 規則
    rules: {}, // 沒有自訂規則，只做基本解析
  },
];
