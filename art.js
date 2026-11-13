// The art: geometry, the shape checks a drawing has to pass, the skeleton fitted to a stick man, and what a weapon's
// shape makes it do. Shared by the server, which judges every drawing, and the page, which draws them.
export const PI = Math.PI, TAU = PI * 2;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[(Math.random() * arr.length) | 0];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeIn = t => t * t;
export const easeOut = t => 1 - (1 - t) * (1 - t);
export const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);


export function strokeLen(s) {
  let L = 0;
  for (let i = 1; i < s.length; i++) L += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  return L;
}

export function resample(s, step) {
  if (s.length < 2) return s.map(p => ({ x: p.x, y: p.y }));
  const out = [{ x: s[0].x, y: s[0].y }];
  let acc = 0;
  for (let i = 1; i < s.length; i++) {
    let ax = s[i - 1].x, ay = s[i - 1].y;
    const bx = s[i].x, by = s[i].y;
    let seg = Math.hypot(bx - ax, by - ay);
    while (acc + seg >= step && seg > 0) {
      const t = (step - acc) / seg;
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
      out.push({ x: ax, y: ay });
      seg = Math.hypot(bx - ax, by - ay);
      acc = 0;
    }
    acc += seg;
  }
  const last = s[s.length - 1], prev = out[out.length - 1];
  if (Math.hypot(last.x - prev.x, last.y - prev.y) > step * 0.3) out.push({ x: last.x, y: last.y });
  return out;
}

export const allPts = strokes => strokes.flat();

export function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

export function pca(pts) {
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const dx = p.x - cx, dy = p.y - cy;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ax = Math.cos(ang), ay = Math.sin(ang);
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
  for (const p of pts) {
    const dx = p.x - cx, dy = p.y - cy;
    const a = dx * ax + dy * ay, b = -dx * ay + dy * ax;
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
  }
  return { cx, cy, ax, ay, minA, maxA, minB, maxB, len: maxA - minA, wid: maxB - minB };
}

