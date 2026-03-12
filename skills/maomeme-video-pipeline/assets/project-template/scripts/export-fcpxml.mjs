import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFile as execFileCb} from 'node:child_process';
import {promisify} from 'node:util';

const execFile = promisify(execFileCb);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(projectRoot, 'public');

const parseArgs = () => {
  const [, , inputArg, outputArg] = process.argv;
  const inputPath = path.resolve(projectRoot, inputArg ?? 'track.json');
  return {inputPath, outputArg};
};

const readJson = async (targetPath) => {
  const raw = await fs.readFile(targetPath, 'utf8');
  return JSON.parse(raw);
};

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

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
const hasManualTextPosition = (style = {}) => typeof style.x === 'number' && typeof style.y === 'number';

const getTrackLayoutKind = (track) => {
  if (track.layout?.kind) {
    return track.layout.kind;
  }
  if (track.type === 'image') {
    return 'background';
  }
  return null;
};

const getCharacterGroupKey = (track, fallbackIndex) => {
  if (track.layout?.groupId) {
    return track.layout.groupId;
  }
  return `${track.from ?? 0}:${track.duration ?? 1}:${fallbackIndex}`;
};

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

const getDefaultBackgroundStyle = (composition) => ({
  x: 0,
  y: 0,
  width: composition.width,
  height: composition.height,
  fit: 'cover',
  opacity: 1,
  zIndex: 0,
});

const getSlotCenters = (slotCount) => {
  if (slotCount <= 1) {
    return [0.5];
  }
  if (slotCount === 2) {
    return [0.3, 0.7];
  }
  if (slotCount === 3) {
    return [0.2, 0.5, 0.8];
  }
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
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  if (value >= 0 && value <= 1) {
    return value * total;
  }
  return value;
};

const resolveZoneIndex = (zoneCount, slotCount, slotIndex) => {
  if (zoneCount <= 0) {
    return null;
  }
  if (slotCount <= 1) {
    return Math.floor((zoneCount - 1) / 2);
  }
  if (slotCount === 2) {
    return slotIndex === 0 ? 0 : zoneCount - 1;
  }

  const ratio = slotIndex / Math.max(1, slotCount - 1);
  return clamp(Math.round(ratio * (zoneCount - 1)), 0, zoneCount - 1);
};

const resolveCharacterZone = ({backgroundTrack, slotCount, slotIndex}) => {
  const zones = backgroundTrack?.layout?.characterZones;
  if (!Array.isArray(zones) || zones.length === 0) {
    return null;
  }

  const zoneIndex = resolveZoneIndex(zones.length, slotCount, slotIndex);
  if (zoneIndex == null) {
    return null;
  }

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

  return {
    x,
    y,
    width,
    height,
    fit: zone?.fit ?? 'contain',
    opacity: 1,
    zIndex: zone?.zIndex ?? (20 + slotIndex),
  };
};

const estimateTextBlockHeight = ({content, width, fontSize, lineHeight}) => {
  const text = String(content ?? '').trim();
  if (!text) {
    return fontSize * lineHeight;
  }

  const explicitLines = text.split('\n');
  const averageCharWidth = fontSize * 0.95;
  const charsPerLine = Math.max(1, Math.floor(width / averageCharWidth));
  const totalLines = explicitLines.reduce((sum, line) => {
    const lineLength = Math.max(1, Array.from(line).length);
    return sum + Math.max(1, Math.ceil(lineLength / charsPerLine));
  }, 0);

  return totalLines * fontSize * lineHeight;
};

