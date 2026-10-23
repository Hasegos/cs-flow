/**
 * HTTP/1.1 vs HTTP/2 시각화
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
    var root    = el('div', 'http-viz');
    var toolbar = el('div', 'http-viz__toolbar');
    var tbLeft  = el('div', 'http-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'http-viz__title', 'HTTP Request / Response'));

    var modeWrap = el('div', 'http-viz__mode');
    var modeDefs = [
        { key: 'http1', label: 'HTTP/1.1' },
        { key: 'http2', label: 'HTTP/2' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'http-viz__mode-btn' + (i === 0 ? ' http-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'http-viz__speed');
    speedWrap.appendChild(el('span', 'http-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'http-viz__speed-btn' + (i === 0 ? ' http-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'http-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'http-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'http-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'http-viz__controls');
    var btnPlay  = el('button', 'http-viz__btn http-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'http-viz__btn', '▶| STEP');
    var btnReset = el('button', 'http-viz__btn', '↺ RESET');
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
    var mode    = 'http1';
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
        var titleW = Math.min(maxIn, ctx.measureText(title).width);
        ctx.font = '400 13px "JetBrains Mono",monospace';
        var dl = desc ? window.CsFlow.wrapText(ctx, desc, maxIn) : [];
        var descW = 0;
        dl.forEach(function (l) { descW = Math.max(descW, ctx.measureText(l).width); });
        var tw = Math.min(W - 16, Math.max(titleW, descW) + pad * 2);
        var th = desc ? 42 + dl.length * 18 : 36;
        var bx = mx + 14, by = my - th - 8;
        if (bx + tw > W - 8) bx = mx - tw - 14;
        if (bx < 8) bx = 8;
        if (by < 8) by = my + 14;
        if (by + th > H - 8) by = H - th - 8;
        rr(bx, by, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        tx(title, bx + pad, by + (desc ? 18 : th / 2), 14, P.text + 'ff', 'left', true);
        dl.forEach(function (l, i) { tx(l, bx + pad, by + 42 + i * 18, 13, P.sub + 'ff', 'left', false); });
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 시나리오 ===================== */
    const SCENARIOS = {
        http1: [
            {
                log: 'HTTP/1.1 — 하나의 TCP 연결로 순차 요청합니다. 첫 번째 요청부터 시작합니다. HOL(Head-of-Line) 블로킹으로 이전 응답을 받아야 다음 요청을 보낼 수 있습니다.',
                pkts: null,
                phase: 'init',
            },
            {
                log: 'Step 1 — GET /index.html 요청. 브라우저가 HTML 파일을 요청합니다.',
                pkts: [{ dir: 'c2s', label: 'GET /index.html', sub: 'HTTP/1.1  Host: example.com', color: 'purple', slot: 0 }],
                phase: 'req1',
            },
            {
                log: 'Step 2 — 200 OK 응답. 서버가 HTML을 반환합니다. 이 응답이 도착해야 다음 요청을 보낼 수 있습니다.',
                pkts: [{ dir: 's2c', label: '200 OK', sub: 'Content-Type: text/html', color: 'green', slot: 0 }],
                phase: 'res1',
            },
            {
                log: 'Step 3 — GET /style.css 요청. HTML 파싱 후 CSS를 요청합니다. HTTP/1.1은 이전 응답 완료 후에야 다음 요청 가능합니다.',
                pkts: [{ dir: 'c2s', label: 'GET /style.css', sub: 'HTTP/1.1  Keep-Alive', color: 'teal', slot: 1 }],
                phase: 'req2',
            },
            {
                log: 'Step 4 — 200 OK 응답. CSS 파일을 반환합니다.',
                pkts: [{ dir: 's2c', label: '200 OK', sub: 'Content-Type: text/css', color: 'teal', slot: 1 }],
                phase: 'res2',
            },
            {
                log: 'Step 5 — GET /script.js 요청. JS 파일을 순차적으로 요청합니다.',
                pkts: [{ dir: 'c2s', label: 'GET /script.js', sub: 'HTTP/1.1  Keep-Alive', color: 'orange', slot: 2 }],
                phase: 'req3',
            },
            {
                log: 'Step 6 — 200 OK 응답 ✓  3개 리소스를 모두 받았습니다. HTTP/1.1은 요청→응답→요청→응답 순서로 처리해 총 6번의 왕복이 필요했습니다.',
                pkts: [{ dir: 's2c', label: '200 OK', sub: 'Content-Type: application/javascript', color: 'orange', slot: 2 }],
                phase: 'res3',
                done: true,
            },
        ],
        http2: [
            {
                log: 'HTTP/2 — 하나의 TCP 연결에서 멀티플렉싱으로 여러 스트림을 동시에 처리합니다. 스트림 ID(홀수)로 각 요청을 구분합니다.',
                pkts: null,
                phase: 'init',
            },
            {
                log: 'Step 1 — 3개 요청 동시 전송. Stream 1(HTML)·Stream 3(CSS)·Stream 5(JS)를 한꺼번에 전송합니다. HTTP/1.1의 HOL 블로킹이 없습니다.',
                pkts: [
                    { dir: 'c2s', label: 'GET /index.html', sub: 'Stream ID: 1', color: 'purple', slot: 0 },
                    { dir: 'c2s', label: 'GET /style.css',  sub: 'Stream ID: 3', color: 'teal',   slot: 1 },
                    { dir: 'c2s', label: 'GET /script.js',  sub: 'Stream ID: 5', color: 'orange', slot: 2 },
                ],
                phase: 'req_all',
            },
            {
                log: 'Step 2 — 3개 응답 동시 수신 ✓  서버가 준비된 순서대로 응답합니다. 스트림별로 독립 처리되어 한 응답이 느려도 다른 응답에 영향 없습니다. HTTP/1.1 대비 왕복 횟수가 절반으로 줄었습니다.',
                pkts: [
                    { dir: 's2c', label: '200 OK (HTML)', sub: 'Stream ID: 1', color: 'purple', slot: 0 },
                    { dir: 's2c', label: '200 OK (CSS)',  sub: 'Stream ID: 3', color: 'teal',   slot: 1 },
                    { dir: 's2c', label: '200 OK (JS)',   sub: 'Stream ID: 5', color: 'orange', slot: 2 },
                ],
                phase: 'res_all',
                done: true,
            },
        ],
    };

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return SCENARIOS[mode];
    }
    function defaultLog() {
        return mode === 'http2'
            ? '▶ PLAY를 눌러 HTTP/2 멀티플렉싱 흐름을 확인하세요.'
            : '▶ PLAY를 눌러 HTTP/1.1 요청/응답 흐름을 확인하세요.';
    }
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }

    /* ===================== 자원 모델 ===================== */
    function htModel(steps) {
        var res = [];
        steps.forEach(function (st, i) {
            (st.pkts || []).forEach(function (pk) {
                if (!res[pk.slot]) res[pk.slot] = { name: '', color: pk.color, reqK: -1, resK: -1 };
                var r = res[pk.slot];
                if (pk.dir === 'c2s' && r.reqK < 0) { r.reqK = i; r.name = pk.label.replace(/^GET /, ''); }
                if (pk.dir === 's2c' && r.resK < 0) r.resK = i;
            });
        });
        return res;
    }
    function htState(m, k, r) {
        if (k < m[r].reqK) return 'wait';
        if (k < m[r].resK) return 'req';
        return 'done';
    }
    function htStreamId(steps, slot) {
        var id = '';
        steps.forEach(function (st) {
            (st.pkts || []).forEach(function (pk) {
                var m = pk.sub.match(/Stream ID: (\d+)/);
                if (!id && m && pk.slot === slot) id = m[1];
            });
        });
        return id;
    }

    /* ===================== 드로우 헬퍼 ===================== */
    function htW(str, sz, bold) {
        ctx.font = (bold ? '700 ' : '400 ') + sz + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }
    function htSpan(tl, tr, label, fs, c2s) {
        var hw = (htW(label, fs, true) + 14) / 2;
        var xl = tl + hw;
        var xr = Math.max(xl, tr - hw);
        return c2s ? { a: xl, b: xr } : { a: xr, b: xl };
    }
    function htLaneY(pipeTop, L, i) {
        return pipeTop + L.padV + L.laneH * (i + 0.5);
    }
    function htChip(cx, cy, label, col, fs, h, a) {
        var cw = htW(label, fs, true) + 14;
        ctx.globalAlpha = a;
        rr(cx - cw / 2, cy - h / 2, cw, h, h / 2, col + 'ff', null);
        tx(label, cx, cy, fs, '#111111', 'center', true);
        ctx.globalAlpha = 1;
    }
    function htHost(x, y, bw, hb, label, col, lit, done, fs) {
        var c = done ? P.green : col;
        if (lit) {
            rr(x, y, bw, hb, 6, c + '28', c + 'ff', 2);
            tx(label, x + bw / 2, y + hb / 2, fs, c + 'ff', 'center', true);
        } else {
            rr(x, y, bw, hb, 6, P.surf, P.border, 1.2);
            tx(label, x + bw / 2, y + hb / 2, fs, P.sub + 'ff', 'center', true);
        }
    }
    function htCard(x, y, cw, h, name, col, st, waitTxt, fs, a) {
        ctx.globalAlpha = a;
        if (st === 'done') rr(x, y, cw, h, 6, P.green + '22', P.green + 'ff', 1.6);
        else if (st === 'req') rr(x, y, cw, h, 6, col + '22', col + 'ff', 1.6);
        else rr(x, y, cw, h, 6, 'none', P.sub + '77', 1.2);
        var tc = st === 'wait' ? P.sub + 'ff' : col + 'ff';
        var sc = st === 'done' ? P.green + 'ff' : (st === 'req' ? col + 'ff' : P.sub + 'ff');
        tx(name, x + cw / 2, y + h * 0.36, fs, tc, 'center', true);
        tx(st === 'done' ? '✓ 완료' : (st === 'req' ? '응답 대기' : waitTxt), x + cw / 2, y + h * 0.72, fs, sc, 'center', false);
        ctx.globalAlpha = 1;
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var http2 = mode === 'http2';
        var fs = mob ? 11 : 12;
        var lh = mob ? 14 : 16;
        var hb = mob ? 30 : 34;
        var bw = mob ? 70 : 104;
        var laneH = mob ? 30 : 36;
        var padV = mob ? 6 : 8;
        var lanes = http2 ? 3 : 1;
        var ph = lanes * laneH + padV * 2;
        var cardH = mob ? 44 : 50;
        var capRows = 1;
        currentSteps().forEach(function (st) {
            var n = 0;
            (st.pkts || []).forEach(function (pk) {
                n += lines(pk.label + '  ' + pk.sub, w - 4, fs).length;
            });
            if (n > capRows) capRows = n;
        });
        var yPipe = hb + (mob ? 10 : 14);
        var yCards = yPipe + ph + (mob ? 12 : 16);
        var yCap = yCards + lh + 6 + cardH + (mob ? 10 : 14);
        return {
            mob: mob, fs: fs, lh: lh, hb: hb, bw: bw, laneH: laneH, padV: padV,
            lanes: lanes, ph: ph, cardH: cardH, yPipe: yPipe, yCards: yCards, yCap: yCap,
            total: yCap + capRows * lh + 8,
            chipH: mob ? 18 : 20, gapC: mob ? 6 : 10, tagW: http2 ? 48 : 12
        };
    }
    function sceneH(w, mob) {
        return layout(w, mob).total;
    }

    /* ===================== 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var steps = currentSteps();
        var s = step || steps[0];
        var k = step ? steps.indexOf(step) : -1;
        var kp = prev ? steps.indexOf(prev) : -1;
        var fresh = !!step && !!prev && prev !== step;
        var e = fresh ? ez(t) : 1;
        var fs = L.fs;
        var http2 = mode === 'http2';
        var res = htModel(steps);
        var pipeTop = top + L.yPipe;
        var tl = x0 + L.tagW;
        var tr = x0 + w - 12;
        var pk0 = s.pkts ? s.pkts[0] : null;

        var litL = false;
        var litR = false;
        if (s.done) {
            litL = true;
            litR = true;
        } else if (step && pk0) {
            var fromLeft = pk0.dir === 'c2s';
            var arrived = !fresh || e >= 1;
            litL = arrived ? !fromLeft : fromLeft;
            litR = !litL;
        }
        htHost(x0, top, L.bw, L.hb, 'BROWSER', P.purple, litL, s.done, fs);
        htHost(x0 + w - L.bw, top, L.bw, L.hb, 'SERVER', P.teal, litR, s.done, fs);
        tx('TCP 연결 1개', x0 + w / 2, top + L.hb / 2 - L.lh / 2, fs, P.text + 'ff', 'center', true);
        tx(http2 ? '스트림 ' + L.lanes + '개' : 'Keep-Alive', x0 + w / 2, top + L.hb / 2 + L.lh / 2, fs, P.sub + 'ff', 'center', false);

        rr(x0, pipeTop, w, L.ph, 10, P.surf, P.border, 1.2);
        for (var i = 0; i < L.lanes; i++) {
            var ly = htLaneY(pipeTop, L, i);
            ln(http2 ? tl - 6 : x0 + 8, ly, x0 + w - 8, ly, P.sub + '44', 1, [4, 4]);
            if (http2) tx('ID ' + htStreamId(steps, i), x0 + 8, ly, fs, colorOf(res[i].color) + 'ff', 'left', true);
        }

        for (var h = 0; h < k; h++) {
            (steps[h].pkts || []).forEach(function (pk) {
                var sp = htSpan(tl, tr, pk.label, fs, pk.dir === 'c2s');
                var yy = htLaneY(pipeTop, L, http2 ? pk.slot : 0) + (pk.dir === 'c2s' ? -L.laneH * 0.2 : L.laneH * 0.2);
                arrow(sp.a, yy, sp.b, yy, colorOf(pk.color) + '77', 1.4);
            });
        }

        if (!step || k === 0) {
            var nx = steps[1] ? (steps[1].pkts || []) : [];
            nx.forEach(function (pk) {
                var sp = htSpan(tl, tr, pk.label, fs, pk.dir === 'c2s');
                htChip(sp.a, htLaneY(pipeTop, L, http2 ? pk.slot : 0), pk.label, colorOf(pk.color), fs, L.chipH, 0.3);
            });
        }

        if (step && s.pkts) {
            var n = s.pkts.length;
            s.pkts.forEach(function (pk, pi) {
                var cy = htLaneY(pipeTop, L, http2 ? pk.slot : 0);
                var sp = htSpan(tl, tr, pk.label, fs, pk.dir === 'c2s');
                var st0 = n > 1 ? pi * 0.12 : 0;
                var p = fresh ? ez(seg(t, st0, st0 + (n > 1 ? 0.7 : 1))) : 1;
                var cx = sp.a + (sp.b - sp.a) * p;
                ln(sp.a, cy, cx, cy, colorOf(pk.color) + '66', 2);
                htChip(cx, cy, pk.label, colorOf(pk.color), fs, L.chipH, 1);
            });
        }

        var cardsTop = top + L.yCards;
        var nDone = 0;
        res.forEach(function (r, i) {
            if (htState(res, k, i) === 'done') nDone++;
        });
        tx('리소스 ' + res.length + '개', x0, cardsTop + L.lh / 2, fs, P.sub + 'ff', 'left', false);
        tx('완료 ' + nDone + ' / ' + res.length, x0 + w, cardsTop + L.lh / 2, fs, P.sub + 'ff', 'right', true);
        var cw3 = (w - L.gapC * 2) / 3;
        var cy3 = cardsTop + L.lh + 6;
        res.forEach(function (r, i) {
            var cx3 = x0 + i * (cw3 + L.gapC);
            var col = colorOf(r.color);
            var stNow = htState(res, k, i);
            var wtNow = k <= 0 ? '요청 전' : '차례 대기';
            if (fresh) {
                var stPrev = htState(res, kp, i);
                if (stPrev !== stNow) {
                    htCard(cx3, cy3, cw3, L.cardH, r.name, col, stPrev, kp <= 0 ? '요청 전' : '차례 대기', fs, 1 - e);
                    htCard(cx3, cy3, cw3, L.cardH, r.name, col, stNow, wtNow, fs, e);
                    return;
                }
            }
            htCard(cx3, cy3, cw3, L.cardH, r.name, col, stNow, wtNow, fs, 1);
        });

        var capY = top + L.yCap;
        if (step && s.pkts) {
            ctx.globalAlpha = fresh ? 0.25 + 0.75 * e : 1;
            var yy2 = capY + L.lh / 2;
            s.pkts.forEach(function (pk) {
                lines(pk.label + '  ' + pk.sub, w - 4, fs).forEach(function (txt) {
                    tx(txt, x0 + 2, yy2, fs, colorOf(pk.color) + 'ff', 'left', false);
                    yy2 += L.lh;
                });
            });
            ctx.globalAlpha = 1;
        } else {
            tx(step ? '아직 보낸 메시지가 없습니다.' : '▶ PLAY 또는 STEP으로 첫 요청을 보냅니다.', x0 + w / 2, capY + L.lh / 2, fs, P.sub + 'ff', 'center', false);
        }
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
        speedBtns.forEach(function (b) { b.classList.remove('http-viz__speed-btn--active'); });
        btn.classList.add('http-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('http-viz__mode-btn--active', d.key === m); });
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