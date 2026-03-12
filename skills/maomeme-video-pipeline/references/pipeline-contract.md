# Pipeline Contract

Read this file before scaffolding the repo, editing core JSON files, or wiring media paths.

## Repo shape

Keep this structure:

```text
.
├── public/
│   ├── lib/                  # character and source video assets
│   ├── img/                  # background image assets
│   ├── catalog-editor/       # metadata editor UI
│   └── remotion-review/      # review UI
├── scripts/
├── src/
├── describe.json
├── img-describe.json
├── remotion-data-template.json
└── track.json
```

## Required files

- `describe.json`: video asset catalog
- `img-describe.json`: image asset catalog
- `track.json`: active Remotion timeline
- `remotion-data-template.json`: structure reference for timeline generation

## Catalog fields

Both catalogs should keep these fields on every entry:

- `title`
- `description`
- `path`
- `aspect_ratio`
- `common_level`

`common_level` runs from `1` to `5`, where `1` is most common.

## Path rules

- Video assets written into `track.json` must use `lib/...`
- Image assets written into `track.json` must use `img/...`
- Do not write `public/lib/...` or `public/img/...` into `track.json`
- If a catalog entry uses `./...`, normalize it before writing to the track

Examples:

- `./webm/cat.webm` -> `lib/webm/cat.webm`
- `./办公室/001.jpeg` -> `img/办公室/001.jpeg`

## Transparent character rules

- Prefer transparent `webm`
- Fall back to transparent `mov`
- Fall back to ordinary `mp4` only when needed
- Keep transparent character videos on `fit: "contain"` by default
- Keep `composition.backgroundColor` explicit

If the chosen `webm` originally points at the known R2 bucket, check `public/lib/webm/<filename>` first. Download only when the local file is missing, and still write `lib/webm/<filename>` into `track.json`.

If `public/lib/webm/format-spec.json` exists, treat it as the transparent video encoding contract.

## Track rules

- Keep `schema` as `remotion-timeline/v1`
- Keep `composition.durationInFrames` equal to the maximum end frame
- Keep every `tracks[].assetId` resolvable from `assets`
- Keep `tracks[].from >= 0`
- Keep `tracks[].duration > 0`
- Do not place two copies of the same concrete character in the same `layout.groupId` during overlapping frames
- Keep `render.output` in `out/*.mp4`
- Keep `meta.assetCatalog` as `describe.json`

## Default composition

Unless the user explicitly changes it:

- `fps: 30`
- `width: 1080`
- `height: 1920`

## Commands

```bash
npm install
npm run studio
npm run catalog:editor
npm run review:app
npm run track:fit-dialogue
npm run render:track
npm run export:jianying
npm run export:fcpxml
npm test
```

## Validation

Use these checks after changing project data:

```bash
node -e "JSON.parse(require('fs').readFileSync('track.json','utf8')); console.log('track.json ok')"
node -e "JSON.parse(require('fs').readFileSync('describe.json','utf8')); console.log('describe.json ok')"
node -e "JSON.parse(require('fs').readFileSync('img-describe.json','utf8')); console.log('img-describe.json ok')"
```

Run `npm test` when modifying scripts or the catalog editor.
