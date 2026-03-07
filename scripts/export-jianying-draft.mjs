import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile as execFileCb} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execFile = promisify(execFileCb);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(projectRoot, 'public');
const SEC = 1_000_000;

const parseArgs = () => {
  const [, , inputArg = 'track.json', outputArg] = process.argv;
  return {
    inputPath: path.resolve(projectRoot, inputArg),
    outputArg,
  };
};

const readJson = async (targetPath) => JSON.parse(await fs.readFile(targetPath, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const makeId = () => crypto.randomUUID().replace(/-/g, '');
const nowMicros = () => Date.now() * 1000;
const normalizeAssetPath = (assetPath) => assetPath ? assetPath.replace(/\\/g, '/').replace(/^\.\//, '') : null;
const frameToMicros = (frames, fps) => Math.max(0, Math.round((frames / fps) * SEC));

const parseAspectRatio = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const match = value.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) {
    return null;
  }

  return {width, height, ratio: width / height};
};

const hasManualBox = (style = {}) => ['x', 'y', 'width', 'height'].every((key) => typeof style[key] === 'number');
const getTrackLayoutKind = (track) => track.layout?.kind ?? (track.type === 'image' ? 'background' : null);
const getCharacterGroupKey = (track, fallbackIndex) => track.layout?.groupId ?? `${track.from ?? 0}:${track.duration ?? 1}:${fallbackIndex}`;

const buildCharacterGroups = (tracks) => {
  const groups = new Map();
  tracks.forEach((track, index) => {
    if (getTrackLayoutKind(track) !== 'character') {
      return;
    }
    const key = getCharacterGroupKey(track, index);
    const list = groups.get(key) ?? [];
    list.push({track, index});
    groups.set(key, list);
  });

  groups.forEach((list) => {
    list.sort((left, right) => {
      const leftIndex = left.track.layout?.slotIndex ?? left.index;
      const rightIndex = right.track.layout?.slotIndex ?? right.index;
      return leftIndex - rightIndex;
    });
  });

  return groups;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const getDefaultBackgroundStyle = (composition) => ({x: 0, y: 0, width: composition.width, height: composition.height, fit: 'cover', opacity: 1, zIndex: 0});
const getSlotCenters = (slotCount) => {
  if (slotCount <= 1) return [0.5];
  if (slotCount === 2) return [0.3, 0.7];
  if (slotCount === 3) return [0.2, 0.5, 0.8];
  return [0.14, 0.38, 0.62, 0.86];
};
const getFrameEnd = (track) => (track.from ?? 0) + (track.duration ?? 1);
const getOverlapFrames = (left, right) => {
  const start = Math.max(left.from ?? 0, right.from ?? 0);
  const end = Math.min(getFrameEnd(left), getFrameEnd(right));
  return Math.max(0, end - start);
};
const getBackgroundTracks = (tracks) => tracks.filter((item) => getTrackLayoutKind(item) === 'background');
const findActiveBackgroundTrack = (track, allTracks) => {
  const backgroundTracks = getBackgroundTracks(allTracks);
  let bestTrack = null;
  let bestOverlap = 0;
  backgroundTracks.forEach((candidate) => {
    const overlap = getOverlapFrames(track, candidate);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestTrack = candidate;
    }
  });
  return bestTrack;
};
const toPixels = (value, total, fallback) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  if (value >= 0 && value <= 1) return value * total;
  return value;
};
const resolveZoneIndex = (zoneCount, slotCount, slotIndex) => {
  if (zoneCount <= 0) return null;
  if (slotCount <= 1) return Math.floor((zoneCount - 1) / 2);
  if (slotCount === 2) return slotIndex === 0 ? 0 : zoneCount - 1;
  const ratio = slotIndex / Math.max(1, slotCount - 1);
  return clamp(Math.round(ratio * (zoneCount - 1)), 0, zoneCount - 1);
};
const resolveCharacterZone = ({backgroundTrack, slotCount, slotIndex}) => {
  const zones = backgroundTrack?.layout?.characterZones;
  if (!Array.isArray(zones) || zones.length === 0) return null;
  const zoneIndex = resolveZoneIndex(zones.length, slotCount, slotIndex);
  if (zoneIndex == null) return null;
  return zones[zoneIndex] ?? null;
};

