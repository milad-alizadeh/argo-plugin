import { defineConfig, enforceTdd } from '@nizos/probity'

export default defineConfig({
  rules: [
    {
      files: ['packages/**', 'test/**', 'eval/**', 'evals/**'],
      rules: [enforceTdd({ fastPath: true })],
    },
  ],
})
