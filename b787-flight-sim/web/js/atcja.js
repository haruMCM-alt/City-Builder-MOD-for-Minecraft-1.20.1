// Beginner mode: Japanese translation of the radio calls.  The transmissions use standard ICAO
// phraseology built from a small set of clauses ("runway 34R", "cleared for take-off",
// "contact Ground one two one decimal niner" ...), so a message is split into clauses and each
// clause is translated by pattern; anything not recognised (call signs, station names) is kept.

const NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, fife: 5, six: 6, seven: 7, eight: 8, nine: 9, niner: 9 };
const DIR = { east: '東', west: '西', north: '北', south: '南', left: '左', right: '右' };

// "one two five decimal three" -> "125.3", "five thousand" -> "5,000", "seven seven zero zero" -> "7700"
function words2num(s) {
  return s.replace(/\b((?:zero|one|two|three|four|five|fife|six|seven|eight|nine|niner)(?:[ -](?:zero|one|two|three|four|five|fife|six|seven|eight|nine|niner|decimal|point))*)( thousand)?\b/gi, (m, seq, th) => {
    let out = '';
    for (const w of seq.toLowerCase().split(/[ -]/)) out += w === 'decimal' || w === 'point' ? '.' : String(NUM[w]);
    if (th) out = (+out * 1000).toLocaleString('en-US');
    return out;
  });
}

const station = (s) => s
  .replace(/\bTower\b/, 'タワー').replace(/\bGround\b/, 'グランド').replace(/\bDeparture\b/, 'ディパーチャー')
  .replace(/\bApproach\b/, 'アプローチ');

