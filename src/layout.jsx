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

  return {
    width,
    height,
    ratio: width / height,
  };
};

const hasManualBox = (style = {}) => {
  return ['x', 'y', 'width', 'height'].every((key) => typeof style[key] === 'number');
};

const hasManualTextPosition = (style = {}) => {
  return typeof style.x === 'number' && typeof style.y === 'number';
};

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

export const buildCharacterGroups = (tracks) => {
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

const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

const getDefaultBackgroundStyle = (composition) => {
  return {
    x: 0,
    y: 0,
    width: composition.width,
    height: composition.height,
    fit: 'cover',
    opacity: 1,
    zIndex: 0,
  };
};

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

const getFrameEnd = (track) => {
  return (track.from ?? 0) + (track.duration ?? 1);
};

const getOverlapFrames = (left, right) => {
  const start = Math.max(left.from ?? 0, right.from ?? 0);
  const end = Math.min(getFrameEnd(left), getFrameEnd(right));
  return Math.max(0, end - start);
};

const getBackgroundTracks = (tracks) => {
  return tracks.filter((item) => getTrackLayoutKind(item) === 'background');
};

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

const resolveCharacterZone = ({
  backgroundTrack,
  slotCount,
  slotIndex,
}) => {
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

const getCharacterStyle = ({
  composition,
  track,
  group,
  indexInGroup,
  backgroundTrack,
}) => {
  const slotCount = clamp(track.layout?.slotCount ?? group.length, 1, 4);
  const slotIndex = clamp(track.layout?.slotIndex ?? indexInGroup, 0, slotCount - 1);
  const centers = getSlotCenters(slotCount);
  const parsed = parseAspectRatio(track.layout?.aspectRatio ?? track.aspectRatio);
  const ratio = parsed?.ratio ?? 0.9;
  const zone = resolveCharacterZone({
    backgroundTrack,
    slotCount,
    slotIndex,
  });

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
  let width = toPixels(
    zone?.width ?? zone?.widthRatio,
    composition.width,
    baseWidthByCount[slotCount] ?? composition.width * 0.22,
  );
  let baseline = toPixels(
    zone?.baselineY,
    composition.height,
    composition.height * 0.79,
  );
  const centerX = toPixels(zone?.centerX, composition.width, defaultCenterX);

  if (ratio <= 0.75) {
    width *= 0.88;
    baseline -= composition.height * 0.025;
  } else if (ratio >= 1.2) {
    width *= 1.16;
    baseline += composition.height * 0.015;
  }

  let height = width / ratio;
  const maxHeight = toPixels(
    zone?.maxHeight ?? zone?.maxHeightRatio,
    composition.height,
    maxHeightByCount[slotCount] ?? composition.height * 0.36,
  );
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

const estimateTextBlockHeight = ({
  content,
  width,
  fontSize,
  lineHeight,
}) => {
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

const getSpeakerBoundTextStyle = ({
  composition,
  track,
  allTracks,
  characterGroups,
}) => {
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

export const resolveTrackStyle = ({
  composition,
  track,
  allTracks,
  trackIndex,
  characterGroups,
}) => {
  const style = track.style ?? {};
  if (hasManualBox(style)) {
    return style;
  }

  const layoutKind = getTrackLayoutKind(track);
  if (layoutKind === 'background') {
    return {
      ...getDefaultBackgroundStyle(composition),
      ...style,
    };
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
      ? getSpeakerBoundTextStyle({
        composition,
        track,
        allTracks,
        characterGroups,
      })
      : null;

    return {
      zIndex: 100,
      ...(speakerBoundStyle ?? {}),
      ...style,
    };
  }

  return style;
};
