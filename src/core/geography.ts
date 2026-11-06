// 二十六區域（本朝十七、境外九）、驛程、鄰接路網、輿圖幾何（經緯度投影；本朝以 Voronoi 切分疆域輪廓，境外為手繪多邊形）。

import type { GameState, RegionId } from './types';

export type RegionKind = 'capital' | 'border' | 'province' | 'outer';
export type Terrain = 'plain' | 'mountain' | 'coast' | 'steppe' | 'sea';

export interface RegionInfo {
  id: RegionId;
  name: string;
  kind: RegionKind;
  /** 京師至此驛路日數 */
  days: number;
  /** 首府經緯度（Voronoi 種子） */
  site: [number, number];
  /** 每旬應解錢糧（萬兩） */
  tax: number;
  /** 每旬漕糧（萬石） */
  grain: number;
  /** 地方長官官銜 */
  gov: string;
  /** 常駐兵力 */
  garrison: number;
  /** 北上京師的路線（叛軍、流寇用） */
  toCapital: RegionId[];
  terrain: Terrain;
  /** 駐軍兵種 */
  gunit: string;
  /** 可募的精兵（無則只能募一般募兵） */
  elite?: string;
}

export const REGIONS: Record<RegionId, RegionInfo> = {
  jingshi: { id: 'jingshi', name: '京師', kind: 'capital', days: 0, site: [116.4, 39.6], tax: 2, grain: 0, gov: '順天府尹', garrison: 0, toCapital: [], terrain: 'plain', gunit: 'jingying', elite: 'huoqi' },
  jizhen: { id: 'jizhen', name: '薊鎮', kind: 'border', days: 4, site: [118.9, 40.4], tax: 0, grain: 0, gov: '薊鎮總兵', garrison: 30000, toCapital: ['jingshi'], terrain: 'plain', gunit: 'mubing' },
  xuanda: { id: 'xuanda', name: '宣大', kind: 'border', days: 6, site: [113.8, 40.6], tax: 0, grain: 0, gov: '宣大總兵', garrison: 40000, toCapital: ['jingshi'], terrain: 'steppe', gunit: 'mubing' },
  liaodong: { id: 'liaodong', name: '遼東', kind: 'border', days: 15, site: [122.8, 41.6], tax: 0, grain: 0, gov: '遼東總兵', garrison: 40000, toCapital: ['jizhen', 'jingshi'], terrain: 'plain', gunit: 'liao', elite: 'guanning' },
  gansu: { id: 'gansu', name: '甘肅', kind: 'border', days: 30, site: [102.0, 37.6], tax: 0, grain: 0, gov: '甘肅總兵', garrison: 35000, toCapital: ['shaanxi', 'shanxi', 'jingshi'], terrain: 'steppe', gunit: 'qin' },
  shanxi: { id: 'shanxi', name: '山西', kind: 'province', days: 8, site: [112.4, 37.6], tax: 3, grain: 0, gov: '山西巡撫', garrison: 6000, toCapital: ['jingshi'], terrain: 'mountain', gunit: 'weisuo' },
  shandong: { id: 'shandong', name: '山東', kind: 'province', days: 8, site: [117.8, 36.4], tax: 4, grain: 1, gov: '山東巡撫', garrison: 6000, toCapital: ['jingshi'], terrain: 'coast', gunit: 'weisuo' },
  henan: { id: 'henan', name: '河南', kind: 'province', days: 10, site: [113.8, 34.4], tax: 4, grain: 1, gov: '河南巡撫', garrison: 6000, toCapital: ['jingshi'], terrain: 'plain', gunit: 'weisuo' },
  shaanxi: { id: 'shaanxi', name: '陝西', kind: 'province', days: 20, site: [108.6, 35.0], tax: 2, grain: 0, gov: '陝西巡撫', garrison: 8000, toCapital: ['henan', 'jingshi'], terrain: 'mountain', gunit: 'weisuo', elite: 'qin' },
  sichuan: { id: 'sichuan', name: '四川', kind: 'province', days: 35, site: [104.0, 30.6], tax: 3, grain: 0, gov: '四川巡撫', garrison: 6000, toCapital: ['huguang', 'henan', 'jingshi'], terrain: 'mountain', gunit: 'weisuo', elite: 'baigan' },
  huguang: { id: 'huguang', name: '湖廣', kind: 'province', days: 22, site: [112.6, 29.8], tax: 4, grain: 2, gov: '湖廣巡撫', garrison: 6000, toCapital: ['henan', 'jingshi'], terrain: 'plain', gunit: 'weisuo' },
  jiangxi: { id: 'jiangxi', name: '江西', kind: 'province', days: 25, site: [115.8, 27.6], tax: 4, grain: 2, gov: '江西巡撫', garrison: 5000, toCapital: ['nanzhili', 'shandong', 'jingshi'], terrain: 'mountain', gunit: 'weisuo' },
  nanzhili: { id: 'nanzhili', name: '南直隸', kind: 'province', days: 18, site: [119.0, 32.4], tax: 9, grain: 4, gov: '應天巡撫', garrison: 10000, toCapital: ['shandong', 'jingshi'], terrain: 'coast', gunit: 'weisuo' },
  zhejiang: { id: 'zhejiang', name: '浙江', kind: 'province', days: 22, site: [120.0, 29.4], tax: 6, grain: 1, gov: '浙江巡撫', garrison: 6000, toCapital: ['nanzhili', 'shandong', 'jingshi'], terrain: 'coast', gunit: 'weisuo', elite: 'zhe' },
  fujian: { id: 'fujian', name: '福建', kind: 'province', days: 32, site: [118.2, 26.2], tax: 2, grain: 0, gov: '福建巡撫', garrison: 5000, toCapital: ['zhejiang', 'nanzhili', 'jingshi'], terrain: 'coast', gunit: 'weisuo', elite: 'shuishi' },
  liangguang: { id: 'liangguang', name: '兩廣', kind: 'province', days: 40, site: [111.0, 23.6], tax: 3, grain: 0, gov: '兩廣總督', garrison: 8000, toCapital: ['huguang', 'henan', 'jingshi'], terrain: 'coast', gunit: 'weisuo', elite: 'lang' },
  yungui: { id: 'yungui', name: '雲貴', kind: 'province', days: 55, site: [104.2, 25.6], tax: 1, grain: 0, gov: '雲貴總督', garrison: 8000, toCapital: ['sichuan', 'huguang', 'henan', 'jingshi'], terrain: 'mountain', gunit: 'lang', elite: 'lang' },
  // 境外
  monan: { id: 'monan', name: '漠南', kind: 'outer', days: 15, site: [112.5, 42.9], tax: 0, grain: 0, gov: '', garrison: 0, toCapital: ['xuanda', 'jingshi'], terrain: 'steppe', gunit: 'menggu' },
  mobei: { id: 'mobei', name: '漠北', kind: 'outer', days: 45, site: [106.5, 46.2], tax: 0, grain: 0, gov: '', garrison: 0, toCapital: ['monan', 'xuanda', 'jingshi'], terrain: 'steppe', gunit: 'menggu' },
  jianzhou: { id: 'jianzhou', name: '建州', kind: 'outer', days: 25, site: [126.4, 44.4], tax: 0, grain: 0, gov: '', garrison: 0, toCapital: ['liaodong', 'jizhen', 'jingshi'], terrain: 'mountain', gunit: 'baqi' },
  chaoxian: { id: 'chaoxian', name: '朝鮮', kind: 'outer', days: 35, site: [127.2, 38.4], tax: 0, grain: 0, gov: '', garrison: 0, toCapital: ['liaodong', 'jizhen', 'jingshi'], terrain: 'mountain', gunit: 'chaoxian' },
  donghai: { id: 'donghai', name: '東海', kind: 'outer', days: 30, site: [124.0, 31.0], tax: 0, grain: 0, gov: '', garrison: 0, toCapital: ['shandong', 'jingshi'], terrain: 'sea', gunit: 'haishang' },
  taiwan: { id: 'taiwan', name: '台灣', kind: 'outer', days: 42, site: [120.95, 23.75], tax: 0, grain: 0, gov: '', garrison: 0, toCapital: ['fujian', 'zhejiang', 'nanzhili', 'jingshi'], terrain: 'coast', gunit: 'hongmao' },
  annan: { id: 'annan', name: '安南', kind: 'outer', days: 55, site: [105.4, 19.6], tax: 0, grain: 0, gov: '', garrison: 0, toCapital: ['liangguang', 'huguang', 'henan', 'jingshi'], terrain: 'mountain', gunit: 'annan' },
  miandian: { id: 'miandian', name: '緬甸', kind: 'outer', days: 70, site: [96.8, 21.6], tax: 0, grain: 0, gov: '', garrison: 0, toCapital: ['yungui', 'sichuan', 'huguang', 'henan', 'jingshi'], terrain: 'mountain', gunit: 'mian' },
  hami: { id: 'hami', name: '哈密', kind: 'outer', days: 50, site: [94.6, 41.4], tax: 0, grain: 0, gov: '', garrison: 0, toCapital: ['gansu', 'shaanxi', 'shanxi', 'jingshi'], terrain: 'steppe', gunit: 'menggu' },
};

