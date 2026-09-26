const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, shell } = require('electron')
const path = require('node:path')
const { readConfig, writeConfig } = require('./store')
const { getBalance, clearBalanceCache } = require('./balance-service')
const { startListener, stopListener, getLastTurn, handleTurnEvent } = require('./cost-listener')

// 便捷入口：--test 以测试模式启动（自定义余额 + 扣费演练，不请求接口）。
// 只对本次启动生效，不写入配置 —— 否则普通快捷方式也会被带偏。
const TEST_ARGV = process.argv.includes('--test')

function isTestMode(cfg) {
  return TEST_ARGV || !!(cfg && cfg.testMode)
}

// Low memory & high performance switches
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

let mainWindow = null
let settingsWindow = null
let tray = null

// 血条向左伸出 root 的距离 —— 必须与 CSS 的
// left = 0.36*base - 0.78*base*len + dx 保持一致，否则窗口不够宽会把血条左边裁掉
function pillOverhang(basePx, len, dx) {
  const n = Math.max(0.6, Math.min(1.6, Number(len) || 1))
  const d = Math.max(0, -Math.round(Number(dx) || 0)) // 只有向左微调才需要额外空间
  return Math.max(0, Math.ceil(basePx * (0.78 * n - 0.36) + 24 + d))
}

function calculateWindowSize(scale = 1.5, pillLen = 1, pillDx = 0) {
  const basePx = Math.round(180 * scale)
  return {
    width: basePx + Math.max(180, pillOverhang(basePx, pillLen, pillDx)),
    height: basePx + 200,
  }
}

function getSafePosition(width, height, savedPos) {
  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workArea

  const defaultX = workArea.x + workArea.width - width - 20
  const defaultY = workArea.y + workArea.height - height - 20

  if (!savedPos || typeof savedPos.x !== 'number' || typeof savedPos.y !== 'number') {
    return { x: defaultX, y: defaultY }
  }

  // 必须有「大部分窗口面积」落在某块屏幕工作区内才算安全。
  // 旧实现只检查左上角一个点：窗口只要左上角在范围内就判定可见，换显示器、
  // 改分辨率或拖拽后可能出现「仅剩一小截在屏内、鲸鱼本体整个在外面」的情况，
  // 用户会以为桌宠消失了。按面积重叠判定可以彻底杜绝这类丢宠。
  const MIN_OVERLAP = 0.6
  for (const display of screen.getAllDisplays()) {
    const wa = display.workArea
    const overlapW = Math.min(savedPos.x + width, wa.x + wa.width) - Math.max(savedPos.x, wa.x)
    const overlapH = Math.min(savedPos.y + height, wa.y + wa.height) - Math.max(savedPos.y, wa.y)
    if (overlapW >= width * MIN_OVERLAP && overlapH >= height * MIN_OVERLAP) {
      return { x: savedPos.x, y: savedPos.y }
    }
  }

  return { x: defaultX, y: defaultY }
}

// 显示器热插拔 / 分辨率变化后重新校验窗口位置（防止窗口留在已消失的屏幕坐标上）。
// 只允许 setPosition，严禁 setBounds —— 每帧改尺寸会让 Windows DWM
// 重建显存表面导致卡死（BUG-001）。
let displayGuardTimer = null
function keepWindowOnScreen() {
  if (displayGuardTimer) return
  displayGuardTimer = setTimeout(() => {
    displayGuardTimer = null
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
      const b = mainWindow.getBounds()
      const next = getSafePosition(b.width, b.height, { x: b.x, y: b.y })
      if (next.x !== b.x || next.y !== b.y) {
        mainWindow.setPosition(next.x, next.y)
        const edgeX = next.x + b.width / 2 < screen.getPrimaryDisplay().workArea.width / 2 ? 'left' : 'right'
        writeConfig({ windowPos: { x: next.x, y: next.y, h: edgeX, v: 'bottom' } })
        console.log(`[DisplayGuard] window moved back on-screen: (${b.x},${b.y}) -> (${next.x},${next.y})`)
      }
    } catch (err) {
      console.error('[DisplayGuard] failed:', err)
    }
  }, 400)
}

