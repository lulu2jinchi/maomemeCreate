# 故事情节自动生成 Remotion 数据需求

## 1. 目标
输入一段中文故事情节文本，系统自动从 `describe.json` 中选择人物素材，从 `img-describe.json` 中选择背景素材，生成符合 `remotion-data-template.json` 结构的 `track.json`，可直接用于 Remotion 渲染。

## 2. 输入与输出

### 输入
- `story_text`：用户输入的一段自然语言剧情。
- `asset_catalog`：固定为项目根目录 `describe.json`。
- `image_catalog`：固定为项目根目录 `img-describe.json`。
- `template`：固定参考 `remotion-data-template.json`。

### 输出
- 将结果写入项目根目录 `track.json`。
- 输出 JSON 至少包含：
  - `schema`
  - `name`
  - `composition`
  - `meta`
  - `assets.image`
  - `assets.video`
  - `tracks`
  - `render`

## 3. 数据源约束

### 3.1 describe.json 结构
`describe.json` 每项至少包含：
- `title`
- `description`
- `path`
- `aspect_ratio`
- `common_level`

### 3.2 img-describe.json 结构
`img-describe.json` 每项至少包含：
- `title`
- `description`
- `path`
- `aspect_ratio`
- `common_level`

### 3.3 路径规则
- `describe.json` 中的人物素材路径相对 `public/lib`。
  - 例：`"./webm/可爱猫_去绿幕裁剪.webm"` 输出为 `lib/webm/可爱猫_去绿幕裁剪.webm`
- `img-describe.json` 中的背景素材路径相对 `public/img`。
  - 例：`"./办公室/13366084965613911.jpeg"` 输出为 `img/办公室/13366084965613911.jpeg`
- 输出到 `assets.video` 时统一写 `lib/...`
- 输出到 `assets.image` 时统一写 `img/...`

### 3.4 素材优先级
- 人物素材优先使用透明 `.webm`
- 其次使用透明 `.mov`
- 最后才回退到普通 `.mp4`
- 背景素材优先选择静态图片，默认使用 `img-describe.json`

## 4. 核心流程要求

### 4.1 情节拆分
- 将 `story_text` 自动拆为 3-8 个 scene。
- 每个 scene 产出：
  - 场景摘要
  - 情绪标签
  - 动作标签
  - 背景标签
  - 出场人物数，范围 1-4
  - 建议字幕

### 4.2 人物素材匹配
- 对每个人物位，在 `describe.json` 的 `title + description` 上做语义匹配。
- 默认按分数选 Top1，允许回退 Top2/Top3。
- 过滤规则：
  - 忽略不存在的文件
  - 忽略 `.qkdownloading`
  - 忽略无法播放的损坏文件
- 同一素材默认最多使用 2 次，超出时在 `meta.notes` 记录原因。

### 4.3 背景素材匹配
- 对每个 scene，在 `img-describe.json` 的 `title + description` 上做语义匹配。
- 背景默认 1 个 scene 只选 1 张图。
- 若背景未命中，回退到情绪或地点最接近的场景图，并在 `meta.notes` 记录。

## 5. 轨道生成规则

### 5.1 基础规则
- 默认 `fps = 30`
- 默认画布 `1080x1920`
- 每个 scene 默认 2-4 秒
- `composition.durationInFrames` 等于所有轨道覆盖的最大结束帧

### 5.2 背景轨
- 每个 scene 至少生成 1 条背景轨：
  - `type = "image"`
  - `layout.kind = "background"`
  - `layout.aspectRatio` 取自 `img-describe.json[].aspect_ratio`
- 背景图默认铺满整屏：
  - `x = 0`
  - `y = 0`
  - `width = 1080`
  - `height = 1920`
  - `fit = "cover"`
- 如果背景图 `aspect_ratio` 缺失，仍按整屏背景处理。

### 5.3 人物轨
- 每个出场人物生成 1 条视频轨：
  - `type = "video"`
  - `layout.kind = "character"`
  - `layout.groupId` 为同一 scene 的统一分组 id
  - `layout.aspectRatio` 取自 `describe.json[].aspect_ratio`
