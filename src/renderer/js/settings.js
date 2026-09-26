(async function () {
  const inputApiKey = document.getElementById('input-api-key')
  const inputPlatformToken = document.getElementById('input-platform-token')
  const btnToggleKey = document.getElementById('btn-toggle-key')
  const btnToggleToken = document.getElementById('btn-toggle-token')
  const btnTestBalance = document.getElementById('btn-test-balance')
  const btnTestCost = document.getElementById('btn-test-cost')
  const chkAlwaysOnTop = document.getElementById('chk-always-on-top')
  const chkOpenAtLogin = document.getElementById('chk-open-at-login')
  const inputListenerPort = document.getElementById('input-listener-port')
  const btnCancel = document.getElementById('btn-cancel')
  const btnSave = document.getElementById('btn-save')
  const toast = document.getElementById('toast')

  // 测试版面板
  const chkTestMode = document.getElementById('chk-test-mode')
  const inputTestBalance = document.getElementById('input-test-balance')
  const inputTestAmount = document.getElementById('input-test-amount')
  const btnApplyBalance = document.getElementById('btn-apply-balance')
  const btnCostNormal = document.getElementById('btn-cost-normal')
  const btnCostCrit = document.getElementById('btn-cost-crit')
  const btnResetUsage = document.getElementById('btn-reset-usage')
  const testStatus = document.getElementById('test-status')
  const testModeGuide = document.getElementById('test-mode-guide')

  const testCfg = { testMode: false, testBalance: 100, testUsage: 0 }

  function renderTestStatus() {
    if (testModeGuide) {
      // 紧挨开关的状态说明：告诉用户当前在哪个模式、演练完怎么回到真实接口
      testModeGuide.textContent = testCfg.testMode
        ? '测试模式已开启 · 可自定义余额演练普通 / 暴击扣费（不请求 DeepSeek 接口）。演练完毕后，取消勾选上方开关即可回到真实接口与真实余额。'
        : '测试模式已关闭 · 当前显示真实 API 余额。需要演练时勾选上方开关，即可自定义余额演练扣费。'
      testModeGuide.classList.toggle('is-on', !!testCfg.testMode)
      testModeGuide.classList.toggle('is-off', !testCfg.testMode)
    }
    if (!testStatus) return
    const bal = Number(testCfg.testBalance)
    const used = Number(testCfg.testUsage) || 0
    const ratio = bal + used > 0 ? bal / (bal + used) : 0
    testStatus.textContent = testCfg.testMode
      ? `🧪 测试模式开启 · 余额 ¥${isFinite(bal) ? bal.toFixed(2) : '--'} · 今日已用 ¥${used.toFixed(2)} · 血量 ${(ratio * 100).toFixed(0)}%`
      : '测试模式已关闭 · 下方「普通 / 暴击扣费」是演练按钮，开启测试模式后才能使用'
  }

  function showToast(msg) {
    toast.textContent = msg
    toast.classList.add('show')
    setTimeout(() => toast.classList.remove('show'), 2000)
  }

  btnToggleKey.addEventListener('click', () => {
    inputApiKey.type = inputApiKey.type === 'password' ? 'text' : 'password'
  })

  btnToggleToken.addEventListener('click', () => {
    inputPlatformToken.type = inputPlatformToken.type === 'password' ? 'text' : 'password'
  })

  // Load existing config
  try {
    const config = await window.electronAPI.getConfig()
    if (config) {
      inputApiKey.value = config.apiKey || ''
      inputPlatformToken.value = config.platformToken || ''
      chkAlwaysOnTop.checked = config.alwaysOnTop !== false
      chkOpenAtLogin.checked = !!config.openAtLogin
      inputListenerPort.value = config.listenerPort || 37189
      testCfg.testMode = !!config.testMode
      testCfg.testBalance = config.testBalance
      testCfg.testUsage = config.testUsage
      chkTestMode.checked = testCfg.testMode
      if (isFinite(Number(config.testBalance))) {
        // 金额按分显示，避免 99.9463000000 这类浮点噪声吓到人
        inputTestBalance.value = Math.round(Number(config.testBalance) * 100) / 100
      }
      renderTestStatus()
    }
  } catch (err) {
    console.error('Failed to load config:', err)
  }

  // 测试面板：主进程扣账后会广播最新余额，这里同步显示
  window.electronAPI.onConfigChanged((cfg) => {
    if (!cfg) return
    if (cfg.testBalance !== undefined) testCfg.testBalance = cfg.testBalance
    if (cfg.testUsage !== undefined) testCfg.testUsage = cfg.testUsage
    if (cfg.testMode !== undefined) {
      testCfg.testMode = !!cfg.testMode
      if (chkTestMode) chkTestMode.checked = !!cfg.testMode
    }
    renderTestStatus()
  })

  chkTestMode.addEventListener('change', async () => {
    try {
      const r = await window.electronAPI.setTestMode(chkTestMode.checked)
      testCfg.testMode = !!r.testMode
      renderTestStatus()
      showToast(r.testMode ? '🧪 测试模式已开启' : '已关闭测试模式（回到真实接口）')
    } catch (err) {
      alert('操作失败: ' + err.message)
    }
  })

  btnApplyBalance.addEventListener('click', async () => {
    try {
      const r = await window.electronAPI.setTestBalance(Number(inputTestBalance.value))
      if (!r.ok) {
        alert(r.error || '设置失败')
        return
      }
      testCfg.testMode = true
      testCfg.testBalance = r.testBalance
      testCfg.testUsage = 0
      chkTestMode.checked = true
      renderTestStatus()
      showToast(`✅ 余额已设为 ¥${r.testBalance.toFixed(2)}，今日已用清零`)
    } catch (err) {
      alert('操作失败: ' + err.message)
    }
  })

  async function doTestCost(force) {
    const a = Number(inputTestAmount.value)
    if (!isFinite(a) || a <= 0) {
      alert('扣费金额必须 > 0')
      return
    }
    try {
      if (!chkTestMode.checked) {
        await window.electronAPI.setTestMode(true)
        chkTestMode.checked = true
        testCfg.testMode = true
      }
      await window.electronAPI.testCost(a, force)
      showToast(force === 'crit' ? `⚡ 暴击扣费 ¥${a}` : `💥 普通扣费 ¥${a}`)
      setTimeout(renderTestStatus, 300)
    } catch (err) {
      alert('测试失败: ' + err.message)
    }
  }

  btnCostNormal.addEventListener('click', () => doTestCost('normal'))
  btnCostCrit.addEventListener('click', () => doTestCost('crit'))

  btnResetUsage.addEventListener('click', async () => {
    try {
      await window.electronAPI.resetTestUsage()
      testCfg.testUsage = 0
      renderTestStatus()
      showToast('🧹 今日已用已清零')
    } catch (err) {
      alert('操作失败: ' + err.message)
    }
  })

  // Test Balance
  btnTestBalance.addEventListener('click', async () => {
    btnTestBalance.disabled = true
    btnTestBalance.textContent = '请求中…'
    try {
      // Save key temporarily to test
      await window.electronAPI.saveConfig({
        apiKey: inputApiKey.value.trim(),
        platformToken: inputPlatformToken.value.trim(),
      })
      const res = await window.electronAPI.getBalance(true)
      if (res && res.ok) {
        showToast(`✅ 获取成功: ${res.currency === 'CNY' ? '¥' : ''}${res.totalBalance}`)
      } else {
        alert(`❌ 获取失败: ${(res && res.error) || '未知错误'}`)
      }
    } catch (err) {
      alert(`❌ 错误: ${err && err.message}`)
    } finally {
      btnTestBalance.disabled = false
      btnTestBalance.textContent = '测试拉取余额'
    }
  })

  // Test Cost Bubble
  btnTestCost.addEventListener('click', async () => {
    try {
      await window.electronAPI.testCost(0.18)
      showToast('🎉 已向桌宠推送测试消耗金额: ¥0.18')
    } catch (err) {
      alert(`测试失败: ${err && err.message}`)
    }
  })

  // Save Config
  btnSave.addEventListener('click', async () => {
    btnSave.disabled = true
    try {
      const port = Number(inputListenerPort.value) || 37189
      const result = await window.electronAPI.saveConfig({
        apiKey: inputApiKey.value.trim(),
        platformToken: inputPlatformToken.value.trim(),
        alwaysOnTop: chkAlwaysOnTop.checked,
        openAtLogin: chkOpenAtLogin.checked,
        listenerPort: port,
      })

      if (result && result.ok) {
        showToast('✅ 设置已保存！')
        setTimeout(() => window.close(), 700)
      } else {
        alert('保存失败: ' + ((result && result.error) || '未知错误'))
      }
    } catch (err) {
      alert('保存出错: ' + (err && err.message))
    } finally {
      btnSave.disabled = false
    }
  })

  btnCancel.addEventListener('click', () => {
    window.close()
  })
})()
