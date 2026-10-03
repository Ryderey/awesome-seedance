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

```powershell
npm run desktop:test
npm run desktop:benchmark
npm run desktop:smoke
npm run desktop:package
```

打包产生 `.tmp/desktop-dist/Video Prompt Library-win32-x64/VideoPromptLibrary.exe`。复制整个目录后运行，无需 Node.js。首次安装 Electron 必须下载对应运行时；打包使用安装缓存，不附带开发配置或 API Key。SDK 测试使用本地模拟服务，真实厂商连接请在应用内验证。
