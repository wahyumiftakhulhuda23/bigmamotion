// Cohesive 6-variant ES5 Canvas 2D Hero Icons (Part B) & Full-Frame Background Helpers
// Appended directly inside `var G = { ...` in motionGeometryEngine.ts.

export const ENGINE_HERO_ICONS_B_JS = `
      handshake: function(x, y, s, colL, colR, handCol, cuffCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 72)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cl = colL || '#3b82f6', cr = colR || '#00e5ff', hc = handCol || '#f59e0b', cc = cuffCol || '#f8fafc';
        var bob = Math.sin(tt * 2.8) * s * 0.025;
        if (vv === 1) {
          G.box(x, y, s * 0.88, s * 0.72, s * 0.14, '#1e293b', rim, lw);
          G.poly([[x - s * 0.36, y - s * 0.12 + bob], [x - s * 0.10, y - s * 0.16 + bob], [x - s * 0.10, y + s * 0.12 + bob], [x - s * 0.36, y + s * 0.16 + bob]], cl, rim, lw * 0.85, true);
          G.poly([[x + s * 0.36, y - s * 0.12 + bob], [x + s * 0.10, y - s * 0.16 + bob], [x + s * 0.10, y + s * 0.12 + bob], [x + s * 0.36, y + s * 0.16 + bob]], cr, rim, lw * 0.85, true);
          G.box(x, y + bob, s * 0.28, s * 0.22, s * 0.09, hc, rim, lw * 0.9);
          G.star(x, y - s * 0.25, s * 0.09 + 0.015 * s * Math.sin(tt * 3.2), s * 0.04, 5, -Math.PI / 2, '#ffd700', rim, lw * 0.55);
        } else if (vv === 2) {
          G.disc(x, y, s * 0.42, '#1e293b', rim, lw);
          G.ring(x, y, s * 0.34, s * 0.03, tt * 0.9, tt * 0.9 + Math.PI * 1.35, cr);
          G.box(x - s * 0.18, y + bob, s * 0.24, s * 0.19, s * 0.06, cl, rim, lw * 0.8);
          G.box(x + s * 0.18, y + bob, s * 0.24, s * 0.19, s * 0.06, cr, rim, lw * 0.8);
          G.box(x, y + bob, s * 0.26, s * 0.21, s * 0.09, hc, rim, lw);
        } else if (vv === 3) {
          G.box(x, y + s * 0.04, s * 0.78, s * 0.76, s * 0.10, '#f8fafc', rim, lw);
          G.box(x, y - s * 0.24, s * 0.78, s * 0.16, s * 0.07, cl, rim, lw * 0.8);
          G.box(x - s * 0.18, y + s * 0.08 + bob, s * 0.24, s * 0.18, s * 0.06, cl, rim, lw * 0.8);
          G.box(x + s * 0.18, y + s * 0.08 + bob, s * 0.24, s * 0.18, s * 0.06, cr, rim, lw * 0.8);
          G.box(x, y + s * 0.08 + bob, s * 0.25, s * 0.20, s * 0.08, hc, rim, lw * 0.85);
        } else if (vv === 4) {
          G.person(x - s * 0.26, y - s * 0.04, s * 0.36, cl, cc, rim);
          G.person(x + s * 0.26, y - s * 0.04, s * 0.36, cr, cc, rim);
          G.box(x, y + s * 0.16 + bob, s * 0.34, s * 0.22, s * 0.10, hc, rim, lw);
          G.pill(x - s * 0.16, y + s * 0.16 + bob, x + s * 0.16, y + s * 0.16 + bob, lw, cc);
        } else if (vv === 5) {
          G.poly([[x, y - s * 0.44], [x + s * 0.38, y - s * 0.24], [x + s * 0.32, y + s * 0.20], [x, y + s * 0.44], [x - s * 0.32, y + s * 0.20], [x - s * 0.38, y - s * 0.24]], '#1e293b', rim, lw, true);
          G.poly([[x - s * 0.26, y - s * 0.06 + bob], [x - s * 0.06, y - s * 0.12 + bob], [x - s * 0.06, y + s * 0.12 + bob], [x - s * 0.26, y + s * 0.14 + bob]], cl, rim, lw * 0.75, true);
          G.poly([[x + s * 0.26, y - s * 0.06 + bob], [x + s * 0.06, y - s * 0.12 + bob], [x + s * 0.06, y + s * 0.12 + bob], [x + s * 0.26, y + s * 0.14 + bob]], cr, rim, lw * 0.75, true);
          G.box(x, y + s * 0.02 + bob, s * 0.22, s * 0.18, s * 0.08, hc, rim, lw * 0.85);
        } else {
          G.poly([[x - s * 0.48, y - s * 0.12 + bob], [x - s * 0.22, y - s * 0.20 + bob], [x - s * 0.16, y + s * 0.12 + bob], [x - s * 0.42, y + s * 0.22 + bob]], cl, rim, lw, true);
          G.poly([[x + s * 0.48, y - s * 0.12 + bob], [x + s * 0.22, y - s * 0.20 + bob], [x + s * 0.16, y + s * 0.12 + bob], [x + s * 0.42, y + s * 0.22 + bob]], cr, rim, lw, true);
          G.box(x - s * 0.22, y + bob, s * 0.09, s * 0.28, s * 0.03, cc, rim, lw * 0.8);
          G.box(x + s * 0.22, y + bob, s * 0.09, s * 0.28, s * 0.03, cc, rim, lw * 0.8);
          G.box(x, y + s * 0.01 + bob, s * 0.32, s * 0.25, s * 0.10, hc, rim, lw);
          G.pill(x - s * 0.08, y - s * 0.03 + bob, x + s * 0.08, y + s * 0.03 + bob, Math.max(2, s * 0.036), rim);
          G.pill(x - s * 0.06, y + s * 0.06 + bob, x + s * 0.06, y + s * 0.10 + bob, Math.max(2, s * 0.032), cc);
        }
      },
      shield: function(x, y, s, fillCol, rimCol, innerCol, accCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 72)));
        var acIn = (typeof accCol === 'number' || accCol == null) ? '#ffd700' : accCol;
        var tArg = typeof accCol === 'number' ? accCol : t;
        var vArg = typeof accCol === 'number' ? t : v;
        var rt = G._rt(rimCol, tArg), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(vArg);
        var fc = fillCol || '#1e293b', ic = innerCol || '#00e5ff';
        var pulse = 1 + 0.07 * Math.sin(tt * 2.8);
        var ptsOut = [[x, y - s * 0.46], [x + s * 0.39, y - s * 0.29], [x + s * 0.34, y + s * 0.16], [x, y + s * 0.46], [x - s * 0.34, y + s * 0.16], [x - s * 0.39, y - s * 0.29]];
        if (vv === 1) {
          G.poly(ptsOut, fc, rim, lw, true);
          G.poly([[x, y - s * 0.36], [x + s * 0.29, y - s * 0.22], [x + s * 0.25, y + s * 0.12], [x, y + s * 0.35], [x - s * 0.25, y + s * 0.12], [x - s * 0.29, y - s * 0.22]], ic, null, 0, true);
          G.box(x, y + s * 0.05, s * 0.26, s * 0.21, s * 0.05, acIn, rim, lw * 0.75);
          G.ring(x, y - s * 0.06, s * 0.08 * pulse, lw * 1.1, Math.PI, Math.PI * 2, rim);
        } else if (vv === 2) {
          G.ring(x, y, s * 0.46, s * 0.032, tt * 1.1, tt * 1.1 + Math.PI * 1.45, ic);
          G.poly([[x, y - s * 0.39], [x + s * 0.33, y - s * 0.24], [x + s * 0.28, y + s * 0.14], [x, y + s * 0.39], [x - s * 0.28, y + s * 0.14], [x - s * 0.33, y - s * 0.24]], fc, rim, lw, true);
          G.star(x, y, s * 0.15 * pulse, s * 0.065 * pulse, 5, -Math.PI / 2, acIn, rim, lw * 0.65);
        } else if (vv === 3) {
          G.poly(ptsOut, fc, rim, lw, true);
          G.poly([[x, y - s * 0.36], [x, y + s * 0.36], [x - s * 0.27, y + s * 0.12], [x - s * 0.31, y - s * 0.22]], ic, null, 0, true);
          G.check(x + s * 0.02, y + s * 0.02, s * 0.26 * pulse, Math.max(3, s * 0.065), acIn);
        } else if (vv === 4) {
          G.poly(ptsOut, fc, rim, lw, true);
          G.ring(x, y, s * 0.22 * pulse, lw * 1.2, 0, Math.PI * 2, ic);
          G.disc(x, y, s * 0.12, acIn, rim, lw * 0.7);
          G.pill(x - s * 0.24, y, x - s * 0.15, y, lw, rim);
          G.pill(x + s * 0.15, y, x + s * 0.24, y, lw, rim);
        } else if (vv === 5) {
          G.box(x, y, s * 0.80, s * 0.84, s * 0.18, '#1e293b', rim, lw);
          G.poly([[x, y - s * 0.31], [x + s * 0.26, y - s * 0.19], [x + s * 0.22, y + s * 0.11], [x, y + s * 0.31], [x - s * 0.22, y + s * 0.11], [x - s * 0.26, y - s * 0.19]], ic, rim, lw * 0.8, true);
          G.check(x, y + s * 0.01, s * 0.21 * pulse, Math.max(2.8, s * 0.055), acIn);
        } else {
          G.poly(ptsOut, fc, rim, lw, true);
          G.poly([[x, y - s * 0.35], [x + s * 0.28, y - s * 0.21], [x + s * 0.24, y + s * 0.12], [x, y + s * 0.34], [x - s * 0.24, y + s * 0.12], [x - s * 0.28, y - s * 0.21]], ic, null, 0, true);
          G.check(x, y + s * 0.02, s * 0.28 * pulse, Math.max(3, s * 0.07), rim);
        }
      },
      cart: function(x, y, s, bodyCol, wheelCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 72)));
        var acIn = (typeof accCol === 'number' || accCol == null) ? '#ffd700' : accCol;
        var tArg = typeof accCol === 'number' ? accCol : t;
        var vArg = typeof accCol === 'number' ? t : v;
        var rt = G._rt(rimCol, tArg), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(vArg);
        var bc = bodyCol || '#00e5ff', wc = wheelCol || '#ffd700';
        var roll = Math.sin(tt * 2.8) * s * 0.03;
        if (vv === 1) {
          G.box(x, y + s * 0.04, s * 0.62, s * 0.56, s * 0.10, bc, rim, lw);
          G.ring(x, y - s * 0.22, s * 0.15, lw * 1.4, Math.PI, Math.PI * 2, rim);
          G.box(x, y + s * 0.06, s * 0.28, s * 0.24, s * 0.05, acIn, rim, lw * 0.7);
          G.pill(x - s * 0.20, y + s * 0.06 + roll * 0.5, x + s * 0.20, y + s * 0.06 + roll * 0.5, lw, rim);
        } else if (vv === 2) {
          G.box(x - s * 0.04, y - s * 0.24 + roll, s * 0.28, s * 0.20, s * 0.05, acIn, rim, lw * 0.8);
          G.poly([[x - s * 0.28, y - s * 0.14], [x + s * 0.38, y - s * 0.14], [x + s * 0.28, y + s * 0.16], [x - s * 0.22, y + s * 0.16]], bc, rim, lw, true);
          G.pill(x - s * 0.42, y - s * 0.28, x - s * 0.28, y - s * 0.14, lw * 1.2, rim);
          G.disc(x - s * 0.14, y + s * 0.30, s * 0.095, wc, rim, lw * 0.85);
          G.disc(x + s * 0.20, y + s * 0.30, s * 0.095, wc, rim, lw * 0.85);
        } else if (vv === 3) {
          G.box(x, y, s * 0.84, s * 0.72, s * 0.14, '#1e293b', rim, lw);
          G.poly([[x - s * 0.22, y - s * 0.14], [x + s * 0.28, y - s * 0.14], [x + s * 0.21, y + s * 0.09], [x - s * 0.18, y + s * 0.09]], bc, rim, lw * 0.8, true);
          G.pill(x - s * 0.30, y - s * 0.22, x - s * 0.22, y - s * 0.14, lw, rim);
          G.disc(x - s * 0.11, y + s * 0.20, s * 0.065, wc, rim, lw * 0.7);
          G.disc(x + s * 0.15, y + s * 0.20, s * 0.065, wc, rim, lw * 0.7);
          G.check(x + s * 0.04, y - s * 0.02 + roll * 0.4, s * 0.15, lw * 1.1, rim);
        } else if (vv === 4) {
          G.poly([[x - s * 0.34, y - s * 0.10], [x + s * 0.34, y - s * 0.10], [x + s * 0.24, y + s * 0.24], [x - s * 0.24, y + s * 0.24]], bc, rim, lw, true);
          G.pill(x - s * 0.22, y - s * 0.10, x - s * 0.08, y - s * 0.34 + roll * 0.5, lw * 1.2, rim);
          G.pill(x + s * 0.22, y - s * 0.10, x + s * 0.08, y - s * 0.34 + roll * 0.5, lw * 1.2, rim);
          G.box(x, y + s * 0.07, s * 0.26, s * 0.12, s * 0.04, acIn, rim, lw * 0.65);
        } else if (vv === 5) {
          G.pill(x - s * 0.42, y - s * 0.24, x - s * 0.28, y - s * 0.24, lw * 1.3, rim);
          G.pill(x - s * 0.28, y - s * 0.24, x - s * 0.18, y + s * 0.16, lw * 1.2, rim);
          G.poly([[x - s * 0.23, y - s * 0.12], [x + s * 0.36, y - s * 0.12], [x + s * 0.28, y + s * 0.16], [x - s * 0.18, y + s * 0.16]], bc, rim, lw, true);
          G.disc(x + s * 0.26, y - s * 0.24, s * 0.13 + roll * 0.3, acIn, rim, lw * 0.8);
          G.disc(x - s * 0.12, y + s * 0.30, s * 0.09, wc, rim, lw * 0.8);
          G.disc(x + s * 0.20, y + s * 0.30, s * 0.09, wc, rim, lw * 0.8);
        } else {
          G.pill(x - s * 0.42, y - s * 0.27, x - s * 0.28, y - s * 0.27, lw * 1.3, rim);
          G.pill(x - s * 0.28, y - s * 0.27, x - s * 0.16, y + s * 0.16, lw * 1.2, rim);
          G.poly([[x - s * 0.22, y - s * 0.16], [x + s * 0.40, y - s * 0.16], [x + s * 0.30, y + s * 0.16], [x - s * 0.16, y + s * 0.16]], bc, rim, lw, true);
          G.pill(x - s * 0.08, y - s * 0.03, x + s * 0.25, y - s * 0.03, lw * 0.85, rim);
          G.disc(x - s * 0.10, y + s * 0.31, s * 0.095, wc, rim, lw * 0.85);
          G.disc(x + s * 0.24, y + s * 0.31, s * 0.095, wc, rim, lw * 0.85);
        }
      },
      megaphone: function(x, y, s, coneCol, handleCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 72)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = coneCol || '#4f46e5', hc = handleCol || '#f43f5e', ac = accCol || '#ffd700';
        var wv = 0.04 * Math.sin(tt * 3.8);
        if (vv === 1) {
          G.box(x, y, s * 0.84, s * 0.78, s * 0.16, '#1e293b', rim, lw);
          G.poly([[x - s * 0.24, y - s * 0.10], [x + s * 0.14, y - s * 0.25], [x + s * 0.14, y + s * 0.21], [x - s * 0.24, y + s * 0.06]], cc, rim, lw * 0.85, true);
          G.box(x - s * 0.16, y + s * 0.15, s * 0.11, s * 0.20, s * 0.04, hc, rim, lw * 0.75);
          G.ring(x + s * 0.18, y - s * 0.02, s * 0.14 + wv * s, lw, -0.7, 0.7, ac);
          G.ring(x + s * 0.18, y - s * 0.02, s * 0.23 - wv * s, lw * 0.85, -0.65, 0.65, '#00e5ff');
        } else if (vv === 2) {
          G.disc(x, y, s * 0.43, '#1e293b', rim, lw);
          G.poly([[x - s * 0.24, y - s * 0.09], [x + s * 0.14, y - s * 0.24], [x + s * 0.14, y + s * 0.20], [x - s * 0.24, y + s * 0.05]], cc, rim, lw * 0.85, true);
          G.box(x - s * 0.16, y + s * 0.15, s * 0.10, s * 0.18, s * 0.03, hc, rim, lw * 0.7);
          G.ring(x + s * 0.18, y - s * 0.02, s * 0.15 + wv * s, lw, -0.75, 0.75, ac);
        } else if (vv === 3) {
          G.box(x - s * 0.12, y - s * 0.12, s * 0.54, s * 0.42, s * 0.08, '#00e5ff', rim, lw * 0.8);
          G.bar(x - s * 0.22, y + s * 0.04, s * 0.10, s * 0.18 + wv * s * 1.4, s * 0.02, ac, null, 0);
          G.bar(x - s * 0.06, y + s * 0.04, s * 0.10, s * 0.25 - wv * s * 1.2, s * 0.02, hc, null, 0);
          G.poly([[x - s * 0.02, y + s * 0.06], [x + s * 0.34, y - s * 0.14], [x + s * 0.34, y + s * 0.28], [x - s * 0.02, y + s * 0.18]], cc, rim, lw, true);
          G.box(x + s * 0.06, y + s * 0.26, s * 0.10, s * 0.18, s * 0.03, hc, rim, lw * 0.75);
        } else if (vv === 4) {
          G.poly([[x - s * 0.36, y - s * 0.10], [x + s * 0.16, y - s * 0.32], [x + s * 0.16, y + s * 0.24], [x - s * 0.36, y + s * 0.08]], cc, rim, lw, true);
          G.box(x - s * 0.22, y + s * 0.22, s * 0.13, s * 0.26, s * 0.05, hc, rim, lw * 0.85);
          G.star(x + s * 0.33, y - s * 0.18 + wv * s, s * 0.11, s * 0.05, 4, 0, ac, rim, lw * 0.6);
          G.ring(x + s * 0.20, y - s * 0.04, s * 0.18 + wv * s, lw * 1.1, -0.75, 0.75, ac);
          G.ring(x + s * 0.20, y - s * 0.04, s * 0.28 - wv * s, lw * 0.9, -0.70, 0.70, '#00e5ff');
        } else if (vv === 5) {
          G.box(x - s * 0.30, y - s * 0.02, s * 0.22, s * 0.24, s * 0.06, hc, rim, lw * 0.85);
          G.poly([[x - s * 0.20, y - s * 0.10], [x + s * 0.18, y - s * 0.30], [x + s * 0.18, y + s * 0.26], [x - s * 0.20, y + s * 0.08]], cc, rim, lw, true);
          G.disc(x + s * 0.32, y - s * 0.12 + wv * s, s * 0.075, ac, rim, lw * 0.65);
          G.disc(x + s * 0.36, y + s * 0.08 - wv * s, s * 0.06, '#00e5ff', rim, lw * 0.6);
        } else {
          G.poly([[x - s * 0.36, y - s * 0.08], [x + s * 0.16, y - s * 0.32], [x + s * 0.16, y + s * 0.24], [x - s * 0.36, y + s * 0.10]], cc, rim, lw, true);
          G.box(x - s * 0.24, y + s * 0.22, s * 0.12, s * 0.26, s * 0.04, hc, rim, lw * 0.85);
          G.oval(x + s * 0.16, y - s * 0.04, s * 0.07, s * 0.28, 0, ac, rim, lw * 0.8);
          G.ring(x + s * 0.22, y - s * 0.04, s * 0.17 + wv * s, lw * 1.1, -0.75, 0.75, ac);
          G.ring(x + s * 0.22, y - s * 0.04, s * 0.27 - wv * s, lw * 0.9, -0.65, 0.65, ac);
        }
      },
      wallet: function(x, y, s, bodyCol, flapCol, claspCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 72)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#3b82f6', fc = flapCol || '#4f46e5', cc = claspCol || '#ffd700';
        var pop = s * 0.05 * Math.sin(tt * 2.6);
        if (vv === 1) {
          G.box(x, y - s * 0.20 + pop, s * 0.62, s * 0.34, s * 0.06, '#00e5ff', rim, lw * 0.85);
          G.box(x, y + s * 0.06, s * 0.84, s * 0.56, s * 0.11, bc, rim, lw);
          G.box(x + s * 0.24, y + s * 0.06, s * 0.32, s * 0.21, s * 0.07, fc, rim, lw * 0.85);
          G.disc(x + s * 0.16, y + s * 0.06, s * 0.055, cc, rim, lw * 0.65);
        } else if (vv === 2) {
          G.box(x, y, s * 0.84, s * 0.62, s * 0.12, bc, rim, lw);
          G.ring(x - s * 0.18, y, s * 0.14 + Math.abs(pop) * 0.5, lw, -0.8, 0.8, cc);
          G.ring(x - s * 0.18, y, s * 0.23 - Math.abs(pop) * 0.4, lw * 0.85, -0.7, 0.7, '#00e5ff');
          G.box(x + s * 0.22, y, s * 0.34, s * 0.22, s * 0.07, fc, rim, lw * 0.85);
          G.disc(x + s * 0.14, y, s * 0.05, cc, null, 0);
        } else if (vv === 3) {
          G.disc(x - s * 0.14, y - s * 0.26 + pop, s * 0.13, cc, rim, lw * 0.8);
          G.disc(x + s * 0.12, y - s * 0.28 - pop * 0.6, s * 0.15, cc, rim, lw * 0.8);
          G.box(x, y + s * 0.06, s * 0.84, s * 0.54, s * 0.11, bc, rim, lw);
          G.box(x + s * 0.23, y + s * 0.06, s * 0.32, s * 0.20, s * 0.07, fc, rim, lw * 0.8);
          G.disc(x + s * 0.16, y + s * 0.06, s * 0.05, cc, null, 0);
        } else if (vv === 4) {
          G.box(x, y, s * 0.62, s * 0.90, s * 0.12, '#1e293b', rim, lw);
          G.box(x, y - s * 0.04, s * 0.48, s * 0.36, s * 0.07, bc, rim, lw * 0.8);
          G.box(x + s * 0.10, y - s * 0.04 + pop * 0.5, s * 0.20, s * 0.14, s * 0.04, cc, rim, lw * 0.65);
          G.capsule(x, y + s * 0.26, s * 0.36, s * 0.11, fc, rim, lw * 0.7);
        } else if (vv === 5) {
          G.box(x, y + s * 0.04, s * 0.84, s * 0.60, s * 0.11, bc, rim, lw);
          G.poly([[x - s * 0.42, y - s * 0.22], [x + s * 0.42, y - s * 0.22], [x + s * 0.34, y + s * 0.04], [x - s * 0.34, y + s * 0.04]], fc, rim, lw * 0.85, true);
          G.disc(x, y + s * 0.06 + pop * 0.35, s * 0.095, cc, rim, lw * 0.8);
        } else {
          G.box(x - s * 0.06, y - s * 0.16 + pop * 0.6, s * 0.62, s * 0.26, s * 0.06, fc, rim, lw * 0.85);
          G.box(x, y + s * 0.04, s * 0.84, s * 0.58, s * 0.11, bc, rim, lw);
          G.box(x + s * 0.23, y + s * 0.04, s * 0.33, s * 0.22, s * 0.08, fc, rim, lw * 0.85);
          G.disc(x + s * 0.15, y + s * 0.04, s * 0.06, cc, rim, lw * 0.65);
        }
      },
      globe: function(x, y, r, sphereCol, lineCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y);
        var rad = Math.max(16, Math.abs(G._n(r, 38)));
        if (rad > 48) rad = rad * 0.48;
        var acIn = (typeof accCol === 'number' || accCol == null) ? '#ffd700' : accCol;
        var tArg = typeof accCol === 'number' ? accCol : t;
        var vArg = typeof accCol === 'number' ? t : v;
        var rt = G._rt(rimCol, tArg), rim = rt.r, tt = rt.t, lw = Math.max(1.6, rad * 0.065), vv = G._v(vArg);
        var sc = sphereCol || '#1e3a8a', lc = lineCol || '#00e5ff';
        var spin = (tt * 0.7) % 1;
        if (vv === 1) {
          G.disc(x, y, rad * 0.82, sc, rim, lw);
          G.oval(x, y, rad * (0.28 + 0.20 * Math.sin(tt * 2.2)), rad * 0.80, 0, null, lc, lw * 0.75);
          G.pill(x - rad * 0.78, y, x + rad * 0.78, y, lw * 0.75, lc);
          G.ring(x, y, rad * 1.04, lw * 0.9, tt * 1.1, tt * 1.1 + Math.PI * 1.25, acIn);
          var ax = x + Math.cos(tt * 1.5) * rad * 1.04, ay = y + Math.sin(tt * 1.5) * rad * 1.04;
          G.disc(ax, ay, rad * 0.12, acIn, rim, lw * 0.55);
        } else if (vv === 2) {
          G.disc(x, y, rad * 0.84, sc, rim, lw);
          G.oval(x, y, rad * 0.44, rad * 0.82, 0, null, lc, lw * 0.75);
          G.pill(x - rad * 0.76, y - rad * 0.28, x + rad * 0.76, y - rad * 0.28, lw * 0.7, lc);
          G.pill(x - rad * 0.76, y + rad * 0.28, x + rad * 0.76, y + rad * 0.28, lw * 0.7, lc);
          G.disc(x - rad * 0.34, y - rad * 0.22 + Math.sin(tt * 3) * rad * 0.05, rad * 0.11, acIn, rim, lw * 0.6);
          G.disc(x + rad * 0.32, y + rad * 0.20 - Math.sin(tt * 3) * rad * 0.05, rad * 0.11, acIn, rim, lw * 0.6);
        } else if (vv === 3) {
          G.disc(x, y - rad * 0.08, rad * 0.78, sc, rim, lw);
          G.oval(x, y - rad * 0.08, rad * (0.24 + 0.22 * Math.sin(tt * 2.1)), rad * 0.76, 0, null, lc, lw * 0.75);
          G.pill(x - rad * 0.72, y - rad * 0.08, x + rad * 0.72, y - rad * 0.08, lw * 0.7, lc);
          G.ring(x, y - rad * 0.08, rad * 0.94, lw * 1.1, -Math.PI * 0.75, Math.PI * 0.55, rim);
          G.capsule(x, y + rad * 0.96, rad * 0.84, rad * 0.18, acIn, rim, lw * 0.7);
        } else if (vv === 4) {
          G.disc(x, y, rad * 0.88, sc, rim, lw);
          G.oval(x, y, rad * (0.22 + 0.34 * spin), rad * 0.86, 0, null, lc, lw * 0.8);
          G.oval(x, y, rad * (0.78 - 0.34 * spin), rad * 0.86, 0, null, lc, lw * 0.7);
          G.pill(x - rad * 0.84, y, x + rad * 0.84, y, lw * 0.75, lc);
          G.disc(x, y, rad * 0.16, acIn, rim, lw * 0.7);
        } else if (vv === 5) {
          G.disc(x, y, rad * 0.82, sc, rim, lw);
          G.oval(x, y, rad * 0.42, rad * 0.80, 0, null, lc, lw * 0.75);
          G.pill(x - rad * 0.76, y, x + rad * 0.76, y, lw * 0.75, lc);
          G.poly([[x, y - rad * 1.02 + Math.sin(tt * 2.8) * rad * 0.07], [x + rad * 0.26, y - rad * 0.62], [x, y - rad * 0.32], [x - rad * 0.26, y - rad * 0.62]], acIn, rim, lw * 0.75, true);
          G.disc(x, y - rad * 0.66 + Math.sin(tt * 2.8) * rad * 0.07, rad * 0.09, rim, null, 0);
        } else {
          G.disc(x, y, rad * 0.88, sc, rim, lw);
          G.oval(x, y, rad * (0.30 + 0.20 * Math.sin(tt * 2.2)), rad * 0.86, 0, null, lc, lw * 0.75);
          G.pill(x - rad * 0.86, y, x + rad * 0.86, y, lw * 0.8, lc);
          G.pill(x - rad * 0.68, y - rad * 0.40, x + rad * 0.68, y - rad * 0.40, lw * 0.7, lc);
          G.pill(x - rad * 0.68, y + rad * 0.40, x + rad * 0.68, y + rad * 0.40, lw * 0.7, lc);
        }
      },
      building: function(x, y, s, bodyCol, winCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#1e293b', wc = winCol || '#00e5ff', ac = accCol || '#ffd700';
        var pulse = 0.03 * Math.sin(tt * 3.0);
        if (vv === 1) {
          G.box(x - s * 0.22, y + s * 0.14, s * 0.24, s * 0.48, s * 0.05, '#3b82f6', rim, lw * 0.85);
          G.box(x + s * 0.22, y + s * 0.18, s * 0.24, s * 0.40, s * 0.05, '#4f46e5', rim, lw * 0.85);
          G.box(x, y + s * 0.02, s * 0.36, s * 0.74, s * 0.06, bc, rim, lw);
          G.pill(x, y - s * 0.35, x, y - s * 0.46 + pulse * s, lw, ac);
          for (var i1 = 0; i1 < 4; i1++) {
            G.box(x, y - s * 0.22 + i1 * s * 0.13, s * 0.20, s * 0.06, s * 0.02, i1 === Math.floor((tt * 2) % 4) ? ac : wc, null, 0);
          }
          G.capsule(x, y + s * 0.40, s * 0.82, s * 0.07, rim, null, 0);
        } else if (vv === 2) {
          G.box(x, y + s * 0.04, s * 0.66, s * 0.62, s * 0.08, bc, rim, lw);
          G.box(x, y - s * 0.30, s * 0.74, s * 0.12, s * 0.04, ac, rim, lw * 0.8);
          for (var c2 = -1; c2 <= 1; c2++) {
            G.box(x + c2 * s * 0.18, y + s * 0.02, s * 0.11, s * 0.32, s * 0.03, wc, rim, lw * 0.6);
          }
          G.box(x, y + s * 0.28, s * 0.20, s * 0.14, s * 0.03, ac, rim, lw * 0.7);
          G.arrow(x + s * 0.28, y - s * 0.10, x + s * 0.42, y - s * 0.36 + pulse * s, lw, s * 0.09, ac);
        } else if (vv === 3) {
          G.poly([[x - s * 0.38, y - s * 0.06], [x, y - s * 0.40], [x + s * 0.38, y - s * 0.06]], ac, rim, lw, true);
          G.box(x, y + s * 0.15, s * 0.60, s * 0.42, s * 0.05, bc, rim, lw);
          G.box(x - s * 0.14, y + s * 0.12, s * 0.14, s * 0.16, s * 0.03, wc, rim, lw * 0.65);
          G.box(x + s * 0.12, y + s * 0.22, s * 0.16, s * 0.26, s * 0.04, '#4f46e5', rim, lw * 0.75);
          G.disc(x, y - s * 0.20 + pulse * s * 0.6, s * 0.07, wc, rim, lw * 0.6);
        } else if (vv === 4) {
          G.box(x - s * 0.12, y + s * 0.02, s * 0.50, s * 0.72, s * 0.08, bc, rim, lw);
          G.box(x + s * 0.24, y + s * 0.14, s * 0.26, s * 0.48, s * 0.06, '#4f46e5', rim, lw * 0.85);
          for (var r4 = 0; r4 < 3; r4++) {
            G.box(x - s * 0.20, y - s * 0.18 + r4 * s * 0.15, s * 0.12, s * 0.08, s * 0.02, wc, null, 0);
            G.box(x - s * 0.03, y - s * 0.18 + r4 * s * 0.15, s * 0.12, s * 0.08, s * 0.02, ac, null, 0);
          }
          G.arrow(x + s * 0.26, y - s * 0.18, x + s * 0.26, y - s * 0.40 + pulse * s, lw * 1.1, s * 0.10, ac);
        } else if (vv === 5) {
          G.box(x, y + s * 0.10, s * 0.76, s * 0.56, s * 0.07, bc, rim, lw);
          G.poly([[x - s * 0.42, y - s * 0.18], [x, y - s * 0.42], [x + s * 0.42, y - s * 0.18]], '#4f46e5', rim, lw, true);
          for (var p5 = -1; p5 <= 1; p5++) {
            G.box(x + p5 * s * 0.21, y + s * 0.12, s * 0.10, s * 0.34, s * 0.03, wc, rim, lw * 0.65);
          }
          G.disc(x, y - s * 0.29, s * 0.07 + Math.abs(pulse) * s * 0.4, ac, rim, lw * 0.6);
          G.capsule(x, y + s * 0.40, s * 0.86, s * 0.08, ac, rim, lw * 0.75);
        } else {
          G.box(x - s * 0.14, y + s * 0.02, s * 0.44, s * 0.78, s * 0.07, bc, rim, lw);
          G.box(x + s * 0.20, y + s * 0.14, s * 0.32, s * 0.54, s * 0.07, '#4f46e5', rim, lw * 0.9);
          for (var r0 = 0; r0 < 4; r0++) {
            var activeW = r0 === Math.floor((tt * 2.2) % 4) ? ac : wc;
            G.box(x - s * 0.21, y - s * 0.22 + r0 * s * 0.14, s * 0.11, s * 0.08, s * 0.02, activeW, null, 0);
            G.box(x - s * 0.06, y - s * 0.22 + r0 * s * 0.14, s * 0.11, s * 0.08, s * 0.02, wc, null, 0);
          }
          G.box(x + s * 0.20, y + s * 0.06, s * 0.16, s * 0.22, s * 0.03, ac, rim, lw * 0.6);
          G.capsule(x, y + s * 0.42, s * 0.84, s * 0.07, rim, null, 0);
        }
      },
      document: function(x, y, s, pageCol, headerCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var pc = pageCol || '#f8fafc', hc = headerCol || '#4f46e5', ac = accCol || '#00e5ff';
        var scan = Math.sin(tt * 2.8) * s * 0.03;
        if (vv === 1) {
          G.box(x - s * 0.06, y - s * 0.04, s * 0.58, s * 0.74, s * 0.08, '#1e293b', rim, lw * 0.85);
          G.box(x + s * 0.06, y + s * 0.04, s * 0.58, s * 0.74, s * 0.08, pc, rim, lw);
          G.box(x + s * 0.06, y - s * 0.21, s * 0.42, s * 0.13, s * 0.04, hc, null, 0);
          G.pill(x - s * 0.12, y - s * 0.02, x + s * 0.24, y - s * 0.02, lw * 1.1, '#64748b');
          G.pill(x - s * 0.12, y + s * 0.11, x + s * 0.16, y + s * 0.11, lw * 1.1, ac);
          G.disc(x + s * 0.22, y + s * 0.26 + scan * 0.5, s * 0.12, '#ffd700', rim, lw * 0.7);
        } else if (vv === 2) {
          G.box(x, y, s * 0.66, s * 0.82, s * 0.09, pc, rim, lw);
          G.box(x, y - s * 0.26, s * 0.48, s * 0.14, s * 0.04, hc, null, 0);
          G.bar(x - s * 0.15, y + s * 0.16, s * 0.09, s * (0.16 + 0.05 * Math.sin(tt * 2.5)), s * 0.02, ac, null, 0);
          G.bar(x, y + s * 0.16, s * 0.09, s * (0.24 + 0.05 * Math.cos(tt * 2.5)), s * 0.02, hc, null, 0);
          G.bar(x + s * 0.15, y + s * 0.16, s * 0.09, s * (0.20 + 0.05 * Math.sin(tt * 3.1)), s * 0.02, '#ffd700', null, 0);
        } else if (vv === 3) {
          G.box(x - s * 0.05, y, s * 0.62, s * 0.80, s * 0.09, pc, rim, lw);
          G.pill(x - s * 0.22, y - s * 0.20, x + s * 0.12, y - s * 0.20, lw * 1.2, hc);
          G.pill(x - s * 0.22, y - s * 0.04, x + s * 0.06, y - s * 0.04, lw * 1.2, '#64748b');
          G.pill(x - s * 0.22, y + s * 0.12, x + s * 0.10, y + s * 0.12, lw * 1.2, ac);
          G.disc(x + s * 0.22, y + s * 0.20, s * 0.17 + scan * 0.25, '#1e293b', rim, lw * 0.85);
          G.check(x + s * 0.22, y + s * 0.20, s * 0.16, lw * 1.15, '#ffd700');
        } else if (vv === 4) {
          G.box(x, y, s * 0.66, s * 0.82, s * 0.09, pc, rim, lw);
          G.pie(x - s * 0.11, y - s * 0.14, s * 0.16, tt * 0.8, Math.PI * 0.85, ac, '#1e293b', rim);
          G.pill(x + s * 0.10, y - s * 0.20, x + s * 0.24, y - s * 0.20, lw, hc);
          G.pill(x + s * 0.10, y - s * 0.08, x + s * 0.22, y - s * 0.08, lw, '#64748b');
          G.box(x, y + s * 0.20 + scan * 0.4, s * 0.48, s * 0.16, s * 0.05, hc, rim, lw * 0.65);
        } else if (vv === 5) {
          G.box(x, y, s * 0.66, s * 0.82, s * 0.09, pc, rim, lw);
          G.box(x, y - s * 0.24, s * 0.48, s * 0.14, s * 0.04, ac, null, 0);
          G.pill(x - s * 0.20, y - s * 0.02, x + s * 0.20, y - s * 0.02, lw * 1.2, '#1e293b');
          G.pill(x - s * 0.20, y + s * 0.12, x + s * 0.12, y + s * 0.12, lw * 1.2, '#64748b');
          G.capsule(x + scan * 1.4, y + s * 0.27, s * 0.34, s * 0.09, hc, null, 0);
        } else {
          G.box(x, y, s * 0.66, s * 0.82, s * 0.09, pc, rim, lw);
          G.poly([[x + s * 0.14, y - s * 0.41], [x + s * 0.33, y - s * 0.22], [x + s * 0.14, y - s * 0.22]], ac, rim, lw * 0.75, true);
          G.pill(x - s * 0.20, y - s * 0.14, x + s * 0.06, y - s * 0.14, lw * 1.3, hc);
          G.pill(x - s * 0.20, y + s * 0.02, x + s * 0.20, y + s * 0.02, lw * 1.2, '#475569');
          G.pill(x - s * 0.20, y + s * 0.16, x + s * 0.14, y + s * 0.16, lw * 1.2, ac);
          G.capsule(x, y + s * 0.28 + scan * 0.3, s * 0.40, s * 0.08, hc, null, 0);
        }
      },
      folder: function(x, y, s, backCol, frontCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = backCol || '#1e293b', fc = frontCol || '#3b82f6', ac = accCol || '#ffd700';
        var peek = s * 0.05 * Math.sin(tt * 2.6);
        if (vv === 1) {
          G.box(x - s * 0.22, y - s * 0.30, s * 0.34, s * 0.18, s * 0.06, bc, rim, lw * 0.9);
          G.box(x, y - s * 0.04, s * 0.82, s * 0.56, s * 0.09, bc, rim, lw);
          G.box(x, y - s * 0.14 + peek, s * 0.62, s * 0.30, s * 0.05, '#f8fafc', rim, lw * 0.75);
          G.box(x, y + s * 0.14, s * 0.82, s * 0.44, s * 0.09, fc, rim, lw);
          G.disc(x, y + s * 0.14, s * 0.14, ac, rim, lw * 0.75);
        } else if (vv === 2) {
          G.box(x, y + s * 0.02, s * 0.80, s * 0.62, s * 0.10, bc, rim, lw);
          G.box(x, y - s * 0.16 + peek, s * 0.56, s * 0.28, s * 0.05, '#00e5ff', rim, lw * 0.75);
          G.box(x, y + s * 0.16, s * 0.80, s * 0.42, s * 0.10, fc, rim, lw);
          G.star(x, y + s * 0.16, s * 0.12, s * 0.055, 5, -Math.PI / 2, ac, rim, lw * 0.6);
        } else if (vv === 3) {
          G.box(x - s * 0.20, y - s * 0.28, s * 0.36, s * 0.18, s * 0.05, bc, rim, lw * 0.85);
          G.box(x, y + s * 0.06, s * 0.82, s * 0.62, s * 0.10, fc, rim, lw);
          G.box(x, y + s * 0.08 + peek * 0.4, s * 0.24, s * 0.22, s * 0.05, ac, rim, lw * 0.75);
          G.ring(x, y - s * 0.04 + peek * 0.4, s * 0.08, lw, Math.PI, Math.PI * 2, rim);
        } else if (vv === 4) {
          G.box(x - s * 0.04, y - s * 0.12 + peek * 0.5, s * 0.72, s * 0.46, s * 0.08, bc, rim, lw * 0.85);
          G.box(x + s * 0.04, y + s * 0.06, s * 0.74, s * 0.48, s * 0.09, fc, rim, lw);
          G.capsule(x + s * 0.04, y + s * 0.06, s * 0.34, s * 0.10, ac, rim, lw * 0.7);
        } else if (vv === 5) {
          G.box(x, y - s * 0.22 + peek * 0.4, s * 0.70, s * 0.24, s * 0.06, ac, rim, lw * 0.8);
          G.box(x, y + s * 0.04, s * 0.80, s * 0.56, s * 0.09, fc, rim, lw);
          G.pill(x - s * 0.24, y + s * 0.04, x + s * 0.24, y + s * 0.04, lw * 1.1, rim);
          G.disc(x + s * 0.24, y + s * 0.22, s * 0.11, '#00e5ff', rim, lw * 0.7);
        } else {
          G.box(x - s * 0.22, y - s * 0.29, s * 0.34, s * 0.16, s * 0.05, bc, rim, lw * 0.9);
          G.box(x, y - s * 0.02, s * 0.82, s * 0.58, s * 0.09, bc, rim, lw);
          G.box(x, y - s * 0.15 + peek, s * 0.62, s * 0.28, s * 0.05, '#f8fafc', rim, lw * 0.75);
          G.box(x, y + s * 0.14, s * 0.82, s * 0.44, s * 0.09, fc, rim, lw);
          G.capsule(x, y + s * 0.14, s * 0.32, s * 0.10, ac, rim, lw * 0.65);
        }
      },
      target: function(x, y, s, outerCol, midCol, dartCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var oc = outerCol || '#f43f5e', mc = midCol || '#f8fafc', dc = dartCol || '#ffd700';
        var pulse = 1 + 0.08 * Math.sin(tt * 3.0);
        var slide = Math.sin(tt * 2.8) * s * 0.045;
        if (vv === 1) {
          G.disc(x, y, s * 0.40, oc, rim, lw);
          G.disc(x, y, s * 0.27, mc, rim, lw * 0.75);
          G.disc(x, y, s * 0.14 * pulse, '#4f46e5', rim, lw * 0.75);
          G.ring(x, y, s * 0.46, lw, tt * 1.1, tt * 1.1 + Math.PI * 1.25, '#00e5ff');
        } else if (vv === 2) {
          G.disc(x, y, s * 0.42, '#1e293b', rim, lw);
          G.ring(x, y, s * 0.28 * pulse, lw * 1.1, 0, Math.PI * 2, oc);
          G.pill(x - s * 0.44, y, x - s * 0.22, y, lw * 1.2, dc);
          G.pill(x + s * 0.22, y, x + s * 0.44, y, lw * 1.2, dc);
          G.pill(x, y - s * 0.44, x, y - s * 0.22, lw * 1.2, dc);
          G.pill(x, y + s * 0.22, x, y + s * 0.44, lw * 1.2, dc);
          G.disc(x, y, s * 0.11, dc, rim, lw * 0.7);
        } else if (vv === 3) {
          G.box(x, y, s * 0.84, s * 0.80, s * 0.16, '#1e293b', rim, lw);
          G.disc(x, y, s * 0.29, oc, rim, lw * 0.85);
          G.disc(x, y, s * 0.17, mc, null, 0);
          G.disc(x, y, s * 0.09 * pulse, dc, rim, lw * 0.65);
          G.arrow(x + s * 0.26 - slide, y - s * 0.26 + slide, x + s * 0.04, y - s * 0.04, lw * 1.1, s * 0.10, '#00e5ff');
        } else if (vv === 4) {
          G.disc(x, y, s * 0.41, oc, rim, lw);
          G.disc(x, y, s * 0.28, mc, rim, lw * 0.75);
          G.disc(x, y, s * 0.16, oc, null, 0);
          G.star(x, y, s * 0.12 * pulse, s * 0.055 * pulse, 5, -Math.PI / 2, dc, rim, lw * 0.6);
        } else if (vv === 5) {
          G.ngon(x, y, s * 0.43, 6, -Math.PI / 2, '#1e293b', rim, lw);
          G.disc(x, y, s * 0.29, oc, rim, lw * 0.8);
          G.disc(x, y, s * 0.14 * pulse, dc, rim, lw * 0.7);
          G.arrow(x - s * 0.34 + slide, y + s * 0.34 - slide, x - s * 0.06, y + s * 0.06, lw * 1.1, s * 0.11, '#00e5ff');
        } else {
          G.disc(x - s * 0.04, y + s * 0.04, s * 0.39, oc, rim, lw);
          G.disc(x - s * 0.04, y + s * 0.04, s * 0.26, mc, rim, lw * 0.75);
          G.disc(x - s * 0.04, y + s * 0.04, s * 0.13, oc, rim, lw * 0.7);
          G.arrow(x + s * 0.34 - slide, y - s * 0.34 + slide, x, y, lw * 1.2, s * 0.11, dc);
        }
      },
      envelope: function(x, y, s, bodyCol, flapCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#3b82f6', fc = flapCol || '#00e5ff', ac = accCol || '#ffd700';
        var lift = s * 0.055 * Math.sin(tt * 2.7);
        if (vv === 1) {
          G.box(x, y - s * 0.16 + lift, s * 0.62, s * 0.44, s * 0.06, '#f8fafc', rim, lw * 0.8);
          G.pill(x - s * 0.18, y - s * 0.20 + lift, x + s * 0.18, y - s * 0.20 + lift, lw, fc);
          G.box(x, y + s * 0.10, s * 0.84, s * 0.50, s * 0.09, bc, rim, lw);
          G.poly([[x - s * 0.40, y - s * 0.12], [x, y + s * 0.14], [x + s * 0.40, y - s * 0.12]], fc, rim, lw * 0.85, true);
        } else if (vv === 2) {
          G.box(x, y + s * 0.04, s * 0.84, s * 0.56, s * 0.10, bc, rim, lw);
          G.poly([[x - s * 0.40, y - s * 0.21], [x, y + s * 0.09], [x + s * 0.40, y - s * 0.21]], fc, rim, lw * 0.85, true);
          G.disc(x + s * 0.30, y - s * 0.22 + lift * 0.5, s * 0.14, ac, rim, lw * 0.75);
          G.star(x + s * 0.30, y - s * 0.22 + lift * 0.5, s * 0.07, s * 0.03, 5, -Math.PI / 2, rim, null, 0);
        } else if (vv === 3) {
          G.box(x, y, s * 0.86, s * 0.60, s * 0.10, bc, rim, lw);
          G.poly([[x - s * 0.41, y - s * 0.27], [x, y + s * 0.06], [x + s * 0.41, y - s * 0.27]], fc, rim, lw * 0.85, true);
          G.disc(x, y + s * 0.07, s * 0.13 + Math.abs(lift) * 0.3, ac, rim, lw * 0.75);
          G.check(x, y + s * 0.07, s * 0.14, lw * 1.1, '#1e293b');
        } else if (vv === 4) {
          G.box(x, y, s * 0.82, s * 0.76, s * 0.16, '#1e293b', rim, lw);
          G.poly([[x - s * 0.28 + lift * 0.6, y + s * 0.02], [x + s * 0.28 + lift * 0.6, y - s * 0.22], [x + s * 0.14 + lift * 0.6, y + s * 0.24], [x - s * 0.02 + lift * 0.6, y + s * 0.08]], fc, rim, lw * 0.85, true);
        } else if (vv === 5) {
          G.box(x, y + s * 0.06, s * 0.82, s * 0.52, s * 0.09, bc, rim, lw);
          G.poly([[x - s * 0.40, y - s * 0.19], [x, y - s * 0.41 + lift * 0.5], [x + s * 0.40, y - s * 0.19]], fc, rim, lw * 0.85, true);
          G.capsule(x, y + s * 0.08, s * 0.38, s * 0.12, ac, rim, lw * 0.65);
        } else {
          G.box(x, y, s * 0.86, s * 0.58, s * 0.10, bc, rim, lw);
          G.poly([[x - s * 0.42, y - s * 0.26], [x, y + s * 0.06 + lift * 0.4], [x + s * 0.42, y - s * 0.26]], fc, rim, lw * 0.9, true);
          G.disc(x, y + s * 0.08, s * 0.09, ac, rim, lw * 0.7);
        }
      },
      chat: function(x, y, s, b1Col, b2Col, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var c1 = b1Col || '#4f46e5', c2 = b2Col || '#00e5ff', ac = accCol || '#ffd700';
        var dy = s * 0.03 * Math.sin(tt * 3.0);
        if (vv === 1) {
          G.box(x + s * 0.10, y - s * 0.12 - dy, s * 0.62, s * 0.44, s * 0.12, c2, rim, lw);
          G.box(x - s * 0.10, y + s * 0.12 + dy, s * 0.64, s * 0.44, s * 0.12, c1, rim, lw);
          for (var d1 = -1; d1 <= 1; d1++) {
            G.disc(x - s * 0.10 + d1 * s * 0.14, y + s * 0.12 + dy + Math.sin(tt * 4 + d1) * s * 0.03, s * 0.048, rim, null, 0);
          }
        } else if (vv === 2) {
          G.box(x, y - s * 0.04, s * 0.80, s * 0.56, s * 0.16, c1, rim, lw);
          G.poly([[x - s * 0.24, y + s * 0.22], [x - s * 0.06, y + s * 0.22], [x - s * 0.26, y + s * 0.40]], c1, rim, lw * 0.85, true);
          for (var d2 = -1; d2 <= 1; d2++) {
            G.disc(x + d2 * s * 0.18, y - s * 0.04 + Math.sin(tt * 4.2 + d2 * 1.1) * s * 0.045, s * 0.06, d2 === 0 ? ac : c2, rim, lw * 0.55);
          }
        } else if (vv === 3) {
          G.box(x, y - s * 0.05, s * 0.78, s * 0.56, s * 0.14, c1, rim, lw);
          G.poly([[x + s * 0.10, y + s * 0.21], [x + s * 0.28, y + s * 0.21], [x + s * 0.30, y + s * 0.38]], c1, rim, lw * 0.85, true);
          G.star(x, y - s * 0.05, s * 0.16 + Math.abs(dy), s * 0.075, 5, -Math.PI / 2, ac, rim, lw * 0.65);
        } else if (vv === 4) {
          G.disc(x, y, s * 0.42, '#1e293b', rim, lw);
          G.box(x, y - s * 0.02 + dy, s * 0.52, s * 0.36, s * 0.11, c2, rim, lw * 0.85);
          G.check(x, y - s * 0.02 + dy, s * 0.18, lw * 1.15, '#1e293b');
        } else if (vv === 5) {
          G.box(x - s * 0.08, y - s * 0.06 + dy, s * 0.64, s * 0.48, s * 0.13, c1, rim, lw);
          G.pill(x - s * 0.24, y - s * 0.12 + dy, x + s * 0.08, y - s * 0.12 + dy, lw * 1.1, rim);
          G.pill(x - s * 0.24, y + s * 0.02 + dy, x + s * 0.02, y + s * 0.02 + dy, lw * 1.1, c2);
          G.disc(x + s * 0.24, y + s * 0.20 - dy, s * 0.14, ac, rim, lw * 0.75);
        } else {
          G.box(x, y - s * 0.06 + dy, s * 0.78, s * 0.54, s * 0.16, c1, rim, lw);
          G.poly([[x - s * 0.22, y + s * 0.19 + dy], [x - s * 0.04, y + s * 0.19 + dy], [x - s * 0.24, y + s * 0.38 + dy]], c1, rim, lw * 0.85, true);
          G.pill(x - s * 0.20, y - s * 0.12 + dy, x + s * 0.20, y - s * 0.12 + dy, lw * 1.2, c2);
          G.pill(x - s * 0.20, y + s * 0.02 + dy, x + s * 0.12, y + s * 0.02 + dy, lw * 1.2, ac);
        }
      },
      network: function(x, y, s, coreCol, nodeCol, linkCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = coreCol || '#4f46e5', nc = nodeCol || '#00e5ff', lc = linkCol || '#ffd700';
        var pulse = 1 + 0.09 * Math.sin(tt * 3.0);
        var act = Math.floor((tt * 2.5) % 4);
        if (vv === 1) {
          G.ring(x, y, s * 0.36, lw * 1.15, tt * 0.4, tt * 0.4 + Math.PI * 1.65, lc);
          G.ring(x, y, s * 0.23, lw, -tt * 0.6, -tt * 0.6 + Math.PI * 1.35, nc);
          for (var i1 = 0; i1 < 4; i1++) {
            var a1 = tt * 0.55 + i1 * Math.PI * 0.5;
            G.disc(x + Math.cos(a1) * s * 0.36, y + Math.sin(a1) * s * 0.36, s * 0.085, i1 === act ? lc : nc, rim, lw * 0.7);
          }
          G.disc(x, y, s * 0.14 * pulse, cc, rim, lw);
        } else if (vv === 2) {
          G.box(x, y + s * 0.14, s * 0.68, s * 0.28, s * 0.08, '#1e293b', rim, lw);
          G.pill(x - s * 0.22, y - s * 0.20, x, y + s * 0.06, lw * 1.1, lc);
          G.pill(x + s * 0.22, y - s * 0.20, x, y + s * 0.06, lw * 1.1, lc);
          G.pill(x, y - s * 0.28, x, y + s * 0.06, lw * 1.1, nc);
          G.disc(x - s * 0.22, y - s * 0.20, s * 0.095, act === 0 ? lc : nc, rim, lw * 0.75);
          G.disc(x + s * 0.22, y - s * 0.20, s * 0.095, act === 1 ? lc : nc, rim, lw * 0.75);
          G.disc(x, y - s * 0.28, s * 0.11 * pulse, cc, rim, lw * 0.85);
          G.capsule(x, y + s * 0.14, s * 0.42, s * 0.10, cc, rim, lw * 0.65);
        } else if (vv === 3) {
          G.box(x, y, s * 0.84, s * 0.78, s * 0.14, '#0f172a', rim, lw);
          G.pill(x - s * 0.24, y, x + s * 0.24, y, lw * 1.2, lc);
          G.pill(x, y - s * 0.22, x, y + s * 0.22, lw * 1.2, lc);
          G.disc(x, y, s * 0.14 * pulse, cc, rim, lw * 0.85);
          G.disc(x - s * 0.24, y, s * 0.085, act === 0 ? lc : nc, rim, lw * 0.65);
          G.disc(x + s * 0.24, y, s * 0.085, act === 1 ? lc : nc, rim, lw * 0.65);
          G.disc(x, y - s * 0.22, s * 0.085, act === 2 ? lc : nc, rim, lw * 0.65);
          G.disc(x, y + s * 0.22, s * 0.085, act === 3 ? lc : nc, rim, lw * 0.65);
        } else if (vv === 4) {
          G.ngon(x, y, s * 0.43, 6, -Math.PI / 2, '#1e293b', rim, lw);
          for (var i4 = 0; i4 < 6; i4++) {
            var a4 = -Math.PI / 2 + i4 * Math.PI / 3;
            G.pill(x, y, x + Math.cos(a4) * s * 0.27, y + Math.sin(a4) * s * 0.27, lw * 0.95, lc);
            G.disc(x + Math.cos(a4) * s * 0.28, y + Math.sin(a4) * s * 0.28, s * 0.07, i4 === Math.floor((tt * 3) % 6) ? lc : nc, rim, lw * 0.55);
          }
          G.disc(x, y, s * 0.14 * pulse, cc, rim, lw * 0.8);
        } else if (vv === 5) {
          var lX = [-s * 0.28, 0, s * 0.28];
          var lY = [[-s * 0.18, s * 0.18], [-s * 0.24, 0, s * 0.24], [-s * 0.14, s * 0.14]];
          for (var li = 0; li < lY[0].length; li++) {
            for (var lj = 0; lj < lY[1].length; lj++) {
              G.pill(x + lX[0], y + lY[0][li], x + lX[1], y + lY[1][lj], lw * 0.75, lc);
            }
          }
          for (var lj2 = 0; lj2 < lY[1].length; lj2++) {
            for (var lk = 0; lk < lY[2].length; lk++) {
              G.pill(x + lX[1], y + lY[1][lj2], x + lX[2], y + lY[2][lk], lw * 0.75, nc);
            }
          }
          for (var li2 = 0; li2 < lY[0].length; li2++) G.disc(x + lX[0], y + lY[0][li2], s * 0.085, cc, rim, lw * 0.65);
          for (var lj3 = 0; lj3 < lY[1].length; lj3++) G.disc(x + lX[1], y + lY[1][lj3], s * 0.08 * (lj3 === act % 3 ? pulse : 1), lj3 === act % 3 ? lc : nc, rim, lw * 0.65);
          for (var lk2 = 0; lk2 < lY[2].length; lk2++) G.disc(x + lX[2], y + lY[2][lk2], s * 0.085, cc, rim, lw * 0.65);
        } else {
          for (var i0 = 0; i0 < 5; i0++) {
            var a0 = -Math.PI / 2 + i0 * (Math.PI * 2 / 5) + tt * 0.32;
            var nx = x + Math.cos(a0) * s * 0.34, ny = y + Math.sin(a0) * s * 0.34;
            G.pill(x, y, nx, ny, lw, lc);
            G.disc(nx, ny, s * 0.095, i0 === act ? lc : nc, rim, lw * 0.75);
          }
          G.disc(x, y, s * 0.16 * pulse, cc, rim, lw);
        }
      },
      server: function(x, y, s, rackCol, ledCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var rc = rackCol || '#1e293b', lc = ledCol || '#00e5ff', ac = accCol || '#ffd700';
        var act = Math.floor((tt * 2.5) % 3);
        if (vv === 1) {
          for (var k1 = 0; k1 < 3; k1++) {
            G.oval(x, y - s * 0.18 + k1 * s * 0.18, s * 0.36, s * 0.13, 0, k1 === act ? '#4f46e5' : rc, rim, lw);
            G.disc(x + s * 0.20, y - s * 0.18 + k1 * s * 0.18, s * 0.045, k1 === act ? ac : lc, null, 0);
          }
        } else if (vv === 2) {
          G.box(x - s * 0.12, y, s * 0.54, s * 0.78, s * 0.09, rc, rim, lw);
          for (var k2 = 0; k2 < 3; k2++) {
            G.box(x - s * 0.12, y - s * 0.21 + k2 * s * 0.21, s * 0.42, s * 0.13, s * 0.04, '#334155', rim, lw * 0.65);
            G.disc(x - s * 0.25, y - s * 0.21 + k2 * s * 0.21, s * 0.04, k2 === act ? ac : lc, null, 0);
          }
          G.shield(x + s * 0.24, y + s * 0.14, s * 0.36, '#4f46e5', rim, lc, ac, tt, 0);
        } else if (vv === 3) {
          G.box(x, y, s * 0.80, s * 0.78, s * 0.14, '#0f172a', rim, lw);
          for (var k3 = 0; k3 < 3; k3++) {
            G.capsule(x, y - s * 0.18 + k3 * s * 0.18, s * 0.56, s * 0.12, k3 === act ? '#4f46e5' : rc, rim, lw * 0.7);
            G.disc(x - s * 0.18, y - s * 0.18 + k3 * s * 0.18, s * 0.038, k3 === act ? ac : lc, null, 0);
          }
        } else if (vv === 4) {
          G.box(x - s * 0.20, y + s * 0.02, s * 0.32, s * 0.72, s * 0.07, rc, rim, lw);
          G.box(x + s * 0.20, y + s * 0.02, s * 0.32, s * 0.72, s * 0.07, '#4f46e5', rim, lw);
          G.pill(x - s * 0.06, y - s * 0.14, x + s * 0.06, y - s * 0.14, lw * 1.1, lc);
          G.disc(x - s * 0.20, y - s * 0.16 + act * s * 0.16, s * 0.055, ac, rim, lw * 0.5);
          G.disc(x + s * 0.20, y + s * 0.16 - act * s * 0.16, s * 0.055, lc, rim, lw * 0.5);
        } else if (vv === 5) {
          for (var k5 = 0; k5 < 3; k5++) {
            G.box(x, y - s * 0.24 + k5 * s * 0.24, s * 0.76, s * 0.19, s * 0.06, rc, rim, lw);
            G.capsule(x + s * 0.12, y - s * 0.24 + k5 * s * 0.24, s * 0.28, s * 0.06, k5 === act ? ac : lc, null, 0);
            G.disc(x - s * 0.24, y - s * 0.24 + k5 * s * 0.24, s * 0.045, k5 === act ? ac : lc, null, 0);
          }
        } else {
          G.box(x, y, s * 0.72, s * 0.78, s * 0.10, rc, rim, lw);
          for (var k0 = 0; k0 < 3; k0++) {
            G.box(x, y - s * 0.22 + k0 * s * 0.22, s * 0.56, s * 0.15, s * 0.04, '#334155', rim, lw * 0.65);
            G.disc(x - s * 0.18, y - s * 0.22 + k0 * s * 0.22, s * 0.045, k0 === act ? ac : lc, null, 0);
            G.pill(x - s * 0.04, y - s * 0.22 + k0 * s * 0.22, x + s * 0.18, y - s * 0.22 + k0 * s * 0.22, lw * 0.9, k0 === act ? ac : rim);
          }
        }
      },
      calendar: function(x, y, s, cardCol, topCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#f8fafc', tc = topCol || '#f43f5e', ac = accCol || '#00e5ff';
        var day = Math.floor((tt * 2.2) % 4);
        if (vv === 1) {
          G.box(x - s * 0.04, y + s * 0.04, s * 0.72, s * 0.66, s * 0.10, cc, rim, lw);
          G.box(x - s * 0.04, y - s * 0.20, s * 0.72, s * 0.18, s * 0.08, tc, rim, lw * 0.85);
          G.disc(x + s * 0.24, y + s * 0.22, s * 0.18, '#1e293b', rim, lw * 0.9);
          G.pill(x + s * 0.24, y + s * 0.22, x + s * 0.24, y + s * 0.11, lw, ac);
          G.pill(x + s * 0.24, y + s * 0.22, x + s * 0.24 + Math.cos(tt * 2.5) * s * 0.09, y + s * 0.22 + Math.sin(tt * 2.5) * s * 0.09, lw, '#ffd700');
        } else if (vv === 2) {
          G.box(x, y + s * 0.05, s * 0.74, s * 0.68, s * 0.11, cc, rim, lw);
          G.box(x, y - s * 0.20, s * 0.74, s * 0.18, s * 0.08, tc, rim, lw * 0.85);
          G.check(x, y + s * 0.14, s * 0.28 * (1 + 0.07 * Math.sin(tt * 3)), lw * 1.3, '#4f46e5');
        } else if (vv === 3) {
          G.box(x, y + s * 0.04, s * 0.76, s * 0.68, s * 0.10, '#1e293b', rim, lw);
          G.box(x, y - s * 0.21, s * 0.76, s * 0.18, s * 0.08, tc, rim, lw * 0.85);
          for (var i3 = 0; i3 < 3; i3++) {
            G.capsule(x, y - s * 0.02 + i3 * s * 0.14, s * 0.52, s * 0.08, i3 === day % 3 ? '#ffd700' : ac, null, 0);
          }
        } else if (vv === 4) {
          G.box(x, y + s * 0.04, s * 0.76, s * 0.68, s * 0.10, cc, rim, lw);
          G.box(x, y - s * 0.20, s * 0.76, s * 0.19, s * 0.08, '#4f46e5', rim, lw * 0.85);
          G.star(x, y + s * 0.14, s * 0.16 * (1 + 0.08 * Math.sin(tt * 3)), s * 0.07, 5, -Math.PI / 2, '#ffd700', '#1e293b', lw * 0.7);
        } else if (vv === 5) {
          G.box(x, y + s * 0.05, s * 0.74, s * 0.66, s * 0.10, cc, rim, lw);
          G.box(x, y - s * 0.20, s * 0.74, s * 0.17, s * 0.08, tc, rim, lw * 0.85);
          G.bar(x - s * 0.16, y + s * 0.26, s * 0.10, s * (0.14 + 0.04 * Math.sin(tt * 2.5)), s * 0.02, '#4f46e5', null, 0);
          G.bar(x, y + s * 0.26, s * 0.10, s * (0.22 + 0.04 * Math.cos(tt * 2.5)), s * 0.02, ac, null, 0);
          G.bar(x + s * 0.16, y + s * 0.26, s * 0.10, s * (0.26 + 0.04 * Math.sin(tt * 3.2)), s * 0.02, '#ffd700', null, 0);
        } else {
          G.box(x, y + s * 0.05, s * 0.76, s * 0.68, s * 0.11, cc, rim, lw);
          G.box(x, y - s * 0.20, s * 0.76, s * 0.19, s * 0.08, tc, rim, lw * 0.85);
          G.capsule(x - s * 0.18, y - s * 0.34, s * 0.08, s * 0.14, rim, null, 0);
          G.capsule(x + s * 0.18, y - s * 0.34, s * 0.08, s * 0.14, rim, null, 0);
          for (var g0 = 0; g0 < 4; g0++) {
            var gx = x + (g0 % 2 === 0 ? -s * 0.16 : s * 0.16), gy = y + (g0 < 2 ? s * 0.04 : s * 0.22);
            G.box(gx, gy, s * 0.20, s * 0.13, s * 0.04, g0 === day ? '#ffd700' : ac, '#1e293b', lw * 0.6);
          }
        }
      },
      candlestick: function(x, y, s, frameCol, bullCol, bearCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var fc = frameCol || '#1e293b', up = bullCol || '#00e5ff', dn = bearCol || '#f43f5e';
        var o1 = Math.sin(tt * 2.5) * s * 0.05, o2 = Math.cos(tt * 2.5) * s * 0.05;
        if (vv === 1) {
          G.pill(x - s * 0.26, y - s * 0.34, x - s * 0.26, y + s * 0.30, lw, rim);
          G.box(x - s * 0.26, y + s * 0.04 + o1, s * 0.14, s * 0.28, s * 0.04, up, rim, lw * 0.85);
          G.pill(x, y - s * 0.38, x, y + s * 0.26, lw, rim);
          G.box(x, y - s * 0.06 + o2, s * 0.14, s * 0.26, s * 0.04, dn, rim, lw * 0.85);
          G.pill(x + s * 0.26, y - s * 0.42, x + s * 0.26, y + s * 0.20, lw, rim);
          G.box(x + s * 0.26, y - s * 0.14 - o1, s * 0.14, s * 0.30, s * 0.04, '#ffd700', rim, lw * 0.85);
          G.arrow(x - s * 0.34, y + s * 0.34, x + s * 0.36, y - s * 0.34, lw * 1.1, s * 0.10, up);
        } else if (vv === 2) {
          G.box(x, y, s * 0.86, s * 0.74, s * 0.12, fc, rim, lw);
          G.pill(x - s * 0.22, y - s * 0.22, x - s * 0.22, y + s * 0.24, lw, up);
          G.box(x - s * 0.22, y + s * 0.04 + o1, s * 0.12, s * 0.22, s * 0.03, up, rim, lw * 0.65);
          G.pill(x, y - s * 0.26, x, y + s * 0.22, lw, dn);
          G.box(x, y - s * 0.04 + o2, s * 0.12, s * 0.20, s * 0.03, dn, rim, lw * 0.65);
          G.pill(x + s * 0.22, y - s * 0.28, x + s * 0.22, y + s * 0.20, lw, '#ffd700');
          G.box(x + s * 0.22, y - s * 0.10 - o1, s * 0.12, s * 0.24, s * 0.03, '#ffd700', rim, lw * 0.65);
        } else if (vv === 3) {
          G.disc(x, y, s * 0.43, fc, rim, lw);
          G.box(x - s * 0.18, y + s * 0.06 + o1, s * 0.11, s * 0.22, s * 0.03, up, rim, lw * 0.6);
          G.box(x, y - s * 0.02 + o2, s * 0.11, s * 0.24, s * 0.03, dn, rim, lw * 0.6);
          G.box(x + s * 0.18, y - s * 0.08 - o1, s * 0.11, s * 0.26, s * 0.03, '#ffd700', rim, lw * 0.6);
        } else if (vv === 4) {
          G.box(x, y, s * 0.84, s * 0.72, s * 0.11, fc, rim, lw);
          G.poly([[x - s * 0.30, y + s * 0.18], [x - s * 0.08, y - s * 0.02 + o1], [x + s * 0.10, y + s * 0.08 + o2], [x + s * 0.30, y - s * 0.18]], null, up, lw * 1.3, false);
          G.disc(x + s * 0.30, y - s * 0.18, s * 0.065, '#ffd700', rim, lw * 0.6);
        } else if (vv === 5) {
          G.box(x, y, s * 0.84, s * 0.72, s * 0.12, fc, rim, lw);
          for (var c5 = -1; c5 <= 1; c5++) {
            G.bar(x + c5 * s * 0.20, y + s * 0.22, s * 0.12, s * (0.24 + 0.08 * Math.sin(tt * 2.5 + c5)), s * 0.03, c5 === 0 ? dn : up, rim, lw * 0.6);
          }
          G.disc(x + s * 0.26, y - s * 0.22, s * 0.11, '#ffd700', rim, lw * 0.65);
        } else {
          G.box(x, y, s * 0.86, s * 0.74, s * 0.12, fc, rim, lw);
          var cxs = [-s * 0.24, -s * 0.08, s * 0.08, s * 0.24];
          for (var j0 = 0; j0 < 4; j0++) {
            var dy0 = (j0 % 2 === 0 ? o1 : o2);
            G.pill(x + cxs[j0], y - s * 0.24, x + cxs[j0], y + s * 0.24, lw * 0.8, rim);
            G.box(x + cxs[j0], y - j0 * s * 0.03 + dy0, s * 0.10, s * 0.20, s * 0.03, j0 === 1 ? dn : up, rim, lw * 0.6);
          }
        }
      },
      desk: function(x, y, s, deskCol, screenCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var dc = deskCol || '#1e293b', sc = screenCol || '#00e5ff', ac = accCol || '#ffd700';
        var pulse = s * 0.035 * Math.sin(tt * 2.6);
        if (vv === 1) {
          G.box(x, y - s * 0.10, s * 0.60, s * 0.42, s * 0.07, dc, rim, lw);
          G.box(x, y - s * 0.10, s * 0.48, s * 0.30, s * 0.04, sc, null, 0);
          G.pill(x - s * 0.14, y - s * 0.10, x + s * 0.14, y - s * 0.10 + pulse, lw * 1.1, ac);
          G.capsule(x, y + s * 0.22, s * 0.82, s * 0.09, '#4f46e5', rim, lw * 0.85);
          G.box(x - s * 0.26, y + s * 0.33, s * 0.08, s * 0.16, s * 0.03, dc, rim, lw * 0.7);
          G.box(x + s * 0.26, y + s * 0.33, s * 0.08, s * 0.16, s * 0.03, dc, rim, lw * 0.7);
        } else if (vv === 2) {
          G.box(x - s * 0.06, y - s * 0.10, s * 0.56, s * 0.40, s * 0.07, dc, rim, lw);
          G.bar(x - s * 0.16, y + s * 0.04, s * 0.08, s * 0.16 + pulse, s * 0.02, sc, null, 0);
          G.bar(x - s * 0.04, y + s * 0.04, s * 0.08, s * 0.22 - pulse, s * 0.02, ac, null, 0);
          G.capsule(x, y + s * 0.20, s * 0.82, s * 0.09, '#4f46e5', rim, lw * 0.85);
          G.box(x + s * 0.28, y + s * 0.09, s * 0.14, s * 0.14, s * 0.04, ac, rim, lw * 0.7);
        } else if (vv === 3) {
          G.box(x, y, s * 0.84, s * 0.74, s * 0.14, dc, rim, lw);
          G.box(x, y - s * 0.10, s * 0.52, s * 0.32, s * 0.06, sc, rim, lw * 0.75);
          G.disc(x, y - s * 0.10, s * 0.07 + Math.abs(pulse) * 0.4, ac, rim, lw * 0.55);
          G.capsule(x, y + s * 0.18, s * 0.62, s * 0.09, '#4f46e5', rim, lw * 0.75);
        } else if (vv === 4) {
          G.box(x + s * 0.06, y - s * 0.10, s * 0.54, s * 0.40, s * 0.07, dc, rim, lw);
          G.box(x + s * 0.06, y - s * 0.10, s * 0.42, s * 0.28, s * 0.04, sc, null, 0);
          G.capsule(x, y + s * 0.20, s * 0.80, s * 0.09, '#4f46e5', rim, lw * 0.85);
          G.pill(x - s * 0.32, y + s * 0.14, x - s * 0.26, y - s * 0.24, lw * 1.1, rim);
          G.disc(x - s * 0.24, y - s * 0.24 + pulse * 0.5, s * 0.09, ac, rim, lw * 0.65);
        } else if (vv === 5) {
          G.person(x, y - s * 0.16 + pulse * 0.4, s * 0.34, '#4f46e5', ac, rim);
          G.box(x, y + s * 0.12, s * 0.52, s * 0.30, s * 0.06, dc, rim, lw);
          G.box(x, y + s * 0.12, s * 0.38, s * 0.18, s * 0.04, sc, null, 0);
          G.capsule(x, y + s * 0.32, s * 0.80, s * 0.09, sc, rim, lw * 0.8);
        } else {
          G.box(x, y - s * 0.12, s * 0.62, s * 0.42, s * 0.07, dc, rim, lw);
          G.box(x, y - s * 0.12, s * 0.48, s * 0.30, s * 0.04, sc, null, 0);
          G.check(x, y - s * 0.12 + pulse * 0.4, s * 0.18, lw * 1.1, ac);
          G.box(x, y + s * 0.14, s * 0.12, s * 0.10, s * 0.02, rim, null, 0);
          G.capsule(x, y + s * 0.22, s * 0.82, s * 0.09, '#4f46e5', rim, lw * 0.85);
          G.box(x - s * 0.24, y + s * 0.34, s * 0.09, s * 0.14, s * 0.03, dc, rim, lw * 0.7);
          G.box(x + s * 0.24, y + s * 0.34, s * 0.09, s * 0.14, s * 0.03, dc, rim, lw * 0.7);
        }
      },
      negotiation: function(x, y, s, p1Col, p2Col, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var c1 = p1Col || '#3b82f6', c2 = p2Col || '#00e5ff', ac = accCol || '#ffd700';
        var dy = s * 0.035 * Math.sin(tt * 2.8);
        if (vv === 1) {
          G.person(x - s * 0.26, y + s * 0.04, s * 0.36, c1, ac, rim);
          G.person(x + s * 0.26, y + s * 0.04, s * 0.36, c2, ac, rim);
          G.capsule(x, y + s * 0.34, s * 0.80, s * 0.10, '#1e293b', rim, lw * 0.85);
          G.box(x, y - s * 0.26 + dy, s * 0.28, s * 0.18, s * 0.07, ac, rim, lw * 0.75);
        } else if (vv === 2) {
          G.person(x - s * 0.24, y - s * 0.06, s * 0.34, c1, rim, rim);
          G.person(x + s * 0.24, y - s * 0.06, s * 0.34, c2, rim, rim);
          G.disc(x, y + s * 0.18, s * 0.18 + Math.abs(dy) * 0.4, '#1e293b', rim, lw * 0.85);
          G.check(x, y + s * 0.18, s * 0.18, lw * 1.15, ac);
        } else if (vv === 3) {
          G.box(x, y, s * 0.84, s * 0.76, s * 0.14, '#1e293b', rim, lw);
          G.person(x - s * 0.20, y + s * 0.04, s * 0.32, c1, rim, rim);
          G.person(x + s * 0.20, y + s * 0.04, s * 0.32, c2, rim, rim);
          G.star(x, y - s * 0.22 + dy, s * 0.10, s * 0.045, 5, -Math.PI / 2, ac, rim, lw * 0.6);
        } else if (vv === 4) {
          G.person(x - s * 0.26, y + s * 0.06, s * 0.36, c1, rim, rim);
          G.person(x + s * 0.26, y + s * 0.06, s * 0.36, c2, rim, rim);
          G.disc(x, y - s * 0.22 + dy, s * 0.13, ac, rim, lw * 0.8);
          G.rays(x, y - s * 0.22 + dy, s * 0.17, s * 0.24, 6, tt * 0.8, lw * 0.9, ac);
        } else if (vv === 5) {
          G.person(x - s * 0.25, y, s * 0.34, c1, rim, rim);
          G.person(x + s * 0.25, y, s * 0.34, c2, rim, rim);
          G.pill(x - s * 0.12, y - s * 0.18 + dy, x + s * 0.12, y - s * 0.18 + dy, lw * 1.2, ac);
          G.pill(x - s * 0.12, y + s * 0.22 - dy, x + s * 0.12, y + s * 0.22 - dy, lw * 1.2, c2);
        } else {
          G.person(x - s * 0.26, y + s * 0.05, s * 0.36, c1, rim, rim);
          G.person(x + s * 0.26, y + s * 0.05, s * 0.36, c2, rim, rim);
          G.box(x - s * 0.12, y - s * 0.24 + dy, s * 0.24, s * 0.16, s * 0.06, ac, rim, lw * 0.7);
          G.box(x + s * 0.12, y - s * 0.18 - dy, s * 0.24, s * 0.16, s * 0.06, c2, rim, lw * 0.7);
        }
      },
      medical: function(x, y, s, cardCol, crossCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#f8fafc', xc = crossCol || '#f43f5e', ac = accCol || '#00e5ff';
        var pulse = 1 + 0.08 * Math.sin(tt * 3.2);
        if (vv === 1) {
          G.poly([[x, y - s * 0.42], [x + s * 0.36, y - s * 0.26], [x + s * 0.31, y + s * 0.15], [x, y + s * 0.42], [x - s * 0.31, y + s * 0.15], [x - s * 0.36, y - s * 0.26]], cc, rim, lw, true);
          G.box(x, y, s * 0.16 * pulse, s * 0.40 * pulse, s * 0.04, xc, null, 0);
          G.box(x, y, s * 0.40 * pulse, s * 0.16 * pulse, s * 0.04, xc, null, 0);
        } else if (vv === 2) {
          G.box(x, y, s * 0.80, s * 0.72, s * 0.15, '#1e293b', rim, lw);
          G.poly([[x - s * 0.28, y + s * 0.04], [x - s * 0.12, y + s * 0.04], [x - s * 0.04, y - s * 0.20 * pulse], [x + s * 0.06, y + s * 0.18 * pulse], [x + s * 0.14, y + s * 0.04], [x + s * 0.28, y + s * 0.04]], null, xc, lw * 1.35, false);
          G.disc(x + s * 0.28, y + s * 0.04, s * 0.055, ac, rim, lw * 0.5);
        } else if (vv === 3) {
          G.box(x, y + s * 0.05, s * 0.80, s * 0.58, s * 0.10, cc, rim, lw);
          G.ring(x, y - s * 0.24, s * 0.13, lw * 1.3, Math.PI, Math.PI * 2, rim);
          G.box(x, y + s * 0.05, s * 0.14 * pulse, s * 0.32 * pulse, s * 0.03, xc, null, 0);
          G.box(x, y + s * 0.05, s * 0.32 * pulse, s * 0.14 * pulse, s * 0.03, xc, null, 0);
        } else if (vv === 4) {
          G.disc(x, y, s * 0.42, '#1e293b', rim, lw);
          G.box(x, y, s * 0.16 * pulse, s * 0.42 * pulse, s * 0.04, xc, null, 0);
          G.box(x, y, s * 0.42 * pulse, s * 0.16 * pulse, s * 0.04, xc, null, 0);
          G.ring(x, y, s * 0.34, lw * 0.9, tt * 1.1, tt * 1.1 + Math.PI * 1.2, ac);
        } else if (vv === 5) {
          G.capsule(x, y, s * 0.68, s * 0.32, cc, rim, lw);
          G.box(x - s * 0.14, y, s * 0.28, s * 0.28, s * 0.12, ac, null, 0);
          G.disc(x + s * 0.16, y, s * 0.09 * pulse, xc, rim, lw * 0.6);
        } else {
          G.box(x, y, s * 0.78, s * 0.78, s * 0.18, cc, rim, lw);
          G.box(x, y, s * 0.18 * pulse, s * 0.46 * pulse, s * 0.04, xc, null, 0);
          G.box(x, y, s * 0.46 * pulse, s * 0.18 * pulse, s * 0.04, xc, null, 0);
        }
      },
      delivery: function(x, y, s, truckCol, cargoCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var tc = truckCol || '#4f46e5', cc = cargoCol || '#ffd700', ac = accCol || '#00e5ff';
        var roll = Math.sin(tt * 3.0) * s * 0.035;
        if (vv === 1) {
          G.box(x, y, s * 0.68, s * 0.66, s * 0.09, cc, rim, lw);
          G.box(x, y, s * 0.18, s * 0.66, s * 0.02, '#b45309', rim, lw * 0.6);
          G.capsule(x, y - s * 0.12 + roll * 0.5, s * 0.44, s * 0.10, ac, rim, lw * 0.65);
        } else if (vv === 2) {
          G.box(x - s * 0.10 + roll, y - s * 0.04, s * 0.48, s * 0.44, s * 0.07, cc, rim, lw);
          G.box(x + s * 0.24 + roll, y + s * 0.04, s * 0.24, s * 0.28, s * 0.06, tc, rim, lw);
          G.disc(x - s * 0.18 + roll, y + s * 0.24, s * 0.10, '#1e293b', rim, lw * 0.85);
          G.disc(x + s * 0.22 + roll, y + s * 0.24, s * 0.10, '#1e293b', rim, lw * 0.85);
          G.pill(x - s * 0.42, y - s * 0.10, x - s * 0.36, y - s * 0.10, lw * 1.1, ac);
        } else if (vv === 3) {
          G.disc(x, y, s * 0.43, '#1e293b', rim, lw);
          G.box(x - s * 0.04, y, s * 0.42, s * 0.38, s * 0.06, cc, rim, lw * 0.85);
          G.arrow(x - s * 0.26, y - s * 0.24, x + s * 0.24, y - s * 0.24 + roll * 0.4, lw, s * 0.09, ac);
        } else if (vv === 4) {
          G.box(x - s * 0.08, y + s * 0.06, s * 0.56, s * 0.52, s * 0.08, cc, rim, lw);
          G.disc(x + s * 0.22, y - s * 0.20 + roll * 0.6, s * 0.15, tc, rim, lw * 0.85);
          G.check(x + s * 0.22, y - s * 0.20 + roll * 0.6, s * 0.14, lw, ac);
        } else if (vv === 5) {
          G.box(x - s * 0.08, y, s * 0.48, s * 0.46, s * 0.07, tc, rim, lw);
          G.box(x + s * 0.22, y + s * 0.08, s * 0.22, s * 0.30, s * 0.05, ac, rim, lw);
          G.disc(x - s * 0.16, y + s * 0.27, s * 0.095, cc, rim, lw * 0.8);
          G.disc(x + s * 0.20, y + s * 0.27, s * 0.095, cc, rim, lw * 0.8);
          G.pill(x - s * 0.42, y - s * 0.06 + roll * 0.4, x - s * 0.35, y - s * 0.06 + roll * 0.4, lw, cc);
        } else {
          G.box(x - s * 0.10 + roll * 0.6, y - s * 0.04, s * 0.48, s * 0.44, s * 0.07, tc, rim, lw);
          G.box(x + s * 0.24 + roll * 0.6, y + s * 0.03, s * 0.24, s * 0.30, s * 0.06, ac, rim, lw);
          G.box(x + s * 0.26 + roll * 0.6, y - s * 0.03, s * 0.12, s * 0.10, s * 0.03, '#1e293b', null, 0);
          G.disc(x - s * 0.18 + roll * 0.6, y + s * 0.24, s * 0.10, cc, rim, lw * 0.85);
          G.disc(x + s * 0.22 + roll * 0.6, y + s * 0.24, s * 0.10, cc, rim, lw * 0.85);
        }
      },
      puzzle: function(x, y, s, p1Col, p2Col, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var c1 = p1Col || '#4f46e5', c2 = p2Col || '#00e5ff', ac = accCol || '#ffd700';
        var gap = s * (0.015 + 0.025 * (0.5 + 0.5 * Math.sin(tt * 2.8)));
        if (vv === 1) {
          G.box(x - s * 0.18 - gap, y - s * 0.18 - gap, s * 0.36, s * 0.36, s * 0.06, c1, rim, lw * 0.9);
          G.box(x + s * 0.18 + gap, y - s * 0.18 - gap, s * 0.36, s * 0.36, s * 0.06, c2, rim, lw * 0.9);
          G.box(x - s * 0.18 - gap, y + s * 0.18 + gap, s * 0.36, s * 0.36, s * 0.06, c2, rim, lw * 0.9);
          G.box(x + s * 0.18 + gap, y + s * 0.18 + gap, s * 0.36, s * 0.36, s * 0.06, ac, rim, lw * 0.9);
        } else if (vv === 2) {
          G.box(x, y, s * 0.82, s * 0.78, s * 0.14, '#1e293b', rim, lw);
          G.box(x - s * 0.15 - gap, y, s * 0.30, s * 0.38, s * 0.06, c1, rim, lw * 0.85);
          G.box(x + s * 0.15 + gap, y, s * 0.30, s * 0.38, s * 0.06, c2, rim, lw * 0.85);
          G.disc(x, y, s * 0.10, ac, rim, lw * 0.7);
        } else if (vv === 3) {
          G.box(x - s * 0.16, y, s * 0.38, s * 0.58, s * 0.08, c1, rim, lw);
          G.disc(x + s * 0.04, y, s * 0.12, c1, rim, lw * 0.8);
          G.box(x + s * 0.20 + gap, y, s * 0.34, s * 0.58, s * 0.08, c2, rim, lw);
          G.disc(x + s * 0.04, y, s * 0.06, ac, null, 0);
        } else if (vv === 4) {
          G.box(x - s * 0.17 - gap, y + s * 0.14, s * 0.34, s * 0.34, s * 0.07, c1, rim, lw);
          G.box(x + s * 0.17 + gap, y + s * 0.14, s * 0.34, s * 0.34, s * 0.07, c2, rim, lw);
          G.box(x, y - s * 0.20 - gap, s * 0.38, s * 0.34, s * 0.07, ac, rim, lw);
        } else if (vv === 5) {
          G.ngon(x - s * 0.16 - gap, y, s * 0.24, 6, 0, c1, rim, lw);
          G.ngon(x + s * 0.16 + gap, y - s * 0.14, s * 0.22, 6, 0, c2, rim, lw);
          G.ngon(x + s * 0.16 + gap, y + s * 0.16, s * 0.22, 6, 0, ac, rim, lw);
        } else {
          G.box(x - s * 0.16 - gap, y, s * 0.36, s * 0.56, s * 0.08, c1, rim, lw);
          G.box(x + s * 0.16 + gap, y, s * 0.36, s * 0.56, s * 0.08, c2, rim, lw);
          G.disc(x, y, s * 0.13, ac, rim, lw * 0.85);
        }
      },
      bell: function(x, y, s, bellCol, clapperCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bellCol || '#ffd700', cc = clapperCol || '#f43f5e', ac = accCol || '#00e5ff';
        var sw = Math.sin(tt * 3.8) * s * 0.045;
        if (vv === 1) {
          G.box(x, y, s * 0.82, s * 0.80, s * 0.16, '#1e293b', rim, lw);
          G.poly([[x - s * 0.20, y + s * 0.16], [x - s * 0.14, y - s * 0.18], [x + s * 0.14, y - s * 0.18], [x + s * 0.20, y + s * 0.16]], bc, rim, lw * 0.9, true);
          G.disc(x - sw * 0.7, y + s * 0.24, s * 0.075, cc, rim, lw * 0.7);
        } else if (vv === 2) {
          G.disc(x, y, s * 0.43, '#4f46e5', rim, lw);
          G.poly([[x - s * 0.22, y + s * 0.14], [x - s * 0.15, y - s * 0.20], [x + s * 0.15, y - s * 0.20], [x + s * 0.22, y + s * 0.14]], bc, rim, lw * 0.9, true);
          G.disc(x - sw, y + s * 0.23, s * 0.08, cc, rim, lw * 0.75);
        } else if (vv === 3) {
          G.poly([[x - s * 0.30, y + s * 0.20], [x - s * 0.22, y - s * 0.24], [x + s * 0.22, y - s * 0.24], [x + s * 0.30, y + s * 0.20]], bc, rim, lw, true);
          G.capsule(x, y + s * 0.20, s * 0.70, s * 0.10, bc, rim, lw * 0.85);
          G.disc(x - sw, y + s * 0.31, s * 0.09, cc, rim, lw * 0.8);
          G.disc(x + s * 0.26, y - s * 0.26, s * 0.12 + Math.abs(sw) * 0.4, cc, rim, lw * 0.75);
        } else if (vv === 4) {
          G.poly([[x - s * 0.28, y + s * 0.18], [x - s * 0.20, y - s * 0.24], [x + s * 0.20, y - s * 0.24], [x + s * 0.28, y + s * 0.18]], bc, rim, lw, true);
          G.disc(x - sw, y + s * 0.29, s * 0.09, cc, rim, lw * 0.8);
          G.ring(x, y, s * 0.39 + Math.abs(sw) * 0.5, lw, -0.5, 0.5, ac);
          G.ring(x, y, s * 0.39 + Math.abs(sw) * 0.5, lw, Math.PI - 0.5, Math.PI + 0.5, ac);
        } else if (vv === 5) {
          G.box(x, y, s * 0.74, s * 0.78, s * 0.12, '#1e293b', rim, lw);
          G.poly([[x - s * 0.20, y + s * 0.14], [x - s * 0.14, y - s * 0.18], [x + s * 0.14, y - s * 0.18], [x + s * 0.20, y + s * 0.14]], bc, rim, lw * 0.85, true);
          G.disc(x - sw, y + s * 0.23, s * 0.075, ac, rim, lw * 0.7);
        } else {
          G.disc(x, y - s * 0.33, s * 0.08, bc, rim, lw * 0.8);
          G.poly([[x - s * 0.30, y + s * 0.20], [x - s * 0.21, y - s * 0.26], [x + s * 0.21, y - s * 0.26], [x + s * 0.30, y + s * 0.20]], bc, rim, lw, true);
          G.capsule(x, y + s * 0.20, s * 0.72, s * 0.10, bc, rim, lw * 0.9);
          G.disc(x - sw, y + s * 0.31, s * 0.095, cc, rim, lw * 0.8);
        }
      },
      calculator: function(x, y, s, bodyCol, screenCol, btnCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#1e293b', sc = screenCol || '#00e5ff', bt = btnCol || '#ffd700';
        var pulse = Math.floor((tt * 2.4) % 4);
        if (vv === 1) {
          G.box(x, y, s * 0.72, s * 0.82, s * 0.12, bc, rim, lw);
          G.box(x, y - s * 0.22, s * 0.54, s * 0.18, s * 0.05, sc, rim, lw * 0.7);
          G.capsule(x - s * 0.12, y + s * 0.04, s * 0.22, s * 0.12, '#4f46e5', rim, lw * 0.65);
          G.capsule(x - s * 0.12, y + s * 0.22, s * 0.22, s * 0.12, '#4f46e5', rim, lw * 0.65);
          G.box(x + s * 0.18, y + s * 0.13, s * 0.18, s * 0.30, s * 0.06, pulse % 2 === 0 ? bt : sc, rim, lw * 0.7);
        } else if (vv === 2) {
          G.box(x - s * 0.06, y, s * 0.62, s * 0.78, s * 0.10, bc, rim, lw);
          G.box(x - s * 0.06, y - s * 0.20, s * 0.44, s * 0.16, s * 0.04, sc, null, 0);
          G.disc(x + s * 0.24, y + s * 0.20, s * 0.15 + Math.sin(tt * 3) * s * 0.015, bt, rim, lw * 0.8);
          G.pill(x - s * 0.20, y + s * 0.06, x + s * 0.04, y + s * 0.06, lw * 1.1, rim);
          G.pill(x - s * 0.20, y + s * 0.20, x + s * 0.04, y + s * 0.20, lw * 1.1, sc);
        } else if (vv === 3) {
          G.box(x, y, s * 0.78, s * 0.80, s * 0.14, bc, rim, lw);
          G.box(x, y - s * 0.21, s * 0.58, s * 0.17, s * 0.04, sc, rim, lw * 0.7);
          G.bar(x - s * 0.16, y + s * 0.26, s * 0.11, s * (0.16 + 0.05 * Math.sin(tt * 2.5)), s * 0.02, bt, null, 0);
          G.bar(x, y + s * 0.26, s * 0.11, s * (0.24 + 0.05 * Math.cos(tt * 2.5)), s * 0.02, '#4f46e5', null, 0);
          G.bar(x + s * 0.16, y + s * 0.26, s * 0.11, s * (0.20 + 0.05 * Math.sin(tt * 3.1)), s * 0.02, sc, null, 0);
        } else if (vv === 4) {
          G.box(x, y, s * 0.74, s * 0.80, s * 0.12, '#334155', rim, lw);
          G.box(x, y - s * 0.21, s * 0.56, s * 0.18, s * 0.04, bt, rim, lw * 0.7);
          for (var b4 = 0; b4 < 4; b4++) {
            var bx4 = x + (b4 % 2 === 0 ? -s * 0.14 : s * 0.14), by4 = y + (b4 < 2 ? s * 0.04 : s * 0.23);
            G.disc(bx4, by4, s * 0.09, b4 === pulse ? sc : '#1e293b', rim, lw * 0.7);
          }
        } else if (vv === 5) {
          G.box(x, y, s * 0.66, s * 0.82, s * 0.11, bc, rim, lw);
          G.box(x, y - s * 0.22, s * 0.48, s * 0.17, s * 0.04, sc, rim, lw * 0.7);
          G.pill(x - s * 0.16, y + s * 0.04, x - s * 0.02, y + s * 0.04, lw * 1.2, bt);
          G.pill(x - s * 0.09, y - s * 0.03, x - s * 0.09, y + s * 0.11, lw * 1.2, bt);
          G.pill(x + s * 0.04, y + s * 0.04, x + s * 0.18, y + s * 0.04, lw * 1.2, sc);
          G.capsule(x, y + s * 0.24, s * 0.44, s * 0.12, pulse % 2 === 0 ? bt : '#4f46e5', rim, lw * 0.7);
        } else {
          G.box(x, y, s * 0.66, s * 0.84, s * 0.11, bc, rim, lw);
          G.box(x, y - s * 0.23, s * 0.48, s * 0.17, s * 0.04, sc, rim, lw * 0.7);
          for (var b0 = 0; b0 < 4; b0++) {
            var bx0 = x + (b0 % 2 === 0 ? -s * 0.13 : s * 0.13), by0 = y + (b0 < 2 ? s * 0.03 : s * 0.22);
            G.box(bx0, by0, s * 0.18, s * 0.13, s * 0.04, b0 === pulse ? bt : '#4f46e5', rim, lw * 0.65);
          }
        }
      },
      scales: function(x, y, s, beamCol, panCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = beamCol || '#f8fafc', pc = panCol || '#00e5ff', ac = accCol || '#ffd700';
        var tilt = Math.sin(tt * 2.4) * s * 0.065;
        if (vv === 1) {
          G.disc(x, y, s * 0.43, '#1e293b', rim, lw);
          G.pill(x, y - s * 0.24, x, y + s * 0.26, lw * 1.2, bc);
          G.capsule(x, y + s * 0.26, s * 0.38, s * 0.09, ac, rim, lw * 0.7);
          G.pill(x - s * 0.26, y - s * 0.12 + tilt * 0.5, x + s * 0.26, y - s * 0.12 - tilt * 0.5, lw * 1.1, ac);
          G.disc(x - s * 0.24, y + s * 0.06 + tilt * 0.5, s * 0.10, pc, rim, lw * 0.65);
          G.disc(x + s * 0.24, y + s * 0.06 - tilt * 0.5, s * 0.10, pc, rim, lw * 0.65);
        } else if (vv === 2) {
          G.box(x, y, s * 0.84, s * 0.78, s * 0.14, '#1e293b', rim, lw);
          G.pill(x, y - s * 0.22, x, y + s * 0.22, lw * 1.1, bc);
          G.pill(x - s * 0.26, y - s * 0.14 + tilt * 0.5, x + s * 0.26, y - s * 0.14 - tilt * 0.5, lw * 1.1, ac);
          G.box(x - s * 0.24, y + s * 0.06 + tilt * 0.5, s * 0.18, s * 0.10, s * 0.04, pc, rim, lw * 0.6);
          G.box(x + s * 0.24, y + s * 0.06 - tilt * 0.5, s * 0.18, s * 0.10, s * 0.04, pc, rim, lw * 0.6);
        } else if (vv === 3) {
          G.pill(x, y - s * 0.26, x, y + s * 0.32, lw * 1.3, bc);
          G.capsule(x, y + s * 0.34, s * 0.48, s * 0.10, ac, rim, lw * 0.8);
          G.pill(x - s * 0.34, y - s * 0.18 + tilt, x + s * 0.34, y - s * 0.18 - tilt, lw * 1.2, ac);
          G.disc(x - s * 0.32, y + s * 0.06 + tilt, s * 0.14, pc, rim, lw * 0.8);
          G.disc(x + s * 0.32, y + s * 0.06 - tilt, s * 0.14, '#4f46e5', rim, lw * 0.8);
        } else if (vv === 4) {
          G.poly([[x, y - s * 0.42], [x + s * 0.36, y - s * 0.26], [x + s * 0.31, y + s * 0.16], [x, y + s * 0.42], [x - s * 0.31, y + s * 0.16], [x - s * 0.36, y - s * 0.26]], '#1e293b', rim, lw, true);
          G.pill(x, y - s * 0.20, x, y + s * 0.22, lw * 1.1, bc);
          G.pill(x - s * 0.22, y - s * 0.10 + tilt * 0.5, x + s * 0.22, y - s * 0.10 - tilt * 0.5, lw, ac);
          G.disc(x - s * 0.20, y + s * 0.08 + tilt * 0.5, s * 0.08, pc, rim, lw * 0.6);
          G.disc(x + s * 0.20, y + s * 0.08 - tilt * 0.5, s * 0.08, pc, rim, lw * 0.6);
        } else if (vv === 5) {
          G.capsule(x, y + s * 0.34, s * 0.50, s * 0.10, bc, rim, lw * 0.8);
          G.pill(x, y - s * 0.28, x, y + s * 0.32, lw * 1.2, bc);
          G.pill(x - s * 0.34, y - s * 0.18 + tilt, x + s * 0.34, y - s * 0.18 - tilt, lw * 1.2, ac);
          G.oval(x - s * 0.32, y + s * 0.08 + tilt, s * 0.16, s * 0.07, 0, pc, rim, lw * 0.75);
          G.oval(x + s * 0.32, y + s * 0.08 - tilt, s * 0.16, s * 0.07, 0, ac, rim, lw * 0.75);
        } else {
          G.capsule(x, y + s * 0.34, s * 0.48, s * 0.10, bc, rim, lw * 0.85);
          G.pill(x, y - s * 0.28, x, y + s * 0.32, lw * 1.2, bc);
          G.pill(x - s * 0.34, y - s * 0.18 + tilt, x + s * 0.34, y - s * 0.18 - tilt, lw * 1.2, ac);
          G.pill(x - s * 0.34, y - s * 0.18 + tilt, x - s * 0.34, y + s * 0.06 + tilt, lw * 0.8, rim);
          G.pill(x + s * 0.34, y - s * 0.18 - tilt, x + s * 0.34, y + s * 0.06 - tilt, lw * 0.8, rim);
          G.capsule(x - s * 0.34, y + s * 0.10 + tilt, s * 0.26, s * 0.10, pc, rim, lw * 0.75);
          G.capsule(x + s * 0.34, y + s * 0.10 - tilt, s * 0.26, s * 0.10, pc, rim, lw * 0.75);
        }
      },
      compass: function(x, y, s, ringCol, dialCol, needleCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var rc = ringCol || '#4f46e5', dc = dialCol || '#1e293b', nc = needleCol || '#f43f5e';
        var ang = -Math.PI * 0.25 + Math.sin(tt * 2.2) * 0.45;
        if (vv === 1) {
          G.box(x, y, s * 0.82, s * 0.80, s * 0.18, dc, rim, lw);
          G.ring(x, y, s * 0.28, lw * 1.2, 0, Math.PI * 2, rc);
          G.part(x, y, ang, 1, 1, function() {
            G.poly([[0, -s * 0.22], [s * 0.08, 0], [-s * 0.08, 0]], nc, rim, lw * 0.6, true);
            G.poly([[0, s * 0.22], [s * 0.08, 0], [-s * 0.08, 0]], '#00e5ff', rim, lw * 0.6, true);
          });
          G.disc(x, y, s * 0.06, '#ffd700', rim, lw * 0.55);
        } else if (vv === 2) {
          G.disc(x, y, s * 0.43, dc, rim, lw);
          G.ring(x, y, s * 0.34, lw * 1.1, tt * 1.0, tt * 1.0 + Math.PI * 1.3, '#00e5ff');
          G.part(x, y, ang, 1, 1, function() {
            G.poly([[0, -s * 0.26], [s * 0.09, 0], [-s * 0.09, 0]], nc, rim, lw * 0.65, true);
            G.poly([[0, s * 0.26], [s * 0.09, 0], [-s * 0.09, 0]], rim, null, 0, true);
          });
          G.disc(x, y, s * 0.07, '#ffd700', rim, lw * 0.6);
        } else if (vv === 3) {
          G.ngon(x, y, s * 0.44, 8, Math.PI / 8, dc, rim, lw);
          G.disc(x, y, s * 0.32, rc, rim, lw * 0.8);
          G.part(x, y, ang, 1, 1, function() {
            G.poly([[0, -s * 0.24], [s * 0.08, 0], [-s * 0.08, 0]], '#ffd700', rim, lw * 0.6, true);
            G.poly([[0, s * 0.24], [s * 0.08, 0], [-s * 0.08, 0]], '#00e5ff', rim, lw * 0.6, true);
          });
        } else if (vv === 4) {
          G.disc(x, y, s * 0.43, dc, rim, lw);
          G.rays(x, y, s * 0.31, s * 0.38, 4, 0, lw * 1.1, '#00e5ff');
          G.part(x, y, ang, 1, 1, function() {
            G.poly([[0, -s * 0.26], [s * 0.09, 0], [-s * 0.09, 0]], nc, rim, lw * 0.65, true);
            G.poly([[0, s * 0.26], [s * 0.09, 0], [-s * 0.09, 0]], '#f8fafc', rim, lw * 0.65, true);
          });
          G.disc(x, y, s * 0.065, '#ffd700', rim, lw * 0.6);
        } else if (vv === 5) {
          G.disc(x, y, s * 0.42, rc, rim, lw);
          G.disc(x, y, s * 0.31, dc, rim, lw * 0.75);
          G.part(x, y, ang, 1, 1, function() {
            G.arrow(0, s * 0.20, 0, -s * 0.24, lw * 1.2, s * 0.11, '#ffd700');
          });
        } else {
          G.disc(x, y, s * 0.43, rc, rim, lw);
          G.disc(x, y, s * 0.34, dc, rim, lw * 0.8);
          G.part(x, y, ang, 1, 1, function() {
            G.poly([[0, -s * 0.28], [s * 0.09, 0], [-s * 0.09, 0]], nc, rim, lw * 0.65, true);
            G.poly([[0, s * 0.28], [s * 0.09, 0], [-s * 0.09, 0]], '#00e5ff', rim, lw * 0.65, true);
          });
          G.disc(x, y, s * 0.07, '#ffd700', rim, lw * 0.6);
        }
      },
      camera: function(x, y, s, bodyCol, lensCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#1e293b', lc = lensCol || '#00e5ff', ac = accCol || '#f43f5e';
        var pulse = 1 + 0.09 * Math.sin(tt * 3.0);
        if (vv === 1) {
          G.disc(x - s * 0.16, y - s * 0.24, s * 0.14, '#4f46e5', rim, lw * 0.85);
          G.disc(x + s * 0.08, y - s * 0.24, s * 0.14, '#4f46e5', rim, lw * 0.85);
          G.box(x - s * 0.04, y + s * 0.08, s * 0.54, s * 0.38, s * 0.08, bc, rim, lw);
          G.poly([[x + s * 0.23, y + s * 0.08], [x + s * 0.42, y - s * 0.06], [x + s * 0.42, y + s * 0.22]], lc, rim, lw * 0.85, true);
          G.disc(x - s * 0.04, y + s * 0.08, s * 0.09 * pulse, ac, rim, lw * 0.65);
        } else if (vv === 2) {
          G.box(x, y, s * 0.80, s * 0.72, s * 0.16, bc, rim, lw);
          G.disc(x, y, s * 0.24, '#334155', rim, lw * 0.85);
          G.disc(x, y, s * 0.14 * pulse, lc, rim, lw * 0.7);
          G.disc(x + s * 0.24, y - s * 0.20, s * 0.055, ac, null, 0);
        } else if (vv === 3) {
          G.box(x, y + s * 0.04, s * 0.82, s * 0.56, s * 0.11, bc, rim, lw);
          G.box(x, y - s * 0.27, s * 0.28, s * 0.12, s * 0.04, '#4f46e5', rim, lw * 0.8);
          G.disc(x, y + s * 0.04, s * 0.19, lc, rim, lw * 0.9);
          G.disc(x, y + s * 0.04, s * 0.09 * pulse, '#ffd700', rim, lw * 0.6);
          G.disc(x + s * 0.28, y - s * 0.12, s * 0.05, ac, null, 0);
        } else if (vv === 4) {
          G.disc(x, y, s * 0.43, bc, rim, lw);
          G.ring(x, y, s * 0.30, lw * 1.1, tt * 0.9, tt * 0.9 + Math.PI * 1.4, lc);
          G.poly([[x - s * 0.08, y - s * 0.15 * pulse], [x + s * 0.18 * pulse, y], [x - s * 0.08, y + s * 0.15 * pulse]], '#ffd700', rim, lw * 0.7, true);
        } else if (vv === 5) {
          G.box(x - s * 0.06, y + s * 0.04, s * 0.62, s * 0.44, s * 0.09, bc, rim, lw);
          G.poly([[x + s * 0.25, y + s * 0.04], [x + s * 0.42, y - s * 0.10], [x + s * 0.42, y + s * 0.18]], lc, rim, lw * 0.85, true);
          G.disc(x - s * 0.20, y - s * 0.04, s * 0.06 * pulse, ac, null, 0);
          G.capsule(x - s * 0.04, y - s * 0.24, s * 0.34, s * 0.10, '#4f46e5', rim, lw * 0.75);
        } else {
          G.box(x, y + s * 0.05, s * 0.84, s * 0.56, s * 0.11, bc, rim, lw);
          G.poly([[x - s * 0.16, y - s * 0.23], [x - s * 0.10, y - s * 0.34], [x + s * 0.10, y - s * 0.34], [x + s * 0.16, y - s * 0.23]], '#4f46e5', rim, lw * 0.85, true);
          G.disc(x, y + s * 0.05, s * 0.20, '#0f172a', rim, lw * 0.9);
          G.disc(x, y + s * 0.05, s * 0.12 * pulse, lc, rim, lw * 0.7);
          G.disc(x + s * 0.28, y - s * 0.10, s * 0.055, ac, null, 0);
        }
      },
`;

