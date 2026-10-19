// Vehicle definitions: performance, formation and synthesized-sound profile.
//
// Formation codes (front → rear):
//   C = cab car facing forward, R = cab car facing backward,
//   M = intermediate car, P = intermediate car with pantograph, G = double-deck green car
//
// sound.modes: VVVF inverter pattern by inverter output frequency fm (Hz).
//   { to, async: [fcStart, fcEnd], random }  asynchronous PWM, carrier sweeps linearly
//                                            (random = spread-spectrum width in Hz)
//   { to, sync: N, wide }                    synchronous N-pulse PWM (wide = over-modulated 広域 pulses)
//   { onePulse: true }                       1-pulse (square wave)
// regenModes: the pattern used in regenerative braking (often different).
// DC-motor trains (sound.type = 'dc') have no inverter; they get gear/motor whine
// and, for resistor control, cam-shaft notch clicks.

export const VEHICLES = {
  e231: {
    id: 'e231',
    name: 'E231系1000番台',
    tag: '近郊形・グリーン車付',
    desc: '宇都宮線の主力。日立IGBT-VVVF（機器更新車／未更新車の音を選べます）。',
    glb: 'assets/models/e231.glb',
    maxSpeed: 120,
    accel: 2.5, // km/h/s at full power (start)
    ctSpeed: 36, // constant-torque region ends (km/h)
    powerNotches: 5,
    brakeNotches: 7,
    brakeMax: 4.2, // km/h/s at max service brake
    ebDecel: 4.6,
    handle: 'one',
    doorSound: 'e231',
    formations: {
      15: 'CPMMR' + 'CMPMMGGPMR',
      10: 'CMPMMGGPMR',
    },
    destColor: '#ff8a10',
    // Hitachi 2-level IGBT (VVVF名鑑 type H2I-3, renewed cars - the usual sound on the
    // 宇都宮線 now). Inverter output frequency fm (Hz) = motor speed x 2 + slip. Gear 14:99,
    // MT73 motors, 860 mm wheels. See README "音響" for the sources.
    sound: {
      type: 'vvvf',
      wheelD: 0.86, gearRatio: 99 / 14, pinion: 14, polePairs: 2, slip: 2.2,
      gearGain: 0.55, pwmGain: 1.0, fanGain: 0.35, fanBlades: 13,
      modes: [
        { to: 26, async: [525, 525], random: 60 },
        { to: 52, async: [525, 900], random: 60 },
        { to: 62, sync: 9 },
        { to: 66, sync: 3, wide: true },
        { onePulse: true },
      ],
      regenModes: [
        { to: 56, async: [200, 900], random: 60 },
        { to: 66, sync: 9 },
        { to: 73, sync: 3, wide: true },
        { onePulse: true },
      ],
      hornTones: [466, 698],
    },
    // original SC59A / SC77 sound (H2I-2, the 「墜落」 carrier drop), still on a few sets
    soundAlt: {
      label: '未更新車（日立 SC59A/SC77）',
      type: 'vvvf',
      wheelD: 0.86, gearRatio: 99 / 14, pinion: 14, polePairs: 2, slip: 2.2,
      gearGain: 0.55, pwmGain: 1.0, fanGain: 0.35, fanBlades: 13,
      ampRamp: [65, 1.375],
      modes: [
        { to: 23, async: [1045, 1045] },
        { to: 49, async: [1045, 710] },
        { to: 60, async: [710, 1750] },
        { to: 67, sync: 3, wide: true },
        { onePulse: true },
      ],
      regenModes: [
        { to: 29, async: [1045, 1045] },
        { to: 56, async: [1045, 700] },
        { to: 67, async: [700, 1600] },
        { to: 73, sync: 3, wide: true },
        { onePulse: true },
      ],
      hornTones: [466, 698],
    },
  },
  e233: {
    id: 'e233',
    name: 'E233系3000番台',
    tag: '近郊形・グリーン車付',
    desc: '上野東京ラインでも活躍。日立IGBT-VVVF（SC98）、525 Hz から始まる音。',
    glb: 'assets/models/e233.glb',
    maxSpeed: 120,
    accel: 2.5,
    ctSpeed: 40,
    powerNotches: 5,
    brakeNotches: 7,
    brakeMax: 4.2,
    ebDecel: 4.7,
    handle: 'one',
    doorSound: 'e231',
    formations: {
      15: 'CPMMR' + 'CMPMMGGPMR',
      10: 'CMPMMGGPMR',
    },
    destColor: '#ff9a20',
    // Hitachi 2-level IGBT SC98 (H2I-3): 525 Hz start, sweep to ~900 Hz, drop into 9 pulse,
    // wide 3 pulse, 1 pulse at ~43 km/h; regen async falls to ~200 Hz. Gear 1:6.06, MT75.
    sound: {
      type: 'vvvf',
      wheelD: 0.86, gearRatio: 97 / 16, pinion: 16, polePairs: 2, slip: 2.0,
      gearGain: 0.5, pwmGain: 0.85, fanGain: 0.3, fanBlades: 15,
      motorModes: [[480, 5, 0.6], [880, 7, 1.0], [1350, 9, 0.8], [1900, 10, 0.6], [2650, 12, 0.45], [3500, 12, 0.3], [5000, 10, 0.18]],
      modes: [
        { to: 24, async: [525, 525], random: 60 },
        { to: 40.5, async: [525, 905], random: 60 },
        { to: 48.5, sync: 9 },
        { to: 52, sync: 3, wide: true },
        { onePulse: true },
      ],
      regenModes: [
        { to: 54, async: [200, 900], random: 60 },
        { to: 66, sync: 9 },
        { to: 70, sync: 3, wide: true },
        { onePulse: true },
      ],
      hornTones: [494, 740],
    },
  },
  s211: {
    id: 's211',
    name: '211系3000番台',
    tag: '近郊形・界磁添加励磁制御',
    desc: '国鉄末期のステンレス車。直流モーターの唸り。',
    glb: 'assets/models/211.glb',
    maxSpeed: 110,
    accel: 2.0,
    ctSpeed: 42,
    powerNotches: 4,
    brakeNotches: 8,
    brakeMax: 4.0,
    ebDecel: 4.5,
    handle: 'one',
    formations: {
      15: 'CPMMR' + 'CPMMMGGPMR',
      10: 'CPMMMGGPMR',
    },
    destColor: '#ffb030',
    // DC series motors MT61 (外扇形 external fan), gear 16:83, CS57A camshaft
    sound: {
      type: 'dc',
      wheelD: 0.86, gearRatio: 83 / 16, pinion: 16, polePairs: 2, armSlots: 33,
      gearGain: 0.75, motorGain: 0.6, fanGain: 0.6, fanBlades: 11,
      cam: false, camClicks: true, camTo: 45,
      hornTones: [415, 622],
    },
  },
  s115: {
    id: 's115',
    name: '115系 湘南色',
    tag: '近郊形・抵抗制御',
    desc: '懐かしの湘南色。抵抗制御のカム音とモーター音。',
    glb: 'assets/models/115.glb',
    maxSpeed: 100,
    accel: 1.8,
    ctSpeed: 48,
    powerNotches: 4,
    brakeNotches: 8,
    brakeMax: 3.6,
    ebDecel: 4.2,
    handle: 'one',
    formations: {
      15: 'CPMR' + 'CPMR' + 'CPMMMMR',
      10: 'CPMR' + 'CPMMMR',
    },
    destColor: '#ffffff',
    // DC series motors MT54, gear 17:82, CS15 camshaft (series 13 / parallel 11 / field 4 steps)
    sound: {
      type: 'dc',
      wheelD: 0.86, gearRatio: 82 / 17, pinion: 17, polePairs: 2, armSlots: 33,
      gearGain: 0.9, motorGain: 1.0, fanGain: 0.55, fanBlades: 11,
      cam: true, camTo: 62,
      hornTones: [350, 520],
    },
  },
};

export const DEFAULT_VEHICLE = 'e231';
export const CAR_LEN = 20.0; // coupler to coupler
export const BOGIE_C = 6.9;

/** acceleration (m/s²) available at speed v (km/h) for power fraction f */
export function tractiveAccel(veh, vKmh, f) {
  if (f <= 0) return 0;
  const a0 = veh.accel / 3.6;
  const vb = veh.ctSpeed;
  let a;
  if (vKmh <= vb) a = a0;
  else {
    // constant power then a "characteristic" region falling ~1/v²
    const v2 = vb * 1.9;
    a = vKmh <= v2 ? a0 * (vb / vKmh) : a0 * (vb / v2) * (v2 / vKmh) ** 2;
  }
  if (vKmh >= veh.maxSpeed) a *= Math.max(0, 1 - (vKmh - veh.maxSpeed) / 2);
  return a * f;
}

/** running resistance (m/s²) */
export function resistance(vKmh) {
  const v = Math.abs(vKmh);
  if (v < 0.05) return 0;
  return (0.012 + 0.00022 * v + 0.0000055 * v * v) / 3.6; // km/h/s → m/s²
}
