/**
 * pack-design's six playbook specs (playbook-engine-phase1.md Slice 11).
 * Importing this barrel triggers each spec module's `registerPlaybook(...)`
 * side effect — "the packs populate the registry at import time" (Slice 5's
 * model): anything that imports `@argohq/pack-design` gets all six specs
 * resolvable by name via `@argohq/toolkit/core`'s `getPlaybook`, without importing
 * any one playbook module directly.
 */
export * from './screen-create.js'
export * from './component-create.js'
export * from './component-edit.js'
export * from './screen-edit.js'
export * from './design-to-code.js'
export * from './code-to-design.js'