export function hull(pts) {
  const p = pts.map(q => ({ x: q.x, y: q.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop(); up.pop();
  return lo.concat(up);
}

// Returns position along segment CD (0..1) where AB crosses it, or -1.
export function segInter(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? u : -1;
}

export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  const x = ax + dx * t, y = ay + dy * t;
  return { d: Math.hypot(px - x, py - y), t, x, y };
}


// ---------- the drawing pad: drawings arrive as strokes in pad space (PAD x PAD, y down) ----------

export const PAD = 480;

// Skeleton: joints 0 head, 1 neck, 2 hip, 3 lElbow, 4 lHand, 5 rElbow, 6 rHand,
// 7 lKnee, 8 lFoot, 9 rKnee, 10 rFoot. Bones are [parentJoint, childJoint].
export const BONES = [[2, 1], [1, 0], [1, 3], [3, 4], [1, 5], [5, 6], [2, 7], [7, 8], [2, 9], [9, 10]];
export const BONE_KIND = ['torso', 'head', 'arm', 'arm', 'arm', 'arm', 'leg', 'leg', 'leg', 'leg'];

export const fail = msg => ({ ok: false, msg });

export function argBest(pts, score) {
  let best = null, bs = -Infinity;
  for (const p of pts) {
    const s = score(p);
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}

// Closed sub-paths inside one stroke: end returns to start, the path crosses
// itself, or it comes back within a few pixels of an earlier point.
export function findLoops(stroke) {
  const out = [];
  const r = resample(stroke, 5);
  if (r.length < 6) return out;
  const loopish = sub => {
    const b = bboxOf(sub), s = Math.max(b.w, b.h);
    return s > 14 && strokeLen(sub) > s * 2.2;
  };
  const bb = bboxOf(r), size = Math.max(bb.w, bb.h);
  if (dist(r[0], r[r.length - 1]) < Math.max(16, size * 0.35) && loopish(r)) out.push(r);
  for (let i = 0; i < r.length - 1; i++) {
    for (let j = i + 3; j < r.length - 1; j++) {
      const crosses = segInter(r[i].x, r[i].y, r[i + 1].x, r[i + 1].y, r[j].x, r[j].y, r[j + 1].x, r[j + 1].y) >= 0;
      const returns = j >= i + 8 && dist(r[i], r[j]) < 8;
      if (crosses || returns) {
        const sub = r.slice(i, j + 2);
        if (loopish(sub)) { out.push(sub); i = j; break; }
      }
    }
  }
  return out;
}

// ---------- stick men ----------

// A head: distance from the loop's centre doesn't wander too much.
export function roundish(loop) {
  const b = bboxOf(loop);
  if (Math.max(b.w, b.h) / Math.max(1, Math.min(b.w, b.h)) > 2) return false;
  const ds = loop.map(p => Math.hypot(p.x - b.cx, p.y - b.cy));
  const mean = ds.reduce((a, d) => a + d, 0) / ds.length;
  const sd = Math.sqrt(ds.reduce((a, d) => a + (d - mean) ** 2, 0) / ds.length);
  return sd / mean < 0.35;
}

export function checkStickman(strokes) {
  const pts = allPts(strokes);
  if (pts.length < 8) return fail('Draw a whole stick man: head, body, arms, legs.');
  const bb = bboxOf(pts);
  if (bb.h < 110) return fail('Bigger! Use most of the page.');
  if (bb.h < bb.w * 0.65) return fail("That's wider than it is tall. Stick men stand up.");
  // The cheap check before the costly one: a scribble is turned down before its loops are searched. Against height and
  // width both, so arms drawn beefy (outlined, muscled) on a short man still pass
  const ink = strokes.reduce((t, s) => t + strokeLen(s), 0);
  if (ink > (bb.h + bb.w) * 6) return fail("That's a scribble. Stick men are just a few lines.");
  // The head: a roundish loop near the top if there is one; else any closed shape up there (square, spiky, a blob);
  // else just the top of the drawing. It hardly matters what it looks like: it's where the neck hangs from
  let head = null, anyLoop = null;
  for (const s of strokes) {
    for (const l of findLoops(s)) {
      const lb = bboxOf(l), size = Math.max(lb.w, lb.h);
      if (size > bb.h * 0.6 || size < bb.h * 0.05 || lb.cy > bb.y + bb.h * 0.5) continue;
      const found = { cx: lb.cx, cy: lb.cy, r: (lb.w + lb.h) / 4 };
      if (!anyLoop || found.cy < anyLoop.cy) anyLoop = found;
      if (size > bb.h * 0.45 || size < bb.h * 0.08 || lb.cy > bb.y + bb.h * 0.45 || !roundish(l)) continue;
      if (!head || lb.cy < head.cy) head = found;
    }
  }
  if (!head) head = anyLoop;
  if (!head) {
    const r = bb.h * 0.08, top = pts.filter(p => p.y < bb.y + r * 2);
    head = { cx: top.reduce((t, p) => t + p.x, 0) / top.length, cy: bb.y + r, r };
  }
  const below = pts.filter(p => p.y > head.cy + head.r * 1.05);
  if (below.length < 6) return fail('A head alone? Give it a body and legs.');
  const bl = bboxOf(below);
  if (bl.y + bl.h - head.cy < head.r * 3.2) return fail('Too stubby: needs a body and legs under the head.');
  if (bl.w < head.r * 0.9) return fail('Needs arms and legs sticking out.');
  if (!below.some(p => p.x < head.cx - head.r * 0.5) || !below.some(p => p.x > head.cx + head.r * 0.5)) {
    return fail('Arms and legs should stick out on both sides.');
  }
  const neck = below.some(p => Math.abs(p.x - head.cx) < head.r * 1.1 && p.y < head.cy + head.r * 2.4);
  if (!neck) return fail('The body should hang down from the head.');
  return { ok: true, item: { raw: strokes, rig: buildRig(strokes, head, bb) } };
}

// How far apart a rig's points are bound along its ink
const RIG_STEP = 5;

export function buildRig(strokes, head, bb) {
  const rs = strokes.map(s => resample(s, RIG_STEP)).filter(s => s.length > 1);
  const pts = rs.flat();
  const top = head.cy - head.r, bottom = bb.y + bb.h, Hh = bottom - top;
  const J = new Array(11);
  J[0] = { x: head.cx, y: head.cy };
  J[1] = { x: head.cx, y: head.cy + head.r * 1.15 };

  const below = pts.filter(p => p.y > head.cy + head.r * 1.05);
  const band = below.filter(p => p.y > bottom - (bottom - J[1].y) * 0.2);
  let lf = argBest(band, p => -p.x), rf = argBest(band, p => p.x);
  const spread = head.r * 0.6;
  if (!lf || rf.x - lf.x < spread) {
    const mx = lf ? (lf.x + rf.x) / 2 : head.cx;
    lf = { x: mx - spread / 2, y: bottom };
    rf = { x: mx + spread / 2, y: bottom };
  }
  J[8] = lf; J[10] = rf;
  J[2] = { x: lerp(J[1].x, (lf.x + rf.x) / 2, 0.5), y: lerp(J[1].y, bottom, 0.48) };

  const armBand = pts.filter(p => dist(p, J[0]) > head.r * 1.35 && p.y < lerp(J[2].y, bottom, 0.25));
  let lh = argBest(armBand, p => -p.x), rh = argBest(armBand, p => p.x);
  const reachMin = head.r * 0.5;
  if (!lh || J[1].x - lh.x < reachMin) lh = { x: J[1].x - head.r * 1.3, y: lerp(J[1].y, J[2].y, 0.7) };
  if (!rh || rh.x - J[1].x < reachMin) rh = { x: J[1].x + head.r * 1.3, y: lerp(J[1].y, J[2].y, 0.7) };
  J[4] = lh; J[6] = rh;

  // Elbows and knees sit at the midpoint, pulled halfway toward nearby ink so bends survive.
  const mid = (a, b) => {
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const n = argBest(pts, p => -dist(p, m));
    if (n && dist(n, m) < dist(a, b) * 0.35) return { x: (m.x + n.x) / 2, y: (m.y + n.y) / 2 };
    return m;
  };
  J[3] = mid(J[1], J[4]); J[5] = mid(J[1], J[6]);
  J[7] = mid(J[2], J[8]); J[9] = mid(J[2], J[10]);

  for (const [a, b] of BONES) {
    if (dist(J[a], J[b]) < 3) J[b] = { x: J[b].x + 3, y: J[b].y + 3 };
  }
  const lens = BONES.map(([a, b]) => dist(J[a], J[b]) / Hh);
  const binds = rs.map(s => s.map(p => bindPoint(p, J, head)));
  const joints = J.map(p => ({ x: (p.x - J[2].x) / Hh, y: (p.y - J[2].y) / Hh }));
  // And where it all sits on the page, for armor drawn over it to be bound to the same bones (checkArmor)
  return { joints, lens, strokes: binds, headR: head.r / Hh, raw: { J, head: { cx: head.cx, cy: head.cy, r: head.r } } };
}

// Express a point in the frame of its nearest bone: P = A + u*D + v*perp(D).
/**
 * How beefy a stick man's arms and legs are drawn, each 0 (single lines) to 1 (outlined thick, muscled): how much ink
 * went into them against how long they are. A single line lays about its length in ink; an outline twice that and
 * more, its ends and bulges more still. From its rig (its binding is its ink, a point every RIG_STEP along it, and its
 * joints where they were drawn), so saved men have it too.
 */
export function beefOf(rig) {
  const J = rig?.raw?.J;
  if (!J) return { arms: 0, legs: 0 };
  const ink = { arm: 0, leg: 0 }, bone = { arm: 0, leg: 0 };
  for (const stroke of rig.strokes ?? []) for (const { b } of stroke) if (BONE_KIND[b] in ink) ink[BONE_KIND[b]] += RIG_STEP;
  BONES.forEach(([a, b], i) => { if (BONE_KIND[i] in bone) bone[BONE_KIND[i]] += dist(J[a], J[b]); });
  const of = kind => (bone[kind] ? clamp((ink[kind] / bone[kind] - 1.4) / 1.4, 0, 1) : 0);
  return { arms: of('arm'), legs: of('leg') };
}

export function bindPoint(p, J, head) {
  let best = 0, bd = Infinity;
  const dHead = dist(p, J[0]);
  for (let b = 0; b < 10; b++) {
    const A = J[BONES[b][0]], B = J[BONES[b][1]];
    const d = b === 1 ? Math.abs(dHead - head.r) * 0.8 : segDist(p.x, p.y, A.x, A.y, B.x, B.y).d;
    if (d < bd) { bd = d; best = b; }
  }
  if (dHead < head.r * 1.25 && p.y < J[1].y) best = 1;
  const A = J[BONES[best][0]], B = J[BONES[best][1]];
  const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
  return {
    b: best,
    u: ((p.x - A.x) * dx + (p.y - A.y) * dy) / l2,
    v: ((p.x - A.x) * -dy + (p.y - A.y) * dx) / l2,
  };
}

// ---------- blobs: stones and ammo ----------

export function normBlob(strokes) {
  const rs = strokes.map(s => resample(s, 4)).filter(s => s.length > 1);
  const bb = bboxOf(rs.flat());
  const s = Math.max(bb.w, bb.h) || 1;
  const ns = rs.map(st => st.map(p => ({ x: (p.x - bb.cx) / s, y: (p.y - bb.cy) / s })));
  return { strokes: ns, hull: hull(ns.flat()), size: s };
}

// The room a closed outline goes round (shoelace)
const areaOf = pts => Math.abs(pts.reduce((sum, p, i) => { const q = pts[(i + 1) % pts.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;

/** The smallest a stone, a rock or a shield may be across, in pad units: a page shows it as a ring when one's too small */
export const LEAST_ACROSS = { stone: 50, ammo: 50, shield: 34, wheel: 50 };

export function checkBlob(strokes, what) {
  const pts = allPts(strokes);
  if (pts.length < 6) return fail('Draw something first.');
  const bb = bboxOf(pts), size = Math.max(bb.w, bb.h);
  if (size < (LEAST_ACROSS[what] ?? 50)) return fail('Too small. At least as big as the red ring.');
  let closed = false;
  for (const s of strokes) {
    for (const l of findLoops(s)) {
      const lb = bboxOf(l);
      if (Math.max(lb.w, lb.h) >= size * 0.5) closed = true;
    }
    // Or an outline back where it started, around real room: a thin one (a tower shield) is too short to look like a
    // loop to findLoops, which a line drawn there and back must not
    const sb = bboxOf(s);
    if (s.length > 5 && Math.max(sb.w, sb.h) >= size * 0.5 && dist(s[0], s.at(-1)) < Math.max(16, Math.max(sb.w, sb.h) * 0.2) && areaOf(s) > sb.w * sb.h * 0.35) closed = true;
  }
  if (!closed) return fail('Close the shape: one lumpy outline, no gaps.');
  const h = hull(pts);
  let perim = 0;
  for (let i = 0; i < h.length; i++) perim += dist(h[i], h[(i + 1) % h.length]);
  const ink = strokes.reduce((t, s) => t + strokeLen(s), 0);
  if (ink > perim * 2.6) return fail("That's a scribble. Just draw the outline.");
  // A tall tower shield is still a shield; a stone or a rock that long isn't, and a wheel is round
  if (size / Math.max(1, Math.min(bb.w, bb.h)) > (what === 'shield' ? 4.5 : what === 'wheel' ? 1.5 : 3)) {
    const msg = { stone: "Too stretched. That's a beam, not a stone.", shield: 'Too thin for a shield.', wheel: 'Wheels are round.' }[what];
    return fail(msg ?? 'Too stretched. Ammo should be round-ish.');
  }
  return { ok: true };
}

// Sharp direction changes along the ink: the jaggedness that makes things shred.
export function countTurns(strokes) {
  let n = 0;
  for (const s of strokes) {
    const r = resample(s, 6);
    for (let i = 2; i < r.length - 2; i++) {
      const a1 = Math.atan2(r[i].y - r[i - 2].y, r[i].x - r[i - 2].x);
      const a2 = Math.atan2(r[i + 2].y - r[i].y, r[i + 2].x - r[i].x);
      let d = Math.abs(a2 - a1);
      if (d > PI) d = TAU - d;
      if (d > 0.9) { n++; i += 2; }
    }
  }
  return n;
}

export function checkStone(strokes) {
  const r = checkBlob(strokes, 'stone');
  if (!r.ok) return r;
  return { ok: true, item: { raw: strokes, shape: normBlob(strokes) } };
}

export function checkAmmo(strokes) {
  const r = checkBlob(strokes, 'ammo');
  if (!r.ok) return r;
  const shape = normBlob(strokes);
  const spiky = clamp((countTurns(strokes) - 4) / 14, 0, 1);
  const radius = 9 + 7 * clamp(shape.size / PAD, 0, 1);
  const name = spiky > 0.45 ? 'Spiky Death Ball' : radius > 14 ? 'Big Boulder' : 'Rock';
  return { ok: true, item: { raw: strokes, shape, radius, spiky, name } };
}

/** A wheel for the catapult: round, spokes or not; with two, it rolls */
export function checkWheel(strokes) {
  const r = checkBlob(strokes, 'wheel');
  if (!r.ok) return r;
  return { ok: true, item: { raw: strokes, shape: normBlob(strokes) } };
}

// ---------- long things: beams and weapons ----------

export function axisFrame(strokes) {
  const rs = strokes.map(s => resample(s, 4)).filter(s => s.length > 1);
  return { rs, P: pca(rs.flat()) };
}

export function checkBeam(strokes) {
  if (allPts(strokes).length < 4) return fail('Draw a beam first.');
  const { rs, P } = axisFrame(strokes);
  if (P.len < 170) return fail('Longer! Beams are long planks.');
  const wid = Math.max(P.wid, 6);
  if (P.len / wid < 3) return fail('Too chunky. Make it long and thin, like a plank.');
  const midA = (P.minA + P.maxA) / 2, midB = (P.minB + P.maxB) / 2;
  const ns = rs.map(s => s.map(p => {
    const dx = p.x - P.cx, dy = p.y - P.cy;
    return { x: (dx * P.ax + dy * P.ay - midA) / P.len, y: (-dx * P.ay + dy * P.ax - midB) / P.len };
  }));
  return { ok: true, item: { raw: strokes, shape: { strokes: ns, hull: hull(ns.flat()) }, wr: wid / P.len } };
}

/** Where on the pad a weapon is drawn: a tall box, handle end at the bottom, so weapons come out a fighting size */
export const WEAPON_AREA = { x0: 140, y0: 30, x1: 340, y1: 455 };

export function checkSword(strokes) {
  if (allPts(strokes).length < 4) return fail('Draw a weapon first.');
  const box = bboxOf(allPts(strokes)), edge = 6;
  if (box.x < WEAPON_AREA.x0 - edge || box.y < WEAPON_AREA.y0 - edge || box.x + box.w > WEAPON_AREA.x1 + edge || box.y + box.h > WEAPON_AREA.y1 + edge)
    return fail('Keep the weapon inside the box.');
  const { rs, P } = axisFrame(strokes);
  // Any shape will do as a weapon: what it costs is speed, not a refusal (weaponStats)
  if (P.len < 100) return fail('Bigger! A weapon needs some size to it.');
  const wid = Math.max(P.wid, 6);
  // Grip is the lower end; for a sideways weapon, the left end.
  const yMin = P.cy + P.ay * P.minA, yMax = P.cy + P.ay * P.maxA;
  const xMin = P.cx + P.ax * P.minA, xMax = P.cx + P.ax * P.maxA;
  const gripAtMin = Math.abs(P.ay) > 0.35 ? yMin > yMax : xMin < xMax;
  const midB = (P.minB + P.maxB) / 2;
  const ns = rs.map(s => s.map(p => {
    const dx = p.x - P.cx, dy = p.y - P.cy;
    const a = dx * P.ax + dy * P.ay, b = -dx * P.ay + dy * P.ax - midB;
    return gripAtMin ? { x: (a - P.minA) / P.len, y: b / P.len } : { x: (P.maxA - a) / P.len, y: -b / P.len };
  }));
  const ink = rs.reduce((t, s) => t + strokeLen(s), 0);
  const stats = weaponStats(P.len, wid, ink, countTurns(strokes));
  return { ok: true, item: { raw: strokes, shape: { strokes: ns, hull: hull(ns.flat()) }, stats } };
}

export function weaponStats(len, wid, ink, turns) {
  const lr = clamp(len / PAD, 0, 1.2);
  const wr = wid / len;
  const inkR = ink / len;
  const serr = clamp((turns - 6) / 18, 0, 1);
  const weight = clamp(0.35 + wr * 2.4 + Math.max(0, inkR - 2) * 0.12 + lr * 0.45, 0.35, 3.2);
  const s = {
    reach: 22 + 50 * lr,
    dmg: 12 + 19 * weight + 9 * lr,
    cut: clamp(0.3 + 0.55 * serr + 0.35 * (1 - clamp(wr * 4, 0, 1)) - 0.08 * (weight - 1), 0.05, 1),
    // Big and clunky swings slow: a dagger flicks, a great slab of a club takes its time
    swing: 0.32 + 0.32 * weight + 0.12 * lr,
    bleed: serr * 5 + 0.5,
    knock: weight,
    weight, serr, lr, wr,
  };
  s.name = serr > 0.45 ? 'Shredder' : weight > 1.6 ? 'Bone Crusher' : lr > 0.75 && wr < 0.16 ? 'Skewer' : lr < 0.42 ? 'Shiv' : 'Blade';
  return s;
}

export const FIST = { reach: 12, dmg: 7, cut: 0, swing: 0.4, bleed: 0, knock: 0.4, name: 'Fists' };

// ---------- defaults (wobbly, so they still look hand drawn) ----------

export const jit = a => (Math.random() * 2 - 1) * a;

export function lineS(x1, y1, x2, y2) {
  const n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 14));
  const nl = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / nl, ny = (x2 - x1) / nl;
  const bow = jit(4), out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, b = Math.sin(t * PI) * bow;
    out.push({ x: lerp(x1, x2, t) + nx * b + jit(1), y: lerp(y1, y2, t) + ny * b + jit(1) });
  }
  return out;
}

export function ringS(cx, cy, rx, ry, bump = 0.05, n = 30) {
  const out = [], a0 = rand(0, TAU), ph = rand(0, TAU);
  for (let i = 0; i <= n + 2; i++) {
    const a = a0 + (i / n) * TAU, r = 1 + Math.sin(a * 3 + ph) * bump;
    out.push({ x: cx + Math.cos(a) * rx * r + jit(1), y: cy + Math.sin(a) * ry * r + jit(1) });
  }
  return out;
}

export function polyS(pts) {
  let out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = lineS(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    out = out.concat(i ? seg.slice(1) : seg);
  }
  return out;
}

export function closedPoly(pts) {
  const p0 = pts[0], p1 = pts[1];
  return polyS([...pts, p0, [lerp(p0[0], p1[0], 0.12), lerp(p0[1], p1[1], 0.12)]]);
}

export function blobS(cx, cy, rx, ry, n) {
  const pts = [], a0 = rand(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU, r = rand(0.8, 1.08);
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return closedPoly(pts);
}

export function starS(cx, cy, ro, ri, n) {
  const pts = [], a0 = rand(0, TAU);
  for (let i = 0; i < n * 2; i++) {
    const a = a0 + (i / (n * 2)) * TAU, r = i % 2 ? ri : ro * rand(0.9, 1.05);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return closedPoly(pts);
}

export const DEFAULT_RAW = {
  stickmen: () => [
    [ringS(240, 95, 36, 38), lineS(240, 133, 240, 285), lineS(240, 175, 168, 250), lineS(240, 175, 312, 240), lineS(240, 285, 185, 425), lineS(240, 285, 298, 425)],
    [ringS(240, 92, 33, 35), lineS(240, 127, 244, 280), lineS(242, 168, 178, 105), lineS(242, 168, 310, 112), lineS(244, 280, 196, 420), lineS(244, 280, 300, 410)],
  ],
  stones: () => [[blobS(240, 240, 150, 105, 9)], [blobS(240, 240, 125, 125, 7)], [blobS(240, 240, 165, 95, 11)]],
  beams: () => [[closedPoly([[50, 212], [430, 204], [433, 252], [47, 262]]), lineS(85, 236, 400, 229)]],
  ammo: () => [[blobS(240, 240, 115, 110, 12)], [starS(240, 240, 150, 95, 9)]],
  // A wheel: a rim and two spokes across it
  wheels: () => [[ringS(240, 240, 110, 110, 0.03), lineS(150, 240, 330, 240), lineS(240, 150, 240, 330)]],
  // A kite shield at the warrior's hand, a fair size beside him: the example on its page (a shield is never filled in for you)
  shield: () => [[closedPoly([[115, 195], [205, 195], [212, 250], [160, 330], [108, 250]])]],
  swords: () => [
    [polyS([[229, 385], [233, 112], [240, 58], [247, 112], [251, 385]]), lineS(192, 385, 288, 385), closedPoly([[233, 388], [247, 388], [247, 445], [233, 445]])],
    [lineS(215, 445, 215, 62), closedPoly([[215, 85], [290, 52], [322, 128], [290, 205], [215, 172]])],
  ],
};

// ---------- telling drawings apart ----------

// A drawing as points along its ink (ninety at most), fitted by its longer side into a unit box and centred: how it
// looks, whatever size or place it was drawn at
const looksOf = raw => {
  const pts = raw.flatMap(st => resample(st, 4));
  const step = Math.max(1, Math.ceil(pts.length / 90));
  const bb = bboxOf(pts), size = Math.max(bb.w, bb.h) || 1;
  return pts.filter((_, i) => i % step === 0).map(p => ({ x: (p.x - bb.cx) / size, y: (p.y - bb.cy) / size }));
};

/** How unalike two drawings look: the average distance from each one's ink to the other's nearest, both ways (0, alike) */
export const unlike = (a, b) => {
  const near = (from, to) => from.reduce((sum, p) => sum + Math.min(...to.map(q => Math.hypot(p.x - q.x, p.y - q.y))), 0) / from.length;
  const [la, lb] = [looksOf(a), looksOf(b)];
  return (near(la, lb) + near(lb, la)) / 2;
};

// How unalike two stick men stand: their skeletons' joints apart, on average, and their heads' sizes. Stick figures are
// all thin lines, so it's the pose (arms up or down, legs wide, a big head) that tells one from another.
const unlikePose = (a, b) =>
  a.rig.joints.reduce((sum, p, i) => sum + Math.hypot(p.x - b.rig.joints[i].x, p.y - b.rig.joints[i].y), 0) / a.rig.joints.length +
  Math.abs(a.rig.headR - b.rig.headR);

/** How unalike two stick men must stand, and two other drawings look, to count as different (copies come well under) */
export const NEW_POSE = 0.07, NEW_LOOK = 0.035;

/** How far apart two weapons' stats must be, to be different though they look alike (a long spear and a long saw look
 * alike, drawn so thin; they hit nothing alike) */
export const NEW_HEFT = 0.4;

// How differently two weapons handle: weight, reach, jaggedness and width
const unlikeHeft = (a, b) => {
  const s = a.stats ?? {}, t = b.stats ?? {};
  return Math.abs(s.weight - t.weight) / 1.5 + Math.abs(s.lr - t.lr) + Math.abs(s.serr - t.serr) + Math.abs(s.wr - t.wr) * 2;
};

/** Whether two weapons are too alike to count as different: they look alike, and handle alike */
export const sameWeapon = (a, b) => unlike(a.raw, b.raw) <= NEW_LOOK && !(unlikeHeft(a, b) > NEW_HEFT);

/** Whether two stick men stand too alike to count as different */
export const samePose = (a, b) => (a.rig && b.rig ? unlikePose(a, b) <= NEW_POSE : unlike(a.raw, b.raw) <= NEW_LOOK);

/** Which of a kind's drawings are new: each one not like any new one kept before it */
export const freshOf = (kind, items) => {
  const seen = [];
  const apart = (a, b) =>
    kind === 'stickmen' && a.rig && b.rig ? unlikePose(a, b) > NEW_POSE : kind === 'swords' ? !sameWeapon(a, b) : unlike(a.raw, b.raw) > NEW_LOOK;

  return items.map(item => {
    const fresh = seen.every(other => apart(item, other));
    if (fresh) seen.push(item);
    return fresh;
  });
};

// ---------- a gladiator's gear ----------

// Where a warrior's skeleton sits on its page (judged again for a drawing kept before rigs carried it)
const frameOf = warrior => warrior?.rig?.raw ?? (warrior?.raw ? (checkStickman(warrior.raw).item?.rig.raw ?? null) : null);

// How tall a warrior stands on its page, head to feet
const standing = ({ J, head }) => Math.max(...J.map(p => p.y)) - (head.cy - head.r);

/**
 * Armor, drawn over the warrior it's for: each line bound to the bone it lies on, so it moves (and comes off) with it.
 * How much of each part it covers is how well that part is protected; all of it together is how much it weighs.
 */
export function checkArmor(strokes, { warrior } = {}) {
  const frame = frameOf(warrior);
  if (!frame) return fail('Draw your warrior first.');
  const { J, head } = frame, height = standing(frame);
  const xs = J.map(p => p.x);
  const box = { x0: Math.min(...xs) - head.r * 1.6, x1: Math.max(...xs) + head.r * 1.6, y0: head.cy - head.r * 2.2, y1: head.cy - head.r + height + head.r };
  const rs = strokes.map(st => resample(st, 5)).filter(st => st.length > 1);
  const pts = rs.flat();
  if (pts.length < 4) return fail('Draw the armor on your warrior.');
  if (pts.filter(p => p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1).length < pts.length * 0.7) return fail('Draw the armor on your warrior.');

  const binds = rs.map(st => st.map(p => bindPoint(p, J, head)));
  const ink = { head: 0, torso: 0, arm: 0, leg: 0 };
  rs.forEach((st, k) => st.forEach((p, i) => { if (i) ink[BONE_KIND[binds[k][i].b]] += dist(p, st[i - 1]); }));
  const total = ink.head + ink.torso + ink.arm + ink.leg;
  if (total < height * 0.25) return fail('More armor than that.');
  if (total > height * 14) return fail("That's a scribble. Armor is a few plates.");
  // All of a part covered: about a ring round the head, the rest about twice along their bones
  const len = b => dist(J[BONES[b][0]], J[BONES[b][1]]);
  const full = { head: TAU * head.r * 0.8, torso: len(0) * 2.5, arm: (len(2) + len(3) + len(4) + len(5)) * 1.6, leg: (len(6) + len(7) + len(8) + len(9)) * 1.6 };
  const cover = Object.fromEntries(Object.keys(ink).map(k => [k, clamp(ink[k] / full[k], 0, 1)]));
  return { ok: true, item: { raw: strokes, binds, cover, weight: clamp((total / height) * 0.3, 0.1, 2.5) } };
}

/** A shield: one closed outline. Drawn big beside the warrior, it blocks more and weighs more, and takes longer to break. */
export function checkShield(strokes, { warrior } = {}) {
  const r = checkBlob(strokes, 'shield');
  if (!r.ok) return r;
  const frame = frameOf(warrior), shape = normBlob(strokes);
  const rel = clamp(shape.size / (frame ? standing(frame) : PAD * 0.75), 0.15, 1.2);
  const stats = { rel, block: clamp(0.12 + 0.48 * rel, 0.15, 0.6), weight: clamp(0.3 + 1.6 * rel * rel, 0.3, 2.4), hp: Math.round(20 + 70 * rel) };
  return { ok: true, item: { raw: strokes, shape, stats } };
}

export const CHECKS = {
  stickmen: checkStickman,
  stones: checkStone,
  beams: checkBeam,
  ammo: checkAmmo,
  wheels: checkWheel,
  swords: checkSword,
  armor: checkArmor,
  shield: checkShield,
};

// The defaults as they fill a page left empty: redrawn by the same shaky hand as the computer's army (a steadier one
// if a shaky one keeps failing, and at the last, as drawn), so no army looks machine-made
export function makeDefaults(key) {
  const out = [], count = DEFAULT_RAW[key]().length;
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 8; tries++) {
      const r = CHECKS[key](scrawl(DEFAULT_RAW[key]()[i], tries < 5 ? rand(0.7, 1.3) : tries < 7 ? 0.4 : 0));
      if (r.ok) { out.push(r.item); break; }
      if (tries === 7) console.warn('default failed its own check', key, i, r.msg);
    }
  }
  return out;
}

// ---------- judging a drawing sent from a page ----------

/** Most points a drawing may have, all strokes together: plenty for any picture, and a cap on what a page can send */
export const MOST_POINTS = 4000;

/** Most ink a drawing may have, all strokes together, in pad units: well past anything a check accepts, and a cap on the
 * cost of judging it (finding loops grows with the square of a stroke's length) */
export const MOST_INK = 7000;

// Points closer together than this are one point: a pen reports far more than a drawing needs
const NEAREST = 3;

const round = (value, places) => {
	const k = 10 ** places;

	// || 0: no -0, which a save would bring back as 0
	return Math.round(value * k) / k || 0;
};

// Numbers made short for the save and the wire: the rig and shapes to three places, the drawing itself to whole pixels
const tidy = (value, places) => {
	if (typeof value === 'number') return round(value, places);
	if (Array.isArray(value)) return value.map(item => tidy(item, places));
	if (value && typeof value === 'object')
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'raw' ? tidy(item, 0) : tidy(item, places)]));

	return value;
};

/**
 * Strokes as a page sent them, made safe: arrays of finite points on the pad, nothing past MOST_POINTS. Null when
 * there's nothing usable.
 * @param {*} strokes - What arrived
 * @returns {Array<Array<{x: number, y: number}>>|null} The strokes
 */
export const cleanStrokes = strokes => {
	if (!Array.isArray(strokes)) return null;

	let left = MOST_POINTS;
	const out = [];

	for (const stroke of strokes) {
		if (!Array.isArray(stroke) || left <= 0) continue;

		const points = [];

		for (const point of stroke.slice(0, left)) {
			const x = Number(point?.x), y = Number(point?.y), last = points.at(-1);

			if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

			const p = { x: clamp(x, 0, PAD), y: clamp(y, 0, PAD) };

			if (!last || dist(last, p) >= NEAREST) points.push(p);
		}
		left -= points.length;
		if (points.length === 1) points.push({ x: points[0].x + 1, y: points[0].y + 1 });
		if (points.length) out.push(points);
	}

	return out.length ? out : null;
};

/**
 * A drawing judged as one kind of art: { ok: true, item } ready to keep, or { ok: false, msg } saying what's missing
 * @param {string} kind - stickmen, stones, beams, ammo, swords, armor or shield
 * @param {*} strokes - The drawing, as sent
 * @returns {{ ok: boolean, item?: object, msg?: string }} The verdict
 */
export const judge = (kind, strokes, context) => {
	const clean = cleanStrokes(strokes);

	if (!CHECKS[kind]) return fail('Not a kind of art');
	if (!clean) return fail('Draw something first.');
	if (clean.reduce((ink, stroke) => ink + strokeLen(stroke), 0) > MOST_INK) return fail("That's a scribble.");

	const verdict = CHECKS[kind](clean, context);

	return verdict.ok ? { ok: true, item: tidy(verdict.item, 3) } : verdict;
};

/** The defaults for a kind, tidied like a kept drawing */
export const defaultsFor = kind => makeDefaults(kind).map(item => tidy(item, 3));

// ---------- the computer's own army ----------

// A drawing redrawn by a less steady hand: each line wanders a little either side of where it was meant to go, its ends
// overshoot or stop short, and the whole drawing leans a touch. `shake` is how much, about 1.
const scrawl = (strokes, shake = 1) => {
  const lean = rand(-0.09, 0.09) * shake, c = Math.cos(lean), s = Math.sin(lean);
  const turn = ({ x, y }) => ({ x: 240 + (x - 240) * c - (y - 240) * s, y: 240 + (x - 240) * s + (y - 240) * c });

  return strokes.map(stroke => {
    if (stroke.length < 2) return stroke;

    const amp = [rand(2, 6), rand(1, 3)].map(a => a * shake), wave = [rand(80, 200), rand(25, 60)], phase = [rand(0, TAU), rand(0, TAU)];
    let along = 0;
    const out = stroke.map((p, i) => {
      const q = stroke[Math.min(i + 1, stroke.length - 1)], o = stroke[Math.max(i - 1, 0)];
      const tx = q.x - o.x, ty = q.y - o.y, tl = Math.hypot(tx, ty) || 1;

      if (i) along += Math.hypot(p.x - stroke[i - 1].x, p.y - stroke[i - 1].y);

      const off = amp[0] * Math.sin((along / wave[0]) * TAU + phase[0]) + amp[1] * Math.sin((along / wave[1]) * TAU + phase[1]);

      return { x: p.x - (ty / tl) * off + jit(1.5 * shake), y: p.y + (tx / tl) * off + jit(1.5 * shake) };
    });
    // The pen's ends: carried on a little past where it meant to stop, or lifted a little early
    const end = (a, b) => {
      const dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 1, by = rand(-4, 9) * shake;

      return { x: a.x + (dx / l) * by, y: a.y + (dy / l) * by };
    };

    out[0] = end(out[0], out[1]);
    out[out.length - 1] = end(out[out.length - 1], out[out.length - 2]);

    return out.map(turn);
  });
};

// A lumpy stone as a person draws one: a rough outline, its sides uneven, some flatter, a corner or two
const cpuStone = () => {
  const w = rand(110, 170), h = rand(75, 120), n = 6 + ((Math.random() * 5) | 0), a0 = rand(0, TAU);
  const pts = Array.from({ length: n }, (_, i) => {
    const a = a0 + ((i + rand(-0.3, 0.3)) / n) * TAU, r = rand(0.78, 1.08);

    return [240 + Math.cos(a) * w * r, 240 + Math.sin(a) * h * r];
  });

  return [closedPoly(pts)];
};

// A stick man of its own build: head, body, arms and legs in proportions and a pose of their own, knees bent or not
// A limb drawn beefy, from one end to the other: an outline round it, thickest at its muscle (near the near end)
const limbS = (x1, y1, x2, y2, w) => {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / len, ny = (x2 - x1) / len, side = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, bulge = w * (0.45 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.4)));
    side.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, bulge]);
  }
  return closedPoly([...side.map(([x, y, b]) => [x + nx * b, y + ny * b]), ...side.reverse().map(([x, y, b]) => [x - nx * b, y - ny * b])]);
};

