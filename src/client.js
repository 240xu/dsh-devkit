// dsh-devkit: CLIENT half.
//
// VS Code-grade developer experience for the DSH web client, WITHOUT touching
// any sidebar surface. Everything renders through existing compatible slots:
//   - shell.overlay                           command palette / shortcut
//                                             sheet / dev info (fullscreen
//                                             backdrop + floating panel)
//   - conversation.session.header.actions     one palette launch button
//
// Contribution point (open to other plugins, mirrors VS Code):
//   window.__dshDevkit.registerCommand({ id, title, shortcut?, keywords?, run })
//   -> returns an unregister function. Commands appear in the palette.
//   window.__dshDevkit.toast(msg, { kind, timeoutMs }) -> bottom-right toast.
//
// Keyboard layer: capture-phase keydown on window. While the event target is
// an input / textarea / contentEditable, only Esc passes through devkit (and
// it merely closes devkit overlays). Chords: Ctrl+K opens the palette and
// arms Ctrl+K Ctrl+S (shortcut sheet, within 1.5s); Ctrl+Shift+P opens the
// palette directly.
//
// Bundle format (client-modules protocol): classic script registering a
// factory via window.__ModuleLoader__.load({ id, factory }); plain
// React.createElement, --dsw-* theme tokens only.
// DUAL-SOURCE NOTICE: matchCommands / isTextInputTarget / ChordResolver are
// thin copies of src/core.js (the tested reference). 修改必须同步两处：
// test/consistency.test.js hashes both copies and fails on drift.

