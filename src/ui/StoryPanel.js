import { COLORS } from './Panel.js';
import { SAGAS, EPISODES, DISCOVERIES, SIDE_QUESTS } from '../story/storyData.js';

// The Story tab of the in-game menu: your journal. Where you are in the
// story, every episode, scenes to watch again, side quests and discoveries.
const SUBTABS = [['episodes', 'Episodes'], ['scenes', 'Watch Again'], ['side', 'Side Quests'], ['lore', 'Discoveries']];

export function drawStory(ui, a, menu) {
  const g = menu.game;
  const st = g.story;
  const s = st.s;
  const inTraining = g.state === 'training';
  if (!menu.storyTab) menu.storyTab = 'episodes';
  let y = a.y;

  // Where you are + the main buttons.
  const ep = st.ep;
  const now = !s.started ? 'Your story has not started yet.' : ep?.playable ? `Now: Episode ${ep.n} · ${ep.title}` : 'You finished every episode so far!';
  ui.text(now, a.x, y + 34, { size: 34, color: COLORS.gold, maxWidth: a.w - 520 });
  const info = st.trackerInfo();
  const sub = st.on ? (info ? `Goal: ${info.text}` : 'The story is playing') : s.started ? 'The story is paused while you train freely.' : 'Press Start Story to begin!';
  ui.text(sub, a.x, y + 74, { size: 26, color: COLORS.muted, weight: 'normal', maxWidth: a.w - 520 });
  const bx = a.x + a.w - 500;
  if (st.on) {
    ui.button('st-pause', 'Free Training', bx, y, 240, 90, { size: 30, sub: 'Story waits', enabled: inTraining, onClick: () => { g.closeGameMenu(); st.pause(); } });
    ui.button('st-restart', 'Restart Episode', bx + 260, y, 240, 90, { size: 28, sub: 'From the start', enabled: inTraining, onClick: () => { g.closeGameMenu(); st.restartEpisode(); } });
  } else {
    ui.button('st-play', s.started ? 'Continue Story' : 'Start Story', bx, y, 500, 90, { size: 38, color: '#b4560f', sub: st.summary(), enabled: inTraining && (ep?.playable ?? false), onClick: () => st.play() });
  }
  y += 112;

  const tw = (a.w - 3 * 12) / 4;
  SUBTABS.forEach(([id, label], i) => ui.button(`st-tab-${id}`, label, a.x + i * (tw + 12), y, tw, 66, {
    size: 28, selected: menu.storyTab === id, onClick: () => { menu.storyTab = id; },
  }));
  y += 84;
  const area = { x: a.x, y, w: a.w, h: a.y + a.h - y };
  ({ episodes: drawEpisodes, scenes: drawScenes, side: drawSide, lore: drawLore })[menu.storyTab](ui, area, g, inTraining);
}

function drawEpisodes(ui, a, g, inTraining) {
  const st = g.story;
  const s = st.s;
  let y = a.y;
  for (const saga of SAGAS) {
    const playable = saga.episodes.some((id) => EPISODES[id].playable);
    if (!playable) {
      ui.text(`${saga.label}: ${saga.title}`, a.x, y + 30, { size: 26, color: '#7b84a8' });
      ui.text('Coming soon', a.x + a.w, y + 30, { size: 24, color: '#7b84a8', align: 'right', weight: 'normal' });
      y += 38;
      continue;
    }
    ui.text(`${saga.label}: ${saga.title}`, a.x, y + 30, { size: 28, color: COLORS.gold });
    y += 42;
    for (const id of saga.episodes) {
      const e = EPISODES[id];
      const done = s.completed.includes(id);
      const current = s.started && s.episode === id && !done;
      const mark = done ? '✓' : current ? '▶' : '○';
      const color = done ? COLORS.green : current ? COLORS.gold : COLORS.muted;
      ui.text(`${mark}  Episode ${e.n}: ${e.title}`, a.x + 20, y + 34, { size: 28, color, maxWidth: a.w - 300 });
      if (done) {
        ui.button(`st-ep-${id}`, 'Play Again', a.x + a.w - 230, y + 2, 230, 48, { size: 24, enabled: inTraining, onClick: () => st.play(id) });
      } else if (current) {
        ui.text('You are here', a.x + a.w, y + 34, { size: 24, color: COLORS.gold, align: 'right', weight: 'normal' });
      }
      y += 54;
    }
    y += 6;
  }
}

