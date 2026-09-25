const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// User data directory
const APP_DATA_DIR = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'deepseek-whale-pet')
  : path.join(os.homedir(), '.deepseek-whale-pet')

try {
  if (!fs.existsSync(APP_DATA_DIR)) {
    fs.mkdirSync(APP_DATA_DIR, { recursive: true })
  }
} catch (err) {
  console.error('Failed to create data directory:', err)
}

const CONFIG_FILE = path.join(APP_DATA_DIR, 'config.json')
const LEDGER_FILE = path.join(APP_DATA_DIR, 'ledger.json')

const DEFAULT_CONFIG = {
  scale: 1.5,
  sound: true,
  vol: 0.9,
  soundSet: 'duck',
  usageMode: 'ledger',
  peakMode: 'default',
  bubbleOn: true,
  damageOn: true,
  turnCostOn: true,
  turnCostCloseMs: 5000,
  snapThreshold: 60,
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  platformToken: process.env.DEEPSEEK_PLATFORM_TOKEN || '',
  alwaysOnTop: true,
  listenerPort: 37189,
  openAtLogin: false,
  windowPos: null,
}

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      return { ...DEFAULT_CONFIG, ...data }
    }
  } catch (err) {
    console.error('Error reading config file:', err)
  }
  return { ...DEFAULT_CONFIG }
}

function writeConfig(partialConfig) {
  try {
    const current = readConfig()
    const merged = { ...current, ...partialConfig }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8')
    return { ok: true, config: merged }
  } catch (err) {
    console.error('Error writing config file:', err)
    return { ok: false, error: String(err && err.message) }
  }
}

function readLedger() {
  try {
    if (fs.existsSync(LEDGER_FILE)) {
      return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'))
    }
  } catch (err) {
    console.error('Error reading ledger file:', err)
  }
  return null
}

function writeLedger(data) {
  try {
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(data, null, 2), 'utf-8')
    return { ok: true }
  } catch (err) {
    console.error('Error writing ledger file:', err)
    return { ok: false, error: String(err && err.message) }
  }
}

module.exports = {
  APP_DATA_DIR,
  readConfig,
  writeConfig,
  readLedger,
  writeLedger,
  DEFAULT_CONFIG,
}
