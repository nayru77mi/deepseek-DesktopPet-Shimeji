# DeepSeek 余额小鲸鱼桌面宠物 (DeepSeek Balance Whale Girl Desk Pet)

![DeepSeek 小鲸鱼](assets/DSH2.png)

一个常驻电脑桌面的 **DeepSeek 余额小鲸鱼挂件（桌宠）**：透明无边框、支持自由拖拽与四边吸附、DeepSeek API 余额自动刷新、今日已用双模式统计（小鲸鱼记账 / 实时令牌）、每轮对话消耗结算泡泡、按压 Q 弹音效、系统托盘管理及独立凭据设置中心！

---

## ✨ 核心特性

- 🐋 **桌面常驻透明**：基于 Electron 的轻量透明无边框置顶挂件，常驻桌面任意位置；
- 🎯 **轻量事件驱动鼠标穿透**：基于 `mouseenter`/`mouseleave` 与边界判定，只有悬停在小鲸鱼实体/气泡/菜单时响应交互，透明区域完全不遮挡桌面图标和软件操作；
- 💰 **API 余额实时监控**：60 秒自动静默轮询 + 点击鲸鱼手动刷新，余额变动时带平滑数字滚动动画；网络抖动自动沿用缓存；
- 📊 **今日已用统计（双模式）**：
  - **小鲸鱼记账（默认推荐，免令牌）**：无需网页 Token，每次观测余额下降自动本地累加（持久化记账并跨天自动归档）；
  - **实时·令牌**：配置平台 Token 调取官方用量接口，按**峰谷阶梯单价**（高峰 9-12 点、14-18 点 / 空闲时段）精确换算；
- 💬 **每轮对话消耗结算泡泡**：内置本地 HTTP 接收端口（默认 `37189`），外部工具（DSH、Cursor、AI 客户端脚本）完成对话后即可推送 usage，桌宠立刻弹出「上一轮对话消耗: ¥X.XX」专用泡泡（支持自定义自动关闭秒数或点击确认关闭）；
- 🖱️ **平滑 60fps 拖拽吸附与翻转**：支持拖拽到屏幕四周或角落自动吸附（避开 Windows 任务栏），吸附距离支持在汉堡菜单中自由调节（0~200px 或完全关闭自由停靠）；左侧吸附时整体水平镜像翻转（文字与动画方向同步纠正）；
- 🧸 **按压 Q 弹与音效**：按压形变（`scaleY(0.88)`）玩偶手感，支持小黄鸭（`Ya1/Ya2`）与音效1（`D1/D2`）两组音效及音量调节；
- 💭 **随机台词与表情包**：点击气泡切换随机卖萌台词、峰谷时段提示以及 `rua.gif` 动图；
- ⚙️ **汉堡菜单与系统托盘**：
  - 桌宠悬停右上角汉堡菜单快速调节：缩放（0.6x ~ 2.5x）、音效、音量、用量模式、峰谷文案风格、气泡开关、吸附范围（0~200px）、每轮消耗开关；
  - 汉堡菜单支持**自由拖拽移动**（带顶部拖拽把手与视口防出界保护），**关闭后再次打开 100% 自动复原初始吸附位置**；
  - 菜单底层内置 **「💬 来和我聊天吧」** 按钮，一键在默认浏览器中秒开 DeepSeek 官方对话网页端；
  - 任务栏托盘图标（Tray）：一键「🎯 重置位置到右下角」、一键刷新余额、显示/隐藏、始终置顶切换、打开「设置中心」、退出；
  - 独立设置中心：可视化配置 `DEEPSEEK_API_KEY`、`DEEPSEEK_PLATFORM_TOKEN`、开机自启、本地端口以及即时测试。

---

## 🚀 快速启动与安装

### 方式 A：直接下载桌面安装包（推荐普通用户）