export const REGION_ORDER: RegionId[] = [
  'jingshi',
  'jizhen',
  'xuanda',
  'liaodong',
  'gansu',
  'shanxi',
  'shandong',
  'henan',
  'shaanxi',
  'sichuan',
  'huguang',
  'jiangxi',
  'nanzhili',
  'zhejiang',
  'fujian',
  'liangguang',
  'yungui',
];

export const OUTER: RegionId[] = ['monan', 'mobei', 'jianzhou', 'chaoxian', 'donghai', 'taiwan', 'annan', 'miandian', 'hami'];
export const ALL_REGIONS: RegionId[] = [...REGION_ORDER, ...OUTER];
export const BORDERS: RegionId[] = ['jizhen', 'xuanda', 'liaodong', 'gansu'];
export const PROVINCES: RegionId[] = REGION_ORDER.filter((r) => REGIONS[r].kind === 'province');
/** 北方（南遷後驛程、控制度變差） */
export const NORTH: RegionId[] = ['jingshi', 'jizhen', 'xuanda', 'liaodong', 'gansu', 'shanxi', 'shandong', 'henan', 'shaanxi'];

/** 鄰接（雙向）。台灣、東海須渡海 */
export const ADJ: Record<RegionId, RegionId[]> = {
  jingshi: ['jizhen', 'xuanda', 'shanxi', 'shandong', 'henan'],
  jizhen: ['jingshi', 'liaodong', 'xuanda', 'monan'],
  xuanda: ['jingshi', 'jizhen', 'shanxi', 'monan'],
  liaodong: ['jizhen', 'jianzhou', 'chaoxian', 'monan'],
  gansu: ['shaanxi', 'hami', 'mobei', 'sichuan'],
  shanxi: ['jingshi', 'xuanda', 'shaanxi', 'henan', 'monan'],
  shandong: ['jingshi', 'henan', 'nanzhili', 'donghai'],
  henan: ['jingshi', 'shanxi', 'shandong', 'shaanxi', 'huguang', 'nanzhili'],
  shaanxi: ['shanxi', 'henan', 'gansu', 'sichuan', 'huguang', 'monan'],
  sichuan: ['shaanxi', 'huguang', 'yungui', 'gansu'],
  huguang: ['henan', 'shaanxi', 'sichuan', 'jiangxi', 'nanzhili', 'liangguang', 'yungui'],
  jiangxi: ['huguang', 'nanzhili', 'zhejiang', 'fujian', 'liangguang'],
  nanzhili: ['shandong', 'henan', 'huguang', 'jiangxi', 'zhejiang', 'donghai'],
  zhejiang: ['nanzhili', 'jiangxi', 'fujian', 'donghai'],
  fujian: ['zhejiang', 'jiangxi', 'liangguang', 'taiwan', 'donghai'],
  liangguang: ['jiangxi', 'huguang', 'fujian', 'yungui', 'annan'],
  yungui: ['sichuan', 'huguang', 'liangguang', 'annan', 'miandian'],
  monan: ['jizhen', 'xuanda', 'shanxi', 'shaanxi', 'liaodong', 'mobei', 'jianzhou'],
  mobei: ['monan', 'gansu', 'hami'],
  jianzhou: ['liaodong', 'chaoxian', 'monan'],
  chaoxian: ['liaodong', 'jianzhou', 'donghai'],
  donghai: ['shandong', 'nanzhili', 'zhejiang', 'fujian', 'chaoxian', 'taiwan'],
  taiwan: ['fujian', 'donghai'],
  annan: ['liangguang', 'yungui'],
  miandian: ['yungui'],
  hami: ['gansu', 'mobei'],
};

