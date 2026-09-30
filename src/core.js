// dsh-devkit: shared pure logic (ESM).
//
// DUAL-SOURCE NOTICE: src/client.js (classic-script bundle) carries thin
// copies of matchCommands / isTextInputTarget / ChordResolver so the shipped
// bundle stays self-contained. 修改必须同步两处：test/consistency.test.js
// hashes both copies and fails on drift. Edit core.js AND client.js together.
//
// Everything here is dependency-free and runs in plain node --test:
//   - BUILTIN_COMMANDS      static command metadata (also served by
//                           GET /api/devkit/commands)
//   - matchCommands         palette filtering (id / title / keywords /
//                           shortcut, case-insensitive, zh/en alike)
//   - isTextInputTarget     input-field exemption for the keyboard layer
//   - ChordResolver         Ctrl+K chord state machine (Ctrl+K opens the
//                           palette; Ctrl+K Ctrl+S within the window opens
//                           the shortcut sheet; Ctrl+Shift+P opens palette)
//
// The browser client (src/client.js) is a classic script under the
// client-modules protocol and cannot import this file; it carries its own
// thin copies of matchCommands / isTextInputTarget / chord handling so the
// shipped bundle stays self-contained. This file is the tested reference.

export const VERSION = '0.2.5'

// Static metadata for the built-in commands. `run` lives only in the client.
export const BUILTIN_COMMANDS = [
  {
    id: 'devkit.session.switch',
    titleZh: '切换会话…',
    titleEn: 'Switch session…',
    shortcut: null,
    keywordsZh: ['会话', '切换', 'session', 'switch'],
    keywordsEn: ['session', 'switch'],
  },
  {
    id: 'devkit.session.new',
    titleZh: '新建会话',
    titleEn: 'New session',
    shortcut: null,
    keywordsZh: ['会话', '新建', 'new', 'session'],
    keywordsEn: ['new', 'session'],
  },
  {
    id: 'devkit.session.delete',
    titleZh: '删除当前会话…',
    titleEn: 'Delete current session…',
    shortcut: null,
    keywordsZh: ['会话', '删除', 'delete', 'session'],
    keywordsEn: ['delete', 'session'],
  },
  {
    id: 'devkit.session.exportMarkdown',
    titleZh: '导出当前会话 Markdown…',
    titleEn: 'Export current session as Markdown…',
    shortcut: null,
    keywordsZh: ['导出', 'markdown', '会话', 'export'],
    keywordsEn: ['export', 'markdown', 'session'],
  },
  {
    id: 'devkit.messageOps',
    titleZh: '消息操作面板（回滚/删除/分支）…',
    titleEn: 'Message ops panel (revert / delete / branch)…',
    shortcut: null,
    keywordsZh: ['消息', '回滚', '分支', 'message', 'ops'],
    keywordsEn: ['message', 'ops', 'revert', 'branch'],
  },
  {
    id: 'devkit.websearch.settings',
    titleZh: '打开 Websearch 设置…',
    titleEn: 'Open websearch settings…',
    shortcut: null,
    keywordsZh: ['websearch', '设置', '搜索', 'settings'],
    keywordsEn: ['websearch', 'settings', 'search'],
  },
  {
    id: 'devkit.session.copyId',
    titleZh: '复制当前会话 ID',
    titleEn: 'Copy current session ID',
    shortcut: null,
    keywordsZh: ['复制', '会话', 'id', 'copy'],
    keywordsEn: ['copy', 'session', 'id'],
  },
  {
    id: 'devkit.searchHistory',
    titleZh: '搜索会话历史…（需 dsh-session-search）',
    titleEn: 'Search session history… (needs dsh-session-search)',
    shortcut: null,
    keywordsZh: ['搜索', '历史', '全文', 'search', 'history'],
    keywordsEn: ['search', 'history', 'full-text'],
  },
  {
    id: 'devkit.searchPanel',
    titleZh: '打开会话搜索面板…（需 dsh-session-search）',
    titleEn: 'Open session search panel… (needs dsh-session-search)',
    shortcut: null,
    keywordsZh: ['搜索', '面板', '全文', 'search', 'panel'],
    keywordsEn: ['search', 'panel', 'full-text'],
  },
  {
    id: 'devkit.lazyview',
    titleZh: '打开 lazy-view 面板…（需 session-lazy-view）',
    titleEn: 'Open lazy-view panel… (needs session-lazy-view)',
    shortcut: null,
    keywordsZh: ['lazy', 'view', 'timeline', '时间线', '查看器'],
    keywordsEn: ['lazy', 'view', 'timeline'],
  },
  {
    id: 'devkit.devinfo',
    titleZh: '开发者信息（dev info）',
    titleEn: 'Developer info (dev info)',
    shortcut: null,
    keywordsZh: ['开发者', '信息', 'dev', 'info', '版本'],
    keywordsEn: ['dev', 'info', 'version', 'debug'],
  },
  {
    id: 'devkit.shortcuts',
    titleZh: '快捷键速查表',
    titleEn: 'Keyboard shortcuts',
    shortcut: 'Ctrl+K Ctrl+S',
    keywordsZh: ['快捷键', '键位', 'shortcuts', 'keys'],
    keywordsEn: ['shortcuts', 'keys', 'keyboard'],
  },
]