前往本项目 GitHub **[Releases 发布页](https://github.com/nayru77mi/deepseek-Whale-Girl-Desk-Pet/releases)** 下载最新版预编译文件：

| 版本类型 | 文件名称示例 | 特点说明 |
| :--- | :--- | :--- |
| **标准安装包（推荐）** | `DeepSeek余额小鲸鱼 Setup 1.0.0.exe` | 运行安装向导，自动生成带小鲸鱼高清图标的桌面与开始菜单快捷方式，支持完整卸载 |
| **绿色单文件便携版** | `DeepSeek余额小鲸鱼 1.0.0.exe` | **无需安装**，直接双击运行，适合放 U 盘或快速体验 |

---

### 方式 B：从源码运行与本地构建（适合开发者）

#### 1. 环境准备
- [Node.js](https://nodejs.org/) (建议 `>= 18.0.0`)
- [pnpm](https://pnpm.io/) (包管理器)

#### 2. 克隆与启动
```powershell
# 1. 克隆代码仓库
git clone https://github.com/nayru77mi/deepseek-Whale-Girl-Desk-Pet.git
cd deepseek-Whale-Girl-Desk-Pet

# 2. 安装项目依赖
pnpm install

# 3. 启动开发环境桌宠
pnpm start
```

#### 3. 本地打包构建 EXE
```powershell
# 重新打包 Windows 安装包与便携版（产物输出至 dist/ 目录）
pnpm run build:win

# 仅打包解压即用目录（免封装调试）
pnpm run build:dir
```

---

### 3. 配置 DeepSeek API 密钥
1. 启动桌宠后，右键屏幕右下角系统托盘小鲸鱼图标，或点击桌宠右上角汉堡菜单底部的 **「⚙️ 凭据与高级设置」**；
2. 填入你的 `DEEPSEEK_API_KEY`（形如 `sk-...`）；
3. 点击 **「测试拉取余额」** 验证无误后，点击 **「保存配置」** 即可！

---

## 📡 对接外部对话消耗统计 (Turn Cost API)

桌宠在本地启动了一个轻量 HTTP 接收服务（默认端口 `http://127.0.0.1:37189`）。

当你的 AI 客户端或脚本完成一轮对话时，只需发送一个 POST 请求，桌宠便会弹出消耗气泡：

### 方式 1：直接发送消耗金额
```bash
curl -X POST http://127.0.0.1:37189/api/turn-event \
  -H "Content-Type: application/json" \
  -d '{"amount": 0.15, "turn": 1, "end": true}'
```

### 方式 2：发送 OpenAI / DeepSeek 标准 usage 结构（自动按峰谷计费）
```bash
curl -X POST http://127.0.0.1:37189/api/turn-event \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "turn": 1,
    "usage": {
      "inputTokens": 1500,
      "cacheReadTokens": 12000,
      "outputTokens": 800,
      "reasoningTokens": 0
    },
    "end": true
  }'
```

---

## 📁 目录结构

```text
deepseek-Whale-Girl-Desk-Pet/
├── .gitignore                # Git 忽略配置（已忽略 node_modules/ 和 dist/）
├── package.json              # 项目依赖、脚本与 electron-builder 打包配置
├── pnpm-workspace.yaml       # pnpm 构建脚本白名单配置
├── .npmrc                    # 镜像与安装加速配置
├── README.md                 # 完整使用说明文档
├── BUGFIX_LOG.md             # 深度 Bug 修复与性能优化全量日志
├── dist/                     # 打包输出目录（~431MB，本地生成，不进入 Git）
│   ├── DeepSeek余额小鲸鱼 1.0.0.exe        # 绿色单文件免安装版
│   ├── DeepSeek余额小鲸鱼 Setup 1.0.0.exe  # 标准 Windows 安装包
│   └── win-unpacked/                       # 解压即用可执行文件目录
├── scripts/                  # 辅助工具脚本
│   ├── create-shortcut.py    # 桌面快捷方式生成脚本（带小鲸鱼高清图标）
│   └── build.ps1             # 一键打包与发布脚本
├── assets/                   # 媒体与图片音效资源
│   ├── DSniang1.png          # 小鲸鱼抠图本体
│   ├── DSniang02.png         # 备用原图
│   ├── icon.ico / icon.png   # 小鲸鱼专属 Windows 多尺寸应用图标
│   ├── rua.gif               # 台词动图
│   ├── Ya1.mp3 / Ya2.mp3     # 小黄鸭按压/松手音效
│   └── D1.mp3 / D2.mp3       # 音效1按压/松手音效
└── src/
    ├── main/                 # Electron 主进程
    │   ├── index.js          # 主进程生命周期、托盘与无边框透明窗口
    │   ├── store.js          # 本地配置与账本持久化 (%APPDATA%/deepseek-whale-pet/)
    │   ├── balance-service.js# API 余额请求、重试与缓存
    │   ├── usage-engine.js   # 峰谷计费模型与今日已用算法
    │   └── cost-listener.js  # 本地 HTTP 服务（接收外部消耗事件）
    ├── preload/
    │   └── index.js          # 安全 IPC 通信桥梁
    └── renderer/             # 挂件前端渲染
        ├── index.html        # 桌宠主窗口
        ├── settings.html     # 设置中心窗口
        ├── css/
        │   └── widget.css    # 气泡与按压 Q 弹样式
        └── js/
            ├── audio.js      # 音频播放与音量控制（常驻音效池）
            ├── widget.js     # 挂件交互、吸附、拖拽、数字滚动与随机台词
            └── settings.js   # 设置中心逻辑
```

---

## 📄 关联文档
- 📘 [Bug 修复与深度性能优化日志 (BUGFIX_LOG.md)](BUGFIX_LOG.md)

---

## 📄 License
MIT License.
