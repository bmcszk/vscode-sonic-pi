// @ts-check
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
	globalIgnores(['out/**', 'docs/**', 'test/**', '**/*.js']),
	{
		files: ['src/**/*.ts'],
		extends: [js.configs.recommended, tseslint.configs.recommended, prettier],
		languageOptions: {
			parserOptions: { projectService: true },
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
		},
	},
)
