const fs = require('node:fs')
const path = require('node:path')
const { exec } = require('node:child_process')

const rootDir = path.resolve(__dirname, '..')
const readmePath = path.join(rootDir, 'README.md')
const previewHtmlPath = path.join(rootDir, 'preview-readme.html')

const mdContent = fs.readFileSync(readmePath, 'utf-8')

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>README 预览 - DeepSeek 余额小鲸鱼</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5.8.1/github-markdown.min.css">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 1040px;
      margin: 0 auto;
      padding: 30px 20px 60px 20px;
      background-color: #0d1117;
      color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding: 12px 20px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      font-size: 14px;
      color: #8b949e;
    }
    .header-bar code {
      color: #58a6ff;
      background: #21262d;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .markdown-body {
      background-color: #ffffff;
      color: #1f2328;
      padding: 40px 48px;
      border-radius: 12px;
      border: 1px solid #d0d7de;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
    }
    @media (prefers-color-scheme: dark) {
      .markdown-body {
        background-color: #0d1117;
        color: #e6edf3;
        border: 1px solid #30363d;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.85);
      }
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <span>🌐 <strong>GitHub README 真实渲染预览</strong></span>
    <span>本地源文件：<code>README.md</code></span>
  </div>
  <article id="content" class="markdown-body">
    正在渲染 GitHub Markdown 内容...
  </article>

  <script>
    const rawMarkdown = ${JSON.stringify(mdContent)};
    const contentEl = document.getElementById('content');
    if (window.marked && typeof window.marked.parse === 'function') {
      window.marked.use({
        gfm: true,
        breaks: false
      });
      contentEl.innerHTML = window.marked.parse(rawMarkdown);
    } else {
      contentEl.innerText = rawMarkdown;
    }
  </script>
</body>
</html>`

fs.writeFileSync(previewHtmlPath, html, 'utf-8')
console.log('Preview file created at:', previewHtmlPath)

// Open in default browser
const cmd = process.platform === 'win32'
  ? `powershell -NoProfile -Command "Start-Process '${previewHtmlPath}'"`
  : process.platform === 'darwin'
  ? `open "${previewHtmlPath}"`
  : `xdg-open "${previewHtmlPath}"`

exec(cmd, (err) => {
  if (err) {
    console.error('Failed to open browser:', err)
  } else {
    console.log('Successfully launched browser preview!')
  }
})
