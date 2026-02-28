// eslint.config.cjs
// 程式碼檢查規則與適用範圍

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
    {
        // 忽略
        ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/utils/emailTemplates.ts'],
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
        rules: {
            'no-console': 'error',
            quotes: ['warn', 'single', { avoidEscape: true }],
            semi: ['warn', 'always'],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/consistent-type-imports': [
                'warn',
                { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
            ],
        },
    },
    {
        files: ['src/lib/logger.ts'],
        rules: {
            'no-console': 'off',
        },
    },
    eslintConfigPrettier,
];
