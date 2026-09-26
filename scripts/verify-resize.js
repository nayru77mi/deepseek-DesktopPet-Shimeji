// 血条「调整时窗口闪烁」验证工具 —— BUG-017 的直接证据。
//
// 透明窗口每次 setBounds 都会让 Windows DWM 重建合成表面并闪一下（BUG-001 同源），
// 所以本工具在页面里持续采样两路信号：
//   1. requestAnimationFrame 里的 innerWidth / innerHeight（视口尺寸）
//   2. 每 25ms 轮询 getWindowBounds()（窗口真实矩形）
// 只统计**尺寸**变化（拖动过程中的 x/y 移动不算闪烁源），然后模拟
// 「拖血条长度滑条」与「按住血条左右拖动」两个动作，看会不会产生 resize。
//
// 用法：
//   1. 以远程调试端口启动：electron . --remote-debugging-port=9223
//   2. node scripts/verify-resize.js [port]
//
// 预期（窗口已按血条最坏情况静态留宽）：
//   [A] 调长度 → 0 次 resize
//   [B] 拖位置 → 0 次 resize
const http = require('node:http')

const DEBUG_PORT = Number(process.argv[2]) || 9223
const PET_PORT = 37189
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let b = ''
      res.on('data', (c) => (b += c))
      res.on('end', () => resolve(b))
    }).on('error', reject)
  })
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve: r, reject: j } = pending.get(msg.id)
        pending.delete(msg.id)
        msg.error ? j(new Error(msg.error.message)) : r(msg.result)
      }
    })
    ws.addEventListener('open', () => {
      const send = (method, params = {}) =>
        new Promise((res, rej) => {
          const mid = ++id
          pending.set(mid, { resolve: res, reject: rej })
          ws.send(JSON.stringify({ id: mid, method, params }))
        })
      resolve({ send, close: () => ws.close() })
    })
    ws.addEventListener('error', (e) => reject(e))
  })
}

const START_SAMPLER = `(() => {
  if (window.__smpStop) window.__smpStop()
  const log = []
  let last = null
  let stopped = false
  const t0 = performance.now()
  const raf = () => {
    if (innerWidth !== (last && last.iw) || innerHeight !== (last && last.ih)) {
      log.push({ t: Math.round(performance.now() - t0), kind: 'viewport', iw: innerWidth, ih: innerHeight })
      last = { iw: innerWidth, ih: innerHeight }
    }
    if (!stopped) requestAnimationFrame(raf)
  }
  requestAnimationFrame(raf)
  const poll = setInterval(async () => {
    try {
      const b = await window.electronAPI.getWindowBounds()
      const p = window.__lastB
      if (p && (p.width !== b.width || p.height !== b.height)) {
        log.push({ t: Math.round(performance.now() - t0), kind: 'resize', from: [p.width, p.height], to: [b.width, b.height] })
      }
      window.__lastB = b
    } catch (e) {}
  }, 25)
  window.__smpStop = () => { stopped = true; clearInterval(poll) }
  window.__smp = log
  return 'sampling'
})()`

const READ_SAMPLER = `JSON.stringify(window.__smp.slice())`
// 注意：闭包里的 log 数组不能被整体替换，只能原地清空，否则探针会写到旧数组上
const RESET_SAMPLER = `(() => { window.__smp.length = 0; return true })()`

