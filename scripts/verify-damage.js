// 伤害飘字验证工具：通过 Chrome DevTools Protocol 直接读取渲染进程 DOM，
// 精确校验飘字的分级、错位、位置与存活，不依赖截图（截图会被桌面上的
// 其它窗口内容污染）。
//
// 用法：
//   1. 以远程调试端口启动：electron . --remote-debugging-port=9223
//   2. node scripts/verify-damage.js [port]
const http = require('node:http')
const fs = require('node:fs')

const DEBUG_PORT = Number(process.argv[2]) || 9223
const PET_PORT = 37189

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve(body))
      })
      .on('error', reject)
  })
}

function postEvent(payload) {
  const data = JSON.stringify(payload)
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PET_PORT, path: '/api/turn-event', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let b = ''
        res.on('data', (c) => (b += c))
        res.on('end', () => resolve(b))
      }
    )
    req.on('error', reject)
    req.end(data)
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    const errors = []
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve: r, reject: j } = pending.get(msg.id)
        pending.delete(msg.id)
        msg.error ? j(new Error(msg.error.message)) : r(msg.result)
      } else if (msg.method === 'Runtime.exceptionThrown') {
        errors.push('exception: ' + (msg.params.exceptionDetails.text || ''))
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const args = (msg.params.args || [])
          .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type))
          .join(' ')
        errors.push(`console.${msg.params.type}: ${args}`)
      }
    })
    ws.addEventListener('open', () => {
      const send = (method, params = {}) =>
        new Promise((res, rej) => {
          const mid = ++id
          pending.set(mid, { resolve: res, reject: rej })
          ws.send(JSON.stringify({ id: mid, method, params }))
        })
      resolve({ send, errors, close: () => ws.close() })
    })
    ws.addEventListener('error', (e) => reject(e))
  })
}