- 每条人物轨都应写 `characterLabel`，用于在人物脚下标注角色身份。
  - 示例：`"characterLabel": "领导"`、`"characterLabel": "打工人"`、`"characterLabel": "正义小猫"`
- 人物优先使用透明素材。
- 人物默认不手写 `style.x/y/width/height`，而是交给自动布局。
- 若用户明确指定人物位置，允许写死 `style.x/y/width/height` 覆盖自动布局。

### 5.4 字幕轨
- 每个 scene 默认生成 1 条对白字幕轨，必要时可附加 1 条顶部标题轨。
- 可选生成字幕轨：
  - `type = "text"`
  - 不得遮挡主要人物面部
  - 优先放在人物上方的空白区，而不是压在人物身上

### 5.5 字体与标注风格
- 顶部标题必须使用：
  - 黄色填充字：`#ffd426`
  - 黑色描边
  - 大字号，推荐 `84-96`
  - 粗字重，推荐 `900`
  - 默认居中放在顶部标题安全区
- 人物脚下角色名必须使用：
  - 黄色填充字：`#ffd426`
  - 黑色描边
  - 粗字重，推荐 `900`
  - 跟随人物底部居中摆放
- 正文对白字幕必须使用：
  - 白色填充字：`#ffffff`
  - 黑色描边
  - 不使用黑色底条或整块背景底板
  - 粗字重，推荐 `900`
  - 推荐字号 `56-62`
  - 推荐描边宽度 `8-10`

### 5.6 口语化对白规则
- 文案风格必须像对话场景，优先使用短句、口语、情绪化表达。
- 每条对白尽量只让一个角色说一句，不要把旁白、说明、设定解释全部塞进同一句。
- 单句尽量控制在 `8-18` 个汉字内；超过时优先拆句，不要硬挤成大段字幕。
- 优先使用自然口语：
  - 用“这不就是...吗”
  - 用“我不签”
  - 用“你退后”
  - 用“这事我管”
- 避免书面化表达：
  - 少用长定语、解释性从句、过度完整的书面句式
  - 不要写成新闻播报或剧情简介
- 标题可概括梗点，但正文字幕应以角色对白为主。

## 6. 基于 aspect_ratio 的自动布局规则

### 6.1 画面安全区
- 顶部标题安全区：`y = 0-260`
- 对白字幕优先区：`y = 260-520`
- 人物活动主区域：`y = 520-1560`
- 底部角色名安全区：`y = 1560-1920`

### 6.2 人物比例分类
将 `describe.json[].aspect_ratio` 解析为 `width / height`，并按以下规则分类：
- `ratio <= 0.75`：高挑型人物
- `0.75 < ratio < 1.2`：标准型人物
- `ratio >= 1.2`：横向型人物
- 若 `aspect_ratio = null`，按标准型处理

### 6.3 1-4 人默认站位
同一 `layout.groupId` 内的人物数量记为 `slotCount`。

- `1 人`
  - 中心点：`50%`
  - 默认站中间
- `2 人`
  - 中心点：`30%`、`70%`
  - 左右对称
- `3 人`
  - 中心点：`20%`、`50%`、`80%`
  - 中间人物略居中，左右人物留出呼吸感
- `4 人`
  - 中心点：`14%`、`38%`、`62%`、`86%`
  - 采用均匀横排，避免字幕区重叠

### 6.4 不同人物比例的尺寸规则
- 高挑型人物：
  - 宽度缩小约 12%
  - 整体上移一点，避免脚部压住字幕区
- 标准型人物：
  - 使用默认宽高
- 横向型人物：
  - 宽度放大约 16%
  - 位置略下沉，保证视觉重心稳定

### 6.5 不同人数的人物最大高度
在 `1080x1920` 画布中，人物高度上限按人数控制：
- `1 人`：不超过画布高的 `56%`
- `2 人`：不超过画布高的 `46%`
- `3 人`：不超过画布高的 `38%`
- `4 人`：不超过画布高的 `31%`

### 6.6 背景比例选择规则
将 `img-describe.json[].aspect_ratio` 解析为 `width / height`：
- 优先选择 `ratio >= 1.2` 的横图背景，便于在竖屏中裁切
- 若命中的是接近方图的背景，也允许使用，但仍按 `cover` 铺满
- 若命中的是竖图背景，同样允许使用，但不得留黑边

