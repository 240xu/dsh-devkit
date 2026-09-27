// dsh-devkit: SERVER half (host).
//
// HTTP surface (both routes are read-only; the plugin itself performs no
// host mutations):
//   GET /api/devkit/commands  - built-in command metadata for external /
//                               documentation consumption
//   GET /api/devkit/health    - liveness + version facts
//
// ESM module format (cordis bundle rule): named exports name/inject/apply.
// webServer is OPTIONAL (terminal-only profiles have no web surface): the
// routes register when the service exists or appears later (ctx.inject
// child), mirroring dsh-plugin-session-delete.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { BUILTIN_COMMANDS, SHORTCUTS, VERSION } from './core.js'

export const name = 'dsh-devkit'
export const inject = []

const PKG_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function readOwnVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'))
    return String(pkg.version || VERSION)
  } catch {
    return VERSION
  }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

// Pure-ish health body builder shared by the endpoint (kept here rather than
// core.js because it touches process/host facts).
function healthBody(ctx) {
  const extras = {
    dsh: process.env.DSH_VERSION || null,
    platform: `${os.platform()} ${os.arch()}`,
    pid: process.pid,
    commands: BUILTIN_COMMANDS.length,
  }
  return {
    ok: true,
    plugin: '@240xu/dsh-devkit',
    version: readOwnVersion(),
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    ...extras,
    ...(ctx && typeof ctx === 'object' ? ctx : {}),
  }
}

export function apply(ctx) {
  function registerHttp(host, targetCtx) {
    targetCtx.effect(() => host.register({
      kind: 'exact',
      path: '/api/devkit/commands',
      handler: async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        sendJson(res, 200, {
          ok: true,
          note: 'Built-in command metadata of @240xu/dsh-devkit. Runtime-registered commands (from other plugins via window.__dshDevkit.registerCommand) are browser-side only and are not listed here.',
          shortcuts: SHORTCUTS,
          commands: BUILTIN_COMMANDS,
        })
      },
    }), 'dsh-devkit: commands route')

    targetCtx.effect(() => host.register({
      kind: 'exact',
      path: '/api/devkit/health',
      handler: async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        try {
          sendJson(res, 200, healthBody())
        } catch (e) {
          sendJson(res, 500, { ok: false, error: e.message })
        }
      },
    }), 'dsh-devkit: health route')
  }

  const ws = ctx.get('webServer')
  if (ws !== undefined) {
    registerHttp(ws, ctx)
  } else {
    ctx.inject(['webServer'], (sub) => {
      registerHttp(sub.webServer, sub)
    })
  }
}

export default { name, inject, apply }