export function isSea(a: RegionId, b: RegionId): boolean {
  return a === 'taiwan' || b === 'taiwan' || a === 'donghai' || b === 'donghai';
}

/** 相鄰兩地的路程（日），約以經緯度距離換算 */
export function edgeDays(a: RegionId, b: RegionId): number {
  const [x1, y1] = REGIONS[a].site;
  const [x2, y2] = REGIONS[b].site;
  return Math.max(6, Math.round(Math.hypot(x1 - x2, y1 - y2) * 2.6));
}

/** 相鄰兩地的行軍旬數（冬季北方 +1） */
export function edgeTurns(a: RegionId, b: RegionId, turn = 0): number {
  const winter = Math.floor((((turn % 36) + 36) % 36) / 3) >= 10 || Math.floor((((turn % 36) + 36) % 36) / 3) === 0;
  const north = NORTH.includes(b) || ['monan', 'mobei', 'jianzhou', 'chaoxian', 'hami'].includes(b);
  return Math.max(1, Math.ceil(edgeDays(a, b) / 10)) + (winter && north ? 1 : 0);
}

/** 由 from 到 to 的最短路（不含 from）。noSea 時不得渡海 */
export function findPath(from: RegionId, to: RegionId, noSea = false, avoid: RegionId[] = []): RegionId[] {
  if (from === to) return [];
  const dist: Partial<Record<RegionId, number>> = { [from]: 0 };
  const prev: Partial<Record<RegionId, RegionId>> = {};
  const open = new Set<RegionId>([from]);
  while (open.size) {
    let u: RegionId | null = null;
    for (const x of open) if (u === null || dist[x]! < dist[u]!) u = x;
    open.delete(u!);
    if (u === to) break;
    for (const v of ADJ[u!]) {
      if (noSea && isSea(u!, v)) continue;
      if (avoid.includes(v) && v !== to) continue;
      const d = dist[u!]! + edgeDays(u!, v);
      if (dist[v] === undefined || d < dist[v]!) {
        dist[v] = d;
        prev[v] = u!;
        open.add(v);
      }
    }
  }
  if (dist[to] === undefined) return [];
  const path: RegionId[] = [];
  for (let x: RegionId | undefined = to; x && x !== from; x = prev[x]) path.unshift(x);
  return path;
}

