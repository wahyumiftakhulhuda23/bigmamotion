// Cohesive 6-variant ES5 Canvas 2D base primitives & Hero Icons (Part A)
// Shared by both client (geminiService.ts) and server (server/app.ts).

export const ENGINE_BASE_PRIMITIVES_JS = `
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.miterLimit = 2;
    (function(){
      var _arc = ctx.arc.bind(ctx);
      ctx.arc = function(x, y, r, sa, ea, ccw) {
        return _arc(isFinite(x)?x:0, isFinite(y)?y:0, Math.max(0.1, Math.abs(isFinite(r)?r:0)), isFinite(sa)?sa:0, isFinite(ea)?ea:Math.PI*2, !!ccw);
      };
      if (ctx.ellipse) {
        var _ell = ctx.ellipse.bind(ctx);
        ctx.ellipse = function(x, y, rx, ry, rot, sa, ea, ccw) {
          return _ell(isFinite(x)?x:0, isFinite(y)?y:0, Math.max(0.1, Math.abs(isFinite(rx)?rx:0)), Math.max(0.1, Math.abs(isFinite(ry)?ry:0)), isFinite(rot)?rot:0, isFinite(sa)?sa:0, isFinite(ea)?ea:Math.PI*2, !!ccw);
        };
      }
      if (ctx.roundRect) {
        var _rr = ctx.roundRect.bind(ctx);
        ctx.roundRect = function(x, y, rw, rh, rad) {
          var aw = Math.abs(isFinite(rw)?rw:0), ah = Math.abs(isFinite(rh)?rh:0);
          var rx = rw < 0 ? x + rw : x, ry = rh < 0 ? y + rh : y;
          var sr = Array.isArray(rad) ? rad.map(function(v){ return Math.max(0, isFinite(v)?v:0); }) : Math.max(0, isFinite(rad)?rad:0);
          return _rr(isFinite(rx)?rx:0, isFinite(ry)?ry:0, aw, ah, sr);
        };
      }
    })();
    var __bigmaT = 0;
    var __bigmaV = 0;
    var __bigmaGSAlpha = 1;
    var __bigmaBgActive = false;
    var __bigmaNamedRGB = {white:[255,255,255],black:[0,0,0],cyan:[0,255,255],aqua:[0,255,255],gold:[255,215,0],red:[255,0,0],blue:[0,0,255],yellow:[255,255,0],orange:[255,165,0],purple:[128,0,128],pink:[255,192,203],silver:[192,192,192],gray:[128,128,128],grey:[128,128,128],navy:[0,0,128],indigo:[75,0,130],violet:[238,130,238],magenta:[255,0,255],teal:[0,128,128],green:[0,229,255],lime:[0,229,255],limegreen:[0,229,255],springgreen:[0,229,255],chartreuse:[0,229,255]};
    var G = {
      _n: function(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : (d || 0); },
      _t: function(t) { return (typeof t === 'number' && isFinite(t)) ? t : (typeof __bigmaT === 'number' ? __bigmaT : 0); },
      _v: function(v) {
        var n = (typeof v === 'number' && isFinite(v)) ? v : (typeof __bigmaV === 'number' && isFinite(__bigmaV) ? __bigmaV : 0);
        return Math.abs(Math.floor(n)) % 6;
      },
      _rt: function(rimCol, t, defRim) {
        if (typeof rimCol === 'number') return { r: defRim || '#f8fafc', t: G._t(rimCol) };
        return { r: rimCol || defRim || '#f8fafc', t: G._t(t) };
      },
      _blendGS: function(r, g, b, ea) {
        if (ea < 0.16) return 'rgba(0,0,0,0)';
        var rr = Math.max(0, Math.min(255, Math.round(r)));
        var gg = Math.max(0, Math.min(255, Math.round(g)));
        var bb = Math.max(0, Math.min(255, Math.round(b)));
        if (gg > rr + 40 && gg > bb + 40) { rr = 0; gg = 229; bb = 255; }
        if (ea < 0.90) {
          rr = Math.round(rr * ea + 24 * (1 - ea));
          gg = Math.round(gg * ea + 34 * (1 - ea));
          bb = Math.round(bb * ea + 56 * (1 - ea));
        }
        return 'rgb(' + rr + ',' + gg + ',' + bb + ')';
      },
      _c: function(c) {
        if (!c || typeof c !== 'string' || typeof __bigmaGS === 'undefined' || !__bigmaGS) return c;
        var s = c.trim().toLowerCase();
        if (s === 'transparent' || s === 'none') return 'rgba(0,0,0,0)';
        var gsA = (typeof __bigmaGSAlpha === 'number' && isFinite(__bigmaGSAlpha)) ? Math.max(0, Math.min(1, __bigmaGSAlpha)) : 1;
        if (s.indexOf('rgba(') === 0 || s.indexOf('rgb(') === 0) {
          var p = s.slice(s.indexOf('(') + 1).replace(')', '').split(',');
          var rr = parseFloat(p[0]), gg = parseFloat(p[1]), bb = parseFloat(p[2]);
          var al = p.length > 3 ? parseFloat(p[3]) : 1;
          var ea = Math.max(0, Math.min(1, (isNaN(al) ? 1 : al) * gsA));
          if (!isNaN(rr) && !isNaN(gg) && !isNaN(bb)) return G._blendGS(rr, gg, bb, ea);
          return ea < 0.16 ? 'rgba(0,0,0,0)' : '#38BDF8';
        }
        if (s.indexOf('hsla(') === 0 || s.indexOf('hsl(') === 0) {
          var hp = s.slice(s.indexOf('(') + 1).replace(')', '').split(',');
          var hal = hp.length > 3 ? parseFloat(hp[3]) : 1;
          var hea = Math.max(0, Math.min(1, (isNaN(hal) ? 1 : hal) * gsA));
          if (hea < 0.16) return 'rgba(0,0,0,0)';
          var hue = parseFloat(hp[0]), sat = parseFloat(hp[1]), lit = parseFloat(hp[2]);
          if (!isNaN(hue) && !isNaN(sat) && !isNaN(lit)) {
            var nh = ((hue % 360) + 360) % 360;
            if (nh >= 78 && nh <= 165) { nh = 190; sat = 100; lit = 50; }
            var ss = Math.max(0, Math.min(1, sat / 100)), ll = Math.max(0, Math.min(1, lit / 100));
            var cc = (1 - Math.abs(2 * ll - 1)) * ss, xx = cc * (1 - Math.abs((nh / 60) % 2 - 1)), mm = ll - cc / 2;
            var rp = 0, gp = 0, bp = 0;
            if (nh < 60) { rp = cc; gp = xx; }
            else if (nh < 120) { rp = xx; gp = cc; }
            else if (nh < 180) { gp = cc; bp = xx; }
            else if (nh < 240) { gp = xx; bp = cc; }
            else if (nh < 300) { rp = xx; bp = cc; }
            else { rp = cc; bp = xx; }
            return G._blendGS((rp + mm) * 255, (gp + mm) * 255, (bp + mm) * 255, hea);
          }
          return '#00E5FF';
        }
        if (s.charAt(0) === '#') {
          var hex = s.slice(1);
          var rH = 0, gH = 0, bH = 0, aH = 1, parsedHex = false;
          if (hex.length === 3 || hex.length === 4) {
            rH = parseInt(hex[0] + hex[0], 16);
            gH = parseInt(hex[1] + hex[1], 16);
            bH = parseInt(hex[2] + hex[2], 16);
            aH = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
            parsedHex = true;
          } else if (hex.length === 6 || hex.length === 8) {
            rH = parseInt(hex.slice(0, 2), 16);
            gH = parseInt(hex.slice(2, 4), 16);
            bH = parseInt(hex.slice(4, 6), 16);
            aH = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
            parsedHex = true;
          }
          if (parsedHex && !isNaN(rH) && !isNaN(gH) && !isNaN(bH)) {
            var eaHex = Math.max(0, Math.min(1, (isNaN(aH) ? 1 : aH) * gsA));
            return G._blendGS(rH, gH, bH, eaHex);
          }
        }
        if (__bigmaNamedRGB[s]) {
          var nc = __bigmaNamedRGB[s];
          return G._blendGS(nc[0], nc[1], nc[2], gsA);
        }
        return gsA < 0.16 ? 'rgba(0,0,0,0)' : c;
      },
      grad: function(c1, c2, c3, x0, y0, x1, y1) {
        var gx0 = x0, gy0 = y0, gx1 = x1, gy1 = y1, mid = c3;
        if (typeof c3 === 'number') { gx0 = c3; gy0 = x0; gx1 = y0; gy1 = x1; mid = null; }
        if (typeof gx0 !== 'number' || !isFinite(gx0)) gx0 = -100;
        if (typeof gy0 !== 'number' || !isFinite(gy0)) gy0 = -100;
        if (typeof gx1 !== 'number' || !isFinite(gx1)) gx1 = 100;
        if (typeof gy1 !== 'number' || !isFinite(gy1)) gy1 = 100;
        if (gx0 === gx1 && gy0 === gy1) { gx1 = gx0 + 1; gy1 = gy0 + 1; }
        var g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        var sc1 = G._c(c1 || '#ffffff'), sc2 = G._c(c2 || c1 || '#888888');
        g.addColorStop(0, sc1);
        if (mid) { g.addColorStop(0.52, sc2); g.addColorStop(1, G._c(mid)); }
        else { g.addColorStop(1, sc2); }
        return g;
      },
      box: function(x, y, bw, bh, r, fill, rim, lw) {
        x = G._n(x); y = G._n(y);
        bw = Math.max(1, Math.abs(G._n(bw, 1))); bh = Math.max(1, Math.abs(G._n(bh, 1)));
        var rr = Math.min(Math.max(0, G._n(r, 0)), bw * 0.49, bh * 0.49);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, rr);
        else ctx.rect(x - bw / 2, y - bh / 2, bw, bh);
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      bar: function(x, yBase, bw, bh, r, fill, rim, lw) {
        x = G._n(x); yBase = G._n(yBase);
        bw = Math.max(1, Math.abs(G._n(bw, 1))); bh = Math.max(1, Math.abs(G._n(bh, 1)));
        G.box(x, yBase - bh * 0.5, bw, bh, r, fill, rim, lw);
      },
      capsule: function(x, y, bw, bh, fill, rim, lw) {
        bw = Math.max(1, Math.abs(G._n(bw, 1))); bh = Math.max(1, Math.abs(G._n(bh, 1)));
        G.box(x, y, bw, bh, Math.min(bw, bh) * 0.5, fill, rim, lw);
      },
      disc: function(x, y, r, fill, rim, lw) {
        x = G._n(x); y = G._n(y); r = Math.max(0.5, Math.abs(G._n(r, 1)));
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      oval: function(x, y, rx, ry, rot, fill, rim, lw) {
        if (typeof rot === 'string' || (rot && typeof rot === 'object')) { lw = rim; rim = fill; fill = rot; rot = 0; }
        x = G._n(x); y = G._n(y);
        rx = Math.max(0.5, Math.abs(G._n(rx, 1))); ry = Math.max(0.5, Math.abs(G._n(ry, rx)));
        ctx.beginPath();
        if (ctx.ellipse) ctx.ellipse(x, y, rx, ry, G._n(rot, 0), 0, Math.PI * 2);
        else ctx.arc(x, y, (rx + ry) * 0.5, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      ring: function(x, y, r, thick, a0, a1, col) {
        x = G._n(x); y = G._n(y); r = Math.max(0.5, Math.abs(G._n(r, 1)));
        ctx.beginPath(); ctx.arc(x, y, r, a0 != null ? G._n(a0) : 0, a1 != null ? G._n(a1, Math.PI * 2) : Math.PI * 2);
        ctx.strokeStyle = G._c(col || '#ffffff'); ctx.lineWidth = Math.max(1, Math.abs(G._n(thick, 2))); ctx.stroke();
      },
      poly: function(pts, fill, rim, lw, close) {
        if (!pts || pts.length < 2) return;
        ctx.beginPath(); ctx.moveTo(G._n(pts[0][0]), G._n(pts[0][1]));
        for (var i = 1; i < pts.length; i++) ctx.lineTo(G._n(pts[i][0]), G._n(pts[i][1]));
        if (close !== false) ctx.closePath();
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      ngon: function(x, y, r, n, rot, fill, rim, lw) {
        if (typeof rot === 'string' || (rot && typeof rot === 'object')) { lw = rim; rim = fill; fill = rot; rot = -Math.PI / 2; }
        x = G._n(x); y = G._n(y); r = Math.max(1, Math.abs(G._n(r, 1))); n = Math.max(3, Math.floor(G._n(n, 6)));
        var a0 = (typeof rot === 'number' && isFinite(rot)) ? rot : -Math.PI / 2, pts = [];
        for (var i = 0; i < n; i++) { var a = a0 + (i * Math.PI * 2) / n; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
        G.poly(pts, fill, rim, lw, true);
      },
      star: function(x, y, ro, ri, n, rot, fill, rim, lw) {
        if (typeof rot === 'string' || (rot && typeof rot === 'object')) { lw = rim; rim = fill; fill = rot; rot = -Math.PI / 2; }
        x = G._n(x); y = G._n(y); ro = Math.max(1, Math.abs(G._n(ro, 1))); ri = Math.max(0.5, Math.abs(G._n(ri, ro * 0.45))); n = Math.max(3, Math.floor(G._n(n, 5)));
        var a0 = (typeof rot === 'number' && isFinite(rot)) ? rot : -Math.PI / 2, pts = [];
        for (var i = 0; i < n * 2; i++) { var rr = i % 2 === 0 ? ro : ri; var a = a0 + (i * Math.PI) / n; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
        G.poly(pts, fill, rim, lw, true);
      },
      pill: function(x1, y1, x2, y2, thick, col) {
        ctx.beginPath(); ctx.moveTo(G._n(x1), G._n(y1)); ctx.lineTo(G._n(x2), G._n(y2));
        ctx.strokeStyle = G._c(col || '#ffffff'); ctx.lineWidth = Math.max(1, Math.abs(G._n(thick, 4))); ctx.lineCap = 'round'; ctx.stroke();
      },
      arrow: function(x1, y1, x2, y2, thick, headLen, col) {
        x1 = G._n(x1); y1 = G._n(y1); x2 = G._n(x2); y2 = G._n(y2);
        var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
        if (len < 2) return;
        var ux = dx / len, uy = dy / len, hl = Math.min(len * 0.55, Math.max(6, Math.abs(G._n(headLen, 14))));
        var sw = Math.max(1.5, Math.abs(G._n(thick, 4))), sx2 = x2 - ux * hl * 0.72, sy2 = y2 - uy * hl * 0.72;
        G.pill(x1, y1, sx2, sy2, sw, col || '#ffffff');
        var px = -uy * hl * 0.55, py = ux * hl * 0.55, bx = x2 - ux * hl, by = y2 - uy * hl;
        G.poly([[x2, y2], [bx + px, by + py], [bx - px, by - py]], col || '#ffffff', null, 0, true);
      },
      person: function(x, y, s, bodyCol, headCol, rimCol) {
        x = G._n(x); y = G._n(y); s = Math.max(12, Math.abs(G._n(s, 40)));
        var lw = Math.max(1.2, s * 0.05);
        G.box(x, y + s * 0.34, s * 0.92, s * 0.56, s * 0.28, bodyCol || '#1e293b', rimCol || null, lw);
        G.disc(x, y - s * 0.24, s * 0.27, headCol || bodyCol || '#38bdf8', rimCol || null, lw);
      },
      check: function(x, y, s, thick, col) {
        x = G._n(x); y = G._n(y); s = Math.max(6, Math.abs(G._n(s, 14)));
        ctx.beginPath();
        ctx.moveTo(x - s * 0.42, y + s * 0.04);
        ctx.lineTo(x - s * 0.08, y + s * 0.38);
        ctx.lineTo(x + s * 0.48, y - s * 0.32);
        ctx.strokeStyle = G._c(col || '#ffffff');
        ctx.lineWidth = Math.max(1.5, Math.abs(G._n(thick, s * 0.22)));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      },
      pie: function(x, y, r, a0, sweep, sliceCol, baseCol, rimCol) {
        x = G._n(x); y = G._n(y); r = Math.max(2, Math.abs(G._n(r, 16)));
        G.disc(x, y, r, baseCol || '#334155', rimCol || '#ffffff', Math.max(1, r * 0.08));
        var sa = G._n(a0, -Math.PI / 2), sw = Math.max(0.25, Math.min(Math.PI * 1.92, Math.abs(G._n(sweep, Math.PI * 0.7))));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, Math.max(1, r - 1), sa, sa + sw);
        ctx.closePath();
        ctx.fillStyle = G._c(sliceCol || '#f43f5e');
        ctx.fill();
      },
      rays: function(x, y, rIn, rOut, n, rot, thick, col) {
        x = G._n(x); y = G._n(y);
        var ri = Math.max(1, Math.abs(G._n(rIn, 12))), ro = Math.max(ri + 2, Math.abs(G._n(rOut, 22)));
        var cnt = Math.max(3, Math.floor(G._n(n, 6))), a0 = G._n(rot, -Math.PI / 2);
        for (var i = 0; i < cnt; i++) {
          var a = a0 + (i * Math.PI * 2) / cnt;
          G.pill(x + Math.cos(a) * ri, y + Math.sin(a) * ri, x + Math.cos(a) * ro, y + Math.sin(a) * ro, thick || 3, col || '#ffd700');
        }
      },
      part: function(a1, a2, a3, a4, a5, a6) {
        var fn, tx, ty, rot, sx, sy;
        if (typeof a1 === 'function') { fn = a1; tx = a2; ty = a3; rot = a4; sx = a5; sy = a6; }
        else { tx = a1; ty = a2; rot = a3; sx = a4; sy = a5; fn = a6; }
        if (typeof fn !== 'function') return;
        ctx.save();
        try {
          ctx.translate(G._n(tx, 0), G._n(ty, 0));
          if (rot) ctx.rotate(G._n(rot, 0));
          if (sx != null || sy != null) {
            var vsx = G._n(sx, 1);
            ctx.scale(vsx, sy != null ? G._n(sy, vsx) : vsx);
          }
          var __partR = (typeof R !== 'undefined' && isFinite(R)) ? R : (typeof S !== 'undefined' && isFinite(S) ? S * 0.80 : 180);
          fn(__partR);
        } finally {
          ctx.restore();
        }
      },
      dome: function(x, y, bw, bh, fill, rim, lw) {
        x = G._n(x); y = G._n(y);
        bw = Math.max(4, Math.abs(G._n(bw, 40))); bh = Math.max(4, Math.abs(G._n(bh, 40)));
        var hx = bw / 2, hy = bh / 2, ar = Math.min(hx, bh * 0.65);
        ctx.beginPath();
        ctx.moveTo(x - hx, y + hy);
        ctx.lineTo(x - hx, y - hy + ar);
        ctx.quadraticCurveTo(x - hx, y - hy, x, y - hy);
        ctx.quadraticCurveTo(x + hx, y - hy, x + hx, y - hy + ar);
        ctx.lineTo(x + hx, y + hy);
        ctx.closePath();
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(1, G._n(lw, 2)); ctx.stroke(); }
      },
      wave: function(x, y, w, amp, freq, phase, th, col) {
        x = G._n(x); y = G._n(y);
        var ww = Math.max(8, Math.abs(G._n(w, 80))), aa = G._n(amp, 10), ff = G._n(freq, 2), ph = G._n(phase, 0);
        var steps = 28;
        ctx.beginPath();
        for (var i = 0; i <= steps; i++) {
          var p = i / steps;
          var px = x - ww / 2 + ww * p;
          var py = y + Math.sin(p * Math.PI * 2 * ff + ph) * aa;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = G._c(col || '#00e5ff');
        ctx.lineWidth = Math.max(1.5, Math.abs(G._n(th, 3)));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      },
      grid: function(x, y, bw, bh, cols, rows, r, actIdx, fill, actFill, rim, lw) {
        x = G._n(x); y = G._n(y);
        bw = Math.max(12, Math.abs(G._n(bw, 60))); bh = Math.max(12, Math.abs(G._n(bh, 60)));
        var cCnt = Math.max(1, Math.min(8, Math.floor(G._n(cols, 3))));
        var rCnt = Math.max(1, Math.min(8, Math.floor(G._n(rows, 3))));
        var gapX = bw * 0.08, gapY = bh * 0.08;
        var cw = (bw - gapX * (cCnt - 1)) / cCnt;
        var ch = (bh - gapY * (rCnt - 1)) / rCnt;
        var cr = Math.min(Math.max(1, G._n(r, 3)), cw * 0.45, ch * 0.45);
        var act = (actIdx == null || actIdx < 0) ? -1 : Math.floor(G._n(actIdx, -1)) % (cCnt * rCnt);
        var x0 = x - bw / 2 + cw / 2, y0 = y - bh / 2 + ch / 2;
        for (var rr = 0; rr < rCnt; rr++) {
          for (var cc = 0; cc < cCnt; cc++) {
            var idx = rr * cCnt + cc;
            var cxCell = x0 + cc * (cw + gapX);
            var cyCell = y0 + rr * (ch + gapY);
            var cellCol = (idx === act && actFill) ? actFill : (fill || '#334155');
            G.box(cxCell, cyCell, cw, ch, cr, cellCol, rim || null, lw || 0);
          }
        }
      },
      bolt: function(x, y, s, fill, rim, lw) {
        x = G._n(x); y = G._n(y); s = Math.max(6, Math.abs(G._n(s, 30)));
        var pts = [
          [x + s * 0.12, y - s * 0.56],
          [x - s * 0.34, y + s * 0.06],
          [x - s * 0.02, y + s * 0.06],
          [x - s * 0.16, y + s * 0.56],
          [x + s * 0.36, y - s * 0.08],
          [x + s * 0.04, y - s * 0.08]
        ];
        G.poly(pts, fill || '#ffd700', rim || null, lw || 0, true);
      },
      cross: function(x, y, s, th, fill, rim, lw) {
        x = G._n(x); y = G._n(y); s = Math.max(6, Math.abs(G._n(s, 28)));
        var arm = s * 0.5, armTh = Math.max(2, Math.min(arm * 1.4, Math.abs(G._n(th, s * 0.34))));
        var hT = armTh / 2;
        var pts = [
          [x - hT, y - arm], [x + hT, y - arm], [x + hT, y - hT],
          [x + arm, y - hT], [x + arm, y + hT], [x + hT, y + hT],
          [x + hT, y + arm], [x - hT, y + arm], [x - hT, y + hT],
          [x - arm, y + hT], [x - arm, y - hT], [x - hT, y - hT]
        ];
        G.poly(pts, fill || '#f43f5e', rim || null, lw || 0, true);
      },
      leaf: function(x, y, s, rot, fill, rim, lw) {
        x = G._n(x); y = G._n(y); s = Math.max(6, Math.abs(G._n(s, 28)));
        ctx.save();
        ctx.translate(x, y);
        if (rot) ctx.rotate(G._n(rot, 0));
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.58);
        ctx.quadraticCurveTo(s * 0.52, -s * 0.16, 0, s * 0.54);
        ctx.quadraticCurveTo(-s * 0.52, -s * 0.16, 0, -s * 0.58);
        ctx.closePath();
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(1, G._n(lw, 2)); ctx.stroke(); }
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.34);
        ctx.lineTo(0, s * 0.44);
        ctx.strokeStyle = G._c(rim || '#f8fafc');
        ctx.lineWidth = Math.max(1, s * 0.07);
        ctx.stroke();
        ctx.restore();
      },
      bgBackdrop: function(w, h, c0, c1, c2, dir) {
        var ww = Math.max(1, G._n(w, 800)), hh = Math.max(1, G._n(h, 600));
        var d = String(dir || 'v');
        var g;
        if (d === 'r') {
          g = ctx.createRadialGradient(ww * 0.5, hh * 0.5, 0, ww * 0.5, hh * 0.5, Math.max(ww, hh) * 0.65);
        } else if (d === 'h') {
          g = ctx.createLinearGradient(0, 0, ww, 0);
        } else if (d === 'd') {
          g = ctx.createLinearGradient(0, 0, ww, hh);
        } else {
          g = ctx.createLinearGradient(0, 0, 0, hh);
        }
        g.addColorStop(0, G._c(c0 || '#080c14'));
        g.addColorStop(0.55, G._c(c1 || '#1e1b4b'));
        g.addColorStop(1, G._c(c2 || c0 || '#0f172a'));
        __bigmaBgActive = true;
        try {
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, ww, hh);
        } finally {
          __bigmaBgActive = false;
        }
      },
      trap: function(x, y, tw, bw, h, r, fill, rim, lw) {
        x = G._n(x); y = G._n(y);
        var utw = Math.max(2, Math.abs(G._n(tw, 40))), ubw = Math.max(2, Math.abs(G._n(bw, 60))), hh = Math.max(2, Math.abs(G._n(h, 40)));
        var hxT = utw * 0.5, hxB = ubw * 0.5, hy = hh * 0.5;
        var cr = Math.min(Math.max(0, G._n(r, 0)), hxT * 0.45, hxB * 0.45, hy * 0.45);
        ctx.beginPath();
        if (cr <= 0.5) {
          ctx.moveTo(x - hxT, y - hy); ctx.lineTo(x + hxT, y - hy);
          ctx.lineTo(x + hxB, y + hy); ctx.lineTo(x - hxB, y + hy);
        } else {
          ctx.moveTo(x - hxT + cr, y - hy);
          ctx.lineTo(x + hxT - cr, y - hy);
          ctx.quadraticCurveTo(x + hxT, y - hy, x + hxT + (hxB - hxT) * (cr / hh), y - hy + cr);
          ctx.lineTo(x + hxB - (hxB - hxT) * (cr / hh), y + hy - cr);
          ctx.quadraticCurveTo(x + hxB, y + hy, x + hxB - cr, y + hy);
          ctx.lineTo(x - hxB + cr, y + hy);
          ctx.quadraticCurveTo(x - hxB, y + hy, x - hxB + (hxB - hxT) * (cr / hh), y + hy - cr);
          ctx.lineTo(x - hxT - (hxB - hxT) * (cr / hh), y - hy + cr);
          ctx.quadraticCurveTo(x - hxT, y - hy, x - hxT + cr, y - hy);
        }
        ctx.closePath();
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.8, G._n(lw, 1.8)); ctx.stroke(); }
      },
      uArc: function(x, y, bw, bh, th, dir, col) {
        x = G._n(x); y = G._n(y);
        var w2 = Math.max(4, Math.abs(G._n(bw, 40))), h2 = Math.max(4, Math.abs(G._n(bh, 40)));
        var d = String(dir || 'd').toLowerCase(), hw = w2 * 0.5, hh = h2 * 0.5;
        ctx.beginPath();
        if (d === 'd') {
          var rad = Math.min(hw, h2 * 0.65);
          ctx.moveTo(x - hw, y + hh); ctx.lineTo(x - hw, y - hh + rad);
          ctx.arc(x, y - hh + rad, hw, Math.PI, 0, false);
          ctx.lineTo(x + hw, y + hh);
        } else if (d === 'u') {
          var radU = Math.min(hw, h2 * 0.65);
          ctx.moveTo(x - hw, y - hh); ctx.lineTo(x - hw, y + hh - radU);
          ctx.arc(x, y + hh - radU, hw, Math.PI, 0, true);
          ctx.lineTo(x + hw, y - hh);
        } else if (d === 'r') {
          var radR = Math.min(hh, w2 * 0.65);
          ctx.moveTo(x - hw, y - hh); ctx.lineTo(x + hw - radR, y - hh);
          ctx.arc(x + hw - radR, y, hh, -Math.PI * 0.5, Math.PI * 0.5, false);
          ctx.lineTo(x - hw, y + hh);
        } else {
          var radL = Math.min(hh, w2 * 0.65);
          ctx.moveTo(x + hw, y - hh); ctx.lineTo(x - hw + radL, y - hh);
          ctx.arc(x - hw + radL, y, hh, -Math.PI * 0.5, Math.PI * 0.5, true);
          ctx.lineTo(x + hw, y + hh);
        }
        ctx.strokeStyle = G._c(col || '#f8fafc');
        ctx.lineWidth = Math.max(1.5, Math.abs(G._n(th, 5)));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      },
      crest: function(x, y, bw, bh, fill, rim, lw) {
        x = G._n(x); y = G._n(y);
        var hw = Math.max(4, Math.abs(G._n(bw, 56))) * 0.5, hh = Math.max(4, Math.abs(G._n(bh, 68))) * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y - hh);
        ctx.quadraticCurveTo(x + hw * 0.55, y - hh * 0.92, x + hw, y - hh * 0.68);
        ctx.lineTo(x + hw * 0.92, y + hh * 0.10);
        ctx.quadraticCurveTo(x + hw * 0.72, y + hh * 0.70, x, y + hh);
        ctx.quadraticCurveTo(x - hw * 0.72, y + hh * 0.70, x - hw * 0.92, y + hh * 0.10);
        ctx.lineTo(x - hw, y - hh * 0.68);
        ctx.quadraticCurveTo(x - hw * 0.55, y - hh * 0.92, x, y - hh);
        ctx.closePath();
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(1, G._n(lw, 2)); ctx.stroke(); }
      },
      cloudShape: function(x, y, bw, bh, fill, rim, lw) {
        x = G._n(x); y = G._n(y);
        var w2 = Math.max(12, Math.abs(G._n(bw, 76))), h2 = Math.max(8, Math.abs(G._n(bh, 48)));
        var hw = w2 * 0.5, bot = y + h2 * 0.45, top = y - h2 * 0.52;
        ctx.beginPath();
        ctx.moveTo(x - hw * 0.56, bot);
        ctx.bezierCurveTo(x - hw * 1.02, bot, x - hw * 1.02, y - h2 * 0.12, x - hw * 0.52, y - h2 * 0.12);
        ctx.bezierCurveTo(x - hw * 0.42, top, x + hw * 0.24, top - h2 * 0.06, x + hw * 0.32, y - h2 * 0.18);
        ctx.bezierCurveTo(x + hw * 0.98, y - h2 * 0.24, x + hw * 1.00, bot, x + hw * 0.56, bot);
        ctx.closePath();
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(1, G._n(lw, 2)); ctx.stroke(); }
      },
      gearWheel: function(x, y, r, teeth, rot, fill, holeCol, rim, lw) {
        x = G._n(x); y = G._n(y);
        var ro = Math.max(6, Math.abs(G._n(r, 26))), ri = ro * 0.77;
        var cnt = Math.max(5, Math.min(16, Math.floor(G._n(teeth, 8))));
        var a0 = G._n(rot, 0), step = (Math.PI * 2) / cnt;
        ctx.beginPath();
        for (var gi = 0; gi < cnt; gi++) {
          var ba = a0 + gi * step;
          var a1 = ba + step * 0.12, a2 = ba + step * 0.36, a3 = ba + step * 0.52, a4 = ba + step * 0.78;
          var p0x = x + Math.cos(ba) * ri, p0y = y + Math.sin(ba) * ri;
          if (gi === 0) ctx.moveTo(p0x, p0y); else ctx.lineTo(p0x, p0y);
          ctx.lineTo(x + Math.cos(a1) * ro, y + Math.sin(a1) * ro);
          ctx.lineTo(x + Math.cos(a2) * ro, y + Math.sin(a2) * ro);
          ctx.lineTo(x + Math.cos(a3) * ri, y + Math.sin(a3) * ri);
          ctx.lineTo(x + Math.cos(a4) * ri, y + Math.sin(a4) * ri);
        }
        ctx.closePath();
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(1, G._n(lw, 2)); ctx.stroke(); }
        if (holeCol !== false) {
          G.disc(x, y, ro * 0.33, holeCol || '#0f172a', rim || null, Math.max(1, G._n(lw, 2) * 0.85));
        }
      },
      heartShape: function(x, y, s, fill, rim, lw) {
        x = G._n(x); y = G._n(y);
        var hs = Math.max(8, Math.abs(G._n(s, 42)));
        ctx.beginPath();
        ctx.moveTo(x, y + hs * 0.44);
        ctx.bezierCurveTo(x - hs * 0.62, y + hs * 0.04, x - hs * 0.56, y - hs * 0.48, x, y - hs * 0.18);
        ctx.bezierCurveTo(x + hs * 0.56, y - hs * 0.48, x + hs * 0.62, y + hs * 0.04, x, y + hs * 0.44);
        ctx.closePath();
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(1, G._n(lw, 2)); ctx.stroke(); }
      },
      dropShape: function(x, y, s, rot, fill, rim, lw) {
        x = G._n(x); y = G._n(y);
        var ds = Math.max(6, Math.abs(G._n(s, 36)));
        ctx.save();
        ctx.translate(x, y);
        if (rot) ctx.rotate(G._n(rot, 0));
        ctx.beginPath();
        ctx.moveTo(0, -ds * 0.54);
        ctx.bezierCurveTo(ds * 0.46, -ds * 0.02, ds * 0.44, ds * 0.48, 0, ds * 0.48);
        ctx.bezierCurveTo(-ds * 0.44, ds * 0.48, -ds * 0.46, -ds * 0.02, 0, -ds * 0.54);
        ctx.closePath();
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(1, G._n(lw, 2)); ctx.stroke(); }
        ctx.restore();
      },
      curveArc: function(x1, y1, cx1, cy1, x2, y2, th, col) {
        ctx.beginPath();
        ctx.moveTo(G._n(x1), G._n(y1));
        ctx.quadraticCurveTo(G._n(cx1), G._n(cy1), G._n(x2), G._n(y2));
        ctx.strokeStyle = G._c(col || '#f8fafc');
        ctx.lineWidth = Math.max(1.5, Math.abs(G._n(th, 4)));
        ctx.lineCap = 'round';
        ctx.stroke();
      },
      sheen: function() {},
`;

