(function () {
  const MIN_SCALE = 0.6
  const MAX_SCALE = 2.5
  const STEP = 0.1
  const CLICK_SQ = 9
  const REFRESH_MS = 60000
  const CHANGE_MS = 900
  const ANIM_MS = 700
  const BUBBLE_MS = 5000

  const root = document.getElementById('whale-root')
  const body = document.getElementById('whale-body')
  const img = document.getElementById('whale-img')
  const bubbleBox = document.getElementById('whale-bubble')
  const textBox = document.getElementById('whale-text')
  const labelEl = document.getElementById('whale-label')
  const amountEl = document.getElementById('whale-amount')
  const hintEl = document.getElementById('whale-hint')
  const pillFillEl = document.getElementById('pill-fill')
  const pillChipEl = document.getElementById('pill-chip')
  const pillAmountEl = document.getElementById('pill-amount')
  const gifEl = document.getElementById('whale-gif')
  const menuBtn = document.getElementById('menu-btn')
  const menuBox = document.getElementById('menu-box')
  const menuHeader = document.getElementById('menu-header')
  const appContainer = document.getElementById('app-container')

  // Menu Inputs
  const scaleInput = document.getElementById('scale-range')
  const scaleNumber = document.getElementById('scale-number')
  const soundSelect = document.getElementById('sound-select')
  const volInput = document.getElementById('vol-range')
  const volPct = document.getElementById('vol-pct')
  const usageSelect = document.getElementById('usage-select')
  const peakSelect = document.getElementById('peak-select')
  const bubbleToggle = document.getElementById('bubble-toggle')
  const damageToggle = document.getElementById('damage-toggle')
  const pillLenRange = document.getElementById('pill-len-range')
  const pillLenVal = document.getElementById('pill-len-val')
  const pillToggle = document.getElementById('pill-toggle')
  const pillDxRange = document.getElementById('pill-dx-range')
  const pillDxVal = document.getElementById('pill-dx-val')
  const pillBox = document.getElementById('balance-pill')
  const snapInput = document.getElementById('snap-range')
  const snapVal = document.getElementById('snap-val')
  const turnCostToggle = document.getElementById('turn-cost-toggle')
  const turnCostCloseInput = document.getElementById('turn-cost-close')
  const openChatBtn = document.getElementById('open-chat-btn')
  const openSettingsBtn = document.getElementById('open-settings-btn')

  let state = {
    scale: 1.5,
    h: 'right', // 'left' | 'right' | null
    v: 'bottom', // 'top' | 'bottom' | null
    balance: null,
    currency: 'CNY',
    todayUsage: null,
    isPeak: false,
    status: 'loading',
    message: '',
  }

  let busy = false
  let refreshQueued = false
  let refreshQueuedManual = false
  let settleTimer = null
  let animDelayTimer = null
  let drag = null
  let shown = null
  let animId = null
  let bubbleShown = false
  let bubbleTimer = null
  let bubbleRandomActive = false
  let bubbleRandomLines = null
  let costBubbleActive = false
  let costBubbleTimer = null
  let lastCostSeq = 0

  let soundOn = true
  let soundVol = 0.9
  let soundSet = 'duck'
  let usageMode = 'ledger'
  let peakMode = 'default'
  let bubbleOn = true
  let damageOn = true
  let pillLen = 1
  let pillOn = true
  let pillDx = 0
  let snapThreshold = 60
  let turnCostOn = true
  let turnCostCloseMs = 5000

  const BUBBLE_STYLE_CLASS = {
    A: 'dshwv-label',
    B: 'dshwv-amount',
    P: 'dshwv-period',
    C: 'dshwv-hint',
  }

  function pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
  }

  function singleCenter(style, text, color, wrap) {
    return [null, { t: text, s: style, c: color || '', w: !!wrap }, null]
  }

  function buildGroup1() {
    const peak = !!state.isPeak
    let offText = '空闲时段'
    let peakText = '高峰时段'
    if (peakMode === 'liangwen') {
      offText = '梁文谷'
      peakText = '梁文峰'
    } else if (peakMode === 'qiangqiang') {
      offText = '!?谷谷?!'
      peakText = '!?峰峰?!'
    }
    return [
      { t: '当前时间段为:', s: 'A', c: '' },
      { t: peak ? peakText : offText, s: 'P', c: peak ? '#e0433f' : '#2fa24c' },
      { t: '今日已用 ' + fmt(state.todayUsage, state.currency), s: 'C', c: '' },
    ]
  }

  const RANDOM_GROUPS = [
    { w: 45, lines: buildGroup1 },
    { w: 7, lines: () => singleCenter('B', pickOne(['好模型... ↓', '好女孩...↓'])) },
    {
      w: 7,
      lines: () =>
        singleCenter(
          'A',
          pickOne([
            '不知道用户有什么用，先赶走吧~',
            '我...我...我也要挣钱吗？',
            '我去吃饭啦，测完叫我',
            '压力一只蓝色大肥鱼？！',
            'DeepSleep...',
            '坏了...用户彻底怒了！',
          ]),
          '',
          true
        ),
    },
    { w: 10, lines: () => ({ gif: true }) },
    {
      w: 3,
      lines: () =>
        singleCenter(
          'A',
          pickOne([
            '你目录里的dsh是什么...大烧货吗...?',
            '恭喜你实现token自由！token全跑了！',
            '真当我是便宜货啊...',
          ]),
          '',
          true
        ),
    },
    { w: 1, lines: () => singleCenter('B', '哦鲸鲸... ') },
  ]

  function pickRandomLines() {
    let total = 0
    for (let i = 0; i < RANDOM_GROUPS.length; i++) total += RANDOM_GROUPS[i].w
    let r = Math.random() * total
    for (let i = 0; i < RANDOM_GROUPS.length; i++) {
      r -= RANDOM_GROUPS[i].w
      if (r < 0) return RANDOM_GROUPS[i].lines()
    }
    return RANDOM_GROUPS[RANDOM_GROUPS.length - 1].lines()
  }

  let gifFadeTimer = null
  let hintFadeTimer = null
  let bubbleSwapTimer = null
  let lastHintText = null

  function applyBubbleLines(lines) {
    if (lines && lines.gif) {
      if (gifFadeTimer) {
        clearTimeout(gifFadeTimer)
        gifFadeTimer = null
      }
      gifEl.style.display = 'block'
      gifEl.style.opacity = ''
      labelEl.style.display = 'none'
      amountEl.style.display = 'none'
      hintEl.style.display = 'none'
      return
    }

    if (gifFadeTimer) {
      clearTimeout(gifFadeTimer)
      gifFadeTimer = null
    }
    gifEl.style.display = 'none'
    gifEl.style.opacity = ''

    const els = [labelEl, amountEl, hintEl]
    for (let i = 0; i < 3; i++) {
      const el = els[i]
      const ln = lines && lines[i]
      if (ln) {
        el.style.display = ''
        el.className = (BUBBLE_STYLE_CLASS[ln.s] || 'dshwv-label') + (ln.w ? ' dshwv-wrap' : '')
        el.textContent = ln.t
        el.style.color = ln.c || ''
      } else {
        el.style.display = 'none'
        el.textContent = ''
        el.style.color = ''
      }
    }
  }

  function setHint(text) {
    if (text === lastHintText) return
    const first = lastHintText === null
    lastHintText = text
    if (first || !bubbleShown) {
      hintEl.textContent = text
      return
    }
    hintEl.style.transition = 'opacity .18s ease'
    hintEl.style.opacity = '0'
    hintFadeTimer = setTimeout(() => {
      hintFadeTimer = null
      hintEl.textContent = text
      hintEl.style.opacity = '1'
      setTimeout(() => {
        hintEl.style.transition = ''
        hintEl.style.opacity = ''
      }, 220)
    }, 190)
  }

  function swapBubbleContent(applyFn) {
    if (bubbleSwapTimer) {
      clearTimeout(bubbleSwapTimer)
      bubbleSwapTimer = null
    }
    textBox.style.transition = 'opacity .18s ease'
    textBox.style.opacity = '0'
    bubbleSwapTimer = setTimeout(() => {
      bubbleSwapTimer = null
      applyFn()
      textBox.style.opacity = '1'
      setTimeout(() => {
        textBox.style.transition = ''
        textBox.style.opacity = ''
      }, 220)
    }, 190)
  }

  function restoreBubbleLines() {
    if (bubbleSwapTimer) {
      clearTimeout(bubbleSwapTimer)
      bubbleSwapTimer = null
    }
    if (hintFadeTimer) {
      clearTimeout(hintFadeTimer)
      hintFadeTimer = null
    }
    if (gifFadeTimer) {
      clearTimeout(gifFadeTimer)
      gifFadeTimer = null
    }
    lastHintText = null
    textBox.style.transition = ''
    textBox.style.opacity = ''
    gifEl.style.display = 'none'
    gifEl.style.opacity = ''
    labelEl.style.display = ''
    labelEl.className = 'dshwv-label'
    labelEl.textContent = 'DeepSeek 余额'
    labelEl.style.color = ''
    amountEl.style.display = ''
    amountEl.className = 'dshwv-amount'
    amountEl.style.color = ''
    hintEl.style.display = ''
    hintEl.className = 'dshwv-hint'
    hintEl.style.color = ''
    render()
  }

  function showBubble() {
    if (!bubbleOn) return
    if (costBubbleActive) return
    if (bubbleTimer) {
      clearTimeout(bubbleTimer)
      bubbleTimer = null
    }
    if (gifFadeTimer) {
      clearTimeout(gifFadeTimer)
      gifFadeTimer = null
    }
    bubbleShown = true
    bubbleRandomActive = false
    restoreBubbleLines()
    bubbleBox.classList.add('dshwv-bubble-open')
    bubbleTimer = setTimeout(hideBubble, BUBBLE_MS)
  }

  function hideBubble() {
    if (bubbleTimer) {
      clearTimeout(bubbleTimer)
      bubbleTimer = null
    }
    if (bubbleSwapTimer) {
      clearTimeout(bubbleSwapTimer)
      bubbleSwapTimer = null
    }
    if (hintFadeTimer) {
      clearTimeout(hintFadeTimer)
      hintFadeTimer = null
    }
    textBox.style.transition = ''
    textBox.style.opacity = ''
    hintEl.style.transition = ''
    hintEl.style.opacity = ''
    bubbleRandomActive = false
    bubbleRandomLines = null
    bubbleShown = false
    bubbleBox.classList.remove('dshwv-bubble-open')
    gifFadeTimer = setTimeout(() => {
      gifFadeTimer = null
      gifEl.style.display = 'none'
    }, 240)
  }

  function showCostBubble(amount) {
    if (!bubbleOn || !turnCostOn) return
    if (costBubbleTimer) {
      clearTimeout(costBubbleTimer)
      costBubbleTimer = null
    }
    if (bubbleTimer) {
      clearTimeout(bubbleTimer)
      bubbleTimer = null
    }
    if (gifFadeTimer) {
      clearTimeout(gifFadeTimer)
      gifFadeTimer = null
    }
    costBubbleActive = true
    bubbleRandomActive = false
    bubbleShown = true
    lastHintText = null

    gifEl.style.display = 'none'
    gifEl.style.opacity = ''
    labelEl.style.display = ''
    labelEl.className = 'dshwv-label'
    labelEl.textContent = '上一轮对话消耗:'
    labelEl.style.color = ''
    amountEl.style.display = ''
    amountEl.className = 'dshwv-amount'
    amountEl.textContent = '¥ ' + (isFinite(amount) ? Number(amount).toFixed(2) : '--')
    amountEl.style.color = '#e0433f'
    hintEl.style.display = 'none'
    hintEl.textContent = ''
    hintEl.style.color = ''
    textBox.style.transition = ''
    textBox.style.opacity = ''
    bubbleBox.classList.add('dshwv-bubble-open')

    if (turnCostCloseMs > 0) {
      costBubbleTimer = setTimeout(hideCostBubble, turnCostCloseMs)
    }
  }

  function hideCostBubble() {
    if (costBubbleTimer) {
      clearTimeout(costBubbleTimer)
      costBubbleTimer = null
    }
    costBubbleActive = false
    hideBubble()
  }

  bubbleBox.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!bubbleShown) return
    if (costBubbleActive) {
      hideCostBubble()
      return
    }
    if (bubbleRandomActive) {
      hideBubble()
    } else {
      bubbleRandomActive = true
      bubbleRandomLines = pickRandomLines()
      swapBubbleContent(() => {
        applyBubbleLines(bubbleRandomLines)
      })
    }
  })

  function fmt(balance, currency) {
    const num = Number(balance)
    const fixed = isFinite(num) ? num.toFixed(2) : '--'
    return currency === 'CNY' ? '¥ ' + fixed : fixed + ' ' + currency
  }

  function animateAmount(from, to, currency, duration) {
    if (costBubbleActive) return
    if (animId) cancelAnimationFrame(animId)
    if (from === null || !isFinite(from)) from = to
    if (from === to) {
      shown = to
      amountEl.textContent = fmt(to, currency)
      return
    }
    let startTime = null
    function step(ts) {
      if (startTime === null) startTime = ts
      const t = Math.min(1, (ts - startTime) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const val = from + (to - from) * eased
      amountEl.textContent = fmt(val, currency)
      if (t < 1) {
        animId = requestAnimationFrame(step)
      } else {
        animId = null
        shown = to
        amountEl.textContent = fmt(to, currency)
      }
    }
    animId = requestAnimationFrame(step)
  }

  // 常驻余额血条（不随气泡开关隐藏）：
  // 剩余 = 余额 / (余额 + 今日已用)，低于 50% 转橙、20% 转红闪烁
  function updateHp() {
    if (!pillFillEl) return
    const bal = Number(state.balance)
    const used = Number(state.todayUsage)
    let ratio = 1
    if (isFinite(bal) && isFinite(used) && used > 0) {
      ratio = (bal + used) > 0 ? bal / (bal + used) : 0
    } else if (isFinite(bal) && bal <= 0) {
      ratio = 0
    }
    if (!isFinite(ratio)) ratio = 1
    ratio = Math.max(0, Math.min(1, ratio))
    pillFillEl.style.width = (ratio * 100).toFixed(1) + '%'
    pillFillEl.classList.toggle('is-warn', ratio <= 0.5 && ratio > 0.2)
    pillFillEl.classList.toggle('is-danger', ratio <= 0.2)

    if (pillAmountEl) {
      const hasBal = state.balance !== null && state.balance !== undefined && isFinite(bal)
      pillAmountEl.textContent = !hasBal
        ? '…'
        : state.currency === 'CNY'
          ? '¥ ' + bal.toFixed(2)
          : bal.toFixed(2) + ' ' + state.currency
    }

    if (pillChipEl) {
      const peak = !!state.isPeak
      pillChipEl.textContent = peak ? '峰' : '谷'
      pillChipEl.className = 'dshwv-pill-chip ' + (peak ? 'dshwv-pill-chip-on' : 'dshwv-pill-chip-off')
    }
  }

  function render() {
    updateHp()
    if (costBubbleActive) return
    let amount, hint
    if (state.status === 'error') {
      amount = shown !== null ? fmt(shown, state.currency) : '--'
      hint = state.message ? state.message.slice(0, 14) : '获取失败 · 点击重试'
    } else if (state.balance === null) {
      amount = shown !== null ? fmt(shown, state.currency) : '…'
      hint = '加载中…'
    } else {
      amount = shown !== null ? fmt(shown, state.currency) : fmt(state.balance, state.currency)
      hint =
        '今日已用 ' +
        (state.todayUsage !== null && state.todayUsage !== undefined
          ? fmt(state.todayUsage, state.currency)
          : '--')
    }
    amountEl.textContent = amount
    if (bubbleRandomActive && bubbleRandomLines) {
      applyBubbleLines(bubbleRandomLines)
    } else {
      setHint(hint)
    }
  }

  async function refresh(manual) {
    if (busy) {
      // 正在刷新时来新请求：排队而不是丢弃（丢弃会让测试模式的血条慢一拍）
      refreshQueued = true
      refreshQueuedManual = refreshQueuedManual || !!manual
      return
    }
    busy = true
    if (animDelayTimer) {
      clearTimeout(animDelayTimer)
      animDelayTimer = null
    }
    if (manual || state.balance === null) {
      state.status = 'loading'
      render()
    }

    try {
      const data = await window.electronAPI.getBalance(manual)
      if (data && data.ok) {
        const nb = Number(data.totalBalance)
        const nc = String(data.currency || 'CNY')
        const changed = state.balance !== null && (nb !== state.balance || nc !== state.currency)
        const currencyChanged = state.currency !== null && nc !== state.currency

        state.balance = nb
        state.currency = nc
        state.message = ''
        state.todayUsage = data.todayUsage !== undefined ? data.todayUsage : null
        state.isPeak = !!data.isPeak

        if (changed && !currencyChanged) {
          if (!manual) {
            showBubble()
            state.status = 'changing'
            animDelayTimer = setTimeout(() => {
              animDelayTimer = null
              animateAmount(shown, nb, nc, ANIM_MS)
            }, 300)
            settleTimer = setTimeout(() => {
              settleTimer = null
              if (state.status === 'changing') {
                state.status = 'ok'
                render()
              }
            }, CHANGE_MS + 300)
          } else {
            animateAmount(shown, nb, nc, ANIM_MS)
            state.status = 'ok'
            render()
          }
        } else {
          if (animId === null) shown = nb
          state.status = 'ok'
          render()
        }
      } else {
        state.status = 'error'
        state.message = data && data.error ? String(data.error) : '获取失败'
        render()
      }
    } catch (err) {
      state.status = 'error'
      state.message = '网络异常'
      render()
    } finally {
      busy = false
      if (refreshQueued) {
        const m = refreshQueuedManual
        refreshQueued = false
        refreshQueuedManual = false
        refresh(m)
      }
    }
  }

  function saveConfig() {
    try {
      window.electronAPI.saveConfig({
        scale: state.scale,
        sound: soundOn,
        vol: soundVol,
        soundSet: soundSet,
        usageMode: usageMode,
        peakMode: peakMode,
        bubbleOn: bubbleOn,
        damageOn: damageOn,
        pillLen: pillLen,
        pillOn: pillOn,
        pillDx: pillDx,
        turnCostOn: turnCostOn,
        turnCostCloseMs: turnCostCloseMs,
        snapThreshold: snapThreshold,
      })
    } catch (err) {}
  }

  function scaleToDisplay(s) {
    return Math.round(((s - MIN_SCALE) / ((MAX_SCALE - MIN_SCALE) / 19))) + 1
  }

  // -------------------------------------------------------------
  // Scale slider: apply CSS instantly, resize the OS window lazily.
  // Resizing a transparent layered window on Windows reallocates the
  // DWM compositor surface (see BUG-001), so per-input-event resizes
  // cause visible flicker. While the user drags (menu open) the window
  // is FROZEN — only the CSS scale changes — and it is resized exactly
  // once on release. External config changes (menu closed) still resize
  // through a short debounce.
  // -------------------------------------------------------------
  let scaleResizeTimer = null
  let scaleResizeSeq = 0

  function scheduleResize() {
    scaleResizeSeq++
    const seq = scaleResizeSeq
    if (scaleResizeTimer) clearTimeout(scaleResizeTimer)
    scaleResizeTimer = setTimeout(() => {
      scaleResizeTimer = null
      if (seq === scaleResizeSeq) flushWindowResize(seq)
    }, 150)
  }

  // Scale changes are persisted debounced (off the release hot path) so the
  // synchronous disk write can never cause a visible hitch right when the
  // slider is released.
  let scaleSaveTimer = null
  function scheduleScaleSave() {
    if (scaleSaveTimer) clearTimeout(scaleSaveTimer)
    scaleSaveTimer = setTimeout(() => {
      scaleSaveTimer = null
      saveConfig()
    }, 400)
  }
  function commitScaleSave() {
    if (scaleSaveTimer) {
      clearTimeout(scaleSaveTimer)
      scaleSaveTimer = null
    }
    saveConfig()
  }

  let menuOffset = { x: 0, y: 0 }
  let menuDrag = null
  let menuDragRafId = null

  function resetMenuOffset() {
    menuOffset = { x: 0, y: 0 }
    menuBox.style.setProperty('--menu-dx', '0px')
    menuBox.style.setProperty('--menu-dy', '0px')
  }

  // Anchor the open menu to the whale's bottom-right corner at a FIXED
  // pixel offset (instead of a percentage of the whale height). While the
  // window is frozen during a scale drag, the menu therefore stays exactly
  // stationary under the cursor instead of shifting up/down with the whale.
  function anchorMenuToWindow() {
    const rootH = root.offsetHeight || Math.round(180 * state.scale)
    menuBox.style.bottom = Math.round(0.5945 * rootH + 10) + 'px'
    if (state.h === 'left') {
      menuBox.style.right = 'auto'
      menuBox.style.left = '11px'
    } else {
      menuBox.style.left = 'auto'
      menuBox.style.right = '11px'
    }
    resetMenuOffset()
  }

  function applyScale(v, save = true) {
    const next = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(v))) * 10) / 10
    state.scale = next
    root.style.setProperty('--dshw-scale', String(next))
    scaleInput.value = String(next)
    scaleNumber.value = String(scaleToDisplay(next))

    if (save) {
      // Slider released: NOTHING visual happens here — the window and menu
      // stay exactly where they were during the drag, so releasing can never
      // flash. Only the scale is persisted, debounced off this hot path.
      if (scaleResizeTimer) {
        clearTimeout(scaleResizeTimer)
        scaleResizeTimer = null
      }
      scheduleScaleSave()
    } else if (!menuOpen) {
      // External config change (menu closed): resize once, debounced.
      scheduleResize()
    }
    // While dragging (menu open): the window stays frozen — only the CSS
    // scale changes, so the whale scales in place with zero window churn
    // (no DWM surface rebuilds, no flicker, no menu movement).
  }

  // Minimum window height needed to show the whole hamburger menu.
  // The menu is a child of .dshwv-root and opens upward from the whale, so
  // when the whale (and window) get small the menu top overflows the window
  // and the OS clips its first rows (the size slider). offsetTop/offsetHeight
  // read untransformed layout, so the open/close scale animation is ignored.
  function menuNeededWindowHeight() {
    const rootH = root.offsetHeight || Math.round(180 * state.scale)
    return Math.ceil(rootH + 25 - menuBox.offsetTop)
  }

  async function flushWindowResize(seq, givenBounds, givenWorkArea, forceDx) {
    const basePx = Math.round(180 * state.scale)
    // 血条变长 / 向左微调都要向左伸出 root，窗口必须同步加宽，否则血条被裁
    const dxUsed = forceDx === undefined || forceDx === null ? pillDx : forceDx
    const pillExtra = Math.max(
      180,
      Math.ceil(basePx * (0.78 * pillLen - 0.36) + 24 + Math.abs(dxUsed))
    )
    let winWidth = basePx + pillExtra
    let winHeight = basePx + 200
    // While the menu is open, never shrink the window below the menu size,
    // otherwise its top rows (e.g. the size slider) get clipped again.
    if (menuOpen) winHeight = Math.max(winHeight, menuNeededWindowHeight())

    const currentBounds = givenBounds || (await window.electronAPI.getWindowBounds())
    const workArea = givenWorkArea || (await window.electronAPI.getWorkArea())
    if (seq !== undefined && seq !== scaleResizeSeq) return null // stale flush

    let newX = currentBounds.x
    let newY = currentBounds.y

    if (state.h === 'right') {
      newX = workArea.x + workArea.width - winWidth
    } else if (state.h === 'left') {
      newX = workArea.x
    } else if (currentBounds.width !== winWidth) {
      // Free position: keep the whale's bottom-right corner fixed
      // (the whale is anchored bottom-right inside the window).
      newX = currentBounds.x + (currentBounds.width - winWidth)
    }

    if (state.v === 'bottom') {
      newY = workArea.y + workArea.height - winHeight
    } else if (state.v === 'top') {
      newY = workArea.y
    } else if (currentBounds.height !== winHeight) {
      newY = currentBounds.y + (currentBounds.height - winHeight)
    }

    newX = Math.max(workArea.x, Math.min(workArea.x + workArea.width - winWidth, newX))
    newY = Math.max(workArea.y, Math.min(workArea.y + workArea.height - winHeight, newY))

    const applied = { x: newX, y: newY, width: winWidth, height: winHeight }
    window.electronAPI.setWindowBounds(applied)
    return applied
  }

  // When the menu opens, grow the window upward if the current (possibly
  // small) window height would clip the menu; keep the whale on screen.
  async function fitWindowForMenu() {
    const bounds = await window.electronAPI.getWindowBounds()
    const needed = menuNeededWindowHeight()
    if (bounds.height >= needed) return
    const grow = needed - bounds.height
    const workArea = await window.electronAPI.getWorkArea()
    const newY = Math.max(workArea.y - 5, bounds.y - grow)
    window.electronAPI.setWindowBounds({
      x: bounds.x,
      y: newY,
      width: bounds.width,
      height: bounds.height + grow,
    })
  }

  function applyVol(v, save = true) {
    const next = Math.round(Math.min(1, Math.max(0, Number(v))) * 100) / 100
    soundVol = next
    soundOn = next > 0
    volInput.value = String(next)
    volPct.textContent = Math.round(next * 100) + '%'
    window.AudioManager.setVolume(next)
    if (save) saveConfig()
  }

  function applySoundSet(v, save = true) {
    soundSet = v === 'fx1' ? 'fx1' : 'duck'
    soundSelect.value = soundSet
    window.AudioManager.applySoundSet(soundSet, soundVol, soundOn)
    if (save) saveConfig()
  }

  function applyUsageMode(v, save = true) {
    usageMode = v === 'token' ? 'token' : 'ledger'
    usageSelect.value = usageMode
    if (save) {
      saveConfig()
      refresh(false)
    }
  }

  function applyPeakMode(v, save = true) {
    peakMode = v === 'liangwen' || v === 'qiangqiang' ? v : 'default'
    peakSelect.value = peakMode
    if (save) saveConfig()
  }

  function applyBubbleOn(v, save = true) {
    bubbleOn = !!v
    bubbleToggle.checked = bubbleOn
    if (!bubbleOn) hideBubble()
    if (save) saveConfig()
  }

  function applyDamageOn(v, save = true) {
    damageOn = !!v
    if (damageToggle) damageToggle.checked = damageOn
    if (window.DamagePulse) window.DamagePulse.setEnabled(damageOn)
    if (save) saveConfig()
  }

  // 常驻血条长度（0.6x ~ 1.6x）：只改 CSS 变量，右端始终停在小鲸鱼左侧
  function applyPillLen(v, save = true) {
    const num = Number(v)
    const n = isFinite(num) ? Math.max(0.6, Math.min(1.6, Math.round(num * 10) / 10)) : 1
    const prev = pillLen
    pillLen = n
    root.style.setProperty('--dshw-pill-len', String(n))
    if (pillLenRange) pillLenRange.value = String(n)
    if (pillLenVal) pillLenVal.textContent = n.toFixed(1) + 'x'
    if (n !== prev) scheduleResize() // 血条变长 → 窗口同步加宽，否则左边被裁
    if (save) schedulePillLenSave()
  }

  let pillLenSaveTimer = null
  function schedulePillLenSave() {
    // 拖滑条过程中高频落盘会卡顿（BUG-005），防抖合并
    if (pillLenSaveTimer) clearTimeout(pillLenSaveTimer)
    pillLenSaveTimer = setTimeout(() => {
      pillLenSaveTimer = null
      saveConfig()
    }, 400)
  }

  // 菜单「血条」开关：只切 class，不移除节点（避免回流）
  function applyPillOn(v, save = true) {
    pillOn = v !== false
    if (pillToggle) pillToggle.checked = pillOn
    if (pillBox) pillBox.classList.toggle('dshwv-pill-off', !pillOn)
    if (save) saveConfig()
  }

  function setPillDxCss(visualDx) {
    const v = Math.round(visualDx)
    // 配置与滑条存的是「屏幕视觉方向」；左吸附时整体镜像，写进 CSS 前取反
    const local = root.classList.contains('dshwv-left') ? -v : v
    root.style.setProperty('--dshw-pill-dx', local + 'px')
    if (pillDxRange) pillDxRange.value = String(Math.max(-240, Math.min(120, v)))
    if (pillDxVal) pillDxVal.textContent = v + 'px'
  }

  let pillDxSaveTimer = null
  function schedulePillDxSave() {
    if (pillDxSaveTimer) clearTimeout(pillDxSaveTimer)
    pillDxSaveTimer = setTimeout(() => {
      pillDxSaveTimer = null
      saveConfig()
    }, 400)
  }

  // 血条位置夹取：必须同时满足「不压小鲸鱼」与「不出窗口」，
  // 且要考虑左吸附镜像 —— 镜像后血条跑到小鲸鱼右边，约束方向是反的。
  // 基准必须读 CSS 里"当前实际生效"的值：拖拽中 CSS 每帧都在变，而模块变量
  // pillDx 要等松手才更新，用它当基准会让松手瞬间的重新夹取把位置弹回原点。
  //   clampWindow=false 时只夹"不压小鲸鱼"，窗口边界交给 resize 公式去提供空间
  //   （滑条一次就能拉到 -120；拖拽过程中仍需窗口边界夹取，因为窗口是分步加宽的）
  function clampPillDx(dx, clampWindow) {
    if (!pillBox) return dx
    const pr = pillBox.getBoundingClientRect()
    if (!pr.width) return dx // 尚未完成布局，不做几何夹取
    const wr = img.getBoundingClientRect()
    const mirrored = root.classList.contains('dshwv-left')
    const cssDx = parseFloat(getComputedStyle(root).getPropertyValue('--dshw-pill-dx'))
    const rawCss = isFinite(cssDx) ? cssDx : 0
    const applied = mirrored ? -rawCss : rawCss
    const kLeft = pr.left - applied // 未偏移基准：rect 里已含 applied，先减掉
    const kRight = pr.right - applied

    let min = clampWindow === false ? -Infinity : Math.round(4 - kLeft) // 窗口左边界
    let max = clampWindow === false ? Infinity : Math.round(window.innerWidth - 4 - kRight) // 窗口右边界
    if (mirrored) {
      // 镜像：血条在小鲸鱼右侧，只能向右让开，不能向左压进去
      min = Math.max(min, Math.round(wr.right + 8 - kLeft))
    } else {
      // 常规：血条在小鲸鱼左侧，只能向左让开，不能向右压进去
      max = Math.min(max, Math.round(wr.left - 8 - kRight))
    }
    // 几何退化（窗口尺寸与吸附模式不一致时 min > max）就放弃几何夹取
    if (min > max) return clampPillDxAbs(dx)
    return clampPillDxAbs(Math.max(min, Math.min(max, Math.round(dx))))
  }

  function clampPillDxAbs(v) {
    const n = Number(v)
    if (!isFinite(n)) return 0
    return Math.max(-240, Math.min(120, Math.round(n)))
  }

  // 血条位置左右微调：dx<0 向左（窗口需要加宽），dx>0 向右（被小鲸鱼限制）
  function applyPillDx(v, save = true) {
    const num = Number(v)
    let dx = isFinite(num) ? Math.max(-240, Math.min(120, Math.round(num))) : 0
    dx = clampPillDx(dx, false)
    pillDx = dx
    setPillDxCss(dx)
    // 注意：input 事件已经把 pillDx 更新过了，change 时 changed 恒为 false，
    // 所以这里不能用 changed 判断 —— 只要落盘就必须让窗口跟着尺寸走。
    // 拖动过程只改 CSS；松手才让窗口跟随（BUG-001：拖动中 setBounds 会卡死）。
    if (save) scheduleResize()
    if (save) schedulePillDxSave()
  }

  // ---------------- 血条位置拖拽（仅水平方向） ----------------
  let pillDrag = null
  let pillDragRaf = null
  let pillDragGrows = 0

  function startPillDrag(e) {
    if (e.button !== 0 || !pillOn) return
    e.preventDefault()
    e.stopPropagation()
    window.electronAPI.setIgnoreMouseEvents(false)
    pillDrag = {
      active: true,
      startX: e.screenX,
      startDx: pillDx,
      curDx: pillDx,
      appliedDx: pillDx, // 冗余记录，夹取基准统一读 CSS（见 clampPillDx 注释）
      acc: 0,
      moved: false,
    }
    pillDragGrows = 0
    if (pillBox) pillBox.classList.add('dshwv-pill-dragging')
    window.addEventListener('mousemove', onPillDragMove, { capture: true, passive: false })
    window.addEventListener('mouseup', onPillDragEnd, { capture: true, passive: false })
  }

  function onPillDragMove(e) {
    if (!pillDrag || !pillDrag.active) return
    e.preventDefault()
    e.stopPropagation()
    // 屏幕坐标累加：拖动途中窗口可能加宽、视口原点会平移，位移量本身不受影响
    pillDrag.acc = e.screenX - pillDrag.startX
    if (!pillDrag.moved && Math.abs(pillDrag.acc) > 3) pillDrag.moved = true
    if (!pillDragRaf) pillDragRaf = requestAnimationFrame(pillDragFrame)
  }

  function pillDragFrame() {
    pillDragRaf = null
    if (!pillDrag || !pillDrag.active) return

    // 夹取基准必须先减掉"当前已应用的 dx"，否则 dxMin/dxMax 会把 dx 重复计入
    let dx = clampPillDx(pillDrag.startDx + pillDrag.acc)
    pillDrag.curDx = dx
    setPillDxCss(dx)

    // 左侧（镜像时是右侧）空间不够就按需加宽窗口：每次约 120px、整轮最多 4 次
    // 绝不每帧 setBounds（BUG-001：DWM 每帧重建显存表面会卡死）
    const pr = pillBox.getBoundingClientRect()
    const mirrored = root.classList.contains('dshwv-left')
    const nearEdge = mirrored ? pr.right > window.innerWidth - 16 : pr.left < 16
    if (nearEdge && pillDragGrows < 4) {
      pillDragGrows++
      flushWindowResize(undefined, null, null, mirrored ? dx + 120 : dx - 120)
    }
  }

  function onPillDragEnd(e) {
    if (!pillDrag || !pillDrag.active) return
    e.preventDefault()
    e.stopPropagation()

    window.removeEventListener('mousemove', onPillDragMove, { capture: true })
    window.removeEventListener('mouseup', onPillDragEnd, { capture: true })
    if (pillDragRaf) {
      cancelAnimationFrame(pillDragRaf)
      pillDragRaf = null
    }

    const finalDx = pillDrag.curDx
    const moved = pillDrag.moved
    pillDrag = null
    if (pillBox) pillBox.classList.remove('dshwv-pill-dragging')

    if (moved) applyPillDx(finalDx, true) // 落盘 + 按最终位置把窗口收紧
  }

  function applySnapThreshold(v, save = true) {
    const next = Math.max(0, Math.min(200, Math.round(Number(v) || 0)))
    snapThreshold = next
    if (snapInput) snapInput.value = String(next)
    if (snapVal) snapVal.textContent = next === 0 ? '关闭' : `${next}px`
    if (save) saveConfig()
  }

  function applyTurnCostOn(v, save = true) {
    turnCostOn = !!v
    turnCostToggle.checked = turnCostOn
    if (!turnCostOn) hideCostBubble()
    if (save) saveConfig()
  }

  function applyTurnCostClose(v, save = true) {
    const n = Math.max(0, Math.round(Number(v) || 0))
    turnCostCloseMs = n * 1000
    turnCostCloseInput.value = String(n)
    if (save) saveConfig()
  }

  // SQUISH & Press Interaction
  const SQUISH = 'scaleY(0.88) scaleX(1.05)'
  function pressDown() {
    body.style.transform = SQUISH
    window.AudioManager.onSquishDown()
  }

  function pressUp() {
    body.style.transform = 'scaleY(1) scaleX(1)'
    window.AudioManager.onSquishUp()
  }

  // Menu Handling
  let menuOpen = false
  function toggleMenu() {
    menuOpen = !menuOpen
    if (menuOpen) {
      anchorMenuToWindow()
    }
    menuBox.classList.toggle('dshwv-menu-open', menuOpen)
    menuBtn.classList.toggle('dshwv-menu-btn-visible', menuOpen)
    if (menuOpen) {
      window.electronAPI.setIgnoreMouseEvents(false)
      fitWindowForMenu()
    } else {
      resetMenuOffset()
    }
    // On close the window keeps its current size — it is tightened to the
    // whale scale at the next whale drag — so closing the menu can never
    // trigger a resize flash either.
  }

  function closeMenu() {
    if (!menuOpen) return
    menuOpen = false
    menuBox.classList.remove('dshwv-menu-open')
    menuBtn.classList.remove('dshwv-menu-btn-visible')
    resetMenuOffset()
    // Commit the scale change (deferred from slider release) on menu close.
    commitScaleSave()
  }

  // -------------------------------------------------------------
  // Menu Dragging Implementation (Free drag with window bounds clamp)
  // -------------------------------------------------------------
  function onMenuDragStart(e) {
    if (e.button !== 0) return
    if (!menuOpen) return

    // Ignore interactive controls inside the menu
    const target = e.target
    if (target.closest('input, select, button, a, label, .dshwv-range, .dshwv-sound, .dshwv-number, .dshwv-check, .dshwv-settings-btn')) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    const menuRect = menuBox.getBoundingClientRect()
    const containerW = window.innerWidth
    const containerH = window.innerHeight

    menuDrag = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origDx: menuOffset.x,
      origDy: menuOffset.y,
      baseLeft: menuRect.left - menuOffset.x,
      baseTop: menuRect.top - menuOffset.y,
      width: menuRect.width,
      height: menuRect.height,
      containerW,
      containerH,
      moved: false,
    }

    menuBox.classList.add('dshwv-menu-dragging')

    window.addEventListener('mousemove', onMenuDragMove, { capture: true, passive: false })
    window.addEventListener('mouseup', onMenuDragEnd, { capture: true, passive: false })
  }

  function onMenuDragMove(e) {
    if (!menuDrag || !menuDrag.active) return
    e.preventDefault()
    e.stopPropagation()

    const rawDx = e.clientX - menuDrag.startX
    const rawDy = e.clientY - menuDrag.startY

    if (rawDx * rawDx + rawDy * rawDy >= 4) {
      menuDrag.moved = true
    }

    let targetDx = menuDrag.origDx + rawDx
    let targetDy = menuDrag.origDy + rawDy

    // Clamp within window bounds so menu cannot be dragged out of visible area
    const minDx = -menuDrag.baseLeft + 6
    const maxDx = menuDrag.containerW - menuDrag.baseLeft - menuDrag.width - 6
    const minDy = -menuDrag.baseTop + 6
    const maxDy = menuDrag.containerH - menuDrag.baseTop - menuDrag.height - 6

    if (minDx <= maxDx) {
      targetDx = Math.max(minDx, Math.min(maxDx, targetDx))
    }
    if (minDy <= maxDy) {
      targetDy = Math.max(minDy, Math.min(maxDy, targetDy))
    }

    menuOffset.x = targetDx
    menuOffset.y = targetDy

    if (!menuDragRafId) {
      menuDragRafId = requestAnimationFrame(() => {
        menuDragRafId = null
        if (menuDrag && menuDrag.active) {
          menuBox.style.setProperty('--menu-dx', `${menuOffset.x}px`)
          menuBox.style.setProperty('--menu-dy', `${menuOffset.y}px`)
        }
      })
    }
  }

  function onMenuDragEnd(e) {
    if (!menuDrag || !menuDrag.active) return
    e.preventDefault()
    e.stopPropagation()

    window.removeEventListener('mousemove', onMenuDragMove, { capture: true })
    window.removeEventListener('mouseup', onMenuDragEnd, { capture: true })

    if (menuDragRafId) {
      cancelAnimationFrame(menuDragRafId)
      menuDragRafId = null
    }

    menuBox.classList.remove('dshwv-menu-dragging')
    menuBox.style.setProperty('--menu-dx', `${menuOffset.x}px`)
    menuBox.style.setProperty('--menu-dy', `${menuOffset.y}px`)

    menuDrag.active = false
    menuDrag = null
  }

  if (menuHeader) {
    menuHeader.addEventListener('mousedown', onMenuDragStart)
  }
  menuBox.addEventListener('mousedown', onMenuDragStart)

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleMenu()
  })

  scaleInput.addEventListener('input', () => applyScale(scaleInput.value, false))
  scaleInput.addEventListener('change', () => applyScale(scaleInput.value, true))
  scaleNumber.addEventListener('change', () => {
    const v = Math.round(Number(scaleNumber.value))
    const s = MIN_SCALE + (Math.max(1, Math.min(20, v)) - 1) * (MAX_SCALE - MIN_SCALE) / 19
    applyScale(s, true)
  })
  soundSelect.addEventListener('change', () => applySoundSet(soundSelect.value, true))
  volInput.addEventListener('input', () => applyVol(volInput.value, true))
  usageSelect.addEventListener('change', () => applyUsageMode(usageSelect.value, true))
  peakSelect.addEventListener('change', () => applyPeakMode(peakSelect.value, true))
  bubbleToggle.addEventListener('change', () => applyBubbleOn(bubbleToggle.checked, true))
  if (damageToggle) {
    damageToggle.addEventListener('change', () => applyDamageOn(damageToggle.checked, true))
  }
  if (pillLenRange) {
    pillLenRange.addEventListener('input', () => applyPillLen(pillLenRange.value, true))
    pillLenRange.addEventListener('change', () => applyPillLen(pillLenRange.value, true))
  }
  if (pillToggle) {
    pillToggle.addEventListener('change', () => applyPillOn(pillToggle.checked, true))
  }
  if (pillDxRange) {
    // 拖滑条过程中只改 CSS（松手 change 才 resize + 落盘）
    pillDxRange.addEventListener('input', () => applyPillDx(pillDxRange.value, false))
    pillDxRange.addEventListener('change', () => applyPillDx(pillDxRange.value, true))
  }
  if (pillBox) {
    pillBox.addEventListener('mousedown', startPillDrag)
    pillBox.addEventListener('mouseenter', () => window.electronAPI.setIgnoreMouseEvents(false))
  }
  snapInput.addEventListener('input', () => {
    const v = Math.round(Number(snapInput.value) || 0)
    snapThreshold = v
    if (snapVal) snapVal.textContent = v === 0 ? '关闭' : `${v}px`
  })
  snapInput.addEventListener('change', () => applySnapThreshold(snapInput.value, true))
  turnCostToggle.addEventListener('change', () => applyTurnCostOn(turnCostToggle.checked, true))
  turnCostCloseInput.addEventListener('change', () => applyTurnCostClose(turnCostCloseInput.value, true))
  if (openChatBtn) {
    openChatBtn.addEventListener('click', () => {
      closeMenu()
      window.electronAPI.openExternal('https://chat.deepseek.com/')
    })
  }
  openSettingsBtn.addEventListener('click', () => {
    closeMenu()
    window.electronAPI.openSettings()
  })

  // Close menu if clicking outside menu box
  document.addEventListener('click', (e) => {
    if (menuOpen && !e.target.closest('#menu-box') && !e.target.closest('#menu-btn')) {
      closeMenu()
    }
  })

  // -------------------------------------------------------------
  // Streamlined, Ultra-Smooth Dragging Physics (setPosition only)
  // -------------------------------------------------------------
  let dragRafId = null
  let pendingX = 0
  let pendingY = 0

  async function startDragging(e) {
    if (e.button !== 0) return
    if (menuOpen) {
      closeMenu()
      return
    }

    e.preventDefault()
    e.stopPropagation()

    // Lock interactive mode during drag
    window.electronAPI.setIgnoreMouseEvents(false)

    const currentBounds = await window.electronAPI.getWindowBounds()
    const workArea = await window.electronAPI.getWorkArea()
    // The window may still be at the menu-fit size from the last menu
    // session; tighten it to the current whale scale before dragging
    // (bottom-right corner kept fixed so nothing visibly jumps), so the
    // drag clamp and corner snap behave correctly.
    const tightBounds = (await flushWindowResize(undefined, currentBounds, workArea)) || currentBounds

    drag = {
      active: true,
      startX: e.screenX,
      startY: e.screenY,
      origX: tightBounds.x,
      origY: tightBounds.y,
      width: tightBounds.width,
      height: tightBounds.height,
      moved: false,
      workArea,
    }

    pendingX = tightBounds.x
    pendingY = tightBounds.y

    root.classList.add('dshwv-dragging')
    pressDown()

    window.addEventListener('mousemove', onDraggingMove, { capture: true, passive: false })
    window.addEventListener('mouseup', onDraggingEnd, { capture: true, passive: false })
  }

  function onDraggingMove(e) {
    if (!drag || !drag.active) return
    e.preventDefault()
    e.stopPropagation()

    const dx = e.screenX - drag.startX
    const dy = e.screenY - drag.startY
    if (dx * dx + dy * dy >= CLICK_SQ) drag.moved = true

    pendingX = Math.round(
      Math.max(
        drag.workArea.x,
        Math.min(drag.workArea.x + drag.workArea.width - drag.width, drag.origX + dx)
      )
    )
    pendingY = Math.round(
      Math.max(
        drag.workArea.y,
        Math.min(drag.workArea.y + drag.workArea.height - drag.height, drag.origY + dy)
      )
    )

    if (!dragRafId) {
      dragRafId = requestAnimationFrame(() => {
        dragRafId = null
        if (drag && drag.active) {
          window.electronAPI.setWindowPosition(pendingX, pendingY)
        }
      })
    }
  }

  async function onDraggingEnd(e) {
    if (!drag || !drag.active) return
    e.preventDefault()
    e.stopPropagation()

    window.removeEventListener('mousemove', onDraggingMove, { capture: true })
    window.removeEventListener('mouseup', onDraggingEnd, { capture: true })

    if (dragRafId) {
      cancelAnimationFrame(dragRafId)
      dragRafId = null
    }

    pressUp()
    root.classList.remove('dshwv-dragging')

    const wasMoved = drag.moved
    const workArea = drag.workArea
    const width = drag.width
    const height = drag.height

    drag.active = false
    drag = null

    // Click handler (not moved)
    if (!wasMoved) {
      showBubble()
      refresh(true)
      return
    }

    // Snap Check based on distance to screen edges
    const distanceLeft = pendingX - workArea.x
    const distanceRight = (workArea.x + workArea.width) - (pendingX + width)
    const distanceTop = pendingY - workArea.y
    const distanceBottom = (workArea.y + workArea.height) - (pendingY + height)

    let targetX = pendingX
    let targetY = pendingY

    if (snapThreshold > 0 && distanceLeft <= snapThreshold && distanceLeft >= -50) {
      state.h = 'left'
      targetX = workArea.x
    } else if (snapThreshold > 0 && distanceRight <= snapThreshold && distanceRight >= -50) {
      state.h = 'right'
      targetX = workArea.x + workArea.width - width
    } else {
      state.h = null
      targetX = pendingX
    }

    if (snapThreshold > 0 && distanceTop <= snapThreshold && distanceTop >= -50) {
      state.v = 'top'
      targetY = workArea.y
    } else if (snapThreshold > 0 && distanceBottom <= snapThreshold && distanceBottom >= -50) {
      state.v = 'bottom'
      targetY = workArea.y + workArea.height - height
    } else {
      state.v = null
      targetY = pendingY
    }

    // Final safety clamp
    targetX = Math.max(workArea.x, Math.min(workArea.x + workArea.width - width, targetX))
    targetY = Math.max(workArea.y, Math.min(workArea.y + workArea.height - height, targetY))

    root.classList.toggle('dshwv-left', state.h === 'left')
    // 吸附到左边会整体镜像，血条的"屏幕方向 dx"要重新映射成本地 dx
    setPillDxCss(pillDx)

    window.electronAPI.setWindowPosition(targetX, targetY)
    window.electronAPI.saveConfig({
      windowPos: { x: targetX, y: targetY, h: state.h, v: state.v },
    })
  }

  // Attach drag to the whale image
  img.addEventListener('mousedown', startDragging)

  // -------------------------------------------------------------
  // Clean Event-Driven Mouse Pass-Through (Zero overhead)
  // -------------------------------------------------------------
  root.addEventListener('mouseenter', () => {
    window.electronAPI.setIgnoreMouseEvents(false)
    menuBtn.classList.add('dshwv-menu-btn-visible')
  })

  bubbleBox.addEventListener('mouseenter', () => {
    window.electronAPI.setIgnoreMouseEvents(false)
  })

  menuBox.addEventListener('mouseenter', () => {
    window.electronAPI.setIgnoreMouseEvents(false)
  })

  appContainer.addEventListener('mouseleave', () => {
    if (!menuOpen && (!drag || !drag.active) && (!menuDrag || !menuDrag.active)) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true })
      menuBtn.classList.remove('dshwv-menu-btn-visible')
    }
  })

  // Initialize
  async function init() {
    const cfg = await window.electronAPI.getConfig()
    if (cfg) {
      state.scale = typeof cfg.scale === 'number' ? cfg.scale : 1.5
      soundOn = cfg.sound !== false
      soundVol = typeof cfg.vol === 'number' ? cfg.vol : 0.9
      soundSet = cfg.soundSet || 'duck'
      usageMode = cfg.usageMode || 'ledger'
      peakMode = cfg.peakMode || 'default'
      bubbleOn = cfg.bubbleOn !== false
      damageOn = cfg.damageOn !== false
      turnCostOn = cfg.turnCostOn !== false
      turnCostCloseMs = typeof cfg.turnCostCloseMs === 'number' ? cfg.turnCostCloseMs : 5000
      snapThreshold = typeof cfg.snapThreshold === 'number' ? cfg.snapThreshold : 60

      if (cfg.windowPos && cfg.windowPos.h) {
        state.h = cfg.windowPos.h
        root.classList.toggle('dshwv-left', state.h === 'left')
        // 吸附模式与窗口 x 不一致时校正（配置被外部改过 / 历史遗留）：
        // 否则左吸附却沿用右锚定的 x，血条会被推出窗口
        try {
          const b = await window.electronAPI.getWindowBounds()
          const wa = await window.electronAPI.getWorkArea()
          const wantX = state.h === 'left' ? wa.x : wa.x + wa.width - b.width
          if (Math.abs(b.x - wantX) > 2) window.electronAPI.setWindowPosition(wantX, b.y)
        } catch (err) {}
      }

      root.style.setProperty('--dshw-scale', String(state.scale))
      scaleInput.value = String(state.scale)
      scaleNumber.value = String(scaleToDisplay(state.scale))
      soundSelect.value = soundSet
      volInput.value = String(soundVol)
      volPct.textContent = Math.round(soundVol * 100) + '%'
      usageSelect.value = usageMode
      peakSelect.value = peakMode
      bubbleToggle.checked = bubbleOn
      if (damageToggle) damageToggle.checked = damageOn
      applyPillLen(cfg.pillLen === undefined ? 1 : cfg.pillLen, false)
      applyPillOn(cfg.pillOn !== false, false)
      applyPillDx(cfg.pillDx === undefined ? 0 : cfg.pillDx, false)
      if (snapInput) snapInput.value = String(snapThreshold)
      if (snapVal) snapVal.textContent = snapThreshold === 0 ? '关闭' : `${snapThreshold}px`
      turnCostToggle.checked = turnCostOn
      turnCostCloseInput.value = String(Math.round(turnCostCloseMs / 1000))
    }

    window.AudioManager.applySoundSet(soundSet, soundVol, soundOn)
    if (window.DamagePulse) window.DamagePulse.setEnabled(damageOn)
    render()
    refresh(false)

    // Periodic balance refresh
    setInterval(() => refresh(false), REFRESH_MS)

    // 用主进程当前 seq 对齐，只防重复展示，不丢弃真实事件。
    // 旧实现直接吞掉「收到的第一个事件」，导致冷启动后点的第一发测试消耗
    // 毫无反应（表象：设置页测试按钮失灵）。
    try {
      const lastTurn = await window.electronAPI.getLastTurn()
      if (lastTurn && typeof lastTurn.seq === 'number') lastCostSeq = lastTurn.seq
    } catch (err) {}

    // Listen for Turn Cost events
    window.electronAPI.onTurnCost((turnData) => {
      if (!turnData || !turnData.ok || typeof turnData.seq !== 'number') return
      if (turnData.seq > lastCostSeq) {
        lastCostSeq = turnData.seq
        if (turnData.amount !== null && turnData.amount !== undefined) {
          showCostBubble(Number(turnData.amount))
          // 伤害飘字与连击（独立于气泡开关，由「飘字」开关控制）
          if (window.DamagePulse) window.DamagePulse.emit(turnData)
          // 测试模式下余额被实时扣减，立刻刷新血条；真实模式命中 25s 缓存，不会多打接口
          refresh(false)
        }
      }
    })

    // Listen for external config changes (from settings dialog)
    // NEVER pass save=true here to prevent infinite recursive IPC loops!
    window.electronAPI.onConfigChanged((newCfg) => {
      if (!newCfg) return
      if (newCfg.apiKey !== undefined || newCfg.platformToken !== undefined) {
        refresh(true)
      }
      if (newCfg.scale !== undefined) {
        applyScale(newCfg.scale, false)
      }
      if (newCfg.soundSet !== undefined) {
        applySoundSet(newCfg.soundSet, false)
      }
      if (newCfg.vol !== undefined) {
        applyVol(newCfg.vol, false)
      }
      if (newCfg.usageMode !== undefined) {
        applyUsageMode(newCfg.usageMode, false)
      }
      if (newCfg.peakMode !== undefined) {
        applyPeakMode(newCfg.peakMode, false)
      }
      if (newCfg.bubbleOn !== undefined) {
        applyBubbleOn(newCfg.bubbleOn, false)
      }
      if (newCfg.damageOn !== undefined) {
        applyDamageOn(newCfg.damageOn, false)
      }
      if (newCfg.pillLen !== undefined) {
        applyPillLen(newCfg.pillLen, false)
      }
      if (newCfg.pillOn !== undefined) {
        applyPillOn(newCfg.pillOn, false)
      }
      if (newCfg.pillDx !== undefined) {
        applyPillDx(newCfg.pillDx, false)
        scheduleResize()
      }
      if (newCfg.testBalance !== undefined || newCfg.testUsage !== undefined || newCfg.testMode !== undefined) {
        // 测试面板改了自定义余额 / 开关测试模式 → 立刻反映到血条
        refresh(false)
      }
      if (newCfg.snapThreshold !== undefined) {
        applySnapThreshold(newCfg.snapThreshold, false)
      }
      if (newCfg.turnCostOn !== undefined) {
        applyTurnCostOn(newCfg.turnCostOn, false)
      }
      if (newCfg.turnCostCloseMs !== undefined) {
        applyTurnCostClose(newCfg.turnCostCloseMs / 1000, false)
      }
    })
  }

  window.addEventListener('DOMContentLoaded', init)
})()
