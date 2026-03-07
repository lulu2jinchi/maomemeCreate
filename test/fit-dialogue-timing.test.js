const test = require('node:test');
const assert = require('node:assert/strict');

const {
  countReadableCharacters,
  getAutoSubtitleDuration,
  rebalanceDialogueTiming,
} = require('../scripts/fit-dialogue-timing');

test('auto subtitle duration grows with readable character count', () => {
  const shortFrames = getAutoSubtitleDuration('别急。', 40);
  const longFrames = getAutoSubtitleDuration('这事不能这么算，我们得把合同和工资一起算清楚。', 40);

  assert.ok(countReadableCharacters('别急。') < countReadableCharacters('这事不能这么算，我们得把合同和工资一起算清楚。'));
  assert.ok(longFrames > shortFrames);
  assert.ok(shortFrames >= 72);
});

test('rebalanceDialogueTiming stretches dense dialogue scenes and shifts later scenes', () => {
  const track = {
    composition: {
      durationInFrames: 240,
    },
    meta: {
      notes: '原始时间轴',
    },
    tracks: [
      {id: 'bg_block_1', type: 'image', from: 0, duration: 120, layout: {kind: 'background'}},
      {id: 'scene_1_a', type: 'video', from: 0, duration: 120},
      {id: 'scene_1_b', type: 'video', from: 0, duration: 120},
      {id: 'title_scene_1', type: 'text', from: 8, duration: 60, content: '第一幕'},
      {id: 'subtitle_scene_1_a', type: 'text', from: 24, duration: 30, content: '你也被坑过？'},
      {id: 'subtitle_scene_1_b', type: 'text', from: 46, duration: 30, content: '那我们抱团，把账一笔一笔算清楚。'},
      {id: 'subtitle_scene_1_c', type: 'text', from: 70, duration: 24, content: '行，今天就拉群。'},
      {id: 'bg_block_2', type: 'image', from: 120, duration: 120, layout: {kind: 'background'}},
      {id: 'scene_2_a', type: 'video', from: 120, duration: 120},
      {id: 'title_scene_2', type: 'text', from: 128, duration: 60, content: '第二幕'},
      {id: 'subtitle_scene_2_a', type: 'text', from: 150, duration: 36, content: '我们开干。'},
    ],
  };

  rebalanceDialogueTiming(track);

  const scene1SubtitleA = track.tracks.find((item) => item.id === 'subtitle_scene_1_a');
  const scene1SubtitleB = track.tracks.find((item) => item.id === 'subtitle_scene_1_b');
  const scene1SubtitleC = track.tracks.find((item) => item.id === 'subtitle_scene_1_c');
  const scene2Video = track.tracks.find((item) => item.id === 'scene_2_a');
  const bg2 = track.tracks.find((item) => item.id === 'bg_block_2');

  assert.ok(scene1SubtitleA.duration >= 72);
  assert.ok(scene1SubtitleB.duration > scene1SubtitleA.duration);
  assert.ok(scene1SubtitleC.from >= scene1SubtitleB.from + scene1SubtitleB.duration - 10);
  assert.ok(scene2Video.from > 120);
  assert.equal(bg2.from, scene2Video.from);
  assert.equal(track.composition.durationInFrames, Math.max(...track.tracks.map((item) => item.from + item.duration)));
  assert.match(track.meta.notes, /按字数自动延长/);
});
