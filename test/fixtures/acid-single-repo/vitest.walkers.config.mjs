import { defineConfig } from 'vitest/config'

// The two walker gate projects (decision 14). Real hosts add browser/env
// settings per project; the vacuity assertion only needs COLLECTION to work.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'spec-diff',
          include: ['test/spec-diff/**/*.spec-diff.js'],
        },
      },
      {
        test: {
          name: 'vrt',
          include: ['test/vrt/**/*.vrt.js'],
        },
      },
    ],
  },
})