async function stress(send, evalJs, errors) {
  const counts = []
  const t0 = Date.now()
  // 30 笔事件、25ms 间隔 —— 远超 EMIT_GAP_MS 节流，用来验证排队合并
  for (let i = 1; i <= 30; i++) {
    await postEvent({ amount: 0.001 * i, turn: i, end: true })
    await sleep(25)
  }
  while (Date.now() - t0 < 3000) {
    counts.push(await evalJs(`document.querySelectorAll('.dshwv-dmg').length`))
    await sleep(150)
  }
  const combo = await evalJs(`document.getElementById('combo-badge').textContent`)
  const heap = await evalJs(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1`)
  const leftover = await evalJs(`document.querySelectorAll('.dshwv-dmg').length`)
  console.log('\n[stress] max simultaneous popups:', Math.max(...counts), '(cap = 6)')
  console.log('[stress] sample series:', counts.join(','))
  console.log('[stress] combo badge:', combo)
  console.log('[stress] renderer JS heap MB:', heap)
  console.log('[stress] leftover after drain (should be 0):', leftover)
  console.log('[stress] runtime exceptions:', errors.length ? errors : 'none')
  const overCap = Math.max(...counts) > 6
  console.log(overCap || leftover !== 0 ? '\nRESULT: FAIL' : '\nRESULT: PASS')
}

async function hpState(evalJs) {
  const s = await evalJs(`(() => {
    const f = document.getElementById('pill-fill')
    const c = document.getElementById('pill-chip')
    const p = document.getElementById('balance-pill')
    const r = p.getBoundingClientRect()
    return { width: f.style.width, cls: f.className, chip: c.textContent,
             amount: document.getElementById('pill-amount').textContent,
             visible: r.width > 0 && r.height > 0, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
             hint: document.getElementById('whale-hint').textContent }
  })()`)
  console.log(JSON.stringify(s))
  return s
}

async function probe(evalJs, errors) {
  const diag = await evalJs(`(() => ({
    audioKeys: Object.keys(window.AudioManager || {}),
    hasDamageScript: !!document.querySelector('script[src*="damage.js"]'),
    comboExists: !!document.getElementById('combo-badge'),
    imgExists: !!document.getElementById('whale-img'),
    clsTest: (() => { const i = document.getElementById('whale-img'); i.classList.add('dshwv-x'); const ok = i.classList.contains('dshwv-x'); i.classList.remove('dshwv-x'); return ok })(),
    dmgOn: window.DamagePulse ? window.DamagePulse.isEnabled() : 'n/a'
  }))()`)
  console.log('diag:', JSON.stringify(diag, null, 2))
  await evalJs(`(() => {
    if (!window.AudioManager.__wrapped) {
      const orig = window.AudioManager.playHit
      window.AudioManager.__hits = 0
      window.AudioManager.__wrapped = true
      window.AudioManager.playHit = function (k) { window.AudioManager.__hits++; return orig.call(this, k) }
    }
    return true
  })()`)
  // 第一笔会被 widget 的 lastCostAligned 对齐逻辑吞掉（避免启动回放），
  // 因此连发三笔：第 2、3 笔才是真正生效、能凑出 COMBO 的那两条。
  await postEvent({ amount: 0.02, turn: 1, end: true })
  await sleep(140)
  await postEvent({ amount: 0.03, turn: 2, end: true })
  await sleep(140)
  await postEvent({ amount: 0.04, turn: 3, end: true })
  const rows = []
  for (let i = 0; i < 16; i++) {
    const s = await evalJs(`(() => {
      const img = document.getElementById('whale-img')
      const cb = document.getElementById('combo-badge')
      return (img ? img.className : 'NO-IMG') + ' || combo=' + (cb ? cb.textContent + '/' + cb.className : 'none')
        + ' || popups=' + document.querySelectorAll('.dshwv-dmg').length
        + ' || audio=' + (window.AudioManager ? (window.AudioManager.__hits || 0) : 'x')
    })()`)
    rows.push(`+${String(i * 60).padStart(4)}ms  ${s}`)
    await sleep(60)
  }
  console.log(rows.join('\n'))
}

async function main() {
  const mode = process.argv[3] || 'verify'
  const wantSettings = process.argv.includes('--settings')
  const list = JSON.parse(await httpGet(`http://127.0.0.1:${DEBUG_PORT}/json`))
  const page = wantSettings
    ? list.find((t) => t.type === 'page' && /settings\.html/.test(t.url))
    : list.find((t) => t.type === 'page' && /index\.html/.test(t.url)) || list.find((t) => t.type === 'page')
  if (!page) {
    throw new Error(wantSettings ? 'settings window not open — 先打开设置中心' : 'renderer target not found')
  }
  console.log('target:', page.url.split('/').pop())

  const { send, errors, close } = await connect(page.webSocketDebuggerUrl)
  await send('Runtime.enable')

  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return r.result.value
  }

  console.log('DamagePulse loaded:', await evalJs('!!window.DamagePulse'))

  if (mode === 'stress') {
    await stress(send, evalJs, errors)
    close()
    return
  }

  if (mode === 'probe') {
    await probe(evalJs, errors)
    console.log('console/errors:', errors.length ? errors : 'none')
    close()
    return
  }

  if (mode === 'hp') {
    await hpState(evalJs)
    close()
    return
  }

  // 通用表达式求值：node scripts/verify-damage.js <port> eval "<js 表达式>"
  if (mode === 'eval') {
    const v = await evalJs(process.argv[4] || '1')
    console.log(JSON.stringify(v))
    close()
    return
  }

  // 血条水平拖拽测试：
  // node scripts/verify-damage.js 9223 drag <目标dx>   （用 CDP Input 模拟真实鼠标）
  if (mode === 'drag') {
    const targetDx = Number(process.argv[4]) || -80
    // Input.dispatchMouseEvent 用的是「视口坐标」（相对页面左上角），不是屏幕坐标
    const info = JSON.parse(
      await evalJs(`JSON.stringify((() => { const b = document.getElementById('balance-pill').getBoundingClientRect()
                    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) } })())`)
    )
    const sx = info.x
    const sy = info.y
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', buttons: 1, clickCount: 1 })
    await sleep(60)
    const started = await evalJs(
      "JSON.stringify({ dragging: document.getElementById('balance-pill').classList.contains('dshwv-pill-dragging'), label: document.getElementById('pill-dx-val').textContent })"
    )
    const steps = 10
    for (let i = 1; i <= steps; i++) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(sx + (targetDx * i) / steps),
        y: sy,
        button: 'left',
        buttons: 1,
      })
      await sleep(16)
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(sx + targetDx), y: sy, button: 'left', buttons: 0, clickCount: 1 })
    await sleep(500)
    const after = await evalJs(`(() => { const b = document.getElementById('balance-pill').getBoundingClientRect()
        const w = document.getElementById('whale-img').getBoundingClientRect()
        return JSON.stringify({ label: document.getElementById('pill-dx-val').textContent,
          cssVar: document.getElementById('whale-root').style.getPropertyValue('--dshw-pill-dx'),
          pillLeft: Math.round(b.left), pillRight: Math.round(b.right), winW: window.innerWidth,
          gap: Math.round(w.left - b.right), inWindow: b.left >= 0, dragging: document.getElementById('balance-pill').classList.contains('dshwv-pill-dragging') })
      })()`)
    console.log('dragged by', targetDx, '| after-press:', started, '->', after)
    close()
    return
  }

  // node scripts/verify-damage.js <port> shot ["<js 触发表达式>"] [延迟ms] [输出路径]
  if (mode === 'shot') {
    const expr = process.argv[4] || 'window.DamagePulse.emit({ amount: 0.4040, tokens: 6000, cache: 0 })'
    const delay = Number(process.argv[5]) || 220
    const out = process.argv[6] || 'tmp_media/cdp_shot.png'
    await send('Page.enable')
    await evalJs(expr)
    await sleep(delay)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
    const live = await evalJs("JSON.stringify([...document.querySelectorAll('.dshwv-dmg')].map(e => e.textContent))")
    console.log('saved', out, '| live popups at capture:', live)
    close()
    return
  }

  // 三笔小额（模拟一轮连续扣费）
  await postEvent({ amount: 0.0037, turn: 1, end: true })
  await sleep(140)
  await postEvent({ amount: 0.0041, turn: 2, end: true })
  await sleep(140)
  await postEvent({ amount: 0.0052, turn: 3, end: true })

  await sleep(300)
  const snap = () =>
    evalJs(`(() => [...document.querySelectorAll('.dshwv-dmg')].map(e => {
      const r = e.getBoundingClientRect()
      const cs = getComputedStyle(e)
      return { text: e.textContent, tier: e.className.replace('dshwv-dmg ', ''),
               dy0: e.style.getPropertyValue('--dy0'), dx: e.style.getPropertyValue('--dx'),
               top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width),
               color: cs.color, opacity: Number(cs.opacity).toFixed(2) }
    }))()`)

  const s1 = await snap()
  console.log('\n[t=+300ms] live popups:', s1.length)
  s1.forEach((d, i) => console.log(`  ${i}: ${d.text} | ${d.tier} | dy0=${d.dy0} dx=${d.dx} | rect(top=${d.top},left=${d.left},w=${d.w}) | ${d.color} | op=${d.opacity}`))

  await sleep(250)
  const s2 = await snap()
  console.log('\n[t=+550ms] live popups:', s2.length)
  s2.forEach((d, i) => console.log(`  ${i}: ${d.text} | top=${d.top} op=${d.opacity}`))

  const combo = await evalJs(`(() => { const c = document.getElementById('combo-badge'); return { text: c.textContent, show: c.classList.contains('dshwv-combo-show') } })()`)
  console.log('\ncombo badge:', JSON.stringify(combo))

  // 越界检查：飘字必须完整落在窗口可视区内
  const overflow = await evalJs(`(() => [...document.querySelectorAll('.dshwv-dmg')].filter(e => {
      const r = e.getBoundingClientRect()
      return r.top < 0 || r.left < 0 || r.right > innerWidth || r.bottom > innerHeight
    }).map(e => e.textContent))()`)
  console.log('clipped popups (should be []):', JSON.stringify(overflow))

  // 暴击分级
  await sleep(1400)
  await postEvent({ amount: 0.35, turn: 4, end: true })
  await sleep(260)
  const crit = await snap()
  console.log('\ncrit popup:', JSON.stringify(crit, null, 2))

  // 受击反馈 / 打击音 / 常驻血条状态
  const fx = await evalJs(`(() => {
    const i = document.getElementById('whale-img')
    const f = document.getElementById('pill-fill')
    const c = document.getElementById('pill-chip')
    const p = document.getElementById('balance-pill')
    const pr = p.getBoundingClientRect()
    return {
      hitClass: i.className,
      pillWidth: f.style.width,
      pillState: f.className,
      pillAmount: document.getElementById('pill-amount').textContent,
      pillRect: { x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height) },
      chip: c.textContent + ' | ' + c.className,
      bubbleAmount: document.getElementById('whale-amount').textContent,
      playHit: typeof window.AudioManager.playHit
    }
  })()`)
  console.log('hit/pill state:', JSON.stringify(fx, null, 2))

  // 缓存未命中 → 暴击（走 usage 聚合路径）
  await sleep(1400)
  await postEvent({ model: 'deepseek-chat', turn: 5, usage: { inputTokens: 2000, cacheReadTokens: 0, outputTokens: 900 } })
  await postEvent({ end: true, turn: 5 })
  await sleep(300)
  console.log('cache-miss popup:', JSON.stringify(await snap()))

  // DOM 泄漏检查：等待动画结束
  await sleep(1600)
  const leftover = await evalJs(`document.querySelectorAll('.dshwv-dmg').length`)
  console.log('\nleftover popups after animations end (should be 0):', leftover)
  console.log('runtime exceptions:', errors.length ? errors : 'none')

  close()
}

main().catch((e) => {
  console.error('VERIFY FAILED:', e.message)
  process.exit(1)
})