// How often the computer draws a man beefy: his arms, his legs (each its own chance)
const CPU_BEEFY = { arms: 0.25, legs: 0.15 };

export const cpuStickman = (beefy = { arms: Math.random() < CPU_BEEFY.arms, legs: Math.random() < CPU_BEEFY.legs }) => {
  const cx = 240 + rand(-20, 20), hr = rand(26, 42), hy = rand(66, 100);
  const neckY = hy + hr, hipY = neckY + rand(110, 160), footY = Math.min(440, hipY + rand(115, 150));
  const shoulderY = neckY + rand(18, 40);
  const hand = side => [cx + side * rand(55, 95), shoulderY + rand(-70, 80)];
  const foot = side => [cx + side * rand(30, 75), footY];
  const [lh, rh, lf, rf] = [hand(-1), hand(1), foot(-1), foot(1)];
  const bent = Math.random() < 0.5;
  const leg = ([fx, fy], side) =>
    beefy.legs ? limbS(cx + side * 6, hipY, fx, fy, rand(12, 17)) : bent ? polyS([[cx, hipY], [cx + side * rand(15, 40), (hipY + fy) / 2 - rand(-10, 10)], [fx, fy]]) : lineS(cx, hipY, fx, fy);
  // A beefy arm: a big bulging outline, and a fist at its end
  const arm = ([hx, hy2]) => (beefy.arms ? [limbS(cx, shoulderY, hx, hy2, rand(13, 19)), ringS(hx, hy2, 11, 11, 0.08)] : [lineS(cx, shoulderY, hx, hy2)]);

  return [
    ringS(cx, hy, hr, hr * rand(0.9, 1.15)),
    lineS(cx, neckY, cx + rand(-8, 8), hipY),
    ...arm(lh),
    ...arm(rh),
    leg(lf, -1),
    leg(rf, 1),
  ];
};

