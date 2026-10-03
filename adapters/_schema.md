# 适配器字段定义

适配器只回答一个问题：**这个模型能不能满足模板的能力要求；不能满足时怎么降级并告知用户。**

## 四类字段

| 字段 | 作用 | 失败时的行为 |
| --- | --- | --- |
| `capabilities` | 能力位，路由硬门禁的依据 | 模板 `gates` 不被覆盖 → 换模板 |
| `limits` | 时长/画幅等硬约束 | 超限 → 重排时间轴，不是塞进提示词 |
| `syntax` | 写法方言 | 按方言改写对应块 |
| `degradations` | 能力缺失时的改法与告知文案 | 输出必须显式声明降级内容 |

## 取值约定

`capabilities.*` 只允许 `true` / `false` / `null`。

**`null` 表示"未核对"，不是"不支持"，也不是"支持"。** 未核对的能力位上，路由不得放行依赖该能力的模板，只能带警告放行或直接拒绝——由 `route.mjs` 的 `strictness` 决定，默认拒绝。

每个适配器必须有具体模型 `id` 与调用 `entry`。别名保留兼容；`aliasNote` 明确历史 UI 名称与当前核实 API 的区别。

每个布尔能力必须有对应 `verifications[]`：`capability/value/sourceType=official/url/verifiedAt/scope`。只读取继承仓库资料不能宣称官方核实；这条由构建器校验。`verifiedFrom` 汇总来源，`inheritedEvidence` 单独保留历史资料。

`degradations[]` 包含 `capability/trigger/blocks/action/notice`，写清改哪些结构块、替代动作和告知文案。没有具体规则时保留待确认项。后期处理须符合用户允许范围。

`limits.maxDuration` 表示单次生成上限；长成片可提出分段计划并确认结构可切分，连续单镜头或必须单次生成冲突时阻断。`durations/referenceDuration` 描述入口的时长档位，必要时提出裁剪计划而非假定任意时长都可执行。`limitVerification` 记录官方来源、日期与入口范围。

## 禁止放什么

**这里不放范例 prompt、不放风格词表、不放"某模型最佳实践"。**

一旦放入，模板内核与模型侧就重新耦合了，解耦设计作废。校验规则会直接拒绝：出现 `example` / `prompt` / `style` / `keywords` 任一字段即 build 失败。

风格与结构一律留在 `data/` 的模板里；适配器只声明能力。

## 新增一个模型

复制一份 json，填写版本 `id` 与 `entry`，全部未核实能力填 `null`，逐能力核实后添加记录，运行 `node router/build.mjs --write --out .tmp/router-package`。
校验会警告"存在未核对能力位的模型"，这是预期状态，不是错误。