### 6.7 字幕摆位规则
- 对白字幕默认放在说话角色上方的空白区域。
- 左侧角色说话：
  - 文本优先放左上
  - 推荐 `x = 40-80`
  - 推荐 `maxWidth = 320-420`
- 右侧角色说话：
  - 文本优先放右上
  - 推荐 `x = 600-680`
  - 推荐 `maxWidth = 280-360`
- 多人物同屏时：
  - 不得把字幕压在人物脸上
  - 不得与人物脚下角色名重叠
  - 不得跨越整个画面宽度做大段字幕
- 若当前 scene 顶部已放标题，对白字幕需下移到不与标题重叠的位置。

## 7. 输出格式要求
- 输出 JSON 必须可被标准 JSON 解析
- 所有 `tracks[].assetId` 都必须在 `assets` 中存在
- 所有 `tracks[].from >= 0`
- 所有 `tracks[].duration > 0`
- `render.output` 必须写到 `out/*.mp4`
- `meta.assetCatalog` 固定写 `describe.json`
- `meta.imageCatalog` 固定写 `img-describe.json`

## 8. 异常与降级策略
- 若人物素材不足：
  - 使用最接近动作或情绪的素材补位
  - 允许复用，但需写入 `meta.notes`
- 若背景素材不足：
  - 使用最接近场景标签的背景图补位
- 若 `aspect_ratio` 缺失：
  - 人物按标准型处理
  - 背景按整屏 `cover` 处理
- 若故事过短：
  - 生成 1-2 个 scene
- 若故事过长：
  - 压缩为最多 8 个 scene

## 9. 验收标准
- 输入任意故事文本后，能产出完整 `track.json`
- 输出结构兼容 `remotion-data-template.json`
- 至少 1 条背景轨来自 `img-describe.json`
- 至少 1 条人物轨来自 `describe.json`
- 多人物 scene 支持 1-4 人自动布局
- 人物不得明显越出画面边界
- 标题区和字幕区不被人物主体严重遮挡
- 标题、人物脚下角色名、对白字幕三种文案样式必须区分明确
- 对白文案必须呈现口语化对话感，而不是剧情说明文
- 可直接用于 Remotion 渲染，无需手改字段名

## 10. 输出示例要求
单个 scene 推荐至少包含：
- 1 条背景图轨
- 1-4 条人物视频轨
- 0-1 条字幕轨

人物轨推荐写法：

```json
{
  "id": "char_1",
  "type": "video",
  "assetId": "clip_1",
  "from": 0,
  "duration": 90,
  "transparent": true,
  "layout": {
    "kind": "character",
    "groupId": "scene_1_cast",
    "aspectRatio": "608x786"
  },
  "characterLabel": "领导"
}
```

背景轨推荐写法：

```json
{
  "id": "bg_1",
  "type": "image",
  "assetId": "bg_scene_1",
  "from": 0,
  "duration": 90,
  "layout": {
    "kind": "background",
    "aspectRatio": "2560x1434"
  }
}
```

顶部标题轨推荐写法：

```json
{
  "id": "title_text",
  "type": "text",
  "from": 6,
  "duration": 72,
  "content": "《十三薪骗局揭秘》",
  "style": {
    "x": 72,
    "y": 88,
    "maxWidth": 936,
    "fontFamily": "PingFang SC",
    "fontSize": 90,
    "fontWeight": 900,
    "lineHeight": 1.08,
    "color": "#ffd426",
    "textAlign": "center",
    "strokeColor": "#000000",
    "strokeWidth": 9
  }
}
```

对白字幕轨推荐写法：

```json
{
  "id": "subtitle_1",
  "type": "text",
  "from": 8,
  "duration": 74,
  "content": "今年起，改十三薪。",
  "style": {
    "x": 56,
    "y": 302,
    "maxWidth": 360,
    "fontFamily": "PingFang SC",
    "fontSize": 60,
    "fontWeight": 900,
    "lineHeight": 1.08,
    "color": "#ffffff",
    "textAlign": "left",
    "strokeColor": "#000000",
    "strokeWidth": 8
  }
}
```
