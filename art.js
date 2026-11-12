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


// Draws a normalized shape ({strokes, hull}) in whatever transform ctx currently has.

// Shape checks, rigging and stat extraction for player drawings.
// Drawings arrive as strokes in pad space (PAD x PAD, y down).

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
  let head = null;
  for (const s of strokes) {
    for (const l of findLoops(s)) {
      const lb = bboxOf(l), size = Math.max(lb.w, lb.h);
      if (size > bb.h * 0.45 || size < bb.h * 0.08 || lb.cy > bb.y + bb.h * 0.45) continue;
      if (!roundish(l)) continue;
      if (!head || lb.cy < head.cy) head = { cx: lb.cx, cy: lb.cy, r: (lb.w + lb.h) / 4 };
    }
  }
  if (!head) return fail('Needs a head: a roundish closed loop near the top.');
  const ink = strokes.reduce((t, s) => t + strokeLen(s), 0);
  if (ink > bb.h * 6) return fail("That's a scribble. Stick men are just a few lines.");
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

export function buildRig(strokes, head, bb) {
  const rs = strokes.map(s => resample(s, 5)).filter(s => s.length > 1);
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
  return { joints, lens, strokes: binds, headR: head.r / Hh };
}

// Express a point in the frame of its nearest bone: P = A + u*D + v*perp(D).
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

export function checkBlob(strokes, what) {
  const pts = allPts(strokes);
  if (pts.length < 6) return fail('Draw something first.');
  const bb = bboxOf(pts), size = Math.max(bb.w, bb.h);
  if (size < 50) return fail('Too tiny. Draw it bigger.');
  let closed = false;
  for (const s of strokes) {
    for (const l of findLoops(s)) {
      const lb = bboxOf(l);
      if (Math.max(lb.w, lb.h) >= size * 0.5) closed = true;
    }
  }
  if (!closed) return fail('Close the shape: one lumpy outline, no gaps.');
  const h = hull(pts);
  let perim = 0;
  for (let i = 0; i < h.length; i++) perim += dist(h[i], h[(i + 1) % h.length]);
  const ink = strokes.reduce((t, s) => t + strokeLen(s), 0);
  if (ink > perim * 2.6) return fail("That's a scribble. Just draw the outline.");
  if (size / Math.max(1, Math.min(bb.w, bb.h)) > 3) {
    return fail(what === 'stone' ? "Too stretched. That's a beam, not a stone." : 'Too stretched. Ammo should be round-ish.');
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
  swords: () => [
    [polyS([[229, 385], [233, 112], [240, 58], [247, 112], [251, 385]]), lineS(192, 385, 288, 385), closedPoly([[233, 388], [247, 388], [247, 445], [233, 445]])],
    [lineS(215, 445, 215, 62), closedPoly([[215, 85], [290, 52], [322, 128], [290, 205], [215, 172]])],
  ],
};

export const CHECKS = { stickmen: checkStickman, stones: checkStone, beams: checkBeam, ammo: checkAmmo, swords: checkSword };

export function makeDefaults(key) {
  const out = [], count = DEFAULT_RAW[key]().length;
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 8; tries++) {
      const r = CHECKS[key](DEFAULT_RAW[key]()[i]);
      if (r.ok) { out.push(r.item); break; }
      if (tries === 7) console.warn('default failed its own check', key, i, r.msg);
    }
  }
  return out;
}

// ---------- judging a drawing sent from a page ----------

/** Most points a drawing may have, all strokes together: plenty for any picture, and a cap on what a page can send */
export const MOST_POINTS = 4000;

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
			const x = Number(point?.x), y = Number(point?.y);

			if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x: clamp(x, 0, PAD), y: clamp(y, 0, PAD) });
		}
		left -= points.length;
		if (points.length === 1) points.push({ x: points[0].x + 1, y: points[0].y + 1 });
		if (points.length) out.push(points);
	}

	return out.length ? out : null;
};

/**
 * A drawing judged as one kind of art: { ok: true, item } ready to keep, or { ok: false, msg } saying what's missing
 * @param {string} kind - stickmen, stones, beams, ammo or swords
 * @param {*} strokes - The drawing, as sent
 * @returns {{ ok: boolean, item?: object, msg?: string }} The verdict
 */