function watchDisplays() {
  screen.on('display-added', keepWindowOnScreen)
  screen.on('display-removed', keepWindowOnScreen)
  screen.on('metrics-changed', keepWindowOnScreen)
}

function createMainWindow() {
  const config = readConfig()
  const { width, height } = calculateWindowSize(config.scale || 1.5, config.pillLen, config.pillDx)
  const { x: winX, y: winY } = getSafePosition(width, height, config.windowPos)

  mainWindow = new BrowserWindow({
    x: winX,
    y: winY,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: config.alwaysOnTop !== false,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    show: false,
    icon: path.join(__dirname, '../../assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.setIgnoreMouseEvents(true, { forward: true })
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 580,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'DeepSeek 小鲸鱼 - 设置中心',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'))

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/icon.ico')
  let trayImage = nativeImage.createFromPath(iconPath)
  if (!trayImage.isEmpty()) {
    trayImage = trayImage.resize({ width: 24, height: 24 })
  }

  tray = new Tray(trayImage)
  tray.setToolTip('DeepSeek 余额小鲸鱼桌宠')

  const updateTrayMenu = () => {
    const config = readConfig()
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '🐋 DeepSeek 余额小鲸鱼',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: '🎯 重置位置到右下角',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            const primaryDisplay = screen.getPrimaryDisplay()
            const wa = primaryDisplay.workArea
            const bounds = mainWindow.getBounds()
            const targetX = wa.x + wa.width - bounds.width - 20
            const targetY = wa.y + wa.height - bounds.height - 20
            mainWindow.setPosition(targetX, targetY)
            mainWindow.show()
            writeConfig({ windowPos: { x: targetX, y: targetY, h: 'right', v: 'bottom' } })
          }
        },
      },
      {
        label: '🔄 刷新余额',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            clearBalanceCache()
            mainWindow.webContents.send('config-changed', { refresh: true })
          }
        },
      },
      {
        label: '👁️ 显示 / 隐藏桌宠',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) return
          if (mainWindow.isVisible()) {
            mainWindow.hide()
          } else {
            mainWindow.show()
          }
        },
      },
      {
        label: '📌 始终置顶',
        type: 'checkbox',
        checked: config.alwaysOnTop !== false,
        click: (menuItem) => {
          writeConfig({ alwaysOnTop: menuItem.checked })
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setAlwaysOnTop(menuItem.checked)
          }
        },
      },
      {
        label: '⚙️ 凭据与设置...',
        click: () => createSettingsWindow(),
      },
      { type: 'separator' },
      {
        label: '❌ 退出程序',
        click: () => {
          app.isQuitting = true
          app.quit()
        },
      },
    ])
    tray.setContextMenu(contextMenu)
  }

  updateTrayMenu()
  tray.on('double-click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
    }
  })
}

// IPC Handlers
ipcMain.handle('get-config', () => {
  const cfg = readConfig()
  // --test 启动时让设置面板的测试开关显示为开启（不落盘）
  return TEST_ARGV ? { ...cfg, testMode: true } : cfg
})

ipcMain.handle('save-config', (event, partial) => {
  const result = writeConfig(partial)
  if (result.ok) {
    if (typeof partial.alwaysOnTop === 'boolean' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(partial.alwaysOnTop)
    }
    if (typeof partial.openAtLogin === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: partial.openAtLogin })
    }
    if (typeof partial.usageMode === 'string') {
      clearBalanceCache()
    }
    // NEVER broadcast back to the sender window to avoid infinite IPC recursion
    if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
      mainWindow.webContents.send('config-changed', result.config)
    }
    if (settingsWindow && !settingsWindow.isDestroyed() && event.sender !== settingsWindow.webContents) {
      settingsWindow.webContents.send('config-changed', result.config)
    }
  }
  return result
})

ipcMain.handle('get-balance', async (event, force) => {
  return getBalance(!!force)
})

ipcMain.handle('get-last-turn', () => {
  return getLastTurn()
})

// 向两个窗口广播配置片段（绝不回声给发起方，防 BUG-002 递归）
function broadcastConfig(partial, sender) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('config-changed', partial)
  if (settingsWindow && !settingsWindow.isDestroyed() && sender !== settingsWindow.webContents) {
    settingsWindow.webContents.send('config-changed', partial)
  }
}

