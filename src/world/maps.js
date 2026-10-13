// Map registry (collision layouts only; pure logic). Visuals are paired up in game/Game.js.
import { buildForestLayout, MAP_NAME as FOREST_NAME } from './forestLayout.js';
import { buildWhiteRoomLayout, WHITEROOM_NAME } from './whiteroomLayout.js';

export const MAPS = {
  forest: { label: FOREST_NAME, build: () => buildForestLayout() },
  whiteroom: { label: WHITEROOM_NAME, build: () => buildWhiteRoomLayout() },
};
export const MAP_ORDER = ['forest', 'whiteroom'];