export const ENGINE_BG_HELPERS_JS = `
      _isoShade: function(col, amt) {
        if (!col || typeof col !== 'string') return col || '#38bdf8';
        var s = col.trim();
        var r = 56, g = 189, b = 248, ok = false;
        if (s.charAt(0) === '#') {
          var hx = s.slice(1);
          if (hx.length === 3) {
            r = parseInt(hx[0] + hx[0], 16); g = parseInt(hx[1] + hx[1], 16); b = parseInt(hx[2] + hx[2], 16); ok = true;
          } else if (hx.length >= 6) {
            r = parseInt(hx.slice(0, 2), 16); g = parseInt(hx.slice(2, 4), 16); b = parseInt(hx.slice(4, 6), 16); ok = true;
          }
        } else if (s.indexOf('rgb') === 0) {
          var m = s.match(/[0-9]+/g);
          if (m && m.length >= 3) { r = parseInt(m[0], 10); g = parseInt(m[1], 10); b = parseInt(m[2], 10); ok = true; }
        }
        if (!ok || isNaN(r) || isNaN(g) || isNaN(b)) return col;
        var k = G._n(amt, 0.75);
        var nr = Math.max(0, Math.min(255, Math.round(k <= 1 ? r * k : r + (255 - r) * (k - 1))));
        var ng = Math.max(0, Math.min(255, Math.round(k <= 1 ? g * k : g + (255 - g) * (k - 1))));
        var nb = Math.max(0, Math.min(255, Math.round(k <= 1 ? b * k : b + (255 - b) * (k - 1))));
        return 'rgb(' + nr + ',' + ng + ',' + nb + ')';
      },
      isoPt: function(u, v, z, ox, oy, sc) {
        var uu = G._n(u, 0), vv = G._n(v, 0), zz = G._n(z, 0);
        var s = Math.max(4, G._n(sc, 32));
        return [
          G._n(ox, 400) + (uu - vv) * s * 0.866,
          G._n(oy, 300) + (uu + vv) * s * 0.433 - zz * s
        ];
      },
      isoTile: function(u, v, z, du, dv, ox, oy, sc, fill, rim, lw) {
        var ddu = G._n(du, 1), ddv = G._n(dv, 1), zz = G._n(z, 0);
        var p0 = G.isoPt(u, v, zz, ox, oy, sc);
        var p1 = G.isoPt(u + ddu, v, zz, ox, oy, sc);
        var p2 = G.isoPt(u + ddu, v + ddv, zz, ox, oy, sc);
        var p3 = G.isoPt(u, v + ddv, zz, ox, oy, sc);
        G.poly([p0, p1, p2, p3], fill || '#1e293b', rim || null, lw || 0.9, true);
      },
      isoFloor: function(ox, oy, sc, u0, u1, v0, v1, step, cA, cB, rim) {
        var st = Math.max(0.25, Math.abs(G._n(step, 1)));
        var us = G._n(u0, -5), ue = G._n(u1, 5), vs = G._n(v0, -5), ve = G._n(v1, 5);
        var cu = 0;
        for (var u = us; u < ue - 0.01 && cu < 24; u += st, cu++) {
          var cv = 0;
          for (var v = vs; v < ve - 0.01 && cv < 24; v += st, cv++) {
            var col = (cu + cv) % 2 === 0 ? (cA || '#1e293b') : (cB || G._isoShade(cA || '#1e293b', 0.86));
            G.isoTile(u, v, 0, st, st, ox, oy, sc, col, rim || null, 0.8);
          }
        }
      },
      isoBox: function(u, v, z, du, dv, dz, ox, oy, sc, topC, leftC, rightC, rim, opt) {
        if (typeof leftC === 'string' && (leftC === 'win' || leftC === 'glass')) {
          opt = leftC; leftC = null;
        }
        var ddu = Math.max(0.06, Math.abs(G._n(du, 1)));
        var ddv = Math.max(0.06, Math.abs(G._n(dv, 1)));
        var ddz = Math.max(0.04, Math.abs(G._n(dz, 1)));
        var uu = G._n(u, 0), vv = G._n(v, 0), zz = G._n(z, 0);
        var s = Math.max(4, G._n(sc, 32));
        var tc = topC || '#38bdf8';
        var lc = leftC || G._isoShade(tc, 0.76);
        var rc = rightC || G._isoShade(tc, 0.56);
        var rm = rim || G._isoShade(tc, 1.28);
        var lw = Math.max(0.8, Math.min(2.2, s * 0.032));
        var t0 = G.isoPt(uu, vv, zz + ddz, ox, oy, s);
        var t1 = G.isoPt(uu + ddu, vv, zz + ddz, ox, oy, s);
        var t2 = G.isoPt(uu + ddu, vv + ddv, zz + ddz, ox, oy, s);
        var t3 = G.isoPt(uu, vv + ddv, zz + ddz, ox, oy, s);
        var b1 = G.isoPt(uu + ddu, vv, zz, ox, oy, s);
        var b2 = G.isoPt(uu + ddu, vv + ddv, zz, ox, oy, s);
        var b3 = G.isoPt(uu, vv + ddv, zz, ox, oy, s);
        G.poly([t3, t2, b2, b3], lc, rm, lw, true);
        G.poly([t2, t1, b1, b2], rc, rm, lw, true);
        G.poly([t0, t1, t2, t3], tc, rm, lw, true);
        if (opt === 'win' && ddz >= 0.45 && (ddu >= 0.35 || ddv >= 0.35)) {
          var wCol = G._isoShade(tc, 1.45);
          var wDim = G._isoShade(rc, 0.75);
          var colsU = Math.max(1, Math.min(3, Math.floor(ddu * 2.2)));
          var colsV = Math.max(1, Math.min(3, Math.floor(ddv * 2.2)));
          var rowsZ = Math.max(1, Math.min(6, Math.floor(ddz * 1.9)));
          var rz, cu2, cv2, z0, z1, x0, x1;
          for (rz = 0; rz < rowsZ; rz++) {
            z0 = zz + ddz * (0.14 + (rz / rowsZ) * 0.74);
            z1 = z0 + ddz * (0.42 / rowsZ);
            for (cu2 = 0; cu2 < colsU; cu2++) {
              x0 = uu + ddu * (0.14 + (cu2 / colsU) * 0.74);
              x1 = x0 + ddu * (0.48 / colsU);
              var isLitL = ((rz + cu2) % 3 !== 0);
              G.poly([
                G.isoPt(x0, vv + ddv + 0.004, z1, ox, oy, s),
                G.isoPt(x1, vv + ddv + 0.004, z1, ox, oy, s),
                G.isoPt(x1, vv + ddv + 0.004, z0, ox, oy, s),
                G.isoPt(x0, vv + ddv + 0.004, z0, ox, oy, s)
              ], isLitL ? wCol : wDim, null, 0, true);
            }
            for (cv2 = 0; cv2 < colsV; cv2++) {
              x0 = vv + ddv * (0.14 + (cv2 / colsV) * 0.74);
              x1 = x0 + ddv * (0.48 / colsV);
              var isLitR = ((rz + cv2 + 1) % 3 === 0);
              G.poly([
                G.isoPt(uu + ddu + 0.004, x0, z1, ox, oy, s),
                G.isoPt(uu + ddu + 0.004, x1, z1, ox, oy, s),
                G.isoPt(uu + ddu + 0.004, x1, z0, ox, oy, s),
                G.isoPt(uu + ddu + 0.004, x0, z0, ox, oy, s)
              ], isLitR ? wCol : wDim, null, 0, true);
            }
          }
        } else if (opt === 'glass') {
          ctx.save();
          ctx.globalAlpha = 0.24;
          G.poly([
            G.isoPt(uu + ddu * 0.15, vv + ddv + 0.004, zz + ddz * 0.88, ox, oy, s),
            G.isoPt(uu + ddu * 0.42, vv + ddv + 0.004, zz + ddz * 0.88, ox, oy, s),
            G.isoPt(uu + ddu * 0.26, vv + ddv + 0.004, zz + ddz * 0.12, ox, oy, s),
            G.isoPt(uu + ddu * 0.08, vv + ddv + 0.004, zz + ddz * 0.12, ox, oy, s)
          ], '#ffffff', null, 0, true);
          ctx.restore();
        }
      },
      isoCyl: function(u, v, z, r, h, ox, oy, sc, topC, sideC, rim) {
        var rr = Math.max(0.08, Math.abs(G._n(r, 0.45)));
        var hh = Math.max(0.05, Math.abs(G._n(h, 0.8)));
        var uu = G._n(u, 0), vv = G._n(v, 0), zz = G._n(z, 0);
        var s = Math.max(4, G._n(sc, 32));
        var tc = topC || '#38bdf8', scCol = sideC || G._isoShade(tc, 0.68), rm = rim || G._isoShade(tc, 1.28);
        var bPt = G.isoPt(uu, vv, zz, ox, oy, s);
        var tPt = G.isoPt(uu, vv, zz + hh, ox, oy, s);
        var rx = rr * s * 1.15, ry = rr * s * 0.575;
        var lw = Math.max(0.8, Math.min(2.2, s * 0.032));
        ctx.beginPath();
        ctx.moveTo(tPt[0] - rx, tPt[1]);
        ctx.lineTo(bPt[0] - rx, bPt[1]);
        ctx.ellipse(bPt[0], bPt[1], rx, ry, 0, Math.PI, 0, true);
        ctx.lineTo(tPt[0] + rx, tPt[1]);
        ctx.closePath();
        ctx.fillStyle = G.grad(scCol, G._isoShade(scCol, 0.68), bPt[0] - rx, bPt[1], bPt[0] + rx, bPt[1]);
        ctx.fill();
        if (rm) { ctx.strokeStyle = G._c(rm); ctx.lineWidth = lw; ctx.stroke(); }
        G.oval(tPt[0], tPt[1], rx, ry, 0, tc, rm, lw);
      },
      isoTree: function(u, v, z, sz, ox, oy, sc, trunkC, leafC, t, isPalm) {
        var k = Math.max(0.35, Math.abs(G._n(sz, 1)));
        var uu = G._n(u, 0), vv = G._n(v, 0), zz = G._n(z, 0);
        var s = Math.max(4, G._n(sc, 32));
        var tt = G._t(t);
        var tr = trunkC || '#78350f', lf = leafC || '#2dd4bf';
        var sw = Math.sin(tt * 2.1 + uu * 0.8 + vv * 0.7) * 0.07 * k;
        G.isoCyl(uu, vv, zz, 0.08 * k, 0.42 * k, ox, oy, s, G._isoShade(tr, 1.15), tr, null);
        var cPt = G.isoPt(uu + sw, vv + sw * 0.4, zz + 0.52 * k, ox, oy, s);
        if (isPalm) {
          for (var f = 0; f < 5; f++) {
            var ang = (f * Math.PI * 2) / 5 + sw * 1.4;
            var fx = cPt[0] + Math.cos(ang) * s * 0.42 * k;
            var fy = cPt[1] + Math.sin(ang) * s * 0.22 * k + s * 0.08 * k;
            G.oval((cPt[0] + fx) * 0.5, (cPt[1] + fy) * 0.5, s * 0.26 * k, s * 0.09 * k, ang * 0.5, f % 2 === 0 ? lf : G._isoShade(lf, 0.82), null, 0);
          }
          G.disc(cPt[0], cPt[1], s * 0.08 * k, G._isoShade(lf, 1.2), null, 0);
        } else {
          G.disc(cPt[0] - s * 0.10 * k, cPt[1] + s * 0.06 * k, s * 0.22 * k, G._isoShade(lf, 0.75), null, 0);
          G.disc(cPt[0] + s * 0.10 * k, cPt[1] + s * 0.04 * k, s * 0.21 * k, G._isoShade(lf, 0.88), null, 0);
          G.disc(cPt[0], cPt[1] - s * 0.12 * k, s * 0.24 * k, lf, G._isoShade(lf, 1.25), 0.9);
        }
      },
      isoCar: function(u, v, z, axis, sz, ox, oy, sc, bodyC, winC, glowC) {
        var k = Math.max(0.4, Math.abs(G._n(sz, 1)));
        var ax = String(axis || 'u').toLowerCase();
        var du = ax === 'u' ? 0.56 * k : 0.30 * k;
        var dv = ax === 'u' ? 0.30 * k : 0.56 * k;
        var bc = bodyC || '#f43f5e', wc = winC || '#bae6fd', gc = glowC || '#fde047';
        G.isoBox(u - du * 0.5, v - dv * 0.5, z, du, dv, 0.18 * k, ox, oy, sc, bc, G._isoShade(bc, 0.78), G._isoShade(bc, 0.58));
        G.isoBox(u - du * 0.28, v - dv * 0.28, z + 0.18 * k, du * 0.56, dv * 0.56, 0.14 * k, ox, oy, sc, wc, G._isoShade(wc, 0.82), G._isoShade(wc, 0.68));
        var lPt = G.isoPt(ax === 'u' ? u + du * 0.52 : u, ax === 'u' ? v : v + dv * 0.52, z + 0.09 * k, ox, oy, sc);
        G.disc(lPt[0], lPt[1], Math.max(2, G._n(sc, 32) * 0.06 * k), gc, null, 0);
      },
      isoPath: function(pts3d, ox, oy, sc, th, col, pulseC, t) {
        if (!pts3d || pts3d.length < 2) return;
        var s = Math.max(4, G._n(sc, 32));
        var pts2 = [];
        for (var i = 0; i < pts3d.length; i++) {
          var q = pts3d[i];
          pts2.push(G.isoPt(q[0], q[1], q[2] || 0, ox, oy, s));
        }
        var lw = Math.max(2, G._n(th, s * 0.14));
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts2[0][0], pts2[0][1]);
        for (var j = 1; j < pts2.length; j++) ctx.lineTo(pts2[j][0], pts2[j][1]);
        ctx.strokeStyle = G._c(col || '#334155');
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        if (pulseC) {
          var tt = G._t(t);
          ctx.setLineDash([lw * 1.8, lw * 2.4]);
          ctx.lineDashOffset = -tt * lw * 9.5;
          ctx.strokeStyle = G._c(pulseC);
          ctx.lineWidth = Math.max(1.4, lw * 0.48);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      },
      isoCloud: function(x, y, sz, col, alpha) {
        var r = Math.max(8, G._n(sz, 36));
        var cc = col || '#f8fafc';
        ctx.save();
        ctx.globalAlpha = Math.max(0.15, Math.min(0.95, G._n(alpha, 0.72)));
        G.capsule(x, y + r * 0.14, r * 2.2, r * 0.76, cc, null, 0);
        G.disc(x - r * 0.42, y - r * 0.04, r * 0.48, cc, null, 0);
        G.disc(x + r * 0.18, y - r * 0.16, r * 0.56, cc, null, 0);
        ctx.restore();
      },
      bgWaves: function(w, h, c1, c2, c3, t, v) {
        w = Math.max(120, G._n(w, 1280)); h = Math.max(90, G._n(h, 720));
        var tt = G._t(t), vv = G._v(v);
        var a1 = G._c(c1 || '#38bdf8'), a2 = G._c(c2 || '#6366f1'), a3 = G._c(c3 || '#00e5ff');
        var bands = vv === 1 ? 5 : (vv === 4 ? 3 : 4);
        for (var b = 0; b < bands; b++) {
          var baseY = h * (0.24 + b * (0.58 / bands));
          var amp = h * (vv === 2 ? 0.09 : 0.065) * (1 + 0.15 * (b % 2));
          var freq = (vv === 3 ? 3.2 : 2.1) + b * 0.35;
          var phase = tt * (1.2 + b * 0.28) + b * 1.1;
          ctx.beginPath();
          for (var ix = -1; ix <= 24; ix++) {
            var px = (ix / 23) * (w * 1.12) - w * 0.06;
            var py = baseY + Math.sin((px / w) * Math.PI * freq + phase) * amp + Math.cos((px / w) * Math.PI * 1.5 - phase * 0.6) * amp * 0.4;
            if (ix === -1) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          if (vv === 0 || vv === 2 || vv === 5) {
            ctx.lineTo(w * 1.08, h * 1.08);
            ctx.lineTo(-w * 0.08, h * 1.08);
            ctx.closePath();
            ctx.fillStyle = b % 2 === 0 ? G.grad(a1, a2, 0, baseY - amp, 0, h) : G.grad(a2, a3, 0, baseY - amp, w, h);
            ctx.fill();
          }
          ctx.strokeStyle = b % 2 === 0 ? a3 : a1;
          ctx.lineWidth = Math.max(2, h * (vv === 1 ? 0.012 : 0.008));
          ctx.stroke();
        }
      },
      bgGrid: function(w, h, c1, c2, c3, t, v) {
        w = Math.max(120, G._n(w, 1280)); h = Math.max(90, G._n(h, 720));
        var tt = G._t(t), vv = G._v(v);
        var a1 = G._c(c1 || '#38bdf8'), a2 = G._c(c2 || '#6366f1'), a3 = G._c(c3 || '#ffd700');
        var cols = vv === 2 ? 12 : 10, rows = vv === 2 ? 8 : 6;
        var shiftX = ((tt * 0.35) % 1) * (w / cols);
        var shiftY = ((tt * 0.25) % 1) * (h / rows);
        var lw = Math.max(1.4, Math.min(w, h) * 0.004);
        if (vv === 1 || vv === 4) {
          var hy = h * 0.36;
          for (var k = -5; k <= 5; k++) {
            G.pill(w * 0.5 + k * w * 0.04, hy, w * 0.5 + k * w * 0.22, h * 1.04, lw, Math.abs(k) % 2 === 0 ? a1 : a2);
          }
          for (var r = 0; r < 6; r++) {
            var p = ((r / 6 + tt * 0.18) % 1);
            var ry = hy + p * p * (h - hy);
            G.pill(-w * 0.05, ry, w * 1.05, ry, lw * (0.8 + p), a3);
          }
        } else {
          for (var i = -1; i <= cols + 1; i++) {
            var gx = (i * w) / cols + (vv === 3 ? 0 : shiftX);
            G.pill(gx, -h * 0.05, gx, h * 1.05, lw, i % 2 === 0 ? a1 : a2);
          }
          for (var j = -1; j <= rows + 1; j++) {
            var gy = (j * h) / rows + (vv === 5 ? shiftY : 0);
            G.pill(-w * 0.05, gy, w * 1.05, gy, lw, j % 2 === 0 ? a2 : a1);
          }
        }
        var nodeCount = 5;
        for (var n = 0; n < nodeCount; n++) {
          var nx = w * (0.14 + 0.18 * n + 0.04 * Math.sin(tt * 1.4 + n));
          var ny = h * (0.22 + 0.52 * (0.5 + 0.5 * Math.cos(tt * 1.1 + n * 1.3)));
          G.disc(nx, ny, Math.min(w, h) * 0.016, n % 2 === 0 ? a3 : a1, a2, lw);
        }
      },
      bgGeo: function(w, h, c1, c2, c3, t, v) {
        w = Math.max(120, G._n(w, 1280)); h = Math.max(90, G._n(h, 720));
        var tt = G._t(t), vv = G._v(v);
        var a1 = G._c(c1 || '#38bdf8'), a2 = G._c(c2 || '#6366f1'), a3 = G._c(c3 || '#f43f5e');
        var cnt = 6, m = Math.min(w, h);
        for (var i = 0; i < cnt; i++) {
          var prog = ((i / cnt) + tt * 0.16) % 1;
          var x = -w * 0.08 + prog * (w * 1.16);
          var y = h * (0.16 + 0.14 * i + 0.04 * Math.sin(tt * 1.8 + i));
          var col = i % 3 === 0 ? a1 : (i % 3 === 1 ? a2 : a3);
          if (vv === 1 || vv === 4) {
            G.capsule(x, y, m * 0.34, m * 0.08, G.grad(col, a2, x - m * 0.15, y, x + m * 0.15, y), a1, 1.5);
          } else if (vv === 2 || vv === 5) {
            G.ngon(x, y, m * (0.10 + 0.02 * (i % 3)), 6, tt * 0.4 + i, col, a1, 1.8);
          } else {
            G.box(x, y, m * 0.26, m * 0.14, m * 0.03, col, a2, 1.8);
          }
        }
        G.ring(w * 0.5, h * 0.5, m * (0.34 + 0.04 * Math.sin(tt * 1.6)), Math.max(2, m * 0.008), tt * 0.5, tt * 0.5 + Math.PI * 1.4, a3);
      }
`;
