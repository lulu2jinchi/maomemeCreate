# 故事情节自动生成 Remotion 数据需求

## 1. 目标
输入一段中文故事情节文本，系统自动从 `lib/describe.json` 中匹配最合适的素材，并生成符合 `remotion-data-template.json` 结构的 JSON，最终写入项目根目录 `track.json`（可直接用于后续渲染）。

## 2. 输入与输出

### 输入
- `story_text`：用户输入的一段故事情节（自然语言）。
- `asset_catalog`：固定为 `lib/describe.json`。
- `template`：固定参考 `remotion-data-template.json`。

### 输出
- 将结果写入 `track.json` 文件，内容为一个 JSON 对象，字段结构与 `remotion-data-template.json` 一致，至少包含：
  - `schema`
  - `name`
  - `composition`
  - `meta`
  - `assets.video`（必须是匹配后的素材）
  - `tracks`（至少包含视频轨）
  - `render`

## 3. 数据源约束

### describe.json 结构
`lib/describe.json` 每项包含：
- `title`
- `description`
- `path`（形如 `./xxx.mp4`）
- `aspect_ratio`

### 路径规则
- 匹配到素材后，输出到 `assets.video` 时统一写为：`lib/<path去掉./后的文件名>`。
  - 例：`"./苹果猫跑步（有声）.mp4"` -> `"lib/苹果猫跑步（有声）.mp4"`

## 4. 核心流程要求

### 4.1 情节拆分
- 将 `story_text` 自动拆为 3-8 个镜头段（scene）。
- 每个 scene 产出：
  - 场景摘要（1句话）
  - 情绪标签（如：开心、惊讶、愤怒、委屈、尴尬、睡觉）
  - 动作标签（如：跑步、打电话、敲碗、大叫、发呆）
  - 建议字幕（可为空）

### 4.2 素材匹配
- 对每个 scene，在 `title + description` 上进行语义匹配并打分。
- 默认按分数选 Top1，支持回退 Top2/Top3（避免重复或无效文件）。
- 过滤规则：
  - 忽略不存在的文件。
  - 忽略 `.qkdownloading` 未完成下载文件。
- 重复控制：
  - 默认同一条素材最多使用 2 次。
  - 当素材库不足时允许复用，但需记录原因。

### 4.3 时间轴生成
- 默认 `fps = 30`，竖屏 `1080x1920`。
- 每个 scene 默认时长 2-4 秒（60-120 帧），根据故事长度自适应。
- 生成视频轨：
  - `type = "video"`
  - `assetId` 指向 `assets.video` 中已注册 key（如 `clip_1`）
  - `from` 连续递增，不重叠
  - `duration` > 0
  - `trimStart`/`trimEnd` 默认 0
- 可选生成字幕轨（推荐）：
  - `type = "text"`
  - `content` 来自 scene 建议字幕
  - 与对应视频段对齐

### 4.4 总时长计算
- `composition.durationInFrames` 必须等于所有轨道覆盖的最大结束帧。
- 音频轨（若生成）`duration` 不得超过总时长。

## 5. 输出格式硬性校验
- 输出文件路径固定为项目根目录 `track.json`。
- 输出 JSON 必须可被标准 JSON 解析（无注释、无尾逗号）。
- 所有 `tracks[].assetId` 必须在 `assets` 中存在。
- `tracks[].from >= 0`，`tracks[].duration > 0`。
- `render.output` 必须输出到 `out/*.mp4`。
- `meta.assetCatalog` 固定写 `lib/describe.json`。

## 6. 异常与降级策略
- 若未匹配到足够素材：
  - 用“情绪最接近”的素材补位；
  - 在 `meta.notes` 里追加降级说明。
- 若 `story_text` 过短（少于 10 个字）：
  - 生成 1-2 段短视频结构，不报错。
- 若 `story_text` 过长：
  - 自动压缩为最多 8 个 scene。

## 7. 验收标准（Definition of Done）
- 输入任意故事文本后，能在项目根目录产出/覆盖 `track.json`。
- JSON 结构与 `remotion-data-template.json` 兼容。
- 至少 1 条视频轨素材来自 `lib/describe.json` 且文件真实存在。
- 时间轴无重叠错误、无空引用、总时长正确。
- 可直接作为 Remotion 渲染输入（不需要手改字段名）。

## 8. 示例（简化）

### 输入
`story_text`:  
“小猫早上跑去上班，老板打电话催它，它先震惊，最后摆烂睡觉。”

### 期望行为
- 拆分为 4 个 scene：跑步 -> 打电话 -> 震惊 -> 睡觉。
- 分别匹配到类似：
  - `苹果猫跑步（有声）`
  - `打电话猫...`
  - `吃东西震惊猫` 或其他“震惊”素材
  - `打瞌睡...` 素材
- 输出 `assets.video + tracks`，并保证 `composition.durationInFrames` 正确。
