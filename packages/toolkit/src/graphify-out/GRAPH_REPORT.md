# Graph Report - .  (2026-07-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 991 nodes · 2109 edges · 56 communities (44 shown, 12 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1b7fc433`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Registry Reconciliation|Registry Reconciliation]]
- [[_COMMUNITY_Design Rules Definitions|Design Rules Definitions]]
- [[_COMMUNITY_Action Classifier|Action Classifier]]
- [[_COMMUNITY_Session Guard & Repo Root|Session Guard & Repo Root]]
- [[_COMMUNITY_Design Rules Audit Bundling|Design Rules Audit Bundling]]
- [[_COMMUNITY_Staleness & Sync Check|Staleness & Sync Check]]
- [[_COMMUNITY_RulesStatus Reporting|Rules/Status Reporting]]
- [[_COMMUNITY_Binding Manifest Checklist|Binding Manifest Checklist]]
- [[_COMMUNITY_Color Comparator|Color Comparator]]
- [[_COMMUNITY_Comment Lint & Waivers|Comment Lint & Waivers]]
- [[_COMMUNITY_Playbook StatusDiagram Read|Playbook Status/Diagram Read]]
- [[_COMMUNITY_Bash Safety Guards|Bash Safety Guards]]
- [[_COMMUNITY_Playbook Definitions|Playbook Definitions]]
- [[_COMMUNITY_Argo Config & Design Arming|Argo Config & Design Arming]]
- [[_COMMUNITY_Playbook Adopt & Permission Gate|Playbook Adopt & Permission Gate]]
- [[_COMMUNITY_Claude Judge Implementation|Claude Judge Implementation]]
- [[_COMMUNITY_Gate Registration & Verdicts|Gate Registration & Verdicts]]
- [[_COMMUNITY_Argo Paths & Trust Gate|Argo Paths & Trust Gate]]
- [[_COMMUNITY_Playbook Advance Logic|Playbook Advance Logic]]
- [[_COMMUNITY_Plan Frontmatter Parsing|Plan Frontmatter Parsing]]
- [[_COMMUNITY_Attempt State Tracking|Attempt State Tracking]]
- [[_COMMUNITY_Playbook Catalog Listing|Playbook Catalog Listing]]
- [[_COMMUNITY_Instance Presence Check|Instance Presence Check]]
- [[_COMMUNITY_Session Spawn API|Session Spawn API]]
- [[_COMMUNITY_Emit Shims|Emit Shims]]
- [[_COMMUNITY_Init & Config Merge|Init & Config Merge]]
- [[_COMMUNITY_Playbook Start & Lifecycle Events|Playbook Start & Lifecycle Events]]
- [[_COMMUNITY_Graph Refresh|Graph Refresh]]
- [[_COMMUNITY_Design Commit & Spec Diff Gate|Design Commit & Spec Diff Gate]]
- [[_COMMUNITY_Skill Assembly|Skill Assembly]]
- [[_COMMUNITY_Playbook Diagram Rendering|Playbook Diagram Rendering]]
- [[_COMMUNITY_Registry Lookup|Registry Lookup]]
- [[_COMMUNITY_Red Proof Gate|Red Proof Gate]]
- [[_COMMUNITY_Trust Gate Tests|Trust Gate Tests]]
- [[_COMMUNITY_Fidelity Rubric Assembly|Fidelity Rubric Assembly]]
- [[_COMMUNITY_Red Proof Gate Tests|Red Proof Gate Tests]]
- [[_COMMUNITY_Rules & Tooling Provenance Record|Rules & Tooling Provenance Record]]
- [[_COMMUNITY_Hooks JSON Wiring Tests|Hooks JSON Wiring Tests]]
- [[_COMMUNITY_Bash Safety Guard Tests|Bash Safety Guard Tests]]
- [[_COMMUNITY_Lockfile Edit Block Tests|Lockfile Edit Block Tests]]
- [[_COMMUNITY_Session Context Tests|Session Context Tests]]
- [[_COMMUNITY_Format On Write|Format On Write]]
- [[_COMMUNITY_Test Smell Detection|Test Smell Detection]]
- [[_COMMUNITY_Playbook Advance Worker|Playbook Advance Worker]]
- [[_COMMUNITY_Recipe Import Lint|Recipe Import Lint]]
- [[_COMMUNITY_Design A11y Audit|Design A11y Audit]]
- [[_COMMUNITY_Component Categories & Copy Deck|Component Categories & Copy Deck]]
- [[_COMMUNITY_Binding Manifest Schema|Binding Manifest Schema]]
- [[_COMMUNITY_Oversized File Check|Oversized File Check]]
- [[_COMMUNITY_Variant Shape Diff|Variant Shape Diff]]
- [[_COMMUNITY_Docs Theme Sync|Docs Theme Sync]]
- [[_COMMUNITY_Config Schema Definitions|Config Schema Definitions]]

