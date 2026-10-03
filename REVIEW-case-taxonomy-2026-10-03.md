# 53 条未分配案例归类复核记录

> 日期：2026-10-03（Asia/Shanghai）
> 范围：本地 670 案例快照中的 53 条路由未分配项；只修改仓库自有 taxonomy，不修改上游案例文本、来源、证据级别或媒体。

## 1. 结果

| 项目 | 数量 |
| --- | --- |
| 本轮逐条复核 | 53 |
| 原未归类待办 | 46 |
| 原明确跳过（null） | 7 |
| 本轮写入模板标签 | 47（46 条新增，1 条从 null 重新归类） |
| 复核后保留 null | 6 |
| 未处理归类待办 | 0 |
| 全库有模板归属 | 664/670 |

剩余 6 条均有明确跳过依据，不计作尚未阅读或尚未处理。若后续新增混合媒介、教学实验或新闻直播模板，应优先重新评估其中相应案例；本轮不新增模板。

## 2. 依据与边界

- 逐条阅读仓库 `promptFull`，以主拍法、动作因果、视觉制作契约为主；标题和摘要只辅助定位。
- 每条仅归一个主模板。通用的时间码、身份一致性、音乐或科幻形容词，不自动覆盖更具体的拍法。
- 旧 DV 与普通 vlog、载具追逐与近身打斗、3D 角色动画与混合媒介分别判断。
- `null` 表示已有明确不归类决定，不代表遗漏；不强塞到通用模板以制造“零未分配”。
- 本轮由代码助手按本地导出内容逐条归类，尚未经独立人工复核；未重新核验原帖、输出媒体或厂商能力。旧 286 条基线保持冻结；新词表与当前摘要回归集由构建器生成，指标分别报告。

案例导出时间：`2026-10-02T22:16:16.878Z`；案例文件 SHA-256：`311d0fec1a7fefdf8c7ae7d4cbfa4e4d761220f9482448562be109259065d6ee`。

taxonomy 更新前 SHA-256：`e806de2887b9a4e556d7dfce7ee1356b81b171ff4836144a3d7c259607d6bead`；更新后：`70be5e66b67b5291950e88fd2b2b59c5ac0213e2c615d0c13944ddd34722bfda`。

## 3. 本轮标签分布

| 模板 | 本轮新增／重新归类数量 |
| --- | --- |
| `3d-cartoon` | 5 |
| `car-vehicle` | 2 |
| `cinematic-narrative-short` | 4 |
| `combat-choreography` | 6 |
| `dialogue-performance-beats` | 1 |
| `epic-fantasy-scifi` | 3 |
| `fashion-lookbook` | 4 |
| `food-asmr` | 1 |
| `handheld-ugc-vlog` | 4 |
| `meme-comedy` | 4 |
| `music-beat-sync-mv` | 1 |
| `retro-found-footage` | 7 |
| `timeline-shot-script` | 1 |
| `travel-city-walk` | 4 |

## 4. 逐条决定