const getSpeakerBoundTextStyle = ({composition, track, allTracks, characterGroups}) => {
  const speakerTrackId = track.speakerTrackId ?? track.layout?.speakerTrackId;
  if (!speakerTrackId) {
    return null;
  }

  const speakerIndex = allTracks.findIndex((item) => item.id === speakerTrackId);
  if (speakerIndex < 0) {
    return null;
  }

  const speakerTrack = allTracks[speakerIndex];
  if (getTrackLayoutKind(speakerTrack) !== 'character') {
    return null;
  }

  const speakerStyle = resolveTrackStyle({
    composition,
    track: speakerTrack,
    allTracks,
    trackIndex: speakerIndex,
    characterGroups,
  });

  const fontSize = track.style?.fontSize ?? 56;
  const lineHeight = track.style?.lineHeight ?? 1.08;
  const bubbleWidth = clamp(
    track.style?.width ?? track.style?.maxWidth ?? (speakerStyle.width ?? 280) * 1.28,
    220,
    Math.min(420, composition.width * 0.44),
  );
  const centerX = (speakerStyle.x ?? 0) + ((speakerStyle.width ?? bubbleWidth) / 2);
  const estimatedHeight = estimateTextBlockHeight({
    content: track.content,
    width: bubbleWidth,
    fontSize,
    lineHeight,
  });
  const preferredTop = (speakerStyle.y ?? 0) - estimatedHeight - 28;
  const maxTop = Math.max(140, (speakerStyle.y ?? 0) - 20);
  let textAlign = 'center';
  if (centerX <= composition.width * 0.36) {
    textAlign = 'left';
  } else if (centerX >= composition.width * 0.64) {
    textAlign = 'right';
  }

  return {
    x: clamp(centerX - (bubbleWidth / 2), 36, composition.width - bubbleWidth - 36),
    y: clamp(preferredTop, 140, maxTop),
    width: bubbleWidth,
    maxWidth: bubbleWidth,
    textAlign,
    zIndex: (speakerStyle.zIndex ?? 20) + 30,
  };
};

const resolveTrackStyle = ({composition, track, allTracks, trackIndex, characterGroups}) => {
  const style = track.style ?? {};
  if (hasManualBox(style)) {
    return style;
  }

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
      ...getCharacterStyle({
        composition,
        track,
        group,
        indexInGroup: indexInGroup >= 0 ? indexInGroup : 0,
        backgroundTrack,
      }),
      ...style,
    };
  }

  if (track.type === 'text') {
    const speakerBoundStyle = !hasManualTextPosition(style)
      ? getSpeakerBoundTextStyle({composition, track, allTracks, characterGroups})
      : null;
    return {zIndex: 100, ...(speakerBoundStyle ?? {}), ...style};
  }

  return style;
};

const normalizeAssetPath = (assetPath) => {
  if (!assetPath) {
    return null;
  }
  return assetPath.replace(/\\/g, '/').replace(/^\.\//, '');
};

const resolveAssetPath = (data, track) => {
  if (track.src) {
    return normalizeAssetPath(track.src);
  }

  const assetId = track.assetId;
  if (!assetId) {
    return null;
  }

  const groups = ['video', 'audio', 'image'];
  for (const group of groups) {
    const groupMap = data.assets?.[group];
    if (groupMap?.[assetId]) {
      return normalizeAssetPath(groupMap[assetId]);
    }
  }

  return null;
};

const frameToFcpxTime = (frames, fps) => `${Math.max(0, frames)}/${fps}s`;
const secondsToFcpxTime = (seconds) => `${Number(seconds.toFixed(6))}s`;

const gcd = (a, b) => {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right) {
    [left, right] = [right, left % right];
  }
  return left || 1;
};

const fpsToFrameDuration = (fps) => {
  const rounded = Math.round(fps * 1000);
  const denom = 1000;
  const factor = gcd(rounded, denom);
  return `${denom / factor}/${rounded / factor}s`;
};

const toDb = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return '-96dB';
  }
  const db = 20 * Math.log10(value);
  return `${db.toFixed(2)}dB`;
};

const parseColor = (value, fallback) => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const hex = value.trim();
  const match = hex.match(/^#([0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) {
    return fallback;
  }

  const raw = match[1];
  const values = raw.length === 6
    ? [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4, 6), 'ff']
    : [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4, 6), raw.slice(6, 8)];

  const normalized = values.map((item) => (parseInt(item, 16) / 255).toFixed(4));
  return normalized.join(' ');
};

const fontFaceFromWeight = (weight) => {
  if (weight >= 900) {
    return 'Heavy';
  }
  if (weight >= 700) {
    return 'Bold';
  }
  return 'Regular';
};