## God Nodes (most connected - your core abstractions)
1. `definePlaybook()` - 22 edges
2. `GateVerdict` - 21 edges
3. `registerPlaybook()` - 16 edges
4. `getPlaybook()` - 14 edges
5. `resolveRepoRoot()` - 14 edges
6. `auditNode()` - 13 edges
7. `argoConfigPath()` - 12 edges
8. `playbookAdvance()` - 12 edges
9. `readInstance()` - 12 edges
10. `writeInstance()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `discoverWorkspaces()` --calls--> `walk()`  [INFERRED]
  cli/graph-refresh.ts → packs/design/design-kit/design-rules-audit.ts
- `runPermissionHook()` --calls--> `getPlaybook()`  [EXTRACTED]
  adapter-claude/hook.ts → core/spec.ts
- `runInit()` --calls--> `argoConfigPath()`  [EXTRACTED]
  cli/init.ts → config/argo-paths.ts
- `listPlans()` --calls--> `plansDir()`  [EXTRACTED]
  cli/plans.ts → config/argo-paths.ts
- `listPlans()` --calls--> `defaultStateRoot()`  [EXTRACTED]
  cli/plans.ts → core/state.ts

## Import Cycles
- None detected.

## Communities (56 total, 12 thin omitted)

### Community 0 - "Registry Reconciliation"
Cohesion: 0.06
Nodes (64): buildCodeOwnedEntries(), buildKitRegistryEntries(), buildScreenEntries(), ChangedKitComponent, CodeOwnedEntry, DEFAULT_NON_KIT_PAGE_PATTERNS, deriveAdoption(), detectChangedKitComponents() (+56 more)

### Community 1 - "Design Rules Definitions"
Cohesion: 0.05
Nodes (12): AnyNode, DENIED_KIT_INSTANCE_OVERRIDE_FIELDS, GapPaddingCollectionsConfig, GENERIC_LAYER_NAMES, NAMED_AUDIT_TARGET_TYPES, normalizeCopy(), PER_CORNER_RADIUS_FIELDS, POSSIBLE_FALSE_POSITIVE_OVERRIDE_FIELDS (+4 more)

### Community 2 - "Action Classifier"
Cohesion: 0.06
Nodes (39): ActionKind, BASH_WRITE_TARGET_PATTERNS, classifyAction(), classifyBashCommand(), classifyFigmaScript(), extractBashWriteTargets(), extractFigmaScript(), FIGMA_COMPUTED_WRITE_PATTERNS (+31 more)

### Community 3 - "Session Guard & Repo Root"
Cohesion: 0.10
Nodes (33): resolveRepoRoot(), appKeyForCwd(), appKeyForRoot(), bumpSessionWriteCount(), canonical(), COMPLETENESS_SUBDIR, CompletenessState, completenessStatePath() (+25 more)

### Community 4 - "Design Rules Audit Bundling"
Cohesion: 0.17
Nodes (17): bundleDesignRulesAudit(), bundleDesignRulesAuditForRecipe(), designRulesCacheKeys(), designRulesCompletionIdentifier(), generateDesignRulesAuditEntry(), generateDesignRulesPrimeScript(), generateDesignRulesReplayScript(), kitDistHash() (+9 more)

### Community 5 - "Staleness & Sync Check"
Cohesion: 0.32
Nodes (7): convertLetterSpacing(), convertLineHeight(), resolveBoxModel(), ComposeStories, runSpecDiffWalker(), StoryModule, runVrtWalker()

### Community 6 - "Rules/Status Reporting"
Cohesion: 0.11
Nodes (24): rulesStatus(), computeStatus(), probityPluginEnabled(), resolveStatusSnapshot(), runStatus(), StatusReport, StatusSnapshot, baseConfig() (+16 more)

### Community 7 - "Binding Manifest Checklist"
Cohesion: 0.16
Nodes (14): validateBindingManifest(), ChecklistEntry, coversScreen(), normalize(), parseMatrix(), parseRequirements(), Requirement, selectChecklistForScreen() (+6 more)

### Community 8 - "Color Comparator"
Cohesion: 0.21
Nodes (15): clamp01(), compareColor(), compareHugDimension(), comparePxInteger(), linearToSrgb(), Oklch, OKLCH_PATTERN, oklchToSrgb() (+7 more)

### Community 9 - "Comment Lint & Waivers"
Cohesion: 0.11
Nodes (20): CommentCheckWaiver, isWaived(), checkFile(), CommentBlock, CommentLintFinding, CommentLintOptions, countParagraphs(), extensionOf() (+12 more)

### Community 10 - "Playbook Status/Diagram Read"
Cohesion: 0.15
Nodes (12): PlaybookNotFoundError, StageNotFoundError, playbookDiagram(), nodeId(), nodeLabel(), renderPlaybookDiagram(), playbookPacks, playbooks (+4 more)

### Community 11 - "Bash Safety Guards"
Cohesion: 0.14
Nodes (18): bashSourceWriteViolation(), block(), DANGEROUS_GIT_PATTERNS, dangerousGitViolation(), DEFAULT_EXTENSIONS, interpreterWritesSource(), loadExtensions(), main() (+10 more)

### Community 12 - "Playbook Definitions"
Cohesion: 0.20
Nodes (10): makeGate(), registerTwoStage(), definePlaybook(), registerPlaybook(), codeToDesignSpec, componentCreateSpec, componentEditSpec, designToCodeSpec (+2 more)

### Community 13 - "Argo Config & Design Arming"
Cohesion: 0.15
Nodes (14): ArgoConfig, ArmedDesignApp, armedDesignApps(), codeOwnedCodePaths(), DesignBlock, FoundArgoJson, gatedComponentFiles(), matchesStagedFile() (+6 more)

### Community 14 - "Playbook Adopt & Permission Gate"
Cohesion: 0.16
Nodes (14): GateNotFoundError, playbookAdopt(), PlaybookAdoptInput, PlaybookAdoptOptions, PlaybookAdvanceOptions, playbookStart(), playbookStatus(), PlaybookStatusNotFound (+6 more)

### Community 15 - "Claude Judge Implementation"
Cohesion: 0.05
Nodes (50): buildJudgePrompt(), ClaudeProcessResult, createHeadlessClaudeSpawner(), createJudgeImpl(), parseJudgeVerdict(), registerClaudeJudge(), RunClaudeFn, SessionSpawner (+42 more)

### Community 16 - "Gate Registration & Verdicts"
Cohesion: 0.24
Nodes (8): assertValidRoleMap(), BoundaryForbiddenRule, BoundaryRole, BoundaryRoleMap, boundaryRules(), BoundaryRulesOptions, KNOWN_ROLES, argoV2RoleMap

### Community 17 - "Argo Paths & Trust Gate"
Cohesion: 0.20
Nodes (12): ARGO_CONFIG_RELPATH, buildModePath(), designDocsDir(), evidenceDir(), GITIGNORE_BLOCK, launchReceiptPath(), plansDir(), redProofPath() (+4 more)

### Community 18 - "Playbook Advance Logic"
Cohesion: 0.18
Nodes (13): InstanceNotFoundError, advanceToNextStage(), deriveArtifactsFromProduces(), playbookAdvance(), PlaybookAdvanceResult, currentDir, validateArtifacts(), instancePath() (+5 more)

### Community 19 - "Plan Frontmatter Parsing"
Cohesion: 0.19
Nodes (13): assertPlanQueued(), git(), isLanded(), listPlans(), ListPlansOptions, LiveRun, liveRuns(), parsePlanFrontmatter() (+5 more)

### Community 20 - "Attempt State Tracking"
Cohesion: 0.21
Nodes (11): [key, round, stateRoot, cwd], activePointerPath(), atomicWriteJson(), defaultStateRoot(), getActiveInstance(), getActiveInstanceKey(), getActiveInstancePointer(), realpathSafe() (+3 more)

### Community 21 - "Playbook Catalog Listing"
Cohesion: 0.21
Nodes (11): buildPlaybookCatalog(), packOf(), PlaybookCatalogEntry, PlaybookCatalogStage, runPlaybookList(), toolkitVersion(), getPlaybookPack(), listPlaybooks() (+3 more)

### Community 22 - "Instance Presence Check"
Cohesion: 0.06
Nodes (36): normalizeComponentName(), Registry, registryComponentNames(), BuiltInstance, PresenceResult, PresenceStatus, RegistryLookupEntry, resolveInstancePresence() (+28 more)

### Community 23 - "Session Spawn API"
Cohesion: 0.38
Nodes (5): CopyDeck, CopyDeckEntrySchema, CopyDeckSchema, copyDeckStrings(), deck

### Community 24 - "Emit Shims"
Cohesion: 0.27
Nodes (10): findArgoJson(), composePrelude(), GENERATED_BANNER(), renderSpecDiffShim(), renderVrtShim(), runEmitShims(), SHIM_FILES, shimOptions() (+2 more)

### Community 25 - "Init & Config Merge"
Cohesion: 0.29
Nodes (8): expandWorkspaces(), isArgoPluginRepo(), readJson(), runInit(), writeJson(), isPlainObject(), mergeConfigShape(), mergeInto()

### Community 26 - "Playbook Start & Lifecycle Events"
Cohesion: 0.20
Nodes (13): FanOutToolName, LIFECYCLE_STATUSES, LifecycleStatus, RUN_STATES, RunState, TOOL_NAMES, PlaybookStartInput, PlaybookStartResult (+5 more)

### Community 27 - "Graph Refresh"
Cohesion: 0.25
Nodes (6): discoverWorkspaces(), GRAPH_PATHSPECS, pruneDatedBackups(), runGraphRefresh(), ARGO_BIN, refresh()

### Community 28 - "Design Commit & Spec Diff Gate"
Cohesion: 0.24
Nodes (4): GATE, recordSpecDiffReceipt(), walkerEvidencePresent(), workingTreeDriftDigest()

### Community 29 - "Skill Assembly"
Cohesion: 0.29
Nodes (7): AGENTS_WITH_OPERATOR_PROTOCOL, REPO_ROOT, assembleAllSkills(), assembleSkill(), assembleSkillInPlace(), AssembleSkillOptions, REPO_ROOT

### Community 31 - "Registry Lookup"
Cohesion: 0.29
Nodes (8): CliArgs, lookupRegistry(), LookupResult, parseCliArgs(), readOptionalJson(), RegistryIndexEntry, registryLookup(), REGISTRY

### Community 32 - "Red Proof Gate"
Cohesion: 0.22
Nodes (4): commandStagesTestFile, markerPath, repoDir, stagedFiles

### Community 35 - "Fidelity Rubric Assembly"
Cohesion: 0.38
Nodes (4): assembleFidelityRubric(), FidelityCriterion, FidelityRubric, shouldSpawnFidelityVerifier()

### Community 38 - "Rules & Tooling Provenance Record"
Cohesion: 0.33
Nodes (6): argoConfigPath(), recordProvenance(), safeParse(), LSP_POSTURES, recordLspPosture(), safeParse()

### Community 44 - "Test Smell Detection"
Cohesion: 0.62
Nodes (5): detectBridgeAssertion(), detectSelfMock(), detectVacuousAssertion(), main(), read()

### Community 51 - "Design A11y Audit"
Cohesion: 0.10
Nodes (55): textContrastViolation(), to255(), touchTargetViolation(), auditNode(), buildNodeCtx(), findOwningPage(), marshalGapPaddingField(), marshalIconStrokeScale() (+47 more)

### Community 52 - "Component Categories & Copy Deck"
Cohesion: 0.24
Nodes (8): DEFAULT_COMPONENT_CATEGORIES, resolveComponentCategories(), validateComponentCategories(), classifyNodeDrift(), classifyStaleness(), diffVariableDefs(), stalenessActionability(), StalenessClassification

### Community 54 - "Binding Manifest Schema"
Cohesion: 0.18
Nodes (9): BindingManifestRowSchema, BindingManifestSchema, ConfusablePairSchema, ConfusablePairsSchema, ManifestRowTier, ManifestValidationResult, confusablePairs, registry (+1 more)

### Community 58 - "Oversized File Check"
Cohesion: 0.53
Nodes (4): findOversizedFiles(), listTsFiles(), main(), OversizedFile

### Community 59 - "Variant Shape Diff"
Cohesion: 0.40
Nodes (3): diffVariantShape(), VariantMatrix, VariantShapeDiff

## Knowledge Gaps
- **210 isolated node(s):** `ActionKind`, `FILE_EDIT_TOOLS`, `FILE_READ_TOOLS`, `GIT_HISTORY_MUTATION_PATTERNS`, `BASH_WRITE_TARGET_PATTERNS` (+205 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GateVerdict` connect `Claude Judge Implementation` to `Playbook Advance Logic`, `Playbook Definitions`, `Attempt State Tracking`, `Playbook Adopt & Permission Gate`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `resolveRepoRoot()` connect `Session Guard & Repo Root` to `Registry Reconciliation`, `Action Classifier`, `Design Rules Audit Bundling`, `Claude Judge Implementation`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `findArgoJson()` connect `Emit Shims` to `Argo Config & Design Arming`, `Rules & Tooling Provenance Record`, `Instance Presence Check`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `ActionKind`, `FILE_EDIT_TOOLS`, `FILE_READ_TOOLS` to the rest of the system?**
  _210 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Registry Reconciliation` be split into smaller, more focused modules?**
  _Cohesion score 0.05759493670886076 - nodes in this community are weakly interconnected._
- **Should `Design Rules Definitions` be split into smaller, more focused modules?**
  _Cohesion score 0.052564102564102565 - nodes in this community are weakly interconnected._
- **Should `Action Classifier` be split into smaller, more focused modules?**
  _Cohesion score 0.06184012066365008 - nodes in this community are weakly interconnected._