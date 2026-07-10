// @ts-check
import eslintPluginAstro from 'eslint-plugin-astro';

export default [
	{
		ignores: ['dist/**', '.astro/**'],
	},
	...eslintPluginAstro.configs.recommended,
];
