# dsh-open-browser

> 非官方项目，由社区成员独立开发和维护。与 DeepSeek 官方无关。

> Unofficial project, independently developed and maintained by community members. Not affiliated with DeepSeek.

一个 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 插件：**Web UI 服务器启动成功后，自动在浏览器中打开页面**。

- 无需手动复制粘贴 URL——`dsh web` 一启动，页面就自动打开。
- 跨平台：Windows / macOS / Linux 统一行为。
- 零配置、零依赖（仅使用 Node 内置模块）。

## 特性

- **就绪后再打开**：注入 `webRuntime` 服务并等待 Loader 结算，只有服务器真正绑定成功才打开浏览器；启动失败则保持安静。
- **Chrome/Chromium 优先，默认浏览器兜底**（三平台一致）：
  - Windows：探测 `PROGRAMW6432` / `PROGRAMFILES` / `PROGRAMFILES(X86)` / `LOCALAPPDATA` 下的 `chrome.exe`，找不到回退 `cmd /c start`；
  - macOS：探测 `/Applications` 与 `~/Applications` 下的 Chrome，找不到回退 `open`；
  - Linux：探测 `google-chrome` / `chromium` 等（含 `/snap/bin`），回退 `xdg-open` → `gio open` → `sensible-browser`。
- **不拖住 dsh 进程**：`detached + stdio ignore` 启动，打开失败只记日志。

## 安装

要求已安装 `dsh` CLI（见[官方文档](https://github.com/deepseek-ai/deepseek-harness)）。

```sh
# 从 GitHub 安装（推荐；仓库已包含预构建 index.js，无需再构建）
dsh plugin --profile <name> add github:MuYu-Zh/dsh-open-browser

# 或从 npm 安装（需已发布到 npm registry）
dsh plugin --profile <name> add dsh-open-browser

# 或从 tarball 安装
dsh plugin --profile <name> add ./dsh-open-browser-0.1.0.tgz
```

验证并启动：

```sh
dsh --profile <name> --dump-config   # 应看到 "# == dsh-open-browser" 层
dsh --profile <name>
```

移除：

```sh
dsh plugin --profile <name> remove dsh-open-browser
```

## 工作原理

`cordis.patch.yml` 向组合插入一行插件：

```yaml
- insert:
    - id: open-browser
      name: dsh-open-browser
```

插件加载后：

1. 声明注入 `webRuntime` 服务——只有 dsh-web-app 绑定 Web 服务器后该服务才存在；
2. 读取 `ctx.webServer.port` 拼出 `http://127.0.0.1:<port>`；
3. 等待 Loader 结算（与官方就绪日志同一语义）后，按平台候选链在浏览器中打开 URL。

## npm 包结构

- `index.js`：预构建产物，安装后直接可用
- `cordis.patch.yml`：DSH bundle 装配声明
- `src/open-browser.ts`：TypeScript 源码
- `README.md`：本文档

## 开发

```sh
# 源码在 src/open-browser.ts，index.js 是无类型分发入口
# 修改源码后，按需重新转译：
#   npx tsc --target es2022 --module esnext --moduleResolution bundler src/open-browser.ts --outFile index.js
# （转译前请移除 @deepseek-ai/cordis 的类型导入）

# 本地校验 npm 包内容
npm pack --dry-run --ignore-scripts
```

## 许可

MIT

---

## 插件专区发帖模板（可直接复制）

标题：

```
DSH｜dsh-open-browser｜dsh Web UI 启动后自动用浏览器打开页面（跨 Windows/macOS/Linux）
```

正文：

```
> 非官方项目，由社区成员独立开发和维护。

**项目地址：**
https://github.com/MuYu-Zh/dsh-open-browser

**项目介绍：**
dsh-open-browser 是一个 DeepSeek Harness 插件：dsh Web UI 服务器成功启动后，
自动在浏览器中打开页面，无需手动复制 URL。
- 跨平台：Windows / macOS / Linux 统一行为，Chrome/Chromium 优先、系统默认浏览器兜底；
- 零配置、零外部依赖（仅用 Node 内置模块）；
- 等 Loader 结算（服务器真正就绪）后才打开，启动失败保持安静，不打断 dsh。

**与 DSH 的集成方式：**
插件注入 webRuntime 服务并等待 Loader 结算，读取 ctx.webServer.port 拼出页面地址；
通过 cordis.patch.yml 以 dsh.bundle 组合包形式安装：
`dsh plugin --profile <name> add github:MuYu-Zh/dsh-open-browser`

**截图：**
（添加 dsh 启动后浏览器自动打开页面的截图/GIF）
```