// [pattern, translation (string with $1.. or function)]
const RULES = [
  [/^runway heading$/i, '滑走路の方位を維持してください'],
  [/^I say again$/i, 'くり返します'],
  [/^runway (\S+) cleared to land$/i, '滑走路 $1、着陸を許可します'],
  [/^runway (\S+) cleared for take-?off$/i, '滑走路 $1、離陸を許可します'],
  [/^cleared for take-?off(?: runway (\S+))?$/i, (m) => `${m[1] ? `滑走路${m[1]}、` : ''}離陸を許可します`],
  [/^cleared to land(?: runway (\S+))?$/i, (m) => `${m[1] ? `滑走路${m[1]}、` : ''}着陸を許可します`],
  [/^wind check$/i, '風の情報をお知らせします'],
  [/^wind (\d{1,3}) at (\d+) knots$/i, '風は $1 度から $2 ノット'],
  [/^line up and wait(?: runway (\S+))?$/i, (m) => `${m[1] ? `滑走路${m[1]}に` : '滑走路に'}入って待機してください`],
  [/^hold short(?: of)? runway (\S+)$/i, '滑走路 $1 の手前で停止してください'],
  [/^hold short of the apron$/i, 'エプロンの手前で停止してください'],
  [/^landing traffic$/i, '着陸機があります'],
  [/^taxi to holding point (?:(\S+) )?runway (\S+) via (.+?)\.?$/i, (m) => `誘導路${m[3]}経由で滑走路${m[2]}の停止位置${m[1] ? `（${m[1]}）` : ''}まで地上走行してください`],
  [/^taxi holding point (?:(\S+) )?runway (\S+) via (.+)$/i, (m) => `誘導路${m[3]}経由で滑走路${m[2]}の停止位置まで地上走行します（復唱）`],
  [/^taxi to holding point runway (\S+) via (.+)$/i, '誘導路$2経由で滑走路$1の停止位置まで地上走行します（復唱）'],
  [/^taxi to stand (\S+) via (.+?)(?: and the apron taxilane)?$/i, '$2 経由で $1 番スポットへ地上走行してください'],
  [/^taxi to the apron via (.+)$/i, '$1 経由でエプロンへ地上走行してください'],
  [/^continue via apron taxilane to stand (\S+)$/i, 'エプロン誘導路を進んで $1 番スポットへ向かってください'],
  [/^stand to be advised$/i, 'スポットは後ほど指示します'],
  [/^QNH (.+)$/i, (m) => `高度計規正値 QNH ${words2num(m[1]).replace(/\s/g, '')}`],
  [/^(\d{4})$/, '（QNH $1）'],
  [/^push(?: back)? and start(?: up)? approved$/i, 'プッシュバックとエンジン始動を許可します'],
  [/^facing (east|west|north|south)$/i, (m) => `機首は${DIR[m[1].toLowerCase()]}向きに`],
  [/^standby$/i, 'お待ちください'],
  [/^expect push back in (.+)$/i, (m) => `約${words2num(m[1]).replace(/minutes?/, '分')}後にプッシュバックの予定です`],
  [/^expect push back shortly$/i, 'まもなくプッシュバックできます'],
  [/^traffic on the apron$/i, 'エプロンに他の機体がいます'],
  [/^climb and maintain (.+) feet$/i, (m) => `${words2num(m[1])} フィートまで上昇して維持してください`],
  [/^climb(?: to)? (.+) feet$/i, (m) => `${words2num(m[1])} フィートまで上昇してください`],
  [/^descend to (.+) feet$/i, (m) => `${words2num(m[1])} フィートまで降下してください`],
  [/^contact (Departure|Ground|Tower|Approach)(?: (.+))?$/i, (m) => `${station(m[1])}${m[2] ? `（${words2num(m[2]).replace(/\s/g, '')} MHz）` : ''}に周波数を変更してください`],
  [/^(\d[\d,]*), (\S+), .*good day$/i, '復唱'],
  [/^good day$/i, 'さようなら'],
  [/^continue approach(?: runway (\S+))?$/i, (m) => `${m[1] ? `滑走路${m[1]}への` : ''}進入を継続してください`],
  [/^report (four|4) miles(?: final)?$/i, '最終進入 4 マイルで通報してください'],
  [/^report final(?: runway (\S+))?$/i, '最終進入で通報してください'],
  [/^report downwind$/i, 'ダウンウィンドで通報してください'],
  [/^report established$/i, 'ILS に乗ったら通報してください'],
  [/^number (one|two|three|four|\d)$/i, (m) => `着陸順は ${words2num(m[1])} 番目です`],
  [/^go around$/i, '着陸をやり直してください（ゴーアラウンド）'],
  [/^I say again, go around$/i, 'くり返します、ゴーアラウンド'],
  [/^going around$/i, 'ゴーアラウンドします'],
  [/^(left|right) hand circuit$/i, (m) => `${DIR[m[1].toLowerCase()]}回りの場周経路へ`],
  [/^(left|right) downwind runway (\S+)$/i, (m) => `滑走路${m[2]}の${DIR[m[1].toLowerCase()]}ダウンウィンド`],
  [/^join (left|right) downwind runway (\S+)$/i, (m) => `滑走路${m[2]}の${DIR[m[1].toLowerCase()]}ダウンウィンドに入ってください`],
  [/^after departure (left|right) turn$/i, (m) => `離陸後は${DIR[m[1].toLowerCase()]}旋回`],
  [/^full stop$/i, '着陸して停止します'],
  [/^final runway (\S+)$/i, '滑走路 $1 の最終進入'],
  [/^extend downwind$/i, 'ダウンウィンドを延長してください'],
  [/^traffic on (?:short )?final$/i, '最終進入に先行機がいます'],
  [/^traffic on the runway$/i, '滑走路上に他の機体がいます'],
  [/^traffic on short final$/i, '短い最終進入に先行機がいます'],
  [/^turn base now$/i, '今すぐベースレグへ旋回してください'],
  [/^established ILS runway (\S+)$/i, '滑走路 $1 の ILS に乗りました'],
  [/^ILS runway (\S+)$/i, '滑走路 $1 へ ILS 進入中'],
  [/^(eight|\w+) miles$/i, (m) => `${words2num(m[1])} マイル`],
  [/^(\d+) miles$/i, '$1 マイル'],
  [/^(\d[\d,]*) feet$/i, '$1 フィート'],
  [/^radar contact on final runway (\S+)$/i, '滑走路 $1 の最終進入でレーダー捕捉しました'],
  [/^expect ILS approach runway (\S+)$/i, '滑走路 $1 への ILS 進入を予定してください'],
  [/^request taxi(?: to the gate)?$/i, (m) => (/gate/i.test(m[0]) ? 'スポットまでの地上走行を要求します' : '地上走行を要求します')],
  [/^request push back and start up$/i, 'プッシュバックとエンジン始動を要求します'],
  [/^request landing runway (\S+)$/i, '滑走路 $1 への着陸を要求します'],
  [/^request immediate landing runway (\S+)$/i, '滑走路 $1 へ直ちに着陸したい'],
  [/^request priority landing runway (\S+)$/i, '滑走路 $1 へ優先着陸を要求します'],
  [/^request emergency assistance$/i, '緊急援助を要請します'],
  [/^ready for departure$/i, '離陸準備ができました'],
  [/^ready to taxi$/i, '地上走行の準備ができました'],
  [/^(holding point|lined up) runway (\S+)$/i, (m) => `滑走路${m[2]}の${/lined/i.test(m[1]) ? '上に整列' : '停止位置'}にいます`],
  [/^holding point runway (\S+)$/i, '滑走路 $1 の停止位置にいます'],
  [/^runway vacated$/i, '滑走路を離脱しました'],
  [/^runway (\S+) vacated$/i, '滑走路 $1 を離脱しました'],
  [/^for stand (\S+)$/i, '$1 番スポットへ向かいます'],
  [/^stand (\S+)$/i, '$1 番スポット'],
  [/^vacate via (.+)$/i, '$1 から滑走路を離脱してください'],
  [/^squawk seven seven zero zero$/i, 'トランスポンダーを 7700（緊急）にしてください'],
  [/^hold position$/i, 'その場で停止して待機してください'],
  [/^holding position$/i, 'その場で待機します'],
  [/^expect departure shortly$/i, 'まもなく離陸できます'],
  [/^welcome to (.+)$/i, '$1 へようこそ'],
  [/^shut down engines at stand (\S+)$/i, '$1 番スポットでエンジンを停止してください'],
  [/^emergency services are standing by$/i, '消防・救急が待機しています'],
  [/^emergency services are on their way to you$/i, '消防・救急がそちらへ向かっています'],
  [/^emergency services dispatched$/i, '消防・救急を出動させました'],
  [/^emergency services are with you$/i, '消防・救急が到着しています'],
  [/^stop on the runway$/i, '滑走路上で停止してください'],
  [/^fire services will follow you to the stand$/i, '消防車がスポットまで随行します'],
  [/^remain on this frequency$/i, 'この周波数のままでいてください'],
  [/^you are not cleared for take-?off!?$/i, '離陸は許可していません！'],
  [/^stop immediately if able$/i, '可能ならただちに停止してください'],
  [/^all stations$/i, '各局へ'],
  [/^emergency in progress$/i, '緊急事態が発生しています'],
  [/^emergency terminated$/i, '緊急事態は終了しました'],
  [/^all departures hold position$/i, '出発機はすべてその場で待機してください'],
  [/^departures hold position$/i, '出発機はその場で待機してください'],
  [/^arriving traffic expect holding$/i, '到着機は空中待機を予定してください'],
  [/^runway (\S+) (?:open for traffic|reopened for traffic)$/i, '滑走路 $1 は運用を再開しました'],
  [/^runway (\S+) closed$/i, '滑走路 $1 は閉鎖中です'],
  [/^taxi when able$/i, '準備ができたら地上走行してください'],
  [/^follow the fire vehicles$/i, '消防車に続いてください'],
  [/^(\d+) persons on board$/i, '搭乗者 $1 名'],
  [/^fuel (\d+) minutes$/i, '残燃料 $1 分'],
  [/^roger(?: (mayday|pan-pan))?$/i, (m) => (m[1] ? `${m[1] === 'mayday' ? 'メーデー' : 'パンパン'}了解` : '了解')],
  [/^(Mayday|Pan-pan)(?:, \1)*$/i, (m) => (/may/i.test(m[1]) ? 'メーデー（遭難）' : 'パンパン（緊急）')],
  [/^contact Ground$/i, 'グランドに周波数を変更してください'],
  [/^we observed you contact a building$/i, '建物との接触を確認しました'],
  [/^shut down the affected engine$/i, '損傷したエンジンを停止してください'],
  [/^fire services are on the way to inspect the aircraft$/i, '消防が機体の点検に向かっています'],
  [/^we have your (mayday|pan-pan)$/i, (m) => `${/may/i.test(m[1]) ? 'メーデー' : 'パンパン'}を受信しました`],
  [/^we observed your aircraft is damaged$/i, '機体の損傷を確認しました'],
  [/^report when ready to taxi$/i, '地上走行の準備ができたら通報してください'],
  [/^or advise if you require evacuation$/i, '脱出が必要なら知らせてください'],
  [/^fire services are with you$/i, '消防が到着しています'],
  [/^inspecting the aircraft$/i, '機体を点検しています'],
  [/^fire services report the aircraft safe$/i, '消防が機体の安全を確認しました'],
  [/^inspection complete$/i, '点検が終わりました'],
  [/^no fire$/i, '火災はありません'],
  [/^continue taxi when ready$/i, '準備ができたら地上走行を続けてください'],
  [/^keep clear of the building$/i, '建物から離れてください'],
  [/^fire services are at the aircraft and will assist the passengers$/i, '消防が機体に到着し、乗客の脱出を支援します'],
  [/^we are evacuating on the runway$/i, '滑走路上で緊急脱出を開始します'],
  [/^fire on the (left|right) side$/i, (m) => `${DIR[m[1].toLowerCase()]}側で火災`],
  [/^stopping on the (runway|ground)$/i, (m) => `${m[1] === 'runway' ? '滑走路' : '地上'}で停止します`],
  [/^crash alarm$/i, '事故警報'],
  [/^aircraft accident at (.+)$/i, '$1 で航空機事故'],
  [/^all stations hold position$/i, '全機その場で待機してください'],
  [/^the airport is closed$/i, '空港は閉鎖されました'],
  [/^fire services responding$/i, '消防が出動しています'],
  [/^(?:struck a building|((left|right) engine (fire|separated|failure))|wing fire|wing damage|tail damage|fuel leak|technical problem|engine failure|hydraulic failure|smoke in the cabin|bird strike|engine vibration|medical emergency on board)(?: and .+)?$/i, (m) => problemJa(m[0])],
  [/^roger (.+)$/i, '$1 了解'],
  [/^(.+) (Tower|Ground)$/, (m) => `${m[1]} ${station(m[2])}`],
  [/^runway (\S+)$/i, '滑走路 $1'],
];

