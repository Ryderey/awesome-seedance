# 请求超时与生成截断诊断（2026-10-04）

用户报告约十多秒出现“模型请求超时”，两个平台/模型都有此情况，要求使用当前保存配置进行测试。经补充确认，用户允许向该配置的模型发送公开库候选内容，最多三次真实搜索；原设置不修改，凭据和请求头值不输出。

## 已取得的实测信号

当前保存模型为 step-5-preview，单次 SDK 请求等待 30000 ms。查询统一为“动作·舞蹈·特效”。三次测试在隔离 Electron 主进程中进行，进程正常退出。

| 运行 | 意图请求 | 排序请求 | 结果 |
|---|---|---|---|
| 原行为：30 秒 / 2500 token | 30.01 秒中止，无 HTTP 响应 | 未发生 | SDK timeout |
| 对照：90 秒 / 2500 token | 19.53 秒，HTTP 200，stop，438 字符正文 | 35.30 秒，HTTP 200，length，0 字符正文，completion_tokens 2500 | 输出截断 |
| 对照：90 秒 / 排序 8000 token | 39.21 秒，HTTP 200，stop，443 字符正文 | 90.02 秒中止，无 HTTP 响应 | SDK timeout |

没有 HTTP 429。实测无法重现“十多秒”这个精确时长；不能断言另一平台具有相同根因。第二次意图输入约 4873 字符 / prompt_tokens 1753，排序输入约 18998 字符 / prompt_tokens 6130。此处计数属于这次请求，不是全库上下文容量。

提高到 8000 未得到完整搜索成功，不能作为修复后供应商验收通过。已用完本轮三次授权额度，不自动继续调用。

## 已确认的客户端缺口

原错误没有阶段或实测耗时，且提示调整超时但界面缺少等待控件。代码为每次请求硬编码 max_tokens:2500，收到 finish_reason:length 后按普通输出无法验证处理。单次 SDK 等待上限与上游 HTTP 状态是独立机制；有些传输超时也可能在配置上限之前发生，不能将所有 SDK timeout 都描述为计时器刚好到期。

处置：阶段/实测耗时/配置上限分别显示；可保存的单次等待；取消强制 2500，默认省略生成上限、允许按模型设置；length 使用独立截断错误，不接受不完整 JSON，不隐式增加请求次数；短理由/短引用保留来源校验。按用户的 DeepSeek 例子修正三档思考配置为 none/high/max，需按模型平台实际支持选择，不将厂商差异虚构成统一 token 配额。

## 协议依据

已安装 OpenAI SDK 的 Chat Completions 类型定义支持 reasoning_effort；OpenAI max_completion_tokens 包括正文与推理 token，DeepSeek Chat Completions 使用 max_tokens，与是否开启思考无关。因此上限字段需允许显式选择，不能从思考档位自动推断。分别发送，不同时发送两个上限字段。官方 API 说明：

- [Chat Completions 请求参数](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [输出 token 与不可见 token 的计数](https://developers.openai.com/api/docs/guides/token-counting)
- [DeepSeek 生成上限与思考三档](https://api-docs.deepseek.com/api/create-chat-completion/)

隔离测试先未取得可解密凭据，未发出模型请求；确认 Windows 配置目录包含系统加密状态后，复制仅该加密状态至临时测试目录用于同一用户解密，原目录只读。测试完成后删除这些临时配置目录，脱敏计时报告保留在 .tmp，产品包不包含用户配置。
