# Agent 搜索验证

职责与步骤入口是 `desktop/agent.mjs` 的 `AGENT_ROLE_PROMPT`。每次请求注入固定职责与当前阶段协议：先生成搜索计划，应用执行检索，再由模型核对候选。使用通用 Chat Completions，正常两次调用，全流程共用一次格式修复机会；无候选不调用排序。

主体、关键用途不清晰或条件冲突时，Agent 可先问一个关键问题，最多两轮。提问阶段直接返回，不检索/排序；等待回答没有额外请求。原主题与两轮 question/answer 历史一起供后续阶段使用，最新明确回答覆盖冲突条件。用户跳过或两轮后仍不明确时，只按已有明确条件给宽泛参考，全部为 uncertain/partial，不能猜测未提供的产品、品牌或用途。清晰主题不强求时长/风格等可选细节。

“运动饮料”的中英文别名属于同一个主产品条件；“饮料”属于相关产品范围；运动、骑行、健身不会默认变成同义词。主体、用途、可选拍法与排除条件分别传递。排序只使用提供的 ID 和原文引用。案例分为同主题、相关产品、拍法参考、信息不足。背景托盘饮料不能使骑行片变成饮料广告；汽水和果饮广告不能宣称为运动饮料完整匹配。用户可主动拓展拍法参考，也可浏览全部本地结果。

## 离线验证

```powershell
node scripts/build-search-semantics.mjs --check
node scripts/validate-search-semantics.mjs
npm run desktop:test
node --test desktop/semantic-*.test.mjs
npm run desktop:benchmark
npm run desktop:integration
```

标记带来源指纹和原文字段证据，原内容变动后旧标记失效。索引覆盖所有 ID；未审核内容保留 unknown/draft，不能据此给出完整匹配。人工纠错在独立覆盖文件中，不能只更新指纹而沿用旧判断。SDK HTTP 模拟服务检查协议、证据、分层和交互，不能证明供应商语义准确率。Electron 测试使用隔离目录和正常宿主权限，保持渲染器 sandbox。

## 真实供应商重复评测

`desktop/agent-evaluation-queries.json` 固定至少 30 条查询，每条默认重复 3 次。金标只覆盖审阅过的案例；其他推荐须人工判定，不能将模型理由作为正确性证明。先查看预算（不调用供应商）：

```powershell
node desktop/evaluate-agent.mjs --prepare
```

创建仓库外专用测试配置文件，内容示例：

```json
{
  "baseURL": "https://example.com/v1",
  "model": "your-model-id",
  "apiKey": "填入测试 Key",
  "timeoutMs": 90000,
  "maxOutputTokens": null,
  "maxOutputParameter": "max_tokens",
  "reasoningEffort": null,
  "headers": [
    { "name": "x-opencode-session", "valueType": "session", "enabled": true }
  ]
}
```

该文件包含明文测试凭据，由用户管理。评测只读取明确指定的文件，不读取应用保存的密钥；请求头按现有校验处理，自动会话 ID 在一次运行中复用。输出不保存连接凭据。

```powershell
node desktop/evaluate-agent.mjs --config 'D:/private/agent-test.json' --out '.tmp/desktop-agent-evaluation.json'
```

记录模型、数据版本、搜索计划、候选证据、最终分层、请求数及耗时。报告审阅样本召回、禁止案例命中、错误层级和未判定推荐数；整体相关率与错误完整匹配率由人工复核后计算。旧版在独立 checkout 按相同配置和查询集复测；截图当次未知扩词不能作为已重放的基线。

评测不再默认跳过所有追问。需要补充信息的查询记录为 clarification，计入真实意图请求数，不自动回答，也不计为已完成搜索。样本可显式配置 clarificationHistory（最多两条 question/answer）、旧 answer 或 skipQuestion:true；skip 代表主动选择宽泛参考，不能用于把完整查询统一绕过提问，否则会改变结果分层。

冻结骑行/健身负例不得进入默认产品广告推荐；其他饮料不得升级为运动饮料完整匹配；显式骑行/健身查询仍能检索相应内容。真实模型结果未取得时，验收记录必须注明待验证。

## 请求等待与故障区分

高级配置中的“单次模型请求等待”范围为 1–120 秒。新配置默认 90 秒，已经保存的值保持原样。意图分析、候选排序及一次格式修复分别计时，因此完整搜索的总耗时可能超过单次上限。连接测试使用相同等待配置；不会自动重试网络请求。

客户端需要等待上限，因为断开的连接或未完成响应可能没有任何上游错误可供展示。SDK 超时提示包含意图分析/候选排序/结果修复阶段、实际等待和配置上限；这两项分别记录，不能把配置上限当作实际耗时。HTTP 429 仍显示限流，HTTP 408/504 等有响应的失败显示对应状态，不改称客户端超时。取消搜索保持取消语义。

`onDiagnostics` 的 `request` 事件记录 requestStage、sourceStage、call、timeoutMs、elapsedMs、outcome 与可选 httpStatus，不包含配置、凭据、请求头值或供应商原始错误。只有使用明确授权的真实配置复现，才能确认用户供应商的实际故障；模拟慢响应测试仅验证客户端行为。

## 生成上限与思考模式

高级配置中生成上限留空（maxOutputTokens:null）时不发送任何 token 上限字段，由平台选择其默认值。应用不再强制 2500。可手动填写 1–1048576 的正整数，常用建议为 4096/8192/16384/32768；这是应用输入边界，不是声明模型实际支持这么大的输出。平台的实际上限依其模型说明。maxOutputParameter 默认 max_tokens，可在手动填写上限后选择 max_completion_tokens；每次只发送选中的一个字段，不能根据是否开启思考猜测这个字段。

思考模式默认跟随模型（reasoningEffort:null，省略 reasoning_effort）。三个主动选项分别发送 none（关闭）、high（开启）、max（最大）。选择的是对应参数值，不自动将 max 降成 high；模型不支持某参数时由服务返回失败。探测、意图、排序和一次格式修复使用相同配置。生成上限独立，不为所有平台写死档位配额。

[DeepSeek 官方 Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) 的三档对应 none/high/max，使用 max_tokens；省略上限时默认依次为 8K/64K/128K。[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) 的 max_completion_tokens 包括可见正文和推理 token，且不同模型支持的 effort 范围不同；不能将一家平台的规则套在所有兼容服务上。

finish_reason:length 表明本次生成不完整，可能达到生成上限或模型上下文限制；应用显示独立的“生成被截断”错误和 truncated_output 诊断，不接受残缺 JSON、不将其标为 timeout/HTTP429，也不自动增加一次模型调用。正常格式错误仍共用一次修复机会。较长思考也可能先触发请求超时，提高上限不能保证服务更快。