const getMediaInfo = async (absolutePath) => {
  const extension = path.extname(absolutePath).toLowerCase();
  const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(extension);

  if (isImage) {
    const {stdout} = await execFile('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', absolutePath], {encoding: 'utf8'});
    const widthMatch = stdout.match(/pixelWidth:\s*(\d+)/);
    const heightMatch = stdout.match(/pixelHeight:\s*(\d+)/);
    return {
      kind: 'image',
      width: widthMatch ? Number(widthMatch[1]) : null,
      height: heightMatch ? Number(heightMatch[1]) : null,
    };
  }

  const {stdout} = await execFile('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    absolutePath,
  ], {encoding: 'utf8'});
  const parsed = JSON.parse(stdout);
  const streams = parsed.streams ?? [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  const audioStream = streams.find((stream) => stream.codec_type === 'audio');
  const duration = Number(parsed.format?.duration ?? videoStream?.duration ?? audioStream?.duration ?? 0) || 0;
  const frameRateRaw = videoStream?.avg_frame_rate && videoStream.avg_frame_rate !== '0/0'
    ? videoStream.avg_frame_rate
    : videoStream?.r_frame_rate;

  let frameRate = null;
  if (frameRateRaw && frameRateRaw !== '0/0') {
    const [num, denom] = frameRateRaw.split('/').map(Number);
    if (num && denom) {
      frameRate = num / denom;
    }
  }

  return {
    kind: videoStream ? 'video' : 'audio',
    width: videoStream?.width ? Number(videoStream.width) : null,
    height: videoStream?.height ? Number(videoStream.height) : null,
    duration,
    frameRate,
    hasVideo: Boolean(videoStream),
    hasAudio: Boolean(audioStream),
    audioChannels: audioStream?.channels ? Number(audioStream.channels) : null,
    audioRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : null,
  };
};

const getAssetMap = async (data) => {
  const unique = new Map();
  const tracks = data.tracks ?? [];

  tracks.forEach((track) => {
    const relativePath = resolveAssetPath(data, track);
    if (!relativePath) {
      return;
    }
    if (!unique.has(relativePath)) {
      unique.set(relativePath, null);
    }
  });

  const entries = [];
  for (const relativePath of unique.keys()) {
    const absolutePath = path.resolve(publicRoot, relativePath);
    const mediaInfo = await getMediaInfo(absolutePath);
    entries.push({
      relativePath,
      absolutePath,
      mediaInfo,
    });
  }

  return entries;
};

const buildFormatRegistry = (composition, assets) => {
  const formats = new Map();
  let index = 1;

  const ensureFormat = ({width, height, fps, name}) => {
    const safeWidth = Math.round(width || composition.width);
    const safeHeight = Math.round(height || composition.height);
    const safeFps = fps || composition.fps || 30;
    const key = `${safeWidth}x${safeHeight}@${safeFps}`;
    if (formats.has(key)) {
      return formats.get(key);
    }

    const format = {
      id: `r_fmt_${index += 1}`,
      width: safeWidth,
      height: safeHeight,
      frameDuration: fpsToFrameDuration(safeFps),
      name: name ?? `FFVideoFormat${safeWidth}x${safeHeight}p${Math.round(safeFps)}`,
    };
    formats.set(key, format);
    return format;
  };

  const sequenceFormat = ensureFormat({
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    name: `FFVideoFormat${composition.width}x${composition.height}p${Math.round(composition.fps)}`,
  });

  assets.forEach((asset) => {
    if (!asset.mediaInfo.hasVideo && asset.mediaInfo.kind !== 'image') {
      return;
    }

    asset.format = ensureFormat({
      width: asset.mediaInfo.width || composition.width,
      height: asset.mediaInfo.height || composition.height,
      fps: asset.mediaInfo.frameRate || composition.fps,
    });
  });

  return {sequenceFormat, formats: [...formats.values()]};
};

const getTrackAssignments = (tracks) => {
  const backgrounds = tracks
    .map((track, index) => ({track, index}))
    .filter(({track}) => getTrackLayoutKind(track) === 'background')
    .sort((left, right) => (left.track.from ?? 0) - (right.track.from ?? 0));

  const assignments = new Map();
  tracks.forEach((track, index) => {
    if (getTrackLayoutKind(track) === 'background') {
      return;
    }
    let best = null;
    let bestOverlap = -1;
    backgrounds.forEach((candidate) => {
      const overlap = getOverlapFrames(track, candidate.track);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = candidate;
      }
    });
    assignments.set(index, best);
  });

  return {backgrounds, assignments};
};