const getCharacterStyle = ({composition, track, group, indexInGroup, backgroundTrack}) => {
  const slotCount = clamp(track.layout?.slotCount ?? group.length, 1, 4);
  const slotIndex = clamp(track.layout?.slotIndex ?? indexInGroup, 0, slotCount - 1);
  const centers = getSlotCenters(slotCount);
  const parsed = parseAspectRatio(track.layout?.aspectRatio ?? track.aspectRatio);
  const ratio = parsed?.ratio ?? 0.9;
  const zone = resolveCharacterZone({backgroundTrack, slotCount, slotIndex});

  const baseWidthByCount = {
    1: composition.width * 0.5,
    2: composition.width * 0.31,
    3: composition.width * 0.235,
    4: composition.width * 0.19,
  };
  const maxHeightByCount = {
    1: composition.height * 0.56,
    2: composition.height * 0.46,
    3: composition.height * 0.38,
    4: composition.height * 0.31,
  };

  const defaultCenterX = composition.width * (centers[slotIndex] ?? 0.5);
  let width = toPixels(zone?.width ?? zone?.widthRatio, composition.width, baseWidthByCount[slotCount] ?? composition.width * 0.22);
  let baseline = toPixels(zone?.baselineY, composition.height, composition.height * 0.79);
  const centerX = toPixels(zone?.centerX, composition.width, defaultCenterX);

  if (ratio <= 0.75) {
    width *= 0.88;
    baseline -= composition.height * 0.025;
  } else if (ratio >= 1.2) {
    width *= 1.16;
    baseline += composition.height * 0.015;
  }

  let height = width / ratio;
  const maxHeight = toPixels(zone?.maxHeight ?? zone?.maxHeightRatio, composition.height, maxHeightByCount[slotCount] ?? composition.height * 0.36);
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }

  const minX = toPixels(zone?.minX, composition.width, composition.width * 0.04);
  const rightPadding = toPixels(zone?.rightPadding, composition.width, minX);
  const maxX = composition.width - width - rightPadding;
  const minY = toPixels(zone?.minY, composition.height, composition.height * 0.2);
  const maxY = toPixels(zone?.maxY, composition.height, composition.height * 0.78 - height);
  const x = clamp(centerX - width / 2, minX, maxX);
  const y = clamp(baseline - height, minY, maxY);

  return {x, y, width, height, fit: zone?.fit ?? 'contain', opacity: 1, zIndex: zone?.zIndex ?? (20 + slotIndex)};
};

const resolveTrackStyle = ({composition, track, allTracks, trackIndex, characterGroups}) => {
  const style = track.style ?? {};
  if (hasManualBox(style)) return style;

  const layoutKind = getTrackLayoutKind(track);
  if (layoutKind === 'background') {
    return {...getDefaultBackgroundStyle(composition), ...style};
  }

  if (layoutKind === 'character') {
    const groups = characterGroups ?? buildCharacterGroups(allTracks);
    const key = getCharacterGroupKey(track, trackIndex);
    const group = groups.get(key) ?? [{track, index: trackIndex}];
    const indexInGroup = group.findIndex((item) => item.index === trackIndex);
    const backgroundTrack = findActiveBackgroundTrack(track, allTracks);
    return {
      ...getCharacterStyle({composition, track, group, indexInGroup: indexInGroup >= 0 ? indexInGroup : 0, backgroundTrack}),
      ...style,
    };
  }

  if (track.type === 'text') return {zIndex: 100, ...style};
  return style;
};

const resolveAssetPath = (data, track) => {
  if (track.src) return normalizeAssetPath(track.src);
  const assetId = track.assetId;
  if (!assetId) return null;
  for (const group of ['video', 'audio', 'image']) {
    const groupMap = data.assets?.[group];
    if (groupMap?.[assetId]) return normalizeAssetPath(groupMap[assetId]);
  }
  return null;
};