/** 由某地到京師（或南遷後的新京師）的路線 */
export function pathToCapital(state: GameState, from: RegionId): RegionId[] {
  return findPath(from, state.world?.capital ?? 'jingshi', true);
}

export function regionName(r: RegionId): string {
  return REGIONS[r].name;
}

/** 驛路日數換算成旬數（十日一旬，無條件進位） */
export function capitalDays(state: GameState, region: RegionId): number {
  const cap = state.world?.capital ?? 'jingshi';
  if (cap === 'jingshi') return REGIONS[region].days;
  if (region === cap) return 0;
  const path = findPath(cap, region);
  let d = 0;
  let at: RegionId = cap;
  for (const x of path) {
    d += edgeDays(at, x);
    at = x;
  }
  return d;
}

export function travelTurns(state: GameState, region: RegionId): number {
  let days = capitalDays(state, region);
  if (state.world?.mods?.postCut) days = Math.round(days * 1.2);
  if (state.perk === 'courier') days = Math.round(days * 0.6);
  if (state.world?.buffs?.courier) days = Math.round(days * 0.85);
  return Math.ceil(days / 10);
}

// ───────────────────────── 輿圖幾何 ─────────────────────────

export const MAP_W = 1010;
export const MAP_H = 930;

/** 經緯度 → 圖面座標 */
export function proj([lon, lat]: [number, number]): [number, number] {
  return [(lon - 89.5) * 24 + 6, (49.5 - lat) * 27 + 6];
}

type LL = [number, number];