const PROB = {
  'struck a building': '建物に接触', 'engine fire': 'エンジン火災', 'engine separated': 'エンジン脱落', 'engine failure': 'エンジン故障',
  'wing fire': '主翼火災', 'wing damage': '主翼損傷', 'tail damage': '尾翼損傷', 'fuel leak': '燃料漏れ', 'technical problem': '機体トラブル',
  'hydraulic failure': '油圧系統の故障', 'smoke in the cabin': '客室内に煙', 'bird strike': 'バードストライク', 'engine vibration': 'エンジン振動',
  'medical emergency on board': '機内で急病人',
};
function problemJa(s) {
  return s.split(/ and /).map((p) => {
    const m = p.match(/^(left|right) (.+)$/i);
    return m ? `${DIR[m[1].toLowerCase()]}${PROB[m[2].toLowerCase()] || m[2]}` : (PROB[p.toLowerCase()] || p);
  }).join('と');
}

// clauses not recognised (call signs, station names) are kept as they are
function translateClause(c) {
  const t = c.trim().replace(/[.!]+$/, '');
  if (!t) return '';
  for (const [re, out] of RULES) {
    const m = t.match(re);
    if (m) return typeof out === 'function' ? out(m) : t.replace(re, out);
  }
  // a read-back of numbers only ("five thousand", "one two five decimal three")
  if (/^(?:(?:zero|one|two|three|four|five|fife|six|seven|eight|nine|niner|decimal|point|thousand)[ -]?)+$/i.test(t)) return words2num(t);
  return t;          // call sign or unknown: as it is
}

export function translateATC(text) {
  // split into sentences, then clauses
  const sentences = String(text).split(/(?<=[.!?])\s+/);
  const out = sentences.map((s) => s.split(/,\s*/).map(translateClause).filter((c, i, a) => c && c !== a[i - 1]).join('、')).join('。');
  return out.replace(/、?(さようなら)/, '、$1');
}
