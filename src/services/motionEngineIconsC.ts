// Cohesive 6-variant ES5 Canvas 2D Hero Icons (Part C: Science, Edu, Medical, Gaming, UI/Design, Tech)
// Appended directly inside `var G = { ...` in motionGeometryEngine.ts.

export const ENGINE_HERO_ICONS_C_JS = `
      gamepad: function(x, y, s, bodyCol, padCol, btnCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#1e293b', pc = padCol || '#4f46e5', ac = btnCol || '#00e5ff';
        var pulse = Math.sin(tt * 3.2) * s * 0.028;
        var actBtn = Math.floor((tt * 2.6) % 4);
        if (vv === 1) {
          G.box(x, y, s * 0.86, s * 0.72, s * 0.16, '#0f172a', rim, lw);
          G.pill(x, y - s * 0.24, x, y - s * 0.34, lw * 1.1, ac);
          G.disc(x, y - s * 0.36, s * 0.06, '#ffd700', rim, lw * 0.6);
          G.box(x, y + s * 0.04, s * 0.64, s * 0.38, s * 0.14, bc, pc, lw);
          G.pill(x - s * 0.18, y + s * 0.04, x - s * 0.08, y + s * 0.04, lw * 1.2, '#f8fafc');
          G.pill(x - s * 0.13, y - s * 0.01, x - s * 0.13, y + s * 0.09, lw * 1.2, '#f8fafc');
          G.disc(x + s * 0.14, y + s * 0.01 + pulse * 0.4, s * 0.052, actBtn % 2 === 0 ? ac : '#f43f5e', null, 0);
          G.disc(x + s * 0.22, y + s * 0.08 - pulse * 0.4, s * 0.052, '#ffd700', null, 0);
        } else if (vv === 2) {
          G.box(x, y + s * 0.22, s * 0.74, s * 0.26, s * 0.08, bc, rim, lw);
          G.pill(x, y + s * 0.14, x + pulse * 1.4, y - s * 0.14, lw * 1.5, '#94a3b8');
          G.disc(x + pulse * 1.4, y - s * 0.20, s * 0.17, '#f43f5e', rim, lw);
          G.disc(x - s * 0.22, y + s * 0.20, s * 0.06, ac, rim, lw * 0.6);
          G.disc(x + s * 0.22, y + s * 0.20, s * 0.06, '#ffd700', rim, lw * 0.6);
        } else if (vv === 3) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.box(x, y, s * 0.66, s * 0.38, s * 0.16, pc, rim, lw);
          G.disc(x - s * 0.15, y, s * 0.085, bc, ac, lw * 0.75);
          G.disc(x + s * 0.15, y - s * 0.05 + pulse * 0.35, s * 0.045, '#ffd700', null, 0);
          G.disc(x + s * 0.21, y + s * 0.04, s * 0.045, ac, null, 0);
        } else if (vv === 4) {
          G.box(x - s * 0.22, y + s * 0.12, s * 0.24, s * 0.42, s * 0.10, bc, rim, lw);
          G.box(x + s * 0.22, y + s * 0.12, s * 0.24, s * 0.42, s * 0.10, bc, rim, lw);
          G.box(x, y - s * 0.04, s * 0.78, s * 0.42, s * 0.18, pc, rim, lw);
          G.pill(x - s * 0.24, y - s * 0.04, x - s * 0.12, y - s * 0.04, lw * 1.3, rim);
          G.pill(x - s * 0.18, y - s * 0.10, x - s * 0.18, y + s * 0.02, lw * 1.3, rim);
          G.disc(x + s * 0.18, y - s * 0.09, s * 0.046, actBtn === 0 ? '#ffd700' : ac, null, 0);
          G.disc(x + s * 0.18, y + s * 0.02, s * 0.046, actBtn === 1 ? '#f43f5e' : '#38bdf8', null, 0);
          G.disc(x + s * 0.12, y - s * 0.035, s * 0.046, '#f43f5e', null, 0);
          G.disc(x + s * 0.24, y - s * 0.035, s * 0.046, '#ffd700', null, 0);
        } else if (vv === 5) {
          G.box(x, y, s * 0.90, s * 0.56, s * 0.12, bc, rim, lw);
          G.box(x, y, s * 0.46, s * 0.40, s * 0.06, '#0f172a', ac, lw * 0.8);
          G.star(x, y, s * 0.11 + pulse * 0.4, s * 0.05, 5, tt * 0.7, '#ffd700', rim, lw * 0.5);
          G.box(x - s * 0.34, y, s * 0.12, s * 0.36, s * 0.04, pc, rim, lw * 0.7);
          G.box(x + s * 0.34, y, s * 0.12, s * 0.36, s * 0.04, '#f43f5e', rim, lw * 0.7);
        } else {
          G.box(x - s * 0.24, y + s * 0.12, s * 0.24, s * 0.44, s * 0.11, bc, rim, lw);
          G.box(x + s * 0.24, y + s * 0.12, s * 0.24, s * 0.44, s * 0.11, bc, rim, lw);
          G.box(x, y - s * 0.06, s * 0.82, s * 0.42, s * 0.19, pc, rim, lw);
          G.disc(x - s * 0.20, y - s * 0.06, s * 0.10, bc, ac, lw * 0.75);
          G.disc(x - s * 0.20 + pulse * 0.7, y - s * 0.06, s * 0.055, ac, null, 0);
          G.disc(x + s * 0.15, y - s * 0.10, s * 0.048, actBtn === 0 ? '#ffd700' : ac, rim, lw * 0.4);
          G.disc(x + s * 0.23, y - s * 0.02, s * 0.048, actBtn === 1 ? '#f43f5e' : '#38bdf8', rim, lw * 0.4);
          G.disc(x + s * 0.15, y + s * 0.05, s * 0.048, actBtn === 2 ? '#ffd700' : '#f43f5e', rim, lw * 0.4);
        }
      },
      vrHeadset: function(x, y, s, bodyCol, visorCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#1e293b', vc = visorCol || '#00e5ff', ac = accCol || '#ffd700';
        var scan = Math.sin(tt * 2.6) * s * 0.18;
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.box(x, y + s * 0.02, s * 0.64, s * 0.36, s * 0.10, bc, rim, lw);
          G.poly([[x - s * 0.26, y - s * 0.08], [x + s * 0.26, y - s * 0.08], [x + s * 0.20, y + s * 0.14], [x + s * 0.07, y + s * 0.14], [x, y + s * 0.06], [x - s * 0.07, y + s * 0.14], [x - s * 0.20, y + s * 0.14]], vc, rim, lw * 0.75, true);
          G.disc(x + scan * 0.6, y + s * 0.02, s * 0.055, ac, null, 0);
        } else if (vv === 2) {
          G.capsule(x, y - s * 0.18, s * 0.68, s * 0.20, '#4f46e5', rim, lw * 0.85);
          G.box(x, y + s * 0.04, s * 0.84, s * 0.44, s * 0.13, bc, rim, lw);
          G.disc(x - s * 0.19, y + s * 0.04, s * 0.13, vc, rim, lw * 0.8);
          G.disc(x + s * 0.19, y + s * 0.04, s * 0.13, vc, rim, lw * 0.8);
          G.disc(x - s * 0.19 + scan * 0.2, y + s * 0.04, s * 0.05, ac, null, 0);
          G.disc(x + s * 0.19 + scan * 0.2, y + s * 0.04, s * 0.05, ac, null, 0);
        } else if (vv === 3) {
          G.box(x, y, s * 0.86, s * 0.48, s * 0.14, bc, rim, lw);
          G.box(x, y, s * 0.70, s * 0.30, s * 0.08, '#0f172a', vc, lw * 0.8);
          G.pill(x - s * 0.26, y - s * 0.04, x - s * 0.06, y - s * 0.04, lw * 1.2, vc);
          G.pill(x + s * 0.06, y + s * 0.04, x + s * 0.26, y + s * 0.04, lw * 1.2, ac);
          G.ring(x, y - s * 0.28, s * 0.18, lw, Math.PI * 1.15, Math.PI * 1.85, ac);
        } else if (vv === 4) {
          G.box(x, y - s * 0.04, s * 0.82, s * 0.42, s * 0.12, bc, rim, lw);
          G.box(x, y - s * 0.04, s * 0.64, s * 0.24, s * 0.06, vc, rim, lw * 0.7);
          G.pill(x + scan, y - s * 0.14, x + scan, y + s * 0.06, lw * 1.2, ac);
          G.disc(x - s * 0.24, y + s * 0.28, s * 0.085, '#4f46e5', rim, lw * 0.75);
          G.disc(x + s * 0.24, y + s * 0.28, s * 0.085, '#4f46e5', rim, lw * 0.75);
        } else if (vv === 5) {
          G.ring(x, y - s * 0.06, s * 0.36, lw * 1.3, Math.PI, Math.PI * 2, '#4f46e5');
          G.box(x, y + s * 0.04, s * 0.84, s * 0.46, s * 0.14, bc, rim, lw);
          G.poly([[x - s * 0.32, y - s * 0.08], [x + s * 0.32, y - s * 0.08], [x + s * 0.26, y + s * 0.18], [x + s * 0.09, y + s * 0.18], [x, y + s * 0.08], [x - s * 0.09, y + s * 0.18], [x - s * 0.26, y + s * 0.18]], vc, rim, lw * 0.8, true);
          G.capsule(x + scan * 0.5, y + s * 0.04, s * 0.16, s * 0.05, ac, null, 0);
        } else {
          G.box(x - s * 0.42, y, s * 0.14, s * 0.26, s * 0.05, '#4f46e5', rim, lw * 0.8);
          G.box(x + s * 0.42, y, s * 0.14, s * 0.26, s * 0.05, '#4f46e5', rim, lw * 0.8);
          G.box(x, y, s * 0.80, s * 0.48, s * 0.13, bc, rim, lw);
          G.poly([[x - s * 0.31, y - s * 0.12], [x + s * 0.31, y - s * 0.12], [x + s * 0.26, y + s * 0.16], [x + s * 0.08, y + s * 0.16], [x, y + s * 0.06], [x - s * 0.08, y + s * 0.16], [x - s * 0.26, y + s * 0.16]], vc, rim, lw * 0.8, true);
          G.pill(x + scan * 0.5, y - s * 0.08, x + scan * 0.5 + s * 0.08, y + s * 0.10, lw * 1.1, rim);
        }
      },
      dice: function(x, y, s, faceCol, pipCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var fc = faceCol || '#4f46e5', pc = pipCol || '#f8fafc', ac = accCol || '#ffd700';
        var rock = Math.sin(tt * 2.4) * 0.12;
        var scP = 1 + 0.07 * Math.sin(tt * 3.0);
        if (vv === 1) {
          G.part(x - s * 0.15, y - s * 0.10, -0.18 + rock, 1, 1, function() {
            G.box(0, 0, s * 0.46, s * 0.46, s * 0.09, fc, rim, lw);
            G.disc(-s * 0.10, -s * 0.10, s * 0.045, pc, null, 0);
            G.disc(s * 0.10, s * 0.10, s * 0.045, pc, null, 0);
            G.disc(0, 0, s * 0.045, ac, null, 0);
          });
          G.part(x + s * 0.16, y + s * 0.14, 0.16 - rock, 1, 1, function() {
            G.box(0, 0, s * 0.46, s * 0.46, s * 0.09, '#f43f5e', rim, lw);
            G.disc(-s * 0.10, -s * 0.10, s * 0.045, pc, null, 0);
            G.disc(s * 0.10, -s * 0.10, s * 0.045, pc, null, 0);
            G.disc(-s * 0.10, s * 0.10, s * 0.045, pc, null, 0);
            G.disc(s * 0.10, s * 0.10, s * 0.045, pc, null, 0);
          });
        } else if (vv === 2) {
          G.part(x, y, rock * 0.8, 1, 1, function() {
            G.ngon(0, 0, s * 0.42, 6, -Math.PI / 2, fc, rim, lw);
            G.poly([[0, -s * 0.40], [s * 0.34, -s * 0.20], [0, 0], [-s * 0.34, -s * 0.20]], '#00e5ff', rim, lw * 0.75, true);
            G.disc(0, -s * 0.20, s * 0.055 * scP, ac, null, 0);
            G.disc(-s * 0.16, s * 0.10, s * 0.045, pc, null, 0);
            G.disc(s * 0.16, s * 0.10, s * 0.045, pc, null, 0);
          });
        } else if (vv === 3) {
          G.disc(x, y, s * 0.43, '#1e293b', rim, lw);
          G.part(x, y, rock, 1, 1, function() {
            G.box(0, 0, s * 0.52, s * 0.52, s * 0.11, fc, rim, lw);
            G.disc(-s * 0.12, -s * 0.12, s * 0.05, pc, null, 0);
            G.disc(s * 0.12, -s * 0.12, s * 0.05, pc, null, 0);
            G.disc(0, 0, s * 0.055 * scP, ac, null, 0);
            G.disc(-s * 0.12, s * 0.12, s * 0.05, pc, null, 0);
            G.disc(s * 0.12, s * 0.12, s * 0.05, pc, null, 0);
          });
        } else if (vv === 4) {
          G.part(x, y, rock * 0.7, 1, 1, function() {
            G.ngon(0, 0, s * 0.42, 8, Math.PI / 8, '#1e293b', rim, lw);
            G.poly([[0, -s * 0.26], [s * 0.24, s * 0.16], [-s * 0.24, s * 0.16]], fc, ac, lw * 0.9, true);
            G.star(0, 0, s * 0.10 * scP, s * 0.045 * scP, 4, tt * 0.5, ac, null, 0);
          });
        } else if (vv === 5) {
          G.part(x, y, rock, 1, 1, function() {
            G.box(0, 0, s * 0.68, s * 0.68, s * 0.14, '#f8fafc', '#1e293b', lw);
            G.disc(-s * 0.16, -s * 0.16, s * 0.06, fc, null, 0);
            G.disc(s * 0.16, -s * 0.16, s * 0.06, fc, null, 0);
            G.disc(-s * 0.16, 0, s * 0.06, fc, null, 0);
            G.disc(s * 0.16, 0, s * 0.06, fc, null, 0);
            G.disc(-s * 0.16, s * 0.16, s * 0.06, '#f43f5e', null, 0);
            G.disc(s * 0.16, s * 0.16, s * 0.06, '#f43f5e', null, 0);
          });
        } else {
          G.part(x, y, rock, 1, 1, function() {
            G.box(0, 0, s * 0.70, s * 0.70, s * 0.15, fc, rim, lw);
            G.disc(-s * 0.17, -s * 0.17, s * 0.065, pc, null, 0);
            G.disc(s * 0.17, -s * 0.17, s * 0.065, pc, null, 0);
            G.disc(0, 0, s * 0.075 * scP, ac, rim, lw * 0.5);
            G.disc(-s * 0.17, s * 0.17, s * 0.065, pc, null, 0);
            G.disc(s * 0.17, s * 0.17, s * 0.065, pc, null, 0);
          });
        }
      },
      headphones: function(x, y, s, bandCol, cupCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bandCol || '#4f46e5', cc = cupCol || '#1e293b', ac = accCol || '#00e5ff';
        var eq1 = s * (0.14 + 0.08 * Math.sin(tt * 3.4));
        var eq2 = s * (0.24 + 0.08 * Math.cos(tt * 3.8));
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.ring(x, y + s * 0.02, s * 0.25, lw * 1.4, Math.PI, Math.PI * 2, bc);
          G.box(x - s * 0.24, y + s * 0.09, s * 0.12, s * 0.24, s * 0.05, cc, ac, lw * 0.8);
          G.box(x + s * 0.24, y + s * 0.09, s * 0.12, s * 0.24, s * 0.05, cc, ac, lw * 0.8);
          G.pill(x - s * 0.08, y + s * 0.16, x - s * 0.08, y + s * 0.16 - eq1, lw * 1.1, '#ffd700');
          G.pill(x, y + s * 0.16, x, y + s * 0.16 - eq2, lw * 1.1, ac);
          G.pill(x + s * 0.08, y + s * 0.16, x + s * 0.08, y + s * 0.16 - eq1, lw * 1.1, '#ffd700');
        } else if (vv === 2) {
          G.ring(x, y + s * 0.04, s * 0.34, lw * 1.8, Math.PI, Math.PI * 2, bc);
          G.box(x - s * 0.32, y + s * 0.12, s * 0.18, s * 0.32, s * 0.07, cc, rim, lw);
          G.box(x + s * 0.32, y + s * 0.12, s * 0.18, s * 0.32, s * 0.07, cc, rim, lw);
          G.pill(x - s * 0.30, y + s * 0.26, x - s * 0.06, y + s * 0.34, lw * 1.1, ac);
          G.disc(x - s * 0.05, y + s * 0.34, s * 0.055, '#ffd700', rim, lw * 0.6);
        } else if (vv === 3) {
          G.box(x, y, s * 0.82, s * 0.80, s * 0.18, '#1e293b', rim, lw);
          G.ring(x, y + s * 0.02, s * 0.25, lw * 1.4, Math.PI, Math.PI * 2, bc);
          G.box(x - s * 0.25, y + s * 0.09, s * 0.13, s * 0.25, s * 0.05, ac, rim, lw * 0.75);
          G.box(x + s * 0.25, y + s * 0.09, s * 0.13, s * 0.25, s * 0.05, ac, rim, lw * 0.75);
        } else if (vv === 4) {
          G.ring(x, y + s * 0.04, s * 0.34, lw * 1.8, Math.PI, Math.PI * 2, bc);
          G.box(x - s * 0.33, y + s * 0.14, s * 0.17, s * 0.32, s * 0.07, cc, rim, lw);
          G.box(x + s * 0.33, y + s * 0.14, s * 0.17, s * 0.32, s * 0.07, cc, rim, lw);
          G.pill(x - s * 0.10, y + s * 0.22, x - s * 0.10, y + s * 0.22 - eq1, lw * 1.3, ac);
          G.pill(x, y + s * 0.22, x, y + s * 0.22 - eq2, lw * 1.3, '#ffd700');
          G.pill(x + s * 0.10, y + s * 0.22, x + s * 0.10, y + s * 0.22 - eq1, lw * 1.3, '#f43f5e');
        } else if (vv === 5) {
          G.ring(x, y, s * 0.36, lw * 1.6, Math.PI * 1.05, Math.PI * 1.95, rim);
          G.disc(x - s * 0.32, y + s * 0.10, s * 0.15, cc, bc, lw);
          G.disc(x + s * 0.32, y + s * 0.10, s * 0.15, cc, bc, lw);
          G.ring(x, y + s * 0.06, s * 0.14 + eq1 * 0.25, lw, -0.5, 0.5, ac);
          G.ring(x, y + s * 0.06, s * 0.14 + eq1 * 0.25, lw, Math.PI - 0.5, Math.PI + 0.5, ac);
        } else {
          G.ring(x, y + s * 0.05, s * 0.34, lw * 1.8, Math.PI, Math.PI * 2, bc);
          G.box(x - s * 0.32, y + s * 0.14, s * 0.18, s * 0.34, s * 0.08, cc, rim, lw);
          G.box(x + s * 0.32, y + s * 0.14, s * 0.18, s * 0.34, s * 0.08, cc, rim, lw);
          G.capsule(x - s * 0.32, y + s * 0.14, s * 0.07, s * 0.20, ac, null, 0);
          G.capsule(x + s * 0.32, y + s * 0.14, s * 0.07, s * 0.20, ac, null, 0);
        }
      },
      atom: function(x, y, s, nucCol, orb1Col, orb2Col, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.030), vv = G._v(v);
        var nc = nucCol || '#ffd700', o1 = orb1Col || '#00e5ff', o2 = orb2Col || '#4f46e5';
        var a1 = tt * 1.6, pulse = 1 + 0.09 * Math.sin(tt * 3.0);
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.oval(x, y, s * 0.34, s * 0.13, Math.PI / 6, null, o1, lw * 0.9);
          G.oval(x, y, s * 0.34, s * 0.13, -Math.PI / 6, null, o2, lw * 0.9);
          G.disc(x, y, s * 0.10 * pulse, nc, rim, lw * 0.7);
          G.disc(x + Math.cos(a1) * s * 0.28, y + Math.sin(a1) * s * 0.14, s * 0.048, '#f43f5e', rim, lw * 0.5);
        } else if (vv === 2) {
          G.oval(x, y, s * 0.42, s * 0.16, 0, null, o1, lw);
          G.oval(x, y, s * 0.42, s * 0.16, Math.PI / 3, null, o2, lw);
          G.oval(x, y, s * 0.42, s * 0.16, -Math.PI / 3, null, rim, lw);
          G.disc(x, y, s * 0.11 * pulse, nc, rim, lw * 0.8);
          G.disc(x + Math.cos(a1) * s * 0.42, y + Math.sin(a1) * s * 0.16, s * 0.055, o1, rim, lw * 0.55);
        } else if (vv === 3) {
          G.ngon(x, y, s * 0.43, 6, 0, '#1e293b', rim, lw);
          G.ring(x, y, s * 0.29, lw * 0.9, 0, Math.PI * 2, o1);
          G.ring(x, y, s * 0.19, lw * 0.9, 0, Math.PI * 2, o2);
          G.disc(x, y, s * 0.095 * pulse, nc, rim, lw * 0.7);
          G.disc(x + Math.cos(a1) * s * 0.29, y + Math.sin(a1) * s * 0.29, s * 0.052, nc, rim, lw * 0.5);
          G.disc(x + Math.cos(-a1 * 1.3) * s * 0.19, y + Math.sin(-a1 * 1.3) * s * 0.19, s * 0.048, o1, rim, lw * 0.5);
        } else if (vv === 4) {
          G.oval(x, y, s * 0.42, s * 0.16, Math.PI / 4, null, o1, lw * 1.05);
          G.oval(x, y, s * 0.42, s * 0.16, -Math.PI / 4, null, o2, lw * 1.05);
          G.disc(x - s * 0.05, y - s * 0.03, s * 0.075 * pulse, nc, rim, lw * 0.65);
          G.disc(x + s * 0.05, y + s * 0.04, s * 0.075 * pulse, '#f43f5e', rim, lw * 0.65);
          var rx = Math.cos(a1) * s * 0.42, ry = Math.sin(a1) * s * 0.16;
          var c4 = Math.cos(Math.PI / 4), s4 = Math.sin(Math.PI / 4);
          G.disc(x + rx * c4 - ry * s4, y + rx * s4 + ry * c4, s * 0.055, o1, rim, lw * 0.5);
        } else if (vv === 5) {
          G.box(x, y, s * 0.82, s * 0.80, s * 0.16, '#0f172a', rim, lw);
          G.oval(x, y, s * 0.34, s * 0.13, Math.PI / 5, null, o1, lw * 0.9);
          G.oval(x, y, s * 0.34, s * 0.13, -Math.PI / 5, null, o2, lw * 0.9);
          G.disc(x, y, s * 0.10 * pulse, nc, rim, lw * 0.7);
          G.disc(x + Math.cos(a1) * s * 0.28, y + Math.sin(a1) * s * 0.22, s * 0.048, o1, rim, lw * 0.5);
        } else {
          G.oval(x, y, s * 0.43, s * 0.17, 0.45, null, o1, lw * 1.05);
          G.oval(x, y, s * 0.43, s * 0.17, -0.45, null, o2, lw * 1.05);
          G.oval(x, y, s * 0.17, s * 0.43, 0, null, rim, lw * 0.95);
          G.disc(x, y, s * 0.11 * pulse, nc, rim, lw * 0.8);
          G.disc(x + Math.cos(a1) * s * 0.17, y + Math.sin(a1) * s * 0.43, s * 0.055, '#ffd700', rim, lw * 0.55);
          G.disc(x + Math.cos(-a1) * s * 0.38, y + Math.sin(-a1) * s * 0.20, s * 0.055, o1, rim, lw * 0.55);
        }
      },
      microscope: function(x, y, s, bodyCol, lensCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#1e293b', lc = lensCol || '#00e5ff', ac = accCol || '#ffd700';
        var focus = Math.sin(tt * 2.5) * s * 0.04;
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.capsule(x, y + s * 0.28, s * 0.46, s * 0.09, bc, rim, lw * 0.8);
          G.pill(x + s * 0.12, y - s * 0.18, x + s * 0.12, y + s * 0.24, lw * 1.5, '#4f46e5');
          G.part(x - s * 0.06, y - s * 0.08 + focus, -0.35, 1, 1, function() {
            G.box(0, 0, s * 0.14, s * 0.36, s * 0.04, lc, rim, lw * 0.8);
          });
          G.capsule(x - s * 0.08, y + s * 0.14, s * 0.24, s * 0.06, ac, null, 0);
        } else if (vv === 2) {
          G.box(x, y, s * 0.80, s * 0.80, s * 0.15, '#1e293b', rim, lw);
          G.capsule(x, y + s * 0.24, s * 0.44, s * 0.08, '#4f46e5', rim, lw * 0.7);
          G.box(x, y - s * 0.06 + focus, s * 0.16, s * 0.36, s * 0.04, lc, rim, lw * 0.8);
          G.capsule(x, y + s * 0.13, s * 0.28, s * 0.06, ac, null, 0);
        } else if (vv === 3) {
          G.capsule(x, y + s * 0.36, s * 0.62, s * 0.11, bc, rim, lw);
          G.ring(x + s * 0.06, y + s * 0.04, s * 0.28, lw * 1.6, -Math.PI * 0.55, Math.PI * 0.48, '#4f46e5');
          G.part(x - s * 0.06, y - s * 0.12 + focus, 0.35, 1, 1, function() {
            G.box(0, 0, s * 0.16, s * 0.42, s * 0.04, lc, rim, lw * 0.85);
            G.box(0, -s * 0.22, s * 0.11, s * 0.08, s * 0.02, ac, rim, lw * 0.6);
          });
          G.capsule(x - s * 0.12, y + s * 0.18, s * 0.30, s * 0.07, ac, rim, lw * 0.65);
        } else if (vv === 4) {
          G.disc(x - s * 0.04, y - s * 0.04, s * 0.28, lc, rim, lw);
          G.disc(x - s * 0.04, y - s * 0.04, s * 0.18, '#0f172a', ac, lw * 0.7);
          G.disc(x - s * 0.04 + focus * 0.5, y - s * 0.04, s * 0.07, '#f43f5e', null, 0);
          G.pill(x + s * 0.16, y + s * 0.16, x + s * 0.36, y + s * 0.36, lw * 2.0, '#4f46e5');
        } else if (vv === 5) {
          G.capsule(x, y + s * 0.36, s * 0.60, s * 0.10, bc, rim, lw);
          G.box(x, y - s * 0.10 + focus, s * 0.18, s * 0.44, s * 0.05, '#4f46e5', rim, lw);
          G.box(x, y - s * 0.34 + focus, s * 0.12, s * 0.10, s * 0.03, ac, rim, lw * 0.65);
          G.capsule(x, y + s * 0.16, s * 0.36, s * 0.07, lc, rim, lw * 0.7);
          G.disc(x + s * 0.20, y + s * 0.04, s * 0.075, ac, rim, lw * 0.6);
        } else {
          G.capsule(x, y + s * 0.37, s * 0.64, s * 0.11, bc, rim, lw);
          G.ring(x + s * 0.08, y + s * 0.04, s * 0.28, lw * 1.7, -Math.PI * 0.55, Math.PI * 0.45, bc);
          G.part(x - s * 0.05, y - s * 0.12 + focus, 0.32, 1, 1, function() {
            G.box(0, 0, s * 0.16, s * 0.44, s * 0.04, '#4f46e5', rim, lw * 0.9);
            G.box(0, s * 0.23, s * 0.11, s * 0.09, s * 0.02, ac, rim, lw * 0.6);
          });
          G.capsule(x - s * 0.12, y + s * 0.18, s * 0.32, s * 0.07, lc, rim, lw * 0.7);
          G.disc(x + s * 0.20, y + s * 0.04, s * 0.08, ac, rim, lw * 0.65);
        }
      },
      telescope: function(x, y, s, tubeCol, tripCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var tc = tubeCol || '#4f46e5', tr = tripCol || '#1e293b', ac = accCol || '#ffd700';
        var sweep = Math.sin(tt * 1.8) * 0.10;
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.part(x - s * 0.02, y - s * 0.04, -0.45 + sweep, 1, 1, function() {
            G.box(0, 0, s * 0.48, s * 0.16, s * 0.04, tc, rim, lw * 0.85);
            G.box(s * 0.24, 0, s * 0.10, s * 0.22, s * 0.03, '#00e5ff', rim, lw * 0.7);
          });
          G.pill(x, y + s * 0.02, x - s * 0.16, y + s * 0.30, lw * 1.2, tr);
          G.pill(x, y + s * 0.02, x + s * 0.16, y + s * 0.30, lw * 1.2, tr);
          G.star(x + s * 0.24, y - s * 0.22, s * 0.08, s * 0.035, 4, tt * 0.5, ac, null, 0);
        } else if (vv === 2) {
          G.pill(x, y + s * 0.04, x - s * 0.22, y + s * 0.38, lw * 1.4, tr);
          G.pill(x, y + s * 0.04, x + s * 0.22, y + s * 0.38, lw * 1.4, tr);
          G.pill(x, y + s * 0.04, x, y + s * 0.40, lw * 1.4, tr);
          G.part(x, y - s * 0.10, -0.42 + sweep, 1, 1, function() {
            G.poly([[-s * 0.34, -s * 0.06], [s * 0.28, -s * 0.14], [s * 0.28, s * 0.14], [-s * 0.34, s * 0.06]], tc, rim, lw, true);
            G.oval(s * 0.28, 0, s * 0.05, s * 0.14, 0, '#00e5ff', rim, lw * 0.7);
          });
          G.disc(x, y + s * 0.04, s * 0.075, ac, rim, lw * 0.65);
        } else if (vv === 3) {
          G.box(x, y, s * 0.82, s * 0.78, s * 0.16, '#0f172a', rim, lw);
          G.part(x, y - s * 0.06, -0.35 + sweep, 1, 1, function() {
            G.box(0, 0, s * 0.50, s * 0.17, s * 0.05, tc, rim, lw * 0.85);
            G.box(s * 0.26, 0, s * 0.10, s * 0.22, s * 0.03, ac, rim, lw * 0.7);
          });
          G.pill(x, y, x - s * 0.18, y + s * 0.28, lw * 1.2, '#00e5ff');
          G.pill(x, y, x + s * 0.18, y + s * 0.28, lw * 1.2, '#00e5ff');
        } else if (vv === 4) {
          G.pill(x, y + s * 0.04, x - s * 0.20, y + s * 0.38, lw * 1.4, tr);
          G.pill(x, y + s * 0.04, x + s * 0.20, y + s * 0.38, lw * 1.4, tr);
          G.part(x, y - s * 0.08, -0.45 + sweep, 1, 1, function() {
            G.box(0, 0, s * 0.62, s * 0.20, s * 0.06, tc, rim, lw);
            G.box(s * 0.32, 0, s * 0.12, s * 0.26, s * 0.04, '#00e5ff', rim, lw * 0.8);
          });
          G.star(x + s * 0.30, y - s * 0.30, s * 0.10 + Math.sin(tt * 3) * s * 0.015, s * 0.045, 5, 0, ac, rim, lw * 0.5);
          G.disc(x + s * 0.14, y - s * 0.36, s * 0.045, '#00e5ff', null, 0);
        } else if (vv === 5) {
          G.capsule(x, y + s * 0.36, s * 0.68, s * 0.11, tr, rim, lw * 0.85);
          G.ring(x, y + s * 0.02, s * 0.32, lw * 1.1, Math.PI, Math.PI * 2, tc);
          G.part(x + s * 0.04, y - s * 0.12, -0.40 + sweep, 1, 1, function() {
            G.box(0, 0, s * 0.44, s * 0.18, s * 0.05, ac, rim, lw * 0.85);
          });
          G.star(x - s * 0.28, y - s * 0.28, s * 0.075, s * 0.032, 4, tt * 0.6, '#00e5ff', null, 0);
        } else {
          G.pill(x, y + s * 0.02, x - s * 0.22, y + s * 0.38, lw * 1.4, tr);
          G.pill(x, y + s * 0.02, x + s * 0.22, y + s * 0.38, lw * 1.4, tr);
          G.pill(x, y + s * 0.02, x, y + s * 0.40, lw * 1.4, tr);
          G.part(x, y - s * 0.08, -0.44 + sweep, 1, 1, function() {
            G.box(-s * 0.06, 0, s * 0.46, s * 0.16, s * 0.04, tc, rim, lw);
            G.box(s * 0.22, 0, s * 0.18, s * 0.23, s * 0.05, '#00e5ff', rim, lw * 0.85);
            G.box(-s * 0.34, 0, s * 0.12, s * 0.10, s * 0.03, ac, rim, lw * 0.7);
          });
          G.disc(x, y + s * 0.02, s * 0.075, ac, rim, lw * 0.65);
        }
      },
      flask: function(x, y, s, glassCol, liqCol, bubCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var gc = glassCol || '#1e293b', lc = liqCol || '#00e5ff', bc = bubCol || '#ffd700';
        var b1 = (tt * 0.55) % 1, b2 = ((tt * 0.55) + 0.5) % 1;
        if (vv === 1) {
          G.box(x - s * 0.18, y + s * 0.02, s * 0.20, s * 0.66, s * 0.09, gc, rim, lw);
          G.box(x - s * 0.18, y + s * 0.14, s * 0.15, s * 0.34, s * 0.07, lc, null, 0);
          G.box(x + s * 0.18, y + s * 0.02, s * 0.20, s * 0.66, s * 0.09, gc, rim, lw);
          G.box(x + s * 0.18, y + s * 0.18, s * 0.15, s * 0.28, s * 0.07, '#f43f5e', null, 0);
          G.capsule(x, y - s * 0.18, s * 0.62, s * 0.08, '#4f46e5', rim, lw * 0.75);
          G.disc(x - s * 0.18, y + s * 0.22 - b1 * s * 0.34, s * 0.04, bc, null, 0);
          G.disc(x + s * 0.18, y + s * 0.22 - b2 * s * 0.34, s * 0.04, bc, null, 0);
        } else if (vv === 2) {
          G.disc(x, y + s * 0.10, s * 0.30, gc, rim, lw);
          G.box(x, y - s * 0.24, s * 0.20, s * 0.26, s * 0.04, gc, rim, lw);
          G.disc(x, y + s * 0.14, s * 0.23, lc, null, 0);
          G.capsule(x, y - s * 0.36, s * 0.28, s * 0.07, '#4f46e5', rim, lw * 0.7);
          G.disc(x - s * 0.06, y + s * 0.12 - b1 * s * 0.22, s * 0.048, bc, rim, lw * 0.45);
          G.disc(x + s * 0.08, y + s * 0.16 - b2 * s * 0.20, s * 0.038, '#f8fafc', null, 0);
        } else if (vv === 3) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.poly([[x - s * 0.09, y - s * 0.26], [x + s * 0.09, y - s * 0.26], [x + s * 0.10, y - s * 0.08], [x + s * 0.26, y + s * 0.24], [x - s * 0.26, y + s * 0.24], [x - s * 0.10, y - s * 0.08]], gc, rim, lw * 0.9, true);
          G.poly([[x - s * 0.15, y + s * 0.04], [x + s * 0.15, y + s * 0.04], [x + s * 0.23, y + s * 0.22], [x - s * 0.23, y + s * 0.22]], lc, null, 0, true);
          G.disc(x, y + s * 0.04 - b1 * s * 0.24, s * 0.045, bc, null, 0);
        } else if (vv === 4) {
          G.box(x, y, s * 0.56, s * 0.72, s * 0.08, gc, rim, lw);
          G.box(x, y + s * 0.12, s * 0.48, s * 0.40, s * 0.05, lc, null, 0);
          G.pill(x - s * 0.22, y - s * 0.14, x - s * 0.08, y - s * 0.14, lw, rim);
          G.pill(x - s * 0.22, y, x - s * 0.12, y, lw, rim);
          G.disc(x + s * 0.06, y + s * 0.18 - b1 * s * 0.28, s * 0.05, bc, null, 0);
          G.disc(x - s * 0.04, y + s * 0.22 - b2 * s * 0.28, s * 0.04, '#f8fafc', null, 0);
        } else if (vv === 5) {
          G.part(x, y, Math.sin(tt * 2.2) * 0.18, 1, 1, function() {
            G.poly([[-s * 0.10, -s * 0.36], [s * 0.10, -s * 0.36], [s * 0.11, -s * 0.10], [s * 0.34, s * 0.34], [-s * 0.34, s * 0.34], [-s * 0.11, -s * 0.10]], gc, rim, lw, true);
            G.poly([[-s * 0.19, s * 0.06], [s * 0.19, s * 0.06], [s * 0.30, s * 0.31], [-s * 0.30, s * 0.31]], lc, null, 0, true);
            G.disc(0, -b1 * s * 0.22, s * 0.055, bc, null, 0);
          });
        } else {
          G.poly([[x - s * 0.11, y - s * 0.38], [x + s * 0.11, y - s * 0.38], [x + s * 0.12, y - s * 0.10], [x + s * 0.36, y + s * 0.34], [x - s * 0.36, y + s * 0.34], [x - s * 0.12, y - s * 0.10]], gc, rim, lw, true);
          G.capsule(x, y - s * 0.38, s * 0.30, s * 0.08, '#4f46e5', rim, lw * 0.75);
          G.poly([[x - s * 0.20, y + s * 0.08], [x + s * 0.20, y + s * 0.08], [x + s * 0.31, y + s * 0.31], [x - s * 0.31, y + s * 0.31]], lc, null, 0, true);
          G.disc(x - s * 0.06, y + s * 0.14 - b1 * s * 0.30, s * 0.05, bc, rim, lw * 0.45);
          G.disc(x + s * 0.07, y + s * 0.10 - b2 * s * 0.30, s * 0.04, '#f8fafc', null, 0);
        }
      },
      book: function(x, y, s, coverCol, pageCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = coverCol || '#4f46e5', pc = pageCol || '#f8fafc', ac = accCol || '#ffd700';
        var flip = Math.sin(tt * 2.5) * s * 0.04;
        if (vv === 1) {
          G.box(x, y + s * 0.22, s * 0.74, s * 0.20, s * 0.05, cc, rim, lw);
          G.box(x - s * 0.03, y, s * 0.68, s * 0.20, s * 0.05, '#00e5ff', rim, lw);
          G.box(x + s * 0.03 + flip * 0.3, y - s * 0.22, s * 0.62, s * 0.20, s * 0.05, '#f43f5e', rim, lw);
          G.capsule(x + s * 0.03, y + s * 0.22, s * 0.56, s * 0.07, pc, null, 0);
        } else if (vv === 2) {
          G.disc(x, y, s * 0.43, '#1e293b', rim, lw);
          G.poly([[x - s * 0.28, y - s * 0.16], [x, y - s * 0.08], [x, y + s * 0.22], [x - s * 0.28, y + s * 0.14]], pc, rim, lw * 0.85, true);
          G.poly([[x + s * 0.28, y - s * 0.16], [x, y - s * 0.08], [x, y + s * 0.22], [x + s * 0.28, y + s * 0.14]], '#e2e8f0', rim, lw * 0.85, true);
          G.pill(x - s * 0.20, y - s * 0.02 + flip * 0.3, x - s * 0.06, y + s * 0.02 + flip * 0.3, lw, cc);
          G.pill(x + s * 0.06, y + s * 0.02 - flip * 0.3, x + s * 0.20, y - s * 0.02 - flip * 0.3, lw, ac);
        } else if (vv === 3) {
          G.box(x, y, s * 0.66, s * 0.82, s * 0.09, cc, rim, lw);
          G.box(x - s * 0.24, y, s * 0.12, s * 0.78, s * 0.03, '#1e293b', null, 0);
          G.box(x + s * 0.06, y - s * 0.12, s * 0.34, s * 0.22, s * 0.05, pc, rim, lw * 0.7);
          G.star(x + s * 0.06, y + s * 0.20, s * 0.10 + Math.abs(flip) * 0.3, s * 0.045, 5, -Math.PI / 2, ac, rim, lw * 0.55);
        } else if (vv === 4) {
          G.box(x, y + s * 0.08, s * 0.84, s * 0.56, s * 0.08, cc, rim, lw);
          G.box(x - s * 0.20, y + s * 0.04, s * 0.36, s * 0.46, s * 0.04, pc, '#1e293b', lw * 0.75);
          G.box(x + s * 0.20, y + s * 0.04, s * 0.36, s * 0.46, s * 0.04, pc, '#1e293b', lw * 0.75);
          G.disc(x, y - s * 0.24 + flip, s * 0.12, ac, rim, lw * 0.75);
          G.rays(x, y - s * 0.24 + flip, s * 0.16, s * 0.22, 5, -Math.PI / 2, lw * 0.9, ac);
        } else if (vv === 5) {
          G.box(x, y + s * 0.02, s * 0.66, s * 0.80, s * 0.09, cc, rim, lw);
          G.capsule(x + s * 0.04, y + s * 0.30, s * 0.54, s * 0.13, pc, rim, lw * 0.75);
          G.box(x + s * 0.14, y + s * 0.38 + flip * 0.4, s * 0.11, s * 0.22, s * 0.02, ac, rim, lw * 0.6);
          G.pill(x - s * 0.12, y - s * 0.14, x + s * 0.20, y - s * 0.14, lw * 1.2, pc);
          G.pill(x - s * 0.12, y, x + s * 0.14, y, lw * 1.2, '#00e5ff');
        } else {
          G.box(x, y + s * 0.10, s * 0.88, s * 0.56, s * 0.09, cc, rim, lw);
          G.poly([[x - s * 0.39, y - s * 0.22], [x, y - s * 0.12], [x, y + s * 0.30], [x - s * 0.39, y + s * 0.20]], pc, rim, lw * 0.85, true);
          G.poly([[x + s * 0.39, y - s * 0.22], [x, y - s * 0.12], [x, y + s * 0.30], [x + s * 0.39, y + s * 0.20]], '#e2e8f0', rim, lw * 0.85, true);
          G.pill(x - s * 0.28, y - s * 0.04 + flip * 0.4, x - s * 0.09, y + s * 0.01 + flip * 0.4, lw, '#00e5ff');
          G.pill(x + s * 0.09, y + s * 0.01 - flip * 0.4, x + s * 0.28, y - s * 0.04 - flip * 0.4, lw, ac);
        }
      },
      gradCap: function(x, y, s, capCol, rimCol, tasCol, accCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = capCol || '#1e293b', tc = tasCol || '#ffd700', ac = accCol || '#4f46e5';
        var sw = Math.sin(tt * 3.0) * s * 0.05;
        if (vv === 1) {
          G.disc(x, y, s * 0.43, ac, rim, lw);
          G.box(x, y + s * 0.08, s * 0.34, s * 0.18, s * 0.04, cc, rim, lw * 0.8);
          G.poly([[x, y - s * 0.26], [x + s * 0.32, y - s * 0.08], [x, y + s * 0.08], [x - s * 0.32, y - s * 0.08]], cc, rim, lw, true);
          G.pill(x + s * 0.26, y - s * 0.04, x + s * 0.28 + sw, y + s * 0.20, lw * 1.1, tc);
          G.disc(x + s * 0.28 + sw, y + s * 0.22, s * 0.045, tc, null, 0);
        } else if (vv === 2) {
          G.box(x, y + s * 0.24, s * 0.64, s * 0.18, s * 0.08, '#f8fafc', rim, lw);
          G.box(x, y + s * 0.24, s * 0.12, s * 0.20, s * 0.03, '#f43f5e', rim, lw * 0.65);
          G.poly([[x, y - s * 0.34], [x + s * 0.38, y - s * 0.16], [x, y + s * 0.02], [x - s * 0.38, y - s * 0.16]], cc, rim, lw, true);
          G.pill(x + s * 0.30, y - s * 0.12, x + s * 0.32 + sw, y + s * 0.10, lw * 1.1, tc);
        } else if (vv === 3) {
          G.box(x, y + s * 0.06, s * 0.46, s * 0.28, s * 0.06, ac, rim, lw);
          G.poly([[x, y - s * 0.32], [x + s * 0.44, y - s * 0.12], [x, y + s * 0.08], [x - s * 0.44, y - s * 0.12]], cc, rim, lw, true);
          G.star(x, y - s * 0.12, s * 0.09 + Math.abs(sw) * 0.4, s * 0.04, 5, -Math.PI / 2, tc, rim, lw * 0.5);
          G.pill(x + s * 0.36, y - s * 0.08, x + s * 0.38 + sw, y + s * 0.22, lw * 1.2, tc);
          G.disc(x + s * 0.38 + sw, y + s * 0.24, s * 0.055, tc, rim, lw * 0.6);
        } else if (vv === 4) {
          G.box(x, y + s * 0.04, s * 0.80, s * 0.76, s * 0.14, '#0f172a', rim, lw);
          G.poly([[x, y - s * 0.26], [x + s * 0.32, y - s * 0.08], [x, y + s * 0.08], [x - s * 0.32, y - s * 0.08]], ac, rim, lw * 0.9, true);
          G.box(x, y + s * 0.14, s * 0.34, s * 0.16, s * 0.04, cc, rim, lw * 0.8);
          G.pill(x + s * 0.26, y - s * 0.04, x + s * 0.28 + sw, y + s * 0.22, lw, tc);
        } else if (vv === 5) {
          G.box(x, y + s * 0.18, s * 0.48, s * 0.26, s * 0.06, ac, rim, lw);
          G.poly([[x, y - s * 0.32 + Math.sin(tt * 2.4) * s * 0.03], [x + s * 0.44, y - s * 0.12 + Math.sin(tt * 2.4) * s * 0.03], [x, y + s * 0.08 + Math.sin(tt * 2.4) * s * 0.03], [x - s * 0.44, y - s * 0.12 + Math.sin(tt * 2.4) * s * 0.03]], cc, rim, lw, true);
          G.pill(x + s * 0.36, y - s * 0.08, x + s * 0.38 + sw, y + s * 0.20, lw * 1.2, tc);
          G.disc(x + s * 0.38 + sw, y + s * 0.23, s * 0.055, tc, rim, lw * 0.6);
        } else {
          G.box(x, y + s * 0.12, s * 0.46, s * 0.28, s * 0.06, ac, rim, lw);
          G.poly([[x, y - s * 0.30], [x + s * 0.44, y - s * 0.10], [x, y + s * 0.10], [x - s * 0.44, y - s * 0.10]], cc, rim, lw, true);
          G.disc(x, y - s * 0.10, s * 0.055, tc, rim, lw * 0.6);
          G.pill(x, y - s * 0.10, x + s * 0.36, y - s * 0.04, lw * 0.9, tc);
          G.pill(x + s * 0.36, y - s * 0.04, x + s * 0.36 + sw, y + s * 0.24, lw * 1.2, tc);
          G.disc(x + s * 0.36 + sw, y + s * 0.26, s * 0.055, tc, rim, lw * 0.6);
        }
      },
      dna: function(x, y, s, s1Col, s2Col, rungCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.030), vv = G._v(v);
        var c1 = s1Col || '#00e5ff', c2 = s2Col || '#4f46e5', rc = rungCol || '#ffd700';
        var phase = tt * 2.4;
        var drawHelix = function(cx0, cy0, hh, amp, cnt) {
          for (var i = 0; i < cnt; i++) {
            var frac = cnt > 1 ? i / (cnt - 1) : 0.5;
            var py = cy0 - hh * 0.5 + frac * hh;
            var xOff = Math.sin(phase + frac * Math.PI * 2.2) * amp;
            G.pill(cx0 - xOff, py, cx0 + xOff, py, lw * 1.15, i % 2 === 0 ? rc : rim);
            G.disc(cx0 - xOff, py, s * 0.055, c1, rim, lw * 0.55);
            G.disc(cx0 + xOff, py, s * 0.055, c2, rim, lw * 0.55);
          }
        };
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          drawHelix(x, y, s * 0.54, s * 0.16, 5);
        } else if (vv === 2) {
          G.box(x, y, s * 0.80, s * 0.80, s * 0.16, '#1e293b', rim, lw);
          drawHelix(x, y, s * 0.54, s * 0.18, 5);
        } else if (vv === 3) {
          G.part(x, y, 0.45, 1, 1, function() {
            drawHelix(0, 0, s * 0.72, s * 0.19, 6);
          });
        } else if (vv === 4) {
          G.poly([[x, y - s * 0.44], [x + s * 0.36, y - s * 0.26], [x + s * 0.31, y + s * 0.16], [x, y + s * 0.44], [x - s * 0.31, y + s * 0.16], [x - s * 0.36, y - s * 0.26]], '#1e293b', rim, lw, true);
          drawHelix(x, y, s * 0.50, s * 0.15, 5);
        } else if (vv === 5) {
          G.part(x, y, Math.PI / 2, 1, 1, function() {
            drawHelix(0, 0, s * 0.72, s * 0.18, 6);
          });
        } else {
          drawHelix(x, y, s * 0.74, s * 0.22, 6);
        }
      },
      stethoscope: function(x, y, s, tubeCol, metalCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var tc = tubeCol || '#00e5ff', mc = metalCol || '#4f46e5', ac = accCol || '#f43f5e';
        var pulse = 1 + 0.10 * Math.sin(tt * 3.6);
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.ring(x, y - s * 0.10, s * 0.16, lw * 1.3, 0, Math.PI, tc);
          G.pill(x - s * 0.16, y - s * 0.24, x - s * 0.16, y - s * 0.10, lw * 1.2, rim);
          G.pill(x + s * 0.16, y - s * 0.24, x + s * 0.16, y - s * 0.10, lw * 1.2, rim);
          G.ring(x + s * 0.08, y + s * 0.12, s * 0.12, lw * 1.2, 0, Math.PI, tc);
          G.disc(x + s * 0.20, y + s * 0.06, s * 0.10 * pulse, ac, rim, lw * 0.75);
        } else if (vv === 2) {
          G.box(x, y, s * 0.80, s * 0.80, s * 0.16, '#1e293b', rim, lw);
          G.ring(x - s * 0.04, y - s * 0.08, s * 0.18, lw * 1.4, 0, Math.PI, tc);
          G.disc(x + s * 0.20, y + s * 0.14, s * 0.11 * pulse, ac, rim, lw * 0.75);
          G.pill(x + s * 0.14, y + s * 0.14, x - s * 0.04, y + s * 0.14, lw * 1.1, mc);
        } else if (vv === 3) {
          G.disc(x, y + s * 0.02, s * 0.34, '#1e293b', tc, lw * 1.3);
          G.disc(x, y + s * 0.02, s * 0.18 * pulse, ac, rim, lw * 0.85);
          G.disc(x, y + s * 0.02, s * 0.08, '#ffd700', null, 0);
          G.ring(x, y - s * 0.18, s * 0.22, lw * 1.2, Math.PI, Math.PI * 2, mc);
        } else if (vv === 4) {
          G.ring(x - s * 0.10, y - s * 0.16, s * 0.18, lw * 1.5, 0, Math.PI, tc);
          G.pill(x - s * 0.28, y - s * 0.34, x - s * 0.28, y - s * 0.16, lw * 1.3, rim);
          G.pill(x + s * 0.08, y - s * 0.34, x + s * 0.08, y - s * 0.16, lw * 1.3, rim);
          G.pill(x - s * 0.10, y + s * 0.02, x - s * 0.10, y + s * 0.24, lw * 1.4, mc);
          G.pill(x - s * 0.10, y + s * 0.24, x + s * 0.22, y + s * 0.24, lw * 1.4, tc);
          G.disc(x + s * 0.24, y + s * 0.12, s * 0.13 * pulse, ac, rim, lw * 0.85);
        } else if (vv === 5) {
          G.shield(x, y, s * 0.90, '#1e293b', rim, mc, ac, tt, 0);
          G.disc(x, y - s * 0.02, s * 0.14 * pulse, tc, rim, lw * 0.75);
        } else {
          G.ring(x - s * 0.12, y - s * 0.14, s * 0.20, lw * 1.6, 0, Math.PI, tc);
          G.disc(x - s * 0.32, y - s * 0.34, s * 0.055, rim, null, 0);
          G.disc(x + s * 0.08, y - s * 0.34, s * 0.055, rim, null, 0);
          G.pill(x - s * 0.12, y + s * 0.06, x - s * 0.12, y + s * 0.26, lw * 1.5, mc);
          G.ring(x + s * 0.06, y + s * 0.22, s * 0.18, lw * 1.5, 0, Math.PI, tc);
          G.disc(x + s * 0.24, y + s * 0.10, s * 0.13 * pulse, ac, rim, lw * 0.9);
          G.disc(x + s * 0.24, y + s * 0.10, s * 0.06, '#ffd700', null, 0);
        }
      },
      syringe: function(x, y, s, barrelCol, fluidCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = barrelCol || '#f8fafc', fc = fluidCol || '#00e5ff', ac = accCol || '#f43f5e';
        var plunge = (0.5 + 0.5 * Math.sin(tt * 2.6)) * s * 0.14;
        var drawBody = function(ang) {
          G.part(x, y, ang, 1, 1, function() {
            G.pill(-s * 0.40 + plunge * 0.6, 0, -s * 0.22, 0, lw * 1.2, '#94a3b8');
            G.capsule(-s * 0.42 + plunge * 0.6, 0, s * 0.06, s * 0.20, ac, rim, lw * 0.65);
            G.box(0, 0, s * 0.44, s * 0.22, s * 0.05, bc, rim, lw);
            G.box(s * 0.04 + plunge * 0.25, 0, s * 0.30 - plunge * 0.5, s * 0.15, s * 0.03, fc, null, 0);
            G.pill(s * 0.22, 0, s * 0.42, 0, lw * 1.1, rim);
            G.disc(s * 0.44, 0, s * 0.045, fc, null, 0);
          });
        };
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#1e293b', rim, lw);
          drawBody(-0.78);
        } else if (vv === 2) {
          G.box(x, y, s * 0.80, s * 0.80, s * 0.16, '#1e293b', rim, lw);
          drawBody(-0.78);
        } else if (vv === 3) {
          drawBody(-Math.PI / 2);
        } else if (vv === 4) {
          G.poly([[x, y - s * 0.42], [x + s * 0.36, y - s * 0.25], [x + s * 0.31, y + s * 0.16], [x, y + s * 0.42], [x - s * 0.31, y + s * 0.16], [x - s * 0.36, y - s * 0.25]], '#1e293b', rim, lw, true);
          drawBody(-0.78);
        } else if (vv === 5) {
          drawBody(0);
        } else {
          drawBody(-0.78);
        }
      },
      heartbeat: function(x, y, s, heartCol, lineCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var hc = heartCol || '#f43f5e', lc = lineCol || '#f8fafc', ac = accCol || '#00e5ff';
        var beat = 1 + 0.09 * Math.max(0, Math.sin(tt * 3.8));
        var drawHeart = function(hx, hy, hs, col) {
          G.part(hx, hy, 0, beat, beat, function() {
            G.disc(-hs * 0.18, -hs * 0.10, hs * 0.21, col, null, 0);
            G.disc(hs * 0.18, -hs * 0.10, hs * 0.21, col, null, 0);
            G.poly([[-hs * 0.37, -hs * 0.02], [hs * 0.37, -hs * 0.02], [0, hs * 0.38]], col, null, 0, true);
          });
        };
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#1e293b', rim, lw);
          drawHeart(x, y, s * 0.62, hc);
          G.poly([[x - s * 0.28, y + s * 0.02], [x - s * 0.10, y + s * 0.02], [x - s * 0.03, y - s * 0.14 * beat], [x + s * 0.05, y + s * 0.14 * beat], [x + s * 0.12, y + s * 0.02], [x + s * 0.28, y + s * 0.02]], null, lc, lw * 1.15, false);
        } else if (vv === 2) {
          G.box(x, y, s * 0.84, s * 0.64, s * 0.12, '#0f172a', rim, lw);
          G.poly([[x - s * 0.32, y + s * 0.04], [x - s * 0.14, y + s * 0.04], [x - s * 0.05, y - s * 0.19 * beat], [x + s * 0.06, y + s * 0.18 * beat], [x + s * 0.14, y + s * 0.04], [x + s * 0.32, y + s * 0.04]], null, ac, lw * 1.4, false);
          G.disc(x + s * 0.28, y - s * 0.18, s * 0.065 * beat, hc, null, 0);
        } else if (vv === 3) {
          G.ring(x, y, s * 0.42, lw * 1.1, tt * 1.0, tt * 1.0 + Math.PI * 1.45, ac);
          drawHeart(x, y + s * 0.02, s * 0.68, hc);
        } else if (vv === 4) {
          G.poly([[x, y - s * 0.42], [x + s * 0.36, y - s * 0.25], [x + s * 0.31, y + s * 0.16], [x, y + s * 0.42], [x - s * 0.31, y + s * 0.16], [x - s * 0.36, y - s * 0.25]], '#1e293b', rim, lw, true);
          drawHeart(x, y + s * 0.02, s * 0.56, hc);
          G.pill(x - s * 0.18, y + s * 0.02, x + s * 0.18, y + s * 0.02, lw, lc);
        } else if (vv === 5) {
          drawHeart(x, y + s * 0.02, s * 0.88, hc);
          G.box(x, y + s * 0.02, s * 0.11, s * 0.28, s * 0.03, lc, null, 0);
          G.box(x, y + s * 0.02, s * 0.28, s * 0.11, s * 0.03, lc, null, 0);
        } else {
          drawHeart(x, y + s * 0.02, s * 0.90, hc);
          G.poly([[x - s * 0.30, y + s * 0.02], [x - s * 0.11, y + s * 0.02], [x - s * 0.03, y - s * 0.15 * beat], [x + s * 0.06, y + s * 0.15 * beat], [x + s * 0.13, y + s * 0.02], [x + s * 0.30, y + s * 0.02]], null, lc, lw * 1.25, false);
        }
      },
      palette: function(x, y, s, boardCol, c1Col, c2Col, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = boardCol || '#1e293b', c1 = c1Col || '#f43f5e', c2 = c2Col || '#00e5ff';
        var sw = Math.sin(tt * 2.4) * 0.14;
        if (vv === 1) {
          for (var i1 = 0; i1 < 6; i1++) {
            var a1 = -Math.PI / 2 + i1 * (Math.PI / 3) + tt * 0.35;
            var cols1 = [c1, '#ffd700', c2, '#4f46e5', '#f97316', '#ec4899'];
            G.disc(x + Math.cos(a1) * s * 0.26, y + Math.sin(a1) * s * 0.26, s * 0.12, cols1[i1], rim, lw * 0.7);
          }
          G.disc(x, y, s * 0.13, bc, rim, lw);
        } else if (vv === 2) {
          for (var f2 = 0; f2 < 3; f2++) {
            G.part(x, y + s * 0.22, (f2 - 1) * (0.36 + sw * 0.4), 1, 1, function() {
              G.box(0, -s * 0.24, s * 0.26, s * 0.54, s * 0.05, f2 === 0 ? c1 : f2 === 1 ? '#ffd700' : c2, rim, lw * 0.85);
            });
          }
          G.disc(x, y + s * 0.24, s * 0.07, bc, rim, lw * 0.7);
        } else if (vv === 3) {
          G.disc(x, y, s * 0.43, bc, rim, lw);
          G.disc(x - s * 0.18, y - s * 0.12, s * 0.08, c1, rim, lw * 0.6);
          G.disc(x + s * 0.04, y - s * 0.22, s * 0.08, '#ffd700', rim, lw * 0.6);
          G.disc(x + s * 0.22, y - s * 0.06, s * 0.08, c2, rim, lw * 0.6);
          G.disc(x + s * 0.16, y + s * 0.18, s * 0.08, '#4f46e5', rim, lw * 0.6);
          G.disc(x - s * 0.14, y + s * 0.16, s * 0.085, '#0f172a', rim, lw * 0.7);
        } else if (vv === 4) {
          G.box(x, y, s * 0.78, s * 0.78, s * 0.14, bc, rim, lw);
          G.box(x - s * 0.16, y - s * 0.16, s * 0.26, s * 0.26, s * 0.05, c1, rim, lw * 0.7);
          G.box(x + s * 0.16, y - s * 0.16, s * 0.26, s * 0.26, s * 0.05, '#ffd700', rim, lw * 0.7);
          G.box(x - s * 0.16, y + s * 0.16, s * 0.26, s * 0.26, s * 0.05, c2, rim, lw * 0.7);
          G.box(x + s * 0.16, y + s * 0.16, s * 0.26, s * 0.26, s * 0.05, '#4f46e5', rim, lw * 0.7);
        } else if (vv === 5) {
          G.part(x, y, sw, 1, 1, function() {
            G.pill(-s * 0.28, s * 0.28, s * 0.22, -s * 0.22, lw * 1.9, '#94a3b8');
            G.poly([[s * 0.18, -s * 0.18], [s * 0.38, -s * 0.38], [s * 0.34, -s * 0.10]], c1, rim, lw * 0.75, true);
            G.disc(-s * 0.18, -s * 0.14, s * 0.11, '#ffd700', rim, lw * 0.7);
            G.disc(-s * 0.24, s * 0.08, s * 0.10, c2, rim, lw * 0.7);
          });
        } else {
          G.disc(x - s * 0.02, y, s * 0.40, bc, rim, lw);
          G.disc(x - s * 0.16, y - s * 0.14, s * 0.075, c1, rim, lw * 0.55);
          G.disc(x + s * 0.08, y - s * 0.20, s * 0.075, '#ffd700', rim, lw * 0.55);
          G.disc(x + s * 0.22, y - s * 0.02, s * 0.075, c2, rim, lw * 0.55);
          G.disc(x - s * 0.14, y + s * 0.16, s * 0.085, '#0f172a', rim, lw * 0.7);
          G.part(x + s * 0.14, y + s * 0.12, sw, 1, 1, function() {
            G.pill(-s * 0.18, s * 0.22, s * 0.20, -s * 0.22, lw * 1.6, '#f97316');
            G.poly([[s * 0.14, -s * 0.18], [s * 0.28, -s * 0.32], [s * 0.26, -s * 0.12]], c2, rim, lw * 0.7, true);
          });
        }
      },
      layers: function(x, y, s, topCol, midCol, botCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var c1 = topCol || '#00e5ff', c2 = midCol || '#4f46e5', c3 = botCol || '#1e293b';
        var dy = Math.sin(tt * 2.5) * s * 0.04;
        var diamond = function(dx, dy0, w0, h0, col) {
          G.poly([[dx, dy0 - h0], [dx + w0, dy0], [dx, dy0 + h0], [dx - w0, dy0]], col, rim, lw, true);
        };
        if (vv === 1) {
          G.box(x - s * 0.14, y + s * 0.12 - dy * 0.5, s * 0.56, s * 0.52, s * 0.08, c3, rim, lw);
          G.box(x, y, s * 0.56, s * 0.52, s * 0.08, c2, rim, lw);
          G.box(x + s * 0.14, y - s * 0.12 + dy * 0.5, s * 0.56, s * 0.52, s * 0.08, c1, rim, lw);
        } else if (vv === 2) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          diamond(x, y + s * 0.16 - dy * 0.6, s * 0.30, s * 0.12, c3);
          diamond(x, y, s * 0.30, s * 0.12, c2);
          diamond(x, y - s * 0.16 + dy * 0.6, s * 0.30, s * 0.12, c1);
        } else if (vv === 3) {
          G.capsule(x, y + s * 0.22 - dy * 0.5, s * 0.74, s * 0.17, c3, rim, lw);
          G.capsule(x, y, s * 0.74, s * 0.17, c2, rim, lw);
          G.capsule(x, y - s * 0.22 + dy * 0.5, s * 0.74, s * 0.17, c1, rim, lw);
        } else if (vv === 4) {
          G.ngon(x, y, s * 0.42, 6, -Math.PI / 2, c3, rim, lw);
          G.ngon(x, y - s * 0.03 + dy * 0.4, s * 0.28, 6, -Math.PI / 2, c2, rim, lw * 0.85);
          G.ngon(x, y - s * 0.06 + dy * 0.8, s * 0.14, 6, -Math.PI / 2, c1, rim, lw * 0.75);
        } else if (vv === 5) {
          diamond(x, y + s * 0.14 - dy * 0.5, s * 0.40, s * 0.16, c3);
          diamond(x, y - s * 0.08 + dy * 0.5, s * 0.40, s * 0.16, c1);
          G.disc(x, y - s * 0.08 + dy * 0.5, s * 0.07, '#ffd700', rim, lw * 0.6);
        } else {
          diamond(x, y + s * 0.20 - dy * 0.6, s * 0.42, s * 0.16, c3);
          diamond(x, y, s * 0.42, s * 0.16, c2);
          diamond(x, y - s * 0.20 + dy * 0.6, s * 0.42, s * 0.16, c1);
        }
      },
      ruler: function(x, y, s, rulCol, penCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var rc = rulCol || '#ffd700', pc = penCol || '#4f46e5', ac = accCol || '#00e5ff';
        var slide = Math.sin(tt * 2.4) * s * 0.04;
        if (vv === 1) {
          G.poly([[x - s * 0.34, y + s * 0.32], [x - s * 0.34, y - s * 0.34], [x + s * 0.34, y + s * 0.32]], rc, rim, lw, true);
          G.poly([[x - s * 0.20, y + s * 0.18], [x - s * 0.20, y - s * 0.06], [x + s * 0.06, y + s * 0.18]], '#0f172a', rim, lw * 0.7, true);
          G.pill(x + s * 0.04 + slide, y - s * 0.26, x + s * 0.34 + slide, y + s * 0.04, lw * 1.9, pc);
        } else if (vv === 2) {
          G.disc(x, y, s * 0.43, '#1e293b', rim, lw);
          G.part(x, y, -0.75 + slide * 0.01, 1, 1, function() {
            G.box(0, 0, s * 0.62, s * 0.20, s * 0.04, rc, rim, lw * 0.85);
            for (var t2 = -2; t2 <= 2; t2++) {
              G.pill(t2 * s * 0.10, -s * 0.09, t2 * s * 0.10, -s * 0.02, lw * 0.9, '#1e293b');
            }
          });
        } else if (vv === 3) {
          G.box(x, y, s * 0.80, s * 0.78, s * 0.12, '#1e293b', rim, lw);
          G.box(x, y - s * 0.18, s * 0.60, s * 0.16, s * 0.04, rc, rim, lw * 0.75);
          G.box(x - s * 0.20, y + s * 0.08, s * 0.16, s * 0.44, s * 0.04, ac, rim, lw * 0.75);
          G.box(x + s * 0.12 + slide * 0.6, y + s * 0.14, s * 0.28, s * 0.28, s * 0.05, pc, rim, lw * 0.75);
        } else if (vv === 4) {
          G.part(x, y, -0.78, 1, 1, function() {
            G.box(0, 0, s * 0.76, s * 0.22, s * 0.05, rc, rim, lw);
            for (var k4 = -3; k4 <= 3; k4++) {
              G.pill(k4 * s * 0.09, -s * 0.10, k4 * s * 0.09, k4 % 2 === 0 ? 0 : -s * 0.04, lw * 0.85, '#1e293b');
            }
          });
          G.part(x, y, 0.78 + slide * 0.015, 1, 1, function() {
            G.box(0, 0, s * 0.72, s * 0.15, s * 0.04, pc, rim, lw);
            G.poly([[s * 0.36, -s * 0.075], [s * 0.48, 0], [s * 0.36, s * 0.075]], ac, rim, lw * 0.7, true);
          });
        } else if (vv === 5) {
          G.box(x, y, s * 0.76, s * 0.76, s * 0.10, '#0f172a', rim, lw);
          G.pill(x - s * 0.22, y - s * 0.20, x + s * 0.22, y - s * 0.20, lw * 1.1, ac);
          G.pill(x - s * 0.22, y + s * 0.20, x + s * 0.22, y + s * 0.20, lw * 1.1, ac);
          G.box(x + slide, y, s * 0.28, s * 0.28, s * 0.05, rc, rim, lw * 0.85);
        } else {
          G.poly([[x - s * 0.38, y + s * 0.36], [x - s * 0.38, y - s * 0.36], [x + s * 0.38, y + s * 0.36]], rc, rim, lw, true);
          G.poly([[x - s * 0.22, y + s * 0.22], [x - s * 0.22, y - s * 0.04], [x + s * 0.06, y + s * 0.22]], '#0f172a', rim, lw * 0.7, true);
          for (var k0 = -2; k0 <= 2; k0++) {
            G.pill(x - s * 0.37, y + k0 * s * 0.10, x - s * 0.29, y + k0 * s * 0.10, lw * 0.8, '#1e293b');
          }
          G.disc(x + s * 0.18 + slide * 0.6, y - s * 0.14 - slide * 0.6, s * 0.11, ac, rim, lw * 0.8);
        }
      },
      penTool: function(x, y, s, nibCol, nodeCol, curveCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var nc = nibCol || '#4f46e5', nd = nodeCol || '#ffd700', cc = curveCol || '#00e5ff';
        var sway = Math.sin(tt * 2.5) * s * 0.05;
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.ring(x, y + s * 0.18, s * 0.28, lw * 1.1, Math.PI * 1.15, Math.PI * 1.85, cc);
          G.disc(x - s * 0.24, y + s * 0.04, s * 0.065, nd, rim, lw * 0.6);
          G.disc(x + s * 0.24, y + s * 0.04, s * 0.065, nd, rim, lw * 0.6);
          G.poly([[x, y - s * 0.28 + sway * 0.5], [x + s * 0.14, y - s * 0.02], [x - s * 0.14, y - s * 0.02]], nc, rim, lw * 0.85, true);
        } else if (vv === 2) {
          G.box(x, y, s * 0.80, s * 0.78, s * 0.15, '#1e293b', rim, lw);
          G.pill(x - s * 0.26, y - s * 0.22 + sway, x + s * 0.26, y - s * 0.22 - sway, lw, cc);
          G.disc(x - s * 0.26, y - s * 0.22 + sway, s * 0.055, nd, rim, lw * 0.55);
          G.disc(x + s * 0.26, y - s * 0.22 - sway, s * 0.055, nd, rim, lw * 0.55);
          G.poly([[x, y - s * 0.22], [x + s * 0.18, y + s * 0.10], [x + s * 0.10, y + s * 0.26], [x - s * 0.10, y + s * 0.26], [x - s * 0.18, y + s * 0.10]], nc, rim, lw * 0.9, true);
        } else if (vv === 3) {
          G.ring(x, y + s * 0.18, s * 0.36, lw * 1.2, Math.PI * 1.1, Math.PI * 1.9, cc);
          G.pill(x - s * 0.28, y - s * 0.22 + sway, x + s * 0.28, y - s * 0.22 - sway, lw * 0.9, rim);
          G.box(x - s * 0.28, y - s * 0.22 + sway, s * 0.10, s * 0.10, s * 0.02, cc, rim, lw * 0.6);
          G.box(x + s * 0.28, y - s * 0.22 - sway, s * 0.10, s * 0.10, s * 0.02, cc, rim, lw * 0.6);
          G.disc(x, y - s * 0.20, s * 0.09, nd, rim, lw * 0.75);
          G.box(x, y + s * 0.24, s * 0.34, s * 0.16, s * 0.05, nc, rim, lw * 0.8);
        } else if (vv === 4) {
          G.part(x, y, 0.45 + sway * 0.02, 1, 1, function() {
            G.poly([[0, -s * 0.40], [s * 0.18, s * 0.08], [s * 0.12, s * 0.28], [-s * 0.12, s * 0.28], [-s * 0.18, s * 0.08]], nc, rim, lw, true);
            G.pill(0, -s * 0.38, 0, -s * 0.06, lw, nd);
            G.disc(0, -s * 0.04, s * 0.055, cc, rim, lw * 0.6);
            G.box(0, s * 0.34, s * 0.28, s * 0.12, s * 0.03, cc, rim, lw * 0.75);
          });
        } else if (vv === 5) {
          G.box(x - s * 0.28, y + s * 0.24, s * 0.13, s * 0.13, s * 0.02, nd, rim, lw * 0.7);
          G.box(x + s * 0.28, y - s * 0.24, s * 0.13, s * 0.13, s * 0.02, nd, rim, lw * 0.7);
          G.pill(x - s * 0.24, y + s * 0.20, x, y - s * 0.02 + sway, lw * 1.3, cc);
          G.pill(x, y - s * 0.02 + sway, x + s * 0.24, y - s * 0.20, lw * 1.3, cc);
          G.disc(x, y - s * 0.02 + sway, s * 0.09, nc, rim, lw * 0.8);
        } else {
          G.pill(x - s * 0.34, y - s * 0.28 + sway * 0.5, x + s * 0.34, y - s * 0.28 - sway * 0.5, lw * 0.9, cc);
          G.disc(x - s * 0.34, y - s * 0.28 + sway * 0.5, s * 0.06, nd, rim, lw * 0.6);
          G.disc(x + s * 0.34, y - s * 0.28 - sway * 0.5, s * 0.06, nd, rim, lw * 0.6);
          G.poly([[x, y - s * 0.28], [x + s * 0.24, y + s * 0.08], [x + s * 0.14, y + s * 0.26], [x - s * 0.14, y + s * 0.26], [x - s * 0.24, y + s * 0.08]], nc, rim, lw, true);
          G.pill(x, y - s * 0.26, x, y + s * 0.02, lw, nd);
          G.disc(x, y + s * 0.04, s * 0.065, cc, rim, lw * 0.65);
          G.box(x, y + s * 0.33, s * 0.34, s * 0.13, s * 0.03, cc, rim, lw * 0.8);
        }
      },
      drone: function(x, y, s, bodyCol, rotorCol, camCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#1e293b', rc = rotorCol || '#00e5ff', cc = camCol || '#ffd700';
        var spinW = s * (0.14 + 0.12 * Math.abs(Math.cos(tt * 8.0)));
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.pill(x - s * 0.24, y - s * 0.06, x + s * 0.24, y - s * 0.06, lw * 1.4, '#4f46e5');
          G.capsule(x - s * 0.24, y - s * 0.16, spinW * 1.1, s * 0.05, rc, null, 0);
          G.capsule(x + s * 0.24, y - s * 0.16, spinW * 1.1, s * 0.05, rc, null, 0);
          G.box(x, y + s * 0.02, s * 0.24, s * 0.16, s * 0.06, bc, rim, lw * 0.85);
          G.disc(x, y + s * 0.16, s * 0.085, cc, rim, lw * 0.65);
        } else if (vv === 2) {
          G.pill(x - s * 0.28, y - s * 0.24, x + s * 0.28, y + s * 0.24, lw * 1.3, '#4f46e5');
          G.pill(x + s * 0.28, y - s * 0.24, x - s * 0.28, y + s * 0.24, lw * 1.3, '#4f46e5');
          G.disc(x - s * 0.28, y - s * 0.24, s * 0.11, '#0f172a', rc, lw * 0.8);
          G.disc(x + s * 0.28, y - s * 0.24, s * 0.11, '#0f172a', rc, lw * 0.8);
          G.disc(x - s * 0.28, y + s * 0.24, s * 0.11, '#0f172a', rc, lw * 0.8);
          G.disc(x + s * 0.28, y + s * 0.24, s * 0.11, '#0f172a', rc, lw * 0.8);
          G.box(x, y, s * 0.26, s * 0.26, s * 0.08, bc, rim, lw);
          G.disc(x, y, s * 0.075, cc, rim, lw * 0.6);
        } else if (vv === 3) {
          G.pill(x - s * 0.34, y - s * 0.08, x + s * 0.34, y - s * 0.08, lw * 1.5, '#4f46e5');
          G.capsule(x - s * 0.32, y - s * 0.22, spinW * 1.3, s * 0.055, rc, rim, lw * 0.5);
          G.capsule(x + s * 0.32, y - s * 0.22, spinW * 1.3, s * 0.055, rc, rim, lw * 0.5);
          G.box(x, y - s * 0.06, s * 0.34, s * 0.18, s * 0.07, bc, rim, lw);
          G.box(x, y + s * 0.22, s * 0.24, s * 0.22, s * 0.05, cc, rim, lw * 0.8);
          G.pill(x - s * 0.10, y + s * 0.04, x - s * 0.08, y + s * 0.12, lw, rim);
          G.pill(x + s * 0.10, y + s * 0.04, x + s * 0.08, y + s * 0.12, lw, rim);
        } else if (vv === 4) {
          G.box(x, y, s * 0.80, s * 0.78, s * 0.16, '#1e293b', rim, lw);
          G.pill(x - s * 0.26, y - s * 0.04, x + s * 0.26, y - s * 0.04, lw * 1.4, rc);
          G.capsule(x - s * 0.26, y - s * 0.16, spinW * 1.1, s * 0.05, cc, null, 0);
          G.capsule(x + s * 0.26, y - s * 0.16, spinW * 1.1, s * 0.05, cc, null, 0);
          G.box(x, y + s * 0.04, s * 0.26, s * 0.18, s * 0.06, '#4f46e5', rim, lw * 0.85);
        } else if (vv === 5) {
          G.pill(x - s * 0.34, y - s * 0.06, x + s * 0.34, y - s * 0.06, lw * 1.5, bc);
          G.capsule(x - s * 0.32, y - s * 0.20, spinW * 1.3, s * 0.055, rc, null, 0);
          G.capsule(x + s * 0.32, y - s * 0.20, spinW * 1.3, s * 0.055, rc, null, 0);
          G.capsule(x, y - s * 0.04, s * 0.38, s * 0.16, '#4f46e5', rim, lw);
          G.disc(x, y + s * 0.16, s * 0.12, '#0f172a', rim, lw * 0.8);
          G.disc(x, y + s * 0.16, s * 0.06, cc, null, 0);
        } else {
          G.pill(x - s * 0.36, y - s * 0.06, x + s * 0.36, y - s * 0.06, lw * 1.5, '#4f46e5');
          G.pill(x - s * 0.32, y - s * 0.18, x - s * 0.32, y - s * 0.06, lw * 1.2, rim);
          G.pill(x + s * 0.32, y - s * 0.18, x + s * 0.32, y - s * 0.06, lw * 1.2, rim);
          G.capsule(x - s * 0.32, y - s * 0.20, spinW * 1.4, s * 0.055, rc, rim, lw * 0.45);
          G.capsule(x + s * 0.32, y - s * 0.20, spinW * 1.4, s * 0.055, rc, rim, lw * 0.45);
          G.box(x, y - s * 0.02, s * 0.34, s * 0.18, s * 0.07, bc, rim, lw);
          G.disc(x, y + s * 0.16, s * 0.11, cc, rim, lw * 0.75);
          G.disc(x, y + s * 0.16, s * 0.045, '#0f172a', null, 0);
        }
      },
      satellite: function(x, y, s, bodyCol, wingCol, beamCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#1e293b', wc = wingCol || '#4f46e5', ac = beamCol || '#00e5ff';
        var pulse = Math.sin(tt * 3.2) * s * 0.03;
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.poly([[x - s * 0.18, y + s * 0.28], [x, y - s * 0.08], [x + s * 0.18, y + s * 0.28]], bc, rim, lw * 0.9, true);
          G.disc(x, y - s * 0.12, s * 0.07, '#ffd700', rim, lw * 0.65);
          G.ring(x, y - s * 0.12, s * 0.16 + pulse, lw, -Math.PI * 0.8, -Math.PI * 0.2, ac);
          G.ring(x, y - s * 0.12, s * 0.25 - pulse, lw * 0.85, -Math.PI * 0.85, -Math.PI * 0.15, '#ffd700');
        } else if (vv === 2) {
          G.part(x - s * 0.04, y + s * 0.04, -0.78, 1, 1, function() {
            G.ring(0, 0, s * 0.30, lw * 1.4, Math.PI * 0.15, Math.PI * 0.85, bc);
            G.pill(-s * 0.26, 0, s * 0.26, 0, lw * 1.2, rim);
            G.pill(0, 0, 0, -s * 0.22, lw * 1.1, rim);
            G.disc(0, -s * 0.24, s * 0.06, '#ffd700', rim, lw * 0.6);
          });
          G.ring(x + s * 0.12, y - s * 0.12, s * 0.16 + pulse, lw, -Math.PI * 0.45, 0.15, ac);
          G.ring(x + s * 0.12, y - s * 0.12, s * 0.25 - pulse, lw * 0.85, -Math.PI * 0.45, 0.15, '#ffd700');
        } else if (vv === 3) {
          G.box(x, y, s * 0.80, s * 0.78, s * 0.16, '#0f172a', rim, lw);
          G.ring(x, y + s * 0.24, s * 0.16 + pulse, lw * 1.1, Math.PI * 1.15, Math.PI * 1.85, ac);
          G.ring(x, y + s * 0.24, s * 0.30 - pulse, lw * 1.1, Math.PI * 1.15, Math.PI * 1.85, wc);
          G.ring(x, y + s * 0.24, s * 0.44 + pulse * 0.6, lw * 1.1, Math.PI * 1.15, Math.PI * 1.85, '#ffd700');
          G.disc(x, y + s * 0.24, s * 0.07, '#ffd700', rim, lw * 0.6);
        } else if (vv === 4) {
          G.part(x, y, 0.45, 1, 1, function() {
            G.box(-s * 0.28, 0, s * 0.24, s * 0.18, s * 0.03, wc, ac, lw * 0.8);
            G.box(s * 0.28, 0, s * 0.24, s * 0.18, s * 0.03, wc, ac, lw * 0.8);
            G.box(0, 0, s * 0.24, s * 0.24, s * 0.06, bc, rim, lw);
            G.disc(0, s * 0.18, s * 0.08, '#ffd700', rim, lw * 0.65);
          });
          G.ring(x - s * 0.10, y + s * 0.20, s * 0.15 + pulse, lw, 0.4, 2.2, ac);
        } else if (vv === 5) {
          G.disc(x, y, s * 0.20, wc, rim, lw);
          G.oval(x, y, s * 0.42, s * 0.15, -0.42, null, ac, lw * 1.05);
          G.disc(x + Math.cos(tt * 1.8) * s * 0.36, y + Math.sin(tt * 1.8) * s * 0.14, s * 0.07, '#ffd700', rim, lw * 0.6);
        } else {
          G.part(x, y - s * 0.04, -0.55, 1, 1, function() {
            G.box(-s * 0.30, 0, s * 0.26, s * 0.20, s * 0.03, wc, ac, lw * 0.8);
            G.box(s * 0.30, 0, s * 0.26, s * 0.20, s * 0.03, wc, ac, lw * 0.8);
            G.box(0, 0, s * 0.24, s * 0.24, s * 0.05, bc, rim, lw);
            G.ring(0, s * 0.16, s * 0.14, lw, 0.2, Math.PI - 0.2, '#ffd700');
          });
          G.ring(x + s * 0.12, y + s * 0.14, s * 0.14 + pulse, lw * 1.05, 0.2, 1.5, ac);
          G.ring(x + s * 0.12, y + s * 0.14, s * 0.24 - pulse, lw * 0.9, 0.2, 1.5, '#ffd700');
        }
      },
      key: function(x, y, s, keyCol, bowCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var kc = keyCol || '#ffd700', bc = bowCol || '#4f46e5', ac = accCol || '#00e5ff';
        var turn = Math.sin(tt * 2.4) * 0.18;
        var drawKey = function(ang) {
          G.part(x, y, ang + turn, 1, 1, function() {
            G.disc(-s * 0.20, 0, s * 0.17, kc, rim, lw);
            G.disc(-s * 0.20, 0, s * 0.065, '#0f172a', rim, lw * 0.65);
            G.capsule(s * 0.14, 0, s * 0.42, s * 0.095, kc, rim, lw * 0.85);
            G.box(s * 0.18, s * 0.10, s * 0.08, s * 0.11, s * 0.02, kc, rim, lw * 0.7);
            G.box(s * 0.30, s * 0.11, s * 0.08, s * 0.14, s * 0.02, ac, rim, lw * 0.7);
          });
        };
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#1e293b', rim, lw);
          drawKey(-0.35);
        } else if (vv === 2) {
          G.box(x, y, s * 0.80, s * 0.80, s * 0.16, bc, rim, lw);
          drawKey(-0.45);
        } else if (vv === 3) {
          G.poly([[x, y - s * 0.42], [x + s * 0.36, y - s * 0.25], [x + s * 0.31, y + s * 0.16], [x, y + s * 0.42], [x - s * 0.31, y + s * 0.16], [x - s * 0.36, y - s * 0.25]], '#1e293b', rim, lw, true);
          drawKey(-0.45);
        } else if (vv === 4) {
          G.box(x, y, s * 0.82, s * 0.56, s * 0.10, bc, rim, lw);
          G.disc(x - s * 0.16, y, s * 0.13, kc, rim, lw * 0.8);
          G.capsule(x + s * 0.12, y, s * 0.34, s * 0.09, ac, rim, lw * 0.7);
          G.disc(x + s * 0.20, y - s * 0.16 + Math.sin(tt * 3) * s * 0.03, s * 0.055, '#ffd700', null, 0);
        } else if (vv === 5) {
          drawKey(-Math.PI / 2);
        } else {
          drawKey(0);
        }
      },
      battery: function(x, y, s, shellCol, chargeCol, boltCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var sc = shellCol || '#1e293b', cc = chargeCol || '#00e5ff', bc = boltCol || '#ffd700';
        var lvl = Math.floor((tt * 2.2) % 3) + 1;
        if (vv === 1) {
          G.box(x, y + s * 0.04, s * 0.52, s * 0.74, s * 0.10, sc, rim, lw);
          G.box(x, y - s * 0.37, s * 0.22, s * 0.10, s * 0.03, '#94a3b8', rim, lw * 0.75);
          for (var b1 = 0; b1 < 3; b1++) {
            G.box(x, y + s * 0.24 - b1 * s * 0.19, s * 0.36, s * 0.13, s * 0.04, b1 < lvl ? cc : '#0f172a', null, 0);
          }
        } else if (vv === 2) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.box(x - s * 0.03, y, s * 0.54, s * 0.34, s * 0.07, sc, rim, lw * 0.9);
          G.box(x + s * 0.27, y, s * 0.08, s * 0.16, s * 0.02, '#94a3b8', rim, lw * 0.6);
          G.box(x - s * 0.10 + (lvl - 1) * s * 0.04, y, s * (0.14 + lvl * 0.08), s * 0.22, s * 0.04, cc, null, 0);
        } else if (vv === 3) {
          G.box(x, y + s * 0.04, s * 0.54, s * 0.72, s * 0.10, sc, rim, lw);
          G.box(x, y - s * 0.36, s * 0.22, s * 0.10, s * 0.03, cc, rim, lw * 0.75);
          G.poly([[x + s * 0.04, y - s * 0.18], [x - s * 0.12, y + s * 0.04], [x + s * 0.02, y + s * 0.04], [x - s * 0.04, y + s * 0.26], [x + s * 0.14, y], [x, y]], bc, rim, lw * 0.7, true);
        } else if (vv === 4) {
          G.box(x, y, s * 0.80, s * 0.78, s * 0.16, '#0f172a', rim, lw);
          G.ring(x, y, s * 0.27, lw * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * (0.7 + 0.4 * lvl), cc);
          G.poly([[x + s * 0.03, y - s * 0.14], [x - s * 0.09, y + s * 0.02], [x + s * 0.01, y + s * 0.02], [x - s * 0.03, y + s * 0.18], [x + s * 0.10, y - s * 0.02], [x, y - s * 0.02]], bc, null, 0, true);
        } else if (vv === 5) {
          G.box(x - s * 0.04, y, s * 0.68, s * 0.42, s * 0.09, sc, rim, lw);
          G.box(x + s * 0.34, y, s * 0.09, s * 0.20, s * 0.03, '#94a3b8', rim, lw * 0.7);
          for (var b5 = 0; b5 < 3; b5++) {
            G.box(x - s * 0.20 + b5 * s * 0.16, y, s * 0.12, s * 0.26, s * 0.03, b5 < lvl ? (b5 === 2 ? bc : cc) : '#0f172a', null, 0);
          }
        } else {
          G.box(x, y + s * 0.04, s * 0.56, s * 0.74, s * 0.10, sc, rim, lw);
          G.box(x, y - s * 0.37, s * 0.24, s * 0.10, s * 0.03, '#94a3b8', rim, lw * 0.75);
          G.box(x, y + s * 0.14, s * 0.42, s * (0.14 + lvl * 0.13), s * 0.05, cc, null, 0);
          G.poly([[x + s * 0.03, y - s * 0.16], [x - s * 0.10, y + s * 0.02], [x + s * 0.02, y + s * 0.02], [x - s * 0.04, y + s * 0.22], [x + s * 0.12, y - s * 0.02], [x, y - s * 0.02]], bc, rim, lw * 0.65, true);
        }
      },
`;