/** 明代疆域輪廓（簡化） */
const OUTLINE: LL[] = [
  [125.2, 43.0], [124.4, 40.1], [122.2, 39.1], [121.1, 40.8], [119.6, 39.9], [118.0, 39.1], [117.6, 38.4], [118.8, 37.6],
  [120.5, 37.8], [122.5, 37.2], [120.4, 36.0], [119.2, 34.8], [120.8, 32.6], [121.9, 31.0], [121.9, 29.9], [121.3, 28.2],
  [120.2, 27.2], [119.6, 25.5], [117.5, 23.6], [116.0, 22.8], [114.2, 22.3], [112.0, 21.7], [110.3, 20.6], [109.7, 21.6],
  [108.0, 21.6], [106.7, 22.6], [105.5, 23.3], [103.0, 22.5], [101.0, 21.8], [98.6, 24.0], [98.0, 25.8], [98.7, 27.8],
  [100.0, 28.6], [101.4, 30.0], [102.2, 31.6], [102.6, 33.0], [101.4, 34.6], [100.4, 36.0], [99.4, 37.6], [98.4, 39.6],
  [100.5, 39.6], [103.0, 38.9], [104.6, 38.2], [106.4, 39.6], [108.0, 38.6], [110.4, 39.4], [111.5, 40.4], [113.5, 41.0],
  [115.0, 41.3], [117.0, 41.0], [119.0, 40.9], [120.6, 41.6], [122.2, 42.4], [124.0, 43.2],
];

const SEA: LL[] = [
  [124.4, 40.1], [122.2, 39.1], [121.1, 40.8], [119.6, 39.9], [118.0, 39.1], [117.6, 38.4], [118.8, 37.6], [120.5, 37.8],
  [122.5, 37.2], [120.4, 36.0], [119.2, 34.8], [120.8, 32.6], [121.9, 31.0], [121.9, 29.9], [121.3, 28.2], [120.2, 27.2],
  [119.6, 25.5], [117.5, 23.6], [116.0, 22.8], [114.2, 22.3], [112.0, 21.7], [110.3, 20.6], [109.7, 21.6], [108.0, 21.6],
  [107.0, 15.5], [131.5, 15.5], [131.5, 41.2], [128.0, 40.0],
];

/** 境外諸地（與本朝疆域重疊處會被本朝的格子蓋住） */
const OUTER_POLY: Record<string, LL[]> = {
  monan: [[104.6, 38.2], [106.4, 39.6], [108.0, 38.6], [110.4, 39.4], [111.5, 40.4], [113.5, 41.0], [115.0, 41.3], [117.0, 41.0], [119.0, 40.9], [120.6, 41.6], [122.2, 42.4], [121.0, 44.8], [116.0, 45.6], [111.0, 44.9], [106.0, 42.6], [103.5, 41.2]],
  mobei: [[103.5, 41.2], [106.0, 42.6], [111.0, 44.9], [116.0, 45.6], [119.0, 48.6], [108.0, 49.2], [98.5, 47.8], [96.6, 44.6], [99.2, 42.6]],
  jianzhou: [[122.2, 42.4], [124.0, 43.2], [125.2, 43.0], [126.4, 41.7], [128.6, 42.2], [130.8, 43.4], [130.0, 46.6], [124.2, 47.4], [121.0, 44.8]],
  chaoxian: [[124.4, 40.1], [125.2, 43.0], [126.4, 41.7], [128.6, 42.2], [129.9, 41.0], [129.3, 37.6], [129.4, 35.4], [128.0, 34.7], [126.4, 34.4], [126.2, 35.8], [126.7, 37.5], [125.2, 37.8], [124.7, 39.0]],
  donghai: [[121.9, 31.0], [121.9, 29.9], [121.3, 28.2], [120.2, 27.2], [119.6, 25.6], [121.6, 25.7], [123.6, 26.6], [125.4, 30.0], [125.4, 34.2], [123.0, 36.6], [122.5, 37.2], [120.4, 36.0], [119.2, 34.8], [120.8, 32.6]],
  taiwan: [[121.0, 25.3], [121.9, 25.1], [121.7, 24.3], [121.45, 23.1], [120.9, 22.0], [120.65, 22.3], [120.15, 23.1], [120.2, 24.0], [120.7, 24.85]],
  annan: [[108.0, 21.6], [106.7, 22.6], [105.5, 23.3], [103.0, 22.5], [102.2, 21.2], [103.2, 19.3], [104.8, 17.6], [106.6, 16.4], [107.7, 16.6], [106.4, 18.6], [105.8, 19.8], [106.8, 20.8]],
  miandian: [[98.6, 24.0], [101.0, 21.8], [100.2, 20.2], [99.0, 17.4], [97.5, 16.4], [95.0, 18.0], [94.2, 21.0], [94.8, 24.2], [96.2, 27.2], [98.0, 27.6], [98.0, 25.8]],
  hami: [[98.4, 39.6], [99.4, 37.6], [96.5, 37.0], [92.0, 38.5], [90.4, 41.5], [92.4, 43.8], [96.6, 44.6], [99.2, 42.6], [103.5, 41.2], [100.5, 39.6]],
};