ipcMain.handle('test-cost', (event, amount, force) => {
  handleTurnEvent({
    amount: Number(amount) || 0.1,
    turn: 1,
    end: true,
    force: force === 'crit' || force === 'normal' ? force : null,
  })
  return { ok: true }
})

// ---------------- 测试版面板 ----------------
ipcMain.handle('set-test-mode', (event, on) => {
  writeConfig({ testMode: !!on })
  clearBalanceCache()
  broadcastConfig({ testMode: !!on }, event.sender)
  return { ok: true, testMode: !!on }
})

ipcMain.handle('set-test-balance', (event, balance) => {
  const raw = Number(balance)
  if (!isFinite(raw) || raw < 0) return { ok: false, error: '余额必须是 ≥ 0 的数字' }
  const b = Math.round(raw * 10000) / 10000 // 去掉浮点噪声，避免输入框出现 99.9463000000
  writeConfig({ testBalance: b, testUsage: 0 })
  clearBalanceCache()
  broadcastConfig({ testBalance: b, testUsage: 0 }, event.sender)
  return { ok: true, testBalance: b }
})

ipcMain.handle('reset-test-usage', (event) => {
  writeConfig({ testUsage: 0 })
  clearBalanceCache()
  broadcastConfig({ testUsage: 0 }, event.sender)
  return { ok: true }
})

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, options)
  }
})

// Fast position update for dragging (zero resizing overhead)
ipcMain.on('set-window-position', (event, x, y) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    win.setPosition(Math.round(x), Math.round(y))
  }
})

ipcMain.on('set-window-bounds', (event, bounds) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    const current = win.getBounds()
    win.setBounds({
      x: bounds.x !== undefined ? Math.round(bounds.x) : current.x,
      y: bounds.y !== undefined ? Math.round(bounds.y) : current.y,
      width: bounds.width !== undefined ? Math.round(bounds.width) : current.width,
      height: bounds.height !== undefined ? Math.round(bounds.height) : current.height,
    })
  }
})

ipcMain.handle('get-window-bounds', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win && !win.isDestroyed() ? win.getBounds() : { x: 0, y: 0, width: 300, height: 300 }
})

ipcMain.handle('get-work-area', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const display = win && !win.isDestroyed()
    ? screen.getDisplayNearestPoint(win.getBounds())
    : screen.getPrimaryDisplay()
  return display.workArea
})

ipcMain.on('open-settings', () => {
  createSettingsWindow()
})

ipcMain.on('open-external', (event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url).catch((err) => {
      console.error('Failed to open external url:', err)
    })
  }
})

ipcMain.on('close-app', () => {
  app.isQuitting = true
  app.quit()
})

// 测试模式：每笔扣费直接扣自定义余额并累加今日已用，血条实时下降
function applyTestCost(turnData) {
  try {
    if (!turnData) return
    const cfg = readConfig()
    if (!isTestMode(cfg)) return
    const amount = Number(turnData.amount)
    if (!isFinite(amount) || amount <= 0) return
    const bal = Number(cfg.testBalance)
    const nextBal = Math.round(Math.max(0, (isFinite(bal) ? bal : 0) - amount) * 10000) / 10000
    const nextUsage = Math.round(((Number(cfg.testUsage) || 0) + amount) * 10000) / 10000
    writeConfig({ testBalance: nextBal, testUsage: nextUsage })
    broadcastConfig({ testBalance: nextBal, testUsage: nextUsage }, null)
  } catch (err) {
    console.error('[TestMode] apply cost failed:', err)
  }
}

app.whenReady().then(() => {
  const config = readConfig()
  createMainWindow()
  createTray()
  watchDisplays()

  // Start turn cost local listener
  startListener(config.listenerPort || 37189, (turnData) => {
    // 先落账（测试模式扣余额），再广播 —— 否则前端刷新会读到旧值慢一拍
    applyTestCost(turnData)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('turn-cost-updated', turnData)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('before-quit', () => {
  stopListener()
})

app.on('window-all-closed', () => {
  // Desktop pet keeps running in system tray
})
