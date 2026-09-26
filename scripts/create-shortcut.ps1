$projectRoot = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $projectRoot "assets\icon.ico"
$desktopPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
$shortcutPath = Join-Path $desktopPath "DeepSeek余额小鲸鱼.lnk"

# Target executable: prefer portable exe (pick the newest version) or win-unpacked exe
$portableExe = Get-ChildItem (Join-Path $projectRoot "dist\DeepSeek余额小鲸鱼 *.exe") -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike '*Setup*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
$unpackedExe = Join-Path $projectRoot "dist\win-unpacked\DeepSeek余额小鲸鱼.exe"
$electronExe = Join-Path $projectRoot "node_modules\electron\dist\electron.exe"

$targetPath = ""
$arguments = ""
$workingDir = ""

if ($portableExe) {
    $targetPath = $portableExe.FullName
    $workingDir = $projectRoot
} elseif (Test-Path $unpackedExe) {
    $targetPath = $unpackedExe
    $workingDir = Split-Path -Parent $unpackedExe
} elseif (Test-Path $electronExe) {
    $targetPath = $electronExe
    $arguments = "`"$projectRoot`""
    $workingDir = $projectRoot
} else {
    Write-Host "未找到可执行程序，请先执行打包或 pnpm start" -ForegroundColor Red
    exit 1
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
if ($arguments) {
    $shortcut.Arguments = $arguments
}
$shortcut.WorkingDirectory = $workingDir
if (Test-Path $iconPath) {
    $shortcut.IconLocation = "$iconPath, 0"
}
$shortcut.Description = "DeepSeek 余额小鲸鱼桌面宠物挂件"
$shortcut.Save()

Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ 桌面快捷方式已成功创建！" -ForegroundColor Green
Write-Host "   快捷方式路径: $shortcutPath" -ForegroundColor Cyan
Write-Host "   目标程序:     $targetPath" -ForegroundColor Cyan
Write-Host "   应用图标:     $iconPath" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
