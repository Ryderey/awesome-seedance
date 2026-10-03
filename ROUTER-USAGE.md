# 视频提示词路由：使用、构建与安装

文本入口保持兼容：

```bash
node router/route.mjs "没有参考图，不要音乐和字幕，15 秒实拍猫的视频" --json
node router/route.mjs --request request.json --json
```

`request.json` 包含 `text`、可选 `model/top/strictness/facets/referencePurpose`。`facets` 的字段省略允许文本补充，`null` 强制未知；用户回答合并进完整请求后再次执行。`subjects` 是数组，时长指全片总长。参考用途为 `identity/product/first_frame/storyboard`。`singleGeneration: true` 表示必须单次生成，`allowEditing: false` 表示禁止剪辑与后期。

输出 `status` 为 `ready/needs_clarification/no_match`，候选提供用途、正向匹配、硬条件、软差异和待确认项。无正向证据的兼容集合不能当作已匹配推荐；宿主负责阅读用途并终选。必要问题未回答时继续保持待答。模型别名解析到适配器的精确版本与入口，历史即梦别名目前指向方舟核实范围，UI 入口需独立核对。

统一命令顺序：

路由验证、打包与安装均在本地执行；本轮新增的 CI 工作流已删除，不需要远端 CI。

`feat/video-prompt-router` 分支独立维护，提交与推送保留在该分支，不合并到 `main`。源码、配置与对应生成物一起提交。

```bash
node router/build.mjs --check
node router/build.mjs --write --out .tmp/router-package
node router/build.mjs --status --target "D:/Work/test_github_projects/.agents/skills/video-prompt-router"
node router/build.mjs --install .tmp/router-package --target "D:/Work/test_github_projects/.agents/skills/video-prompt-router"
```

首次接管无 manifest 的旧包，在最后一个命令追加 `--migrate-legacy`。安装前验证摘要和独立运行，在目标同一父目录准备新包，整体切换并验证，失败恢复旧包。最近完整备份为 `<target>.backup`；目标内的未知文件保留，手工修改的托管文件会阻止更新。遇到锁定时关闭占用宿主后重试。

`--check` 在临时快照中重建，不改源码与安装目录。`--write` 仅在路由、固定口语集、固定摘要集、上游 JS/Python、链接与独立包验证全部成功，且工作区输入未变化后写回。可设置 `ROUTER_PYTHON` 指向本机 Python；环境缺失会使检查失败。构建不会获取远端数据；上游 commit 未明确确认时记录为未知。

新增、修改或删除模板后，检查画像、能力 tag、词表补充、归类与口语样例引用。每模板至少四条中英文口语样例，其中两条明确拍法。零案例标签仍在摘要覆盖报告中显示，不能从评测中消失。删除或改名需要迁移旧引用，成功安装后旧托管模板文件自动退出。

阈值唯一来源为 [eval/thresholds.json](./eval/thresholds.json)。固定摘要来自原 286 条案例快照，与训练标题同源；单独的 108 条口语集不进入词表抽取。报告分别记录 top-5 与实际候选集保留率、截断前兼容数量以及补问后保留率。旧实验保留在基线目录，生产与 oracle 共用评分，合成画像实验不是独立泛化上界。

适配器按 2026-10-03 查询官方文档，只将逐能力有依据的断言设为布尔。参考输入、原生生成音频、上传音轨与严格口型同步分别核对；未知项可见，不能宣称已验证可执行。官方来源保存在各适配器的 `verifications/limitVerification`，本次仅验证路由与文档契约，没有调用付费视频生成 API。
