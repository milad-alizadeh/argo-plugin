/**
 * pack-design's six playbook specs. Importing this barrel triggers each spec
 * module's `registerPlaybook(...)` side effect, so anything importing
 * `@argohq/pack-design` gets all six specs resolvable by name.
 */
export * from './screen-create.js'
export * from './component-create.js'
export * from './component-edit.js'
export * from './screen-edit.js'
export * from './design-to-code.js'
export * from './code-to-design.js'
