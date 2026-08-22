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
    }
  } catch (err) {
    console.error('Failed to load config:', err)
  }

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
