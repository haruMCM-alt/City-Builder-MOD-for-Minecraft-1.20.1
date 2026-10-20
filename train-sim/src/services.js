// Train services (種別) on the 宇都宮線 between 上野 and 宇都宮.
//
//  普通         every station
//  快速ラビット  real stopping pattern (JR East timetable, since the March 2021 timetable change):
//               上野・赤羽・浦和・大宮・東大宮・蓮田・久喜・古河・小山, then every station to 宇都宮
//  特別快速     NOT a real 宇都宮線 service (JR East runs 特別快速 only on the 高崎線 side of the
//               湘南新宿ライン). This is a game-original pattern in the same spirit: the rapid's
//               big stations only, then 小金井 and 宇都宮.

export const SERVICES = {
  local: {
    id: 'local', name: '普通', short: '普通', en: 'Local', color: '#18a048',
    stops: null,
    desc: '各駅に停車します。',
  },
  rapid: {
    id: 'rapid', name: '快速ラビット', short: '快速', en: 'Rapid Rabbit', color: '#e8501a',
    stops: ['上野', '赤羽', '浦和', '大宮', '東大宮', '蓮田', '久喜', '古河', '小山', '小金井', '自治医大', '石橋', '雀宮', '宇都宮'],
    desc: '実際の停車駅（上野・赤羽・浦和・大宮・東大宮・蓮田・久喜・古河・小山、小山から先は各駅）。',
  },
  special: {
    id: 'special', name: '特別快速', short: '特別快速', en: 'Special Rapid', color: '#1f5fd0',
    stops: ['上野', '赤羽', '浦和', '大宮', '久喜', '古河', '小山', '小金井', '宇都宮'],
    original: true,
    desc: 'ゲームオリジナル（宇都宮線に実在しない種別）。上野・赤羽・浦和・大宮・久喜・古河・小山・小金井・宇都宮に停車。',
  },
};

export const DEFAULT_SERVICE = 'local';

/** does this service stop at the station? (the chosen first / last station always counts as a stop) */
export function stopsAt(service, station) {
  return !service.stops || service.stops.includes(station.name);
}