| 序号 | 案例 | 决定 | 原文证据（promptFull） | 理由 |
| --- | --- | --- | --- | --- |
| 1 | [幼儿开门学字母与单词](https://goodcase.ai/cases/seedance-made-with-seedance-2-5-73b10f69e32a)<br>`seedance-made-with-seedance-2-5-73b10f69e32a` | `3d-cartoon` | 3D animated educational kids video | 明确为 3D 儿童角色动画；开门学字母是角色动作序列，不是写实教学实验。 |
| 2 | [千禧年代韩国女孩生日聚会](https://goodcase.ai/cases/seedance-a-birthday-worth-remembering-2f852147a691)<br>`seedance-a-birthday-worth-remembering-2f852147a691` | `retro-found-footage` | authentic consumer DV camcorder | 千禧年代生日家庭录像，明确要求真实旧 DV、对焦漂移及非电影化拍摄；年代与器材比普通 vlog 更具体。 |
| 3 | [红围巾女特工决战暗黑教室](https://goodcase.ai/cases/seedance-create-a-60-second-ultra-realistic-cinematic-korean-action-thriller-scene-featu-f31c9f4b3fc8)<br>`seedance-create-a-60-second-ultra-realistic-cinematic-korean-action-thriller-scene-featu-f31c9f4b3fc8` | `combat-choreography` | intense gunfight choreography, acrobatic martial arts | 枪战、闪避、踢击与反击连招是主体；六段时间码只是动作编排手段。 |
| 4 | [未来公路上的机车与超跑追逐](https://goodcase.ai/cases/seedance-cinematic-photorealistic-sci-fi-action-sequence-moody-desaturated-color-grade-edfd133b78ea)<br>`seedance-cinematic-photorealistic-sci-fi-action-sequence-moody-desaturated-color-grade-edfd133b78ea` | `car-vehicle` | Tunnel chase shot | 机车机械展开、超跑追逐、漂移与驾驶 POV 构成主线；科幻材质不改变载具速度片的核心拍法。 |
| 5 | [千禧年代首尔情侣午后兜风](https://goodcase.ai/cases/seedance-create-a-30-second-1080p-ultra-realistic-early-2000s-consumer-dv-camcorder-hom-a3fa022a7b4e)<br>`seedance-create-a-30-second-1080p-ultra-realistic-early-2000s-consumer-dv-camcorder-hom-a3fa022a7b4e` | `retro-found-footage` | Raw early-2000s consumer DV camcorder footage | 首尔情侣兜风采用早期 DV 家庭录像；汽车是生活道具，不是高速追逐主角。 |
| 6 | [周一清晨的倒悬入水仪式](https://goodcase.ai/cases/seedance-this-is-how-it-feels-like-to-wake-up-on-monday-to-go-to-work-b0d56af4f909)<br>`seedance-this-is-how-it-feels-like-to-wake-up-on-monday-to-go-to-work-b0d56af4f909` | `fashion-lookbook` | performance-art / fashion editorial video | 原文定位时尚 editorial，主体是人的造型与单镜表演；明确 elegant rather than slapstick，不按周一配文归搞笑。 |
| 7 | [枪口下闪回的金色恋歌](https://goodcase.ai/cases/seedance-this-is-not-the-ending-you-think-it-is-4b817978c02e)<br>`seedance-this-is-not-the-ending-you-think-it-is-4b817978c02e` | `cinematic-narrative-short` | Mood: heartbreak → fierce confrontation → tender memory/fantasy of love. | 冷色对峙切暖色爱情记忆，情绪转折与叙事结构主导；无对白不妨碍归入叙事模板。 |
| 8 | [西爪哇乡村恋人的夏日漫步](https://goodcase.ai/cases/seedance-30-second-1080p-ultra-realistic-early-2000s-consumer-dv-home-video-in-rural-we-6b3c6132a462)<br>`seedance-30-second-1080p-ultra-realistic-early-2000s-consumer-dv-home-video-in-rural-we-6b3c6132a462` | `retro-found-footage` | Raw early-2000s DV | 西爪哇村落约会明确旧 DV 家庭录像；乡村地点不等于旅行大片。 |
| 9 | [粉发女孩的夜间体能训练挑战](https://goodcase.ai/cases/seedance-why-did-i-think-this-workout-would-be-easier-dea31b0d7735)<br>`seedance-why-did-i-think-this-workout-would-be-easier-dea31b0d7735` | `handheld-ugc-vlog` | Casual evening functional-training vlog | 自拍、支架机位、气喘和对镜短句构成训练日记；并非运动竞技或极限特技展示。 |
| 10 | [Seedance 2.5 视频续写实验：首帧之后生成有意义新内容](https://goodcase.ai/cases/lexers-seedance-ai-7040e9b2e90e)<br>`lexers-seedance-ai-7040e9b2e90e` | 保留 null | AI Extend in CapCut PC can generate what happens next | 工具续写与编辑流程介绍，没有一个可复用的场景提示词；保留原明确跳过。 |
| 11 | [湿冷地铁站台格斗](https://goodcase.ai/cases/seedance-create-a-10-second-cinematic-action-sequence-set-inside-a-gritty-modern-subway-82a998c1a0e0)<br>`seedance-create-a-10-second-cinematic-action-sequence-set-inside-a-gritty-modern-subway-82a998c1a0e0` | `combat-choreography` | believable martial-arts choreography | 攻击、侧踢、拳击、格挡、闪避与倒地因果明确；主标签是接触与打斗编排。 |
| 12 | [巴基斯坦老火车车厢激战](https://goodcase.ai/cases/seedance-a-cinematic-action-fight-scene-inside-an-old-crowded-pakistani-passenger-train-547eff4092c7)<br>`seedance-a-cinematic-action-fight-scene-inside-an-old-crowded-pakistani-passenger-train-547eff4092c7` | `combat-choreography` | fast, realistic martial-arts moves | 狭窄车厢多对手拳脚打斗，含接触动作与机位；列车只提供场景。 |
| 13 | [雨夜车站的奇妙邂逅](https://goodcase.ai/cases/seedance-sometimes-the-smallest-moments-become-the-most-magical-adventures-3f69aef4c82b)<br>`seedance-sometimes-the-smallest-moments-become-the-most-magical-adventures-3f69aef4c82b` | `cinematic-narrative-short` | creating a quiet emotional connection between them | 等待、发现小生物、分享食物、列车到来与离别形成完整小叙事；不是巨物或世界观奇观。 |
| 14 | [迷你厨师的煎饼大冒险](https://goodcase.ai/cases/seedance-a-miniature-hand-drawn-2d-animated-girl-with-curly-black-hair-a-yellow-apron-e8eb28cbd332)<br>`seedance-a-miniature-hand-drawn-2d-animated-girl-with-curly-black-hair-a-yellow-apron-e8eb28cbd332` | `meme-comedy` | lifts the entire pancake stack away. She freezes in disbelief. | 微型厨师历险最终被巨叉端走成果，节拍服务笑点；2D 加实拍作为保留的风格描述，不改写为纯动漫或真实食谱。 |
| 15 | [梅树下掉落的心上人](https://goodcase.ai/cases/seedance-title-what-falls-from-the-plum-tree-d602a208ed88)<br>`seedance-title-what-falls-from-the-plum-tree-d602a208ed88` | `meme-comedy` | GENRE: Romantic Japanese Fantasy Comedy | 化妆盒、金币都不要，摇出心上人才高兴；铺垫、兑现与反应形成可见反转。 |
| 16 | [首尔老街的悠闲散步](https://goodcase.ai/cases/seedance-create-a-ultra-realistic-early-2000s-consumer-dv-camcorder-home-video-of-a-youn-19a579fa3d7a)<br>`seedance-create-a-ultra-realistic-early-2000s-consumer-dv-camcorder-home-video-of-a-youn-19a579fa3d7a` | `retro-found-footage` | raw early-2000s consumer DV-camera footage | 普通街区小事加旧 DV 缺陷和现场音；不是目的地旅行片。 |
| 17 | [雨中奔跑的日系街区女孩](https://goodcase.ai/cases/seedance-create-an-ultra-realistic-cinematic-japanese-lifestyle-vlog-featuring-a-young-j-117213b692cf)<br>`seedance-create-an-ultra-realistic-cinematic-japanese-lifestyle-vlog-featuring-a-young-j-117213b692cf` | `travel-city-walk` | smooth rear tracking shot while running | 同一女孩穿过街区、公园并配风景与人物近景，强调电影感、平滑跟拍；不套刻意相机缺陷的手持 vlog。 |
| 18 | [女孩追赶冰淇淋车的夏日午后](https://goodcase.ai/cases/seedance-create-a-30-second-ultra-photorealistic-japanese-slice-of-life-home-video-follo-5ed15c591ef3)<br>`seedance-create-a-30-second-ultra-photorealistic-japanese-slice-of-life-home-video-follo-5ed15c591ef3` | `handheld-ugc-vlog` | authentic handheld consumer-camera footage | 追赶冰淇淋车是自然生活事件，明确消费级手持缺陷与非商业质感，未声明旧年代。 |
| 19 | [金色晨光中的都市晨间日常](https://goodcase.ai/cases/seedance-create-a-30-second-cinematic-photorealistic-morning-routine-video-featuring-the-3f656bde95d1)<br>`seedance-create-a-30-second-cinematic-photorealistic-morning-routine-video-featuring-the-3f656bde95d1` | `timeline-shot-script` | SCENE 7 — FINAL WALKING VIEW (27–30 sec) | 七段晨间动作被准确秒数约束；身份连续性只是约束，没有上传参考图或身份重建任务。 |
| 20 | [灰猫误触按钮引发厨房大乱](https://goodcase.ai/cases/seedance-created-a-video-a-cinematic-cartoon-style-kitchen-story-featuring-a-curly-red-a64a9ed0a27d)<br>`seedance-created-a-video-a-cinematic-cartoon-style-kitchen-story-featuring-a-curly-red-a64a9ed0a27d` | `meme-comedy` | a funny kitchen mishap begins | 猫误触按钮、厨房大乱与结尾无辜表情服务笑点；原文只说 cartoon，不推断成特定 3D 画风。 |
| 21 | [萌娃与壁虎的客厅追逐战](https://goodcase.ai/cases/seedance-made-with-seedance-2-5-77a6ca7d9f28)<br>`seedance-made-with-seedance-2-5-77a6ca7d9f28` | `3d-cartoon` | Pixar-inspired animation aesthetic | 家庭和壁虎角色的高质量 3D 表情、材质与动作是核心；喜剧节拍保留为内容，不覆盖明确动画制作类型。 |
| 22 | [日本乡村午后追鸡记](https://goodcase.ai/cases/seedance-create-a-30-second-ultra-photorealistic-japanese-rural-slice-of-life-home-video-9431ffb8cf81)<br>`seedance-create-a-30-second-ultra-photorealistic-japanese-rural-slice-of-life-home-video-9431ffb8cf81` | `handheld-ugc-vlog` | authentic handheld consumer-camera footage | 偶发追鸡与自然交流以生活录像呈现；没有独立动物视角，也不是竞技或商业影片。 |
| 23 | [雨夜货柜巷中的冰火激战](https://goodcase.ai/cases/seedance-epic-action-movie-sequence-dark-rainy-night-in-a-narrow-alleyway-lined-with-st-89b217acd8eb)<br>`seedance-epic-action-movie-sequence-dark-rainy-night-in-a-narrow-alleyway-lined-with-st-89b217acd8eb` | `combat-choreography` | fast-paced choreography | 女战士与多波对手的高冲击连招，火焰和冰拳是战斗效果；非时间冻结。 |
| 24 | [年轻女游客的伦敦城市之旅](https://goodcase.ai/cases/seedance-character-consistency-same-young-adult-female-traveler-throughout-same-face-ba84d28e2cf0)<br>`seedance-character-consistency-same-young-adult-female-traveler-throughout-same-face-ba84d28e2cf0` | `travel-city-walk` | cinematic photorealistic travel-vlog style | 机场、伦敦地标、街道、河畔按旅行行程连接；角色一致性服务跨地点旅行。 |
| 25 | [韩国少女的雪山村庄之旅](https://goodcase.ai/cases/seedance-create-a-30-second-video-featuring-a-beautiful-korean-schoolgirl-in-a-neat-nav-bbf2963e71f3)<br>`seedance-create-a-30-second-video-featuring-a-beautiful-korean-schoolgirl-in-a-neat-nav-bbf2963e71f3` | `travel-city-walk` | wide scenic shots revealing the beautiful winter landscape | 同一旅行者游走雪村、马场和木屋，以风景和地点体验为主体；少量涂鸦只是叠层。 |
| 26 | [末日公路女骑士逃离外星战舰](https://goodcase.ai/cases/seedance-cinematic-short-film-46-sec-16-9-photorealistic-hollywood-sci-fi-action-dys-dae506414152)<br>`seedance-cinematic-short-film-46-sec-16-9-photorealistic-hollywood-sci-fi-action-dys-dae506414152` | `car-vehicle` | consistent character and bike design | 大多数镜头围绕摩托、轮胎、引擎、骑行、飞跃和落地特技；外星舰提供追逐压力与背景。 |
| 27 | [韩国女歌手跨场景舞台说唱](https://goodcase.ai/cases/seedance-create-a-ultra-realistic-cinematic-rap-music-video-featuring-a-confident-young-8cad375cc1ea)<br>`seedance-create-a-ultra-realistic-cinematic-rap-music-video-featuring-a-confident-young-8cad375cc1ea` | `music-beat-sync-mv` | camera movements synchronized with the rap beat | 说唱演出、跨场景转场与镜头明确按节拍同步；不是仅有背景音乐。 |
| 28 | [机械翼女英雄决战巨兽](https://goodcase.ai/cases/seedance-create-a-31-second-ultra-realistic-cinematic-action-sequence-set-in-a-destroyed-230c67b382c9)<br>`seedance-create-a-31-second-ultra-realistic-cinematic-action-sequence-set-in-a-destroyed-230c67b382c9` | `epic-fantasy-scifi` | fighting a huge monstrous creature | 机械翼、巨兽、毁城尺度及空中飞行共同构成超英奇观；不是普通近身搏斗。 |
| 29 | [餐桌甜点世界里的迷你女子](https://goodcase.ai/cases/seedance-16-9-widescreen-30-seconds-dola-continuous-engine-f6be640f9715)<br>`seedance-16-9-widescreen-30-seconds-dola-continuous-engine-f6be640f9715` | `cinematic-narrative-short`（原 null） | A massive shadow sweeps across the tabletop | 微型人物登桌探索、发现甜点世界、阴影逼近与悬念停格形成叙事；1968 电视特效质感不等于旧 DV。复核后撤销原 null。 |
| 30 | [首尔情侣逛街约会与电梯甜吻](https://goodcase.ai/cases/seedance-create-a-30-second-1080p-ultra-realistic-early-2000s-dv-camcorder-home-video-o-50568dbba578)<br>`seedance-create-a-30-second-1080p-ultra-realistic-early-2000s-dv-camcorder-home-video-o-50568dbba578` | `retro-found-footage` | authentic early-2000s home-video feel | 情侣购物与短吻以旧 DV 缺陷、现场音和非商业拍法记录；不是广告或口播。 |
| 31 | [金色窗前父女温暖相拥](https://goodcase.ai/cases/seedance-made-with-seedance-2-5-9fb55ff34947)<br>`seedance-made-with-seedance-2-5-9fb55ff34947` | `3d-cartoon` | high-quality cinematic 3D animation | 父女发现、拥抱、轻转身配 Pixar 表情与渲染，属于角色驱动 3D 动画。 |
| 32 | [韩式脆皮辣酱炸鸡制作](https://goodcase.ai/cases/seedance-create-a-cinematic-ultra-realistic-30-second-live-action-food-sequence-showing-f550d5208324)<br>`seedance-create-a-cinematic-ultra-realistic-30-second-live-action-food-sequence-showing-f550d5208324` | `food-asmr` | macro shots to emphasize the crunchy exterior | 从切鸡到炸制、挂酱、成品推进，食物质地与油泡特写是核心；比通用流程蒙太奇更具体。 |
| 33 | [少女漫步黄昏铁道与花田](https://goodcase.ai/cases/seedance-created-a-20-seconds-cinematic-japanese-style-scene-of-a-young-schoolgirl-walki-fe8957e6d21c)<br>`seedance-created-a-20-seconds-cinematic-japanese-style-scene-of-a-young-schoolgirl-walki-fe8957e6d21c` | `fashion-lookbook` | same character, hairstyle, school uniform | 多个环境里的同一少女、发饰、手部与脸部近景构成人像写真；没有目的地游览或消费级 vlog 拍法。 |
| 34 | [未来街头时装七套造型变换](https://goodcase.ai/cases/seedance-create-a-15-second-luxury-streetwear-fashion-film-combining-rapid-outfit-change-e7f858674b8c)<br>`seedance-create-a-15-second-luxury-streetwear-fashion-film-combining-rapid-outfit-change-e7f858674b8c` | `fashion-lookbook` | luxury streetwear fashion film | 七套服装、姿势、美容近景与 campaign hero frame 服务时装展示；卡点作为剪辑手段，未以歌曲表演为核心。 |
| 35 | [废墟工厂中的机甲战士与无人机](https://goodcase.ai/cases/seedance-ultra-realistic-cinematic-sci-fi-war-film-15-seconds-16-9-60fps-handheld-ca-8b3a4a994544)<br>`seedance-ultra-realistic-cinematic-sci-fi-war-film-15-seconds-16-9-60fps-handheld-ca-8b3a4a994544` | `combat-choreography` | he rises and fires a plasma rifle at a drone | 躲避、掩体、开火、击落无人机与防御形成战斗因果；科幻装备不是单独的世界观展示。 |
| 36 | [迷你厨娘的巨型爆米花大作战](https://goodcase.ai/cases/seedance-a-miniature-hand-drawn-2d-animated-girl-with-curly-black-hair-a-pink-apron-ye-8c5512b15aed)<br>`seedance-a-miniature-hand-drawn-2d-animated-girl-with-curly-black-hair-a-pink-apron-ye-8c5512b15aed` | `meme-comedy` | a huge hand suddenly grabs the entire bowl and walks away | 做爆米花的微型历险以成果被端走收笑点；不是可执行真实食谱，混合媒介风格继续保留。 |
| 37 | [卧室梳妆与红裙变装日记](https://goodcase.ai/cases/seedance-a-young-woman-matching-the-exact-facial-features-hairstyle-and-identity-of-th-b6d15d2c2b4f)<br>`seedance-a-young-woman-matching-the-exact-facial-features-hairstyle-and-identity-of-th-b6d15d2c2b4f` | `fashion-lookbook` | Final reveal scene | 梳妆、服饰变换与红裙造型揭晓是人物美妆写真流程；没有产品测评或消费级相机缺陷。 |
| 38 | [霓虹雨夜能量核心劫掠](https://goodcase.ai/cases/seedance-create-ultra-cinematic-cyberpunk-tactical-infiltration-sequence-shot-like-a-hi-785161245e4c)<br>`seedance-create-ultra-cinematic-cyberpunk-tactical-infiltration-sequence-shot-like-a-hi-785161245e4c` | `cinematic-narrative-short` | carrying the glowing energy core | 勘察、下降、破解、取核心、警报与逃离构成劫掠故事；正文没有实际攻防连招，不被 tactical 一词误归打斗。 |
| 39 | [偶像女孩的周末健身复盘](https://goodcase.ai/cases/seedance-camera-look-dv-16mm-tape-camcorder-handheld-pov-by-chase-sometimes-propped-o-0c13a3b39062)<br>`seedance-camera-look-dv-16mm-tape-camcorder-handheld-pov-by-chase-sometimes-propped-o-0c13a3b39062` | `handheld-ugc-vlog` | Reflective end-of-week gym vlog | 自拍、支架与对镜复盘构成健身日记；DV 质感是拍摄参数，未设定早期年代家庭回忆。 |
| 40 | [迷你涂鸦女孩的桌面滑板之旅](https://goodcase.ai/cases/seedance-a-miniature-hand-drawn-2d-animated-girl-with-messy-black-hair-an-orange-shirt-f86eb9a18721)<br>`seedance-a-miniature-hand-drawn-2d-animated-girl-with-messy-black-hair-an-orange-shirt-f86eb9a18721` | 保留 null | Mixed-reality hybrid animation | 2D 涂鸦角色在实拍桌面滑板，不是纯动漫画风、真实极限运动或步进定格；现有模板缺少混合媒介合成契约，保留原跳过。 |
| 41 | [朝鲜王朝城门前的离别之吻](https://goodcase.ai/cases/seedance-some-goodbyes-are-harder-than-war-itself-084c2515a324)<br>`seedance-some-goodbyes-are-harder-than-war-itself-084c2515a324` | `dialogue-performance-beats` | Korean Dialogue (verbatim) | 韩语原句、说话人、因果微表情与吻前吻后的表演状态是执行重点；参考图只是人物与地点约束。 |
| 42 | [少女骑行田野静享乡间夏日](https://goodcase.ai/cases/seedance-cinematic-30-second-video-photorealistic-4k-shallow-depth-of-field-6ce03eafaeba)<br>`seedance-cinematic-30-second-video-photorealistic-4k-shallow-depth-of-field-6ce03eafaeba` | `travel-city-walk` | slow-living Japanese countryside summer | 骑行、溪流、田野与日落按乡间体验串场并配无人机大景；不是体育特技或旧 DV。 |
| 43 | [蓝围巾小鸭的桃园甜蜜时光](https://goodcase.ai/cases/seedance-made-with-seedance-2-5-85d87b5e88f3)<br>`seedance-made-with-seedance-2-5-85d87b5e88f3` | `3d-cartoon` | heartwarming 3D animated short film | 蓝围巾小鸭的角色一致性、毛羽材质、表情与逐场动作主导，吃桃只是故事一拍。 |
| 44 | [首尔旧街的夏日约会回忆](https://goodcase.ai/cases/seedance-create-a-30-second-1080p-ultra-realistic-early-2000s-consumer-dv-home-video-i-9723105bbada)<br>`seedance-create-a-30-second-1080p-ultra-realistic-early-2000s-consumer-dv-home-video-i-9723105bbada` | `retro-found-footage` | Raw early-2000s DV footage | 旧街约会强调原始 DV 缺陷、非稳定运镜与自然现场音；参考图用于锁脸，不是主要任务。 |
| 45 | [首尔清晨迟到的喷嚏](https://goodcase.ai/cases/seedance-seedance-2-5-b4b891450906)<br>`seedance-seedance-2-5-b4b891450906` | `retro-found-footage` | early-2000s Sony MiniDV home video | 私密晨间小事明确旧 MiniDV 年代质感和相机缺陷；喷嚏小且可信，不按夸张搞笑重新设计。 |
| 46 | [冰封巨兽与神速终结斩](https://goodcase.ai/cases/seedance-fusia-exact-same-identity-throughout-d0562ff4eacd)<br>`seedance-fusia-exact-same-identity-throughout-d0562ff4eacd` | `epic-fantasy-scifi` | Boncoz remains colossal (3–4× human height) | 环境结冰、巨物尺度与整身冰裂终结构成主要奇观；冰冻材质不是时间冻结，且非连续近身连招。 |
| 47 | [古林旅者邂逅金角白独角兽](https://goodcase.ai/cases/seedance-a-young-east-asian-female-traveler-wearing-an-earth-toned-brown-wrap-tunic-rob-a051065475f3)<br>`seedance-a-young-east-asian-female-traveler-wearing-an-earth-toned-brown-wrap-tunic-rob-a051065475f3` | `epic-fantasy-scifi` | clearing the thick fog and opening into a breathtaking view | 独角兽金光改变整片森林并揭示山谷，核心是幻想世界与光学奇观，不是普通动物行为。 |
| 48 | [大学物理课堂的斜轨小球实验](https://goodcase.ai/cases/seedance-create-a-cinematic-realistic-educational-video-set-inside-a-modern-university-961b27c23385)<br>`seedance-create-a-cinematic-realistic-educational-video-set-inside-a-modern-university-961b27c23385` | 保留 null | motion, gravity, acceleration, and energy | 物理教学与实验可解释性是主目标；不能仅因有起止镜头就归到建造／变形流程，保留原跳过。 |
| 49 | [Seedance 进阶工作流演示：Prompt 之外的制作全流程](https://goodcase.ai/cases/ethancole-ai-seedance-ai-c8e1a1b52569)<br>`ethancole-ai-seedance-ai-c8e1a1b52569` | 保留 null | AI Edit handles a specific flaw | 介绍生成、续写、编辑、时间线的工具流程，缺少具体场景提示词；保留原跳过。 |
| 50 | [赤焰枪手突袭战场](https://goodcase.ai/cases/seedance-arman-exact-same-identity-throughout-334c97a3dc2f)<br>`seedance-arman-exact-same-identity-throughout-334c97a3dc2f` | `combat-choreography` | relentless close-quarters combat | 双枪数量与手部锁定、格挡闪避、肘击、落地与突破连招是核心；超速效果不改主标签。 |
| 51 | [晨光卧室里的母子拥抱](https://goodcase.ai/cases/seedance-made-with-seedance-2-5-46446d7eafc4)<br>`seedance-made-with-seedance-2-5-46446d7eafc4` | `3d-cartoon` | Pixar-inspired high-end 3D animation | 母子微表情与拥抱配明确 Pixar 3D 材质和渲染参数；无真实动物或真人 vlog。 |
| 52 | [雨夜车窗上的指尖](https://goodcase.ai/cases/aiwithminal-seedance-ai-5612b068051f)<br>`aiwithminal-seedance-ai-5612b068051f` | 保留 null | ultra-realistic photography, 85mm lens | 现有正文为摄影静态构图，没有视频动作或时间展开；不从视频媒体字段推测缺失的场景脚本，保留原跳过。 |
| 53 | [股市崩盘新闻直播](https://goodcase.ai/cases/case-f5315418af5f)<br>`case-f5315418af5f` | 保留 null | BROADCAST TYPE: Live business news report | 商业新闻直播需要记者、新闻段落与行情图表契约；不是游戏直播，亦无可执行逐句对白，保留原跳过。 |

## 5. 验证记录

写入前已检查：53 项无重复且与未分配快照一致、每个非空 ID 存在、每段引文确实出现在当前 promptFull、未更改范围外标签。所有 670 条现存案例均有 taxonomy 键；写入后 taxonomy:todo 为 0，未分配项为 6 个有依据的 null。

- `node router/build.mjs --write --out .tmp/router-package`：120 项 JS、13 项 Python、分层评测、链接及包外独立冒烟通过；词表、索引、模板文档与 Skill 证据引用均重建。
- `node router/build.mjs --check`：`changed: []`，未分配数为 6，无薄弱语料模板。原始案例／模板导出文件与固定基线未改动。
- 原固定 286 条摘要：top-5 macro 从上一轮 57.50% 变为 57.56%；当前 291 条摘要回归集为 57.04%，不与旧集合直接比较。共用评分 oracle 为 96.25%。
- 108 条固定口语：失败 0，57 条充分拍法输入的可接受 top-5 macro 为 100%；没有放宽既有阈值。
- 本机 27 模板包已更新；安装状态 `current`，仓库与安装版本均为 `f71b60d4dc36019055da33454ff90dd286896951769052fb4d06bdfdee89ebb8`，完整上一版备份保留。
- 生成的完整案例引文保留原有行末空白；常规 `git diff --check` 对两行引文提示空白，关闭行末空白检查后的差异检查通过。未为消除提示改写原提示词。

归类验收时尚未创建 Git 提交；后续按用户授权与路由实现一起提交和推送至 `feat/video-prompt-router`，不合并到 `main`，具体提交见 Git 日志。本轮未刷新上游；已完成的是当前本地快照的全部 53 项归类复核，不是对后续新增案例的自动归类承诺。
