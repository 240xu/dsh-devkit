// Zero-dependency test runner entry: `node --test <dir>` failed on some Node
// builds (MODULE_NOT_FOUND), and an unquoted shell glob (test/*.test.js)
// breaks on Windows where cmd.exe does not expand it. This entry spawns
// node --test with the explicit file list, globbed in-process, so `npm test`
// behaves identically on POSIX and Windows. Keeps the default spec reporter.
import { spawnSync } from 'node:child_process'
import { globSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.dirname(path.dirname(fileURLToPathSafe()))
function fileURLToPathSafe() {
  // no direct import cycle avoidance needed; kept simple
  return decodeURIComponent(new (globalThis.URL || Object)(import.meta.url).pathname)
}

const files = globSync(path.join(root, 'test', '*.test.js'))
if (files.length === 0) {
  console.error('no test files found under test/')
  process.exit(1)
}
const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
process.exit(res.status || 0)