const laneSorter = (left, right) => {
  const leftZ = left.style?.zIndex ?? 0;
  const rightZ = right.style?.zIndex ?? 0;
  if (leftZ !== rightZ) {
    return leftZ - rightZ;
  }
  return left.index - right.index;
};

const getTransformPosition = (style, composition) => {
  const centerX = (style.x ?? 0) + ((style.width ?? 0) / 2);
  const centerY = (style.y ?? 0) + ((style.height ?? 0) / 2);
  return {
    x: centerX - (composition.width / 2),
    y: centerY - (composition.height / 2),
  };
};

const buildLabelTrack = ({track, style, index}) => {
  if (!track.characterLabel) {
    return null;
  }

  const labelWidth = Math.max(180, Math.min(320, (style.width ?? 240) * 0.9));
  return {
    id: `${track.id}_label`,
    type: 'text',
    from: track.from,
    duration: track.duration,
    content: track.characterLabel,
    style: {
      x: (style.x ?? 0) + ((style.width ?? 0) / 2) - (labelWidth / 2),
      y: Math.min(1780, (style.y ?? 0) + (style.height ?? 0) + 16),
      width: labelWidth,
      maxWidth: labelWidth,
      fontFamily: 'PingFang SC',
      fontSize: 52,
      fontWeight: 900,
      lineHeight: 1.0,
      color: '#ffd426',
      textAlign: 'center',
      strokeColor: '#000000',
      strokeWidth: 8,
      zIndex: (style.zIndex ?? 20) + 10,
    },
    animation: track.animation,
    generatedFrom: track.id,
    generatedIndex: index,
  };
};

const xmlTag = (name, attrs = {}, children = []) => {
  const attrText = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('');

  if (!children.length) {
    return `<${name}${attrText}/>`;
  }

  return `<${name}${attrText}>${children.join('')}</${name}>`;
};

const buildTextStyleDef = (style, styleId) => {
  const attrs = {
    font: style.fontFamily ?? 'PingFang SC',
    fontSize: style.fontSize ?? 60,
    fontFace: fontFaceFromWeight(style.fontWeight ?? 700),
    fontColor: parseColor(style.color ?? '#ffffff', '1 1 1 1'),
    alignment: style.textAlign ?? 'left',
    strokeColor: parseColor(style.strokeColor ?? '#000000', '0 0 0 1'),
    strokeWidth: style.strokeWidth ?? 0,
  };

  return xmlTag('text-style-def', {id: styleId}, [
    xmlTag('text-style', attrs),
  ]);
};

const buildTitleXml = ({titleId, effectId, offsetFrames, durationFrames, content, style, composition, lane}) => {
  const width = style.width ?? style.maxWidth ?? Math.min(composition.width - ((style.x ?? 0) * 2), composition.width * 0.8);
  const height = style.height ?? ((style.fontSize ?? 60) * 1.4);
  const position = getTransformPosition({...style, width, height}, composition);
  const styleId = `${titleId}_style`;
  const children = [
    xmlTag('text', {}, [
      xmlTag('text-style', {ref: styleId}, [escapeXml(content)]),
    ]),
    buildTextStyleDef(style, styleId),
    xmlTag('adjust-transform', {
      position: `${position.x.toFixed(2)} ${position.y.toFixed(2)}`,
      anchor: '0 0',
      scale: '1 1',
    }),
  ];

  return xmlTag('title', {
    ref: effectId,
    lane,
    offset: frameToFcpxTime(offsetFrames, composition.fps),
    start: '0s',
    duration: frameToFcpxTime(durationFrames, composition.fps),
    name: content.slice(0, 24),
    role: 'title',
  }, children);
};

