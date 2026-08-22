const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage } = require('electron')
const path = require('node:path')
const { readConfig, writeConfig } = require('./store')
const { getBalance, clearBalanceCache } = require('./balance-service')
const { startListener, stopListener, getLastTurn, handleTurnEvent } = require('./cost-listener')

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

function calculateWindowSize(scale = 1.5) {
  const basePx = Math.round(180 * scale)
  return {
    width: basePx + 180,
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

  const allDisplays = screen.getAllDisplays()
  let isVisible = false

  for (const display of allDisplays) {
    const wa = display.workArea
    if (
      savedPos.x >= wa.x - 50 &&
      savedPos.x <= wa.x + wa.width - 100 &&
      savedPos.y >= wa.y - 50 &&
      savedPos.y <= wa.y + wa.height - 100
    ) {
      isVisible = true
      break
    }
  }

  if (!isVisible) {
    return { x: defaultX, y: defaultY }
  }

  return { x: savedPos.x, y: savedPos.y }
}

function createMainWindow() {
  const config = readConfig()
  const { width, height } = calculateWindowSize(config.scale || 1.5)
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
  return readConfig()
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

ipcMain.handle('test-cost', (event, amount) => {
  handleTurnEvent({ amount: Number(amount) || 0.1, turn: 1, end: true })
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

ipcMain.on('close-app', () => {
  app.isQuitting = true
  app.quit()
})

app.whenReady().then(() => {
  const config = readConfig()
  createMainWindow()
  createTray()

  // Start turn cost local listener
  startListener(config.listenerPort || 37189, (turnData) => {
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