// Static shortcut sheet content (the overlay lists these plus any foreign
// commands that declare a `shortcut`).
export const SHORTCUTS = [
  { keys: 'Ctrl+K', descZh: '打开命令面板', descEn: 'Open command palette' },
  { keys: 'Ctrl+Shift+P', descZh: '打开命令面板', descEn: 'Open command palette' },
  { keys: 'Ctrl+K Ctrl+S', descZh: '快捷键速查表', descEn: 'Shortcut cheat sheet' },
  { keys: 'Esc', descZh: '关闭 devkit 弹层', descEn: 'Close any devkit overlay' },
  { keys: '↑ / ↓', descZh: '面板内移动选择', descEn: 'Move selection in palette' },
  { keys: 'Enter', descZh: '执行选中命令', descEn: 'Run selected command' },
]

function commandFields(cmd, lang) {
  const zh = lang !== 'en'
  return [
    String(cmd.id || ''),
    zh ? String(cmd.titleZh || cmd.title || '') : String(cmd.titleEn || cmd.title || ''),
    ...(zh ? (cmd.keywordsZh || []) : (cmd.keywordsEn || [])),
    ...(cmd.keywords || []),
    String(cmd.shortcut || ''),
  ].map((s) => s.toLowerCase())
}

// Filter palette entries against a query. Every token must hit some field of
// the command (AND across tokens, OR across fields) so "删 会话" works and
// pure-English queries match ids/keywords even on the zh dictionary.
export function matchCommands(commands, query, lang = 'zh') {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return commands.slice()
  const tokens = q.split(/\s+/)
  return commands.filter((cmd) => {
    const fields = commandFields(cmd, lang)
    return tokens.every((tok) => fields.some((f) => f.includes(tok)))
  })
}

