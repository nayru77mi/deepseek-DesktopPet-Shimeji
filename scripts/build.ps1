Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DeepSeek 余额小鲸鱼 - 一键打包发布程序" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

# Step 1: Ensure icons exist
Write-Host "[1/3] 检查并生成应用图标 (icon.ico)..." -ForegroundColor Yellow
python -c "
from PIL import Image
img = Image.open('assets/DSniang1.png')
max_dim = max(img.size)
square_img = Image.new('RGBA', (max_dim, max_dim), (0, 0, 0, 0))
offset = ((max_dim - img.size[0]) // 2, (max_dim - img.size[1]) // 2)
square_img.paste(img, offset)
square_img.save('assets/icon.png', 'PNG')
sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
square_img.save('assets/icon.ico', format='ICO', sizes=sizes)
"
Write-Host "      图标已就绪: assets/icon.ico" -ForegroundColor Green

# Step 2: Build with electron-builder
Write-Host "[2/3] 正在使用 electron-builder 打包 Windows EXE..." -ForegroundColor Yellow
pnpm exec electron-builder --win

if ($LASTEXITCODE -eq 0) {
    Write-Host "[3/3] 打包成功！正在生成桌面快捷方式..." -ForegroundColor Green
    & "$scriptDir\create-shortcut.ps1"
    
    Write-Host ""
    Write-Host "🎉 打包完成！生成的文件位于 dist/ 目录：" -ForegroundColor Green
    Get-ChildItem -Path "$projectRoot\dist" -Filter "*.exe" | ForEach-Object {
        Write-Host "   -> $($_.FullName) ($([math]::Round($_.Length / 1MB, 2)) MB)" -ForegroundColor Cyan
    }
} else {
    Write-Error "打包失败，请检查报错日志。"
}
