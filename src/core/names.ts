import { pick, type Rng } from './rng';

/** 國姓（大胤宗室），不與臣下重複 */
export const ROYAL = '蕭';

const SURNAMES = '王李張劉陳楊趙黃周吳徐孫胡朱高林何郭馬羅梁宋鄭謝韓唐馮董程曹袁鄧許傅沈曾彭呂蘇盧蔣蔡賈丁魏薛葉閻潘杜戴夏鍾汪田姜范方石姚譚廖鄒熊陸郝孔崔毛邱秦史顧侯邵孟段錢湯尹黎常喬賀龔萬顏甘樊溫柯管祝左阮'.split('');
const FIRST = '應文世之國廷士大承宗德允光維時尚守汝從可一化元弘正嘉啟崇道子敬惟夢紹兆興懋'.split('');
const SECOND = '龍鳳鵬舉傑賢良忠孝禮儀明昌泰弼輔臣安邦寧遠鎮雄武勳璋瑜奎翰楨相節'.split('');
const FIEFS = '安寧益楚吉淮衡岷襄榮德崇潞唐'.split('');

export function makeName(r: Rng, used: Set<string>): string {
  for (let i = 0; ; i++) {
    const name = pick(r, SURNAMES) + pick(r, FIRST) + pick(r, SECOND);
    if (!used.has(name[0]) || i > 200) {
      used.add(name[0]);
      return name;
    }
  }
}

export function royalName(r: Rng): string {
  return ROYAL + pick(r, FIRST) + pick(r, SECOND);
}

export function fiefName(r: Rng): string {
  return pick(r, FIEFS) + '王';
}