// True when a keyboard event originated inside a text-entry surface. The
// keyboard layer skips everything except Esc while this returns true, so
// typing in the chat box or any plugin field never triggers devkit chords.
export function isTextInputTarget(target) {
  if (!target) return false
  const tag = String(target.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (target.isContentEditable === true) return true
  return false
}

// Ctrl+K chord state machine. Feed plain event descriptors:
//   { ctrlKey, shiftKey, key }
// plus a monotonic `now` (ms). Returns { action, consume }:
//   action: 'palette' | 'shortcuts' | null
//   consume: caller should preventDefault/stopPropagation
export class ChordResolver {
  constructor({ chordWindowMs = 1500 } = {}) {
    this.chordWindowMs = chordWindowMs
    this.armedAt = null
  }

  feed(ev, now) {
    const ctrl = ev.ctrlKey === true
    const shift = ev.shiftKey === true
    const key = String(ev.key || '').toLowerCase()
    const armed = this.armedAt !== null && (now - this.armedAt) <= this.chordWindowMs
    if (!armed) this.armedAt = null

    // Ctrl+K: open the palette immediately and arm the chord for Ctrl+S.
    if (ctrl && !shift && key === 'k') {
      this.armedAt = now
      return { action: 'palette', consume: true }
    }
    // Ctrl+Shift+P: direct palette (no chord).
    if (ctrl && shift && key === 'p') {
      this.armedAt = null
      return { action: 'palette', consume: true }
    }
    // Armed chord: Ctrl+K Ctrl+S -> shortcut sheet.
    if (armed && ctrl && !shift && key === 's') {
      this.armedAt = null
      return { action: 'shortcuts', consume: true }
    }
    // Any other key disarms silently (the palette is already open).
    this.armedAt = null
    return { action: null, consume: false }
  }
}

// --- palette mode prefixes (VS Code paradigm) --------------------------------
//   '>rest'  command mode
//   '#rest'  session search mode (title match locally; full-text via
//            dsh-session-search when its health endpoint answers)
//   '@rest'  plugin-group mode (commands grouped by registration source)
//   'rest'   mixed mode (commands + session titles, MRU first)
export function parsePaletteQuery(query) {
  const q = String(query || '')
  const first = q.charAt(0)
  if (first === '>') return { mode: 'commands', rest: q.slice(1) }
  if (first === '#') return { mode: 'sessions', rest: q.slice(1) }
  if (first === '@') return { mode: 'plugins', rest: q.slice(1) }
  return { mode: 'mixed', rest: q }
}

// --- MRU (most recently used) --------------------------------------------------
// Pure list ops; the browser client persists via localStorage under
// 'dsh-devkit-mru' (cap 20, ring: re-record moves to front, oldest drops).

export const MRU_KEY = 'dsh-devkit-mru'
export const MRU_CAP = 20

// Returns a NEW list: id moved to front, deduped, capped.
export function pushMru(list, id, cap = MRU_CAP) {
  const prev = Array.isArray(list) ? list.filter((x) => x !== id) : []
  return [id, ...prev].slice(0, cap)
}

// Stable-rank items by MRU position (recorded earlier = higher); items never
// used keep their relative order after all MRU hits.
export function applyMruRank(items, mru) {
  const rank = new Map((mru || []).map((id, i) => [id, i]))
  return items
    .map((item, i) => ({ item, i, r: rank.has(item.id) ? rank.get(item.id) : Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
    .map((x) => x.item)
}

// --- availability probe ---------------------------------------------------------
// Injectable-fetch probe with per-URL cache, so command registration can be
// conditional on other plugins being present (session-search, lazy-view)
// and stays unit-testable without a network.
export class ProbeCache {
  constructor({ fetchImpl = null, ttlMs = 60000, now = Date.now } = {}) {
    this.fetchImpl = fetchImpl
    this.ttlMs = ttlMs
    this.now = now
    this.cache = new Map() // url -> {ok, at}
  }

  async probe(url) {
    const hit = this.cache.get(url)
    if (hit && (this.now() - hit.at) <= this.ttlMs) return hit.ok
    let ok = false
    try {
      const doFetch = this.fetchImpl || (typeof fetch === 'function' ? fetch : null)
      if (doFetch) {
        const res = await doFetch(url, { method: 'GET' })
        ok = !!res && res.ok === true
      }
    } catch {
      ok = false // network error / plugin absent: probe is a soft signal
    }
    this.cache.set(url, { ok, at: this.now() })
    return ok
  }
}

// --- small pure helpers extracted from the palette ------------------------------

// Registration source of a command: the id segment before the first dot.
export function pluginSource(id) {
  return String(id || '').split('.')[0]
}

// '@' plugin-group mode: stable sort commands by registration source, keeping
// registration order within each group.
export function sortCommandsBySource(commands) {
  return commands
    .map((c, i) => ({ c, i, g: pluginSource(c.id) }))
    .sort((a, b) => (a.g === b.g ? a.i - b.i : a.g < b.g ? -1 : 1))
    .map((x) => x.c)
}

// Normalize a full-text search payload into [{id, title, seq, snippet}].
// Accepts {results:[…]} / {hits:[…]} / a bare array so the devkit side keeps
// working across dsh-session-search response revisions (fail-soft to []).
export function normalizeSearchResults(data) {
  const rows = data && Array.isArray(data.results) ? data.results
    : data && Array.isArray(data.hits) ? data.hits
    : Array.isArray(data) ? data : []
  return rows
    .map((r) => ({
      id: String((r && (r.sessionId || r.session)) || ''),
      title: (r && (r.title || r.sessionTitle)) || String((r && (r.sessionId || r.session)) || ''),
      seq: r && typeof r.seq === 'number' ? r.seq : null,
      snippet: (r && (r.snippet || r.preview || r.context)) || '',
    }))
    .filter((r) => r.id)
}

// --- current-session derivation -------------------------------------------------
// The client sessions-store snapshot has NO stable `current` field (reading
// snap.current is always undefined). Derive it defensively across the field
// shapes seen in the wild; every probe is a soft signal, null when unclear.
export function deriveCurrentSessionId(snap) {
  if (!snap || typeof snap !== 'object') return null
  if (snap.current) return snap.current
  if (snap.phase && typeof snap.phase === 'object') {
    const c = snap.phase.current || snap.phase.currentSessionId || snap.phase.sessionId
    if (c) return c
  }
  const proj = snap.projectionsBySession
  if (proj && typeof proj === 'object') {
    for (const key of Object.keys(proj)) {
      const v = proj[key]
      if (v && (v.current === true || v.isCurrent === true)) return key
    }
  }
  return null
}