window.__ModuleLoader__.load({
  id: '@240xu/dsh-devkit',
  factory: (require) => {
    const React = require('react')
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const PLUGIN_ID = '@240xu/dsh-devkit'
    // N2: classic-script bundle cannot import package.json; bundler-side
    // injection is not part of the client-modules protocol, so a literal with
    // a sync note is the simplest single source. Bump together with package.json.
    const VERSION = '0.2.5'
    const OVERLAY_SLOT = 'shell.overlay'
    const HEADER_SLOT = 'conversation.session.header.actions'
    const OVERLAY_ID = 'devkit-overlay'
    const HEADER_ID = 'devkit-palette-button'
    const NS = 'dsh-devkit'
    const OPEN_EVENT = 'dsh-devkit:open' // detail: { mode: 'palette'|'sessions'|'shortcuts'|'devinfo' }
    // --- locale -----------------------------------------------------------------

    const zhDict = {
      'header.title': '命令面板 (Ctrl+K)',
      'palette.placeholder': '输入命令名…（↑↓ 选择，Enter 执行，Esc 关闭）',
      'palette.sessionsPlaceholder': '输入会话名过滤…（Enter 打开选中会话）',
      'palette.empty': '没有匹配命令',
      'palette.hint': '提示：> 命令 · # 会话搜索 · @ 插件分组 · Ctrl+K Ctrl+S 快捷键',
      'sessions.title': '切换会话',
      'sessions.empty': '没有匹配会话',
      'sessions.current': '当前',
      'sessions.running': '运行中',
      'shortcuts.title': '快捷键速查表',
      'shortcuts.builtin': 'Devkit 内置',
      'shortcuts.commands': '命令键位',
      'devinfo.title': '开发者信息',
      'devinfo.loading': '正在读取宿主状态…',
      'devinfo.plugin': '插件版本',
      'devinfo.dsh': 'DSH 版本',
      'devinfo.profile': 'Profile',
      'devinfo.session': '当前会话',
      'devinfo.sources': '命令注册来源',
      'devinfo.ua': 'User Agent',
      'devinfo.hostFail': '（宿主状态接口不可用，已降级显示浏览器信息）',
      'toast.noSession': '没有当前会话',
      'toast.newOk': '已新建会话',
      'toast.newUnsupported': '当前宿主未提供新建会话接口',
      'toast.deleteOk': '会话已删除',
      'toast.deleteFail': '删除失败：',
      'toast.exportOk': 'Markdown 已导出',
      'toast.exportFail': '导出失败（message-ops 插件不可用或会话日志不存在）',
      'toast.exporting': '正在导出…',
      'toast.websearch': '已请求打开 Websearch 设置；若未弹出，请从宿主设置面板打开',
      'toast.websearchUnavailable': 'Websearch 设置暂不可用（插件未安装或无响应）',
      'palette.sessionsSearchPlaceholder': '全文搜索会话（# 前缀）…',
      'sessions.localOnly': '没有匹配会话（全文索引不可用，仅标题匹配）',
      'badge.recent': '最近',
      'badge.fullText': '全文',
      'toast.copied': '已复制会话 ID',
      'toast.copyFail': '复制失败：',
      'toast.openFail': '打开会话失败（会话可能已被删除）',
      'cmd.searchHistory': '搜索会话历史…',
      'cmd.searchPanel': '打开会话搜索面板…',
      'cmd.lazyview': '打开 lazy-view 面板…',
      'cmd.copyId': '复制当前会话 ID',
      'confirmDelete.title': '删除当前会话',
      'confirmDelete.desc': '将永久删除该会话及其全部对话记录，此操作不可恢复。',
      'confirmDelete.cancel': '取消',
      'confirmDelete.confirm': '删除',
      'confirmDelete.busy': '正在删除…',
      'confirmDelete.runningWarn': '⚠ 会话正在运行，删除将立即停止其任务',
    }

    const enDict = {
      'header.title': 'Command palette (Ctrl+K)',
      'palette.placeholder': 'Type a command… (up/down select, Enter run, Esc close)',
      'palette.sessionsPlaceholder': 'Filter sessions… (Enter opens the selection)',
      'palette.empty': 'No matching commands',
      'palette.hint': 'Tip: Ctrl+K Ctrl+S shows the shortcut cheat sheet',
      'sessions.title': 'Switch session',
      'sessions.empty': 'No matching sessions',
      'sessions.current': 'current',
      'sessions.running': 'running',
      'shortcuts.title': 'Keyboard shortcuts',
      'shortcuts.builtin': 'Devkit built-in',
      'shortcuts.commands': 'Command keys',
      'devinfo.title': 'Developer info',
      'devinfo.loading': 'Loading host status…',
      'devinfo.plugin': 'Plugin version',
      'devinfo.dsh': 'DSH version',
      'devinfo.profile': 'Profile',
      'devinfo.session': 'Current session',
      'devinfo.sources': 'Command sources',
      'devinfo.ua': 'User Agent',
      'devinfo.hostFail': '(host status endpoint unavailable; showing browser info only)',
      'toast.noSession': 'No current session',
      'toast.newOk': 'Session created',
      'toast.newUnsupported': 'This host does not expose a create-session API',
      'toast.deleteOk': 'Session deleted',
      'toast.deleteFail': 'Delete failed: ',
      'toast.exportOk': 'Markdown exported',
      'toast.exportFail': 'Export failed (message-ops unavailable or log missing)',
      'toast.exporting': 'Exporting…',
      'toast.websearch': 'Requested websearch settings; open it from host settings if nothing popped up',
      'toast.websearchUnavailable': 'Websearch settings unavailable (plugin missing or not responding)',
      'palette.sessionsSearchPlaceholder': 'Full-text search sessions (# prefix)…',
      'sessions.localOnly': 'No matching sessions (full-text index unavailable; titles only)',
      'badge.recent': 'recent',
      'badge.fullText': 'full-text',
      'toast.copied': 'Session ID copied',
      'toast.copyFail': 'Copy failed: ',
      'toast.openFail': 'Failed to open session (it may have been deleted)',
      'cmd.searchHistory': 'Search session history…',
      'cmd.searchPanel': 'Open session search panel…',
      'cmd.lazyview': 'Open lazy-view panel…',
      'cmd.copyId': 'Copy current session ID',
      'confirmDelete.title': 'Delete current session',
      'confirmDelete.desc': 'This permanently deletes the session and all of its conversation records. This cannot be undone.',
      'confirmDelete.cancel': 'Cancel',
      'confirmDelete.confirm': 'Delete',
      'confirmDelete.busy': 'Deleting…',
      'confirmDelete.runningWarn': '⚠ Session is running; deleting will stop its task',
    }

    var __locale = null
    var __sessionsSvc = null
    var __uiWorkspace = null

    function localeFallbackLang() {
      if (typeof navigator === 'undefined') return 'zh'
      for (const tag of (navigator.languages || []).concat([navigator.language])) {
        const primary = String(tag || '').toLowerCase().split('-')[0]
        if (primary === 'zh' || primary === 'en') return primary
      }
      return 'zh'
    }

    function __t(key) {
      if (__locale && typeof __locale.translate === 'function') {
        const text = __locale.translate(NS, key)
        if (typeof text === 'string' && text !== key) return text
      }
      return (localeFallbackLang() === 'en' ? enDict : zhDict)[key] || key
    }

    function useLocaleRevision() {
      const [, setRev] = useState(0)
      useEffect(() => {
        if (!__locale || typeof __locale.subscribe !== 'function') return undefined
        return __locale.subscribe(() => setRev((v) => v + 1))
      }, [])
    }

    // --- pure helpers (tested references live in src/core.js) -------------------

    function isTextInputTarget(target) {
      if (!target) return false
      const tag = String(target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
      if (target.isContentEditable === true) return true
      return false
    }

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

    function matchCommands(commands, query, lang = 'zh') {
      const q = String(query || '').trim().toLowerCase()
      if (!q) return commands.slice()
      const tokens = q.split(/\s+/)
      return commands.filter((cmd) => {
        const fields = commandFields(cmd, lang)
        return tokens.every((tok) => fields.some((f) => f.includes(tok)))
      })
    }

    class ChordResolver {
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
        if (ctrl && !shift && key === 'k') {
          this.armedAt = now
          return { action: 'palette', consume: true }
        }
        if (ctrl && shift && key === 'p') {
          this.armedAt = null
          return { action: 'palette', consume: true }
        }
        if (armed && ctrl && !shift && key === 's') {
          this.armedAt = null
          return { action: 'shortcuts', consume: true }
        }
        this.armedAt = null
        return { action: null, consume: false }
      }
    }

    // --- palette prefixes / MRU (dual-source: mirrors src/core.js) ---------------
    // DUAL-SOURCE with core.js parsePaletteQuery / pushMru / applyMruRank /
    // pluginSource / sortCommandsBySource / normalizeSearchResults /
    // deriveCurrentSessionId /
    // MRU_KEY / MRU_CAP — test/consistency.test.js hashes both copies.

    const MRU_KEY = 'dsh-devkit-mru'
    const MRU_CAP = 20

    function parsePaletteQuery(query) {
      const q = String(query || '')
      const first = q.charAt(0)
      if (first === '>') return { mode: 'commands', rest: q.slice(1) }
      if (first === '#') return { mode: 'sessions', rest: q.slice(1) }
      if (first === '@') return { mode: 'plugins', rest: q.slice(1) }
      return { mode: 'mixed', rest: q }
    }

    function pushMru(list, id, cap = MRU_CAP) {
      const prev = Array.isArray(list) ? list.filter((x) => x !== id) : []
      return [id, ...prev].slice(0, cap)
    }

    function applyMruRank(items, mru) {
      const rank = new Map((mru || []).map((id, i) => [id, i]))
      return items
        .map((item, i) => ({ item, i, r: rank.has(item.id) ? rank.get(item.id) : Number.MAX_SAFE_INTEGER }))
        .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
        .map((x) => x.item)
    }

    function pluginSource(id) {
      return String(id || '').split('.')[0]
    }

    function sortCommandsBySource(commands) {
      return commands
        .map((c, i) => ({ c, i, g: pluginSource(c.id) }))
        .sort((a, b) => (a.g === b.g ? a.i - b.i : a.g < b.g ? -1 : 1))
        .map((x) => x.c)
    }

    function normalizeSearchResults(data) {
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

    function deriveCurrentSessionId(snap) {
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

    class ProbeCache {
      constructor(opts) {
        const o = opts || {}
        this.fetchImpl = o.fetchImpl || null
        this.ttlMs = o.ttlMs || 60000
        this.now = o.now || Date.now
        this.cache = new Map()
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

    var __probeCache = new ProbeCache()

    // --- sessions service adoption ----------------------------------------------

    function sessionsSnapshot() {
      const svc = __sessionsSvc
      if (!svc || !svc.list) return null
      try { return svc.list.getSnapshot() } catch { return null }
    }

    function currentSessionId() {
      return deriveCurrentSessionId(sessionsSnapshot())
    }

    function listRecentSessions() {
      const snap = sessionsSnapshot()
      if (!snap || !snap.byId) return []
      const ids = snap.ids && snap.ids.length ? snap.ids : Object.keys(snap.byId)
      return ids
        .map((id) => ({ id, title: (snap.byId[id] && snap.byId[id].title) || id, running: !!(snap.byId[id] && snap.byId[id].running) }))
    }

    function openSession(id) {
      if (!id) return false
      if (__sessionsSvc && typeof __sessionsSvc.open === 'function') {
        try { __sessionsSvc.open(id); return true } catch { /* fall through to uiWorkspace */ }
      }
      if (__uiWorkspace && typeof __uiWorkspace.openSession === 'function') {
        try { __uiWorkspace.openSession(id); return true } catch { /* give up */ }
      }
      return false
    }

    // fix 3: refresh probes the host's current ISessions.refresh() first,
    // falling back to the legacy refreshList() name.
    function refreshSessionsList() {
      const svc = __sessionsSvc
      if (!svc) return Promise.resolve(false)
      try {
        if (typeof svc.refresh === 'function') return Promise.resolve(svc.refresh()).then(() => true)
        if (typeof svc.refreshList === 'function') return Promise.resolve(svc.refreshList()).then(() => true)
      } catch { /* best-effort */ }
      return Promise.resolve(false)
    }

    // --- toast (plain DOM, no React needed) --------------------------------------

    function ensureToastStyles() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-devkit-css="toast"]')) return
      const tag = document.createElement('style')
      tag.setAttribute('data-devkit-css', 'toast')
      tag.textContent = [
        '@keyframes dshDevkitToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
        '@keyframes dshDevkitToastOut{from{opacity:1}to{opacity:0;transform:translateY(4px)}}',
        '[data-devkit-toast]{animation:dshDevkitToastIn .18s ease-out}',
        '[data-devkit-toast].dsh-devkit-toast-out{animation:dshDevkitToastOut .22s ease-in forwards}',
        '@media (prefers-reduced-motion: reduce){',
        '  [data-devkit-toast]{animation:none}',
        '  [data-devkit-toast].dsh-devkit-toast-out{animation:none}',
        '}',
        '@media (prefers-contrast: more){',
        '  [data-devkit-toast]{border-width:2px;font-weight:600}',
        '}',
      ].join('\n')
      document.head.appendChild(tag)
    }

    const TOAST_COLORS = {
      info: ['var(--dsw-alias-border-l1, rgba(128,128,128,.35))', 'inherit'],
      ok: ['var(--dsw-alias-state-success-primary, #2e9e5b)', 'inherit'],
      warn: ['var(--dsw-alias-state-warn-primary, #f5a524)', 'inherit'],
      error: ['var(--dsw-alias-state-error-primary, #e5484d)', 'inherit'],
    }

    function toast(msg, opts) {
      if (typeof document === 'undefined') return
      ensureToastStyles()
      let host = document.getElementById('dsh-devkit-toasts')
      if (!host) {
        host = document.createElement('div')
        host.id = 'dsh-devkit-toasts'
        host.style.cssText = [
          'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483000',
          'display:flex', 'flex-direction:column', 'gap:8px', 'align-items:flex-end',
          'pointer-events:none', 'max-width:min(420px,80vw)',
        ].join(';')
        host.setAttribute('role', 'status')
        host.setAttribute('aria-live', 'polite')
        document.body.appendChild(host)
      }
      const o = opts || {}
      const kind = TOAST_COLORS[o.kind] ? o.kind : 'info'
      const [accent] = TOAST_COLORS[kind]
      const el = document.createElement('div')
      el.setAttribute('data-devkit-toast', kind)
      el.style.cssText = [
        'pointer-events:auto', 'padding:10px 14px', 'border-radius:10px',
        'border:1px solid ' + accent,
        'background:var(--dsw-alias-surface-primary, rgba(30,30,32,.95))',
        'color:var(--dsw-alias-label-primary, inherit)',
        'font-size:13px', 'line-height:20px', 'box-shadow:0 8px 28px rgba(0,0,0,.28)',
        'word-break:break-word',
      ].join(';')
      el.textContent = String(msg || '')
      host.appendChild(el)
      const remove = () => {
        el.classList.add('dsh-devkit-toast-out')
        setTimeout(() => { try { el.remove() } catch { /* gone */ } }, 240)
      }
      setTimeout(remove, Math.max(800, Number(o.timeoutMs) || 3500))
      el.addEventListener('click', remove)
    }

    // --- command registry ---------------------------------------------------------

    const builtinTitlesZh = {
      'devkit.session.switch': '切换会话…',
      'devkit.session.new': '新建会话',
      'devkit.session.delete': '删除当前会话…',
      'devkit.session.exportMarkdown': '导出当前会话 Markdown…',
      'devkit.messageOps': '消息操作面板（回滚/删除/分支）…',
      'devkit.websearch.settings': '打开 Websearch 设置…',
      'devkit.session.copyId': '复制当前会话 ID',
      'devkit.devinfo': '开发者信息（dev info）',
      'devkit.shortcuts': '快捷键速查表',
    }

    // Command records keep their registration order; foreign commands come
    // after the built-ins in the palette.
    var __commands = []
    var __commandIds = new Set()
    var __registryListeners = []

    function notifyRegistry() {
      for (const fn of __registryListeners) {
        try { fn() } catch { /* a listener must never break the registry */ }
      }
    }

    function registerCommand(spec) {
      const id = String((spec && spec.id) || '').trim()
      const title = String((spec && spec.title) || '').trim()
      if (!id || !title || typeof (spec && spec.run) !== 'function') {
        throw new Error('[dsh-devkit] registerCommand requires { id, title, run }')
      }
      if (__commandIds.has(id)) {
        // Idempotent dedup (suite consensus): re-registering the same id with
        // the same run (double plugin load, suite + standalone coexistence)
        // is a no-op returning the original unregister. A conflicting run is
        // warned and ignored — never throw, the palette must stay stable.
        const existing = __commands.find((c) => c.id === id)
        if (existing && existing.run === spec.run) return existing.unregister
        console.warn('[dsh-devkit] duplicate command id ignored: ' + id)
        return existing ? existing.unregister : () => {}
      }
      const record = {
        id,
        title,
        titleZh: String(spec.titleZh || title),
        titleEn: String(spec.titleEn || title),
        shortcut: spec.shortcut ? String(spec.shortcut) : null,
        keywords: Array.isArray(spec.keywords) ? spec.keywords.map(String) : [],
        foreign: !builtinTitlesZh[id],
        run: spec.run,
      }
      __commands.push(record)
      __commandIds.add(id)
      record.unregister = function unregister() {
        __commands = __commands.filter((c) => c !== record)
        __commandIds.delete(id)
        notifyRegistry()
      }
      notifyRegistry()
      return record.unregister
    }

    function commandTitleZh(cmd) {
      return builtinTitlesZh[cmd.id] || cmd.titleZh || cmd.title
    }

    // --- overlay open/close plumbing ----------------------------------------------
    // The React overlay component owns mode state; module-level helpers talk to
    // it through window events plus these refs so keyboard handling stays
    // independent of the React lifecycle.

    var __overlayOpen = false

    function openOverlay(mode) {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { mode } }))
    }

    // --- built-in command runs ------------------------------------------------------

    async function runNewSession() {
      const svc = __sessionsSvc
      if (svc) {
        for (const name of ['create', 'new', 'createSession', 'newSession']) {
          if (typeof svc[name] === 'function') {
            try {
              const r = svc[name]()
              refreshSessionsList()
              toast(__t('toast.newOk'), { kind: 'ok' })
              if (r && r.then) r.then((s) => { if (s && s.id) openSession(s.id) }).catch(() => {})
              return
            } catch { /* try the next candidate name */ }
          }
        }
      }
      toast(__t('toast.newUnsupported'), { kind: 'warn' })
    }

    // Destructive path, reached only through the confirm overlay
    // (devkit.session.delete opens mode 'confirmDelete' first).
    async function deleteCurrentSession() {
      const sessionId = currentSessionId()
      if (!sessionId) { toast(__t('toast.noSession'), { kind: 'warn' }); return }
      try {
        const res = await fetch('/__chameleon/session/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status))
        toast(__t('toast.deleteOk'), { kind: 'ok' })
        refreshSessionsList().then(() => {
          const snap = sessionsSnapshot()
          const next = snap && snap.ids ? snap.ids.find((x) => x !== sessionId) : null
          if (next) openSession(next)
        }).catch(() => {})
      } catch (e) {
        toast(__t('toast.deleteFail') + (e && e.message ? e.message : e), { kind: 'error' })
      }
    }

    async function runExportMarkdown() {
      const sessionId = currentSessionId()
      if (!sessionId) { toast(__t('toast.noSession'), { kind: 'warn' }); return }
      toast(__t('toast.exporting'), { kind: 'info' })
      try {
        const res = await fetch('/api/message-ops/messages?sessionId=' + encodeURIComponent(sessionId))
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const data = await res.json()
        if (!data || !data.ok || !Array.isArray(data.messages)) throw new Error('bad payload')
        const lines = ['# DSH session ' + sessionId, '']
        for (const m of data.messages) {
          if (m.visible === false) continue
          lines.push('- **[' + m.role + ']** ' + String(m.snippet || '').replace(/[\\`*_{}\[\]|]/g, '\\$&'))
        }
        lines.push('')
        const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'dsh-session-' + sessionId + '.md'
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 4000)
        toast(__t('toast.exportOk'), { kind: 'ok' })
      } catch (e) {
        toast(__t('toast.exportFail') + ' (' + (e && e.message ? e.message : e) + ')', { kind: 'warn' })
      }
    }

    function runMessageOps() {
      const sessionId = currentSessionId()
      if (!sessionId) { toast(__t('toast.noSession'), { kind: 'warn' }); return }
      window.dispatchEvent(new CustomEvent('dsh-message-ops:open', { detail: { sessionId } }))
    }

    // Dead-command guard (pm-a P0): websearch side is adding an
    // 'dsh-websearch:open-settings:ack' listener + a
    // window.__dshWebsearchSettingsReady readiness flag. We prefer the flag;
    // without it we still dispatch but verify an ack within 300ms and warn
    // when nobody answered, so the command never silently does nothing.
    function runWebsearchSettings() {
      let acked = false
      const onAck = () => { acked = true }
      window.addEventListener('dsh-websearch:open-settings:ack', onAck, { once: true })
      window.dispatchEvent(new CustomEvent('dsh-websearch:open-settings'))
      if (window.__dshWebsearchSettingsReady === true) {
        toast(__t('toast.websearch'), { kind: 'info' })
        return
      }
      setTimeout(() => {
        window.removeEventListener('dsh-websearch:open-settings:ack', onAck)
        if (!acked) toast(__t('toast.websearchUnavailable'), { kind: 'warn' })
      }, 300)
    }

    async function runCopySessionId() {
      const sessionId = currentSessionId()
      if (!sessionId) { toast(__t('toast.noSession'), { kind: 'warn' }); return }
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(sessionId)
        } else {
          // Fallback for non-secure contexts: hidden textarea + execCommand.
          const ta = document.createElement('textarea')
          ta.value = sessionId
          ta.style.cssText = 'position:fixed;opacity:0'
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          ta.remove()
        }
        toast(__t('toast.copied'), { kind: 'ok' })
      } catch (e) {
        toast(__t('toast.copyFail') + (e && e.message ? e.message : e), { kind: 'error' })
      }
    }

    // Probe-gated registrations (fail-soft): a command only appears when the
    // plugin it depends on answers its health/route probe. 协作矩阵见 README。
    // Titles come from this static map, NOT __t(): registration happens in an
    // async probe callback where the locale service may not be adopted yet —
    // a frozen __t() string would render single-language forever.
    const gatedTitles = {
      'devkit.searchHistory': { zh: '搜索会话历史…', en: 'Search session history…' },
      'devkit.searchPanel': { zh: '打开会话搜索面板…', en: 'Open session search panel…' },
      'devkit.lazyview': { zh: '打开 lazy-view 面板…', en: 'Open lazy-view panel…' },
    }

    function registerProbeGatedCommands() {
      // dsh-session-search (roadmap W2): full-text search lives in the devkit
      // '#' palette mode; its own panel page is a deep link (v0.1.0 contract).
      __probeCache.probe('/api/session-search/health').then((ok) => {
        if (!ok) return
        registerCommand({
          id: 'devkit.searchHistory',
          title: gatedTitles['devkit.searchHistory'].zh,
          titleZh: gatedTitles['devkit.searchHistory'].zh,
          titleEn: gatedTitles['devkit.searchHistory'].en,
          keywords: ['搜索', '历史', '全文', 'search', 'history'],
          run: () => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { mode: 'palette', preset: '#' } })),
        })
        registerCommand({
          id: 'devkit.searchPanel',
          title: gatedTitles['devkit.searchPanel'].zh,
          titleZh: gatedTitles['devkit.searchPanel'].zh,
          titleEn: gatedTitles['devkit.searchPanel'].en,
          keywords: ['搜索', '面板', '全文', 'search', 'panel'],
          run: () => { try { window.open('/api/session-search/panel', '_blank') } catch { window.location.assign('/api/session-search/panel') } },
        })
        notifyRegistry()
      })
      // session-lazy-view: /lazyview GET-only route (pm-a P0 discoverability).
      __probeCache.probe('/lazyview').then((ok) => {
        if (!ok) return
        registerCommand({
          id: 'devkit.lazyview',
          title: gatedTitles['devkit.lazyview'].zh,
          titleZh: gatedTitles['devkit.lazyview'].zh,
          titleEn: gatedTitles['devkit.lazyview'].en,
          keywords: ['lazy', 'view', 'timeline', '时间线', '查看器'],
          run: () => { try { window.open('/lazyview', '_blank') } catch { window.location.assign('/lazyview') } },
        })
        notifyRegistry()
      })
    }

    function registerBuiltinCommands() {
      const defs = [
        { id: 'devkit.session.switch', run: () => openOverlay('sessions'), keywords: ['会话', '切换', 'session', 'switch'] },
        { id: 'devkit.session.new', run: runNewSession, keywords: ['会话', '新建', 'new', 'session'] },
        { id: 'devkit.session.delete', run: () => openOverlay('confirmDelete'), keywords: ['会话', '删除', 'delete', 'session'] },
        { id: 'devkit.session.exportMarkdown', run: runExportMarkdown, keywords: ['导出', 'markdown', '会话', 'export'] },
        { id: 'devkit.messageOps', run: runMessageOps, keywords: ['消息', '回滚', '分支', 'message', 'ops'] },
        { id: 'devkit.websearch.settings', run: runWebsearchSettings, keywords: ['websearch', '设置', '搜索', 'settings'] },
        { id: 'devkit.session.copyId', run: runCopySessionId, keywords: ['复制', '会话', 'id', 'copy'] },
        { id: 'devkit.devinfo', run: () => openOverlay('devinfo'), keywords: ['开发者', '信息', 'dev', 'info', '版本'] },
        { id: 'devkit.shortcuts', run: () => openOverlay('shortcuts'), shortcut: 'Ctrl+K Ctrl+S', keywords: ['快捷键', '键位', 'shortcuts', 'keys'] },
      ]
      for (const d of defs) {
        registerCommand({ id: d.id, title: builtinTitlesZh[d.id], shortcut: d.shortcut || null, keywords: d.keywords, run: d.run })
      }
    }

    // --- public API -------------------------------------------------------------------

    const api = {
      version: VERSION,
      registerCommand,
      toast,
      openPalette: () => openOverlay('palette'),
      openSessions: () => openOverlay('sessions'),
      openShortcuts: () => openOverlay('shortcuts'),
      openDevInfo: () => openOverlay('devinfo'),
      listCommands: () => __commands.map((c) => ({ id: c.id, title: c.title, shortcut: c.shortcut, foreign: c.foreign })),
    }
    try { window.__dshDevkit = api } catch { /* non-browser guard */ }

    // --- keyboard layer (capture phase) -------------------------------------------------

    const chord = new ChordResolver()

    function installKeyboard() {
      if (window.__dshDevkitKeysInstalled) return
      window.__dshDevkitKeysInstalled = true
      window.addEventListener('keydown', (e) => {
        // Esc is owned by the overlay component itself (it must also work when
        // focus sits inside the palette input), so the global layer skips it.
        if (e.key === 'Escape') return
        // Devkit overlays: the component handles navigation keys; chords stay
        // enabled only for the armed Ctrl+S sheet, everything else passes.
        const mod = e.ctrlKey || e.metaKey
        if (!mod) return
        if (isTextInputTarget(e.target) && !__overlayOpen) return
        const res = chord.feed({ ctrlKey: mod, shiftKey: e.shiftKey, key: e.key }, Date.now())
        if (res.action) {
          e.preventDefault()
          e.stopPropagation()
          openOverlay(res.action === 'shortcuts' ? 'shortcuts' : 'palette')
        }
      }, true)
    }

    // --- styles ---------------------------------------------------------------------

    const backdropStyle = {
      position: 'fixed', inset: 0, zIndex: 2147482000,
      // fe-ui D3: solid scrim instead of a second backdrop-filter — two
      // fullscreen blur layers cost a frame-drop on low-end Android; the
      // (small) panel keeps its blur.
      background: 'rgba(0,0,0,.45)',
    }

    const panelStyle = {
      position: 'fixed', left: '50%', top: '16vh', transform: 'translateX(-50%)',
      width: 'min(640px, 92vw)', maxHeight: '56vh',
      display: 'flex', flexDirection: 'column',
      borderRadius: 12, overflow: 'hidden',
      border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))',
      background: 'var(--dsw-alias-surface-primary, rgba(28,28,30,.96))',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      boxShadow: '0 24px 64px rgba(0,0,0,.4)',
      color: 'var(--dsw-alias-label-primary, inherit)',
    }

    const inputStyle = {
      width: '100%', boxSizing: 'border-box', padding: '14px 16px',
      border: 'none', outline: 'none', fontSize: 15, lineHeight: '22px',
      background: 'transparent', color: 'inherit',
    }

    const listStyle = { overflowY: 'auto', borderTop: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.2))' }

    const rowStyle = {
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 16px', fontSize: 13, lineHeight: '20px', cursor: 'pointer',
    }

    const kbdStyle = {
      marginLeft: 'auto', flex: 'none', fontSize: 11, lineHeight: '16px',
      padding: '1px 6px', borderRadius: 5,
      border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.35))',
      color: 'var(--dsw-alias-label-secondary, #8a8a8e)',
    }

    const footerStyle = {
      padding: '8px 16px', fontSize: 11, lineHeight: '16px', flex: 'none',
      borderTop: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.2))',
      color: 'var(--dsw-alias-label-tertiary, #8a8a8e)',
    }

    const infoRowStyle = {
      display: 'flex', gap: 12, padding: '7px 16px',
      fontSize: 13, lineHeight: '20px',
    }

    const infoKeyStyle = {
      flex: 'none', width: 110,
      color: 'var(--dsw-alias-label-secondary, #8a8a8e)',
    }

    const infoValStyle = { wordBreak: 'break-all', userSelect: 'text' }

    // --- overlay component -------------------------------------------------------------

    function DevkitOverlay() {
      const t = __t
      useLocaleRevision()
      const [mode, setMode] = useState(null) // null | palette | sessions | shortcuts | devinfo
      const [query, setQuery] = useState('')
      const [selected, setSelected] = useState(0)
      const [registryRev, setRegistryRev] = useState(0)
      const inputRef = useRef(null)
      const confirmBtnRef = useRef(null)
      const cancelBtnRef = useRef(null)
      const listRef = useRef(null)

      useEffect(() => {
        const onRegistry = () => setRegistryRev((v) => v + 1)
        __registryListeners.push(onRegistry)
        return () => {
          __registryListeners = __registryListeners.filter((fn) => fn !== onRegistry)
        }
      }, [])

      const prevFocusRef = useRef(null)
      const [busy, setBusy] = useState(false)

      useEffect(() => {
        const onOpen = (e) => {
          const m = e && e.detail && e.detail.mode ? e.detail.mode : 'palette'
          // Record the focus origin so close() can restore it (fe-ui D1).
          try { prevFocusRef.current = document.activeElement } catch { /* no DOM */ }
          setMode(m)
          setQuery(e.detail && e.detail.preset ? String(e.detail.preset) : '')
          setSelected(0)
          setBusy(false)
        }
        window.addEventListener(OPEN_EVENT, onOpen)
        return () => window.removeEventListener(OPEN_EVENT, onOpen)
      }, [])

      useEffect(() => {
        __overlayOpen = mode !== null
        if (mode && inputRef.current) {
          try { inputRef.current.focus() } catch { /* best effort */ }
        } else if (mode === 'confirmDelete' && confirmBtnRef.current) {
          // Focus lands on the destructive button so the trap has an anchor.
          try { confirmBtnRef.current.focus() } catch { /* best effort */ }
        }
        return () => { __overlayOpen = false }
      }, [mode])

      // fe-ui D1: restoring focus on close matters as much as trapping it —
      // without this the keyboard user lands on <body> after Esc.
      const close = useCallback(() => {
        setMode(null)
        setBusy(false)
        const pf = prevFocusRef.current
        prevFocusRef.current = null
        if (pf && typeof pf.focus === 'function') {
          try { pf.focus() } catch { /* element may be gone */ }
        }
      }, [])

      useEffect(() => {
        if (mode === null) return undefined
        const onKey = (e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            close()
            return
          }
          // fe-ui D1 focus trap. Palette modes have a single focusable
          // element (the input), so Tab is simply bounced back. The confirm
          // dialog has two buttons — wrap focus between them (first/last
          // element cycle) instead of dead-ending on one.
          if (e.key === 'Tab') {
            e.preventDefault()
            e.stopPropagation()
            if (mode === 'confirmDelete' && cancelBtnRef.current && confirmBtnRef.current) {
              const next = document.activeElement === confirmBtnRef.current
                ? cancelBtnRef.current
                : confirmBtnRef.current
              try { next.focus() } catch { /* best effort */ }
            }
          }
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
      }, [mode, close])

      // --- palette internals (mode prefixes, MRU, session search) ---------------
      // VS Code paradigm (roadmap W1): first char routes the palette —
      //   '>' commands · '#' session search · '@' plugin groups · none = mixed
      const isPalette = mode === 'palette'
      const pal = parsePaletteQuery(query)
      const palMode = isPalette ? pal.mode : null // commands | sessions | plugins | mixed
      const isSessions = mode === 'sessions'

      // MRU (recently-run commands), persisted in localStorage.
      const [mru, setMru] = useState(() => {
        try { return JSON.parse(window.localStorage.getItem(MRU_KEY) || '[]') } catch { return [] }
      })
      const recordMru = useCallback((id) => {
        setMru((prev) => {
          const next = pushMru(prev, id)
          try { window.localStorage.setItem(MRU_KEY, JSON.stringify(next)) } catch { /* storage may be unavailable */ }
          return next
        })
      }, [])

      const sessions = useMemo(() => (isSessions || isPalette ? listRecentSessions() : []), [isSessions, isPalette, mode, registryRev])

      // Local title match over the sessions store (also the '#' fallback when
      // dsh-session-search is absent).
      const localSessions = useMemo(() => {
        if (!isSessions && !(isPalette && (palMode === 'sessions' || palMode === 'mixed'))) return []
        return matchCommands(sessions.map((s) => ({ id: s.id, title: s.title, keywords: [] })), isSessions ? query : pal.rest, 'zh')
          .map((m) => sessions.find((s) => s.id === m.id))
      }, [isSessions, isPalette, palMode, pal.rest, sessions, query])

      // Full-text results via dsh-session-search (probe-gated, debounced).
      const [ftResults, setFtResults] = useState(null) // null = not using / unavailable
      useEffect(() => {
        if (!isPalette || palMode !== 'sessions' || pal.rest.trim().length < 2) {
          setFtResults(null)
          return undefined
        }
        let dead = false
        const timer = setTimeout(() => {
          __probeCache.probe('/api/session-search/health').then((ok) => {
            if (!ok || dead) return
            fetch('/api/session-search/search?q=' + encodeURIComponent(pal.rest.trim()))
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => {
                if (dead) return
                setFtResults(normalizeSearchResults(data))
              })
              .catch(() => { if (!dead) setFtResults(null) })
          })
        }, 250)
        return () => { dead = true; clearTimeout(timer) }
      }, [isPalette, palMode, pal.rest])

      const commands = useMemo(() => {
        if (mode === null || isSessions) return []
        if (isPalette && palMode === 'sessions') return []
        const matched = matchCommands(__commands, isPalette ? pal.rest : query, localeFallbackLang())
        if (isPalette && palMode === 'plugins') {
          // '@': group by registration source (id prefix), stable within group.
          return sortCommandsBySource(matched)
        }
        // commands + mixed: MRU first.
        return applyMruRank(matched, mru)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [mode, isSessions, isPalette, palMode, pal.rest, query, registryRev, mru])

      // Unified selectable items. Command items keep {kind:'command'}; session
      // items {kind:'session'} (local store or full-text hit).
      const items = useMemo(() => {
        if (mode === null) return []
        if (isSessions) return localSessions.map((s) => ({ kind: 'session', ...s }))
        if (!isPalette) return commands.map((c) => ({ kind: 'command', ...c }))
        if (palMode === 'sessions') {
          if (ftResults && ftResults.length) return ftResults.map((r) => ({ kind: 'ft', ...r }))
          return localSessions.map((s) => ({ kind: 'session', ...s }))
        }
        if (palMode === 'mixed') {
          return [
            ...commands.map((c) => ({ kind: 'command', ...c })),
            ...localSessions.map((s) => ({ kind: 'session', ...s })),
          ]
        }
        return commands.map((c) => ({ kind: 'command', ...c }))
      }, [mode, isSessions, isPalette, palMode, commands, localSessions, ftResults])

      useEffect(() => { if (selected >= items.length) setSelected(0) }, [items.length]) // eslint-disable-line react-hooks/exhaustive-deps

      useEffect(() => {
        if (!listRef.current) return
        const node = listRef.current.querySelector('[data-selected="1"]')
        if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' })
      }, [selected, items.length])

      const commit = useCallback((item) => {
        if (!item) return
        if (item.kind === 'session' || item.kind === 'ft') {
          close()
          if (!openSession(item.id)) toast(__t('toast.openFail'), { kind: 'warn' })
          if (item.kind === 'ft' && item.seq != null) {
            toast('#' + item.seq + (item.snippet ? ' · ' + item.snippet : ''), { kind: 'info' })
          }
          return
        }
        close()
        recordMru(item.id)
        const fail = (e) => toast('[' + item.id + '] ' + String(e && e.message ? e.message : e), { kind: 'error' })
        try { Promise.resolve(item.run()).catch(fail) }
        catch (e) { fail(e) }
      }, [close, recordMru])

      const onInputKeyDown = useCallback((e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelected((s) => (items.length ? (s + 1) % items.length : 0))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelected((s) => (items.length ? (s - 1 + items.length) % items.length : 0))
        } else if (e.key === 'Enter') {
          e.preventDefault()
          commit(items[selected])
        }
      }, [items, selected, commit])

      if (!mode) return null

      const title = isSessions ? t('sessions.title')
        : mode === 'shortcuts' ? t('shortcuts.title')
        : mode === 'devinfo' ? t('devinfo.title')
        : mode === 'confirmDelete' ? t('confirmDelete.title')
        : t('header.title')

      let body = null
      if (mode === 'shortcuts') {
        body = React.createElement('div', { style: listStyle, key: 'shortcuts' }, [
          React.createElement('div', { key: 'h1', style: { ...infoRowStyle, color: 'var(--dsw-alias-label-tertiary,#8a8a8e)', fontSize: 11, paddingTop: 12 } }, t('shortcuts.builtin')),
          SHORTCUT_ROWS().map((r, i) => React.createElement('div', { key: 'sc' + i, style: rowStyle }, [
            React.createElement('span', { key: 'k', style: kbdStyle }, r.keys),
            React.createElement('span', { key: 'd' }, r.desc),
          ])),
          React.createElement('div', { key: 'h2', style: { ...infoRowStyle, color: 'var(--dsw-alias-label-tertiary,#8a8a8e)', fontSize: 11, paddingTop: 12 } }, t('shortcuts.commands')),
          __commands.filter((c) => c.shortcut).map((c, i) => React.createElement('div', { key: 'cmd' + i, style: rowStyle }, [
            React.createElement('span', { key: 't' }, c.foreign ? (c.titleZh || c.title) : commandTitleZh(c)),
            React.createElement('span', { key: 'k', style: kbdStyle }, c.shortcut),
          ])),
        ])
      } else if (mode === 'devinfo') {
        body = React.createElement(DevInfo, { key: 'devinfo', t, close })
      } else if (mode === 'confirmDelete') {
        // fe-ui review 修复 4：破坏性命令先过确认弹层（风险确认模式）。
        const snap = sessionsSnapshot()
        const cur = snap && snap.current ? snap.current : null
        const curInfo = snap && snap.byId && snap.byId[cur] ? (snap.byId[cur].title || cur) : cur
        body = React.createElement('div', { key: 'confirm', style: { ...listStyle, padding: '0 16px 16px' } }, [
          cur && snap && snap.byId && snap.byId[cur] && snap.byId[cur].running
            ? React.createElement('div', { key: 'warn', style: { color: 'var(--dsw-alias-state-warn-primary,#f5a524)', fontSize: 13, lineHeight: '20px', margin: '4px 0 8px' } }, t('confirmDelete.runningWarn'))
            : null,
          React.createElement('div', { key: 'd', style: { fontSize: 13, lineHeight: '20px' } }, t('confirmDelete.desc')),
          cur ? React.createElement('div', { key: 'id', style: { fontSize: 12, lineHeight: '18px', margin: '8px 0 14px', color: 'var(--dsw-alias-label-secondary,#8a8a8e)', wordBreak: 'break-all' } }, curInfo + ' · ' + cur) : null,
          React.createElement('div', { key: 'btns', style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } }, [
            React.createElement('button', {
              key: 'c', type: 'button', ref: cancelBtnRef, disabled: busy, onClick: close,
              style: { padding: '8px 18px', minHeight: 36, borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))', background: 'transparent', color: 'inherit', fontSize: 13, cursor: busy ? 'default' : 'pointer' },
            }, t('confirmDelete.cancel')),
            React.createElement('button', {
              key: 'ok', type: 'button', ref: confirmBtnRef, disabled: busy || !cur,
              onClick: () => {
                setBusy(true)
                Promise.resolve(deleteCurrentSession()).then(() => { close() })
              },
              style: { padding: '8px 18px', minHeight: 36, borderRadius: 8, border: '1px solid var(--dsw-alias-state-error-primary, #e5484d)', background: 'var(--dsw-alias-state-error-primary, #e5484d)', color: '#fff', fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy || !cur ? 0.6 : 1 },
            }, busy ? t('confirmDelete.busy') : t('confirmDelete.confirm')),
          ]),
        ])
      } else {
        // palette (+ prefix modes) and sessions share the input/list layout
        const placeholder = isSessions ? t('palette.sessionsPlaceholder')
          : palMode === 'sessions' ? t('palette.sessionsSearchPlaceholder')
          : t('palette.placeholder')
        const emptyLabel = isSessions ? t('sessions.empty')
          : palMode === 'sessions' && ftResults === null ? t('sessions.localOnly')
          : t('palette.empty')
        body = [
          React.createElement('input', {
            key: 'input',
            ref: inputRef,
            style: inputStyle,
            value: query,
            placeholder,
            onChange: (e) => { setQuery(e.target.value); setSelected(0) },
            onKeyDown: onInputKeyDown,
            'aria-label': title,
            // fe-ui D2: combobox wiring so screen readers announce
            // "option N, selected" while typing.
            role: 'combobox',
            'aria-expanded': 'true',
            'aria-controls': 'devkit-list',
            'aria-autocomplete': 'list',
            'aria-activedescendant': items.length ? 'devkit-opt-' + selected : undefined,
          }),
          React.createElement('div', { key: 'list', ref: listRef, id: 'devkit-list', style: listStyle, role: 'listbox' },
            items.length === 0
              ? React.createElement('div', { style: { ...rowStyle, color: 'var(--dsw-alias-label-secondary,#8a8a8e)', cursor: 'default' } }, [
                  React.createElement('span', { key: 'e' }, emptyLabel),
                ])
              : items.map((item, i) => {
                  const isCmd = item.kind === 'command'
                  const label = isCmd ? (item.foreign ? (item.titleZh || item.title) : commandTitleZh(item)) : item.title
                  let badge = null
                  if (item.kind === 'ft') {
                    badge = t('badge.fullText')
                  } else if (item.kind === 'session') {
                    badge = item.id === currentSessionId() ? t('sessions.current') : (item.running ? t('sessions.running') : null)
                  } else if (!isCmd) {
                    badge = null
                  } else if (mru.includes(item.id)) {
                    badge = t('badge.recent')
                  } else if (item.foreign) {
                    badge = 'plugin'
                  }
                  if (palMode === 'plugins' && isCmd) badge = pluginSource(item.id)
                  return React.createElement('div', {
                    key: (item.id || i) + ':' + i,
                    style: {
                      ...rowStyle,
                      background: i === selected ? 'var(--dsw-alias-interactive-bg-selected, rgba(128,128,128,.18))' : 'transparent',
                    },
                    'data-selected': i === selected ? '1' : '0',
                    id: 'devkit-opt-' + i, // fe-ui D2: combobox activedescendant target
                    role: 'option',
                    'aria-selected': i === selected ? 'true' : 'false',
                    onMouseEnter: () => setSelected(i),
                    onClick: () => commit(item),
                  }, [
                    React.createElement('span', { key: 'l', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, label),
                    badge ? React.createElement('span', { key: 'b', style: { flex: 'none', fontSize: 11, color: 'var(--dsw-alias-label-tertiary,#8a8a8e)' } }, badge) : null,
                    isCmd && item.shortcut ? React.createElement('span', { key: 'k', style: kbdStyle }, item.shortcut) : null,
                  ])
                })),
          mode === 'palette' ? React.createElement('div', { key: 'footer', style: footerStyle }, t('palette.hint')) : null,
        ]
      }

      return React.createElement('div', {
        style: backdropStyle,
        onMouseDown: (e) => { if (e.target === e.currentTarget) close() },
      },
      React.createElement('div', { style: panelStyle, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
        React.createElement('div', {
          key: 'title',
          style: {
            flex: 'none', padding: '10px 16px 6px', fontSize: 12, lineHeight: '18px',
            color: 'var(--dsw-alias-label-tertiary, #8a8a8e)',
          },
        }, title),
        body,
      ]))
    }

    function SHORTCUT_ROWS() {
      return [
        { keys: 'Ctrl+K', desc: '打开命令面板 / Open command palette' },
        { keys: 'Ctrl+Shift+P', desc: '打开命令面板 / Open command palette' },
        { keys: 'Ctrl+K Ctrl+S', desc: '快捷键速查表 / Shortcut cheat sheet' },
        { keys: 'Esc', desc: '关闭 devkit 弹层 / Close devkit overlay' },
        { keys: '↑ / ↓', desc: '面板内移动选择 / Move selection' },
        { keys: 'Enter', desc: '执行选中项 / Run selection' },
      ]
    }

    // --- dev info -----------------------------------------------------------------

    function DevInfo({ t, close }) {
      const [host, setHost] = useState(undefined) // undefined = loading, null = failed
      useEffect(() => {
        let dead = false
        fetch('/api/pair/status')
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (!dead) setHost(d && typeof d === 'object' ? d : null) })
          .catch(() => { if (!dead) setHost(null) })
        return () => { dead = true }
      }, [])
      const snap = sessionsSnapshot()
      const sources = []
      for (const c of __commands) {
        const prefix = String(c.id || '').split('.')[0]
        if (!sources.includes(prefix)) sources.push(prefix)
      }
      const rows = [
        [t('devinfo.plugin'), PLUGIN_ID + ' ' + VERSION],
        [t('devinfo.dsh'), host ? String(host.version || host.dshVersion || host.dsh || '—') : (host === null ? '—' : '…')],
        [t('devinfo.profile'), host ? String(host.profile || host.name || '—') : '—'],
        [t('devinfo.session'), snap && snap.current ? snap.current : '—'],
        [t('devinfo.sources'), sources.join(', ')],
      ]
      if (host === null) rows.push([t('devinfo.ua'), (navigator && navigator.userAgent) || '—'])
      return React.createElement('div', { style: listStyle }, [
        host === null ? React.createElement('div', { key: 'fail', style: { ...infoRowStyle, color: 'var(--dsw-alias-state-warn-primary,#f5a524)', fontSize: 12 } }, t('devinfo.hostFail')) : null,
        rows.map(([k, v], i) => React.createElement('div', { key: 'r' + i, style: infoRowStyle }, [
          React.createElement('span', { key: 'k', style: infoKeyStyle }, k),
          React.createElement('span', { key: 'v', style: infoValStyle }, v),
        ])),
      ])
    }

    // --- header launch button ------------------------------------------------------

    const headerBtnStyle = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, padding: 0, border: 'none', borderRadius: 6,
      background: 'transparent',
      color: 'var(--dsw-alias-label-tertiary, #8a8a8e)', cursor: 'pointer', flex: 'none',
    }

    function PaletteButton() {
      const t = __t
      useLocaleRevision()
      return React.createElement('button', {
        type: 'button',
        title: t('header.title'),
        'aria-label': t('header.title'),
        style: headerBtnStyle,
        onClick: () => openOverlay('palette'),
      },
      React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        React.createElement('path', {
          d: 'M6 2.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM1.5 6a4.5 4.5 0 1 1 8.03 2.78l4.34 4.35-.7.7-4.35-4.34A4.5 4.5 0 0 1 1.5 6z',
          fill: 'currentColor',
        })))
    }

    // --- apply ----------------------------------------------------------------------

    function adoptLocale(locale, ctx) {
      if (!locale) return
      __locale = locale
      try {
        if (typeof locale.register === 'function') {
          ctx.effect(() => locale.register(NS, { zh: zhDict, en: enDict }))
        }
      } catch { /* namespace already registered: keep existing copy */ }
    }

    function apply(ctx) {
      // Sessions service powers switch/new/delete/export/devinfo. Grab it now;
      // deferred inject refreshes the handle when the service arrives later.
      __sessionsSvc = ctx.get('sessions')
      if (!__sessionsSvc) {
        ctx.inject(['sessions'], (sub) => { __sessionsSvc = sub.sessions })
      }
      __uiWorkspace = ctx.get('uiWorkspace')
      if (!__uiWorkspace) {
        ctx.inject(['uiWorkspace'], (sub) => { __uiWorkspace = sub.uiWorkspace })
      }
      adoptLocale(ctx.get('locale'), ctx)
      if (!__locale) {
        ctx.inject(['locale'], (sub) => { adoptLocale(sub.locale, ctx) })
      }

      registerBuiltinCommands()
      registerProbeGatedCommands()
      installKeyboard()

      ctx.slots.inject(OVERLAY_SLOT, () => ctx.slots.register({
        name: OVERLAY_SLOT,
        id: OVERLAY_ID,
        order: 90,
        ...(__locale ? { locale: NS } : {}),
      }, DevkitOverlay))

      ctx.slots.inject(HEADER_SLOT, () => ctx.slots.register({
        name: HEADER_SLOT,
        id: HEADER_ID,
        order: 40,
        ...(__locale ? { locale: NS } : {}),
      }, PaletteButton))
    }

    // The loader gates apply() until the declared services exist.
    return { apply, inject: ['slots'] }
  },
})