export const ENGINE_HERO_ICONS_A_JS = `
      uiLayout: function(x, y, s, frameCol, headerCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var fc = frameCol || '#1e293b', hc = headerCol || '#4f46e5', ac = accentCol || '#00e5ff';
        if (vv === 1) {
          G.box(x, y, s * 0.60, s * 0.96, s * 0.12, fc, rim, lw);
          G.box(x, y - s * 0.28, s * 0.46, s * 0.22, s * 0.05, hc, null, 0);
          G.capsule(x, y - s * 0.42, s * 0.16, s * 0.03, '#64748b', null, 0);
          G.box(x - s * 0.12, y + s * 0.02, s * 0.20, s * 0.22, s * 0.04, ac, null, 0);
          G.box(x + s * 0.12, y + s * 0.02, s * 0.20, s * 0.22, s * 0.04, '#38bdf8', null, 0);
          G.capsule(x, y + s * 0.28, s * (0.34 + 0.06 * Math.sin(tt * 2.4)), s * 0.11, '#ffd700', null, 0);
        } else if (vv === 2) {
          G.box(x - s * 0.14, y - s * 0.08, s * 0.72, s * 0.56, s * 0.08, fc, rim, lw);
          G.box(x - s * 0.14, y - s * 0.27, s * 0.66, s * 0.11, s * 0.03, hc, null, 0);
          G.box(x + s * 0.12, y + s * 0.10, s * 0.68, s * 0.52, s * 0.08, '#0f172a', ac, lw);
          G.bar(x - s * 0.04, y + s * 0.24, s * 0.11, s * (0.14 + 0.06 * Math.sin(tt * 2.6)), s * 0.02, ac, null, 0);
          G.bar(x + s * 0.11, y + s * 0.24, s * 0.11, s * (0.24 + 0.05 * Math.sin(tt * 2.6 - 0.8)), s * 0.02, '#ffd700', null, 0);
          G.bar(x + s * 0.26, y + s * 0.24, s * 0.11, s * (0.18 + 0.06 * Math.sin(tt * 2.6 - 1.5)), s * 0.02, '#f97316', null, 0);
        } else if (vv === 3) {
          G.box(x, y, s * 0.96, s * 0.72, s * 0.09, fc, rim, lw);
          for (var ki = 0; ki < 3; ki++) {
            var kx = x + (ki - 1) * s * 0.28;
            G.box(kx, y, s * 0.22, s * 0.52, s * 0.04, '#0f172a', null, 0);
            G.box(kx, y - s * 0.12 + Math.sin(tt * 2.2 + ki) * s * 0.03, s * 0.16, s * 0.14, s * 0.03, ki === 0 ? ac : ki === 1 ? '#ffd700' : '#f43f5e', null, 0);
            G.box(kx, y + s * 0.12, s * 0.16, s * 0.14, s * 0.03, hc, null, 0);
          }
        } else if (vv === 4) {
          G.box(x, y, s * 0.86, s * 0.82, s * 0.10, fc, rim, lw);
          G.box(x - s * 0.26, y, s * 0.20, s * 0.64, s * 0.05, hc, null, 0);
          G.disc(x + s * 0.12, y - s * 0.12, s * 0.16, '#0f172a', ac, lw * 0.7);
          G.ring(x + s * 0.12, y - s * 0.12, s * 0.16, s * 0.04, -Math.PI / 2, -Math.PI / 2 + Math.PI * (1.1 + 0.3 * Math.sin(tt * 2.2)), '#ffd700');
          G.pill(x - s * 0.06, y + s * 0.18, x + s * 0.30, y + s * 0.18, s * 0.055, ac);
          G.pill(x - s * 0.06, y + s * 0.30, x + s * 0.20, y + s * 0.30, s * 0.05, '#38bdf8');
        } else if (vv === 5) {
          G.box(x - s * 0.08, y - s * 0.06, s * 0.80, s * 0.64, s * 0.09, fc, rim, lw);
          G.box(x - s * 0.08, y - s * 0.27, s * 0.74, s * 0.12, s * 0.04, hc, null, 0);
          G.pill(x - s * 0.32, y - s * 0.04, x + s * 0.14, y - s * 0.04, s * 0.06, ac);
          G.pill(x - s * 0.32, y + s * 0.10, x + s * 0.04, y + s * 0.10, s * 0.055, '#ffd700');
          G.box(x + s * 0.24, y + s * 0.06, s * 0.42, s * 0.64, s * 0.09, '#0f172a', rim, lw);
          G.box(x + s * 0.24, y - s * 0.08, s * 0.28, s * 0.18, s * 0.04, ac, null, 0);
          G.capsule(x + s * 0.24, y + s * 0.18, s * (0.24 + 0.04 * Math.sin(tt * 2.6)), s * 0.09, '#ffd700', null, 0);
        } else {
          G.box(x, y, s * 0.96, s * 0.74, s * 0.08, fc, rim, lw);
          G.box(x, y - s * 0.25, s * 0.90, s * 0.14, s * 0.04, hc, null, 0);
          G.disc(x - s * 0.34, y - s * 0.25, s * 0.032, '#f43f5e', null, 0);
          G.disc(x - s * 0.24, y - s * 0.25, s * 0.032, '#ffd700', null, 0);
          G.disc(x - s * 0.14, y - s * 0.25, s * 0.032, ac, null, 0);
          var sb = 0.26 + 0.06 * Math.sin(tt * 2.4);
          G.box(x - s * 0.26, y + s * 0.10, s * sb, s * 0.38, s * 0.04, '#0f172a', ac, lw * 0.7);
          G.box(x + s * 0.14, y + s * 0.02, s * 0.46, s * 0.16, s * 0.04, ac, null, 0);
          G.box(x + s * 0.04, y + s * 0.22, s * 0.22, s * 0.14, s * 0.035, '#38bdf8', null, 0);
          G.box(x + s * 0.28, y + s * 0.22, s * 0.18, s * 0.14, s * 0.035, '#ffd700', null, 0);
        }
      },
      videoCall: function(x, y, s, frameCol, tileCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var fc = frameCol || '#1e293b', tc = tileCol || '#0f172a', ac = accentCol || '#00e5ff';
        if (vv === 1) {
          G.box(x, y, s * 0.58, s * 0.94, s * 0.12, fc, rim, lw);
          G.box(x, y - s * 0.04, s * 0.46, s * 0.66, s * 0.07, tc, ac, lw * 0.7);
          G.person(x, y, s * 0.34, '#4f46e5', '#f8fafc', rim);
          G.disc(x + s * 0.15, y - s * 0.22, s * 0.08, '#f43f5e', rim, lw * 0.6);
          G.capsule(x, y + s * 0.37, s * 0.24, s * 0.08, '#f43f5e', rim, lw * 0.6);
        } else if (vv === 2) {
          G.box(x, y - s * 0.05, s * 0.98, s * 0.70, s * 0.09, fc, rim, lw);
          G.box(x, y - s * 0.05, s * 0.86, s * 0.56, s * 0.05, tc, null, 0);
          G.person(x - s * 0.20, y - s * 0.14, s * 0.22, '#4f46e5', '#f8fafc', rim);
          G.person(x + s * 0.20, y - s * 0.14, s * 0.22, ac, '#f8fafc', rim);
          G.person(x - s * 0.20, y + s * 0.12, s * 0.22, '#38bdf8', '#f8fafc', rim);
          G.person(x + s * 0.20, y + s * 0.12, s * 0.22, '#f97316', '#f8fafc', rim);
          G.box(x, y + s * 0.38, s * 0.34, s * 0.08, s * 0.03, rim, null, 0);
        } else if (vv === 3) {
          G.disc(x, y, s * 0.44, fc, rim, lw);
          G.ring(x, y, s * 0.38, s * 0.04, tt * 0.8, tt * 0.8 + Math.PI * 1.4, ac);
          G.person(x - s * 0.16, y + s * 0.04, s * 0.26, '#4f46e5', '#f8fafc', rim);
          G.person(x + s * 0.16, y + s * 0.04, s * 0.26, '#0284c7', '#f8fafc', rim);
          G.disc(x, y - s * 0.26, s * 0.09, '#ffd700', rim, lw * 0.6);
        } else if (vv === 4) {
          G.box(x, y, s * 0.98, s * 0.72, s * 0.09, fc, rim, lw);
          G.box(x - s * 0.14, y, s * 0.58, s * 0.54, s * 0.05, tc, ac, lw * 0.7);
          G.person(x - s * 0.14, y + s * 0.03, s * 0.38, '#4f46e5', '#f8fafc', rim);
          G.box(x + s * 0.30, y - s * 0.14, s * 0.22, s * 0.22, s * 0.04, '#1e293b', rim, lw * 0.6);
          G.person(x + s * 0.30, y - s * 0.12, s * 0.16, ac, '#f8fafc', null);
          G.box(x + s * 0.30, y + s * 0.14, s * 0.22, s * 0.22, s * 0.04, '#1e293b', rim, lw * 0.6);
          G.person(x + s * 0.30, y + s * 0.16, s * 0.16, '#ffd700', '#f8fafc', null);
        } else if (vv === 5) {
          G.box(x, y - s * 0.05, s * 0.96, s * 0.70, s * 0.09, fc, rim, lw);
          G.box(x, y - s * 0.05, s * 0.84, s * 0.56, s * 0.05, tc, null, 0);
          G.person(x - s * 0.12, y - s * 0.02, s * 0.38, '#4f46e5', '#f8fafc', rim);
          for (var wb = 0; wb < 3; wb++) {
            G.bar(x + s * (0.14 + wb * 0.08), y + s * 0.12, s * 0.05, s * (0.12 + 0.10 * Math.abs(Math.sin(tt * 3.5 + wb))), s * 0.02, ac, null, 0);
          }
          G.capsule(x, y + s * 0.37, s * 0.34, s * 0.09, rim, null, 0);
        } else {
          G.box(x, y - s * 0.06, s * 1.00, s * 0.70, s * 0.09, fc, rim, lw);
          G.box(x, y - s * 0.06, s * 0.88, s * 0.56, s * 0.05, tc, null, 0);
          G.box(x - s * 0.21, y - s * 0.06, s * 0.38, s * 0.44, s * 0.05, '#1e293b', ac, lw * 0.75);
          G.person(x - s * 0.21, y - s * 0.03, s * 0.28, '#4f46e5', '#f8fafc', rim);
          G.box(x + s * 0.22, y - s * 0.06, s * 0.38, s * 0.44, s * 0.05, '#1e293b', '#38bdf8', lw * 0.75);
          G.person(x + s * 0.22, y - s * 0.03, s * 0.28, ac, '#f8fafc', rim);
          G.disc(x + s * 0.35, y - s * 0.24, s * (0.045 + 0.015 * Math.sin(tt * 4)), '#f43f5e', null, 0);
          G.box(x, y + s * 0.36, s * 0.18, s * 0.14, s * 0.02, fc, rim, lw * 0.8);
          G.capsule(x, y + s * 0.43, s * 0.42, s * 0.09, rim, null, 0);
        }
      },
      laptop: function(x, y, s, bodyCol, screenCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#1e293b', sc = screenCol || '#0f172a', ac = accentCol || '#00e5ff';
        if (vv === 1) {
          G.box(x, y - s * 0.05, s * 0.88, s * 0.58, s * 0.07, bc, rim, lw);
          G.box(x, y - s * 0.05, s * 0.76, s * 0.46, s * 0.04, sc, null, 0);
          G.pie(x - s * 0.16, y - s * 0.05, s * 0.16, -Math.PI / 2, Math.PI * (0.9 + 0.3 * Math.sin(tt * 2.2)), '#ffd700', '#4f46e5', rim);
          G.pill(x + s * 0.08, y - s * 0.13, x + s * 0.30, y - s * 0.13, s * 0.045, ac);
          G.pill(x + s * 0.08, y, x + s * 0.26, y, s * 0.045, '#38bdf8');
          G.capsule(x, y + s * 0.30, s * 1.04, s * 0.11, bc, rim, lw);
        } else if (vv === 2) {
          G.box(x, y - s * 0.05, s * 0.88, s * 0.58, s * 0.07, bc, rim, lw);
          G.box(x, y - s * 0.05, s * 0.76, s * 0.46, s * 0.04, sc, null, 0);
          G.pill(x - s * 0.28, y - s * 0.16, x + s * (0.04 + 0.14 * Math.sin(tt * 2.5)), y - s * 0.16, s * 0.048, ac);
          G.pill(x - s * 0.20, y - s * 0.04, x + s * 0.26, y - s * 0.04, s * 0.048, '#ffd700');
          G.pill(x - s * 0.28, y + s * 0.08, x + s * 0.16, y + s * 0.08, s * 0.048, '#f43f5e');
          G.capsule(x, y + s * 0.30, s * 1.04, s * 0.11, bc, rim, lw);
        } else if (vv === 3) {
          G.box(x, y - s * 0.06, s * 0.94, s * 0.62, s * 0.07, bc, rim, lw);
          G.box(x, y - s * 0.06, s * 0.82, s * 0.50, s * 0.04, sc, null, 0);
          G.bar(x - s * 0.20, y + s * 0.10, s * 0.12, s * (0.18 + 0.05 * Math.sin(tt * 2.5)), s * 0.02, '#4f46e5', null, 0);
          G.bar(x, y + s * 0.10, s * 0.12, s * (0.28 + 0.05 * Math.sin(tt * 2.5 - 0.8)), s * 0.02, ac, null, 0);
          G.bar(x + s * 0.20, y + s * 0.10, s * 0.12, s * (0.36 + 0.05 * Math.sin(tt * 2.5 - 1.5)), s * 0.02, '#ffd700', null, 0);
          G.box(x, y + s * 0.31, s * 0.18, s * 0.14, s * 0.02, bc, rim, lw * 0.8);
          G.capsule(x, y + s * 0.40, s * 0.46, s * 0.09, rim, null, 0);
        } else if (vv === 4) {
          G.box(x, y, s * 0.72, s * 0.92, s * 0.11, bc, rim, lw);
          G.box(x, y, s * 0.60, s * 0.78, s * 0.07, sc, null, 0);
          G.disc(x, y - s * 0.06, s * 0.18, '#4f46e5', ac, lw * 0.8);
          G.check(x, y - s * 0.06, s * 0.16, s * 0.04, '#ffd700');
          G.pill(x - s * 0.18, y + s * 0.24, x + s * 0.18, y + s * 0.24, s * 0.05, ac);
        } else if (vv === 5) {
          G.box(x, y - s * 0.05, s * 0.88, s * 0.58, s * 0.07, bc, rim, lw);
          G.box(x, y - s * 0.05, s * 0.76, s * 0.46, s * 0.04, sc, null, 0);
          G.box(x, y - s * 0.12 + Math.sin(tt * 2.4) * s * 0.03, s * 0.34, s * 0.26, s * 0.05, '#4f46e5', rim, lw * 0.7);
          G.check(x, y - s * 0.12 + Math.sin(tt * 2.4) * s * 0.03, s * 0.15, s * 0.04, '#ffd700');
          G.capsule(x, y + s * 0.30, s * 1.04, s * 0.11, bc, rim, lw);
        } else {
          G.box(x, y - s * 0.05, s * 0.88, s * 0.58, s * 0.07, bc, rim, lw);
          G.box(x, y - s * 0.05, s * 0.76, s * 0.46, s * 0.04, sc, null, 0);
          G.bar(x - s * 0.18, y + s * 0.11, s * 0.11, s * (0.18 + 0.05 * Math.sin(tt * 2.6)), s * 0.02, '#4f46e5', null, 0);
          G.bar(x, y + s * 0.11, s * 0.11, s * (0.28 + 0.05 * Math.sin(tt * 2.6 - 0.8)), s * 0.02, ac, null, 0);
          G.bar(x + s * 0.18, y + s * 0.11, s * 0.11, s * (0.34 + 0.05 * Math.sin(tt * 2.6 - 1.5)), s * 0.02, '#ffd700', null, 0);
          G.capsule(x, y + s * 0.30, s * 1.04, s * 0.11, bc, rim, lw);
        }
      },
      checklist: function(x, y, s, boardCol, clipCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = boardCol || '#1e293b', cc = clipCol || '#4f46e5', ac = accentCol || '#00e5ff';
        if (vv === 1) {
          G.box(x, y, s * 0.86, s * 0.84, s * 0.10, bc, rim, lw);
          G.box(x, y - s * 0.25, s * 0.78, s * 0.16, s * 0.05, cc, null, 0);
          G.disc(x, y + s * 0.08, s * 0.22, '#0f172a', ac, lw * 0.85);
          G.check(x, y + s * 0.08, s * (0.20 + 0.03 * Math.sin(tt * 3.0)), s * 0.048, '#ffd700');
        } else if (vv === 2) {
          G.box(x, y, s * 0.96, s * 0.72, s * 0.09, bc, rim, lw);
          G.box(x - s * 0.27, y + s * 0.02, s * 0.24, s * 0.52, s * 0.05, '#0f172a', null, 0);
          G.box(x, y + s * 0.02, s * 0.24, s * 0.52, s * 0.05, '#0f172a', null, 0);
          G.box(x + s * 0.27, y + s * 0.02, s * 0.24, s * 0.52, s * 0.05, '#0f172a', null, 0);
          G.box(x - s * 0.27, y - s * 0.10, s * 0.18, s * 0.12, s * 0.03, ac, null, 0);
          G.box(x, y + s * 0.04 * Math.sin(tt * 2.4), s * 0.18, s * 0.14, s * 0.03, '#ffd700', null, 0);
          G.box(x + s * 0.27, y - s * 0.08, s * 0.18, s * 0.14, s * 0.03, '#f43f5e', null, 0);
        } else if (vv === 3) {
          G.ring(x, y, s * 0.42, s * 0.05, tt * 0.8, tt * 0.8 + Math.PI * 1.4, ac);
          G.disc(x, y, s * 0.34, bc, rim, lw);
          G.check(x, y, s * (0.30 + 0.04 * Math.sin(tt * 3.0)), s * 0.065, '#ffd700');
        } else if (vv === 4) {
          G.box(x - s * 0.10, y + s * 0.06, s * 0.62, s * 0.76, s * 0.08, '#0f172a', cc, lw * 0.85);
          G.box(x + s * 0.06, y, s * 0.64, s * 0.78, s * 0.08, bc, rim, lw);
          for (var c4 = 0; c4 < 3; c4++) {
            var y4 = y - s * 0.18 + c4 * s * 0.18;
            G.disc(x - s * 0.14, y4, s * 0.055, c4 === 2 ? '#ffd700' : ac, null, 0);
            G.pill(x - s * 0.03, y4, x + s * (0.14 + 0.07 * Math.sin(tt * 2.5 - c4)), y4, s * 0.048, '#f8fafc');
          }
        } else if (vv === 5) {
          G.box(x, y + s * 0.04, s * 0.72, s * 0.86, s * 0.09, bc, rim, lw);
          G.capsule(x, y - s * 0.39, s * 0.34, s * 0.12, cc, rim, lw * 0.8);
          G.box(x, y - s * 0.14, s * 0.50, s * 0.14, s * 0.04, '#0f172a', ac, lw * 0.6);
          G.box(x - s * 0.04, y - s * 0.14, s * (0.28 + 0.12 * Math.sin(tt * 2.2)), s * 0.08, s * 0.02, ac, null, 0);
          G.check(x - s * 0.16, y + s * 0.14, s * 0.14, s * 0.035, '#ffd700');
          G.pill(x - s * 0.02, y + s * 0.14, x + s * 0.24, y + s * 0.14, s * 0.05, '#f8fafc');
        } else {
          G.box(x, y + s * 0.04, s * 0.72, s * 0.88, s * 0.09, bc, rim, lw);
          G.capsule(x, y - s * 0.40, s * 0.36, s * 0.13, cc, rim, lw * 0.8);
          for (var j = 0; j < 3; j++) {
            var ry = y - s * 0.18 + j * s * 0.20;
            G.check(x - s * 0.18, ry, s * 0.14, s * 0.038, j === 1 ? '#ffd700' : ac);
            var lwBar = s * (0.24 + 0.07 * Math.sin(tt * 2.6 - j * 0.8));
            G.pill(x - s * 0.04, ry, x - s * 0.04 + lwBar, ry, s * 0.055, '#f8fafc');
          }
        }
      },
      rocket: function(x, y, s, hullCol, wingCol, flameCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var hc = hullCol || '#f8fafc', wc = wingCol || '#4f46e5', fc = flameCol || '#f97316';
        var fLen = s * (0.22 + 0.08 * Math.sin(tt * 8.0));
        if (vv === 1) {
          G.poly([[x - s * 0.15, y + s * 0.14], [x - s * 0.36, y + s * 0.34], [x - s * 0.10, y + s * 0.32]], wc, rim, lw, true);
          G.poly([[x + s * 0.15, y + s * 0.14], [x + s * 0.36, y + s * 0.34], [x + s * 0.10, y + s * 0.32]], wc, rim, lw, true);
          G.poly([[x - s * 0.09, y + s * 0.30], [x + s * 0.09, y + s * 0.30], [x, y + s * 0.34 + fLen]], fc, '#ffd700', lw * 0.6, true);
          G.capsule(x, y, s * 0.34, s * 0.66, hc, rim, lw);
          G.disc(x, y - s * 0.08, s * 0.09, '#00e5ff', '#0f172a', lw * 0.8);
        } else if (vv === 2) {
          G.poly([[x - s * 0.34, y + s * 0.24], [x - s * 0.18, y + s * 0.24], [x - s * 0.26, y + s * 0.26 + fLen * 0.75]], fc, '#ffd700', lw * 0.5, true);
          G.poly([[x + s * 0.18, y + s * 0.24], [x + s * 0.34, y + s * 0.24], [x + s * 0.26, y + s * 0.26 + fLen * 0.75]], fc, '#ffd700', lw * 0.5, true);
          G.capsule(x - s * 0.26, y + s * 0.05, s * 0.14, s * 0.42, wc, rim, lw);
          G.capsule(x + s * 0.26, y + s * 0.05, s * 0.14, s * 0.42, wc, rim, lw);
          G.poly([[x, y - s * 0.44], [x + s * 0.18, y - s * 0.12], [x + s * 0.14, y + s * 0.28], [x - s * 0.14, y + s * 0.28], [x - s * 0.18, y - s * 0.12]], hc, rim, lw, true);
          G.disc(x, y - s * 0.08, s * 0.085, '#00e5ff', '#0f172a', lw * 0.7);
        } else if (vv === 3) {
          G.poly([[x - s * 0.14, y + s * 0.10], [x - s * 0.42, y + s * 0.28], [x - s * 0.10, y + s * 0.26]], wc, rim, lw, true);
          G.poly([[x + s * 0.14, y + s * 0.10], [x + s * 0.42, y + s * 0.28], [x + s * 0.10, y + s * 0.26]], wc, rim, lw, true);
          G.poly([[x - s * 0.08, y + s * 0.28], [x + s * 0.08, y + s * 0.28], [x, y + s * 0.32 + fLen]], fc, '#ffd700', lw * 0.5, true);
          G.poly([[x, y - s * 0.44], [x + s * 0.22, y + s * 0.12], [x + s * 0.12, y + s * 0.28], [x - s * 0.12, y + s * 0.28], [x - s * 0.22, y + s * 0.12]], hc, rim, lw, true);
          G.pill(x, y - s * 0.36, x, y + s * 0.16, s * 0.05, '#00e5ff');
        } else if (vv === 4) {
          G.disc(x, y, s * 0.42, '#0f172a', '#00e5ff', lw);
          G.poly([[x, y - s * 0.34], [x + s * 0.18, y + s * 0.04], [x + s * 0.10, y + s * 0.20], [x - s * 0.10, y + s * 0.20], [x - s * 0.18, y + s * 0.04]], hc, rim, lw * 0.9, true);
          G.poly([[x - s * 0.07, y + s * 0.20], [x + s * 0.07, y + s * 0.20], [x, y + s * 0.22 + fLen * 0.65]], fc, '#ffd700', lw * 0.5, true);
          G.disc(x, y - s * 0.04, s * 0.065, wc, null, 0);
        } else if (vv === 5) {
          G.poly([[x - s * 0.14, y + s * 0.12], [x - s * 0.36, y + s * 0.30], [x - s * 0.10, y + s * 0.28]], wc, rim, lw, true);
          G.poly([[x + s * 0.14, y + s * 0.12], [x + s * 0.36, y + s * 0.30], [x + s * 0.10, y + s * 0.28]], wc, rim, lw, true);
          G.poly([[x - s * 0.09, y + s * 0.28], [x + s * 0.09, y + s * 0.28], [x, y + s * 0.32 + fLen]], fc, '#ffd700', lw * 0.6, true);
          G.oval(x, y - s * 0.05, s * 0.22, s * 0.36, 0, hc, rim, lw);
          G.star(x, y - s * 0.06, s * 0.11, s * 0.05, 4, tt * 1.2, '#ffd700', '#0f172a', lw * 0.6);
        } else {
          G.poly([[x - s * 0.16, y + s * 0.08], [x - s * 0.38, y + s * 0.30], [x - s * 0.10, y + s * 0.26]], wc, rim, lw, true);
          G.poly([[x + s * 0.16, y + s * 0.08], [x + s * 0.38, y + s * 0.30], [x + s * 0.10, y + s * 0.26]], wc, rim, lw, true);
          G.poly([[x - s * 0.09, y + s * 0.28], [x + s * 0.09, y + s * 0.28], [x, y + s * 0.32 + fLen]], fc, '#ffd700', lw * 0.6, true);
          G.poly([[x, y - s * 0.44], [x + s * 0.19, y - s * 0.10], [x + s * 0.15, y + s * 0.27], [x - s * 0.15, y + s * 0.27], [x - s * 0.19, y - s * 0.10]], hc, rim, lw, true);
          G.disc(x, y - s * 0.08, s * 0.09, '#00e5ff', '#0f172a', lw * 0.8);
        }
      },
      lightbulb: function(x, y, s, bulbCol, rayCol, baseCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var bc = bulbCol || '#ffd700', rc = rayCol || '#00e5ff', sc = baseCol || '#1e293b';
        var pulse = 1 + 0.10 * Math.sin(tt * 3.2);
        if (vv === 1) {
          G.rays(x, y - s * 0.10, s * 0.36, s * (0.45 + 0.05 * Math.sin(tt * 3.2)), 8, tt * 0.5, s * 0.04, rc);
          G.ngon(x, y - s * 0.10, s * 0.29, 6, 0, bc, rim, lw);
          G.star(x, y - s * 0.10, s * 0.12 * pulse, s * 0.055 * pulse, 4, 0, '#ffffff', null, 0);
          G.box(x, y + s * 0.28, s * 0.24, s * 0.14, s * 0.04, sc, rim, lw);
          G.capsule(x, y + s * 0.40, s * 0.18, s * 0.08, '#4f46e5', rim, lw);
        } else if (vv === 2) {
          G.rays(x, y - s * 0.12, s * 0.36, s * (0.46 + 0.05 * Math.sin(tt * 3.2)), 6, -Math.PI / 2, s * 0.042, rc);
          G.disc(x, y - s * 0.12, s * 0.29, bc, rim, lw);
          G.box(x, y + s * 0.26, s * 0.24, s * 0.14, s * 0.04, sc, rim, lw);
          G.star(x, y - s * 0.12, s * 0.13 * pulse, s * 0.058 * pulse, 5, -Math.PI / 2, '#ffffff', '#f59e0b', lw * 0.5);
        } else if (vv === 3) {
          G.disc(x, y - s * 0.10, s * 0.32, bc, rim, lw);
          G.ring(x, y - s * 0.10, s * 0.40, s * 0.04, tt * 1.1, tt * 1.1 + Math.PI * 1.35, rc);
          G.box(x, y + s * 0.29, s * 0.24, s * 0.15, s * 0.04, sc, rim, lw);
          G.capsule(x, y + s * 0.41, s * 0.18, s * 0.08, '#4f46e5', rim, lw);
          G.ngon(x, y - s * 0.10, s * 0.11 * pulse, 4, 0, '#ffffff', '#b45309', lw * 0.5);
        } else if (vv === 4) {
          G.rays(x, y, s * 0.34, s * (0.46 + 0.05 * Math.sin(tt * 3.2)), 8, tt * 0.8, s * 0.042, bc);
          G.disc(x, y, s * 0.28, '#1e293b', rim, lw);
          G.star(x, y, s * 0.18 * pulse, s * 0.08 * pulse, 4, -tt * 0.6, bc, '#ffffff', lw * 0.6);
        } else if (vv === 5) {
          G.rays(x, y - s * 0.12, s * 0.35, s * (0.45 + 0.05 * Math.sin(tt * 3.2)), 6, -Math.PI / 2, s * 0.042, rc);
          G.disc(x, y - s * 0.12, s * 0.29, bc, rim, lw);
          G.box(x, y + s * 0.25, s * 0.24, s * 0.14, s * 0.04, sc, rim, lw);
          G.arrow(x, y + s * 0.02, x, y - s * 0.25, s * 0.05, s * 0.11, '#0f172a');
        } else {
          G.rays(x, y - s * 0.10, s * 0.36, s * (0.46 + 0.05 * Math.sin(tt * 3.2)), 6, -Math.PI / 2, s * 0.045, rc);
          G.disc(x, y - s * 0.10, s * 0.30, bc, rim, lw);
          G.box(x, y + s * 0.27, s * 0.24, s * 0.14, s * 0.04, sc, rim, lw);
          G.capsule(x, y + s * 0.39, s * 0.18, s * 0.08, '#4f46e5', rim, lw);
          G.pill(x - s * 0.07, y - s * 0.06, x, y - s * 0.17, s * 0.04, '#ffffff');
          G.pill(x + s * 0.07, y - s * 0.06, x, y - s * 0.17, s * 0.04, '#ffffff');
        }
      },
      chart: function(x, y, s, cardCol, bar1Col, bar2Col, arrowCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#1e293b', b1 = bar1Col || '#38bdf8', b2 = bar2Col || '#4f46e5', ac = arrowCol || '#ffd700';
        var p1 = Math.sin(tt * 2.5) * 0.06, p2 = Math.sin(tt * 2.5 - 0.8) * 0.06, p3 = Math.sin(tt * 2.5 - 1.6) * 0.06;
        if (vv === 1) {
          G.pill(x - s * 0.42, y + s * 0.34, x + s * 0.42, y + s * 0.34, s * 0.055, rim);
          G.bar(x - s * 0.24, y + s * 0.31, s * 0.16, s * (0.28 + p1), s * 0.04, b2, rim, lw * 0.7);
          G.bar(x, y + s * 0.31, s * 0.16, s * (0.46 + p2), s * 0.04, b1, rim, lw * 0.7);
          G.bar(x + s * 0.24, y + s * 0.31, s * 0.16, s * (0.64 + p3), s * 0.04, ac, rim, lw * 0.7);
          G.arrow(x - s * 0.34, y - s * 0.08, x + s * 0.34, y - s * 0.38, s * 0.05, s * 0.13, '#00e5ff');
        } else if (vv === 2) {
          G.disc(x, y, s * 0.44, cc, rim, lw);
          G.ring(x, y, s * 0.36, s * 0.04, -Math.PI / 2, Math.PI * 0.75, ac);
          G.bar(x - s * 0.15, y + s * 0.20, s * 0.11, s * (0.22 + p1), s * 0.03, b2, null, 0);
          G.bar(x, y + s * 0.20, s * 0.11, s * (0.34 + p2), s * 0.03, b1, null, 0);
          G.bar(x + s * 0.15, y + s * 0.20, s * 0.11, s * (0.44 + p3), s * 0.03, ac, null, 0);
        } else if (vv === 3) {
          G.box(x, y, s * 0.94, s * 0.76, s * 0.10, cc, rim, lw);
          G.poly([[x - s * 0.36, y + s * 0.26], [x - s * 0.36, y + s * 0.12], [x - s * 0.12, y - s * 0.02 + p1 * s], [x + s * 0.12, y + s * 0.05 + p2 * s], [x + s * 0.36, y - s * 0.22 + p3 * s], [x + s * 0.36, y + s * 0.26]], b2, ac, lw * 0.85, true);
          G.disc(x - s * 0.12, y - s * 0.02 + p1 * s, s * 0.05, ac, rim, lw * 0.5);
          G.disc(x + s * 0.36, y - s * 0.22 + p3 * s, s * 0.06, '#ffd700', rim, lw * 0.5);
        } else if (vv === 4) {
          G.box(x, y, s * 0.74, s * 0.90, s * 0.10, cc, rim, lw);
          G.pill(x - s * 0.24, y - s * 0.24, x + s * 0.14, y - s * 0.24, s * 0.05, '#f8fafc');
          G.bar(x - s * 0.16, y + s * 0.26, s * 0.12, s * (0.20 + p1), s * 0.03, b2, null, 0);
          G.bar(x, y + s * 0.26, s * 0.12, s * (0.30 + p2), s * 0.03, b1, null, 0);
          G.bar(x + s * 0.16, y + s * 0.26, s * 0.12, s * (0.40 + p3), s * 0.03, ac, null, 0);
        } else if (vv === 5) {
          G.ngon(x, y, s * 0.45, 6, 0, cc, rim, lw);
          G.bar(x - s * 0.14, y + s * 0.20, s * 0.10, s * (0.20 + p1), s * 0.02, b2, null, 0);
          G.bar(x, y + s * 0.20, s * 0.10, s * (0.30 + p2), s * 0.02, b1, null, 0);
          G.bar(x + s * 0.14, y + s * 0.20, s * 0.10, s * (0.40 + p3), s * 0.02, ac, null, 0);
        } else {
          G.box(x, y, s * 0.96, s * 0.78, s * 0.10, cc, rim, lw);
          G.bar(x - s * 0.22, y + s * 0.26, s * 0.14, s * (0.22 + p1), s * 0.03, b2, null, 0);
          G.bar(x, y + s * 0.26, s * 0.14, s * (0.34 + p2), s * 0.03, b1, null, 0);
          G.bar(x + s * 0.22, y + s * 0.26, s * 0.14, s * (0.44 + p3), s * 0.03, ac, null, 0);
          G.arrow(x - s * 0.28, y - s * 0.08, x + s * 0.28, y - s * 0.28, s * 0.045, s * 0.11, ac);
        }
      },
      magnifier: function(x, y, s, cardCol, lensCol, handleCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#1e293b', lc = lensCol || '#00e5ff', hc = handleCol || '#4f46e5', ac = accentCol || '#ffd700';
        var mx = x + Math.cos(tt * 2.0) * s * 0.05, my = y + Math.sin(tt * 2.0) * s * 0.04;
        if (vv === 1) {
          G.pill(mx + s * 0.15, my + s * 0.15, mx + s * 0.36, my + s * 0.36, s * 0.11, hc);
          G.disc(mx - s * 0.06, my - s * 0.06, s * 0.32, '#0f172a', lc, lw * 1.4);
          G.bar(mx - s * 0.16, my + s * 0.08, s * 0.08, s * 0.18, s * 0.02, lc, null, 0);
          G.bar(mx - s * 0.05, my + s * 0.08, s * 0.08, s * 0.26, s * 0.02, ac, null, 0);
          G.bar(mx + s * 0.06, y + s * 0.08, s * 0.08, s * 0.20, s * 0.02, '#f43f5e', null, 0);
        } else if (vv === 2) {
          G.disc(x, y, s * 0.42, '#0f172a', lc, lw);
          G.ring(x, y, s * 0.27, s * 0.035, 0, Math.PI * 2, hc);
          G.pill(x - s * 0.32, y, x + s * 0.32, y, s * 0.03, lc);
          G.pill(x, y - s * 0.32, x, y + s * 0.32, s * 0.03, lc);
          G.disc(x + Math.cos(tt * 2.2) * s * 0.18, y + Math.sin(tt * 2.2) * s * 0.18, s * 0.075, ac, rim, lw * 0.6);
        } else if (vv === 3) {
          G.box(x - s * 0.08, y, s * 0.64, s * 0.78, s * 0.08, cc, rim, lw);
          G.pill(x - s * 0.28, y - s * 0.20, x + s * 0.10, y - s * 0.20, s * 0.05, lc);
          G.pill(x - s * 0.28, y - s * 0.04, x + s * 0.14, y - s * 0.04, s * 0.05, '#f8fafc');
          G.pill(mx + s * 0.14, my + s * 0.14, mx + s * 0.34, my + s * 0.34, s * 0.09, hc);
          G.disc(mx + s * 0.06, my + s * 0.04, s * 0.20, '#0f172a', ac, lw * 1.2);
          G.check(mx + s * 0.06, my + s * 0.04, s * 0.14, s * 0.04, lc);
        } else if (vv === 4) {
          G.disc(x - s * 0.05, y - s * 0.05, s * 0.36, cc, rim, lw);
          G.pill(x + s * 0.18, y + s * 0.18, x + s * 0.38, y + s * 0.38, s * 0.11, hc);
          G.ring(x - s * 0.05, y - s * 0.05, s * 0.26, s * 0.04, tt * 1.4, tt * 1.4 + Math.PI * 1.4, lc);
          G.person(x - s * 0.05, y - s * 0.02, s * 0.28, ac, '#f8fafc', rim);
        } else if (vv === 5) {
          G.pill(mx + s * 0.12, my + s * 0.12, mx + s * 0.36, my + s * 0.36, s * 0.11, hc);
          G.disc(mx - s * 0.08, my - s * 0.08, s * 0.31, '#0f172a', lc, lw * 1.4);
          G.star(mx - s * 0.08, my - s * 0.08, s * 0.14, s * 0.06, 4, tt * 1.1, ac, '#ffffff', lw * 0.5);
        } else {
          G.box(x - s * 0.10, y, s * 0.64, s * 0.78, s * 0.08, cc, rim, lw);
          G.pill(x - s * 0.30, y - s * 0.20, x + s * 0.08, y - s * 0.20, s * 0.05, lc);
          G.pill(x - s * 0.30, y - s * 0.04, x + s * 0.12, y - s * 0.04, s * 0.05, '#f8fafc');
          G.pill(x - s * 0.30, y + s * 0.12, x + s * 0.04, y + s * 0.12, s * 0.05, ac);
          G.pill(mx + s * 0.14, my + s * 0.14, mx + s * 0.34, my + s * 0.34, s * 0.09, hc);
          G.disc(mx + s * 0.06, my + s * 0.02, s * 0.20, '#0f172a', lc, lw * 1.2);
          G.disc(mx + s * 0.06, my + s * 0.02, s * 0.08, ac, null, 0);
        }
      },
      pieChart: function(x, y, s, baseCol, s1Col, s2Col, s3Col, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = baseCol || '#1e293b', c1 = s1Col || '#00e5ff', c2 = s2Col || '#ffd700', c3 = s3Col || '#f43f5e';
        var k = 0.05 * Math.sin(tt * 2.6);
        if (vv === 1) {
          G.disc(x, y, s * 0.42, bc, rim, lw);
          G.ring(x, y, s * 0.28, s * 0.13, -Math.PI / 2, Math.PI * (0.4 + k * 2), c1);
          G.ring(x, y, s * 0.28, s * 0.13, Math.PI * 0.5, Math.PI * 1.2, c2);
          G.disc(x, y, s * 0.14, '#0f172a', rim, lw * 0.7);
        } else if (vv === 2) {
          G.box(x, y, s * 0.94, s * 0.76, s * 0.10, bc, rim, lw);
          G.pie(x - s * 0.16, y, s * 0.25, -Math.PI / 2, Math.PI * (0.85 + k * 3), c2, '#4f46e5', rim);
          G.pill(x + s * 0.14, y - s * 0.14, x + s * 0.34, y - s * 0.14, s * 0.05, c1);
          G.pill(x + s * 0.14, y, x + s * 0.30, y, s * 0.05, c2);
          G.pill(x + s * 0.14, y + s * 0.14, x + s * 0.26, y + s * 0.14, s * 0.05, c3);
        } else if (vv === 3) {
          G.disc(x, y, s * 0.42, bc, rim, lw);
          G.ring(x, y, s * 0.31, s * 0.09, -Math.PI / 2, Math.PI * (0.8 + k * 2), c1);
          G.ring(x, y, s * 0.18, s * 0.09, -Math.PI / 2, Math.PI * (0.5 - k * 2), c2);
          G.disc(x, y, s * 0.06, c3, null, 0);
        } else if (vv === 4) {
          G.pie(x, y, s * 0.42, -Math.PI / 2, Math.PI * (0.8 + k * 2), c1, bc, rim);
          G.pie(x + s * 0.05, y - s * 0.05, s * 0.40, -Math.PI * 0.4, Math.PI * 0.5, c2, bc, rim);
        } else if (vv === 5) {
          G.disc(x, y, s * 0.43, '#0f172a', rim, lw);
          G.ring(x, y, s * 0.29, s * 0.12, -Math.PI / 2, -Math.PI / 2 + Math.PI * (1.2 + k * 3), c1);
          G.star(x, y, s * 0.12, s * 0.055, 5, -Math.PI / 2, c2, rim, lw * 0.5);
        } else {
          G.pie(x, y, s * 0.42, -Math.PI / 2, Math.PI * (0.75 + k * 2), c1, bc, rim);
          G.disc(x, y, s * 0.15, '#0f172a', rim, lw * 0.7);
          G.disc(x + s * 0.26, y - s * 0.26, s * 0.08, c2, rim, lw * 0.6);
        }
      },
      gears: function(x, y, s, g1Col, g2Col, coreCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var drawGear = function(gx, gy, gr, teeth, ang, gCol, cCol) {
          G.part(gx, gy, ang, 1, 1, function() {
            for (var k = 0; k < teeth; k++) {
              var a = (k * Math.PI * 2) / teeth;
              G.part(Math.cos(a) * gr * 0.88, Math.sin(a) * gr * 0.88, a, 1, 1, function() {
                G.box(0, 0, gr * 0.34, gr * 0.24, gr * 0.05, gCol, rim, lw * 0.6);
              });
            }
            G.disc(0, 0, gr * 0.76, gCol, rim, lw * 0.8);
            G.disc(0, 0, gr * 0.32, cCol || '#ffd700', '#0f172a', lw * 0.7);
          });
        };
        var a1 = tt * 1.45;
        if (vv === 1) {
          drawGear(x - s * 0.16, y, s * 0.28, 8, a1, g1Col || '#0284c7', coreCol || '#ffd700');
          drawGear(x + s * 0.20, y - s * 0.18, s * 0.19, 6, -a1 * 1.33 + 0.3, g2Col || '#4f46e5', '#00e5ff');
          drawGear(x + s * 0.20, y + s * 0.20, s * 0.19, 6, -a1 * 1.33 + 0.8, '#f97316', '#f8fafc');
        } else if (vv === 2) {
          G.box(x, y, s * 0.96, s * 0.56, s * 0.14, '#0f172a', rim, lw);
          drawGear(x - s * 0.20, y, s * 0.23, 8, a1, g1Col || '#0284c7', coreCol || '#ffd700');
          drawGear(x + s * 0.20, y, s * 0.23, 8, -a1 + 0.38, g2Col || '#4f46e5', '#00e5ff');
        } else if (vv === 3) {
          G.ring(x, y, s * 0.42, s * 0.05, tt * 0.9, tt * 0.9 + Math.PI * 1.4, '#00e5ff');
          drawGear(x, y, s * 0.34, 10, -a1, g1Col || '#4f46e5', coreCol || '#ffd700');
        } else if (vv === 4) {
          G.ngon(x, y, s * 0.44, 6, 0, '#1e293b', rim, lw);
          drawGear(x, y, s * 0.29, 8, a1 * 1.2, g1Col || '#0284c7', coreCol || '#ffd700');
          G.star(x, y, s * 0.10, s * 0.045, 4, -a1, '#ffffff', rim, lw * 0.5);
        } else if (vv === 5) {
          G.capsule(x - s * 0.15, y, s * 0.09, s * 0.64, '#334155', rim, lw * 0.7);
          G.capsule(x + s * 0.15, y, s * 0.09, s * 0.64, '#334155', rim, lw * 0.7);
          drawGear(x, y - s * 0.21, s * 0.24, 8, a1, g1Col || '#0284c7', coreCol || '#ffd700');
          drawGear(x, y + s * 0.21, s * 0.24, 8, a1 + 0.3, g2Col || '#4f46e5', '#00e5ff');
        } else {
          drawGear(x - s * 0.14, y + s * 0.10, s * 0.30, 8, a1, g1Col || '#0284c7', coreCol || '#ffd700');
          drawGear(x + s * 0.22, y - s * 0.18, s * 0.22, 6, -a1 * 1.33 + 0.4, g2Col || '#4f46e5', '#00e5ff');
        }
      },
      userBadge: function(x, y, s, cardCol, personCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#1e293b', pc = personCol || '#0284c7', ac = accentCol || '#00e5ff';
        if (vv === 1) {
          G.capsule(x, y - s * 0.42, s * 0.22, s * 0.08, ac, rim, lw * 0.7);
          G.box(x, y + s * 0.02, s * 0.72, s * 0.88, s * 0.10, cc, rim, lw);
          G.person(x, y - s * 0.12, s * 0.32, pc, '#f8fafc', rim);
          var bw1 = s * (0.36 + 0.08 * Math.sin(tt * 2.5));
          G.pill(x - bw1 * 0.5, y + s * 0.18, x + bw1 * 0.5, y + s * 0.18, s * 0.05, ac);
          G.star(x, y + s * 0.32, s * 0.10, s * 0.045, 5, -Math.PI / 2, '#ffd700', rim, lw * 0.6);
        } else if (vv === 2) {
          G.ring(x, y, s * 0.42, s * 0.045, tt * 0.8, tt * 0.8 + Math.PI * 1.45, ac);
          G.disc(x, y, s * 0.35, cc, rim, lw);
          G.person(x, y + s * 0.04, s * 0.42, pc, '#f8fafc', rim);
          var ks2 = 1 + 0.10 * Math.sin(tt * 3.0);
          G.disc(x + s * 0.28, y - s * 0.26, s * 0.13 * ks2, '#ffd700', rim, lw * 0.85);
          G.check(x + s * 0.28, y - s * 0.26, s * 0.11 * ks2, s * 0.03, '#0f172a');
        } else if (vv === 3) {
          G.person(x - s * 0.29, y + s * 0.10, s * 0.30, '#4f46e5', '#f8fafc', rim);
          G.person(x + s * 0.29, y + s * 0.10, s * 0.30, ac, '#f8fafc', rim);
          G.person(x, y + s * 0.02 + Math.sin(tt * 2.3) * s * 0.02, s * 0.40, pc, '#f8fafc', rim);
          G.star(x, y - s * 0.33, s * 0.10, s * 0.045, 5, -Math.PI / 2, '#ffd700', rim, lw * 0.65);
        } else if (vv === 4) {
          G.shield(x, y, s * 0.94, cc, rim, '#0f172a');
          G.person(x, y - s * 0.02, s * 0.36, pc, '#f8fafc', rim);
          var bs4 = 1 + 0.10 * Math.sin(tt * 3.0);
          G.star(x, y - s * 0.34, s * 0.095 * bs4, s * 0.042 * bs4, 5, -Math.PI / 2, '#ffd700', rim, lw * 0.6);
        } else if (vv === 5) {
          G.box(x - s * 0.14, y - s * 0.31, s * 0.36, s * 0.14, s * 0.04, '#4f46e5', rim, lw);
          G.box(x, y + s * 0.04, s * 0.90, s * 0.64, s * 0.09, cc, rim, lw);
          G.disc(x - s * 0.22, y + s * 0.04, s * 0.20, '#0f172a', ac, lw * 0.8);
          G.person(x - s * 0.22, y + s * 0.06, s * 0.23, pc, '#f8fafc', rim);
          for (var si = 0; si < 3; si++) {
            var kst = 1 + 0.12 * Math.sin(tt * 3.0 - si * 0.8);
            G.star(x + s * 0.06 + si * s * 0.12, y - s * 0.08, s * 0.052 * kst, s * 0.024 * kst, 5, -Math.PI / 2, '#ffd700', null, 0);
          }
          G.pill(x + s * 0.02, y + s * 0.14, x + s * (0.20 + 0.12 * Math.sin(tt * 2.5)), y + s * 0.14, s * 0.055, ac);
        } else {
          G.box(x, y, s * 1.00, s * 0.74, s * 0.10, cc, rim, lw);
          G.box(x - s * 0.24, y, s * 0.34, s * 0.48, s * 0.06, '#0f172a', rim, lw * 0.75);
          G.person(x - s * 0.24, y + s * 0.03, s * 0.30, pc, '#f8fafc', rim);
          var w1 = s * (0.28 + 0.07 * Math.sin(tt * 2.5));
          var w2 = s * (0.24 + 0.07 * Math.sin(tt * 2.5 - 0.8));
          G.pill(x + s * 0.02, y - s * 0.13, x + s * 0.02 + w1, y - s * 0.13, s * 0.055, ac);
          G.pill(x + s * 0.02, y + s * 0.03, x + s * 0.02 + w2, y + s * 0.03, s * 0.055, '#38bdf8');
          G.pill(x + s * 0.02, y + s * 0.19, x + s * 0.24, y + s * 0.19, s * 0.055, '#94a3b8');
          var bs = 1 + 0.10 * Math.sin(tt * 3.0);
          G.disc(x + s * 0.34, y - s * 0.24, s * 0.13 * bs, '#ffd700', rim, lw * 0.85);
          G.check(x + s * 0.34, y - s * 0.24, s * 0.11 * bs, s * 0.03, '#0f172a');
        }
      },
      typography: function(x, y, s, cardCol, inkCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#1e293b', ic = inkCol || '#f8fafc', ac = accentCol || '#00e5ff';
        if (vv === 1) {
          G.disc(x, y, s * 0.43, cc, rim, lw);
          G.ring(x, y, s * 0.36, s * 0.035, tt * 0.7, tt * 0.7 + Math.PI * 1.4, ac);
          G.pill(x - s * 0.20, y - s * 0.16, x + s * 0.20, y - s * 0.16, s * 0.075, ic);
          G.pill(x, y - s * 0.16, x, y + s * 0.20, s * 0.085, ic);
          G.disc(x - s * 0.20, y - s * 0.16, s * 0.05, '#ffd700', rim, lw * 0.6);
          G.disc(x + s * 0.20, y - s * 0.16, s * 0.05, '#ffd700', rim, lw * 0.6);
        } else if (vv === 2) {
          var ny = Math.sin(tt * 2.4) * s * 0.04;
          G.pill(x - s * 0.34, y + s * 0.26, x + s * 0.34, y + s * 0.26, s * 0.038, '#64748b');
          G.disc(x - s * 0.34, y + s * 0.26, s * 0.06, ac, rim, lw * 0.6);
          G.disc(x + s * 0.34, y + s * 0.26, s * 0.06, ac, rim, lw * 0.6);
          G.poly([[x, y - s * 0.38 + ny], [x + s * 0.26, y + s * 0.04 + ny], [x + s * 0.16, y + s * 0.22 + ny], [x - s * 0.16, y + s * 0.22 + ny], [x - s * 0.26, y + s * 0.04 + ny]], cc, rim, lw, true);
          G.pill(x, y - s * 0.36 + ny, x, y - s * 0.04 + ny, s * 0.04, '#ffd700');
          G.disc(x, y - s * 0.02 + ny, s * 0.065, ac, rim, lw * 0.6);
          G.box(x, y + s * 0.28 + ny, s * 0.36, s * 0.12, s * 0.03, '#4f46e5', rim, lw * 0.8);
        } else if (vv === 3) {
          G.box(x - s * 0.24, y, s * 0.44, s * 0.70, s * 0.06, cc, rim, lw);
          G.box(x + s * 0.24, y, s * 0.44, s * 0.70, s * 0.06, '#0f172a', ac, lw);
          G.pill(x - s * 0.33, y + s * 0.14, x - s * 0.24, y - s * 0.14, s * 0.055, ic);
          G.pill(x - s * 0.15, y + s * 0.14, x - s * 0.24, y - s * 0.14, s * 0.055, ic);
          G.pill(x - s * 0.30, y + s * 0.04, x - s * 0.18, y + s * 0.04, s * 0.045, ac);
          var sl3 = s * (0.18 + 0.08 * Math.sin(tt * 2.5));
          G.pill(x + s * 0.10, y - s * 0.16, x + s * 0.10 + sl3, y - s * 0.16, s * 0.05, '#ffd700');
          G.pill(x + s * 0.10, y, x + s * 0.36, y, s * 0.045, ac);
          G.pill(x + s * 0.10, y + s * 0.16, x + s * 0.30, y + s * 0.16, s * 0.045, '#94a3b8');
        } else if (vv === 4) {
          G.box(x - s * 0.34, y, s * 0.16, s * 0.84, s * 0.04, '#4f46e5', rim, lw * 0.85);
          G.box(x + s * 0.11, y, s * 0.66, s * 0.76, s * 0.09, cc, rim, lw);
          G.pill(x - s * 0.08, y - s * 0.16, x + s * 0.30, y - s * 0.16, s * 0.065, ic);
          G.pill(x + s * 0.11, y - s * 0.16, x + s * 0.11, y + s * 0.14, s * 0.07, ic);
          G.capsule(x + s * 0.11, y + s * 0.26, s * 0.44, s * 0.09, '#0f172a', ac, lw * 0.6);
          G.disc(x - s * 0.04 + (0.5 + 0.5 * Math.sin(tt * 2.2)) * s * 0.30, y + s * 0.26, s * 0.055, '#ffd700', rim, lw * 0.6);
        } else if (vv === 5) {
          G.ngon(x, y, s * 0.44, 6, 0, cc, rim, lw);
          G.pill(x - s * 0.22, y + s * 0.14, x + s * 0.22, y - s * 0.14, s * 0.04, '#64748b');
          G.disc(x - s * 0.22, y + s * 0.14, s * 0.055, '#ffd700', rim, lw * 0.6);
          G.disc(x + s * 0.22, y - s * 0.14, s * 0.055, '#ffd700', rim, lw * 0.6);
          G.pill(x - s * 0.15, y + s * 0.16, x, y - s * 0.20, s * 0.07, ic);
          G.pill(x + s * 0.15, y + s * 0.16, x, y - s * 0.20, s * 0.07, ic);
          G.pill(x - s * 0.09, y + s * 0.05, x + s * 0.09, y + s * 0.05, s * 0.06, ac);
        } else {
          G.box(x, y, s * 0.90, s * 0.82, s * 0.08, cc, rim, lw);
          var cx0 = s * 0.45, cy0 = s * 0.41;
          G.box(x - cx0, y - cy0, s * 0.10, s * 0.10, s * 0.02, ac, rim, lw * 0.6);
          G.box(x + cx0, y - cy0, s * 0.10, s * 0.10, s * 0.02, ac, rim, lw * 0.6);
          G.box(x - cx0, y + cy0, s * 0.10, s * 0.10, s * 0.02, ac, rim, lw * 0.6);
          G.box(x + cx0, y + cy0, s * 0.10, s * 0.10, s * 0.02, ac, rim, lw * 0.6);
          G.pill(x - s * 0.20, y + s * 0.16, x, y - s * 0.22, s * 0.075, ic);
          G.pill(x + s * 0.20, y + s * 0.16, x, y - s * 0.22, s * 0.075, ic);
          G.pill(x - s * 0.11, y + s * 0.04, x + s * 0.11, y + s * 0.04, s * 0.065, ac);
          var curX = x - s * 0.24 + (0.5 + 0.5 * Math.sin(tt * 2.2)) * s * 0.48;
          G.pill(x - s * 0.28, y + s * 0.26, x + s * 0.28, y + s * 0.26, s * 0.032, '#64748b');
          G.disc(curX, y + s * 0.26, s * 0.065, '#ffd700', rim, lw * 0.7);
        }
      },
      briefcase: function(x, y, s, bodyCol, flapCol, claspCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var bc = bodyCol || '#1e293b', fc = flapCol || '#4f46e5', cc = claspCol || '#ffd700';
        var dy = Math.sin(tt * 2.4) * s * 0.028;
        if (vv === 1) {
          G.ring(x, y - s * 0.35, s * 0.13, s * 0.055, Math.PI, Math.PI * 2, rim);
          G.box(x, y + s * 0.04, s * 0.68, s * 0.80, s * 0.09, bc, rim, lw);
          G.box(x, y - s * 0.18 + dy, s * 0.70, s * 0.24, s * 0.07, fc, rim, lw);
          G.box(x - s * 0.18, y + s * 0.06, s * 0.09, s * 0.46, s * 0.025, cc, rim, lw * 0.7);
          G.box(x + s * 0.18, y + s * 0.06, s * 0.09, s * 0.46, s * 0.025, cc, rim, lw * 0.7);
        } else if (vv === 2) {
          G.box(x, y - s * 0.10, s * 0.84, s * 0.58, s * 0.07, '#0f172a', rim, lw);
          G.box(x + s * 0.16, y - s * 0.22 + dy, s * 0.42, s * 0.34, s * 0.04, '#f8fafc', '#0f172a', lw * 0.7);
          G.bar(x - s * 0.18, y + s * 0.04, s * 0.11, s * (0.18 + 0.05 * Math.sin(tt * 2.5)), s * 0.02, '#00e5ff', null, 0);
          G.bar(x - s * 0.03, y + s * 0.04, s * 0.11, s * (0.28 + 0.05 * Math.sin(tt * 2.5 - 0.8)), s * 0.02, cc, null, 0);
          G.poly([[x - s * 0.46, y + s * 0.34], [x - s * 0.38, y + s * 0.02], [x + s * 0.38, y + s * 0.02], [x + s * 0.46, y + s * 0.34]], fc, rim, lw, true);
          G.capsule(x, y + s * 0.18, s * 0.24, s * 0.065, cc, rim, lw * 0.7);
        } else if (vv === 3) {
          G.disc(x, y, s * 0.44, bc, rim, lw);
          G.ring(x, y, s * 0.36, s * 0.04, tt * 0.7, tt * 0.7 + Math.PI * 1.35, '#00e5ff');
          G.ring(x, y - s * 0.16, s * 0.10, s * 0.045, Math.PI, Math.PI * 2, rim);
          G.box(x, y + s * 0.05, s * 0.56, s * 0.38, s * 0.06, fc, rim, lw * 0.85);
          G.disc(x, y + s * 0.05 + dy * 0.5, s * 0.09, cc, rim, lw * 0.7);
        } else if (vv === 4) {
          G.ring(x, y - s * 0.23, s * 0.16, s * 0.055, Math.PI, Math.PI * 2, '#00e5ff');
          G.poly([[x - s * 0.40, y - s * 0.22], [x + s * 0.40, y - s * 0.22], [x + s * 0.48, y - s * 0.12], [x + s * 0.48, y + s * 0.30], [x + s * 0.40, y + s * 0.38], [x - s * 0.40, y + s * 0.38], [x - s * 0.48, y + s * 0.30], [x - s * 0.48, y - s * 0.12]], bc, rim, lw, true);
          G.pill(x - s * 0.44, y + s * 0.02, x + s * 0.44, y + s * 0.02, s * 0.05, fc);
          G.star(x, y + s * 0.08 + dy * 0.5, s * 0.13, s * 0.06, 5, -Math.PI / 2, cc, rim, lw * 0.7);
        } else if (vv === 5) {
          G.box(x - s * 0.16, y + s * 0.08, s * 0.54, s * 0.66, s * 0.07, bc, rim, lw);
          G.box(x + s * 0.14, y - s * 0.04 + dy, s * 0.56, s * 0.68, s * 0.07, fc, rim, lw);
          G.pill(x - s * 0.02, y - s * 0.20 + dy, x + s * 0.30, y - s * 0.20 + dy, s * 0.055, '#f8fafc');
          G.pill(x - s * 0.02, y - s * 0.06 + dy, x + s * 0.24, y - s * 0.06 + dy, s * 0.05, '#00e5ff');
          G.disc(x + s * 0.24, y + s * 0.18 + dy, s * 0.13, cc, rim, lw * 0.8);
          G.check(x + s * 0.24, y + s * 0.18 + dy, s * 0.11, s * 0.03, '#0f172a');
        } else {
          G.ring(x, y - s * 0.23, s * 0.15, s * 0.06, Math.PI, Math.PI * 2, rim);
          G.box(x, y + s * 0.07, s * 0.94, s * 0.60, s * 0.09, bc, rim, lw);
          G.box(x, y - s * 0.06 + dy, s * 0.96, s * 0.27, s * 0.07, fc, rim, lw);
          G.box(x, y + s * 0.08 + dy * 0.6, s * 0.16, s * 0.15, s * 0.03, cc, rim, lw * 0.85);
        }
      },
      trophy: function(x, y, s, cupCol, baseCol, starCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var cc = cupCol || '#ffd700', bc = baseCol || '#1e293b', sc = starCol || '#ffffff';
        var st = 1 + 0.12 * Math.sin(tt * 3.2);
        if (vv === 1) {
          G.box(x, y + s * 0.34, s * 0.64, s * 0.12, s * 0.03, bc, rim, lw);
          G.poly([[x - s * 0.36, y + s * 0.18], [x - s * 0.42, y - s * 0.22], [x - s * 0.18, y - s * 0.02], [x, y - s * 0.34], [x + s * 0.18, y - s * 0.02], [x + s * 0.42, y - s * 0.22], [x + s * 0.36, y + s * 0.18]], cc, rim, lw, true);
          G.disc(x - s * 0.42, y - s * 0.25, s * 0.055, '#00e5ff', rim, lw * 0.6);
          G.disc(x, y - s * 0.37, s * 0.07 * st, '#f43f5e', rim, lw * 0.65);
          G.disc(x + s * 0.42, y - s * 0.25, s * 0.055, '#00e5ff', rim, lw * 0.6);
          G.star(x, y + s * 0.02, s * 0.11 * st, s * 0.05 * st, 5, -Math.PI / 2, sc, '#b45309', lw * 0.6);
        } else if (vv === 2) {
          G.poly([[x - s * 0.28, y - s * 0.44], [x - s * 0.08, y - s * 0.44], [x + s * 0.06, y - s * 0.06], [x - s * 0.12, y - s * 0.06]], '#4f46e5', rim, lw * 0.85, true);
          G.poly([[x + s * 0.28, y - s * 0.44], [x + s * 0.08, y - s * 0.44], [x - s * 0.06, y - s * 0.06], [x + s * 0.12, y - s * 0.06]], '#00e5ff', rim, lw * 0.85, true);
          G.disc(x, y + s * 0.12, s * 0.34, cc, rim, lw);
          G.ring(x, y + s * 0.12, s * 0.25, s * 0.032, 0, Math.PI * 2, '#b45309');
          G.star(x, y + s * 0.12, s * 0.16 * st, s * 0.07 * st, 5, -Math.PI / 2, sc, '#b45309', lw * 0.7);
        } else if (vv === 3) {
          G.box(x - s * 0.28, y + s * 0.22, s * 0.24, s * 0.32, s * 0.04, '#4f46e5', rim, lw * 0.85);
          G.box(x + s * 0.28, y + s * 0.26, s * 0.24, s * 0.24, s * 0.04, '#00e5ff', rim, lw * 0.85);
          G.box(x, y + s * 0.14, s * 0.28, s * 0.48, s * 0.04, bc, rim, lw);
          var dy3 = Math.sin(tt * 2.5) * s * 0.03;
          G.star(x, y - s * 0.26 + dy3, s * 0.19 * st, s * 0.085 * st, 5, -Math.PI / 2, cc, rim, lw * 0.8);
        } else if (vv === 4) {
          G.box(x, y + s * 0.36, s * 0.48, s * 0.12, s * 0.03, bc, rim, lw);
          G.poly([[x - s * 0.14, y - s * 0.04], [x - s * 0.42, y - s * 0.22], [x - s * 0.34, y + s * 0.08]], '#00e5ff', rim, lw * 0.85, true);
          G.poly([[x + s * 0.14, y - s * 0.04], [x + s * 0.42, y - s * 0.22], [x + s * 0.34, y + s * 0.08]], '#00e5ff', rim, lw * 0.85, true);
          G.poly([[x, y - s * 0.40], [x + s * 0.22, y - s * 0.04], [x + s * 0.10, y + s * 0.29], [x - s * 0.10, y + s * 0.29], [x - s * 0.22, y - s * 0.04]], cc, rim, lw, true);
          G.ngon(x, y - s * 0.05, s * 0.11 * st, 4, 0, sc, '#b45309', lw * 0.65);
        } else if (vv === 5) {
          G.shield(x, y + s * 0.06, s * 0.88, bc, rim, '#4f46e5');
          G.star(x, y + s * 0.04, s * 0.20 * st, s * 0.09 * st, 5, -Math.PI / 2, cc, rim, lw * 0.75);
          G.capsule(x, y - s * 0.38, s * 0.44, s * 0.12, cc, rim, lw * 0.8);
        } else {
          G.ring(x - s * 0.25, y - s * 0.12, s * 0.13, s * 0.05, 0, Math.PI * 2, cc);
          G.ring(x + s * 0.25, y - s * 0.12, s * 0.13, s * 0.05, 0, Math.PI * 2, cc);
          G.box(x, y + s * 0.40, s * 0.48, s * 0.11, s * 0.03, bc, rim, lw);
          G.box(x, y + s * 0.26, s * 0.14, s * 0.20, s * 0.02, cc, rim, lw);
          G.poly([[x - s * 0.28, y - s * 0.33], [x + s * 0.28, y - s * 0.33], [x + s * 0.16, y + s * 0.17], [x - s * 0.16, y + s * 0.17]], cc, rim, lw, true);
          G.star(x, y - s * 0.10, s * 0.12 * st, s * 0.055 * st, 5, -Math.PI / 2, sc, '#b45309', lw * 0.7);
        }
      },
      clock: function(x, y, s, bezelCol, faceCol, handCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var bz = bezelCol || '#4f46e5', fc = faceCol || '#f8fafc', hc = handCol || '#1e293b';
        var ha = -Math.PI / 2 + tt * 0.55, ma = -Math.PI / 2 + tt * 2.4;
        if (vv === 1) {
          G.capsule(x, y - s * 0.39, s * 0.58, s * 0.10, bz, rim, lw);
          G.capsule(x, y + s * 0.39, s * 0.58, s * 0.10, bz, rim, lw);
          G.poly([[x - s * 0.23, y - s * 0.34], [x + s * 0.23, y - s * 0.34], [x, y], [x + s * 0.23, y + s * 0.34], [x - s * 0.23, y + s * 0.34], [x, y]], fc, rim, lw, true);
          var sand = 0.5 + 0.4 * Math.sin(tt * 2.0);
          G.poly([[x - s * 0.13 * sand, y - s * 0.20 * sand], [x + s * 0.13 * sand, y - s * 0.20 * sand], [x, y]], '#ffd700', null, 0, true);
          G.poly([[x, y + s * 0.32 - s * 0.20 * (1 - sand * 0.5)], [x + s * 0.18, y + s * 0.32], [x - s * 0.18, y + s * 0.32]], '#ffd700', null, 0, true);
        } else if (vv === 2) {
          G.pill(x - s * 0.22, y + s * 0.32, x - s * 0.30, y + s * 0.44, s * 0.06, '#ffd700');
          G.pill(x + s * 0.22, y + s * 0.32, x + s * 0.30, y + s * 0.44, s * 0.06, '#ffd700');
          G.disc(x - s * 0.30, y - s * 0.32, s * 0.12, '#f97316', rim, lw * 0.8);
          G.disc(x + s * 0.30, y - s * 0.32, s * 0.12, '#f97316', rim, lw * 0.8);
          G.disc(x, y + s * 0.02, s * 0.40, bz, rim, lw);
          G.disc(x, y + s * 0.02, s * 0.30, fc, '#0f172a', lw * 0.7);
          G.pill(x, y + s * 0.02, x + Math.cos(ha) * s * 0.16, y + s * 0.02 + Math.sin(ha) * s * 0.16, s * 0.05, hc);
          G.pill(x, y + s * 0.02, x + Math.cos(ma) * s * 0.23, y + s * 0.02 + Math.sin(ma) * s * 0.23, s * 0.036, '#00e5ff');
        } else if (vv === 3) {
          G.box(x, y - s * 0.36, s * 0.42, s * 0.24, s * 0.06, '#334155', rim, lw * 0.85);
          G.box(x, y + s * 0.36, s * 0.42, s * 0.24, s * 0.06, '#334155', rim, lw * 0.85);
          G.box(x, y, s * 0.70, s * 0.70, s * 0.18, bz, rim, lw);
          G.box(x, y, s * 0.56, s * 0.56, s * 0.13, '#0f172a', '#00e5ff', lw * 0.7);
          G.ring(x, y, s * 0.20, s * 0.045, -Math.PI / 2, -Math.PI / 2 + Math.PI * (0.9 + 0.5 * Math.sin(tt * 2.0)), '#38bdf8');
          G.pill(x, y, x + Math.cos(ma) * s * 0.17, y + Math.sin(ma) * s * 0.17, s * 0.038, '#ffd700');
          G.disc(x, y, s * 0.045, '#f43f5e', null, 0);
        } else if (vv === 4) {
          G.capsule(x, y - s * 0.45, s * 0.20, s * 0.10, '#ffd700', rim, lw * 0.8);
          G.capsule(x + s * 0.30, y - s * 0.32, s * 0.11, s * 0.11, '#00e5ff', rim, lw * 0.7);
          G.ngon(x, y + s * 0.02, s * 0.42, 8, Math.PI / 8, bz, rim, lw);
          G.disc(x, y + s * 0.02, s * 0.31, fc, '#0f172a', lw * 0.7);
          G.pill(x, y + s * 0.02, x + Math.cos(ha) * s * 0.16, y + s * 0.02 + Math.sin(ha) * s * 0.16, s * 0.05, hc);
          G.pill(x, y + s * 0.02, x + Math.cos(ma) * s * 0.24, y + s * 0.02 + Math.sin(ma) * s * 0.24, s * 0.036, '#f43f5e');
        } else if (vv === 5) {
          G.box(x - s * 0.06, y, s * 0.76, s * 0.76, s * 0.10, '#0f172a', rim, lw);
          G.box(x - s * 0.06, y - s * 0.24, s * 0.72, s * 0.18, s * 0.05, '#f43f5e', null, 0);
          G.pill(x - s * 0.28, y - s * 0.02, x + s * 0.08, y - s * 0.02, s * 0.06, '#f8fafc');
          G.pill(x - s * 0.28, y + s * 0.14, x + s * 0.02, y + s * 0.14, s * 0.05, '#38bdf8');
          G.disc(x + s * 0.24, y + s * 0.20, s * 0.24, bz, rim, lw);
          G.disc(x + s * 0.24, y + s * 0.20, s * 0.18, fc, '#0f172a', lw * 0.6);
          G.pill(x + s * 0.24, y + s * 0.20, x + s * 0.24 + Math.cos(ma) * s * 0.13, y + s * 0.20 + Math.sin(ma) * s * 0.13, s * 0.032, '#f43f5e');
        } else {
          G.disc(x, y, s * 0.46, bz, rim, lw);
          G.disc(x, y, s * 0.36, fc, '#0f172a', lw * 0.7);
          G.pill(x, y, x + Math.cos(ha) * s * 0.19, y + Math.sin(ha) * s * 0.19, s * 0.05, hc);
          G.pill(x, y, x + Math.cos(ma) * s * 0.27, y + Math.sin(ma) * s * 0.27, s * 0.038, '#00e5ff');
          G.disc(x, y, s * 0.055, '#f43f5e', '#0f172a', lw * 0.6);
        }
      },
      lock: function(x, y, s, bodyCol, shackleCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var bc = bodyCol || '#1e293b', sc = shackleCol || '#38bdf8', ac = accentCol || '#ffd700';
        var lift = Math.abs(Math.sin(tt * 2.3)) * s * 0.05;
        var ks = 1 + 0.1 * Math.sin(tt * 3.0);
        if (vv === 1) {
          G.shield(x, y, s * 0.96, bc, rim, '#0f172a');
          G.ring(x, y - s * 0.10 - lift * 0.6, s * 0.13, s * 0.055, Math.PI, Math.PI * 2, sc);
          G.box(x, y + s * 0.08, s * 0.38, s * 0.30, s * 0.06, '#4f46e5', rim, lw * 0.8);
          G.check(x, y + s * 0.08, s * 0.13 * ks, s * 0.032, ac);
        } else if (vv === 2) {
          G.ring(x, y - s * 0.16 - lift, s * 0.20, s * 0.085, Math.PI, Math.PI * 2, sc);
          G.ngon(x, y + s * 0.12, s * 0.36, 8, Math.PI / 8, bc, rim, lw);
          G.ring(x, y + s * 0.12, s * 0.18, s * 0.045, tt * 1.8, tt * 1.8 + Math.PI * 1.4, ac);
          G.disc(x, y + s * 0.12, s * 0.07, '#00e5ff', rim, lw * 0.6);
        } else if (vv === 3) {
          G.box(x, y, s * 0.84, s * 0.84, s * 0.16, bc, rim, lw);
          G.disc(x, y, s * 0.28, '#0f172a', sc, lw);
          G.part(x, y, Math.sin(tt * 2.0) * 0.65, 1, 1, function() {
            G.pill(-s * 0.18, 0, s * 0.18, 0, s * 0.045, ac);
            G.pill(0, -s * 0.18, 0, s * 0.18, s * 0.045, ac);
            G.disc(0, 0, s * 0.08, sc, rim, lw * 0.6);
          });
        } else if (vv === 4) {
          G.part(x, y, -0.35 + Math.sin(tt * 2.0) * 0.05, 1, 1, function() {
            G.pill(-s * 0.18, 0, s * 0.38, 0, s * 0.095, ac);
            G.box(s * 0.22, s * 0.11, s * 0.09, s * 0.14, s * 0.02, ac, rim, lw * 0.7);
            G.box(s * 0.34, s * 0.12, s * 0.09, s * 0.16, s * 0.02, ac, rim, lw * 0.7);
            G.disc(-s * 0.26, 0, s * 0.20, sc, rim, lw);
            G.disc(-s * 0.26, 0, s * 0.08, bc, rim, lw * 0.6);
          });
        } else if (vv === 5) {
          G.ngon(x, y, s * 0.44, 6, 0, bc, rim, lw);
          G.ring(x, y, s * 0.30, s * 0.04, 0, Math.PI * 1.4, sc);
          G.ring(x, y, s * 0.20, s * 0.04, Math.PI * 0.4, Math.PI * 1.8, '#00e5ff');
          G.disc(x, y, s * 0.08 * ks, ac, rim, lw * 0.6);
        } else {
          G.ring(x, y - s * 0.16 - lift, s * 0.20, s * 0.085, Math.PI, Math.PI * 2, sc);
          G.box(x, y + s * 0.12, s * 0.70, s * 0.56, s * 0.10, bc, rim, lw);
          G.disc(x, y + s * 0.09, s * 0.10 * ks, ac, rim, lw * 0.7);
          G.pill(x, y + s * 0.14, x, y + s * 0.24, s * 0.055, ac);
        }
      },
      cloudSync: function(x, y, s, cloudCol, arrowCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cloudCol || '#38bdf8', ac = arrowCol || '#ffd700';
        var dy = Math.sin(tt * 2.8) * s * 0.045;
        if (vv === 1) {
          G.disc(x - s * 0.23, y + s * 0.04, s * 0.22, cc, rim, lw);
          G.disc(x + s * 0.23, y + s * 0.04, s * 0.20, cc, rim, lw);
          G.disc(x, y - s * 0.09, s * 0.28, cc, rim, lw);
          G.box(x, y + s * 0.12, s * 0.52, s * 0.24, s * 0.06, cc, null, 0);
          G.pill(x - s * 0.24, y + s * 0.24, x + s * 0.24, y + s * 0.24, lw, rim);
          G.arrow(x - s * 0.10, y + s * 0.17 + dy, x - s * 0.10, y - s * 0.10 + dy, s * 0.045, s * 0.11, ac);
          G.arrow(x + s * 0.10, y - s * 0.10 - dy, x + s * 0.10, y + s * 0.17 - dy, s * 0.045, s * 0.11, '#f8fafc');
        } else if (vv === 2) {
          G.disc(x - s * 0.14, y - s * 0.24, s * 0.14, cc, rim, lw * 0.85);
          G.disc(x + s * 0.14, y - s * 0.24, s * 0.13, cc, rim, lw * 0.85);
          G.disc(x, y - s * 0.30, s * 0.18, cc, rim, lw * 0.85);
          G.box(x, y - s * 0.18, s * 0.34, s * 0.14, s * 0.04, cc, null, 0);
          G.arrow(x, y - s * 0.02 + dy * 0.5, x, y - s * 0.14 + dy * 0.5, s * 0.042, s * 0.09, ac);
          G.box(x, y + s * 0.14, s * 0.78, s * 0.18, s * 0.05, '#1e293b', rim, lw);
          G.box(x, y + s * 0.34, s * 0.78, s * 0.18, s * 0.05, '#0f172a', '#4f46e5', lw);
          G.disc(x - s * 0.22, y + s * 0.14, s * 0.04, '#00e5ff', null, 0);
          G.disc(x - s * 0.22, y + s * 0.34, s * (0.04 + 0.01 * Math.sin(tt * 3.5)), ac, null, 0);
        } else if (vv === 3) {
          G.ring(x, y, s * 0.44, s * 0.04, tt * 0.9, tt * 0.9 + Math.PI * 1.35, cc);
          var ty3 = [y - s * 0.20, y, y + s * 0.20];
          for (var d3 = 0; d3 < 3; d3++) {
            G.box(x, ty3[d3], s * 0.56, s * 0.16, s * 0.07, d3 === 0 ? '#4f46e5' : '#1e293b', rim, lw);
            G.disc(x + s * 0.16, ty3[d3], s * 0.036, d3 === Math.floor((tt * 2) % 3) ? ac : '#00e5ff', null, 0);
          }
        } else if (vv === 4) {
          G.ngon(x, y, s * 0.44, 6, 0, '#1e293b', rim, lw);
          G.disc(x - s * 0.14, y + s * 0.04, s * 0.14, cc, rim, lw * 0.8);
          G.disc(x + s * 0.14, y + s * 0.04, s * 0.13, cc, rim, lw * 0.8);
          G.disc(x, y - s * 0.05, s * 0.18, cc, rim, lw * 0.8);
          G.box(x, y + s * 0.09, s * 0.32, s * 0.14, s * 0.04, cc, null, 0);
          G.ring(x, y + s * 0.05, s * 0.08, s * 0.035, tt * 2.2, tt * 2.2 + Math.PI * 1.4, ac);
        } else if (vv === 5) {
          G.ring(x, y, s * 0.41, s * 0.045, tt * 1.4, tt * 1.4 + Math.PI * 0.8, ac);
          G.ring(x, y, s * 0.41, s * 0.045, tt * 1.4 + Math.PI, tt * 1.4 + Math.PI * 1.8, '#00e5ff');
          G.disc(x - s * 0.16, y + s * 0.04, s * 0.15, cc, rim, lw * 0.85);
          G.disc(x + s * 0.16, y + s * 0.04, s * 0.14, cc, rim, lw * 0.85);
          G.disc(x, y - s * 0.05, s * 0.20, cc, rim, lw * 0.85);
          G.box(x, y + s * 0.10, s * 0.36, s * 0.16, s * 0.04, cc, null, 0);
        } else {
          G.disc(x - s * 0.23, y + s * 0.04, s * 0.22, cc, rim, lw);
          G.disc(x + s * 0.23, y + s * 0.04, s * 0.20, cc, rim, lw);
          G.disc(x, y - s * 0.09, s * 0.28, cc, rim, lw);
          G.box(x, y + s * 0.12, s * 0.52, s * 0.24, s * 0.06, cc, null, 0);
          G.pill(x - s * 0.24, y + s * 0.24, x + s * 0.24, y + s * 0.24, lw, rim);
          G.arrow(x, y + s * 0.18 + dy, x, y - s * 0.12 + dy, s * 0.055, s * 0.13, ac);
        }
      },
      robot: function(x, y, s, bodyCol, visorCol, eyeCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var bc = bodyCol || '#1e293b', vc = visorCol || '#0f172a', ec = eyeCol || '#00e5ff';
        var er = s * (0.062 + 0.014 * Math.sin(tt * 3.2));
        if (vv === 1) {
          G.pill(x, y - s * 0.28, x, y - s * 0.44, s * 0.045, rim);
          G.disc(x, y - s * 0.45, s * (0.065 + 0.015 * Math.sin(tt * 3.5)), '#ffd700', rim, lw * 0.7);
          G.box(x - s * 0.42, y + s * 0.02, s * 0.14, s * 0.28, s * 0.05, '#4f46e5', rim, lw * 0.8);
          G.box(x + s * 0.42, y + s * 0.02, s * 0.14, s * 0.28, s * 0.05, '#4f46e5', rim, lw * 0.8);
          G.box(x, y + s * 0.03, s * 0.78, s * 0.60, s * 0.16, bc, rim, lw);
          G.box(x, y - s * 0.01, s * 0.56, s * 0.28, s * 0.09, vc, '#4f46e5', lw * 0.8);
          G.disc(x - s * 0.13, y - s * 0.01, er, ec, null, 0);
          G.disc(x + s * 0.13, y - s * 0.01, er, ec, null, 0);
          for (var mb = -1; mb <= 1; mb++) {
            G.bar(x + mb * s * 0.09, y + s * 0.24, s * 0.055, s * (0.07 + 0.04 * Math.abs(Math.sin(tt * 4.0 + mb))), s * 0.02, '#ffd700', null, 0);
          }
        } else if (vv === 2) {
          G.pill(x - s * 0.16, y - s * 0.26, x - s * 0.24, y - s * 0.43, s * 0.04, rim);
          G.pill(x + s * 0.16, y - s * 0.26, x + s * 0.24, y - s * 0.43, s * 0.04, rim);
          G.disc(x - s * 0.24, y - s * 0.44, s * 0.05, '#ffd700', rim, lw * 0.6);
          G.disc(x + s * 0.24, y - s * 0.44, s * 0.05, ec, rim, lw * 0.6);
          G.disc(x, y + s * 0.04, s * 0.36, bc, rim, lw);
          G.capsule(x, y + s * 0.02, s * 0.52, s * 0.24, vc, '#4f46e5', lw * 0.8);
          G.disc(x + Math.sin(tt * 2.2) * s * 0.14, y + s * 0.02, s * 0.075, ec, '#ffffff', lw * 0.5);
        } else if (vv === 3) {
          G.disc(x, y - s * 0.23, s * 0.18, bc, rim, lw);
          G.box(x, y - s * 0.23, s * 0.26, s * 0.13, s * 0.05, vc, ec, lw * 0.7);
          G.disc(x - s * 0.055, y - s * 0.23, s * 0.032, ec, null, 0);
          G.disc(x + s * 0.055, y - s * 0.23, s * 0.032, ec, null, 0);
          G.capsule(x - s * 0.33, y + s * 0.10 + Math.sin(tt * 2.4) * s * 0.03, s * 0.12, s * 0.32, '#4f46e5', rim, lw * 0.8);
          G.capsule(x + s * 0.33, y + s * 0.10 - Math.sin(tt * 2.4) * s * 0.03, s * 0.12, s * 0.32, '#4f46e5', rim, lw * 0.8);
          G.box(x, y + s * 0.14, s * 0.46, s * 0.44, s * 0.10, bc, rim, lw);
          G.disc(x, y + s * 0.14, s * (0.09 + 0.02 * Math.sin(tt * 3.0)), '#ffd700', rim, lw * 0.65);
        } else if (vv === 4) {
          G.ngon(x, y, s * 0.43, 6, 0, bc, rim, lw);
          G.box(x, y - s * 0.04, s * 0.50, s * 0.24, s * 0.08, vc, ec, lw * 0.75);
          G.disc(x - s * 0.11, y - s * 0.04, er * 0.9, ec, null, 0);
          G.disc(x + s * 0.11, y - s * 0.04, er * 0.9, ec, null, 0);
          G.capsule(x, y + s * 0.17, s * (0.20 + 0.06 * Math.sin(tt * 3.0)), s * 0.055, '#ffd700', null, 0);
        } else if (vv === 5) {
          G.poly([[x - s * 0.24, y + s * 0.26], [x - s * 0.34, y + s * 0.42], [x - s * 0.08, y + s * 0.26]], bc, rim, lw, true);
          G.box(x, y + s * 0.02, s * 0.80, s * 0.58, s * 0.16, bc, rim, lw);
          G.box(x, y - s * 0.02, s * 0.56, s * 0.26, s * 0.08, vc, '#4f46e5', lw * 0.75);
          G.disc(x - s * 0.12, y - s * 0.02, er, ec, null, 0);
          G.disc(x + s * 0.12, y - s * 0.02, er, ec, null, 0);
          G.star(x + s * 0.32, y - s * 0.32, s * 0.10, s * 0.045, 4, tt * 0.9, '#ffd700', rim, lw * 0.55);
        } else {
          G.pill(x, y - s * 0.28, x, y - s * 0.44, s * 0.045, rim);
          G.disc(x, y - s * 0.45, s * (0.065 + 0.015 * Math.sin(tt * 3.5)), '#ffd700', rim, lw * 0.7);
          G.box(x, y + s * 0.03, s * 0.78, s * 0.60, s * 0.16, bc, rim, lw);
          G.box(x, y - s * 0.01, s * 0.56, s * 0.28, s * 0.09, vc, '#4f46e5', lw * 0.8);
          G.disc(x - s * 0.13, y - s * 0.01, er, ec, null, 0);
          G.disc(x + s * 0.13, y - s * 0.01, er, ec, null, 0);
          G.capsule(x, y + s * 0.20, s * (0.22 + 0.06 * Math.sin(tt * 3.0)), s * 0.055, '#38bdf8', null, 0);
        }
      },
      chip: function(x, y, s, pkgCol, pinCol, coreCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var pk = pkgCol || '#1e293b', pn = pinCol || '#38bdf8', cr = coreCol || '#ffd700';
        var kp = s * (0.095 + 0.025 * Math.sin(tt * 3.4));
        if (vv === 1) {
          for (var k1 = 0; k1 < 6; k1++) {
            var a1 = (k1 * Math.PI * 2) / 6;
            G.pill(x + Math.cos(a1) * s * 0.26, y + Math.sin(a1) * s * 0.26, x + Math.cos(a1) * s * 0.42, y + Math.sin(a1) * s * 0.42, s * 0.042, pn);
            G.disc(x + Math.cos(a1) * s * 0.42, y + Math.sin(a1) * s * 0.42, s * 0.055, cr, rim, lw * 0.6);
          }
          G.ngon(x, y, s * 0.34, 6, 0, pk, rim, lw);
          G.ngon(x, y, s * 0.20, 4, 0, '#4f46e5', rim, lw * 0.8);
          G.disc(x, y, kp, cr, rim, lw * 0.65);
        } else if (vv === 2) {
          G.ring(x, y, s * 0.42, s * 0.04, tt * 0.9, tt * 0.9 + Math.PI * 1.45, pn);
          G.disc(x, y, s * 0.34, pk, rim, lw);
          G.box(x, y, s * 0.36, s * 0.36, s * 0.06, '#4f46e5', rim, lw * 0.8);
          G.star(x, y, s * (0.12 + 0.02 * Math.sin(tt * 3.4)), s * 0.055, 4, tt * 0.8, cr, rim, lw * 0.6);
        } else if (vv === 3) {
          var offs3 = [-s * 0.14, 0, s * 0.14];
          for (var i3 = 0; i3 < offs3.length; i3++) {
            G.pill(x + offs3[i3], y - s * 0.42, x + offs3[i3], y - s * 0.26, s * 0.042, pn);
            G.pill(x + offs3[i3], y + s * 0.26, x + offs3[i3], y + s * 0.42, s * 0.042, pn);
          }
          G.ngon(x, y, s * 0.36, 8, Math.PI / 8, pk, rim, lw);
          G.disc(x, y, s * 0.19, '#4f46e5', rim, lw * 0.8);
          G.disc(x, y, kp, cr, rim, lw * 0.65);
        } else if (vv === 4) {
          G.box(x, y, s * 0.96, s * 0.58, s * 0.09, pk, rim, lw);
          for (var p4 = -2; p4 <= 2; p4++) {
            G.pill(x + p4 * s * 0.14, y + s * 0.28, x + p4 * s * 0.14, y + s * 0.40, s * 0.045, cr);
          }
          G.disc(x - s * 0.20, y, s * 0.16, '#4f46e5', pn, lw * 0.8);
          G.disc(x + s * 0.20, y, s * 0.16, '#4f46e5', pn, lw * 0.8);
          G.star(x - s * 0.20, y, s * 0.08, s * 0.035, 4, tt * 2.2, cr, null, 0);
          G.star(x + s * 0.20, y, s * 0.08, s * 0.035, 4, -tt * 2.2, pn, null, 0);
        } else if (vv === 5) {
          G.part(x, y, Math.PI / 4, 1, 1, function() {
            var o5 = [-s * 0.12, 0, s * 0.12];
            for (var k5 = 0; k5 < 3; k5++) {
              G.pill(o5[k5], -s * 0.38, o5[k5], -s * 0.24, s * 0.042, pn);
              G.pill(o5[k5], s * 0.24, o5[k5], s * 0.38, s * 0.042, pn);
              G.pill(-s * 0.38, o5[k5], -s * 0.24, o5[k5], s * 0.042, pn);
              G.pill(s * 0.24, o5[k5], s * 0.38, o5[k5], s * 0.042, pn);
            }
            G.box(0, 0, s * 0.54, s * 0.54, s * 0.08, pk, rim, lw);
            G.box(0, 0, s * 0.28, s * 0.28, s * 0.04, '#4f46e5', rim, lw * 0.75);
            G.disc(0, 0, kp * 0.85, cr, rim, lw * 0.6);
          });
        } else {
          var offs = [-s * 0.16, 0, s * 0.16];
          for (var i = 0; i < offs.length; i++) {
            G.pill(x + offs[i], y - s * 0.42, x + offs[i], y - s * 0.26, s * 0.045, pn);
            G.pill(x + offs[i], y + s * 0.26, x + offs[i], y + s * 0.42, s * 0.045, pn);
            G.pill(x - s * 0.42, y + offs[i], x - s * 0.26, y + offs[i], s * 0.045, pn);
            G.pill(x + s * 0.26, y + offs[i], x + s * 0.42, y + offs[i], s * 0.045, pn);
          }
          G.box(x, y, s * 0.62, s * 0.62, s * 0.08, pk, rim, lw);
          G.box(x, y, s * 0.34, s * 0.34, s * 0.05, '#4f46e5', rim, lw * 0.8);
          G.disc(x, y, kp, cr, rim, lw * 0.65);
        }
      },
      coinStack: function(x, y, s, coinCol, sideCol, starCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var cc = coinCol || '#ffd700', sc = sideCol || '#f59e0b', stc = starCol || '#ffffff';
        var k = 1 + 0.12 * Math.sin(tt * 3.0);
        if (vv === 1) {
          for (var cs = 0; cs < 3; cs++) {
            G.oval(x - s * 0.14, y + s * (0.18 - cs * 0.12), s * 0.28, s * 0.11, 0, cs === 2 ? cc : sc, rim, lw * 0.8);
          }
          G.disc(x + s * 0.16, y + s * (0.05 + 0.03 * Math.sin(tt * 2.6)), s * 0.26, cc, rim, lw);
          G.ngon(x + s * 0.16, y + s * (0.05 + 0.03 * Math.sin(tt * 2.6)), s * 0.11 * k, 4, 0, stc, '#b45309', lw * 0.65);
        } else if (vv === 2) {
          G.box(x - s * 0.12, y + s * 0.20, s * 0.56, s * 0.20, s * 0.05, sc, rim, lw);
          G.box(x + s * 0.10, y + s * 0.02, s * 0.54, s * 0.20, s * 0.05, '#00e5ff', rim, lw);
          G.disc(x, y - s * 0.16, s * 0.24, cc, rim, lw);
          G.star(x, y - s * 0.16, s * 0.11 * k, s * 0.048 * k, 5, -Math.PI / 2, stc, '#b45309', lw * 0.65);
        } else if (vv === 3) {
          G.disc(x - s * 0.22, y + s * 0.16, s * 0.18, sc, rim, lw * 0.8);
          G.disc(x, y, s * 0.22, '#00e5ff', rim, lw * 0.85);
          G.disc(x + s * 0.20, y - s * 0.14, s * 0.25, cc, rim, lw);
          G.star(x + s * 0.20, y - s * 0.14, s * 0.11 * k, s * 0.05 * k, 5, -Math.PI / 2, stc, '#b45309', lw * 0.6);
        } else if (vv === 4) {
          G.ring(x, y, s * 0.43, s * 0.04, tt * 0.9, tt * 0.9 + Math.PI * 1.4, '#00e5ff');
          G.disc(x, y, s * 0.35, cc, rim, lw);
          G.ring(x, y, s * 0.26, s * 0.03, 0, Math.PI * 2, '#b45309');
          G.ngon(x, y, s * 0.14 * k, 4, 0, stc, '#b45309', lw * 0.7);
        } else if (vv === 5) {
          for (var cL = 0; cL < 3; cL++) {
            G.oval(x - s * 0.18, y + s * (0.20 - cL * 0.12), s * 0.22, s * 0.09, 0, cL === 2 ? '#00e5ff' : '#4f46e5', rim, lw * 0.8);
          }
          for (var cR = 0; cR < 4; cR++) {
            G.oval(x + s * 0.18, y + s * (0.22 - cR * 0.12 + Math.sin(tt * 2.5) * 0.02), s * 0.22, s * 0.09, 0, cR === 3 ? cc : sc, rim, lw * 0.8);
          }
          G.star(x + s * 0.18, y - s * 0.32, s * 0.09 * k, s * 0.04 * k, 5, -Math.PI / 2, stc, '#b45309', lw * 0.6);
        } else {
          G.disc(x - s * 0.14, y - s * 0.07, s * 0.27, sc, rim, lw * 0.85);
          G.disc(x + s * 0.07, y + s * 0.05, s * 0.34, cc, rim, lw);
          G.ring(x + s * 0.07, y + s * 0.05, s * 0.25, s * 0.028, 0, Math.PI * 2, '#b45309');
          G.star(x + s * 0.07, y + s * 0.05, s * 0.14 * k, s * 0.062 * k, 5, -Math.PI / 2, stc, '#b45309', lw * 0.7);
        }
      },
`;
