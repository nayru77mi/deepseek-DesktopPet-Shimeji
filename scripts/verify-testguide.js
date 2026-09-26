// 验证设置中心「测试模式」旁的状态指引文案（开启/关闭两态 + 返回真实接口指引）
// 前置：以调试端口启动桌宠  electron . --remote-debugging-port=9223
// 用法: node scripts/verify-testguide.js [port]
const fs = require('fs')
const path = require('path')

const PORT = Number(process.argv[2]) || 9223
const OUT_DIR = path.join(__dirname, '..', 'tmp_media')
try { fs.mkdirSync(OUT_DIR, { recursive: true }) } catch (e) {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  return res.json()
}

function connect(url) {
  const ws = new WebSocket(url)
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    let msg
    try { msg = JSON.parse(ev.data) } catch (e) { return }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  })
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve())
    ws.addEventListener('error', () => reject(new Error('ws error')))
  })
  const send = (method, params = {}, timeoutMs = 8000) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`timeout: ${method}`))
        }
      }, timeoutMs)
    })
  return { ws, send, opened }
}

async function evalIn(send, expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300))
  return r.result && r.result.value
}

async function shot(send, file) {
  try {
    await send('Page.bringToFront')
    const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }, 20000)
    fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(r.data, 'base64'))
    return path.join(OUT_DIR, file)
  } catch (e) {
    console.log(`WARN | screenshot ${file} failed: ${e.message}`)
    return null
  }
}

async function findByUrl(part) {
  for (let i = 0; i < 40; i++) {
    const list = await listTargets()
    const hit = list.find((t) => t.type === 'page' && t.url.includes(part) && t.webSocketDebuggerUrl)
    if (hit) return hit
    await sleep(250)
  }
  throw new Error(`target not found: ${part}`)
}

const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`)
}

async function main() {
  // 0. 关掉可能已存在的设置窗口，确保加载最新脚本
  const existing = await listTargets()
  for (const t of existing.filter((x) => x.type === 'page' && x.url.includes('settings.html') && x.webSocketDebuggerUrl)) {
    const c = connect(t.webSocketDebuggerUrl)
    await c.opened
    try { await evalIn(c.send, `window.close(), 'ok'`) } catch (e) {}
    c.ws.close()
  }
  await sleep(500)

  // 1. 打开设置中心
  const mainT = await findByUrl('index.html')
  const m = connect(mainT.webSocketDebuggerUrl)
  await m.opened
  await evalIn(m.send, `window.electronAPI.openSettings(), 'ok'`)
  m.ws.close()

  const setT = await findByUrl('settings.html')
  const s = connect(setT.webSocketDebuggerUrl)
  await s.opened
  await s.send('Page.enable')
  await sleep(600)

  const read = () =>
    evalIn(
      s.send,
      `(function(){const el=document.getElementById('test-mode-guide');
       const chk=document.getElementById('chk-test-mode');
       const st=document.getElementById('test-status');
       return {text: el?el.textContent:null, cls: el?el.className:null, checked: chk?chk.checked:null, status: st?st.textContent:null};})()`
    )

  // 2. 初始（测试模式关闭）状态
  const off = await read()
  await shot(s.send, 'testguide-off.png')
  check('关闭态文案含「测试模式已关闭」', !!off.text && off.text.includes('测试模式已关闭'), (off.text || '').slice(0, 40))
  check('关闭态含返回指引（勾选上方开关）', !!off.text && off.text.includes('勾选上方开关'))
  check('关闭态 class=is-off', (off.cls || '').includes('is-off'), off.cls)
  check('初始 checkbox 与配置一致 (false)', off.checked === false, String(off.checked))
  check('下方状态行已改写（不再重复指引）', !!off.status && off.status.includes('演练按钮'), (off.status || '').slice(0, 40))

  // 3. 打开测试模式
  await evalIn(s.send, `document.getElementById('chk-test-mode').click(), 'ok'`)
  await sleep(900)
  const on = await read()
  await shot(s.send, 'testguide-on.png')
  check('开启态文案含「测试模式已开启」', !!on.text && on.text.includes('测试模式已开启'), (on.text || '').slice(0, 40))
  check('开启态含返回指引（取消勾选）', !!on.text && on.text.includes('取消勾选'))
  check('开启态 class=is-on', (on.cls || '').includes('is-on'), on.cls)
  check('checkbox 已勾选', on.checked === true, String(on.checked))
  check('开启态下方状态行显示统计', !!on.status && on.status.includes('测试模式开启'), (on.status || '').slice(0, 40))

  // 4. 关回去，确认配置回到 testMode:false
  await evalIn(s.send, `document.getElementById('chk-test-mode').click(), 'ok'`)
  await sleep(900)
  const back = await read()
  check('关闭后文案切回', !!back.text && back.text.includes('测试模式已关闭'), (back.text || '').slice(0, 40))
  check('关闭后 class=is-off', (back.cls || '').includes('is-off'), back.cls)

  const m2t = await findByUrl('index.html')
  const m2 = connect(m2t.webSocketDebuggerUrl)
  await m2.opened
  const cfg = await evalIn(m2.send, `window.electronAPI.getConfig()`)
  m2.ws.close()
  check('config.testMode 已还原为 false', cfg && cfg.testMode === false, String(cfg && cfg.testMode))
  s.ws.close()

  const failed = results.filter((r) => !r.ok)
  console.log(`\nRESULT: ${failed.length === 0 ? 'PASS' : 'FAIL'} (${results.length - failed.length}/${results.length})`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(1)
})
