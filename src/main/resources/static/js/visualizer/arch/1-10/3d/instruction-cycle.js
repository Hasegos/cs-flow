/**
 * 명령어 사이클 3D 주방 시각화 (Three.js r128)
 * 2D 시각화의 "3D 주방" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js가 먼저 로드돼 있어야 한다.
 * 주방 한 접시에서 번호표(PC)가 가리키는 주문서(명령)를 보관대에서 뽑고(FETCH), 읽고(DECODE),
 * 재료를 접시(ACC)에 담아 조리하며(EXECUTE), 결과는 보관대 칸에 다시 올린다.
 * 단계 데이터는 2D 시각화와 같은 값이며, 화면의 수치와 자막은 모두 이 데이터에서 계산한다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const HAND = kit.HAND;
    const INK = kit.INK;

    /* ===================== 상수 ===================== */
    const BADGES = [
        'OVERVIEW',
        'LOAD FETCH-1', 'LOAD FETCH-2', 'LOAD DECODE', 'LOAD EXEC-1', 'LOAD EXEC-2',
        'ADD FETCH-1', 'ADD FETCH-2', 'ADD DECODE', 'ADD EXEC-1', 'ADD EXEC-2',
        'STORE FETCH-1', 'STORE FETCH-2', 'STORE DECODE', 'STORE EXEC-1', 'STORE EXEC-2',
        'HALT FETCH-1', 'HALT FETCH-2', 'HALT DECODE', 'HALT EXECUTE'
    ];
    const THEMES = {
        dark: { bg: 0x12141c, ground: 0x2b2a33, wall: 0x8a8578, hemi: 0.7, sun: 1.0, exposure: 1.0 },
        light: { bg: 0xe6e1d4, ground: 0xd6cdb8, wall: 0xffffff, hemi: 0.65, sun: 1.0, exposure: 1.0 }
    };
    const COLOR = { fetch: 0xff7a2f, decode: 0x1d9e75, exec: 0x8a5cff, order: 0xff7a2f, data: 0x1d9e75 };
    const MEM_INIT = ['LOAD [0x05]', 'ADD [0x06]', 'STORE [0x07]', 'HALT', '', '10', '20', '?'];
    const RACK_X = -0.4;
    const ROW_Y = [2.4, 1.52];
    const SHOTS = {
        overview: [[0.2, 4.4, 10.2], [-0.2, 1.9, 0]],
        wide: [[0, 3.6, 8.2], [-0.2, 2.0, -0.4]],
        window: [[-1.4, 2.7, 4.8], [-1.4, 1.9, -0.4]],
        rack: [[0, 2.5, 4.7], [0, 2.1, -0.9]],
        pass: [[0.4, 2.7, 5.4], [0.4, 1.5, 0.3]]
    };
    const OVERVIEW_TEXT = '번호표(PC)가 가리키는 주문서(명령)를 뽑고(FETCH), 읽고(DECODE), 조리해(EXECUTE) 접시(ACC)에 담습니다. 결과는 보관대 칸에 다시 올립니다. 번호표는 한 칸씩 올라갑니다';

    /* ===================== 단계 데이터 ===================== */
    /**
     * 단계 데이터 한 줄을 만든다. 2D 시각화의 단계 데이터와 같은 값이다.
     *
     * @param phase 단계 종류 (f 인출, d 해독, e 실행)
     * @param pc    PC 값
     * @param mar   MAR 값
     * @param mdr   MDR 값
     * @param ir    IR 값
     * @param acc   ACC 값
     * @param label 버스 이름 (A 주소, I 제어, D 데이터), 버스가 없으면 null
     * @param toMem 메모리 쪽으로 쓰는 방향이면 true
     * @returns 단계 객체
     */
    function stp(phase, pc, mar, mdr, ir, acc, label, toMem) {
        return { phase: phase, reg: { PC: pc, MAR: mar, MDR: mdr, IR: ir, ACC: acc }, bus: label ? { label: label, toMem: toMem } : null };
    }

    const STEPS = [
        stp('f', '0x00', '0x00', '—', '—', '—', 'A', true),
        stp('f', '0x01', '0x00', 'LOAD', '—', '—', 'I', false),
        stp('d', '0x01', '0x00', 'LOAD', 'LOAD', '—', null, false),
        stp('e', '0x01', '0x05', 'LOAD', 'LOAD', '—', 'A', true),
        stp('e', '0x01', '0x05', '10', 'LOAD', '10', 'D', false),
        stp('f', '0x01', '0x01', '10', 'LOAD', '10', 'A', true),
        stp('f', '0x02', '0x01', 'ADD', 'LOAD', '10', 'I', false),
        stp('d', '0x02', '0x01', 'ADD', 'ADD', '10', null, false),
        stp('e', '0x02', '0x06', 'ADD', 'ADD', '10', 'A', true),
        stp('e', '0x02', '0x06', '20', 'ADD', '30', 'D', false),
        stp('f', '0x02', '0x02', '20', 'ADD', '30', 'A', true),
        stp('f', '0x03', '0x02', 'STORE', 'ADD', '30', 'I', false),
        stp('d', '0x03', '0x02', 'STORE', 'STORE', '30', null, false),
        stp('e', '0x03', '0x07', 'STORE', 'STORE', '30', 'A', true),
        stp('e', '0x03', '0x07', '30', 'STORE', '30', 'D', true),
        stp('f', '0x03', '0x03', '30', 'STORE', '30', 'A', true),
        stp('f', '0x04', '0x03', 'HALT', 'STORE', '30', 'I', false),
        stp('d', '0x04', '0x03', 'HALT', 'HALT', '30', null, false),
        stp('e', 'HALT', '0x03', 'HALT', 'HALT', '30', null, false)
    ];

    /**
     * 0x로 시작하는 16진 문자열을 칸 번호로 바꾼다.
     *
     * @param hex 0x로 시작하는 문자열
     * @returns 칸 번호
     */
    function addrOf(hex) {
        return parseInt(hex, 16);
    }

    /**
     * 칸 번호를 칸 이름(0x0N)으로 바꾼다.
     *
     * @param n 칸 번호 (0~7)
     * @returns 칸 이름
     */
    function addrHex(n) {
        return '0x0' + n;
    }

    /**
     * 단계 k 끝의 PC 값을 돌려준다. HALT 단계는 PC가 더 올라가지 않으므로 앞 단계의 PC(0x04)를 쓴다.
     *
     * @param k 단계 번호 (-1이면 시작 상태)
     * @returns PC 값
     */
    function pcAt(k) {
        if (k < 0) return '—';
        const v = STEPS[k].reg.PC;
        return v.indexOf('0x') === 0 ? v : pcAt(k - 1);
    }

    /**
     * 단계 k 끝까지 보관대 칸 값을 돌려준다. 메모리 쪽으로 쓰는 단계만 칸을 바꾼다.
     *
     * @param k 단계 번호
     * @returns 칸 0~7의 값 배열
     */
    function memAt(k) {
        const m = MEM_INIT.slice();
        for (let j = 0; j <= k; j++) {
            const s = STEPS[j];
            if (s.bus && s.bus.toMem && s.bus.label === 'D') m[addrOf(s.reg.MAR)] = s.reg.MDR;
        }
        return m;
    }

    /**
     * 단계 k까지 단계 종류와 버스 이름이 맞는 단계의 수를 센다.
     *
     * @param k     단계 번호
     * @param phase 단계 종류
     * @param label 버스 이름
     * @returns 횟수
     */
    function countBus(k, phase, label) {
        let n = 0;
        for (let j = 0; j <= k; j++) {
            const s = STEPS[j];
            if (s.phase === phase && s.bus && s.bus.label === label) n++;
        }
        return n;
    }

    /**
     * 단계 k까지 마지막으로 쓴 칸 번호를 돌려준다.
     *
     * @param k 단계 번호
     * @returns 칸 번호, 쓴 적이 없으면 -1
     */
    function lastWriteAt(k) {
        let addr = -1;
        for (let j = 0; j <= k; j++) {
            const s = STEPS[j];
            if (s.bus && s.bus.toMem && s.bus.label === 'D') addr = addrOf(s.reg.MAR);
        }
        return addr;
    }

    /**
     * 단계 k가 끝난 시점의 주방 값을 돌려준다. k가 -1 이하면 시작 상태다.
     *
     * @param k 단계 번호
     * @returns PC, MAR, MDR, IR, ACC, 칸 값 배열(mem), 명령 인출 횟수(f), 데이터 접근 횟수(d)
     */
    function snap(k) {
        if (k < 0) return { PC: '—', MAR: '—', MDR: '—', IR: '—', ACC: '—', mem: MEM_INIT.slice(), f: 0, d: 0 };
        const r = STEPS[k].reg;
        return { PC: pcAt(k), MAR: r.MAR, MDR: r.MDR, IR: r.IR, ACC: r.ACC, mem: memAt(k), f: countBus(k, 'f', 'I'), d: countBus(k, 'e', 'D') };
    }

    /**
     * 단계 k가 어떤 장면으로 보여 줄지 고른다.
     *
     * @param k 단계 번호
     * @returns F1(주소 전달), F2(주문서 가져오기), D(해독), E1(피연산자 주소 전달), ER(재료 읽기), EW(결과 쓰기), X(정지)
     */
    function kindOf(k) {
        const s = STEPS[k];
        if (s.phase === 'f') return s.bus.toMem ? 'F1' : 'F2';
        if (s.phase === 'd') return 'D';
        if (!s.bus) return 'X';
        if (s.bus.label === 'A') return 'E1';
        return s.bus.toMem ? 'EW' : 'ER';
    }

    /* ===================== 그리기 ===================== */
    /**
     * 색 번호를 CSS 색 문자열로 바꾼다.
     *
     * @param n 0xRRGGBB 색 번호
     * @returns #RRGGBB 문자열
     */
    function hx(n) {
        return '#' + n.toString(16).padStart(6, '0');
    }

    /**
     * 값에 맞는 글꼴 문자열을 돌려준다. 빈 값(대시)은 본문 글꼴을 쓴다.
     *
     * @param v  표시할 값
     * @param sz 글자 크기(px)
     * @returns 글꼴 문자열
     */
    function valFont(v, sz) {
        return v === '—' ? '500 ' + sz + 'px ' + SERIF : '700 ' + sz + 'px ' + HAND;
    }

    /**
     * 보관대 칸 하나를 그린다. 주문서 칸은 주황, 재료 통은 청록 테두리다.
     *
     * @param addr  칸 번호
     * @param value 칸 값
     * @param c     2D 컨텍스트
     * @param pw    캔버스 폭
     * @param ph    캔버스 높이
     */
    function drawCell(addr, value, c, pw, ph) {
        const order = addr < 4;
        c.fillStyle = addr === 4 ? '#eee9dc' : (order ? '#fff0e2' : '#e3f5ec');
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = hx(order ? COLOR.order : COLOR.data);
        c.lineWidth = 6;
        c.strokeRect(3, 3, pw - 6, ph - 6);
        c.fillStyle = INK;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.font = '700 26px ' + SERIF;
        c.fillText(addrHex(addr), 14, 30);
        c.textAlign = 'center';
        if (value === '') {
            c.fillStyle = '#7d7566';
            c.font = '500 30px ' + SERIF;
            c.fillText('빈 칸', pw / 2, ph * 0.62);
            return;
        }
        c.font = order ? '700 30px ' + SERIF : '700 76px ' + HAND;
        c.fillText(value, pw / 2, ph * 0.62);
    }

    /**
     * PC 번호표 기계 화면을 그린다.
     *
     * @param value PC 값
     * @param c     2D 컨텍스트
     * @param pw    캔버스 폭
     * @param ph    캔버스 높이
     */
    function drawDisp(value, c, pw, ph) {
        c.fillStyle = '#1b1f2b';
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = '#5a6078';
        c.lineWidth = 6;
        c.strokeRect(4, 4, pw - 8, ph - 8);
        c.textBaseline = 'middle';
        c.textAlign = 'left';
        c.fillStyle = '#e8e2d2';
        c.font = '700 30px ' + SERIF;
        c.fillText('PC · 번호표', 20, 38);
        c.textAlign = 'center';
        c.fillStyle = '#ffb27a';
        c.font = valFont(value, 96);
        c.fillText(value, pw / 2, ph * 0.64);
    }

    /**
     * MDR 집게(주문서를 잠깐 올려 두는 곳) 화면을 그린다.
     *
     * @param value MDR 값
     * @param c     2D 컨텍스트
     * @param pw    캔버스 폭
     * @param ph    캔버스 높이
     */
    function drawTray(value, c, pw, ph) {
        c.fillStyle = '#fbf6ea';
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = hx(COLOR.fetch);
        c.lineWidth = 8;
        c.strokeRect(4, 4, pw - 8, ph - 8);
        c.textBaseline = 'middle';
        c.textAlign = 'left';
        c.fillStyle = hx(COLOR.fetch);
        c.font = '700 28px ' + SERIF;
        c.fillText('MDR · 집게', 18, 36);
        c.textAlign = 'center';
        c.fillStyle = INK;
        c.font = valFont(value, 84);
        c.fillText(value, pw / 2, ph * 0.66);
    }

    /**
     * IR 조리 메모판(해독한 명령)을 그린다.
     *
     * @param value IR 값
     * @param c     2D 컨텍스트
     * @param pw    캔버스 폭
     * @param ph    캔버스 높이
     */
    function drawIr(value, c, pw, ph) {
        c.fillStyle = '#fffdf6';
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = hx(COLOR.decode);
        c.lineWidth = 8;
        c.strokeRect(4, 4, pw - 8, ph - 8);
        c.textBaseline = 'middle';
        c.textAlign = 'center';
        c.fillStyle = hx(COLOR.decode);
        c.font = '700 28px ' + SERIF;
        c.fillText('IR · 조리 메모', pw / 2, 42);
        c.fillStyle = INK;
        c.font = valFont(value, 96);
        c.fillText(value, pw / 2, ph * 0.62);
    }

    /**
     * ACC 접시를 그린다. 접시 가장자리 바깥은 투명이다.
     *
     * @param value ACC 값
     * @param c     2D 컨텍스트
     * @param pw    캔버스 폭
     * @param ph    캔버스 높이
     */
    function drawPlate(value, c, pw, ph) {
        const cx = pw / 2;
        const cy = ph / 2;
        c.beginPath();
        c.arc(cx, cy, pw / 2 - 8, 0, Math.PI * 2);
        c.fillStyle = '#fdfaf2';
        c.fill();
        c.strokeStyle = '#b9a77f';
        c.lineWidth = 10;
        c.stroke();
        c.beginPath();
        c.arc(cx, cy, pw / 2 - 42, 0, Math.PI * 2);
        c.strokeStyle = '#d9ceb4';
        c.lineWidth = 4;
        c.stroke();
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = hx(COLOR.exec);
        c.font = '700 26px ' + SERIF;
        c.fillText('ACC · 접시', cx, ph * 0.3);
        c.fillStyle = INK;
        c.font = valFont(value, 96);
        c.fillText(value, cx, ph * 0.62);
    }

    /**
     * 나르는 쪽지 카드 한 장을 그린다.
     *
     * @param header 머리글
     * @param value  카드 값
     * @param color  테두리 색
     * @param c      2D 컨텍스트
     * @param pw     캔버스 폭
     * @param ph     캔버스 높이
     */
    function drawCard(header, value, color, c, pw, ph) {
        c.fillStyle = '#fffdf6';
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = hx(color);
        c.lineWidth = 10;
        c.strokeRect(5, 5, pw - 10, ph - 10);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = hx(color);
        c.font = '700 26px ' + SERIF;
        c.fillText(header, pw / 2, 34);
        c.fillStyle = INK;
        c.font = valFont(value, 76);
        c.fillText(value, pw / 2, ph * 0.66);
    }

    /**
     * 주방 칠판(레지스터 값과 누적 횟수)을 그린다.
     *
     * @param S  화면에 보이는 값 묶음
     * @param c  2D 컨텍스트
     * @param pw 캔버스 폭
     * @param ph 캔버스 높이
     */
    function drawBoard(S, c, pw, ph) {
        c.fillStyle = '#fbf8f1';
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = '#6b6358';
        c.lineWidth = 6;
        c.strokeRect(4, 4, pw - 8, ph - 8);
        c.textBaseline = 'middle';
        c.textAlign = 'left';
        c.fillStyle = INK;
        c.font = '700 30px ' + SERIF;
        c.fillText('주방 칠판 · 레지스터', 24, 42);
        c.strokeStyle = '#c9bea6';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(24, 72);
        c.lineTo(pw - 24, 72);
        c.stroke();
        const rows = [['PC', S.PC, COLOR.fetch], ['MAR', S.MAR, COLOR.fetch], ['MDR', S.MDR, COLOR.fetch], ['IR', S.IR, COLOR.decode], ['ACC', S.ACC, COLOR.exec]];
        rows.forEach(function (r, i) {
            const y = 116 + i * 46;
            c.fillStyle = hx(r[2]);
            c.font = '700 28px ' + SERIF;
            c.fillText(r[0], 28, y);
            c.fillStyle = INK;
            c.font = valFont(r[1], 40);
            c.fillText(r[1], 160, y);
        });
        c.strokeStyle = '#c9bea6';
        c.beginPath();
        c.moveTo(24, 336);
        c.lineTo(pw - 24, 336);
        c.stroke();
        [['명령 인출', S.f], ['데이터 접근', S.d]].forEach(function (r, i) {
            const y = 384 + i * 42;
            c.fillStyle = '#6b6358';
            c.font = '500 26px ' + SERIF;
            c.fillText(r[0], 28, y);
            c.fillStyle = INK;
            c.font = '700 40px ' + HAND;
            c.fillText(String(r[1]), 230, y);
            c.fillStyle = '#6b6358';
            c.font = '500 26px ' + SERIF;
            c.fillText('회', 268, y);
        });
    }

    /**
     * 벽이나 조리대 앞에 붙이는 간판 그림을 그린다.
     *
     * @param text  간판 문구
     * @param color 테두리 색
     * @param c     2D 컨텍스트
     * @param pw    캔버스 폭
     * @param ph    캔버스 높이
     */
    function drawSign(text, color, c, pw, ph) {
        c.fillStyle = '#f6ecd6';
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = hx(color);
        c.lineWidth = 8;
        c.strokeRect(4, 4, pw - 8, ph - 8);
        c.fillStyle = INK;
        c.font = '700 ' + Math.round(ph * 0.46) + 'px ' + SERIF;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, pw / 2, ph / 2 + 2);
    }

    /* ===================== 위치 ===================== */
    /**
     * 칸 번호에 맞는 보관대 칸의 앞쪽 위치를 돌려준다. 0~3은 주문서 줄, 4~7은 재료 줄이다.
     *
     * @param addr 칸 번호
     * @returns 위치
     */
    function cellAt(addr) {
        return new V(RACK_X + (addr % 4 - 1.5) * 0.6, ROW_Y[addr < 4 ? 0 : 1], -0.8);
    }

    /**
     * 쪽지 카드가 번호표 기계 위에서 나오는 위치를 돌려준다.
     *
     * @returns 위치
     */
    function slipStart() {
        return new V(-3.1, 2.25, 0.9);
    }

    /**
     * 번호표 기계 화면 앞쪽 위치를 돌려준다.
     *
     * @returns 위치
     */
    function dispAt() {
        return new V(-3.1, 1.55, 0.95);
    }

    /**
     * MDR 집게 화면 앞쪽 위치를 돌려준다.
     *
     * @returns 위치
     */
    function trayAt() {
        return new V(-1.5, 1.42, 0.92);
    }

    /**
     * IR 조리 메모판 앞쪽 위치를 돌려준다.
     *
     * @returns 위치
     */
    function irAt() {
        return new V(1.9, 2.5, -1.3);
    }

    /**
     * IR 조리 메모판 아래쪽 위치를 돌려준다.
     *
     * @returns 위치
     */
    function irBottomAt() {
        return new V(1.9, 2.05, -1.3);
    }

    /**
     * ACC 접시 앞쪽 위치를 돌려준다.
     *
     * @returns 위치
     */
    function plateAt() {
        return new V(1.05, 1.5, 0.7);
    }

    /**
     * ALU 화구 위쪽 위치를 돌려준다.
     *
     * @returns 위치
     */
    function stoveAt() {
        return new V(2.6, 1.3, 0.35);
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 보관대, 번호표 기계, 집게, 접시, 화구, 칠판, 주방장과 나르는 쪽지 카드를 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play, busy, applyTheme)
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const canvas2d = eng.canvas2d;
        const texture = eng.texture;
        const tween = eng.tween;
        const invalidate = eng.invalidate;
        const glow = eng.glow;
        const ink = eng.ink;
        const easeInOut = eng.api.easeInOut;
        const lowEnd = eng.lowEnd;
        const state = v3.state;
        const alive = v3.alive;
        const wait = v3.wait;
        const say = v3.setCaption;
        const shown = { PC: '—', MAR: '—', MDR: '—', IR: '—', ACC: '—', mem: MEM_INIT.slice(), f: 0, d: 0 };

        scene.background = new THREE.Color(THEMES.light.bg);
        scene.fog = new THREE.Fog(THEMES.light.bg, 16, 34);

        /* ===================== 재료와 빛 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.7);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.2);
        sun.position.set(-5, 10, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const lamp = new THREE.PointLight(0xffd7a0, 0.6, 9);
        lamp.position.set(0.4, 2.9, 1.6);
        scene.add(lamp);

        const groundM = new THREE.MeshLambertMaterial({ color: THEMES.light.ground });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundM);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        /**
         * 타일 무늬 벽지 텍스처를 만든다.
         *
         * @returns 텍스처
         */
        function tileTexture() {
            const [c, x] = canvas2d(128, 128);
            x.fillStyle = '#ece6d6';
            x.fillRect(0, 0, 128, 128);
            x.strokeStyle = '#c9bea6';
            x.lineWidth = 4;
            x.strokeRect(2, 2, 124, 124);
            const t = texture(c);
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(7, 3);
            return t;
        }

        const wallM = new THREE.MeshLambertMaterial({ map: tileTexture() });
        const woodM = new THREE.MeshLambertMaterial({ color: 0xb98a52 });
        const darkWoodM = new THREE.MeshLambertMaterial({ color: 0x6e5030 });
        const slabM = new THREE.MeshLambertMaterial({ color: 0x9c7a4c });
        const steelM = new THREE.MeshLambertMaterial({ color: 0x9aa3ad });
        const solidMats = {};

        /**
         * 색깔 하나짜리 재료를 돌려준다. 같은 색은 한 번만 만든다.
         *
         * @param c 색 번호
         * @returns 재료
         */
        function solidM(c) {
            if (!solidMats[c]) solidMats[c] = new THREE.MeshLambertMaterial({ color: c });
            return solidMats[c];
        }

        /**
         * 상자를 만들어 위치를 잡고 씬에 붙인다.
         *
         * @param w       폭
         * @param h       높이
         * @param d       깊이
         * @param x       x 위치
         * @param y       y 위치
         * @param z       z 위치
         * @param m       재료
         * @param outline 외곽선 여부
         * @returns 메시
         */
        function slab(w, h, d, x, y, z, m, outline) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x, y, z);
            mesh.castShadow = mesh.receiveShadow = true;
            if (outline) ink(mesh);
            scene.add(mesh);
            return mesh;
        }

        /**
         * 캔버스를 그린 평면을 만든다. redraw로 내용을 다시 그릴 수 있다.
         *
         * @param w     평면 폭
         * @param h     평면 높이
         * @param pw    캔버스 폭
         * @param ph    캔버스 높이
         * @param draw  그리는 함수 (c, pw, ph)
         * @param basic 조명을 받지 않는 재료면 true
         * @returns 평면 묶음(mesh, mat, redraw)
         */
        function panel(w, h, pw, ph, draw, basic) {
            const [c, x] = canvas2d(pw, ph);
            const tex = texture(c);
            const mat = basic
                ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false })
                : new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            /**
             * 평면의 그림을 지우고 다시 그린다.
             *
             * @param fn 그리는 함수 (c, pw, ph)
             */
            function redraw(fn) {
                x.clearRect(0, 0, pw, ph);
                fn(x, pw, ph);
                tex.needsUpdate = true;
                invalidate();
            }
            redraw(draw);
            return { mesh: mesh, mat: mat, redraw: redraw };
        }

        /**
         * 벽이나 조리대 앞에 붙이는 간판을 만든다.
         *
         * @param text  간판 문구
         * @param x     x 위치
         * @param y     y 위치
         * @param z     z 위치
         * @param w     간판 폭
         * @param color 테두리 색
         */
        function sign(text, x, y, z, w, color) {
            const p = panel(w, 0.3, 512, Math.round(512 * 0.3 / w), function (c, pw, ph) { drawSign(text, color, c, pw, ph); }, true);
            p.mesh.position.set(x, y, z);
            scene.add(p.mesh);
        }

        /**
         * 나르는 쪽지 카드 한 종류를 만든다. 처음에는 숨겨 둔다.
         *
         * @param w 카드 폭
         * @param h 카드 높이
         * @returns 카드 묶음(mesh, mat, redraw, paint)
         */
        function card(w, h) {
            const p = panel(w, h, 256, 154, function (c, pw, ph) { drawCard('', '', COLOR.fetch, c, pw, ph); }, true);
            p.mesh.visible = false;
            scene.add(p.mesh);
            /**
             * 카드 내용을 바꿔 그린다.
             *
             * @param header 머리글
             * @param value  값
             * @param color  테두리 색
             */
            p.paint = function (header, value, color) {
                p.redraw(function (c, pw, ph) { drawCard(header, value, color, c, pw, ph); });
            };
            return p;
        }

        /**
         * 사람 모양 인형(몸통 + 머리)을 만든다.
         *
         * @param color 옷 색
         * @returns 그룹
         */
        function person(color) {
            const g = new THREE.Group();
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.75, 20), solidM(color));
            body.position.y = 0.375;
            body.castShadow = true;
            ink(body, 40);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), solidM(0xf0d2b0));
            head.position.y = 0.93;
            head.castShadow = true;
            g.add(body);
            g.add(head);
            scene.add(g);
            return g;
        }

        /* ===================== 주방 건물 ===================== */
        slab(9.4, 3.6, 0.1, 0, 1.8, -1.6, wallM, true);
        slab(8.2, 1.0, 1.1, 0, 0.5, 0.35, woodM, true);
        slab(8.4, 0.08, 1.25, 0, 1.04, 0.35, slabM, true);
        [-1.65, 0.85].forEach(function (x) {
            slab(0.08, 2.95, 0.5, x, 1.475, -1.2, darkWoodM, true);
        });
        [0.03, 1.06, 1.98, 2.95].forEach(function (y) {
            slab(2.6, 0.06, 0.5, RACK_X, y, -1.2, darkWoodM, true);
        });
        slab(2.7, 2.95, 0.04, RACK_X, 1.475, -1.5, darkWoodM, false);
        slab(0.9, 0.9, 0.7, -3.1, 1.53, 0.35, steelM, true);
        slab(0.9, 0.05, 0.55, -1.5, 1.105, 0.5, steelM, true);
        slab(0.8, 0.1, 0.6, 2.6, 1.13, 0.35, steelM, true);

        sign('번호표 · PC', -3.1, 0.55, 0.93, 1.2, COLOR.fetch);
        sign('집게 · MDR', -1.5, 0.55, 0.93, 1.2, COLOR.fetch);
        sign('화구 · ALU', 2.6, 0.55, 0.93, 1.2, COLOR.exec);
        sign('보관대 · 메모리', RACK_X, 3.2, -1.44, 1.9, COLOR.data);

        /* ===================== 칠판과 화면 ===================== */
        const disp = panel(0.76, 0.42, 380, 210, function (c, pw, ph) { drawDisp(shown.PC, c, pw, ph); }, true);
        disp.mesh.position.set(-3.1, 1.55, 0.72);
        scene.add(disp.mesh);

        const tray = panel(0.8, 0.5, 320, 200, function (c, pw, ph) { drawTray(shown.MDR, c, pw, ph); }, true);
        tray.mesh.position.set(-1.5, 1.42, 0.74);
        scene.add(tray.mesh);

        const irBoard = panel(1.0, 0.9, 320, 288, function (c, pw, ph) { drawIr(shown.IR, c, pw, ph); }, true);
        irBoard.mesh.position.set(1.9, 2.5, -1.46);
        scene.add(irBoard.mesh);

        const plate = panel(0.8, 0.8, 320, 320, function (c, pw, ph) { drawPlate(shown.ACC, c, pw, ph); }, true);
        plate.mesh.position.set(1.05, 1.5, 0.5);
        scene.add(plate.mesh);

        const board = panel(1.7, 1.5, 512, 448, function (c, pw, ph) { drawBoard(shown, c, pw, ph); }, true);
        board.mesh.position.set(-3.1, 2.75, -1.46);
        scene.add(board.mesh);

        const cells = MEM_INIT.map(function (_, j) {
            const p = panel(0.56, 0.44, 256, 200, function (c, pw, ph) { drawCell(j, shown.mem[j], c, pw, ph); }, true);
            p.mesh.position.set(RACK_X + (j % 4 - 1.5) * 0.6, ROW_Y[j < 4 ? 0 : 1], -0.9);
            scene.add(p.mesh);
            return p;
        });

        const slip = card(0.5, 0.3);
        const tk = card(0.6, 0.36);

        const aluGlow = glow(COLOR.exec, 1.1);
        aluGlow.position.set(2.6, 1.6, 0.35);
        aluGlow.material.opacity = 0;
        scene.add(aluGlow);

        const pings = [];
        for (let i = 0; i < 3; i++) {
            const sp = glow(0xffffff, 0.6);
            sp.material.opacity = 0;
            scene.add(sp);
            pings.push(sp);
        }
        let pingIdx = 0;

        const chef = person(0xf2efe6);
        chef.position.set(2.0, 0, -0.6);

        /* ===================== 칠판과 화면 갱신 ===================== */
        /**
         * 칠판을 다시 그린다.
         */
        function paintBoard() {
            board.redraw(function (c, pw, ph) { drawBoard(shown, c, pw, ph); });
        }

        /**
         * 번호표 기계 화면을 다시 그린다.
         */
        function paintDisp() {
            disp.redraw(function (c, pw, ph) { drawDisp(shown.PC, c, pw, ph); });
        }

        /**
         * MDR 집게 화면을 다시 그린다.
         */
        function paintTray() {
            tray.redraw(function (c, pw, ph) { drawTray(shown.MDR, c, pw, ph); });
        }

        /**
         * IR 조리 메모판을 다시 그린다.
         */
        function paintIr() {
            irBoard.redraw(function (c, pw, ph) { drawIr(shown.IR, c, pw, ph); });
        }

        /**
         * ACC 접시를 다시 그린다.
         */
        function paintPlate() {
            plate.redraw(function (c, pw, ph) { drawPlate(shown.ACC, c, pw, ph); });
        }

        /**
         * 보관대 칸 하나를 다시 그린다.
         *
         * @param j 칸 번호
         */
        function paintCell(j) {
            cells[j].redraw(function (c, pw, ph) { drawCell(j, shown.mem[j], c, pw, ph); });
        }

        /**
         * 레지스터 하나의 값을 바꾸고 화면을 갱신한다.
         *
         * @param v PC 값
         */
        function setPc(v) {
            shown.PC = v;
            paintDisp();
            paintBoard();
        }

        /**
         * MAR 값을 바꾸고 칠판을 갱신한다.
         *
         * @param v MAR 값
         */
        function setMar(v) {
            shown.MAR = v;
            paintBoard();
        }

        /**
         * MDR 값을 바꾸고 집게와 칠판을 갱신한다.
         *
         * @param v MDR 값
         */
        function setMdr(v) {
            shown.MDR = v;
            paintTray();
            paintBoard();
        }

        /**
         * IR 값을 바꾸고 조리 메모판과 칠판을 갱신한다.
         *
         * @param v IR 값
         */
        function setIr(v) {
            shown.IR = v;
            paintIr();
            paintBoard();
        }

        /**
         * ACC 값을 바꾸고 접시와 칠판을 갱신한다.
         *
         * @param v ACC 값
         */
        function setAcc(v) {
            shown.ACC = v;
            paintPlate();
            paintBoard();
        }

        /**
         * 보관대 칸 값을 바꾸고 칸을 갱신한다.
         *
         * @param j 칸 번호
         * @param v 칸 값
         */
        function setMem(j, v) {
            shown.mem[j] = v;
            paintCell(j);
        }

        /**
         * 누적 횟수를 바꾸고 칠판을 갱신한다.
         *
         * @param f 명령 인출 횟수
         * @param d 데이터 접근 횟수
         */
        function setCounts(f, d) {
            shown.f = f;
            shown.d = d;
            paintBoard();
        }

        /**
         * 화면 전체를 주어진 상태 값으로 맞춘다.
         *
         * @param S 상태 값(snap 결과)
         */
        function syncAll(S) {
            shown.PC = S.PC;
            shown.MAR = S.MAR;
            shown.MDR = S.MDR;
            shown.IR = S.IR;
            shown.ACC = S.ACC;
            shown.mem = S.mem.slice();
            shown.f = S.f;
            shown.d = S.d;
            paintDisp();
            paintTray();
            paintIr();
            paintPlate();
            paintBoard();
            cells.forEach(function (_, j) { paintCell(j); });
        }

        /* ===================== 움직임 도구 ===================== */
        /**
         * 시간을 배속에 맞춰 줄인 트윈을 등록한다.
         *
         * @param ms   밀리초(배속 전)
         * @param fn   0에서 1까지 값을 받는 함수
         * @param ease 이징 함수
         * @returns 완료 Promise
         */
        function tw(ms, fn, ease) {
            return tween(ms / state.speed, fn, ease);
        }

        /**
         * 지정한 위치에 색 번쩍임을 잠깐 띄운다.
         *
         * @param pos   위치
         * @param color 색 번호
         * @param size  크기
         * @param ms    지속 시간(배속 전)
         * @returns 완료 Promise
         */
        function ping(pos, color, size, ms) {
            const sp = pings[pingIdx++ % pings.length];
            sp.position.copy(pos);
            sp.material.color.setHex(color);
            sp.scale.set(size, size, 1);
            return tween(ms / state.speed, function (p) { sp.material.opacity = Math.sin(p * Math.PI) * 0.95; });
        }

        /**
         * 주방장이 가볍게 고개를 든다.
         */
        function bob() {
            tw(500, function (p) { chef.position.y = 0.06 * Math.sin(p * Math.PI); });
        }

        /**
         * ALU 화구에 불빛을 잠깐 켠다.
         */
        function pulseAlu() {
            tw(600, function (p) { aluGlow.material.opacity = Math.sin(p * Math.PI) * 0.9; });
        }

        /**
         * 점들을 이은 곡선을 따라 물체를 옮긴다.
         *
         * @param o   옮길 메시
         * @param pts 지나갈 점들
         * @param ms  이동 시간(배속 전)
         * @returns 완료 Promise
         */
        function arc(o, pts, ms) {
            const curve = new THREE.CatmullRomCurve3(pts);
            return tw(ms, function (p) { curve.getPoint(p, o.position); }, easeInOut);
        }

        /**
         * 쪽지 카드를 경로를 따라 나르고, 도착하면 숨긴다. 나타날 때 조금 커지며 시작한다.
         *
         * @param card   카드 묶음
         * @param header 머리글
         * @param value  값
         * @param color  테두리 색
         * @param pts    지나갈 점들(첫 점에서 출발)
         * @param ms     이동 시간(배속 전)
         * @returns 이동 완료 Promise
         */
        async function carry(card, header, value, color, pts, ms) {
            card.paint(header, value, color);
            card.mesh.position.copy(pts[0]);
            card.mesh.scale.setScalar(0.4);
            card.mesh.visible = true;
            tw(220, function (p) { card.mesh.scale.setScalar(0.4 + 0.6 * p); });
            await arc(card.mesh, pts, ms);
            card.mesh.visible = false;
            card.mesh.scale.setScalar(1);
        }

        /**
         * 카메라 샷을 적용한다. 화면 비율에 맞춰 카메라를 뒤로 물린다.
         *
         * @param key SHOTS의 키
         */
        function view(key) {
            const s = SHOTS[key];
            const aspect = eng.stage.clientWidth / Math.max(1, eng.stage.clientHeight);
            const k = aspect >= 1.5 ? 1 : Math.min(2.2, 1.5 / aspect);
            const t = new V(s[1][0], s[1][1], s[1][2]);
            const p = new V(s[0][0], s[0][1], s[0][2]).sub(t).multiplyScalar(k).add(t);
            eng.api.shot([p.x, p.y, p.z], [t.x, t.y, t.z]);
        }

        /* ===================== 단계 장면 ===================== */
        /**
         * 주소를 쪽지에 적어 보관대에 보낸다(FETCH, PC를 MAR로 옮긴다).
         *
         * @param g   장면 세대 번호
         * @param k   단계 번호
         * @param cur 단계 끝 상태
         */
        async function doF1(g, k, cur) {
            const addr = addrOf(cur.MAR);
            view('window');
            say('FETCH', 'PC=' + cur.PC + ' → MAR=' + cur.MAR + '. 쪽지를 보관대 칸 ' + cur.MAR + '에 보냅니다');
            setPc(cur.PC);
            setMar(cur.MAR);
            await carry(slip, 'MAR', cur.MAR, COLOR.fetch, [slipStart(), new V(-2.3, 2.9, 0.2), cellAt(addr)], 900);
            if (!alive(g)) return;
            ping(cellAt(addr), COLOR.fetch, 0.9, 500);
            await wait(400);
        }

        /**
         * 보관대 칸의 주문서를 집게(MDR)로 옮기고 번호표를 한 칸 올린다(FETCH).
         *
         * @param g   장면 세대 번호
         * @param k   단계 번호
         * @param cur 단계 끝 상태
         */
        async function doF2(g, k, cur) {
            const addr = addrOf(cur.MAR);
            view('window');
            say('FETCH', '보관대 칸 ' + cur.MAR + '의 주문서를 집게(MDR)에 옮깁니다. 번호표 한 칸 올림: PC=' + cur.PC);
            ping(cellAt(addr), COLOR.fetch, 0.9, 400);
            await carry(tk, 'MDR', cur.MDR, COLOR.fetch, [cellAt(addr), new V(-0.9, 2.1, -0.2), trayAt()], 1000);
            if (!alive(g)) return;
            setMdr(cur.MDR);
            setCounts(cur.f, cur.d);
            setPc(cur.PC);
            ping(dispAt(), COLOR.fetch, 0.9, 500);
            await wait(400);
        }

        /**
         * 주방장이 주문서를 읽고 IR 조리 메모판에 명령을 적는다(DECODE).
         *
         * @param g   장면 세대 번호
         * @param k   단계 번호
         * @param cur 단계 끝 상태
         */
        async function doD(g, k, cur) {
            const next = k + 1 < STEPS.length ? STEPS[k + 1] : null;
            const hasOp = !!next && next.phase === 'e' && !!next.bus && next.bus.label === 'A';
            const tail = hasOp ? ' 피연산자 주소=' + next.reg.MAR : ' 피연산자가 없어 메모리를 더 읽지 않습니다';
            view('rack');
            say('DECODE', 'CU가 IR=' + cur.IR + ' 명령을 해석합니다.' + tail);
            await carry(tk, 'MDR', cur.MDR, COLOR.decode, [trayAt(), new V(-0.2, 2.2, 0.0), irAt()], 1000);
            if (!alive(g)) return;
            setIr(cur.IR);
            bob();
            ping(irAt(), COLOR.decode, 0.9, 500);
            await wait(400);
        }

        /**
         * 피연산자 주소를 쪽지에 적어 보관대 칸을 연다(EXECUTE, 주소 전달).
         *
         * @param g   장면 세대 번호
         * @param k   단계 번호
         * @param cur 단계 끝 상태
         */
        async function doE1(g, k, cur) {
            const addr = addrOf(cur.MAR);
            view('rack');
            say('EXECUTE', 'MAR=' + cur.MAR + ': 피연산자 주소를 쪽지에 적어 보관대 칸 ' + cur.MAR + '에 보냅니다');
            setMar(cur.MAR);
            await carry(slip, 'MAR', cur.MAR, COLOR.exec, [irBottomAt(), new V(1.0, 2.9, -0.4), cellAt(addr)], 900);
            if (!alive(g)) return;
            ping(cellAt(addr), COLOR.exec, 0.9, 500);
            await wait(400);
        }

        /**
         * 재료 칸의 값을 집게를 거쳐 접시에 담는다(LOAD, ADD). ADD는 화구에서 더한다.
         *
         * @param g    장면 세대 번호
         * @param k    단계 번호
         * @param cur  단계 끝 상태
         * @param prev 직전 단계 상태
         */
        async function doER(g, k, cur, prev) {
            const addr = addrOf(cur.MAR);
            const isAdd = cur.IR === 'ADD';
            const what = isAdd
                ? 'ALU 계산: ACC=' + prev.ACC + ' + MDR=' + cur.MDR + ' → ACC=' + cur.ACC + ' (접시에 담음)'
                : '보관대 칸 ' + cur.MAR + '의 재료 값을 집게를 거쳐 접시(ACC)에 담습니다. ACC=' + cur.ACC;
            view('window');
            say('EXECUTE', what);
            await carry(tk, 'MDR', cur.MDR, COLOR.exec, [cellAt(addr), new V(-1.0, 1.9, -0.2), trayAt()], 1000);
            if (!alive(g)) return;
            setMdr(cur.MDR);
            setCounts(cur.f, cur.d);
            view('pass');
            if (isAdd) {
                await carry(tk, 'MDR', cur.MDR, COLOR.exec, [trayAt(), new V(0.7, 2.0, 0.5), stoveAt()], 800);
                if (!alive(g)) return;
                pulseAlu();
            } else {
                await carry(tk, 'MDR', cur.MDR, COLOR.exec, [trayAt(), new V(0.0, 1.9, 0.9), plateAt()], 800);
                if (!alive(g)) return;
            }
            setAcc(cur.ACC);
            ping(plateAt(), COLOR.exec, 0.9, 500);
            await wait(400);
        }

        /**
         * 접시(ACC)의 결과를 집게를 거쳐 보관대 칸에 다시 쓴다(EXECUTE, 결과 저장).
         *
         * @param g   장면 세대 번호
         * @param k   단계 번호
         * @param cur 단계 끝 상태
         */
        async function doEW(g, k, cur) {
            const addr = addrOf(cur.MAR);
            view('pass');
            say('EXECUTE', 'ACC의 결과를 집게 MDR로 옮겨 보관대 칸 ' + cur.MAR + '에 씁니다 (결과 저장, ACC=' + cur.ACC + ')');
            await carry(tk, 'MDR', cur.MDR, COLOR.exec, [plateAt(), new V(0.0, 1.9, 0.9), trayAt()], 800);
            if (!alive(g)) return;
            setMdr(cur.MDR);
            setCounts(cur.f, cur.d);
            view('rack');
            await carry(tk, 'MDR', cur.MDR, COLOR.exec, [trayAt(), new V(-0.6, 2.0, -0.2), cellAt(addr)], 1000);
            if (!alive(g)) return;
            setMem(addr, cur.mem[addr]);
            ping(cellAt(addr), COLOR.exec, 1.0, 600);
            await wait(400);
        }

        /**
         * HALT 단계다. 더 가져오지 않고, 마지막으로 쓴 칸의 결과를 보여 준다.
         *
         * @param g   장면 세대 번호
         * @param k   단계 번호
         * @param cur 단계 끝 상태
         */
        async function doX(g, k, cur) {
            const wa = lastWriteAt(k);
            view('wide');
            say('EXECUTE', 'HALT: 주문을 마칩니다. 보관대 칸 ' + addrHex(wa) + '=' + cur.mem[wa] + ' (결과 저장됨)');
            ping(cellAt(wa), COLOR.exec, 1.0, 600);
            await wait(500);
        }

        const DO = { F1: doF1, F2: doF2, D: doD, E1: doE1, ER: doER, EW: doEW, X: doX };

        /**
         * 데이터 단계 하나를 재생하고, 끝나면 화면을 단계 끝 값으로 맞춘다.
         *
         * @param i 장면 번호 (BADGES 기준, 1 이상)
         * @param g 장면 세대 번호
         */
        async function runStep(i, g) {
            const k = i - 1;
            const cur = snap(k);
            const prev = snap(k - 1);
            await DO[kindOf(k)](g, k, cur, prev);
            if (!alive(g)) return;
            syncAll(cur);
            view('wide');
        }

        /**
         * 단계를 시작하기 직전 주방 상태로 되돌린다. 나르는 카드와 번쩍임도 끈다.
         *
         * @param i 장면 번호 (BADGES 기준)
         */
        function reset(i) {
            eng.clearTweens();
            slip.mesh.visible = false;
            tk.mesh.visible = false;
            slip.mesh.scale.setScalar(1);
            tk.mesh.scale.setScalar(1);
            pings.forEach(function (sp) { sp.material.opacity = 0; });
            aluGlow.material.opacity = 0;
            chef.position.y = 0;
            syncAll(snap(i - 2));
            invalidate();
        }

        /**
         * 장면 하나를 시작 상태에서 끝까지 재생한다. 0번은 개요 장면이다.
         *
         * @param i 장면 번호 (BADGES 기준)
         * @param g 장면 세대 번호
         */
        async function play(i, g) {
            reset(i);
            if (i === 0) {
                view('overview');
                say('Overview', OVERVIEW_TEXT);
                return;
            }
            await runStep(i, g);
        }

        /**
         * 사이트 테마에 맞춰 배경, 안개, 바닥, 벽, 조명을 바꾼다.
         */
        function applyTheme() {
            const th = window.CsFlow.viz3d.isLight() ? THEMES.light : THEMES.dark;
            scene.background.setHex(th.bg);
            scene.fog.color.setHex(th.bg);
            groundM.color.setHex(th.ground);
            wallM.color.setHex(th.wall);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
            eng.renderer.toneMappingExposure = th.exposure;
        }

        eng.renderer.shadowMap.autoUpdate = false;
        eng.renderer.shadowMap.needsUpdate = true;
        reset(0);

        return {
            play: play,
            busy: function () { return false; },
            applyTheme: applyTheme
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'Instruction Cycle 3D',
        badges: BADGES,
        canvasLabel: '명령어 사이클을 주방 한 접시로 보여 주는 3D 장면. 번호표가 가리키는 주문서를 보관대에서 뽑고, 읽고, 재료를 접시에 담아 조리합니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: SHOTS.overview[0], t: SHOTS.overview[1] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    /**
     * 캔버스에 그리는 모든 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        return ['번호표 · PC', '집게 · MDR', '화구 · ALU', '보관대 · 메모리', '조리 메모 · IR', '접시 · ACC',
            '주방 칠판 · 레지스터', '명령 인출', '데이터 접근', '회', '빈 칸', 'PC', 'MAR', 'MDR', 'IR', 'ACC', 'ALU',
            'LOAD', 'ADD', 'STORE', 'HALT', '[]0123456789xABCDEFGHIJKLMNOPQRSTUVWXYZ+=?—'].join('');
    }

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();