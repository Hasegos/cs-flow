/**
 * ARP(주소 결정 프로토콜) 시각화
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
    var root    = el('div', 'arp-viz');
    var toolbar = el('div', 'arp-viz__toolbar');
    var tbLeft  = el('div', 'arp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'arp-viz__title', 'ARP'));

    var modeWrap = el('div', 'arp-viz__mode');
    var modeDefs = [
        { key: 'same', label: '같은 네트워크' },
        { key: 'cache', label: 'ARP 캐시' },
        { key: 'gateway', label: '게이트웨이 너머' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'arp-viz__mode-btn' + (i === 0 ? ' arp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'arp-viz__speed');
    speedWrap.appendChild(el('span', 'arp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'arp-viz__speed-btn' + (i === 0 ? ' arp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'arp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'arp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'arp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'arp-viz__controls');
    var btnPlay  = el('button', 'arp-viz__btn arp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'arp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'arp-viz__btn', '↺ RESET');
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
    var mode    = 'same';
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
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 데이터: 호스트와 프레임 ===================== */
    var HOSTS = [
        { id: 'A', name: 'A', ip: '192.168.0.10', mac: '02:00:00:00:00:0a', col: 'orange' },
        { id: 'B', name: 'B', ip: '192.168.0.20', mac: '02:00:00:00:00:0b', col: 'teal' },
        { id: 'C', name: 'C', ip: '192.168.0.30', mac: '02:00:00:00:00:0c', col: 'purple' },
        { id: 'R', name: '라우터', ip: '192.168.0.1', mac: '02:00:00:00:00:01', col: 'green' }
    ];
    var BCAST = 'ff:ff:ff:ff:ff:ff';
    var OUTSIDE_IP = '8.8.8.8';
    function H(id) {
        var r = null;
        HOSTS.forEach(function (h) { if (h.id === id) r = h; });
        return r;
    }

    function arpReq(from, toIp) {
        return [
            '이더넷 dst ' + BCAST + ' (브로드캐스트)',
            '       src ' + H(from).mac,
            'ARP 요청: ' + toIp + '의 MAC은?',
            '송신자 ' + H(from).ip + ' / ' + H(from).mac
        ];
    }
    function arpRep(from, to) {
        return [
            '이더넷 dst ' + H(to).mac + ' (유니캐스트)',
            '       src ' + H(from).mac,
            'ARP 응답: ' + H(from).ip + '의 MAC은 ' + H(from).mac,
            '송신자 ' + H(from).ip + ' / 대상 ' + H(to).ip
        ];
    }
    function dataFrame(from, to, dstMac, dstIp) {
        return [
            '이더넷 dst ' + dstMac + ' (유니캐스트)',
            '       src ' + H(from).mac,
            'IP 패킷 ' + H(from).ip + ' → ' + dstIp,
            '(데이터)'
        ];
    }

    function st(log, o) {
        var s = { log: log, send: null, to: [], kind: '', label: '', hl: {}, pkt: [], cache: [] };
        for (var k in o) s[k] = o[k];
        return s;
    }
    var ALL_B = ['B', 'C', 'R'];
    var SAME_STEPS = [
        st('같은 네트워크(192.168.0.0/24)의 호스트 A가 B에 데이터를 보내려 합니다. A는 B의 IP 주소만 알고 있습니다. 같은 LAN 안에서는 프레임을 MAC 주소로 전달하므로 B의 MAC 주소가 필요합니다.', {}),
        st('A가 먼저 자기 ARP 캐시에서 ' + H('B').ip + '를 찾지만 항목이 없습니다.', { hl: { A: ['캐시 확인', 'orange'] } }),
        st('ARP 요청 — A가 "' + H('B').ip + '를 가진 장치는 MAC 주소를 알려 달라"는 메시지를 브로드캐스트합니다(목적지 MAC ' + BCAST + '). 상대의 MAC을 모르니 같은 네트워크 모두에게 보냅니다.',
            { send: 'A', to: ALL_B, kind: 'bc', label: 'ARP 요청 (브로드캐스트)', pkt: arpReq('A', H('B').ip), hl: { A: ['요청 보냄', 'orange'] } }),
        st('요청은 같은 LAN의 모든 호스트가 받지만 대상 IP가 자기 것이 아닌 C와 라우터는 응답하지 않고(새 항목도 추가하지 않고), 자기 IP인 B만 반응합니다. RFC 826의 절차에서는 B가 요청의 송신자 정보로 A의 IP-MAC 대응도 자기 캐시에 기록합니다.',
            { send: 'A', to: ALL_B, kind: 'bc', label: 'ARP 요청 (브로드캐스트)', pkt: arpReq('A', H('B').ip), hl: { A: ['요청 보냄', 'orange'], B: ['IP 일치', 'teal'], C: ['무시', 'muted'], R: ['무시', 'muted'] } }),
        st('ARP 응답 — B가 자기 MAC 주소를 A에게만 유니캐스트로 알려 줍니다. 요청에 A의 MAC이 들어 있어 B는 A를 직접 찾아 답할 수 있습니다.',
            { send: 'B', to: ['A'], kind: 'uc', label: 'ARP 응답 (유니캐스트)', pkt: arpRep('B', 'A'), hl: { A: ['응답 받음', 'orange'], B: ['응답 보냄', 'teal'] } }),
        st('A가 응답으로 알아낸 대응(' + H('B').ip + ' → ' + H('B').mac + ')을 ARP 캐시에 저장합니다.',
            { hl: { A: ['캐시 저장', 'orange'] }, cache: [[H('B').ip, H('B').mac, '']] }),
        st('이제 A는 B의 MAC 주소를 알고 데이터 프레임을 B에게 직접(유니캐스트) 보냅니다. 같은 IP로 다시 보낼 때는 캐시를 쓰므로 ARP 요청이 필요 없습니다.',
            { send: 'A', to: ['B'], kind: 'uc', label: '데이터 프레임 (유니캐스트)', pkt: dataFrame('A', 'B', H('B').mac, H('B').ip), hl: { A: ['전송', 'orange'], B: ['수신', 'teal'] }, cache: [[H('B').ip, H('B').mac, '']] })
    ];

    var CB = [[H('B').ip, H('B').mac, '']];
    var CBC = [[H('B').ip, H('B').mac, ''], [H('C').ip, H('C').mac, '']];
    var CACHE_STEPS = [
        st('A의 ARP 캐시에 B의 항목이 이미 있는 상태에서 시작합니다. 캐시는 최근에 알아낸 IP와 MAC의 대응을 잠시 저장해 두는 표입니다.',
            { cache: CB }),
        st('A가 B에게 보냅니다. 캐시에 항목이 있어(캐시 적중) ARP 요청 없이 바로 프레임을 보냅니다.',
            { send: 'A', to: ['B'], kind: 'uc', label: '데이터 프레임 (유니캐스트)', pkt: dataFrame('A', 'B', H('B').mac, H('B').ip), hl: { A: ['캐시 적중', 'orange'], B: ['수신', 'teal'] }, cache: CB }),
        st('이번에는 A가 C(' + H('C').ip + ')에게 보냅니다. 캐시에 C의 항목이 없어(캐시 미스) ARP 요청을 브로드캐스트합니다.',
            { send: 'A', to: ALL_B, kind: 'bc', label: 'ARP 요청 (브로드캐스트)', pkt: arpReq('A', H('C').ip), hl: { A: ['캐시 미스', 'orange'], B: ['무시', 'muted'], C: ['IP 일치', 'purple'], R: ['무시', 'muted'] }, cache: CB }),
        st('C가 자기 MAC 주소를 A에게 유니캐스트로 응답합니다.',
            { send: 'C', to: ['A'], kind: 'uc', label: 'ARP 응답 (유니캐스트)', pkt: arpRep('C', 'A'), hl: { A: ['응답 받음', 'orange'], C: ['응답 보냄', 'purple'] }, cache: CB }),
        st('A가 C의 대응을 캐시에 추가합니다. 이후 C로의 전송은 ARP 없이 이루어집니다.',
            { hl: { A: ['캐시 저장', 'orange'] }, cache: CBC }),
        st('캐시 항목은 영구하지 않습니다. 일정 시간이 지나면 항목을 지우거나 다시 확인합니다(시간은 운영체제마다 다릅니다). 장비가 바뀌어 IP와 MAC의 대응이 달라질 수 있기 때문입니다. 지워진 항목은 다음 전송 때 ARP로 다시 알아냅니다.',
            { hl: { A: ['항목 만료', 'orange'] }, cache: [[H('B').ip, H('B').mac, 'stale'], [H('C').ip, H('C').mac, '']] })
    ];

    var GW_STEPS = [
        st('A가 인터넷의 ' + OUTSIDE_IP + '에 보내려 합니다. 이 주소는 같은 네트워크 밖에 있어 LAN 안에서 직접 전달할 수 없습니다.', {}),
        st('A는 자기 IP와 서브넷 마스크로 목적지가 같은 네트워크(192.168.0.0/24)인지 확인합니다. ' + OUTSIDE_IP + '는 그 밖이므로 기본 게이트웨이(' + H('R').ip + ')에게 보냅니다. 그러려면 목적지가 아니라 게이트웨이의 MAC 주소가 필요합니다.',
            { hl: { A: ['외부로 전송', 'orange'], R: ['게이트웨이', 'green'] } }),
        st('A가 게이트웨이의 MAC 주소를 알아내려고 ARP 요청을 브로드캐스트합니다. 묻는 대상은 ' + OUTSIDE_IP + '가 아니라 ' + H('R').ip + '입니다.',
            { send: 'A', to: ALL_B, kind: 'bc', label: 'ARP 요청 (브로드캐스트)', pkt: arpReq('A', H('R').ip), hl: { A: ['요청 보냄', 'orange'], B: ['무시', 'muted'], C: ['무시', 'muted'], R: ['IP 일치', 'green'] } }),
        st('라우터가 자기 MAC 주소를 A에게 유니캐스트로 응답하고, A는 대응을 캐시에 저장합니다.',
            { send: 'R', to: ['A'], kind: 'uc', label: 'ARP 응답 (유니캐스트)', pkt: arpRep('R', 'A'), hl: { A: ['응답 받음', 'orange'], R: ['응답 보냄', 'green'] }, cache: [[H('R').ip, H('R').mac, '']] }),
        st('A가 프레임을 보냅니다. 이더넷 헤더의 목적지 MAC은 게이트웨이의 MAC이고, IP 헤더의 목적지는 최종 목적지 ' + OUTSIDE_IP + '입니다. MAC은 한 구간(홉)마다, IP는 끝까지 유지됩니다.',
            { send: 'A', to: ['R'], kind: 'uc', label: '데이터 프레임 (유니캐스트)', pkt: dataFrame('A', 'R', H('R').mac, OUTSIDE_IP), hl: { A: ['전송', 'orange'], R: ['수신', 'green'] }, cache: [[H('R').ip, H('R').mac, '']] }),
        st('라우터는 이 프레임을 받아 다음 홉으로 보낼 때, 그 쪽 네트워크에서 ARP로 다음 장치의 MAC을 찾아 이더넷 헤더를 새로 만듭니다. IP 헤더의 최종 목적지는 그대로입니다.',
            { hl: { R: ['다음 홉 전달', 'green'] }, cache: [[H('R').ip, H('R').mac, '']] })
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'cache') return CACHE_STEPS;
        if (mode === 'gateway') return GW_STEPS;
        return SAME_STEPS;
    }
    function defaultLog() {
        if (mode === 'cache') return 'ARP 캐시가 있으면 요청 없이 바로 보내고, 없으면 ARP로 알아내는 과정을 봅니다.';
        if (mode === 'gateway') return '다른 네트워크로 보낼 때 목적지가 아니라 게이트웨이의 MAC 주소를 ARP로 알아내는 과정을 봅니다.';
        return '같은 LAN에서 IP 주소만 아는 상대의 MAC 주소를 ARP로 알아내는 과정을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var bh = mob ? 66 : 56;
        var cardH = mob ? 128 : 104;
        var swY = bh + 22;
        var cardY = swY + 30;
        var cacheY = cardY + cardH + 12;
        return { fs: mob ? 10.5 : 12, bh: bh, swY: swY, cardY: cardY, cardH: cardH, cacheY: cacheY, total: cacheY + 60 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function kindTag(label) {
        if (label.indexOf('요청') >= 0) return 'ARP?';
        if (label.indexOf('응답') >= 0) return 'ARP!';
        return 'DATA';
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        var fs = L.fs;
        var gap = mob ? 8 : 16;
        var bw = (w - gap * 3) / 4;
        var bh = L.bh, swY = top + L.swY;
        var cx = [];
        HOSTS.forEach(function (h, i) { cx.push(x0 + i * (bw + gap) + bw / 2); });
        var idxOf = function (id) { var r = 0; HOSTS.forEach(function (h, i) { if (h.id === id) r = i; }); return r; };
        var travel = s.send ? ez(seg(e, 0.05, 0.6)) : 0;
        var arrived = s.send ? seg(e, 0.55, 0.85) : seg(e, 0.1, 0.4);
        var pulseCol = s.kind === 'bc' ? P.yellow : P.teal;
        var active = {};
        if (s.send) active[s.send] = true;
        s.to.forEach(function (id) { active[id] = true; });

        ln(cx[0], swY, cx[3], swY, P.sub + '88', 2);
        if (s.send && travel > 0 && travel < 1) {
            var xs = cx[idxOf(s.send)];
            var lo = xs, hi = xs;
            s.to.forEach(function (id) { var xv = cx[idxOf(id)]; lo = Math.min(lo, xv); hi = Math.max(hi, xv); });
            var ext = (hi - lo) * Math.max(0, travel * 1.2 - 0.2);
            ln(Math.max(lo, xs - ext), swY, Math.min(hi, xs + ext), swY, pulseCol + 'ff', 3);
        }
        HOSTS.forEach(function (h, i) {
            var x = x0 + i * (bw + gap);
            var c = colorOf(h.col);
            var on = !!active[h.id];
            var live = on && (h.id === s.send || arrived > 0.3 || !s.send);
            ln(cx[i], top + bh, cx[i], swY, live ? pulseCol + 'ff' : P.sub + '66', live ? 2.4 : 1.4);
            var badge = s.hl[h.id];
            var pb = p.hl[h.id];
            var ba = badge ? (pb && pb[0] === badge[0] ? 1 : arrived) : 0;
            var bc = badge ? colorOf(badge[1]) : c;
            var muted = badge && badge[1] === 'muted';
            rr(x, top, bw, bh, 6, (badge && !muted ? bc : c) + '18', (badge && ba > 0.3 ? bc : c) + (badge || on ? 'ff' : '77'), badge && ba > 0.3 ? 1.8 : 1.2);
            tx(h.name, x + bw / 2, top + 13, fs, c + 'ff', 'center', true);
            tx(mob ? '.' + h.ip.split('.').pop() : h.ip, x + bw / 2, top + 29, fs - 1.5, P.sub + 'ff', 'center', false);
            if (badge && ba > 0) {
                ctx.globalAlpha = ba;
                lines(badge[0], bw - 8, fs - 1.5).forEach(function (l, li) {
                    tx(l, x + bw / 2, top + 45 + li * 13, fs - 1.5, bc + 'ff', 'center', true);
                });
                ctx.globalAlpha = 1;
                if (!muted && badge[0].indexOf('일치') >= 0 && e > 0.6 && e < 1) {
                    ctx.globalAlpha = 1 - seg(e, 0.6, 1);
                    circ(cx[i], top + bh / 2, 10 + seg(e, 0.6, 1) * 28, 'none', bc + 'ff', 2);
                    ctx.globalAlpha = 1;
                }
            }
        });

        if (s.send && travel > 0 && travel < 1) {
            var xsend = cx[idxOf(s.send)];
            var tag = kindTag(s.label);
            var cw = tag.length * 7.2 + 14;
            s.to.forEach(function (id) {
                var xt = cx[idxOf(id)];
                var d1 = swY - (top + bh), d2 = Math.abs(xt - xsend), d3 = d1;
                var u = travel * (d1 + d2 + d3);
                var px, py;
                if (u <= d1) { px = xsend; py = top + bh + u; }
                else if (u <= d1 + d2) { px = xsend + (xt > xsend ? 1 : -1) * (u - d1); py = swY; }
                else { px = xt; py = swY - (u - d1 - d2); }
                rr(px - cw / 2, py - 9, cw, 18, 5, pulseCol + 'ff', pulseCol + 'ff', 1.4);
                tx(tag, px, py, fs - 1.5, '#111111', 'center', true);
            });
        }
        ctx.globalAlpha = s.label ? clamp01(e * 3) : 1;
        tx(s.label || '스위치로 연결된 같은 LAN', x0 + w / 2, swY + 16, fs - 0.5, (s.label ? pulseCol : P.sub) + 'ff', 'center', true);
        ctx.globalAlpha = 1;

        var py0 = top + L.cardY;
        var same = s.pkt.join('|') === p.pkt.join('|');
        var ca = same ? 1 : ez(seg(e, 0, 0.3));
        var cdy = same ? 0 : (1 - ca) * -10;
        rr(x0, py0, w, L.cardH, 6, 'none', P.sub + '66', 1.2);
        tx('프레임 내용', x0 + 10, py0 + 12, fs - 1, P.sub + 'ff', 'left', true);
        if (s.pkt.length) {
            ctx.globalAlpha = ca;
            var dst = s.pkt[0].replace('이더넷 dst ', '');
            var dm = dst.split(' ');
            var srcM = s.pkt[1].replace(/^\s*src\s*/, '');
            var rowY = py0 + 30 + cdy;
            var lh = fs + 4;
            var isBc = dst.indexOf('브로드캐스트') >= 0;
            var dc = isBc ? P.yellow : P.text;
            tx('dst', x0 + 10, rowY, fs - 0.5, P.sub + 'ff', 'left', true);
            rr(x0 + 40, rowY - 9, 17 * 7.1 + 10, 18, 4, isBc ? P.yellow + '30' : 'none', isBc ? P.yellow + 'ff' : P.sub + '66', 1.2);
            tx(dm[0], x0 + 45, rowY, fs - 0.5, dc + 'ff', 'left', true);
            if (dm[1]) tx(dm[1], x0 + 40 + 17 * 7.1 + 18, rowY, fs - 1, (isBc ? P.yellow : P.teal) + 'ff', 'left', true);
            tx('src', x0 + 10, rowY + lh, fs - 0.5, P.sub + 'ff', 'left', true);
            tx(srcM, x0 + 45, rowY + lh, fs - 0.5, P.text + 'ff', 'left', true);
            var yy = rowY + 2 * lh + 2;
            var l2 = lines(s.pkt[2], w - 20, fs - 0.5);
            l2.forEach(function (l, li) {
                tx(l, x0 + 10, yy + li * (fs + 3), fs - 0.5, P.yellow + 'ff', 'left', true);
            });
            lines(s.pkt[3], w - 20, fs - 0.5).forEach(function (l, li) {
                tx(l, x0 + 10, yy + (l2.length + li) * (fs + 3), fs - 0.5, P.sub + 'ff', 'left', false);
            });
            ctx.globalAlpha = 1;
        } else {
            tx(currentSteps().indexOf(s) > 0 ? '(이 단계에서는 프레임을 보내지 않습니다)' : '(아직 보낸 프레임이 없습니다)', x0 + 10, py0 + 36, fs - 0.5, P.sub + 'ff', 'left', false);
        }

        var cy = top + L.cacheY;
        var lhc = mob ? 15 : 17;
        rr(x0, cy, w, 24 + 2 * lhc, 6, 'none', P.sub + '66', 1.2);
        tx('A의 ARP 캐시 (IP → MAC)', x0 + 10, cy + 12, fs - 1, P.sub + 'ff', 'left', true);
        var inPrev = function (ip) { return p.cache.some(function (r) { return r[0] === ip; }); };
        var inNow = function (ip) { return s.cache.some(function (r) { return r[0] === ip; }); };
        if (!s.cache.length && !p.cache.length) tx('(비어 있음)', x0 + 10, cy + 28, fs - 0.5, P.sub + 'ff', 'left', false);
        var rowAt = s.send ? 0.6 : 0.1;
        s.cache.forEach(function (r, i) {
            var y = cy + 28 + i * lhc;
            var isNew = !inPrev(r[0]);
            var pr = null;
            p.cache.forEach(function (q2) { if (q2[0] === r[0]) pr = q2; });
            var turnStale = r[2] === 'stale' && pr && pr[2] !== 'stale';
            var a = isNew ? seg(e, rowAt, rowAt + 0.3) : 1;
            if (isNew && e < 1) {
                var hi2 = 1 - seg(e, rowAt + 0.1, 1);
                if (hi2 > 0) { ctx.globalAlpha = hi2; rr(x0 + 4, y - 8, w - 8, lhc, 3, P.yellow + '33', P.yellow + 'ff', 1.2); ctx.globalAlpha = 1; }
            }
            var txt = r[0] + ' → ' + r[1] + (r[2] === 'stale' ? '  (만료)' : '');
            var redA = r[2] === 'stale' ? (turnStale ? seg(e, 0.2, 0.6) : 1) : 0;
            ctx.globalAlpha = a * (1 - redA);
            tx(r[0] + ' → ' + r[1], x0 + 10 + (isNew ? (1 - a) * 18 : 0), y, fs - 0.5, P.green + 'ff', 'left', false);
            ctx.globalAlpha = a * redA;
            tx(txt, x0 + 10, y, fs - 0.5, P.red + 'ff', 'left', false);
            if (redA > 0.5) ln(x0 + 10, y, x0 + 10 + (r[0] + ' → ' + r[1]).length * 6.6 * Math.min(1, (redA - 0.5) * 2), y, P.red + 'ff', 1.4);
            ctx.globalAlpha = 1;
        });
        p.cache.forEach(function (r, i) {
            if (inNow(r[0])) return;
            ctx.globalAlpha = 1 - seg(e, 0, 0.4);
            tx(r[0] + ' → ' + r[1], x0 + 10, cy + 28 + i * lhc, fs - 0.5, P.red + 'ff', 'left', false);
            ctx.globalAlpha = 1;
        });
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
        drawScene(sidePad(W), topPad(W), W - sidePad(W) * 2, mob, step, prev, anim);
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
        speedBtns.forEach(function (b) { b.classList.remove('arp-viz__speed-btn--active'); });
        btn.classList.add('arp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('arp-viz__mode-btn--active', d.key === m); });
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
                mousePos: { x: -1, y: -1 },
                tooltipHits: [],
                hoveredKey: function () { return null; },
                setHoveredKey: function () {},
                draw: draw
            };
        }
    });

    setTimeout(resize, 60);
})();