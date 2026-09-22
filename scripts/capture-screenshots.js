const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const mockConfig = {
  scale: 1.5,
  sound: true,
  vol: 0.9,
  soundSet: 'duck',
  usageMode: 'ledger',
  peakMode: 'default',
  bubbleOn: true,
  turnCostOn: true,
  turnCostCloseMs: 0,
  snapThreshold: 60,
  apiKey: 'sk-d7a8f9c0e1b24893921...8888',
  platformToken: 'platform-token-sample',
  alwaysOnTop: true,
  listenerPort: 37189,
  openAtLogin: false,
  windowPos: { x: 100, y: 100 }
}

ipcMain.handle('get-config', () => mockConfig)
ipcMain.handle('save-config', (e, cfg) => ({ ok: true, config: { ...mockConfig, ...cfg } }))
ipcMain.handle('get-balance', () => ({
  ok: true,
  totalBalance: 128.50,
  currency: 'CNY',
  todayUsage: 2.36,
  isPeak: false,
  updatedAt: new Date().toISOString()
}))
ipcMain.handle('get-last-turn', () => null)
ipcMain.handle('get-window-bounds', () => ({ x: 100, y: 100, width: 600, height: 750 }))
ipcMain.handle('get-work-area', () => ({ x: 0, y: 0, width: 1920, height: 1080 }))
ipcMain.on('set-ignore-mouse-events', () => {})
ipcMain.on('set-window-position', () => {})
ipcMain.on('set-window-bounds', () => {})
ipcMain.on('open-settings', () => {})
ipcMain.on('open-external', () => {})
ipcMain.on('close-app', () => {})

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  const assetsDir = path.join(__dirname, '../assets')
  console.log('--- Starting Precision Screenshot Capture ---')

  // Helper to create widget window
  async function createWidgetWindow() {
    const win = new BrowserWindow({
      width: 620,
      height: 750,
      show: false,
      frame: false,
      transparent: true,
      webPreferences: {
        preload: path.join(__dirname, '../src/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      }
    })
    await win.loadFile(path.join(__dirname, '../src/renderer/index.html'))
    await delay(1200)
    return win
  }

  // 1. Capture Balance Bubble
  {
    console.log('1. Capturing assets/preview-bubble.png...')
    const win = await createWidgetWindow()
    const rect = await win.webContents.executeJavaScript(`
      (() => {
        const style = document.createElement('style');
        style.textContent = \`
          * { transition: none !important; animation: none !important; }
          .dshwv-bubble .dshwv-bshape,
          .dshwv-bubble .dshwv-b1,
          .dshwv-bubble .dshwv-b2 { opacity: 1 !important; transform: none !important; }
          .dshwv-text { opacity: 1 !important; }
        \`;
        document.head.appendChild(style);

        const bubbleBox = document.getElementById('whale-bubble');
        const labelEl = document.getElementById('whale-label');
        const amountEl = document.getElementById('whale-amount');
        const hintEl = document.getElementById('whale-hint');
        const menuBtn = document.getElementById('menu-btn');
        const root = document.getElementById('whale-root');

        menuBtn.classList.add('dshwv-menu-btn-visible');
        labelEl.textContent = 'DeepSeek 余额';
        labelEl.style.display = 'block';
        amountEl.textContent = '¥ 128.50';
        amountEl.style.display = 'block';
        hintEl.textContent = '今日已用: ¥2.36 (空闲时段)';
        hintEl.style.display = 'block';
        bubbleBox.classList.add('dshwv-bubble-open');

        const r = root.getBoundingClientRect();
        return {
          x: Math.max(0, Math.floor(r.left - 15)),
          y: Math.max(0, Math.floor(r.top - 15)),
          width: Math.ceil(r.width + 30),
          height: Math.ceil(r.height + 30)
        };
      })()
    `)
    await delay(300)
    const img = await win.webContents.capturePage(rect)
    fs.writeFileSync(path.join(assetsDir, 'preview-bubble.png'), img.toPNG())
    console.log('✓ Saved assets/preview-bubble.png with rect:', rect)
    win.close()
  }

  // 2. Capture Hamburger Menu
  {
    console.log('2. Capturing assets/preview-menu.png...')
    const win = await createWidgetWindow()
    const rect = await win.webContents.executeJavaScript(`
      (() => {
        const style = document.createElement('style');
        style.textContent = \`
          * { transition: none !important; animation: none !important; }
          .dshwv-menu.dshwv-menu-open { opacity: 1 !important; transform: none !important; }
        \`;
        document.head.appendChild(style);

        const bubbleBox = document.getElementById('whale-bubble');
        const menuBox = document.getElementById('menu-box');
        const menuBtn = document.getElementById('menu-btn');
        const root = document.getElementById('whale-root');

        bubbleBox.classList.remove('dshwv-bubble-open');
        menuBtn.classList.add('dshwv-menu-btn-visible');
        menuBox.classList.add('dshwv-menu-open');

        const rRoot = root.getBoundingClientRect();
        const rMenu = menuBox.getBoundingClientRect();
        const left = Math.min(rRoot.left, rMenu.left) - 15;
        const top = Math.min(rRoot.top, rMenu.top) - 15;
        const right = Math.max(rRoot.right, rMenu.right) + 15;
        const bottom = Math.max(rRoot.bottom, rMenu.bottom) + 15;

        return {
          x: Math.max(0, Math.floor(left)),
          y: Math.max(0, Math.floor(top)),
          width: Math.ceil(right - left),
          height: Math.ceil(bottom - top)
        };
      })()
    `)
    await delay(400)
    const img = await win.webContents.capturePage(rect)
    fs.writeFileSync(path.join(assetsDir, 'preview-menu.png'), img.toPNG())
    console.log('✓ Saved assets/preview-menu.png with rect:', rect)
    win.close()
  }

  // 3. Capture Turn Cost Bubble
  {
    console.log('3. Capturing assets/preview-turn-cost.png...')
    const win = await createWidgetWindow()
    const rect = await win.webContents.executeJavaScript(`
      (() => {
        const style = document.createElement('style');
        style.textContent = \`
          * { transition: none !important; animation: none !important; }
          .dshwv-bubble .dshwv-bshape,
          .dshwv-bubble .dshwv-b1,
          .dshwv-bubble .dshwv-b2 { opacity: 1 !important; transform: none !important; }
          .dshwv-text { opacity: 1 !important; }
        \`;
        document.head.appendChild(style);

        const bubbleBox = document.getElementById('whale-bubble');
        const labelEl = document.getElementById('whale-label');
        const amountEl = document.getElementById('whale-amount');
        const hintEl = document.getElementById('whale-hint');
        const menuBtn = document.getElementById('menu-btn');
        const root = document.getElementById('whale-root');

        menuBtn.classList.add('dshwv-menu-btn-visible');
        labelEl.textContent = '上一轮对话消耗:';
        labelEl.style.display = 'block';
        amountEl.textContent = '¥ 0.28';
        amountEl.style.display = 'block';
        amountEl.style.color = '#e0433f';
        hintEl.style.display = 'none';
        bubbleBox.classList.add('dshwv-bubble-open');

        const r = root.getBoundingClientRect();
        return {
          x: Math.max(0, Math.floor(r.left - 15)),
          y: Math.max(0, Math.floor(r.top - 15)),
          width: Math.ceil(r.width + 30),
          height: Math.ceil(r.height + 30)
        };
      })()
    `)
    await delay(300)
    const img = await win.webContents.capturePage(rect)
    fs.writeFileSync(path.join(assetsDir, 'preview-turn-cost.png'), img.toPNG())
    console.log('✓ Saved assets/preview-turn-cost.png with rect:', rect)
    win.close()
  }

  // 4. Capture Settings Window
  {
    console.log('4. Capturing assets/preview-settings.png...')
    const settingsWin = new BrowserWindow({
      width: 530,
      height: 720,
      show: false,
      frame: true,
      webPreferences: {
        preload: path.join(__dirname, '../src/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      }
    })

    await settingsWin.loadFile(path.join(__dirname, '../src/renderer/settings.html'))
    await delay(800)
    await settingsWin.webContents.executeJavaScript(`
      (() => {
        const keyInput = document.getElementById('api-key');
        if (keyInput) keyInput.value = 'sk-d7a8f9c0e1b24893921045f6a8e98888';
        const statusBox = document.getElementById('status-box');
        if (statusBox) {
          statusBox.textContent = '✅ API 凭据测试连接成功！当前账户可用余额: ¥128.50 CNY';
          statusBox.className = 'status-box status-success';
          statusBox.style.display = 'block';
        }
      })()
    `)
    await delay(400)
    const img = await settingsWin.webContents.capturePage()
    fs.writeFileSync(path.join(assetsDir, 'preview-settings.png'), img.toPNG())
    console.log('✓ Saved assets/preview-settings.png')
    settingsWin.close()
  }

  console.log('--- All Precision Screenshots Captured! ---')
  app.exit(0)
})