const getMediaInfo = async (absolutePath) => {
  const ext = path.extname(absolutePath).toLowerCase();
  const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
  if (isImage) {
    const {stdout} = await execFile('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', absolutePath], {encoding: 'utf8'});
    const width = Number((stdout.match(/pixelWidth:\s*(\d+)/) ?? [])[1] ?? 0);
    const height = Number((stdout.match(/pixelHeight:\s*(\d+)/) ?? [])[1] ?? 0);
    return {kind: 'image', width, height, durationMicros: 10_800_000_000, hasAudio: false};
  }

  const {stdout} = await execFile('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', absolutePath], {encoding: 'utf8'});
  const parsed = JSON.parse(stdout);
  const streams = parsed.streams ?? [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  const audioStream = streams.find((stream) => stream.codec_type === 'audio');
  const durationSec = Number(parsed.format?.duration ?? videoStream?.duration ?? audioStream?.duration ?? 0) || 0;
  return {
    kind: videoStream ? 'video' : 'audio',
    width: Number(videoStream?.width ?? 0),
    height: Number(videoStream?.height ?? 0),
    durationMicros: Math.round(durationSec * SEC),
    hasAudio: Boolean(audioStream),
  };
};

const rgbFromHex = (value, fallback = [1, 1, 1]) => {
  if (typeof value !== 'string') return fallback;
  const match = value.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!match) return fallback;
  const raw = match[1];
  return [0, 2, 4].map((idx) => Number.parseInt(raw.slice(idx, idx + 2), 16) / 255);
};

const textAlignToCapCut = (value) => {
  if (value === 'center') return 1;
  if (value === 'right') return 2;
  return 0;
};

const makeVideoMaterial = (resourceId, absolutePath, mediaInfo) => ({
  audio_fade: null,
  category_id: '',
  category_name: 'local',
  check_flag: 63487,
  crop: {
    upper_left_x: 0, upper_left_y: 0,
    upper_right_x: 1, upper_right_y: 0,
    lower_left_x: 0, lower_left_y: 1,
    lower_right_x: 1, lower_right_y: 1,
  },
  crop_ratio: 'free',
  crop_scale: 1,
  duration: mediaInfo.durationMicros,
  height: mediaInfo.height,
  id: resourceId,
  local_material_id: '',
  material_id: resourceId,
  material_name: path.basename(absolutePath),
  media_path: '',
  path: absolutePath,
  type: mediaInfo.kind === 'image' ? 'photo' : 'video',
  width: mediaInfo.width,
});

const makeAudioMaterial = (resourceId, absolutePath, mediaInfo) => ({
  app_id: 0,
  category_id: '',
  category_name: 'local',
  check_flag: 3,
  copyright_limit_type: 'none',
  duration: mediaInfo.durationMicros,
  effect_id: '',
  formula_id: '',
  id: resourceId,
  local_material_id: resourceId,
  music_id: resourceId,
  name: path.basename(absolutePath),
  path: absolutePath,
  source_platform: 0,
  type: 'extract_music',
  wave_points: [],
});

const makeMetaMaterial = ({resourceId, absolutePath, mediaInfo, kind}) => ({
  create_time: Math.floor(Date.now() / 1000),
  duration: mediaInfo.durationMicros,
  extra_info: path.basename(absolutePath, path.extname(absolutePath)),
  file_Path: absolutePath,
  height: mediaInfo.height ?? 0,
  id: resourceId,
  import_time: Math.floor(Date.now() / 1000),
  import_time_ms: nowMicros(),
  md5: '',
  metetype: kind,
  roughcut_time_range: {duration: 0, start: 0},
  sub_time_range: {duration: -1, start: -1},
  type: 0,
  width: mediaInfo.width ?? 0,
});

const makeSpeed = (id, speed = 1) => ({curve_speed: null, id, mode: 0, speed, type: 'speed'});