const buildAssetClipXml = ({
  resourceId,
  offsetFrames,
  durationFrames,
  style,
  composition,
  lane,
  mediaInfo,
  name,
  startFrames = 0,
  fit = 'contain',
  audioRole,
  extraChildren = [],
}) => {
  const children = [];

  if (mediaInfo?.hasVideo || mediaInfo?.kind === 'image') {
    if (fit === 'cover') {
      children.push(xmlTag('adjust-conform', {type: 'fill'}));
      children.push(xmlTag('adjust-transform', {
        position: '0 0',
        scale: '1 1',
        anchor: '0 0',
      }));
    } else {
      const sourceWidth = mediaInfo?.width || style.width || composition.width;
      const sourceHeight = mediaInfo?.height || style.height || composition.height;
      const width = style.width ?? sourceWidth;
      const height = style.height ?? sourceHeight;
      const position = getTransformPosition({x: style.x ?? 0, y: style.y ?? 0, width, height}, composition);
      const scaleX = width / sourceWidth;
      const scaleY = height / sourceHeight;
      children.push(xmlTag('adjust-conform', {type: 'none'}));
      children.push(xmlTag('adjust-transform', {
        position: `${position.x.toFixed(2)} ${position.y.toFixed(2)}`,
        scale: `${scaleX.toFixed(4)} ${scaleY.toFixed(4)}`,
        anchor: '0 0',
      }));
    }
  }

  if (audioRole) {
    children.push(xmlTag('adjust-volume', {amount: audioRole}));
  }

  children.push(...extraChildren);

  return xmlTag('asset-clip', {
    ref: resourceId,
    lane,
    offset: frameToFcpxTime(offsetFrames, composition.fps),
    name,
    start: frameToFcpxTime(startFrames, composition.fps),
    duration: frameToFcpxTime(durationFrames, composition.fps),
  }, children);
};

const buildAudioXml = ({resourceId, offsetFrames, durationFrames, composition, lane, track, name}) => xmlTag('audio', {
  ref: resourceId,
  lane,
  offset: frameToFcpxTime(offsetFrames, composition.fps),
  start: frameToFcpxTime(track.trimStart ?? 0, composition.fps),
  duration: frameToFcpxTime(durationFrames, composition.fps),
  name,
  role: 'dialogue.music',
}, [
  xmlTag('adjust-volume', {amount: toDb(track.volume ?? 1)}),
]);