const CPU_RAW = {
  stickmen: () => Array.from({ length: 5 }, cpuStickman),
  stones: () => Array.from({ length: 4 }, cpuStone),
  beams: () => [
    // A rough log: two long sides and rings at its ends
    [lineS(60, 215, 420, 210), lineS(60, 255, 420, 250), ringS(60, 235, 10, 20), ringS(420, 230, 10, 20)],
    // A plank with a knot in it
    [closedPoly([[55, 220], [425, 214], [428, 250], [52, 258]]), ringS(250, 236, 10, 7)],
  ],
  ammo: () => [[ringS(240, 240, 95, 120, 0.04)], [starS(240, 240, 130, 85, 12)], [blobS(240, 240, 80, 80, 7)]],
  wheels: () => [[ringS(240, 240, 100, 100, 0.04), lineS(170, 240, 310, 240), lineS(240, 170, 240, 310)]],
  swords: () => [
    // A spear
    [lineS(240, 450, 240, 90), closedPoly([[222, 110], [240, 38], [258, 110]])],
    // A mace: a handle and a spiked ball
    [lineS(240, 452, 240, 195), starS(240, 135, 72, 46, 8)],
    // A club, thick at the end
    [closedPoly([[232, 452], [250, 452], [282, 160], [262, 66], [218, 66], [200, 160]])],
    // A double axe
    [lineS(240, 452, 240, 50), closedPoly([[240, 80], [172, 58], [158, 150], [240, 170]]), closedPoly([[240, 80], [308, 58], [322, 150], [240, 170]])],
    // A saw of a sword: one edge all teeth
    [polyS([[232, 380], [218, 340], [232, 320], [218, 280], [232, 260], [218, 220], [232, 200], [218, 160], [232, 140], [240, 60], [252, 140], [252, 380]]), lineS(198, 384, 282, 384), closedPoly([[234, 388], [248, 388], [248, 448], [234, 448]])],
  ],
};