export const RIVERS: { name: string; pts: LL[] }[] = [
  {
    name: '黃河',
    pts: [[100.5, 36.0], [103.8, 36.1], [105.6, 37.4], [106.4, 39.0], [107.6, 40.5], [110.0, 40.5], [111.2, 39.6], [110.6, 37.5], [110.4, 35.0], [112.5, 34.9], [114.3, 34.9], [116.5, 34.4], [118.0, 33.8], [119.9, 33.9]],
  },
  {
    name: '長江',
    pts: [[99.5, 27.5], [101.8, 26.3], [104.2, 28.8], [106.5, 29.6], [108.5, 30.8], [111.3, 30.7], [112.5, 29.8], [114.3, 30.6], [116.0, 29.8], [117.5, 30.8], [118.8, 32.1], [120.5, 32.0], [121.6, 31.6]],
  },
  {
    name: '運河',
    pts: [[116.4, 39.7], [117.2, 39.1], [116.3, 37.4], [116.2, 35.5], [117.2, 34.3], [119.0, 33.5], [119.4, 32.4], [120.3, 31.6], [120.2, 30.3]],
  },
];

export const WALL: LL[] = [
  [98.6, 39.7], [100.5, 39.4], [103.0, 38.7], [104.6, 38.0], [106.3, 39.2], [108.0, 38.4], [110.4, 39.2], [111.5, 40.2],
  [113.5, 40.8], [115.0, 41.0], [117.0, 40.7], [119.6, 40.1],
];

export const MOUNTAINS: LL[] = [
  [113.2, 36.6], [113.6, 38.6], [108.0, 33.8], [110.2, 33.6], [104.0, 33.6], [101.5, 27.0], [103.0, 24.4], [109.6, 25.8], [113.8, 25.6], [117.8, 27.4], [110.6, 29.2], [106.6, 32.6],
  [127.6, 40.2], [126.0, 45.2], [97.0, 24.5], [104.0, 21.0], [121.1, 23.6],
];

export const LABELS: { text: string; at: LL }[] = [
  { text: '烏斯藏', at: [92.5, 32.5] },
  { text: '日　本', at: [130.2, 33.2] },
  { text: '南　海', at: [114.0, 18.0] },
  { text: '澎湖', at: [119.4, 23.4] },
];

function pathOf(pts: [number, number][]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + 'Z';
}

export function polyline(pts: LL[]): string {
  return pts
    .map(proj)
    .map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join('');
}

/** Sutherland–Hodgman：以半平面 (p-m)·n <= 0 裁切多邊形 */
function clipHalf(poly: [number, number][], m: [number, number], n: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  const side = (p: [number, number]) => (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if (sa <= 0 !== sb <= 0) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

export interface MapGeometry {
  cells: Record<RegionId, { path: string; center: [number, number] }>;
  outline: string;
  sea: string;
}

let cached: MapGeometry | null = null;

export function mapGeometry(): MapGeometry {
  if (cached) return cached;
  const outline = OUTLINE.map(proj);
  const sites = REGION_ORDER.map((r) => proj(REGIONS[r].site));
  const cells = {} as MapGeometry['cells'];
  REGION_ORDER.forEach((r, i) => {
    let poly = outline.slice();
    const s = sites[i];
    sites.forEach((t, j) => {
      if (i === j) return;
      const m: [number, number] = [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2];
      poly = clipHalf(poly, m, [t[0] - s[0], t[1] - s[1]]);
    });
    let cx = 0;
    let cy = 0;
    for (const p of poly) {
      cx += p[0];
      cy += p[1];
    }
    const centroid: [number, number] = poly.length ? [cx / poly.length, cy / poly.length] : s;
    // 標籤取首府與形心之間，避免落在海上
    cells[r] = { path: pathOf(poly), center: [(centroid[0] + s[0] * 2) / 3, (centroid[1] + s[1] * 2) / 3] };
  });
  for (const r of OUTER) cells[r] = { path: pathOf(OUTER_POLY[r].map(proj)), center: proj(REGIONS[r].site) };
  cached = { cells, outline: pathOf(outline), sea: pathOf(SEA.map(proj)) };
  return cached;
}
