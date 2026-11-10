package expo.modules.diagnostics

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JavaScript face of this module — deliberately empty.
 *
 * The work happens in `CrashLogProvider`, which Android creates before any
 * screen exists. Nothing here needs to run at import time, and nothing does:
 * that is the whole reason this module is an Expo module rather than a
 * React Native package.
 */
class DiagnosticsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Diagnostics")
  }
}
