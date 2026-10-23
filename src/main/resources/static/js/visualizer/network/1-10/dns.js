/**
 * DNS 시각화
 */
(function () {
    'use strict';

    var container = document.getElementById('visualizer-container');
    if (!container) return;

    function el(tag, cls, txt) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt !== undefined && txt !== null) e.textContent = txt;
        return e;
    }

    /* ===================== DOM ===================== */
    var root    = el('div', 'dns-viz');
    var toolbar = el('div', 'dns-viz__toolbar');
    var tbLeft  = el('div', 'dns-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'dns-viz__title', 'DNS Recursive Query'));

    var modeWrap = el('div', 'dns-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'dns-viz__mode-btn' + (i === 0 ? ' dns-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'dns-viz__speed');
    speedWrap.appendChild(el('span', 'dns-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'dns-viz__speed-btn' + (i === 0 ? ' dns-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'dns-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'dns-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'dns-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'dns-viz__controls');
    var btnPlay  = el('button', 'dns-viz__btn dns-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'dns-viz__btn', '▶| STEP');
    var btnReset = el('button', 'dns-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  vizStart);
    btnStep.addEventListener('click',  vizStep);
    btnReset.addEventListener('click', vizReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnStep);
    controls.appendChild(btnReset);
    root.appendChild(controls);
    container.appendChild(root);

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = '';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1900;
    var anim    = 1;

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        var rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + w, y,     x + w, y + h, rad);
        ctx.arcTo(x + w, y + h, x,     y + h, rad);
        ctx.arcTo(x,     y + h, x,     y,     rad);
        ctx.arcTo(x,     y,     x + w, y,     rad);
        ctx.closePath();
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;              ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    }
    function tx(str, x, y, sz, color, align, bold) {
        if (sz < 9.5) sz = 9.5;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }
    function ln(x1, y1, x2, y2, color, lw, dash) {
        ctx.beginPath();
        ctx.setLineDash(dash || []);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw || 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
    }
    function arrow(x1, y1, x2, y2, color, lw, dash) {
        ln(x1, y1, x2, y2, color, lw, dash);
        var a = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4));
        ctx.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }
    function circ(x, y, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;   ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    }
    var tipHits = [];
    var mousePos = { x: -1, y: -1 };
    var hoveredKey = null;
    function tipHit(x, y, w, h, key) { tipHits.push({ x: x, y: y, w: w, h: h, key: key }); }
    function tipBadge(cx, cy, key) {
        var on = hoveredKey === key;
        circ(cx, cy, 7, on ? P.purple + '44' : 'none', P.purple + (on ? 'ff' : '99'), 1.2);
        tx('?', cx, cy, 9.5, on ? P.text + 'ff' : P.sub + 'ff', 'center', true);
        tipHit(cx - 10, cy - 10, 20, 20, key);
    }
    function drawTip(mx, my, text) {
        var parts = text.split(String.fromCharCode(10));
        var title = parts[0], desc = parts[1] || '';
        var W = GW(), H = GH();
        var pad = 14;
        var maxIn = W - 16 - pad * 2;
        ctx.font = '700 14px "JetBrains Mono",monospace';
        var tl = window.CsFlow.wrapText(ctx, title, maxIn);
        var titleW = 0;
        tl.forEach(function (l) { titleW = Math.max(titleW, ctx.measureText(l).width); });
        ctx.font = '400 13px "JetBrains Mono",monospace';
        var dl = desc ? window.CsFlow.wrapText(ctx, desc, maxIn) : [];
        var descW = 0;
        dl.forEach(function (l) { descW = Math.max(descW, ctx.measureText(l).width); });
        var tw = Math.min(W - 16, Math.max(titleW, descW) + pad * 2);
        var th = desc ? 24 + tl.length * 18 + dl.length * 18 : 18 + tl.length * 18;
        var bx = mx + 14, by = my - th - 8;
        if (bx + tw > W - 8) bx = mx - tw - 14;
        if (bx < 8) bx = 8;
        if (by < 8) by = my + 14;
        if (by + th > H - 8) by = H - th - 8;
        rr(bx, by, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        tl.forEach(function (l, i) { tx(l, bx + pad, by + 18 + i * 18, 14, P.text + 'ff', 'left', true); });
        dl.forEach(function (l, i) { tx(l, bx + pad, by + 24 + tl.length * 18 + i * 18, 13, P.sub + 'ff', 'left', false); });
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 노드 정의 ===================== */
    var NODES = [
        { id: 0, label: 'CLIENT',    sub: 'Browser',         color: 'purple' },
        { id: 1, label: 'LOCAL DNS', sub: 'Recursive Resolver', color: 'teal'   },
        { id: 2, label: 'ROOT DNS',  sub: '. (root)',         color: 'yellow' },
        { id: 3, label: 'TLD DNS',   sub: '.com NS',          color: 'orange' },
        { id: 4, label: 'AUTH DNS',  sub: 'example.com NS',   color: 'green'  },
    ];

    function nColor(name) {
        if (name === 'purple') return P.purple;
        if (name === 'teal')   return P.teal;
        if (name === 'yellow') return P.yellow;
        if (name === 'orange') return P.orange;
        if (name === 'green')  return P.green;
        return P.purple;
    }

    /* ===================== 시나리오 ===================== */
    var STEPS = [
        {
            log: '초기 상태. 브라우저에 example.com을 입력했습니다. OS는 먼저 /etc/hosts와 브라우저 캐시를 확인합니다. 캐시에 없으면 로컬 DNS 리졸버에 질의합니다.',
            pkt: null,
            active: [0],
        },
        {
            log: 'Step 1 — 클라이언트 → 로컬 DNS. 브라우저가 로컬 DNS 리졸버(보통 ISP 제공)에 "example.com의 IP가 무엇인가요?" 질의합니다. UDP 53번 포트를 사용합니다.',
            pkt: { from: 0, to: 1, dir: 'query', label: 'example.com?', color: 'purple' },
            active: [0, 1],
        },
        {
            log: 'Step 2 — 로컬 DNS → 루트 DNS. 로컬 리졸버 캐시에 없습니다. 루트 DNS 서버에 "example.com의 IP가 무엇인가요?" 질의합니다. 루트 서버 주소는 리졸버에 하드코딩되어 있습니다.',
            pkt: { from: 1, to: 2, dir: 'query', label: 'example.com?', color: 'teal' },
            active: [1, 2],
        },
        {
            log: 'Step 3 — 루트 DNS 응답. 루트 서버는 IP를 모르지만 .com TLD 네임서버 주소를 알고 있습니다. "저는 모릅니다. .com NS는 a.gtld-servers.net입니다"라고 응답합니다.',
            pkt: { from: 2, to: 1, dir: 'answer', label: '.com NS 주소 반환', color: 'yellow' },
            active: [1, 2],
        },
        {
            log: 'Step 4 — 로컬 DNS → TLD DNS. .com TLD 서버에 "example.com의 IP가 무엇인가요?" 질의합니다. TLD 서버는 example.com의 권한 네임서버를 알고 있습니다.',
            pkt: { from: 1, to: 3, dir: 'query', label: 'example.com?', color: 'teal' },
            active: [1, 3],
        },
        {
            log: 'Step 5 — TLD DNS 응답. "저는 모릅니다. example.com의 NS는 ns1.example.com입니다"라고 응답합니다. 권한 네임서버 주소를 알려줍니다.',
            pkt: { from: 3, to: 1, dir: 'answer', label: 'example.com NS 주소 반환', color: 'orange' },
            active: [1, 3],
        },
        {
            log: 'Step 6 — 로컬 DNS → 권한 DNS. example.com의 권한 네임서버에 직접 질의합니다. 권한 서버는 해당 도메인의 모든 레코드를 갖고 있습니다.',
            pkt: { from: 1, to: 4, dir: 'query', label: 'example.com A record?', color: 'teal' },
            active: [1, 4],
        },
        {
            log: 'Step 7 — 권한 DNS 응답. 드디어 실제 IP를 반환합니다. "example.com → 93.184.216.34 (TTL: 3600)"를 응답합니다. 로컬 DNS는 이 결과를 TTL 동안 캐시합니다.',
            pkt: { from: 4, to: 1, dir: 'answer', label: '93.184.216.34 (TTL 3600)', color: 'green' },
            active: [1, 4],
        },
        {
            log: 'Step 8 — 로컬 DNS → 클라이언트. 최종 IP 주소를 클라이언트에 전달합니다. 브라우저는 93.184.216.34로 TCP 연결을 시작합니다. 전체 과정 완료 ✓',
            pkt: { from: 1, to: 0, dir: 'answer', label: '93.184.216.34 반환 ✓', color: 'purple' },
            active: [0, 1],
            done: true,
        },
    ];

    let pktMoving = false;
    let pktProg   = 1;
    let history   = [];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return STEPS;
    }
    function defaultLog() {
        return '▶ PLAY를 눌러 DNS 재귀 질의 과정을 확인하세요.';
    }

    /* ===================== 레이아웃 ===================== */
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function dnW(str, sz, bold) {
        ctx.font = (bold ? '700 ' : '400 ') + sz + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }

    function layout(w, mob) {
        var fs = mob ? 11 : 12;
        var lh = mob ? 14 : 16;
        var edge = mob ? 14 : 70;
        var dh = mob ? 58 : 66;
        var hb = mob ? 34 : 50;
        var nMsg = STEPS.filter(function (st) { return st.pkt; }).length;
        var maxLines = 1;
        STEPS.forEach(function (st) {
            if (!st.pkt) return;
            var n = lines(st.pkt.label, w - 4, fs).length;
            if (n > maxLines) maxLines = n;
        });
        var rh = maxLines * lh + (mob ? 18 : 28);
        var rowsTop = dh + 8 + hb + 8;
        var cy = rowsTop + nMsg * rh + 10;
        var p2 = 12 + lh + 8;
        var p3 = p2 + lh + 4;
        var p4 = p3 + lh / 2 + 6;
        return { mob: mob, fs: fs, lh: lh, rh: rh, edge: edge, lane: (w - edge * 2) / 4,
                 dh: dh, hb: hb, nMsg: nMsg, rowsTop: rowsTop, cy: cy,
                 ayOff: mob ? 6 : 8, labOff: mob ? 12 : 14, headR: mob ? 8 : 11,
                 p2: p2, p3: p3, p4: p4, ph: p4 + 14, total: cy + p4 + 22 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 도메인 풀이 ===================== */
    function dnX(L, x0, i) { return x0 + L.edge + i * L.lane; }

    function dnCX(cx, str, sz, bold, x0, w) {
        var hw = dnW(str, sz, bold) / 2 + 2;
        return Math.min(x0 + w - hw, Math.max(x0 + hw, cx));
    }

    function dnResolved(k) {
        if (k < 2) return 0;
        if (k >= 8) return 3;
        return k % 2 === 0 ? (k - 2) / 2 : (k - 1) / 2;
    }
    function dnCurrent(k) {
        return (k >= 2 && k <= 6 && k % 2 === 0) ? (k - 2) / 2 : -1;
    }
    function dnChipState(k, r) {
        if (r < dnResolved(k)) return 2;
        if (r === dnCurrent(k)) return 1;
        return 0;
    }
    function dnChip(x, y, w, h, label, st, fs, a) {
        var col = st === 2 ? P.green : (st === 1 ? P.yellow : P.sub);
        ctx.globalAlpha = a;
        if (st === 0) rr(x, y, w, h, 5, 'none', P.sub + '77', 1.2);
        else rr(x, y, w, h, 5, col + '30', col + 'ff', 1.8);
        tx(label, x + w / 2, y + h / 2, fs, st === 0 ? P.sub + 'ff' : P.text + 'ff', 'center', st !== 0);
        ctx.globalAlpha = 1;
    }

    /* ===================== 메시지 ===================== */
    function dnMsg(L, x0, w, rowTop, pkt, e) {
        var fs = L.fs;
        var col = nColor(pkt.color);
        var ay = rowTop + L.rh - L.ayOff;
        var xa = dnX(L, x0, pkt.from);
        var xb = dnX(L, x0, pkt.to);
        var moving = e < 1;
        if (moving) {
            var head = xa + (xb - xa) * ez(seg(e, 0.05, 0.85));
            ln(xa, ay, head, ay, col + '77', 2);
            circ(head, ay, L.headR, col + '33', col + 'ff', 1.6);
            tx(pkt.dir === 'query' ? '?' : '!', head, ay, fs, col + 'ff', 'center', true);
        } else {
            arrow(xa, ay, xb, ay, col + 'ff', 2);
        }
        var la = moving ? seg(e, 0.4, 0.9) : 1;
        var ls = lines(pkt.label, w - 4, fs);
        var lw = 0;
        ls.forEach(function (l) { lw = Math.max(lw, dnW(l, fs, true)); });
        var mx = Math.min(x0 + w - lw / 2 - 2, Math.max(x0 + lw / 2 + 2, (xa + xb) / 2));
        ctx.globalAlpha = la;
        ls.forEach(function (l, li) {
            tx(l, mx, ay - L.labOff - (ls.length - 1 - li) * L.lh, fs, col + 'ff', 'center', true);
        });
        ctx.globalAlpha = 1;
    }

    function dnCacheInfo() {
        var hit = '';
        STEPS.forEach(function (st) {
            if (!hit && st.pkt && /TTL/.test(st.pkt.label)) hit = st.pkt.label;
        });
        var ip = hit.match(/\d+\.\d+\.\d+\.\d+/);
        var ttl = hit.match(/TTL\s*(\d+)/);
        return { ip: ip ? ip[0] : '', ttl: ttl ? ttl[1] : '' };
    }

    /* ===================== 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs;
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var k = steps.indexOf(s);
        var kp = steps.indexOf(p);
        var fresh = p !== s;
        var e = fresh ? clamp01(t) : 1;
        var hy = top + L.dh + 8;
        var rowsTop = top + L.rowsTop;
        var lifeEnd = rowsTop + L.nMsg * L.rh + 2;

        NODES.forEach(function (node, i) {
            var cx = dnX(L, x0, i);
            var col = nColor(node.color);
            var lit = s.active.indexOf(i) !== -1;
            ln(cx, hy + L.hb, cx, lifeEnd, lit ? col + 'aa' : P.sub + '55', lit ? 2 : 1.2, lit ? [] : [4, 4]);
        });

        NODES.forEach(function (node, i) {
            var cx = dnX(L, x0, i);
            var col = nColor(node.color);
            var isAct = s.active.indexOf(i) !== -1;
            var parts = node.label.split(' ');
            var bw = L.lane - 4;
            if (L.mob) {
                var tw = 0;
                parts.forEach(function (pt) { tw = Math.max(tw, dnW(pt, fs, true)); });
                bw = Math.min(L.lane - 4, tw + 10);
            }
            var fg = isAct ? col + 'ff' : P.sub + 'ff';
            rr(cx - bw / 2, hy, bw, L.hb, 5, isAct ? col + '28' : P.surf, isAct ? col + 'ff' : P.border, isAct ? 2 : 1.2);
            if (L.mob) {
                if (parts.length > 1) {
                    tx(parts[0], cx, hy + L.hb / 2 - L.lh / 2, fs, fg, 'center', true);
                    tx(parts[1], cx, hy + L.hb / 2 + L.lh / 2, fs, fg, 'center', true);
                } else {
                    tx(parts[0], cx, hy + L.hb / 2, fs, fg, 'center', true);
                }
            } else {
                tx(node.label, cx, hy + L.hb * 0.36, fs, fg, 'center', true);
                tx(node.sub, cx, hy + L.hb * 0.74, fs - 1.5, P.sub + 'ff', 'center', false);
            }
        });

        var chipY = top + 18;
        var chipH = 22;
        var toks = [{ t: 'example', r: 2, z: 'AUTH' }, { t: 'com', r: 1, z: 'TLD' }, { t: '.', r: 0, z: 'ROOT' }];
        tx('질의 이름: 오른쪽(.)부터 풀기', x0, top + 6, fs, P.sub + 'ff', 'left', true);
        var cxp = x0;
        toks.forEach(function (tk, ti) {
            var cwid = Math.max(dnW(tk.t, fs, true) + 12, 22);
            var st = dnChipState(k, tk.r);
            var sp = dnChipState(kp, tk.r);
            if (fresh && st !== sp) {
                dnChip(cxp, chipY, cwid, chipH, tk.t, sp, fs, 1 - e);
                dnChip(cxp, chipY, cwid, chipH, tk.t, st, fs, e);
            } else {
                dnChip(cxp, chipY, cwid, chipH, tk.t, st, fs, 1);
            }
            var zc = st === 2 ? P.green : (st === 1 ? P.yellow : P.sub);
            tx(tk.z, dnCX(cxp + cwid / 2, tk.z, fs, st !== 0, x0, w), chipY + chipH + 10, fs, zc + 'ff', 'center', st !== 0);
            cxp += cwid;
            if (ti === 0) {
                tx('.', cxp + 4, chipY + chipH / 2, fs, P.sub + 'ff', 'center', true);
                cxp += 9;
            }
        });

        var rowsBase = rowsTop;
        for (var i = 1; i < steps.length; i++) {
            if (!steps[i].pkt || i > k) continue;
            dnMsg(L, x0, w, rowsBase + (i - 1) * L.rh, steps[i].pkt, i === k ? e : 1);
        }

        if (k === 0) {
            var hint = '(아직 보낸 질의가 없습니다)';
            var hw = dnW(hint, fs, false) + 16;
            var hcy = rowsTop + L.rh * 2 + L.rh / 2;
            rr(x0 + w / 2 - hw / 2, hcy - 10, hw, 20, 5, P.surf, P.sub + '44', 1);
            tx(hint, x0 + w / 2, hcy, fs, P.sub + 'ff', 'center', false);
        }

        var info = dnCacheInfo();
        var cy = top + L.cy;
        var stored = k >= 7;
        var newly = stored && fresh && kp < 7;
        var a = newly ? ez(seg(e, 0.3, 0.7)) : (stored ? 1 : 0);
        var titleY = cy + 12;
        var recY = cy + L.p2;
        var ttlY = cy + L.p3;
        var barY = cy + L.p4;
        rr(x0, cy, w, L.ph, 6, 'none', P.sub + '66', 1.2);
        tx('로컬 DNS 캐시', x0 + 10, titleY, fs, P.sub + 'ff', 'left', true);
        if (s.done) tx(L.mob ? '✓ 완료' : '✓ 전체 과정 완료', x0 + w - 10, titleY, fs, P.green + 'ff', 'right', true);
        if (a < 1) {
            ctx.globalAlpha = 1 - a;
            tx('(아직 저장된 응답이 없습니다)', x0 + 10, recY, fs, P.sub + 'ff', 'left', false);
            ctx.globalAlpha = 1;
        }
        if (a > 0) {
            if (newly && e < 1) {
                ctx.globalAlpha = 1 - seg(e, 0.6, 1);
                rr(x0 + 6, recY - L.lh / 2 - 3, w - 12, L.lh + 6, 4, P.yellow + '33', P.yellow + 'ff', 1.2);
                ctx.globalAlpha = 1;
            }
            ctx.globalAlpha = a;
            tx('example.com A ' + info.ip, x0 + 10, recY, fs, P.text + 'ff', 'left', true);
            tx('TTL ' + info.ttl + '초 동안 재사용', x0 + 10, ttlY, fs, P.sub + 'ff', 'left', false);
            ctx.globalAlpha = 1;
        }
        rr(x0 + 10, barY, w - 20, 6, 3, P.sub + '33', null);
        var fill = a > 0 ? (newly ? ez(seg(e, 0.35, 0.95)) : 1) : 0;
        if (fill > 0) rr(x0 + 10, barY, (w - 20) * fill, 6, 3, P.green + 'cc', null);
    }

    /* ===================== 메인 드로우 ===================== */
    function sidePad(w) { return w < 600 ? 14 : 24; }
    function topPad(w) { return w < 600 ? 14 : 20; }

    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;
        var prev = stepIdx > 0 ? steps[stepIdx - 1] : null;
        tipHits.length = 0;
        drawScene(sidePad(W), topPad(W), W - sidePad(W) * 2, mob, step, prev, anim);
        if (hoveredKey && typeof TIPS !== 'undefined' && TIPS[hoveredKey]) drawTip(mousePos.x, mousePos.y, TIPS[hoveredKey]);
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH = 260;
        currentSteps().concat([null]).forEach(function (s) {
            var h = topPad(w) + sceneH(w - sidePad(w) * 2, mob, s) + 14;
            if (h > neededH) neededH = h;
        });
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = Math.ceil(neededH) + 'px';
        var actualH = canvasWrap.offsetHeight || neededH;
        if (actualH < neededH) actualH = neededH;
        canvas.width  = w * dpr;
        canvas.height = actualH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 애니메이션(스텝 전환) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        var dur = Math.max(320, speed * 0.55);
        var t0 = null;
        function frame(now) {
            if (t0 === null) t0 = now;
            var p = Math.min(1, (now - t0) / dur);
            anim = p;
            draw();
            if (p < 1) { rafId = requestAnimationFrame(frame); }
            else { rafId = null; anim = 1; if (onDone) onDone(); }
        }
        anim = 0;
        rafId = requestAnimationFrame(frame);
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        logEl.textContent = currentSteps()[idx].log;
        animateStep(function () { if (onDone) setTimeout(onDone, 0); });
    }

    function vizStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setSpeedDisabled(true);
        var steps = currentSteps();
        function tick() {
            var next = stepIdx + 1;
            if (next >= steps.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function () {
                if (next === steps.length - 1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed * 0.6);
                }
            });
        }
        tick();
    }

    function vizStep() {
        if (running) return;
        var steps = currentSteps();
        var next = stepIdx + 1;
        if (next >= steps.length) return;
        applyStep(next, null);
        if (next === steps.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function vizReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; anim = 1;
        btnPlay.disabled = false; btnStep.disabled = false;
        logEl.textContent = defaultLog();
        setSpeedDisabled(false);
        resize();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        speedBtns.forEach(function (b) { b.classList.remove('dns-viz__speed-btn--active'); });
        btn.classList.add('dns-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('dns-viz__mode-btn--active', d.key === m); });
        vizReset();
    }

    logEl.textContent = defaultLog();

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas: canvas, canvasWrap: canvasWrap, resize: resize, draw: draw,
        getState : function () { return { rafId: rafId, timer: timer, running: running }; },
        setState : function (s) { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause  : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return {
                GW: GW, GH: GH,
                mousePos: mousePos,
                tooltipHits: tipHits,
                hoveredKey: function () { return hoveredKey; },
                setHoveredKey: function (k) { hoveredKey = k; },
                draw: draw
            };
        }
    });

    setTimeout(resize, 60);
})();