const main = async () => {
  const {inputPath, outputArg} = parseArgs();
  const data = await readJson(inputPath);
  const composition = data.composition ?? {fps: 30, width: 1080, height: 1920, durationInFrames: 300};
  const tracks = data.tracks ?? [];
  const characterGroups = buildCharacterGroups(tracks);
  const styles = tracks.map((track, index) => resolveTrackStyle({composition, track, allTracks: tracks, trackIndex: index, characterGroups}));
  const assets = await getAssetMap(data);
  const assetByRelativePath = new Map(assets.map((asset) => [asset.relativePath, asset]));
  const {sequenceFormat, formats} = buildFormatRegistry(composition, assets);

  let resourceIndex = 1;
  const effectId = `r_effect_${resourceIndex += 1}`;
  const assetResourceByPath = new Map();
  assets.forEach((asset) => {
    assetResourceByPath.set(asset.relativePath, `r_asset_${resourceIndex += 1}`);
  });

  const resourceNodes = [];
  formats.forEach((format) => {
    resourceNodes.push(xmlTag('format', {
      id: format.id,
      name: format.name,
      frameDuration: format.frameDuration,
      width: format.width,
      height: format.height,
      colorSpace: '1-1-1 (Rec. 709)',
    }));
  });

  resourceNodes.push(xmlTag('effect', {
    id: effectId,
    name: 'Basic Title',
    uid: '.../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti',
  }));

  assets.forEach((asset) => {
    const resourceId = assetResourceByPath.get(asset.relativePath);
    const attrs = {
      id: resourceId,
      name: path.basename(asset.relativePath),
      src: pathToFileURL(asset.absolutePath).href,
      start: '0s',
    };

    if (asset.format) {
      attrs.format = asset.format.id;
      attrs.hasVideo = '1';
    }
    if (asset.mediaInfo.hasAudio) {
      attrs.hasAudio = '1';
      if (asset.mediaInfo.audioChannels) {
        attrs.audioChannels = asset.mediaInfo.audioChannels;
      }
      if (asset.mediaInfo.audioRate) {
        attrs.audioRate = asset.mediaInfo.audioRate;
      }
    }
    if (asset.mediaInfo.duration) {
      attrs.duration = secondsToFcpxTime(asset.mediaInfo.duration);
    }

    resourceNodes.push(xmlTag('asset', attrs));
  });

  const {backgrounds, assignments} = getTrackAssignments(tracks);
  const backgroundNodes = [];

  backgrounds.forEach(({track, index}) => {
    const bgPath = resolveAssetPath(data, track);
    const bgAsset = assetByRelativePath.get(bgPath);
    if (!bgAsset) {
      return;
    }

    const bgStyle = styles[index];
    const connected = [];
    const childVisuals = [];
    const childAudios = [];

    tracks.forEach((item, itemIndex) => {
      if (itemIndex === index) {
        return;
      }
      const assigned = assignments.get(itemIndex);
      if (!assigned || assigned.index !== index) {
        return;
      }

      const localOffset = Math.max(0, (item.from ?? 0) - (track.from ?? 0));
      const itemStyle = styles[itemIndex];

      if (item.type === 'audio') {
        childAudios.push({track: item, index: itemIndex, style: itemStyle, localOffset});
        return;
      }

      childVisuals.push({track: item, index: itemIndex, style: itemStyle, localOffset});

      if (item.type === 'video' && item.characterLabel) {
        const labelTrack = buildLabelTrack({track: item, style: itemStyle, index: itemIndex});
        if (labelTrack) {
          childVisuals.push({track: labelTrack, index: itemIndex + 1000, style: labelTrack.style, localOffset});
        }
      }
    });

    childVisuals.sort(laneSorter);
    childVisuals.forEach((item, position) => {
      const lane = position + 1;
      if (item.track.type === 'text') {
        connected.push(buildTitleXml({
          titleId: item.track.id,
          effectId,
          offsetFrames: item.localOffset,
          durationFrames: item.track.duration ?? 1,
          content: item.track.content ?? '',
          style: item.style,
          composition,
          lane,
        }));
        return;
      }

      const relativePath = resolveAssetPath(data, item.track);
      const asset = assetByRelativePath.get(relativePath);
      if (!asset) {
        return;
      }

      connected.push(buildAssetClipXml({
        resourceId: assetResourceByPath.get(relativePath),
        offsetFrames: item.localOffset,
        durationFrames: item.track.duration ?? 1,
        style: item.style,
        composition,
        lane,
        mediaInfo: asset.mediaInfo,
        name: item.track.id,
        startFrames: item.track.trimStart ?? 0,
        fit: item.style.fit ?? 'contain',
      }));
    });

    childAudios.forEach((item, position) => {
      const relativePath = resolveAssetPath(data, item.track);
      const asset = assetByRelativePath.get(relativePath);
      if (!asset) {
        return;
      }

      connected.push(buildAudioXml({
        resourceId: assetResourceByPath.get(relativePath),
        offsetFrames: item.localOffset,
        durationFrames: item.track.duration ?? 1,
        composition,
        lane: -(position + 1),
        track: item.track,
        name: item.track.id,
      }));
    });

    backgroundNodes.push(buildAssetClipXml({
      resourceId: assetResourceByPath.get(bgPath),
      offsetFrames: track.from ?? 0,
      durationFrames: track.duration ?? 1,
      style: bgStyle,
      composition,
      lane: undefined,
      mediaInfo: bgAsset.mediaInfo,
      name: track.id,
      startFrames: track.trimStart ?? 0,
      fit: bgStyle.fit ?? 'cover',
      extraChildren: connected,
    }));
  });

  const sequenceNode = xmlTag('sequence', {
    format: sequenceFormat.id,
    duration: frameToFcpxTime(composition.durationInFrames ?? 300, composition.fps ?? 30),
    tcStart: '0s',
    tcFormat: 'NDF',
    audioLayout: 'stereo',
    audioRate: '48k',
  }, [xmlTag('spine', {}, backgroundNodes)]);

  const projectName = data.meta?.title ?? data.name ?? 'Codex Export';
  const fcpxml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE fcpxml>',
    xmlTag('fcpxml', {version: '1.7'}, [
      xmlTag('resources', {}, resourceNodes),
      xmlTag('library', {}, [
        xmlTag('event', {name: `${projectName} Event`}, [
          xmlTag('project', {name: projectName}, [sequenceNode]),
        ]),
      ]),
    ]),
  ].join('');

  const defaultOutputName = `${path.basename((data.render?.output ?? 'out/project.mp4'), path.extname(data.render?.output ?? 'project.mp4'))}.fcpxml`;
  const outputPath = path.resolve(projectRoot, outputArg ?? path.join('out', defaultOutputName));
  await fs.mkdir(path.dirname(outputPath), {recursive: true});
  await fs.writeFile(outputPath, fcpxml, 'utf8');

  console.log(outputPath);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