/** The computer's war weapons as it designed them (not redrawn shaky): a spear, a mace, a club, a double axe and a saw of a
 * sword, each judged like a player's. For the armory, so a gladiator can borrow one. */
export const cpuWeapons = () => CPU_RAW.swords().map(raw => judge('swords', raw)).filter(v => v.ok).map(v => v.item);

/** The weapons the armory always has: the computer's war weapons and the defaults (an axe and a sword), so their kills,
 * when the computer or a player who drew none fights with them, are counted there too */
export const stockWeapons = () => [...cpuWeapons(), ...DEFAULT_RAW.swords().map(raw => judge('swords', raw).item)];

/** The computer's army: drawings of its own of every kind, each passing the checks a player's do, tidied for keeping */
export const cpuArmy = () =>
  Object.fromEntries(
    Object.keys(CPU_RAW).map(kind => {
      const items = [];
      const count = CPU_RAW[kind]().length;

      for (let i = 0; i < count; i++) {
        for (let tries = 0; tries < 10; tries++) {
          // A shaky hand, and a steadier one if its shaky drawings keep failing the checks
          const verdict = judge(kind, scrawl(CPU_RAW[kind]()[i], tries < 6 ? rand(0.7, 1.3) : 0.4));

          if (verdict.ok) {
            items.push(verdict.item);
            break;
          }
        }
      }

      return [kind, items.length ? items : defaultsFor(kind)];
    }),
  );