async function main() {
  const list = JSON.parse(await httpGet(`http://127.0.0.1:${DEBUG_PORT}/json`))
  const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url)) ||
    list.find((t) => t.type === 'page')
  if (!page) throw new Error('pet page not found —— 先以 --remote-debugging-port 启动桌宠')

  const { send, close } = await connect(page.webSocketDebuggerUrl)
  await send('Runtime.enable')

  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text)
    }
    return r.result.value
  }
  const getBounds = () => evalJs('window.electronAPI.getWindowBounds()')
  const readPillDx = async () =>
    JSON.parse(await evalJs(`JSON.stringify((() => { const r = document.getElementById('whale-root')
        const c = parseFloat(r.style.getPropertyValue('--dshw-pill-dx')) || 0
        return r.classList.contains('dshwv-left') ? -c : c })())`))

  // 用 CDP 注入鼠标事件拖血条：窗口在拖动过程中**不该移动**，
  // 所以视口坐标是可靠的（鲸鱼拖动会移动窗口，那必须用真实鼠标，见 real-drag.ps1）。
  const dragPill = async (targetDelta, steps = 16) => {
    const info = JSON.parse(await evalJs(`JSON.stringify((() => { const p = document.getElementById('balance-pill').getBoundingClientRect()
        return { x: Math.round(p.x + p.width / 2), y: Math.round(p.y + p.height / 2) } })())`))
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: info.x, y: info.y, button: 'left', buttons: 1, clickCount: 1 })
    await sleep(60)
    const st = await getBounds()
    const s0 = st.x + info.x
    let last = info
    for (let i = 1; i <= steps; i++) {
      const want = s0 + (targetDelta * i) / steps
      const bb = await getBounds()
      const vx = Math.max(4, Math.min(bb.width - 4, Math.round(want - bb.x)))
      last = { x: vx, y: info.y }
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: vx, y: info.y, button: 'left', buttons: 1 })
      await sleep(24)
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: last.x, y: last.y, button: 'left', buttons: 0, clickCount: 1 })
    await sleep(500)
    return readPillDx()
  }

  // 血条复位：先走一段大的（<3px 的按住会被当成点击、位置拨回原样），再反向拖回
  const resetPillDx = async () => {
    if (Math.abs(await readPillDx()) >= 1) {
      await dragPill(20, 12)
      const d1 = await readPillDx()
      if (Math.abs(d1) >= 1) await dragPill(-d1, 12)
    }
    return readPillDx()
  }

  console.log('target:', page.url.split('/').pop())
  console.log('sampler:', await evalJs(START_SAMPLER))

  const origLen = String(await evalJs(`document.getElementById('pill-len-range').value`))
  const origDx = await readPillDx()
  console.log('original state: len=%s dx=%s', origLen, origDx)
  await evalJs(`(() => { const off = document.getElementById('balance-pill').classList.contains('dshwv-pill-off')
      if (off) document.getElementById('pill-toggle').click(); return true })()`)

  // ---------- [A] 调整血条长度：滑条 input 连发 → 停顿 → change ----------
  await evalJs(`(() => { const m = document.getElementById('menu-btn')
      if (!document.getElementById('whale-root').classList.contains('dshwv-menu-open')) m.click()
      return 'menu open' })()`)
  await sleep(700)                       // 让菜单打开时的 fitWindowForMenu 收尾
  await evalJs(RESET_SAMPLER)
  const lenRaw = await evalJs(`(async () => {
    const el = document.getElementById('pill-len-range')
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    const start = parseFloat(el.value) || 1
    const up = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]
    const seq = start >= 1.6 ? up.slice().reverse() : up
    for (const v of seq) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); await sleep(70) }
    await sleep(300)                     // 停顿：旧实现的 150ms 防抖会在这里落地
    el.dispatchEvent(new Event('change', { bubbles: true }))
    await sleep(600)
    return ${READ_SAMPLER}
  })()`)
  const lenLog = JSON.parse(lenRaw)
  console.log('\n[A] 调长度 1.0→1.6→…：窗口尺寸变化 %d 次 %s', lenLog.length, lenLog.length ? JSON.stringify(lenLog) : '')
  await evalJs(`(() => { const el = document.getElementById('pill-len-range'); el.value = ${JSON.stringify(origLen)}
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  await evalJs(`(() => { const m = document.getElementById('menu-btn')
      if (document.getElementById('whale-root').classList.contains('dshwv-menu-open')) m.click(); return 'menu closed' })()`)
  await sleep(400)

  // ---------- [B] 拖动血条位置 ----------
  await evalJs(RESET_SAMPLER)
  await dragPill(-140)
  const bAfterDrag = JSON.parse(await evalJs(`JSON.stringify((() => {
    const r = document.getElementById('whale-root')
    const c = parseFloat(r.style.getPropertyValue('--dshw-pill-dx')) || 0
    return { dx: r.classList.contains('dshwv-left') ? -c : c, winW: innerWidth }
  })())`))
  const dragLog = JSON.parse(await evalJs(READ_SAMPLER))
  console.log('[B] 拖位置 -140：dx=%s  winW=%s  窗口尺寸变化 %d 次 %s',
    bAfterDrag.dx, bAfterDrag.winW, dragLog.length, dragLog.length ? JSON.stringify(dragLog) : '')

  // 复位，别把用户的桌宠留在实验状态
  await resetPillDx()
  await sleep(700)
  const restored = { len: String(await evalJs(`document.getElementById('pill-len-range').value`)), dx: await readPillDx() }
  console.log('restored: len=%s dx=%s', restored.len, restored.dx)

  const ok = lenLog.length === 0 && dragLog.length === 0
  console.log(ok ? '\nRESULT: PASS —— 调整血条全程零窗口 resize（不会闪）'
    : '\nRESULT: FAIL —— 仍存在调整时的窗口 resize（会闪）')
  await evalJs(`(() => { if (window.__smpStop) window.__smpStop(); return 'stopped' })()`)
  close()
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error('VERIFY FAILED:', e.message)
  process.exit(1)
})
