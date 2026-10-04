// Ground realism: shared procedural noise and bump mapping for the runtime ground shaders
// (terrain, pavements, markings, water). Everything is computed in the shader from world
// position - no extra texture bytes - and fades out with the pixel footprint so distant
// surfaces do not shimmer.
export const GROUND_GLSL = /* glsl */`
float gHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
}
float gFbm(vec2 p) { return gNoise(p) * 0.5 + gNoise(p * 2.07 + 5.3) * 0.28 + gNoise(p * 4.13 + 1.7) * 0.14 + gNoise(p * 8.31 + 9.2) * 0.08; }
// cellular: distance to the nearest feature point (aggregate stones, pebbles)
float gCell(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 r = o + vec2(gHash(i + o), gHash(i + o + 17.1)) - f;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}
// thin wandering cracks: zero crossings of a noise field, kept only where a mask allows
float gCrack(vec2 p, float w) {
  float n = gNoise(p) * 0.65 + gNoise(p * 2.9 + 3.1) * 0.35;
  return 1.0 - smoothstep(0.0, w, abs(n - 0.5));
}
// bump mapping from a height in metres (Mikkelsen's surface gradient, no tangents needed)
vec3 gBump(vec3 N, vec3 pos, float h, float k) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  if (abs(det) < 1e-12) return N;
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * N - k * grad);
}
`;
