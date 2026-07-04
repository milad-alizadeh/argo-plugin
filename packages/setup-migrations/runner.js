import { compareVersions } from './semver.js'
import { migrations as shippedMigrations } from './migrations.js'

/**
 * Migrations pending for a project recorded at `recordedVersion`: those whose
 * `sinceVersion` is at or above the recorded version (inclusive-of-current —
 * a project set up mid-version-bump must still see a same-version migration;
 * the migration's own `detect()` gates whether it actually applies), sorted
 * ascending by `sinceVersion`. Migrations BELOW the recorded version are
 * excluded (the project was set up past them). Defaults to the shipped
 * registry when no explicit list is passed.
 */
export function pendingMigrations(recordedVersion, migrations = shippedMigrations) {
  return migrations
    .filter((m) => compareVersions(m.sinceVersion, recordedVersion) >= 0)
    .sort((x, y) => compareVersions(x.sinceVersion, y.sinceVersion))
}
