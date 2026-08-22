const { readConfig } = require('./store')
const {
  isPeakTime,
  updateLedgerWithBalance,
  calcTokenUsage,
} = require('./usage-engine')

const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const BALANCE_TTL_MS = 25000

let balanceCache = null
let inFlightPromise = null

function clearBalanceCache() {
  balanceCache = null
}

async function fetchBalanceFromApi(apiKey) {
  if (!apiKey) {
    return { ok: false, code: 'NO_KEY', error: '未配置 DEEPSEEK_API_KEY，请在菜单或托盘设置中填写' }
  }

  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    let res
    try {
      res = await fetch(BALANCE_URL, {
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        signal: AbortSignal.timeout(20000),
      })
    } catch (err) {
      lastErr = err
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
      continue
    }

    if (!res.ok) {
      lastErr = new Error(`HTTP ${res.status}`)
      if (res.status < 500) break
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
      continue
    }

    let data
    try {
      data = await res.json()
    } catch (err) {
      return { ok: false, code: 'PARSE', error: '余额接口返回非合法 JSON' }
    }

    const info = data && Array.isArray(data.balance_infos) ? data.balance_infos[0] : null
    if (!info || info.total_balance === undefined) {
      return { ok: false, code: 'SHAPE', error: '余额接口返回结构异常' }
    }

    return {
      ok: true,
      totalBalance: Number(info.total_balance),
      currency: String(info.currency || 'CNY'),
      updatedAt: new Date().toISOString(),
    }
  }

  const transient = !(lastErr && /^HTTP 4\d\d/.test(lastErr.message))
  return {
    ok: false,
    code: 'HTTP',
    transient,
    error: `余额接口请求失败: ${String((lastErr && lastErr.message) || lastErr).slice(0, 160)}`,
  }
}

async function fetchPlatformUsage(platformToken) {
  if (!platformToken) return { error: 'no platform token' }
  const token = String(platformToken).replace(/^Bearer\s+/i, '').trim()
  try {
    const now = new Date()
    const tz = -now.getTimezoneOffset() * 60
    const start = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000)
    const end = start + 86400
    const url = `https://platform.deepseek.com/api/v0/usage/by_api_key/amount?start=${start}&end=${end}&tz=${tz}`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return { error: `http ${res.status}` }
    const data = await res.json()
    const series = data && data.biz_data && data.biz_data.series
    if (!Array.isArray(series)) return { error: 'invalid platform usage shape' }
    const todayUsage = calcTokenUsage(series)
    return { ok: true, todayUsage }
  } catch (err) {
    return { error: String((err && err.message) || err) }
  }
}

async function getBalance(forceRefresh = false) {
  const now = Date.now()
  const config = readConfig()
  const isPeak = isPeakTime(Math.floor(now / 1000))

  if (!forceRefresh && balanceCache && now - balanceCache.ts < BALANCE_TTL_MS) {
    return {
      ...balanceCache.data,
      isPeak,
      usageMode: config.usageMode || 'ledger',
    }
  }

  if (inFlightPromise) {
    return inFlightPromise
  }

  inFlightPromise = (async () => {
    try {
      const balanceRes = await fetchBalanceFromApi(config.apiKey)

      if (!balanceRes.ok) {
        if (balanceRes.transient && balanceCache && balanceCache.data.ok) {
          return {
            ...balanceCache.data,
            stale: true,
            isPeak,
            usageMode: config.usageMode || 'ledger',
          }
        }
        return {
          ...balanceRes,
          isPeak,
          usageMode: config.usageMode || 'ledger',
        }
      }

      let todayUsage = 0
      let effectiveUsageMode = config.usageMode || 'ledger'

      if (effectiveUsageMode === 'token' && config.platformToken) {
        const tokenRes = await fetchPlatformUsage(config.platformToken)
        if (tokenRes.ok) {
          todayUsage = tokenRes.todayUsage
        } else {
          // Token 请求失败时自动回落记账模式
          effectiveUsageMode = 'ledger'
          todayUsage = updateLedgerWithBalance(balanceRes.totalBalance)
        }
      } else {
        effectiveUsageMode = 'ledger'
        todayUsage = updateLedgerWithBalance(balanceRes.totalBalance)
      }

      const result = {
        ok: true,
        totalBalance: balanceRes.totalBalance,
        currency: balanceRes.currency,
        updatedAt: balanceRes.updatedAt,
        todayUsage,
        isPeak,
        usageMode: effectiveUsageMode,
      }

      balanceCache = {
        ts: Date.now(),
        data: result,
      }

      return result
    } finally {
      inFlightPromise = null
    }
  })()

  return inFlightPromise
}

module.exports = {
  getBalance,
  clearBalanceCache,
}