const makeBaseSegment = ({segmentId, materialId, startMicros, durationMicros, sourceTimerange, speedId, renderIndex, volume = 1}) => ({
  enable_adjust: true,
  enable_color_correct_adjust: false,
  enable_color_curves: true,
  enable_color_match_adjust: false,
  enable_color_wheels: true,
  enable_lut: true,
  enable_smart_color_adjust: false,
  last_nonzero_volume: 1,
  reverse: false,
  track_attribute: 0,
  track_render_index: 0,
  visible: true,
  id: segmentId,
  material_id: materialId,
  target_timerange: {start: startMicros, duration: durationMicros},
  common_keyframes: [],
  keyframe_refs: [],
  source_timerange: sourceTimerange,
  speed: 1,
  volume,
  extra_material_refs: speedId ? [speedId] : [],
  render_index: renderIndex,
});

const styleToClipSettings = ({style, composition, sourceWidth, sourceHeight, isBackground = false}) => {
  const width = style.width ?? sourceWidth ?? composition.width;
  const height = style.height ?? sourceHeight ?? composition.height;
  const centerX = (style.x ?? 0) + (width / 2);
  const centerY = (style.y ?? 0) + (height / 2);
  const scaleX = isBackground
    ? Math.max(composition.width / (sourceWidth || composition.width), composition.height / (sourceHeight || composition.height))
    : width / (sourceWidth || width || 1);
  const scaleY = isBackground
    ? Math.max(composition.width / (sourceWidth || composition.width), composition.height / (sourceHeight || composition.height))
    : height / (sourceHeight || height || 1);

  return {
    alpha: style.opacity ?? 1,
    flip: {horizontal: false, vertical: false},
    rotation: style.rotate ?? 0,
    scale: {x: scaleX, y: scaleY},
    transform: {
      x: ((centerX - (composition.width / 2)) / (composition.width / 2)),
      y: ((centerY - (composition.height / 2)) / (composition.height / 2)),
    },
  };
};

const styleToTextMaterial = ({id, content, style, composition}) => {
  const fillColor = rgbFromHex(style.color ?? '#ffffff', [1, 1, 1]);
  const strokeColor = rgbFromHex(style.strokeColor ?? '#000000', [0, 0, 0]);
  const borderWidth = style.strokeWidth ? Math.min(0.2, style.strokeWidth / 100) : 0;
  const textSize = Number(((style.fontSize ?? 60) / 7.5).toFixed(4));
  const contentJson = {
    styles: [
      {
        fill: {
          alpha: 1,
          content: {
            render_type: 'solid',
            solid: {alpha: 1, color: fillColor},
          },
        },
        range: [0, content.length],
        size: textSize,
        bold: (style.fontWeight ?? 700) >= 700,
        italic: false,
        underline: false,
        strokes: borderWidth > 0 ? [{content: {solid: {alpha: 1, color: strokeColor}}, width: borderWidth}] : [],
      },
    ],
    text: content,
  };

  const material = {
    id,
    content: JSON.stringify(contentJson, null, 0),
    typesetting: 0,
    alignment: textAlignToCapCut(style.textAlign),
    letter_spacing: Number((style.letterSpacing ?? 0) * 0.05),
    line_spacing: Number((0.02 + ((style.lineHeight ?? 1.1) - 1) * 0.1).toFixed(4)),
    line_feed: 1,
    line_max_width: Number((((style.maxWidth ?? composition.width * 0.8) / composition.width)).toFixed(4)),
    force_apply_line_max_width: false,
    check_flag: borderWidth > 0 ? 15 : 7,
    type: 'text',
    global_alpha: style.opacity ?? 1,
  };

  if (style.backgroundColor) {
    material.background_style = 1;
    material.background_color = style.backgroundColor;
    material.background_alpha = 1;
    material.background_round_radius = 0;
    material.background_height = 0.14;
    material.background_width = 0.14;
    material.background_horizontal_offset = 0;
    material.background_vertical_offset = 0;
  }

  return material;
};

