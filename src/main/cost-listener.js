const http = require('node:http')
const { isPeakTime, priceFor } = require('./usage-engine')

let server = null
let lastTurn = null
let lastTurnSeq = 0
let turnAgg = null
let onTurnEndCallback = null

function resetTurnAgg() {
  turnAgg = null
}

function finalizeTurn() {
  if (turnAgg && turnAgg.cost > 0) {
    lastTurn = {
      turn: turnAgg.turn,
      amount: turnAgg.cost,
      tokens: turnAgg.tokens,
      cache: turnAgg.cache,
      ts: turnAgg.lastTs,
    }
    lastTurnSeq++
    if (typeof onTurnEndCallback === 'function') {
      onTurnEndCallback({ ok: true, seq: lastTurnSeq, ...lastTurn })
    }
  }
  turnAgg = null
}

// 直接提交金额（README「方式 1」与设置页「测试消耗」按钮）。
// 这类请求允许同时携带 end:true —— 早期实现里 end 分支先 return，会把它们
// 整个吞掉，导致按钮与文档示例全部静默失效。
function recordDirect(turn, d) {
  const cost = Number(d.cost !== undefined ? d.cost : d.amount) || 0
  if (cost <= 0) return
  lastTurn = {
    turn,
    amount: cost,
    tokens: Number(d.tokens) || 0,
    cache: typeof d.cache === 'number' ? d.cache : null,
    ts: Date.now(),
  }
  lastTurnSeq++
  if (typeof onTurnEndCallback === 'function') {
    onTurnEndCallback({ ok: true, seq: lastTurnSeq, ...lastTurn })
  }
}

function handleTurnEvent(d) {
  if (!d || typeof d !== 'object') return
  const turn = Number(d.turn !== undefined ? d.turn : 1)

  const usage = d.usage
  const hasUsage = !!(usage && typeof usage === 'object')
  const hasDirect = typeof d.cost === 'number' || typeof d.amount === 'number'
  const isEnd = d.type === 'turn/end' || d.event === 'turn/end' || d.end === true

  // 纯金额提交优先于 end 判定
  if (hasDirect && !hasUsage) {
    recordDirect(turn, d)
    return
  }

  if (isEnd) {
    finalizeTurn()
    return
  }

  if (hasDirect) {
    recordDirect(turn, d)
    return
  }

  if (!hasUsage) return

  if (!turnAgg || turnAgg.turn !== turn) {
    if (turnAgg && turnAgg.turn !== turn) finalizeTurn()
    turnAgg = { turn, cost: 0, tokens: 0, cache: 0, lastTs: Date.now() }
  }

  const input = Number(usage.inputTokens || usage.prompt_tokens) || 0
  const cache = Number(usage.cacheReadTokens || usage.prompt_cache_hit_tokens) || 0
  const output = Number(usage.outputTokens || usage.completion_tokens) || 0
  const reasoning = Number(usage.reasoningTokens || usage.reasoning_tokens) || 0
  turnAgg.tokens += input + cache + output + reasoning
  turnAgg.cache += cache

  const model = d.model || ''
  const p = priceFor(model)
  const off = isPeakTime(Math.floor(Date.now() / 1000)) ? 1 : 0
  turnAgg.cost += (cache / 1e6) * p.hit[off] + (input / 1e6) * p.miss[off] + ((output + reasoning) / 1e6) * p.out[off]
  turnAgg.lastTs = Date.now()

  // Auto finalize if single turn flag is true
  if (d.finalize || d.finished) {
    finalizeTurn()
  }
}

function startListener(port = 37189, onTurnEnd) {
  onTurnEndCallback = onTurnEnd
  if (server) {
    try { server.close() } catch (err) {}
    server = null
  }

  server = http.createServer((req, res) => {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8',
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders)
      res.end()
      return
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    const pathname = url.pathname

    if (pathname === '/health') {
      res.writeHead(200, corsHeaders)
      res.end(JSON.stringify({ ok: true, name: 'deepseek-whale-pet', port }))
      return
    }

    if (pathname === '/api/last-turn' && req.method === 'GET') {
      res.writeHead(200, corsHeaders)
      res.end(JSON.stringify({
        ok: true,
        seq: lastTurnSeq,
        turn: lastTurn ? lastTurn.turn : null,
        amount: lastTurn ? lastTurn.amount : null,
        tokens: lastTurn ? lastTurn.tokens : null,
        cache: lastTurn ? lastTurn.cache : null,
        ts: lastTurn ? lastTurn.ts : null,
      }))
      return
    }

    if ((pathname === '/api/turn-event' || pathname === '/api/test-cost') && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {}
          handleTurnEvent(data)
          res.writeHead(200, corsHeaders)
          res.end(JSON.stringify({ ok: true, seq: lastTurnSeq }))
        } catch (err) {
          res.writeHead(400, corsHeaders)
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }))
        }
      })
      return
    }

    res.writeHead(404, corsHeaders)
    res.end(JSON.stringify({ ok: false, error: 'Not Found' }))
  })

  server.listen(port, '127.0.0.1', () => {
    console.log(`[CostListener] Listening on http://127.0.0.1:${port}`)
  })

  server.on('error', (err) => {
    console.error(`[CostListener] Server error on port ${port}:`, err.message)
  })
}

function stopListener() {
  if (server) {
    try { server.close() } catch (err) {}
    server = null
  }
}

function getLastTurn() {
  return {
    ok: true,
    seq: lastTurnSeq,
    turn: lastTurn ? lastTurn.turn : null,
    amount: lastTurn ? lastTurn.amount : null,
    tokens: lastTurn ? lastTurn.tokens : null,
    cache: lastTurn ? lastTurn.cache : null,
    ts: lastTurn ? lastTurn.ts : null,
  }
}

module.exports = {
  startListener,
  stopListener,
  handleTurnEvent,
  getLastTurn,
}
