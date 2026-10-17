// Vehicle definitions: performance, formation and synthesized-sound profile.
//
// Formation codes (front → rear):
//   C = cab car facing forward, R = cab car facing backward,
//   M = intermediate car, P = intermediate car with pantograph, G = double-deck green car
//
// sound.modes: VVVF inverter pattern by modulating frequency fm (Hz).
//   { to, async: [fcStart, fcEnd] }  asynchronous PWM, carrier sweeps linearly
//   { to, sync: N }                  synchronous N-pulse PWM
//   { onePulse: true }               1-pulse (square wave)
// DC-motor trains (sound.type = 'dc') have no inverter; they get gear/motor whine
// and, for resistor control, cam-shaft notch clicks.

export const VEHICLES = {
  e231: {
    id: 'e231',
    name: 'E231系1000番台',
    tag: '近郊形・グリーン車付',
    desc: '宇都宮線の主力。三菱IGBT-VVVFインバータ。',
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
    sound: {
      type: 'vvvf',
      fmPerKmh: 1.48,
      gearTeeth: 14,
      gearGain: 0.55,
      pwmGain: 1.0,
      modes: [
        { to: 22, async: [1050, 1050] },
        { to: 46, async: [1050, 1480] },
        { to: 58, sync: 9 },
        { to: 68, sync: 5 },
        { to: 76, sync: 3 },
        { onePulse: true },
      ],
      regenModes: null, // same as power
      hornTones: [466, 698],
    },
  },
  e233: {
    id: 'e233',
    name: 'E233系3000番台',
    tag: '近郊形・グリーン車付',
    desc: '上野東京ラインでも活躍。低い唸りのIGBT-VVVF。',
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
    sound: {
      type: 'vvvf',
      fmPerKmh: 1.42,
      gearTeeth: 15,
      gearGain: 0.5,
      pwmGain: 0.8,
      modes: [
        { to: 8, async: [380, 700] },
        { to: 40, async: [740, 740] },
        { to: 56, async: [740, 1300] },
        { to: 63, sync: 5 },
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
    sound: {
      type: 'dc',
      fmPerKmh: 1.2,
      gearTeeth: 17,
      gearGain: 0.75,
      motorGain: 0.6,
      cam: false,
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
    sound: {
      type: 'dc',
      fmPerKmh: 1.0,
      gearTeeth: 15,
      gearGain: 0.9,
      motorGain: 1.0,
      cam: true,
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