const createDraftContentTemplate = ({width, height, fps, name, folderPath}) => ({
  canvas_config: {background: null, height, ratio: 'original', width},
  color_space: 0,
  config: {
    adjust_max_index: 1,
    attachment_info: [],
    combination_max_index: 1,
    export_range: null,
    extract_audio_last_index: 1,
    lyrics_recognition_id: '',
    lyrics_sync: true,
    lyrics_taskinfo: [],
    maintrack_adsorb: true,
    material_save_mode: 0,
    multi_language_current: 'none',
    multi_language_list: [],
    multi_language_main: 'none',
    multi_language_mode: 'none',
    original_sound_last_index: 1,
    record_audio_last_index: 1,
    sticker_max_index: 1,
    subtitle_keywords_config: null,
    subtitle_recognition_id: '',
    subtitle_sync: true,
    subtitle_taskinfo: [],
    system_font_list: [],
    use_float_render: false,
    video_mute: false,
    zoom_info_params: null,
  },
  cover: null,
  create_time: 0,
  duration: 0,
  extra_info: null,
  fps,
  free_render_index_mode_on: false,
  group_container: null,
  id: makeId(),
  is_drop_frame_timecode: false,
  keyframe_graph_list: [],
  keyframes: {adjusts: [], audios: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: []},
  last_modified_platform: {app_id: 359289, app_source: 'cc', app_version: '6.7.0', os: 'windows'},
  lyrics_effects: [],
  materials: {
    ai_translates: [], audio_balances: [], audio_effects: [], audio_fades: [], audio_track_indexes: [], audios: [], beats: [], canvases: [], chromas: [], color_curves: [], common_mask: [], digital_human_model_dressing: [], digital_humans: [], drafts: [], effects: [], flowers: [], green_screens: [], handwrites: [], hsl: [], images: [], log_color_wheels: [], loudnesses: [], manual_beautys: [], manual_deformations: [], material_animations: [], material_colors: [], multi_language_refs: [], placeholder_infos: [], placeholders: [], plugin_effects: [], primary_color_wheels: [], realtime_denoises: [], shapes: [], smart_crops: [], smart_relights: [], sound_channel_mappings: [], speeds: [], stickers: [], tail_leaders: [], text_templates: [], texts: [], time_marks: [], transitions: [], video_effects: [], video_trackings: [], videos: [], vocal_beautifys: [], vocal_separations: [],
  },
  mutable_config: null,
  name,
  new_version: '140.0.0',
  path: folderPath,
  platform: {app_id: 359289, app_source: 'cc', app_version: '6.7.0', os: 'windows'},
  relationships: [],
  render_index_track_mode_on: false,
  retouch_cover: null,
  source: 'default',
  static_cover_image_path: '',
  time_marks: null,
  tracks: [],
  update_time: 0,
  version: 360000,
});

const createDraftMetaTemplate = ({name, folderPath, rootPath, duration}) => ({
  cloud_draft_cover: false,
  cloud_draft_sync: false,
  cloud_package_completed_time: '',
  draft_cloud_capcut_purchase_info: '',
  draft_cloud_last_action_download: false,
  draft_cloud_package_type: '',
  draft_cloud_purchase_info: '',
  draft_cloud_template_id: '',
  draft_cloud_tutorial_info: '',
  draft_cloud_videocut_purchase_info: '',
  draft_cover: '',
  draft_deeplink_url: '',
  draft_enterprise_info: {draft_enterprise_extra: '', draft_enterprise_id: '', draft_enterprise_name: '', enterprise_material: []},
  draft_fold_path: folderPath,
  draft_id: makeId(),
  draft_is_ae_produce: false,
  draft_is_ai_packaging_used: false,
  draft_is_ai_shorts: false,
  draft_is_ai_translate: false,
  draft_is_article_video_draft: false,
  draft_is_cloud_temp_draft: false,
  draft_is_from_deeplink: 'false',
  draft_is_invisible: false,
  draft_materials: [{type: 0, value: []}, {type: 1, value: []}, {type: 2, value: []}, {type: 3, value: []}, {type: 6, value: []}, {type: 7, value: []}, {type: 8, value: []}],
  draft_materials_copied_info: [],
  draft_name: name,
  draft_new_version: '',
  draft_removable_storage_device: '',
  draft_root_path: rootPath,
  draft_segment_extra_info: [],
  draft_timeline_materials_size_: 0,
  draft_type: '',
  tm_draft_cloud_completed: '',
  tm_draft_cloud_entry_id: 0,
  tm_draft_cloud_modified: 0,
  tm_draft_removed: 0,
  tm_duration: duration,
});