function drawScenes(ui, a, g, inTraining) {
  const list = g.story.sceneList();
  if (!list.length) {
    ui.wrap('Story scenes you have watched show up here, so you can watch them again any time.', a.x, a.y + 40, a.w, { size: 28 });
    return;
  }
  const colW = (a.w - 20) / 2;
  const rowH = Math.min(70, a.h / Math.ceil(list.length / 2));
  list.forEach((sc, i) => {
    const x = a.x + (i % 2) * (colW + 20);
    const y = a.y + Math.floor(i / 2) * rowH;
    ui.button(`st-sc-${sc.id}`, sc.title, x, y, colW, rowH - 10, { size: 26, sub: `Episode ${sc.ep}`, enabled: inTraining, onClick: () => g.story.replayScene(sc.id) });
  });
}

function drawSide(ui, a, g, inTraining) {
  const st = g.story;
  let y = a.y;
  for (const [id, q] of Object.entries(SIDE_QUESTS)) {
    const open = st.sideAvailable(id);
    const qs = st.sideState(id);
    ui.text(q.title, a.x, y + 34, { size: 32, color: open ? COLORS.gold : '#7b84a8' });
    const why = open ? q.intro : `Finish Episode ${EPISODES[q.unlockAfter].n} to unlock this quest.`;
    const ny = ui.wrap(why, a.x, y + 70, a.w - 300, { size: 24 });
    if (open) ui.text(`Goal: ${q.text}  ·  Reward: +${q.reward.xp} XP to every stat`, a.x, ny + 8, { size: 24, color: COLORS.text, weight: 'normal', maxWidth: a.w - 300 });
    const bx = a.x + a.w - 270;
    if (!open) ui.text('Locked', a.x + a.w, y + 34, { size: 26, color: '#7b84a8', align: 'right' });
    else if (qs?.stage === 'done') ui.text('✓ Done', a.x + a.w, y + 34, { size: 30, color: COLORS.green, align: 'right' });
    else if (qs?.stage === 'active') {
      ui.bar(bx, y + 14, 270, 34, Math.min(1, qs.n / qs.total), '#ffcc33', { label: `${Math.floor(qs.n)} / ${qs.total}` });
      ui.button(`st-side-${id}`, 'Go!', bx, y + 60, 270, 56, { size: 26, enabled: inTraining, onClick: () => st.startSide(id) });
    } else ui.button(`st-side-${id}`, 'Start Quest', bx, y + 10, 270, 76, { size: 30, color: '#b4560f', enabled: inTraining, onClick: () => st.startSide(id) });
    y = Math.max(ny + 40, y + 130);
  }
}

function drawLore(ui, a, g) {
  const s = g.story.s;
  const ids = Object.keys(DISCOVERIES);
  const colW = (a.w - 20) / 2;
  const rowH = a.h / Math.ceil(ids.length / 2);
  ids.forEach((id, i) => {
    const x = a.x + (i % 2) * (colW + 20);
    const y = a.y + Math.floor(i / 2) * rowH;
    const found = s.discoveries.includes(id);
    const d = DISCOVERIES[id];
    ui.text(found ? d.title : '???', x, y + 28, { size: 28, color: found ? COLORS.gold : '#7b84a8' });
    ui.wrap(found ? d.text : 'Keep playing the story to discover this.', x, y + 58, colW, { size: 21, lineHeight: 1.2 });
  });
}
