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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'same';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'cache') return CACHE_STEPS;
        if (mode === 'gateway') return GW_STEPS;
        return SAME_STEPS;
    }

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

    /* ===================== 공통: 네트워크와 프레임 ===================== */
    function colorOf(key) {
        return P[key] || P.muted;
    }
    function drawNet(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var gap = mob ? 8 : 16;
        var bw = (w - gap * 3) / 4;
        var bh = 56;
        var swY = top + bh + 22;
        var s = step || { send: null, to: [], kind: '', label: '', hl: {}, pkt: [], cache: [] };
        var cx = [];
        HOSTS.forEach(function (h, i) { cx.push(x0 + i * (bw + gap) + bw / 2); });
        ctx.beginPath();
        ctx.moveTo(cx[0], swY);
        ctx.lineTo(cx[3], swY);
        ctx.strokeStyle = P.muted + '66';
        ctx.lineWidth = 2;
        ctx.stroke();
        var active = {};
        if (s.send) active[s.send] = true;
        s.to.forEach(function (id) { active[id] = true; });
        var pulse = s.kind === 'bc' ? P.yellow : P.teal;
        HOSTS.forEach(function (h, i) {
            var x = x0 + i * (bw + gap);
            var c = colorOf(h.col);
            var on = !!active[h.id];
            ctx.beginPath();
            ctx.moveTo(cx[i], top + bh);
            ctx.lineTo(cx[i], swY);
            ctx.strokeStyle = on ? pulse + 'ff' : P.muted + '55';
            ctx.lineWidth = on ? 2.4 : 1.4;
            ctx.stroke();
            var badge = s.hl[h.id];
            var bc = badge ? colorOf(badge[1]) : c;
            rr(x, top, bw, bh, 6, (badge && badge[1] !== 'muted' ? bc : c) + '18', (badge ? bc : c) + (badge || on ? 'ff' : '77'), badge || on ? 1.8 : 1.2);
            tx(h.name, x + bw / 2, top + 13, fs, c + 'ee', 'center', true);
            tx(h.ip, x + bw / 2, top + 29, fs - 2.5, P.muted + 'ee', 'center', false);
            if (badge) tx(badge[0], x + bw / 2, top + 45, fs - 1.5, bc + 'ff', 'center', true);
        });
        tx(s.label || '스위치로 연결된 같은 LAN', x0 + w / 2, swY + 14, fs - 0.5, (s.label ? pulse : P.muted) + 'ee', 'center', true);

        var py = swY + 30;
        var lh = mob ? 14 : 16;
        var ph = lh * 4 + 22;
        rr(x0, py, w, ph, 6, 'none', P.muted + '55', 1.2);
        tx('프레임 내용', x0 + 10, py + 11, fs - 2, P.muted + 'ee', 'left', true);
        if (s.pkt.length) {
            s.pkt.forEach(function (ln, i) {
                tx(ln, x0 + 10, py + 26 + i * lh, fs - 1.5, (i < 2 ? P.text : P.yellow) + 'ee', 'left', false);
            });
        } else {
            tx('(아직 보낸 프레임이 없습니다)', x0 + 10, py + 28, fs - 1.5, P.muted + 'cc', 'left', false);
        }

        var cy = py + ph + 12;
        var rows = Math.max(1, s.cache.length);
        var ch = 24 + rows * lh;
        rr(x0, cy, w, ch, 6, 'none', P.muted + '55', 1.2);
        tx('A의 ARP 캐시 (IP → MAC)', x0 + 10, cy + 11, fs - 2, P.muted + 'ee', 'left', true);
        if (!s.cache.length) {
            tx('(비어 있음)', x0 + 10, cy + 26, fs - 1.5, P.muted + 'cc', 'left', false);
        }
        s.cache.forEach(function (r, i) {
            var stale = r[2] === 'stale';
            tx(r[0] + ' → ' + r[1] + (stale ? '  (만료)' : ''), x0 + 10, cy + 26 + i * lh, fs - 1.5, (stale ? P.red : P.green) + 'ee', 'left', false);
        });
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var padX = mob ? 16 : 26;
        var fullW = W - padX * 2;
        var top = mob ? 18 : 26;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;

        drawNet(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 MAC 주소를 알아내는 과정을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = mob ? 11 : 12.5;
            var hl = [hint];
            if (ctx.measureText(hint).width > W - 16) {
                var cut = hint.indexOf(' ', Math.floor(hint.length / 2));
                if (cut < 0) cut = hint.lastIndexOf(' ');
                hl = [hint.slice(0, cut), hint.slice(cut + 1)];
            }
            hl.forEach(function (line, li) {
                tx(line, W / 2, GH() - (mob ? 12 : 14) - (hl.length - 1 - li) * (hs + 4), hs, P.muted + 'aa', 'center', false);
            });
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        neededH = mob ? 345 : 350;
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
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
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() {
        if (mode === 'cache') return 'ARP 캐시가 있으면 요청 없이 바로 보내고, 없으면 ARP로 알아내는 과정을 봅니다.';
        if (mode === 'gateway') return '다른 네트워크로 보낼 때 목적지가 아니라 게이트웨이의 MAC 주소를 ARP로 알아내는 과정을 봅니다.';
        return '같은 LAN에서 IP 주소만 아는 상대의 MAC 주소를 ARP로 알아내는 과정을 봅니다.';
    }

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
        running = false; stepIdx = -1;
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