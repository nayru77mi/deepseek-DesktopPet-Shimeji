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
  const gifEl = document.getElementById('whale-gif')
  const menuBtn = document.getElementById('menu-btn')
  const menuBox = document.getElementById('menu-box')
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
  const turnCostToggle = document.getElementById('turn-cost-toggle')
  const turnCostCloseInput = document.getElementById('turn-cost-close')
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
  let lastCostAligned = false

  let soundOn = true
  let soundVol = 0.9
  let soundSet = 'duck'
  let usageMode = 'ledger'
  let peakMode = 'default'
  let bubbleOn = true
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

  function render() {
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
    if (busy) return
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
        turnCostOn: turnCostOn,
        turnCostCloseMs: turnCostCloseMs,
      })
    } catch (err) {}
  }

  function scaleToDisplay(s) {
    return Math.round(((s - MIN_SCALE) / ((MAX_SCALE - MIN_SCALE) / 19))) + 1
  }

  async function applyScale(v, save = true) {
    const next = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(v))) * 10) / 10
    state.scale = next
    root.style.setProperty('--dshw-scale', String(next))
    scaleInput.value = String(next)
    scaleNumber.value = String(scaleToDisplay(next))

    const basePx = Math.round(180 * next)
    const winWidth = basePx + 180
    const winHeight = basePx + 200

    const currentBounds = await window.electronAPI.getWindowBounds()
    const workArea = await window.electronAPI.getWorkArea()

    let newX = currentBounds.x
    let newY = currentBounds.y

    if (state.h === 'right') {
      newX = workArea.x + workArea.width - winWidth
    } else if (state.h === 'left') {
      newX = workArea.x
    }

    if (state.v === 'bottom') {
      newY = workArea.y + workArea.height - winHeight
    } else if (state.v === 'top') {
      newY = workArea.y
    }

    newX = Math.max(workArea.x, Math.min(workArea.x + workArea.width - winWidth, newX))
    newY = Math.max(workArea.y, Math.min(workArea.y + workArea.height - winHeight, newY))

    window.electronAPI.setWindowBounds({
      x: newX,
      y: newY,
      width: winWidth,
      height: winHeight,
    })

    if (save) saveConfig()
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
    menuBox.classList.toggle('dshwv-menu-open', menuOpen)
    menuBtn.classList.toggle('dshwv-menu-btn-visible', menuOpen)
    if (menuOpen) {
      window.electronAPI.setIgnoreMouseEvents(false)
    }
  }

  function closeMenu() {
    if (!menuOpen) return
    menuOpen = false
    menuBox.classList.remove('dshwv-menu-open')
    menuBtn.classList.remove('dshwv-menu-btn-visible')
  }

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleMenu()
  })

  scaleInput.addEventListener('input', () => applyScale(scaleInput.value, true))
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
  turnCostToggle.addEventListener('change', () => applyTurnCostOn(turnCostToggle.checked, true))
  turnCostCloseInput.addEventListener('change', () => applyTurnCostClose(turnCostCloseInput.value, true))
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

    const initialBounds = await window.electronAPI.getWindowBounds()
    const workArea = await window.electronAPI.getWorkArea()

    drag = {
      active: true,
      startX: e.screenX,
      startY: e.screenY,
      origX: initialBounds.x,
      origY: initialBounds.y,
      width: initialBounds.width,
      height: initialBounds.height,
      moved: false,
      workArea,
    }

    pendingX = initialBounds.x
    pendingY = initialBounds.y

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

    // Snap Check based on workArea quarters
    const centerX = pendingX + width / 2
    const centerY = pendingY + height / 2

    let targetX = pendingX
    let targetY = pendingY

    if (centerX < workArea.x + workArea.width / 4) {
      state.h = 'left'
      targetX = workArea.x
    } else if (centerX > workArea.x + (workArea.width * 3) / 4) {
      state.h = 'right'
      targetX = workArea.x + workArea.width - width
    } else {
      state.h = null
      targetX = Math.max(workArea.x, Math.min(workArea.x + workArea.width - width, targetX))
    }

    if (centerY < workArea.y + workArea.height / 4) {
      state.v = 'top'
      targetY = workArea.y
    } else if (centerY > workArea.y + (workArea.height * 3) / 4) {
      state.v = 'bottom'
      targetY = workArea.y + workArea.height - height
    } else {
      state.v = null
      targetY = Math.max(workArea.y, Math.min(workArea.y + workArea.height - height, targetY))
    }

    // Final safety clamp
    targetX = Math.max(workArea.x, Math.min(workArea.x + workArea.width - width, targetX))
    targetY = Math.max(workArea.y, Math.min(workArea.y + workArea.height - height, targetY))

    root.classList.toggle('dshwv-left', state.h === 'left')

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
    if (!menuOpen && (!drag || !drag.active)) {
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
      turnCostOn = cfg.turnCostOn !== false
      turnCostCloseMs = typeof cfg.turnCostCloseMs === 'number' ? cfg.turnCostCloseMs : 5000

      if (cfg.windowPos && cfg.windowPos.h) {
        state.h = cfg.windowPos.h
        root.classList.toggle('dshwv-left', state.h === 'left')
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
      turnCostToggle.checked = turnCostOn
      turnCostCloseInput.value = String(Math.round(turnCostCloseMs / 1000))
    }

    window.AudioManager.applySoundSet(soundSet, soundVol, soundOn)
    render()
    refresh(false)

    // Periodic balance refresh
    setInterval(() => refresh(false), REFRESH_MS)

    // Listen for Turn Cost events
    window.electronAPI.onTurnCost((turnData) => {
      if (!turnData || !turnData.ok || typeof turnData.seq !== 'number') return
      if (!lastCostAligned) {
        lastCostSeq = turnData.seq
        lastCostAligned = true
        return
      }
      if (turnData.seq > lastCostSeq) {
        lastCostSeq = turnData.seq
        if (turnData.amount !== null && turnData.amount !== undefined) {
          showCostBubble(Number(turnData.amount))
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
