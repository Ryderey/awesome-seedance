# Research: 案例语义标签与运动饮料误匹配

- Query: 现有数据有哪些分类；如何区分饮料产品广告与骑行／健身片段，以及安全增加语义标记。
- Scope: internal；仅分析本地数据与分类契约，不修改产品代码、不调用真实模型。
- Date: 2026-10-04

## Findings

### 事实：已有分类侧重拍法，案例主题标签不足

- `CONTEXT.md:7` 定义模板为可复用拍法；`CONTEXT.md:27` 将拍法路由与 `CONTEXT.md:31` 的主题搜索明确区分。因此“归到某个模板”不能直接证明案例拍摄了用户要的产品。
- 用 Node 解析 `data/cases.json` 全部 670 条记录：`category` 全部为 `video`；`tags` 都存在，2 条为空，去重后共 197 个标签；`summary`、`promptFull` 均非空。没有任何案例拥有 `subject`、`subjectRole`、`productType`、`purpose`、`topic` 或 `semanticTags` 字段。
- 高频标签是来源／审核／模型信息：`source-x-socialdata`、`prompt-public`、`trial-x-socialdata` 各 481 次，`auto-approved` 441 次，`youmind` 157 次；它们不表示主题相关性。粗略按 `source-/query-/trial-/auto-/author-display:/manual-/prompt-` 前缀及来源、模型、审核固定词排除后，644 条仅剩元数据，24 条带其他标签，2 条为空。**此 644/24 是明示规则下的统计，不是经过人工审核的语义覆盖率。**
- 合并模板共有 27 条（上游 14、本地 13），全部有标签；上游有 34 个 `tagLabels`，合并模板实际使用 34 个去重标签，主要为 `timeline`、`shot-list`、`reference-lock`、`product`、`commercial` 等结构／制作特征。六个分类是结构基础、真实感、商业、叙事、风格化、动作；不是饮料／美妆／汽车等产品主题分类。见 `data/style-library.json:14`、`:152`，`data/templates-local.json:1023`。
- `data/case-taxonomy.json:2` 规定每条案例映射一个主模板或 `null`；当前 670 条全部有显式映射，6 条为 `null`。例如骑行片对应 `timeline-shot-script`，训练片对应 `handheld-ugc-vlog`（`:290`、`:197`）。这是拍法归属，不能替代多维主题标签。
- 现有路由 facets 包括风格、镜头、对白、参考、音乐、文字、时长、粗粒度主体；`subjects` 仅 person/animal/vehicle/product/place/abstract。产品模板主体为 product，没有饮料子类或主体角色关系。见 `router/facet-profile.json:3`、`:56`、`:166`。`router/capability-map.json` 描述模型能力／制作约束，也不提供案例商品主题分类。

### 事实：截图中的三个案例及其证据

| 截图案例、slug、作者 | 原文短证据 | 语义判断（解释，不是已有标签） |
|---|---|---|
| 马尔代夫骑行纪录片；`seedance-2-5-f3651857750b`；`@techhalla` | `riding a simple white beach bicycle at casual pace`；`A staff member in white uniform waves as he passes with a tray of drinks.` | 主体是骑行人物，饮品仅为背景员工托盘道具；不能因出现 drinks 就标记为饮料广告。源：`data/cases.json:1881`、`:1886`、`:1891`。 |
| 健身女孩训练 vlog；`johnagi168-seedance-ai-556a7495c74b`；`@johnAGI168` | `运动广告质感，真实力量与器械物理反馈` | 运动广告“质感”不是饮料产品广告用途的证据；可作为训练动作／剪辑辅助参考，不能补出饮料产品。源：`data/cases.json:28136`、`:28141`、`:28146`。 |
| 90 年代 VHS 健身 vlog；`90-vhs-vlog-ae90c46cb606`；`@you1873118` | `80/90年代复古家用录像带风格健身 vlog。` | 核心为健身与复古摄影；缺少明确饮料商品展示依据。源：`data/cases.json:7031`、`:7036`、`:7041`。 |

**推断：** 问题不是“骑行不能用于饮料广告”，而是“背景道具／可迁移运动拍法”进入主推荐时，被当成“所需产品案例”。需要表达主体角色与匹配用途，不宜只增加一个扁平 `运动`／`饮料` 标签。

### 事实：可用饮料广告正向对照

