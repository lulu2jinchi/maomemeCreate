# AGENT.md

## 项目定位

这是一个基于 Remotion 的猫 meme 短视频项目。当前仓库的核心工作流不是“通用前端开发”，而是：

1. 从 `describe.json` 读取素材目录描述。
2. 按故事或脚本生成/修改 `track.json`。
3. 由 Remotion 读取 `track.json` 并渲染视频。

后续代理在这个仓库里工作时，默认应该围绕这个链路思考，而不是引入不必要的工程化复杂度。

## 技术栈

- Node.js
- React 19
- Remotion 4
- CommonJS package (`package.json` 中 `type=commonjs`)

## 关键文件

- `describe.json`
  - 素材目录。
  - 每项至少包含 `title`、`description`、`path`、`aspect_ratio`。
  - `path` 形如 `./xxx.mp4`。
- `remotion-data-template.json`
  - 生成 `track.json` 时的结构参考模板。
- `track.json`
  - Remotion 实际消费的数据源。
  - 任何自动生成逻辑都应尽量保持与模板兼容。
- `src/index.jsx`
  - 注册 Remotion Composition。
  - `render:track` 依赖这里暴露的 composition id。
- `src/TrackComposition.jsx`
  - 时间轴渲染逻辑。
  - 负责解析 `assets`、`tracks`、文本样式、音视频片段和动画。
- `public/lib`
  - 实际素材目录。
  - `track.json` 中引用素材时，路径应写成 `lib/...`，不要写 `public/lib/...`。
- `STORY_TO_REMOTION_REQUIREMENTS.md`
  - 当前项目最重要的业务约束文档。
  - 涉及故事拆分、素材匹配、路径规则、时间轴规则、降级策略和验收标准。

## 工作原则

### 1. 先遵守现有数据协议

如果任务涉及生成或修改 `track.json`，默认遵守以下约束：

- `schema` 保持为 `remotion-timeline/v1`
- `composition.durationInFrames` 必须等于时间轴最大结束帧
- 所有 `tracks[].assetId` 必须能在 `assets` 中解析到
- `tracks[].from >= 0`
- `tracks[].duration > 0`
- `render.output` 输出到 `out/*.mp4`
- `meta.assetCatalog` 固定为 `describe.json`

### 2. 素材路径一律使用 `lib/...`

从 `describe.json` 匹配到 `./foo.mp4` 后，写入 `track.json` 时应转换成：

- `lib/foo.mp4`

不要保留开头的 `./`，也不要写成绝对路径。

### 3. 素材存在性优先于“语义上看起来合理”

如果任务涉及素材匹配或轨道生成：

- 先检查文件是否真的存在于 `public/lib`
- 忽略不存在的素材
- 忽略 `.qkdownloading` 未完成文件
- 在素材不够时允许复用，但应在 `meta.notes` 说明原因

### 3.1 新增素材时同步维护 `describe.json`

如果往 `public/lib` 新增了视频素材，尤其是新增 `*.mp4` 或 `*.MP4` 文件，必须在同一次任务里同步更新 `describe.json`，不要把“补描述”留到后面。

新增条目时至少补齐：

- `title`
- `description`
- `path`
- `aspect_ratio`

其中：

- `path` 必须写成相对素材名，例如 `./新素材.mp4`
- `title` 默认优先使用素材文件名去掉扩展名后的文本
- `description` 至少要写出该素材的动作、情绪或适用场景，不能留空
- 如果暂时拿不准比例，`aspect_ratio` 可以先写 `null`

如果代理新增了 `public/lib` 下的素材文件，但没有同步更新 `describe.json`，应视为任务未完成。

### 4. 默认保持竖屏短视频参数

除非用户明确要求修改，否则默认使用：

- `fps: 30`
- `width: 1080`
- `height: 1920`

### 5. 不要随意改动素材目录和大文件

这个仓库含有大量视频素材。代理默认不做以下操作，除非用户明确要求：

- 批量重命名 `public/lib` 素材
- 删除素材文件
- 重编码视频
- 重建或重写整个 `describe.json`

## 推荐工作流

### 修改故事到时间轴逻辑时

1. 先读 `STORY_TO_REMOTION_REQUIREMENTS.md`
2. 再看 `remotion-data-template.json`
3. 最后对照当前 `track.json` 和 `src/TrackComposition.jsx`

### 修改渲染行为时

优先检查：

- `src/TrackComposition.jsx`
- `src/index.jsx`
- `track.json`

注意 `package.json` 中的渲染命令当前是：

```bash
npm run render:track
```

它会渲染 composition `CatMemeMain`。如果你修改了 `track.json` 的 `composition.id`，要同步确认渲染命令是否仍然有效。

## 命令约定

常用命令：

```bash
npm run studio
npm run render:track
```

建议验证：

```bash
node -e "JSON.parse(require('fs').readFileSync('track.json','utf8')); console.log('track.json ok')"
node -e "JSON.parse(require('fs').readFileSync('describe.json','utf8')); console.log('describe.json ok')"
```

如果只改了 JSON 结构，先做 JSON 可解析校验；如果改了时间轴或渲染行为，再考虑执行 Remotion 渲染。

## 编辑偏好

- 优先做最小改动，不为“看起来更整洁”重排整个大 JSON。
- 保留中文文件名和现有命名风格。
- 如果用户目标是“能渲染出来”，优先解决数据兼容和资源引用，不要先做抽象封装。
- 如果发现 `describe.json` 中素材条目与 `public/lib` 不一致，优先在消费端做容错，而不是贸然清洗素材库。
- 如果一个任务可能影响渲染结果，最终应至少说明是否做过 JSON 校验，以及是否实际跑过渲染。

## 代理输出要求

当代理完成一次与本仓库相关的任务时，最终回复建议包含：

- 改了什么
- 是否改动了 `track.json` / `src/TrackComposition.jsx` / `describe.json`
- 是否做了 JSON 校验
- 是否运行了 `npm run render:track` 或 `npm run studio`
- 若未运行渲染，明确说明原因

## 不该做的事

- 不要把素材路径写成 `public/lib/...`
- 不要输出带注释或尾逗号的 JSON
- 不要让 `tracks` 出现空 `assetId` 引用
- 不要让 `composition.durationInFrames` 小于轨道实际结束帧
- 不要新增了 `public/lib` 里的 mp4 素材却不更新 `describe.json`
- 不要在未确认的情况下覆盖用户已经改过的大型 JSON 文件

## 一句话判断标准

在这个仓库里，好的改动标准很简单：

“生成出来的 `track.json` 合法、引用得到素材、Remotion 能吃进去，并且尽量少折腾现有素材库。”
