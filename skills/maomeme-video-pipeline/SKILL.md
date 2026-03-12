---
name: maomeme-video-pipeline
description: Scaffold or operate a Remotion-based cat meme short-video pipeline with asset catalogs, story-to-track generation, dialogue retiming, and export tooling. Use when Codex needs to port the maomemeCreate workflow into another workspace, set up or update a repo with describe.json/img-describe.json/track.json, generate or edit cat meme timelines from Chinese story text, run the catalog editor, or export to MP4, Jianying draft, or FCPXML.
---

# Maomeme Video Pipeline

Use this skill to move the `maomemeCreate` workflow into another workspace or to operate a repo that already follows the same data contract.

The skill ships a reusable project template in [assets/project-template](assets/project-template) and an installer in [scripts/install_template.py](scripts/install_template.py). It does not bundle the original media library. Expect to bring your own `public/lib` and `public/img` assets.

## Workflow

1. Decide whether the workspace needs scaffolding or only data work.
   If `package.json`, `src/index.jsx`, `track.json`, `describe.json`, or `img-describe.json` are missing, install the template first.

2. Install the template instead of recreating the project by hand.
   Run:

   ```bash
   python3 <skill-dir>/scripts/install_template.py --target .
   ```

   Use `--force` only after checking collisions. The installer copies the Remotion app, catalog editor, export scripts, starter JSON files, and test file.

3. Read the right reference before editing data.
   Read [references/pipeline-contract.md](references/pipeline-contract.md) for any task that touches repo structure, asset paths, render commands, or transparent character media.
   Read [references/story-to-track.md](references/story-to-track.md) when generating or rewriting `track.json` from a story or shot plan.

4. Keep the data contract stable.
   Preserve `schema: "remotion-timeline/v1"`.
   Keep `track.json` asset paths in `lib/...` or `img/...`, never `public/...`.
   Keep `composition.durationInFrames` equal to the max track end.
   Keep one concrete role per character track. Do not place the same character twice in the same scene group.

5. Prefer the built-in workflow over ad hoc code.
   Use `npm run catalog:editor` to maintain `describe.json` and `img-describe.json`.
   Use `npm run track:fit-dialogue` after text changes.
   Use `npm run studio` for preview.
   Use `npm run render:track`, `npm run export:jianying`, or `npm run export:fcpxml` for outputs.

6. Validate after changes.
   Run:

   ```bash
   node -e "JSON.parse(require('fs').readFileSync('track.json','utf8')); console.log('track.json ok')"
   node -e "JSON.parse(require('fs').readFileSync('describe.json','utf8')); console.log('describe.json ok')"
   node -e "JSON.parse(require('fs').readFileSync('img-describe.json','utf8')); console.log('img-describe.json ok')"
   npm test
   ```

## Operating Rules

- Prefer transparent `webm` characters first, then transparent `mov`, then normal `mp4`.
- If a selected transparent `webm` originally comes from the known R2 prefix, ensure it exists locally under `public/lib/webm/` before writing `track.json`.
- Keep default composition settings at `30fps`, `1080x1920` unless the user explicitly changes them.
- Default subtitle behavior is direct in/direct out. Do not add text animations unless requested.
- Keep title and role labels yellow with black outline. Keep dialogue white with black outline.
- Treat the template files as the source of truth for project structure. Copy and adapt them; do not re-invent parallel variants unless the user asks.

## Resources

- [scripts/install_template.py](scripts/install_template.py): Copy the reusable project skeleton into a target workspace.
- [references/pipeline-contract.md](references/pipeline-contract.md): Repo layout, path rules, commands, validation, and media requirements.
- [references/story-to-track.md](references/story-to-track.md): Story splitting, asset matching, timing, subtitle, and layout rules.
- [assets/project-template](assets/project-template): Portable Remotion app, export scripts, editor UI, starter JSON files, and tests.