export const judge = (kind, strokes) => {
	const clean = cleanStrokes(strokes);

	if (!CHECKS[kind]) return fail('Not a kind of art');
	if (!clean) return fail('Draw something first.');

	const verdict = CHECKS[kind](clean);

	return verdict.ok ? { ok: true, item: tidy(verdict.item, 3) } : verdict;
};

/** The defaults for a kind, tidied like a kept drawing */
export const defaultsFor = kind => makeDefaults(kind).map(item => tidy(item, 3));

// ---------- the computer's own army ----------

// A stick man of its own build: head, body, arms and legs in proportions and a pose of their own, knees bent or not
const cpuStickman = () => {
  const cx = 240 + rand(-20, 20), hr = rand(26, 42), hy = rand(66, 100);
  const neckY = hy + hr, hipY = neckY + rand(110, 160), footY = Math.min(440, hipY + rand(115, 150));
  const shoulderY = neckY + rand(18, 40);
  const hand = side => [cx + side * rand(55, 95), shoulderY + rand(-70, 80)];
  const foot = side => [cx + side * rand(30, 75), footY];
  const [lh, rh, lf, rf] = [hand(-1), hand(1), foot(-1), foot(1)];
  const bent = Math.random() < 0.5;
  const leg = ([fx, fy], side) =>
    bent ? polyS([[cx, hipY], [cx + side * rand(15, 40), (hipY + fy) / 2 - rand(-10, 10)], [fx, fy]]) : lineS(cx, hipY, fx, fy);

  return [
    ringS(cx, hy, hr, hr * rand(0.9, 1.15)),
    lineS(cx, neckY, cx + rand(-8, 8), hipY),
    lineS(cx, shoulderY, ...lh),
    lineS(cx, shoulderY, ...rh),
    leg(lf, -1),
    leg(rf, 1),
  ];
};

const CPU_RAW = {
  stickmen: () => Array.from({ length: 5 }, cpuStickman),
  // Blockier stones than a person tends to draw: cut corners, flat-ish sides
  stones: () =>
    Array.from({ length: 4 }, () => {
      const w = rand(120, 170), h = rand(80, 120), cut = rand(12, 30);

      return [closedPoly([[240 - w + cut, 240 - h], [240 + w - cut, 240 - h + rand(-8, 8)], [240 + w, 240 - h + cut], [240 + w + rand(-6, 6), 240 + h - cut], [240 + w - cut, 240 + h], [240 - w + cut, 240 + h + rand(-8, 8)], [240 - w, 240 + h - cut], [240 - w + rand(-6, 6), 240 - h + cut]])];
    }),
  beams: () => [
    // A rough log: two long sides and rings at its ends
    [lineS(60, 215, 420, 210), lineS(60, 255, 420, 250), ringS(60, 235, 10, 20), ringS(420, 230, 10, 20)],
    // A plank with a knot in it
    [closedPoly([[55, 220], [425, 214], [428, 250], [52, 258]]), ringS(250, 236, 10, 7)],
  ],
  ammo: () => [[ringS(240, 240, 95, 120, 0.04)], [starS(240, 240, 130, 85, 12)], [blobS(240, 240, 80, 80, 7)]],
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

/** The computer's army: drawings of its own of every kind, each passing the checks a player's do, tidied for keeping */
export const cpuArmy = () =>
  Object.fromEntries(
    Object.keys(CPU_RAW).map(kind => {
      const items = [];
      const count = CPU_RAW[kind]().length;

      for (let i = 0; i < count; i++) {
        for (let tries = 0; tries < 10; tries++) {
          const verdict = judge(kind, CPU_RAW[kind]()[i]);

          if (verdict.ok) {
            items.push(verdict.item);
            break;
          }
        }
      }

      return [kind, items.length ? items : defaultsFor(kind)];
    }),
  );

/** How many of the computer's drawings pass, kind by kind, out of how many it means to have: for tests */
export const cpuCounts = () => Object.fromEntries(Object.keys(CPU_RAW).map(kind => [kind, CPU_RAW[kind]().length]));
