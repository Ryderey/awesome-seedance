# Design proposal

完整方案以仓库根目录 PLAN-desktop-agent-search-relevance-2026-10-04.md 为准，避免复制两份可漂移的设计。

职责：固定 AGENT_ROLE_PROMPT + 当前阶段协议。意图阶段由 Agent 生成 primaryKeywords/relatedKeywords/optionalKeywords/exclusions 与用途/条件；程序执行该搜索计划，不再将原始用户请求拆词自动追加到 Agent 候选计分。排序阶段 Agent 核对标记与真实证据，程序校验范围与来源。

数据：现有 case-taxonomy 是拍法归类，保留。增加独立、来源可追溯且版本可失效的语义层，区分主要产品/背景道具、用途/广告质感和拍法。先小样本审核，再扩展全库。

结果：主主题案例、相关产品、拍法参考分层。默认产品搜索不以纯运动/跟拍补足推荐数。模板按可复用结构匹配。未知、不完整和缺匹配明确表达。完整本地搜索保持可浏览。

修改边界：误差发生在意图协议、候选检索、语义依据和推荐展示，分别修改 agent/catalog、独立语义模块与数据构建、UI。原始案例数据及拍法 taxonomy 保持原来源；不引入数据库、向量服务或 CI。保留现有本地搜索接口，新增计划检索；用现有回归确认本地探索未漂移。

实现约定：搜索计划传递 primaryKeywords/relatedKeywords/optionalKeywords/excludeKeywords/required/goal/allowTechniqueOnly/question。推荐卡片增加 relevanceTier（topic/related_product/technique/uncertain）、evidence 与 gap；保持 matchType 兼容。结果仅在通过来源、用途和主体角色校验后进入主推荐，未确认标记不支持 full。前端明确分层，拓展拍法参考由用户单独开启，并通过搜索输入 allowTechniqueOnly 传给主进程。真实截图那次模型扩词和完整返回未取得，不声称重放供应商推理。

## 2026-10-04 已确认：主题不清晰时主动追问

用户经 grill-me 访谈接受：主体/用途缺失或条件冲突会实质影响匹配时问，不按输入长短触发、不强求时长/风格；最多两轮，每轮一个关键问题，信息够即匹配；沿用 2–4 选项、自由输入、跳过。等待回答期间没有模型调用。跳过或两轮后仍不明确时仅按明确条件给宽泛参考，标注信息不足，不补出产品/品牌/用途、不再问。

跨层协议：search 增加 clarificationHistory:[{question:string(1–240),answer:string(1–1000)}]，最多两项，主进程和 Agent 边界都校验；原 query 保持原文，按次序向意图/排序传历史，最新明确回答可覆盖冲突条件。保留旧 answer 参数兼容。追问结果带 clarificationRound / maxClarificationRounds，计数以有效历史为准；新 query / 分类 / 全部内容重置历史，重试保留，不重复追加答案。回答发生前不追加历史，提问阶段提前返回，不发排序请求。

意图方案允许缺少主体时 primaryKeywords:[]，但仅限需要追问或被跳过/达到上限的宽泛状态；新增可选 uncertainty 文本说明缺少的信息。程序执行轮数/skip 限制，不依赖提示词自行遵守；宽泛结果带 broadReference/uncertainty 元数据，候选一律 partial/uncertain，排序不得升级。未知主体不做填充；没有足够明确条件时可返回明确标注的泛用参考，而非伪造目标。正常、完整主题的现有产品/用途/引用校验不降低。

边界：agent.mjs 与测试管追问职责、历史/轮数与提前返回；main.mjs 管 IPC 校验和转发；catalog/search-semantics 管宽泛参考仅按已有条件召回与降级；UI 管历史、轮次提示、跳过/重试/重复点击与本地分类重置；集成回归、规范与便携版同步。不新增配置页、持久化聊天、自动问答循环或网络重试；不调用真实模型、不改案例/分类数据/CI。

检查发现旧评测脚本统一 skipQuestion:true，会把清晰查询也标成主动跳过的宽泛参考；同步修正为样本显式 skipQuestion，转发可选历史。询问状态记录 clarification，不自动答题；请求数包括询问阶段，completedSearches 只计实际匹配完成，attemptedSearches/clarificationSearches 单列，避免把等待用户的信息缺口计作成功搜索。
