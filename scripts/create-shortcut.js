const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..')
const desktopDir = path.join(os.homedir(), 'Desktop')
const shortcutPath = path.join(desktopDir, 'DeepSeek余额小鲸鱼.lnk')
const iconPath = path.join(projectRoot, 'assets', 'icon.ico')

const portableExe = path.join(projectRoot, 'dist', 'DeepSeek余额小鲸鱼 1.0.0.exe')
const unpackedExe = path.join(projectRoot, 'dist', 'win-unpacked', 'DeepSeek余额小鲸鱼.exe')

let targetExe = ''
let workingDir = ''

if (fs.existsSync(portableExe)) {
  targetExe = portableExe
  workingDir = path.dirname(portableExe)
} else if (fs.existsSync(unpackedExe)) {
  targetExe = unpackedExe
  workingDir = path.dirname(unpackedExe)
} else {
  console.error('未找到可执行程序，请先运行打包！')
  process.exit(1)
}

const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "${shortcutPath.replace(/\\/g, '\\\\')}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "${targetExe.replace(/\\/g, '\\\\')}"
oLink.WorkingDirectory = "${workingDir.replace(/\\/g, '\\\\')}"
oLink.Description = "DeepSeek 余额小鲸鱼桌宠"
oLink.IconLocation = "${iconPath.replace(/\\/g, '\\\\')},0"
oLink.Save
`

const tempVbs = path.join(os.tmpdir(), 'create_whale_shortcut.vbs')
fs.writeFileSync(tempVbs, vbsScript, 'latin1')

try {
  execSync(`cscript //nologo "${tempVbs}"`)
  fs.unlinkSync(tempVbs)
  console.log('========================================')
  console.log('✅ 桌面快捷方式已成功生成！')
  console.log('   快捷方式: ' + shortcutPath)
  console.log('   目标程序: ' + targetExe)
  console.log('   图标文件: ' + iconPath)
  console.log('========================================')
} catch (err) {
  console.error('生成快捷方式失败:', err)
}