// The computer's armor for a warrior of its own, drawn on its skeleton: a helmet, a breastplate, greaves, bracers, some
// or none of them
const cpuArmorOn = ({ J, head }) => {
  const parts = [];
  const along = (a, b, wide) => {
    const A = J[a], B = J[b], l = dist(A, B) || 1, nx = (-(B.y - A.y) / l) * wide, ny = ((B.x - A.x) / l) * wide;
    const at = t => [lerp(A.x, B.x, t), lerp(A.y, B.y, t)];
    const [p, q] = [at(0.25), at(0.9)];
    return closedPoly([[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny]]);
  };
  if (Math.random() < 0.7) {
    const r = head.r * rand(1.15, 1.35), a0 = PI * rand(0.92, 1.05), a1 = TAU * rand(1, 1.06);
    parts.push(Array.from({ length: 18 }, (_, i) => ({ x: head.cx + Math.cos(lerp(a0, a1, i / 17)) * r, y: head.cy + Math.sin(lerp(a0, a1, i / 17)) * r })));
  }
  if (Math.random() < 0.65) parts.push(along(1, 2, head.r * rand(0.7, 1.1)));
  if (Math.random() < 0.45) parts.push(along(7, 8, rand(7, 11)), along(9, 10, rand(7, 11)));
  if (Math.random() < 0.35) parts.push(along(3, 4, rand(6, 9)), along(5, 6, rand(6, 9)));
  return parts;
};

