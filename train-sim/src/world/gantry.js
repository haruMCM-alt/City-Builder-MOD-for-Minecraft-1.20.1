// Where the overhead line gantries go across the tracks (pure layout, no three.js).

const MAST_CLEAR = 2.7;   // track centre to the face of a mast
const MAST_GAP = 4.9;     // a gap between tracks this wide can take a mast
const SPLIT_GAP = 14;     // a gap wider than this splits the structure in two
const MAX_SPAN = 26;      // longest beam between two masts

/**
 * the gantries at s over a set of track offsets: tracks that run together (merging at a junction)
 * share one; each gantry has masts at its ends and in wide gaps (platforms, between lines).
 * Returns [{ tracks: [lat], masts: [lat] }], sorted by lateral offset.
 */
export function gantryLayout(offsets) {
  const L = [];
  for (const o of [...offsets].sort((a, b) => a - b)) if (!L.length || o - L[L.length - 1] > 1.2) L.push(o);
  if (!L.length) return [];
  const groups = [[L[0]]];
  for (let i = 1; i < L.length; i++) {
    if (L[i] - L[i - 1] > SPLIT_GAP) groups.push([L[i]]); else groups[groups.length - 1].push(L[i]);
  }
  return groups.map((tr) => {
    const a = tr[0] - MAST_CLEAR, b = tr[tr.length - 1] + MAST_CLEAR;
    const cand = [];
    for (let i = 1; i < tr.length; i++) if (tr[i] - tr[i - 1] >= MAST_GAP) cand.push((tr[i] + tr[i - 1]) / 2);
    const masts = [a];
    let pos = a;
    while (b - pos > MAX_SPAN) {
      const ok = cand.filter((c) => c > pos + 1 && c - pos <= MAX_SPAN);
      const next = ok.length ? ok[ok.length - 1] : cand.find((c) => c > pos + 1);
      if (next === undefined || b - next < 1) break;
      masts.push(next); pos = next;
    }
    masts.push(b);
    return { tracks: tr, masts };
  });
}
