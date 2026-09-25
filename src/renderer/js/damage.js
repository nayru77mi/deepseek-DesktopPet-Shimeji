// ---------------------------------------------------------------
// 伤害飘字（Damage Pulse）— 参考 dsh-damage-pulse 的扣费反馈
// 纯渲染层：只操作 transform / opacity，绝不触发布局或窗口尺寸变更。
// 严禁在此模块中调用 setWindowBounds（见 BUG-001：每帧 setBounds 会让
// Windows DWM 重建显存表面导致卡死），也禁止为每条飘字新建 Audio
// （见 BUG-005：内存与 CPU 暴涨）。
// ---------------------------------------------------------------
;(function () {
  const EMIT_GAP_MS = 120 // 两条飘字的最小间隔（事件风暴节流）
  const MAX_ACTIVE = 6 // 同屏飘字上限，超出丢弃最旧的一条
  const QUEUE_MAX = 8 // 排队上限，超出后金额并入队尾避免无界增长
  const COMBO_HIDE_MS = 1600 // 无新事件后隐藏 COMBO 的时间

  let enabled = true
  let pending = []
  let flushTimer = null
  let lastEmitAt = 0
  let combo = 0
  let comboTimer = null

  function layerEl() {
    return document.getElementById('damage-layer')
  }

  function comboEl() {
    return document.getElementById('combo-badge')
  }

  // 分级：缓存未命中（cache=0 且 token 量不小）视为暴击
  function tierOf(amount, data) {
    const cache = data ? data.cache : null
    const tokens = (data && Number(data.tokens)) || 0
    const cacheMiss = typeof cache === 'number' && cache === 0 && tokens >= 800
    if (cacheMiss || amount >= 0.1) return 'crit'
    if (amount >= 0.01) return 'heavy'
    return 'normal'
  }

  function fmtAmount(a) {
    if (a >= 100) return a.toFixed(1)
    if (a >= 0.1) return a.toFixed(2)
    if (a >= 0.01) return a.toFixed(3)
    return a.toFixed(4)
  }

  let hitTimer = null

  // 鲸鱼受击：白闪 + 抖动（暴击更狠）。只动 .dshwv-img 的合成层，
  // 严禁改窗口位置/尺寸（BUG-001）。
  function hitWhale(tier) {
    const img = document.getElementById('whale-img')
    if (!img) return
    const crit = tier === 'crit'
    try {
      img.classList.remove('dshwv-hit', 'dshwv-hit--crit')
      void img.offsetWidth // 强制回流以重播动画（仅单元素，开销可忽略）
      img.classList.add('dshwv-hit')
      if (crit) img.classList.add('dshwv-hit--crit')
    } catch (err) {}
    if (hitTimer) clearTimeout(hitTimer)
    hitTimer = setTimeout(() => {
      hitTimer = null
      try {
        img.classList.remove('dshwv-hit', 'dshwv-hit--crit')
      } catch (err) {}
    }, crit ? 620 : 400)
  }

  function spawn(ev) {
    const layer = layerEl()
    if (!layer) return
    const tier = ev.tier

    const el = document.createElement('div')
    el.className = 'dshwv-dmg dshwv-dmg--' + ev.tier
    el.textContent =
      (ev.merged ? '合计 -' : ev.tier === 'crit' ? '暴击 -' : '输出 -') + fmtAmount(ev.amount) + '¥'

    // 随机横向偏移与微旋，让连续飘字不完全重叠
    el.style.setProperty('--dx', (Math.random() * 40 - 20).toFixed(1) + 'px')
    el.style.setProperty('--rot', (Math.random() * 16 - 8).toFixed(1) + 'deg')
    // 纵向错位：同屏多条时依次下沉，步长需大于字号高度，否则会糊成一团
    const stack = layer.querySelectorAll('.dshwv-dmg').length % 3
    el.style.setProperty('--dy0', stack * 34 + 'px')

    el.addEventListener('animationend', () => {
      try {
        el.remove()
      } catch (err) {}
    })

    layer.appendChild(el)

    // 受击反馈与打击音
    hitWhale(tier)
    if (window.AudioManager) window.AudioManager.playHit(tier)

    // 同屏硬上限
    const live = layer.querySelectorAll('.dshwv-dmg')
    if (live.length > MAX_ACTIVE) {
      try {
        live[0].remove()
      } catch (err) {}
    }

    bumpCombo()
  }

  function bumpCombo() {
    combo += 1
    const el = comboEl()
    if (!el) return
    if (combo >= 2) {
      el.textContent = 'COMBO x' + combo
      el.classList.add('dshwv-combo-show')
      // 强制回流以重播 pop 动画（单次事件级别的微布局，可忽略）
      el.classList.remove('dshwv-combo-pop')
      void el.offsetWidth
      el.classList.add('dshwv-combo-pop')
    }
    if (comboTimer) clearTimeout(comboTimer)
    comboTimer = setTimeout(() => {
      comboTimer = null
      combo = 0
      const c = comboEl()
      if (c) c.classList.remove('dshwv-combo-show', 'dshwv-combo-pop')
    }, COMBO_HIDE_MS)
  }

  function pump() {
    flushTimer = null
    const ev = pending.shift()
    if (ev) {
      lastEmitAt = performance.now()
      try {
        spawn(ev)
      } catch (err) {
        console.error('[DamagePulse] spawn failed:', err)
      }
    }
    if (pending.length) schedule()
  }

  function schedule() {
    if (flushTimer) return
    const wait = Math.max(0, EMIT_GAP_MS - (performance.now() - lastEmitAt))
    flushTimer = setTimeout(pump, wait)
  }

  function emit(data) {
    if (!enabled || !data) return
    const amount = Number(data.amount)
    if (!isFinite(amount) || amount <= 0) return

    if (pending.length >= QUEUE_MAX) {
      const tail = pending[pending.length - 1]
      tail.amount += amount
      tail.merged = true
      tail.tier = tierOf(tail.amount, null)
    } else {
      pending.push({ amount, tier: tierOf(amount, data), merged: false })
    }
    schedule()
  }

  function clear() {
    pending = []
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (comboTimer) {
      clearTimeout(comboTimer)
      comboTimer = null
    }
    combo = 0
    const layer = layerEl()
    if (layer) {
      const live = layer.querySelectorAll('.dshwv-dmg')
      for (let i = 0; i < live.length; i++) live[i].remove()
    }
    const c = comboEl()
    if (c) c.classList.remove('dshwv-combo-show', 'dshwv-combo-pop')
  }

  window.DamagePulse = {
    emit,
    clear,
    setEnabled(v) {
      enabled = !!v
      if (!enabled) clear()
    },
    isEnabled() {
      return enabled
    },
  }
})()
