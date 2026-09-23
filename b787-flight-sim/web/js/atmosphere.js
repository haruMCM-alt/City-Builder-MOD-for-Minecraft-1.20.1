// International Standard Atmosphere + airspeed conversions
import { clamp } from './util.js';

const T0 = 288.15, P0 = 101325, RHO0 = 1.225, R = 287.053, GAMMA = 1.4, L = 0.0065, G = 9.80665;
export const A0 = Math.sqrt(GAMMA * R * T0);   // 340.3 m/s

export function isa(h, dT = 0) {
  h = clamp(h, -500, 30000);
  let T, P;
  if (h < 11000) {
    T = T0 - L * h;
    P = P0 * Math.pow(T / T0, G / (L * R));
  } else {
    T = 216.65;
    P = 22632.06 * Math.exp(-G * (h - 11000) / (R * T));
  }
  T += dT;
  const rho = P / (R * T);
  return { T, P, rho, a: Math.sqrt(GAMMA * R * T), sigma: rho / RHO0, delta: P / P0 };
}

// TAS (m/s) -> CAS (m/s) (compressible)
export function tas2cas(tas, atm) {
  const M = tas / atm.a;
  const qc = atm.P * (Math.pow(1 + 0.2 * M * M, 3.5) - 1);
  return A0 * Math.sqrt(5 * (Math.pow(qc / P0 + 1, 2 / 7) - 1));
}

export function cas2tas(cas, atm) {
  const qc = P0 * (Math.pow(1 + 0.2 * (cas / A0) ** 2, 3.5) - 1);
  const M = Math.sqrt(5 * (Math.pow(qc / atm.P + 1, 2 / 7) - 1));
  return M * atm.a;
}

export const RHO_SL = RHO0;