// The first of a kind's drawings that passes, from tries of a maker (shaky, then steadier), or null
const firstPassing = (kind, make, context) => {
  for (let tries = 0; tries < 10; tries++) {
    const verdict = judge(kind, scrawl(make(), tries < 6 ? rand(0.6, 1.1) : 0.3), context);
    if (verdict.ok) return verdict.item;
  }
  return null;
};

/** The computer's own gladiator: a warrior, a weapon, and maybe armor and a shield, all drawn and checked like a player's */
export const cpuGladiator = () => {
  const warrior = firstPassing('stickmen', cpuStickman) ?? defaultsFor('stickmen')[0];
  const weapon = firstPassing('swords', () => pick(CPU_RAW.swords())) ?? defaultsFor('swords')[0];
  const frame = frameOf(warrior);
  const plates = frame && cpuArmorOn(frame);
  const armor = plates?.length ? firstPassing('armor', () => plates, { warrior }) : null;
  // A round shield or a kite, from a buckler to one nearly as tall as he is
  const size = (frame ? standing(frame) : 360) * rand(0.3, 0.62);
  const kite = () => [closedPoly([[150, 120], [330, 120], [345, 230], [240, 400], [135, 230]].map(([x, y]) => [240 + ((x - 240) * size) / 280, 260 + ((y - 260) * size) / 280]))];
  const round = () => [blobS(240, 240, size / 2, size / 2, 10)];
  const shield = Math.random() < 0.55 ? firstPassing('shield', Math.random() < 0.5 ? round : kite, { warrior }) : null;
  return { stickmen: [warrior], swords: [weapon], armor: armor ? [armor] : [], shield: shield ? [shield] : [] };
};
