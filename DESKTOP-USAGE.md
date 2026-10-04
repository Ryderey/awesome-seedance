# 镜库桌面应用

本地 Windows 应用搜索全部 27 个模板与 670 条案例，包括 6 条未归类案例。模板、案例分别展示；点击条目查看原始全文、复制提示词、播放源视频或打开来源地址。复测视频单独标识。

## 开发运行

需要 Node.js 22 或更新版本。

```powershell
npm ci
npm run desktop:start
```

在「模型设置」填入兼容 OpenAI Chat Completions 的 Base URL、模型名称和 API Key，保存后测试连接。Base URL 通常包含 `/v1`，不包含 `/chat/completions`。请求由桌面主进程使用官方 OpenAI SDK 发出。兼容协议不保证每个厂商和模型都有相同的匹配质量。

Key 使用操作系统加密保存；系统加密不可用时仅在本次会话保留。输入框留空保留现有 Key；勾选清除才会删除。设置不进入项目数据或安装包。

## 搜索

输入主题、主体、动作或拍法，例如「赛博朋克街头，一只猫的产品广告」。本地结果先显示，明确标为初步候选；Agent 随后理解意图、检索并核对真实记录，返回相关性理由。最多一个可跳过的问题。模型失败保留初步结果，可重试或取消。没有匹配会显示空结果。

媒体仍由原始远程地址提供，可能失效或受网络限制。播放器无法加载时可打开来源或媒体链接。应用不会生成视频或改写原始提示词。

## 验证与打包

打包前先关闭正在运行的便携版程序；构建会重新生成 `dist/desktop` 下的应用目录。

```powershell
npm run desktop:test
npm run desktop:benchmark
npm run desktop:smoke
npm run desktop:package
```

正式输出为 `dist/desktop/Video Prompt Library-win32-x64/VideoPromptLibrary.exe`。复制完整的 `Video Prompt Library-win32-x64` 目录后运行，无需 Node.js；不能只复制 exe 文件。`dist/` 已加入 Git 忽略，不附带开发配置或 API Key。

构建中间文件使用 `.tmp/desktop-stage`，打包成功后自动删除；失败时保留以便排查。`.tmp/npm-cache` 与 `.tmp/electron-cache` 是依赖和运行时缓存，可保留以支持离线构建；其他测试设置、日志、截图和旧包属于临时产物。首次安装 Electron 必须下载对应运行时，后续打包优先使用缓存。

SDK 测试使用本地模拟服务，真实厂商连接请在应用内验证。
