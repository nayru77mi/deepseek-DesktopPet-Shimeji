const { readLedger, writeLedger } = require('./store')

// DeepSeek CNY prices per million tokens: [空闲时段价, 高峰时段价]
// 高峰时段：每日 9:00–12:00 和 14:00–18:00（北京时间 UTC+8）
const PEAK_HOURS = [
  [9, 12],
  [14, 18],
]

const BASE_PRICE = { hit: [0.05, 0.1], miss: [1.5, 3.0], out: [4.5, 9.0] }
const PRICING = {
  'deepseek-chat': BASE_PRICE,
  'deepseek-reasoner': BASE_PRICE,
  'deepseek-v4-flash': BASE_PRICE,
  'deepseek-v4-pro': BASE_PRICE,
  _default: BASE_PRICE,
}

function priceFor(model) {
  const m = String(model || '').toLowerCase()
  for (const key of Object.keys(PRICING)) {
    if (key === '_default') continue
    if (m.indexOf(key) !== -1) return PRICING[key]
  }
  return PRICING._default
}

function isPeakTime(timeSec) {
  if (!isFinite(Number(timeSec))) return false
  // Beijing time is UTC+8
  const hour = new Date(Number(timeSec) * 1000 + 8 * 3600 * 1000).getUTCHours()
  for (const [start, end] of PEAK_HOURS) {
    if (hour >= start && hour < end) return true
  }
  return false
}

function getTodayString() {
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  return now.toISOString().slice(0, 10)
}

// 记账模式：通过余额差值记账
function updateLedgerWithBalance(totalBalance) {
  if (typeof totalBalance !== 'number' || !isFinite(totalBalance)) {
    const existing = readLedger()
    return existing ? (existing.todayUsage || 0) : 0
  }

  const today = getTodayString()
  let ledger = readLedger()

  if (!ledger) {
    ledger = {
      date: today,
      lastBalance: totalBalance,
      todayUsage: 0,
      history: {},
    }
    writeLedger(ledger)
    return 0
  }

  if (ledger.date !== today) {
    // 跨天归档（保留最近30天）
    if (!ledger.history) ledger.history = {}
    ledger.history[ledger.date] = ledger.todayUsage || 0

    const dates = Object.keys(ledger.history).sort()
    while (dates.length > 30) {
      delete ledger.history[dates.shift()]
    }

    ledger.date = today
    ledger.todayUsage = 0
    ledger.lastBalance = totalBalance
    writeLedger(ledger)
    return 0
  }

  const prev = typeof ledger.lastBalance === 'number' ? ledger.lastBalance : totalBalance
  if (totalBalance < prev) {
    // 余额下降：累加消耗
    const delta = prev - totalBalance
    ledger.todayUsage = (ledger.todayUsage || 0) + delta
  }
  // 余额上升（充值）时不扣减，只更新 lastBalance
  ledger.lastBalance = totalBalance
  writeLedger(ledger)
  return ledger.todayUsage || 0
}

// 实时令牌模式：解析 DeepSeek 平台用量返回数据
function calcTokenUsage(series) {
  if (!Array.isArray(series)) return 0
  let totalCost = 0
  for (const item of series) {
    const model = (item && item.model) || ''
    const p = priceFor(model)
    const buckets = (item && Array.isArray(item.buckets)) ? item.buckets : []
    for (const b of buckets) {
      const u = b && b.usage
      if (!u) continue
      const off = isPeakTime(b.time) ? 1 : 0
      const hit = Number(u.PROMPT_CACHE_HIT_TOKEN) || 0
      const miss = Number(u.PROMPT_CACHE_MISS_TOKEN) || 0
      const out = Number(u.RESPONSE_TOKEN) || 0
      totalCost += (hit / 1e6) * p.hit[off] + (miss / 1e6) * p.miss[off] + (out / 1e6) * p.out[off]
    }
  }
  return totalCost
}

module.exports = {
  isPeakTime,
  priceFor,
  getTodayString,
  updateLedgerWithBalance,
  calcTokenUsage,
  PEAK_HOURS,
}
