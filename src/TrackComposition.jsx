import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from 'remotion';
import {buildCharacterGroups, resolveTrackStyle} from './layout.jsx';

const normalizeAssetPath = (assetPath) => {
  if (!assetPath) {
    return null;
  }
  return assetPath.replace(/\\/g, '/').replace(/^\.\//, '');
};

const isTransparentVideo = (assetPath) => {
  if (!assetPath) {
    return false;
  }

  return /\.(mov|webm)$/i.test(assetPath);
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

const toLayerStyle = (style = {}) => ({
  position: 'absolute',
  left: style.x ?? 0,
  top: style.y ?? 0,
  width: style.width ?? '100%',
  height: style.height ?? '100%',
  objectFit: style.fit ?? 'cover',
  opacity: style.opacity ?? 1,
  zIndex: style.zIndex ?? 1,
});

const toTextStyle = (style = {}) => {
  const textStyle = {
    position: 'absolute',
    left: style.x ?? 0,
    top: style.y ?? 0,
    maxWidth: style.maxWidth,
    width: style.width,
    height: style.height,
    fontFamily: style.fontFamily ?? 'sans-serif',
    fontSize: style.fontSize ?? 48,
    fontWeight: style.fontWeight ?? 700,
    lineHeight: style.lineHeight ?? 1.25,
    color: style.color ?? '#fff',
    textAlign: style.textAlign ?? 'left',
    letterSpacing: style.letterSpacing,
    textShadow: style.textShadow,
    backgroundColor: style.backgroundColor,
    padding: style.padding,
    borderRadius: style.borderRadius,
    opacity: style.opacity ?? 1,
    whiteSpace: 'pre-wrap',
    zIndex: style.zIndex ?? 100,
  };

  return textStyle;
};

const getOutlineShadow = (strokeWidth = 0, strokeColor = '#000000') => {
  const width = Math.max(0, Math.round(strokeWidth));
  if (width === 0) {
    return undefined;
  }

  const shadows = [];
  for (let x = -width; x <= width; x += 1) {
    for (let y = -width; y <= width; y += 1) {
      if (x === 0 && y === 0) {
        continue;
      }

      const distance = Math.sqrt((x * x) + (y * y));
      if (distance <= width + 0.25) {
        shadows.push(`${x}px ${y}px 0 ${strokeColor}`);
      }
    }
  }

  return shadows.join(', ');
};

const OutlinedText = ({text, style, animation, frame, fps, durationInFrames}) => {
  const outlineShadow = getOutlineShadow(style.strokeWidth ?? 0, style.strokeColor ?? '#000000');
  const animatedStyle = getAnimationStyle(animation, frame, fps, durationInFrames);
  const baseStyle = toTextStyle(style);
  const fillStyle = {
    ...baseStyle,
    color: style.color ?? '#ffffff',
    textShadow: style.textShadow,
  };
  const outlineStyle = {
    ...baseStyle,
    color: style.strokeColor ?? '#000000',
    textShadow: outlineShadow,
  };

  return (
    <>
      <div
        style={{
          ...outlineStyle,
          ...animatedStyle,
        }}
      >
        {text}
      </div>
      <div
        style={{
          ...fillStyle,
          ...animatedStyle,
        }}
      >
        {text}
      </div>
    </>
  );
};

const getAnimationStyle = (animation, frame, fps, durationInFrames) => {
  if (!animation) {
    return {};
  }

  const enter = animation.enter;
  const exit = animation.exit;

  let opacity = 1;
  let translateY = 0;
  let scale = 1;

  if (enter === 'fadeIn') {
    opacity *= interpolate(frame, [0, Math.min(12, durationInFrames)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  if (enter === 'slideUp') {
    const p = spring({
      frame,
      fps,
      config: {damping: 18, stiffness: 120, mass: 0.8},
      durationInFrames: Math.min(18, durationInFrames),
    });
    translateY += interpolate(p, [0, 1], [30, 0]);
    opacity *= interpolate(frame, [0, Math.min(10, durationInFrames)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  if (enter === 'popIn') {
    const p = spring({
      frame,
      fps,
      config: {damping: 15, stiffness: 180, mass: 0.6},
      durationInFrames: Math.min(16, durationInFrames),
    });
    scale *= interpolate(p, [0, 1], [0.85, 1]);
    opacity *= interpolate(frame, [0, Math.min(8, durationInFrames)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  if (exit === 'fadeOut') {
    const outStart = Math.max(0, durationInFrames - 14);
    opacity *= interpolate(frame, [outStart, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  return {
    opacity,
    transform: `translateY(${translateY}px) scale(${scale})`,
  };
};

const TrackVideo = ({track, data}) => {
  const {fps} = useVideoConfig();
  const frame = useCurrentFrame();
  const srcPath = resolveAssetPath(data, track);

  if (!srcPath) {
    return null;
  }

  const trimStart = track.trimStart ?? 0;
  const trimEnd = track.trimEnd ?? 0;
  const endAt = trimEnd > 0 ? trimStart + Math.max(1, (track.duration ?? 1) - trimEnd) : undefined;

  return (
    <OffthreadVideo
      src={staticFile(srcPath)}
      style={{
        ...toLayerStyle(track.resolvedStyle ?? track.style),
        ...getAnimationStyle(track.animation, frame, fps, track.duration ?? 1),
      }}
      startFrom={trimStart}
      endAt={endAt}
      volume={track.volume ?? 1}
      muted={track.muted ?? false}
      transparent={track.transparent ?? isTransparentVideo(srcPath)}
    />
  );
};

const TrackRoleLabel = ({track}) => {
  const {fps, height} = useVideoConfig();
  const frame = useCurrentFrame();
  const box = track.resolvedStyle ?? track.style ?? {};
  const label = track.characterLabel;

  if (!label) {
    return null;
  }

  const labelStyle = track.characterLabelStyle ?? {};
  const labelWidth = Math.max(box.width ?? 220, labelStyle.width ?? 180);
  const left = (box.x ?? 0) + ((box.width ?? labelWidth) - labelWidth) / 2;
  const top = Math.min(
    Math.max((box.y ?? 0) + (box.height ?? 0) + 12, labelStyle.minTop ?? 980),
    labelStyle.maxTop ?? height - 180,
  );

  return (
    <OutlinedText
      text={label}
      style={{
        x: left,
        y: top,
        width: labelWidth,
        fontFamily: labelStyle.fontFamily ?? 'PingFang SC',
        fontSize: labelStyle.fontSize ?? 46,
        fontWeight: labelStyle.fontWeight ?? 900,
        lineHeight: labelStyle.lineHeight ?? 1,
        color: labelStyle.color ?? '#ffd426',
        textAlign: 'center',
        strokeColor: labelStyle.strokeColor ?? '#000000',
        strokeWidth: labelStyle.strokeWidth ?? 7,
        textShadow: labelStyle.textShadow ?? '0 2px 6px rgba(0, 0, 0, 0.3)',
        zIndex: (box.zIndex ?? 20) + 5,
      }}
      animation={track.animation}
      frame={frame}
      fps={fps}
      durationInFrames={track.duration ?? 1}
    />
  );
};

const TrackImage = ({track, data}) => {
  const {fps} = useVideoConfig();
  const frame = useCurrentFrame();
  const srcPath = resolveAssetPath(data, track);

  if (!srcPath) {
    return null;
  }

  return (
    <Img
      src={staticFile(srcPath)}
      style={{
        ...toLayerStyle(track.resolvedStyle ?? track.style),
        ...getAnimationStyle(track.animation, frame, fps, track.duration ?? 1),
      }}
    />
  );
};

const TrackAudio = ({track, data}) => {
  const frame = useCurrentFrame();
  const srcPath = resolveAssetPath(data, track);

  if (!srcPath) {
    return null;
  }

  const trimStart = track.trimStart ?? 0;
  const trimEnd = track.trimEnd ?? 0;
  const duration = track.duration ?? 1;
  const endAt = trimEnd > 0 ? trimStart + Math.max(1, duration - trimEnd) : undefined;

  const volume = () => {
    let value = track.volume ?? 1;

    if (track.fadeInFrames && track.fadeInFrames > 0) {
      value *= interpolate(frame, [0, track.fadeInFrames], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }

    if (track.fadeOutFrames && track.fadeOutFrames > 0) {
      const fadeOutStart = Math.max(0, duration - track.fadeOutFrames);
      value *= interpolate(frame, [fadeOutStart, duration], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }

    return value;
  };

  return (
    <Audio
      src={staticFile(srcPath)}
      startFrom={trimStart}
      endAt={endAt}
      volume={volume}
    />
  );
};

const TrackText = ({track}) => {
  const {fps} = useVideoConfig();
  const frame = useCurrentFrame();
  const style = track.resolvedStyle ?? track.style;

  return (
    <OutlinedText
      text={track.content ?? ''}
      style={style}
      animation={track.animation}
      frame={frame}
      fps={fps}
      durationInFrames={track.duration ?? 1}
    />
  );
};

export const TrackComposition = ({data}) => {
  const tracks = data?.tracks ?? [];
  const composition = data?.composition ?? {};
  const characterGroups = buildCharacterGroups(tracks);
  const resolvedTracks = tracks
    .map((track, index) => ({
      ...track,
      resolvedStyle: resolveTrackStyle({
        composition,
        track,
        allTracks: tracks,
        trackIndex: index,
        characterGroups,
      }),
      _index: index,
    }))
    .sort((left, right) => {
      const leftZ = left.resolvedStyle?.zIndex ?? 0;
      const rightZ = right.resolvedStyle?.zIndex ?? 0;
      if (leftZ !== rightZ) {
        return leftZ - rightZ;
      }

      return left._index - right._index;
    });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: data?.composition?.backgroundColor ?? '#000',
      }}
    >
      {resolvedTracks.map((track, index) => {
        const from = Math.max(0, track.from ?? 0);
        const duration = Math.max(1, track.duration ?? 1);

        return (
          <Sequence key={track.id ?? `${track.type}-${index}`} from={from} durationInFrames={duration}>
            {track.type === 'image' ? <TrackImage track={track} data={data} /> : null}
            {track.type === 'video' ? <TrackVideo track={track} data={data} /> : null}
            {track.type === 'video' ? <TrackRoleLabel track={track} /> : null}
            {track.type === 'audio' ? <TrackAudio track={track} data={data} /> : null}
            {track.type === 'text' ? <TrackText track={track} /> : null}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
