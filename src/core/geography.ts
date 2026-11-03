// 十七區域、驛程、輿圖幾何（以經緯度投影，Voronoi 切分疆域輪廓）。

import type { GameState, RegionId } from './types';

export type RegionKind = 'capital' | 'border' | 'province';

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
}

export const REGIONS: Record<RegionId, RegionInfo> = {
  jingshi: { id: 'jingshi', name: '京師', kind: 'capital', days: 0, site: [116.4, 39.6], tax: 2, grain: 0, gov: '順天府尹', garrison: 0, toCapital: [] },
  jizhen: { id: 'jizhen', name: '薊鎮', kind: 'border', days: 4, site: [118.9, 40.4], tax: 0, grain: 0, gov: '薊鎮總兵', garrison: 30000, toCapital: ['jingshi'] },
  xuanda: { id: 'xuanda', name: '宣大', kind: 'border', days: 6, site: [113.8, 40.6], tax: 0, grain: 0, gov: '宣大總兵', garrison: 40000, toCapital: ['jingshi'] },
  liaodong: { id: 'liaodong', name: '遼東', kind: 'border', days: 15, site: [122.8, 41.6], tax: 0, grain: 0, gov: '遼東總兵', garrison: 40000, toCapital: ['jizhen', 'jingshi'] },
  gansu: { id: 'gansu', name: '甘肅', kind: 'border', days: 30, site: [102.0, 37.6], tax: 0, grain: 0, gov: '甘肅總兵', garrison: 35000, toCapital: ['shaanxi', 'shanxi', 'jingshi'] },
  shanxi: { id: 'shanxi', name: '山西', kind: 'province', days: 8, site: [112.4, 37.6], tax: 3, grain: 0, gov: '山西巡撫', garrison: 6000, toCapital: ['jingshi'] },
  shandong: { id: 'shandong', name: '山東', kind: 'province', days: 8, site: [117.8, 36.4], tax: 4, grain: 1, gov: '山東巡撫', garrison: 6000, toCapital: ['jingshi'] },
  henan: { id: 'henan', name: '河南', kind: 'province', days: 10, site: [113.8, 34.4], tax: 4, grain: 1, gov: '河南巡撫', garrison: 6000, toCapital: ['jingshi'] },
  shaanxi: { id: 'shaanxi', name: '陝西', kind: 'province', days: 20, site: [108.6, 35.0], tax: 2, grain: 0, gov: '陝西巡撫', garrison: 8000, toCapital: ['henan', 'jingshi'] },
  sichuan: { id: 'sichuan', name: '四川', kind: 'province', days: 35, site: [104.0, 30.6], tax: 3, grain: 0, gov: '四川巡撫', garrison: 6000, toCapital: ['huguang', 'henan', 'jingshi'] },
  huguang: { id: 'huguang', name: '湖廣', kind: 'province', days: 22, site: [112.6, 29.8], tax: 4, grain: 2, gov: '湖廣巡撫', garrison: 6000, toCapital: ['henan', 'jingshi'] },
  jiangxi: { id: 'jiangxi', name: '江西', kind: 'province', days: 25, site: [115.8, 27.6], tax: 4, grain: 2, gov: '江西巡撫', garrison: 5000, toCapital: ['nanzhili', 'shandong', 'jingshi'] },
  nanzhili: { id: 'nanzhili', name: '南直隸', kind: 'province', days: 18, site: [119.0, 32.4], tax: 9, grain: 4, gov: '應天巡撫', garrison: 10000, toCapital: ['shandong', 'jingshi'] },
  zhejiang: { id: 'zhejiang', name: '浙江', kind: 'province', days: 22, site: [120.0, 29.4], tax: 6, grain: 1, gov: '浙江巡撫', garrison: 6000, toCapital: ['nanzhili', 'shandong', 'jingshi'] },
  fujian: { id: 'fujian', name: '福建', kind: 'province', days: 32, site: [118.2, 26.2], tax: 2, grain: 0, gov: '福建巡撫', garrison: 5000, toCapital: ['zhejiang', 'nanzhili', 'jingshi'] },
  liangguang: { id: 'liangguang', name: '兩廣', kind: 'province', days: 40, site: [111.0, 23.6], tax: 3, grain: 0, gov: '兩廣總督', garrison: 8000, toCapital: ['huguang', 'henan', 'jingshi'] },
  yungui: { id: 'yungui', name: '雲貴', kind: 'province', days: 55, site: [104.2, 25.6], tax: 1, grain: 0, gov: '雲貴總督', garrison: 8000, toCapital: ['sichuan', 'huguang', 'henan', 'jingshi'] },
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

export const BORDERS: RegionId[] = ['jizhen', 'xuanda', 'liaodong', 'gansu'];
export const PROVINCES: RegionId[] = REGION_ORDER.filter((r) => REGIONS[r].kind === 'province');

export function regionName(r: RegionId): string {
  return REGIONS[r].name;
}

/** 驛路日數換算成旬數（十日一旬，無條件進位） */
export function travelTurns(state: GameState, region: RegionId): number {
  let days = REGIONS[region].days;
  if (state.perk === 'courier') days = Math.round(days * 0.6);
  if (state.world?.buffs?.courier) days = Math.round(days * 0.85);
  return Math.ceil(days / 10);
}

// ───────────────────────── 輿圖幾何 ─────────────────────────

export const MAP_W = 640;
export const MAP_H = 600;

/** 經緯度 → 圖面座標 */
export function proj([lon, lat]: [number, number]): [number, number] {
  return [(lon - 97) * 21 + 6, (44.2 - lat) * 24.5 + 6];
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
  [107.0, 19.5], [127.5, 19.5], [127.5, 38.0], [126.0, 38.6],
];

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
];

export const LABELS: { text: string; at: LL }[] = [
  { text: '虜　地', at: [111.5, 42.6] },
  { text: '女直', at: [125.2, 43.6] },
  { text: '朝鮮', at: [126.0, 39.4] },
  { text: '烏斯藏', at: [99.0, 32.0] },
  { text: '安南', at: [105.0, 21.0] },
  { text: '東　海', at: [124.6, 30.0] },
  { text: '南　海', at: [114.0, 20.4] },
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
  cached = { cells, outline: pathOf(outline), sea: pathOf(SEA.map(proj)) };
  return cached;
}