const createLabelTrack = ({track, style, composition}) => {
  if (!track.characterLabel) return null;
  const labelWidth = Math.max(180, Math.min(320, (style.width ?? 240) * 0.9));
  return {
    id: `${track.id}_label`,
    type: 'text',
    from: track.from,
    duration: track.duration,
    content: track.characterLabel,
    style: {
      x: (style.x ?? 0) + ((style.width ?? 0) / 2) - (labelWidth / 2),
      y: Math.min(composition.height - 120, (style.y ?? 0) + (style.height ?? 0) + 16),
      width: labelWidth,
      maxWidth: labelWidth,
      fontFamily: 'PingFang SC',
      fontSize: 52,
      fontWeight: 900,
      lineHeight: 1,
      color: '#ffd426',
      textAlign: 'center',
      strokeColor: '#000000',
      strokeWidth: 8,
      zIndex: ((style.zIndex ?? 20) + 20),
      opacity: 1,
    },
  };
};

const groupIntoRenderTracks = (items, {baseType, renderIndexBase = 0}) => {
  const groups = new Map();
  for (const item of items) {
    const key = item.renderIndex;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const packed = [];
  [...groups.entries()].sort((a, b) => a[0] - b[0]).forEach(([renderIndex, list]) => {
    list.sort((a, b) => a.startMicros - b.startMicros || a.index - b.index);
    const lanes = [];
    list.forEach((item) => {
      let laneIndex = lanes.findIndex((lane) => lane.lastEnd <= item.startMicros);
      if (laneIndex === -1) {
        laneIndex = lanes.length;
        lanes.push({lastEnd: 0, items: []});
      }
      lanes[laneIndex].items.push(item);
      lanes[laneIndex].lastEnd = item.startMicros + item.durationMicros;
    });

    lanes.forEach((lane, laneIndex) => {
      packed.push({
        type: baseType,
        name: `${baseType}_${renderIndex}_${laneIndex + 1}`,
        renderIndex: renderIndexBase + renderIndex + laneIndex,
        items: lane.items,
      });
    });
  });

  return packed.sort((a, b) => a.renderIndex - b.renderIndex);
};

const main = async () => {
  const {inputPath, outputArg} = parseArgs();
  const data = await readJson(inputPath);
  const composition = data.composition ?? {width: 1080, height: 1920, fps: 30, durationInFrames: 300};
  const tracks = data.tracks ?? [];
  const characterGroups = buildCharacterGroups(tracks);
  const styles = tracks.map((track, index) => resolveTrackStyle({composition, track, allTracks: tracks, trackIndex: index, characterGroups}));

  const renderBaseName = path.basename(data.render?.output ?? `${data.name ?? 'jianying-preview'}.mp4`, path.extname(data.render?.output ?? '.mp4'));
  const draftFolder = path.resolve(projectRoot, outputArg ?? path.join('out', `${renderBaseName}.jianying-draft`));
  await fs.mkdir(draftFolder, {recursive: true});

  const content = createDraftContentTemplate({
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    name: data.meta?.title ?? data.name ?? renderBaseName,
    folderPath: draftFolder,
  });
  const meta = createDraftMetaTemplate({
    name: data.meta?.title ?? data.name ?? renderBaseName,
    folderPath: draftFolder,
    rootPath: path.dirname(draftFolder),
    duration: frameToMicros(composition.durationInFrames ?? 300, composition.fps ?? 30),
  });

  const assetCache = new Map();
  const ensureAsset = async (track) => {
    const relativePath = resolveAssetPath(data, track);
    if (!relativePath) return null;
    if (assetCache.has(relativePath)) return assetCache.get(relativePath);
    const absolutePath = path.resolve(publicRoot, relativePath);
    const mediaInfo = await getMediaInfo(absolutePath);
    const entry = {relativePath, absolutePath, mediaInfo, resourceId: makeId()};
    assetCache.set(relativePath, entry);
    return entry;
  };

  for (const track of tracks) {
    await ensureAsset(track);
  }

  for (const asset of assetCache.values()) {
    if (asset.mediaInfo.kind === 'audio') {
      content.materials.audios.push(makeAudioMaterial(asset.resourceId, asset.absolutePath, asset.mediaInfo));
      meta.draft_materials[6].value.push(makeMetaMaterial({resourceId: asset.resourceId, absolutePath: asset.absolutePath, mediaInfo: asset.mediaInfo, kind: 'music'}));
    } else {
      content.materials.videos.push(makeVideoMaterial(asset.resourceId, asset.absolutePath, asset.mediaInfo));
      meta.draft_materials[0].value.push(makeMetaMaterial({resourceId: asset.resourceId, absolutePath: asset.absolutePath, mediaInfo: asset.mediaInfo, kind: asset.mediaInfo.kind === 'image' ? 'photo' : 'video'}));
    }
  }

  const videoItems = [];
  const textItems = [];
  const audioItems = [];

  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    const style = styles[index];
    const startMicros = frameToMicros(track.from ?? 0, composition.fps);
    const durationMicros = frameToMicros(track.duration ?? 1, composition.fps);

    if (track.type === 'text') {
      const materialId = makeId();
      const speedId = makeId();
      content.materials.texts.push(styleToTextMaterial({id: materialId, content: track.content ?? '', style, composition}));
      textItems.push({
        kind: 'text',
        id: track.id,
        index,
        materialId,
        speedId,
        startMicros,
        durationMicros,
        style,
        renderIndex: 15000 + Math.round((style.zIndex ?? 100) * 10),
      });
      continue;
    }

    if (track.type === 'audio') {
      const asset = await ensureAsset(track);
      if (!asset) continue;
      const trimStartMicros = frameToMicros(track.trimStart ?? 0, composition.fps);
      const speedId = makeId();
      content.materials.speeds.push(makeSpeed(speedId));
      audioItems.push({
        kind: 'audio',
        id: track.id,
        index,
        materialId: asset.resourceId,
        speedId,
        startMicros,
        durationMicros,
        trimStartMicros,
        volume: track.volume ?? 1,
        renderIndex: 0,
      });
      continue;
    }

    const asset = await ensureAsset(track);
    if (!asset) continue;
    const trimStartMicros = frameToMicros(track.trimStart ?? 0, composition.fps);
    const speedId = makeId();
    content.materials.speeds.push(makeSpeed(speedId));
    videoItems.push({
      kind: 'visual',
      id: track.id,
      index,
      track,
      materialId: asset.resourceId,
      speedId,
      mediaInfo: asset.mediaInfo,
      startMicros,
      durationMicros,
      trimStartMicros,
      style,
      renderIndex: getTrackLayoutKind(track) === 'background' ? 0 : Math.round((style.zIndex ?? 20) * 10),
      isBackground: getTrackLayoutKind(track) === 'background',
      volume: track.volume ?? 1,
    });

    const labelTrack = createLabelTrack({track, style, composition});
    if (labelTrack) {
      const materialId = makeId();
      const speedId = makeId();
      content.materials.texts.push(styleToTextMaterial({id: materialId, content: labelTrack.content, style: labelTrack.style, composition}));
      textItems.push({
        kind: 'text',
        id: labelTrack.id,
        index: index + 1000,
        materialId,
        speedId,
        startMicros,
        durationMicros,
        style: labelTrack.style,
        renderIndex: 15000 + Math.round((labelTrack.style.zIndex ?? 120) * 10),
      });
    }
  }

  const videoTracks = groupIntoRenderTracks(videoItems, {baseType: 'video'});
  const textTracks = groupIntoRenderTracks(textItems, {baseType: 'text'});
  const audioTracks = groupIntoRenderTracks(audioItems, {baseType: 'audio'});

  const draftTracks = [];

  for (const trackInfo of videoTracks) {
    const trackJson = {attribute: 0, flag: 0, id: makeId(), is_default_name: false, name: trackInfo.name, segments: [], type: 'video'};
    trackInfo.items.sort((a, b) => a.startMicros - b.startMicros || a.index - b.index);
    for (const item of trackInfo.items) {
      const sourceDuration = item.mediaInfo.kind === 'image' ? item.durationMicros : Math.min(item.durationMicros, Math.max(0, item.mediaInfo.durationMicros - item.trimStartMicros));
      const segment = makeBaseSegment({
        segmentId: makeId(),
        materialId: item.materialId,
        startMicros: item.startMicros,
        durationMicros: item.durationMicros,
        sourceTimerange: {start: item.trimStartMicros, duration: sourceDuration},
        speedId: item.speedId,
        renderIndex: trackInfo.renderIndex,
        volume: item.volume,
      });
      segment.clip = styleToClipSettings({style: item.style, composition, sourceWidth: item.mediaInfo.width, sourceHeight: item.mediaInfo.height, isBackground: item.isBackground});
      segment.uniform_scale = {on: true, value: 1};
      segment.hdr_settings = {intensity: 1, mode: 1, nits: 1000};
      trackJson.segments.push(segment);
    }
    draftTracks.push({sortIndex: trackInfo.renderIndex, data: trackJson});
  }

  for (const trackInfo of audioTracks) {
    const trackJson = {attribute: 0, flag: 0, id: makeId(), is_default_name: false, name: trackInfo.name, segments: [], type: 'audio'};
    trackInfo.items.sort((a, b) => a.startMicros - b.startMicros || a.index - b.index);
    for (const item of trackInfo.items) {
      const segment = makeBaseSegment({
        segmentId: makeId(),
        materialId: item.materialId,
        startMicros: item.startMicros,
        durationMicros: item.durationMicros,
        sourceTimerange: {start: item.trimStartMicros, duration: item.durationMicros},
        speedId: item.speedId,
        renderIndex: trackInfo.renderIndex,
        volume: item.volume,
      });
      segment.clip = null;
      segment.hdr_settings = null;
      trackJson.segments.push(segment);
    }
    draftTracks.push({sortIndex: 100 + trackInfo.renderIndex, data: trackJson});
  }

  for (const trackInfo of textTracks) {
    const trackJson = {attribute: 0, flag: 0, id: makeId(), is_default_name: false, name: trackInfo.name, segments: [], type: 'text'};
    trackInfo.items.sort((a, b) => a.startMicros - b.startMicros || a.index - b.index);
    for (const item of trackInfo.items) {
      const segment = makeBaseSegment({
        segmentId: makeId(),
        materialId: item.materialId,
        startMicros: item.startMicros,
        durationMicros: item.durationMicros,
        sourceTimerange: null,
        speedId: item.speedId,
        renderIndex: trackInfo.renderIndex,
        volume: 1,
      });
      segment.clip = styleToClipSettings({style: item.style, composition, sourceWidth: item.style.width ?? item.style.maxWidth ?? 400, sourceHeight: item.style.height ?? ((item.style.fontSize ?? 60) * 1.6), isBackground: false});
      segment.uniform_scale = {on: true, value: 1};
      trackJson.segments.push(segment);
    }
    draftTracks.push({sortIndex: trackInfo.renderIndex, data: trackJson});
  }

  draftTracks.sort((a, b) => a.sortIndex - b.sortIndex);
  content.tracks = draftTracks.map((item) => item.data);
  content.duration = frameToMicros(composition.durationInFrames ?? 300, composition.fps);
  meta.tm_duration = content.duration;

  await fs.writeFile(path.join(draftFolder, 'draft_content.json'), JSON.stringify(content, null, 2));
  await fs.writeFile(path.join(draftFolder, 'draft_meta_info.json'), JSON.stringify(meta, null, 2));

  console.log(draftFolder);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