- `mountain-dew-spark-b16d4e23caef`，`@Caden_Flux`，原文有 `holding a chilled Mountain Dew Spark can` 与 `Transition into a premium macro product close-up`；主商品、包装和特写均有证据。主模板为 `product-commercial-shotlist`。源：`data/cases.json:4191`、`:4196`、`:4201`。
- `ugc-80d503f66caa`，`@AIwithkhan`，原文有 `Create a premium UGC-style beverage commercial` 与 `holding an ice-cold sparkling fruit drink beside her face`；明确饮料广告与饮用／展示行为。主模板为 `ugc-creator-review`。源：`data/cases.json:4224`、`:4229`、`:4234`。
- `crimson-cola-99e9ec88e937`，`@DjajaYerry75`，标题／摘要明确为汽水品牌广告，是补充饮料正向对照。源：`data/cases.json:7825`、`:7827`、`:7835`。
- 以上都不能自动声称是运动饮料。对全部标题、摘要、完整提示词检索 `运动饮料|电解质饮|sports?\\s*drink|gatorade|powerade` 得到 0 条。这只证明该字面检索无命中，**不证明库中绝无运动饮料素材**；饮料广告可列为相邻产品参考并明确缺失运动／功能饮料条件。

### 方案建议：独立语义覆盖层，按角色标记

1. 新建本仓拥有的语义覆盖文件（建议 `data/case-semantics.json`），按稳定 slug 存储；模板可用同文件的 template-id 区域或独立模板语义文件。不要把主题细分硬塞进现有单模板 taxonomy，也不要手工改写上游 `cases.json`。
2. 最小受控维度：`primarySubjects`（主体）、`productCategory`（产品大类及可选子类）、`purpose`（产品广告／vlog／纪录等）、`actions`、`scenes`；另外显式记录 `backgroundObjects`，避免背景饮品被提升为主商品。广告质感单列风格证据，不等于广告用途。
3. 关键标记必须带可定位的原文短引用及来源字段；只有证据支持才赋值。`unknown`／缺标记不视为否定，标签冲突交人工复核。自动提取只生成待审稿，先复核截图案例、饮料正对照与跨主题难负例，再扩大到全库。
4. 模板记录表达“适合组织哪种拍法／广告结构”；关联案例的产品主题不能直接变成模板限制。推荐时区分主体产品参考与可迁移拍法参考：缺饮料主体的骑行／训练仅入辅助参考，不挤占主案例推荐；明确饮料商品广告即使缺运动场景，也优先列为相邻参考并说明缺口。
5. 覆盖层附 schemaVersion、提取／人工审核状态及标题摘要全文的 sourceHash。源变更后旧标记失效进入待复核；上游删除的 slug 只报告或忽略，新案例未标记仍允许基于原文检索。保存本地标签与生成索引的分工，纳入打包／刷新／指纹，避免同步覆盖或使用旧证据。

### 数据所有权与相关契约

- `scripts/lib/library.mjs:1` 明确 `style-library.json` 是上游私仓蒸馏导出、同步会改写；`:2` 与 `data/templates-local.json:2` 规定手写模板内容放本地覆盖层；加载与合并由 `scripts/lib/library.mjs:34`、`:109` 统一完成。案例快照的来源与本地快照策略见 `README.md:8`、`:155`、`:164`。
- 相关规范：`.trellis/spec/frontend/type-safety.md` 要求 Agent 用真实候选 ID 与精确原文引用，并说明模拟 SDK 测试不等于语义质量验证。现有 router 验证是拍法路由指标，不能充当新增主题案例筛选的准确率验收。
- 验收建议：固定“运动饮料广告”的三条截图负对照、两条明确饮料广告正对照；另测“骑行纪录片”“健身 vlog”“只要运动镜头参考”，防止过度筛选。主推荐主体错配为零，辅助参考缺口清楚，并分别报告产品主题命中、召回与额外模型调用数。

## Caveats / Not Found

- 未调用用户真实服务，未取得截图那次模型的原始扩展 terms 或完整返回；本文件不归因于某一次确定的扩词，也不评估实时供应商模型质量。
- 不看视频画面推断未写在提示词里的商品用途；本研究以已收录的标题、摘要和完整提示词为证据。
- 外部参考：无；本问题的数据所有权、标签现状与案例内容由仓库源码直接证明。
