// Zero-dependency test runner entry: `node --test <dir>` failed on some Node
// builds (MODULE_NOT_FOUND), and an unquoted shell glob (test/*.test.js)
// breaks on Windows where cmd.exe does not expand it. This entry globs the
// explicit file list in-process and spawns `node --test <files>`, so `npm
// test` behaves identically on POSIX and Windows. Keeps the default reporter.
import { spawnSync } from 'node:child_process'
import { globSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const files = globSync(path.join(root, 'test', '*.test.js'))
if (files.length === 0) {
  console.error('no test files found under test/')
  process.exit(1)
}
const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
process.exit(res.status || 0)
