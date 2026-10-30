/**
 * IEEE 754 부동소수점 3D 눈금 작업대 장면 (Three.js r128)
 * 2D 시각화의 "3D 눈금 작업대" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.ieee754Data)가 먼저 있어야 한다.
 * 작업대 세 개를 나란히 둔다. 비트 타일 32개를 부호 · 지수 · 가수로 묶어 올려 보는 대. 저장 가능한 값이 눈금뿐인 자로 0.1 + 0.2를 재는 대. 눈금 간격이 벌어지는 큰 수의 자와 특수 지수 문이 있는 대.
 * 비트 · 수치 · 자막은 2D 단계 데이터에서 읽는다. 자의 눈금 사이 어긋남은 보이도록 크게 과장해 그렸다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.ieee754Data) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const INK = kit.INK;

    /* ===================== 2D 데이터 (단계 값의 원본) ===================== */
    const D = window.CsFlow.ieee754Data;
    const BITS = D.bits.str;
    const NB = BITS.length;
    const FIELDS = D.fields;
    const SUM = D.sum;
    const RANGE = D.range;
    const EPS = D.dStep1;
    const DIFF_ABS = Math.abs(D.diff);
    const POW2 = Math.pow(2, D.exp);
    const SIGN_TEXT = D.sign > 0 ? '+1' : '−1';

    /* ===================== 상수 ===================== */
    const CHAPTERS = [
        { badge: '개요', kind: 'fields', data: FIELDS, idx: [0] },
        { badge: '부호', kind: 'fields', data: FIELDS, idx: [1] },
        { badge: '지수', kind: 'fields', data: FIELDS, idx: [2] },
        { badge: '가수', kind: 'fields', data: FIELDS, idx: [3] },
        { badge: '합성', kind: 'fields', data: FIELDS, idx: [4] },
        { badge: '근사 저장', kind: 'sum', data: SUM, idx: [0, 1, 2] },
        { badge: '합과 비교', kind: 'sum', data: SUM, idx: [3, 4] },
        { badge: '허용 오차', kind: 'sum', data: SUM, idx: [5, 6] },
        { badge: '간격', kind: 'range', data: RANGE, idx: [0, 1] },
        { badge: '큰 수', kind: 'range', data: RANGE, idx: [2, 3] },
        { badge: '특수값', kind: 'range', data: RANGE, idx: [4, 5] }
    ];
    const BADGES = CHAPTERS.map(function (c) { return c.badge; });
    const EMPTY = { fields: { k: 0 }, sum: { n: -1 }, range: { c: -1 } };
    const THEMES = {
        dark: { bg: 0x13161c, ground: 0x2a2e36, hemi: 0.7, sun: 1.0 },
        light: { bg: 0xd9d2c4, ground: 0xd6cfbf, hemi: 0.65, sun: 1.0 }
    };
    const FCOL = ['#d6453d', '#e6893a', '#1d9e75'];
    const FNAME = ['부호 s', '지수 e', '가수 f'];
    const DIM_BG = '#8a8478';
    const SUM_COL = '#7a5cc8';
    const STORE_COL = '#e6893a';
    const TRUE_COL = '#f3c13a';
    const GOOD = '#1d9e75';
    const BAD = '#d6453d';
    const NX = 16;
    const ZONE_X = { fields: 0, sum: NX, range: NX * 2 };
    const WALL_Z = -2.7;
    const TABLE_TOP = 0.5;
    const TOP = TABLE_TOP;
    const TILE = 0.36;
    const TILE_PITCH = 0.4;
    const ROW_LEN = 16;
    const LIFT = 0.28;
    const RULER_PITCH = 0.82;
    const RULER_TICKS = 10;
    const R1_Z = -0.95;
    const R2_Z = 0.65;
    const BOARD_Z = 2.25;
    const TICK_PAUSE = 1100;
    const SHOTS = {
        fields: { t: [0, 1.4, -0.2], dir: [0, 0.75, 1], w: 8.4, h: 8.6 },
        sum: { t: [NX, 0.8, 0.5], dir: [0, 0.85, 1], w: 9.4, h: 7.2 },
        range: { t: [NX * 2, 0.8, 0.4], dir: [0, 0.8, 1], w: 9.4, h: 6.6 }
    };
    const STR = {
        overview: '단정밀도 float',
        bit: '비트',
        gapBoard: '1 근처의 간격',
        ticksNote: '눈금 수는 설명용으로 그렸습니다',
        unit: '노란 선은 정확한 값, 기둥은 저장된 값 · 어긋남은 크게 과장해 그렸습니다',
        zero1: '0.1',
        zero2: '0.2',
        zero3: '0.3',
        sumLbl: '합',
        eps: '허용 오차',
        ulp: '이웃한 눈금',
        float: 'float',
        double: 'double',
        token: '+1',
        expAllOne: '지수 비트가 모두 1',
        expAllZero: '지수 비트가 모두 0',
        inf: '±무한대 · NaN',
        zero: '±0 · 비정규수'
    };

    /* ===================== 파생 값 (2D 데이터에서 계산) ===================== */
    /**
     * 비트 번호가 속한 필드 번호를 돌려준다. 0은 부호, 1은 지수, 2는 가수다.
     *
     * @param i 비트 번호
     * @returns 필드 번호
     */
    function fieldOf(i) {
        return i === 0 ? 0 : (i <= 8 ? 1 : 2);
    }

    /**
     * 필드의 비트 수를 센다.
     *
     * @param g 필드 번호
     * @returns 비트 수
     */
    function countOf(g) {
        let n = 0;
        for (let i = 0; i < NB; i++) if (fieldOf(i) === g) n++;
        return n;
    }

    /**
     * 이진 지수 값을 돌려준다. 가수 크기를 알 수 있는 실수 x의 ulp(이웃한 수 간격)다.
     *
     * @param x 양의 실수
     * @returns x 근처 double의 간격
     */
    function ulpOf(x) {
        return Math.pow(2, Math.floor(Math.log2(x)) - 52);
    }

    const GAP_TICKS = Math.round(D.diff / ulpOf(D.dc));
    const EPS_TICKS = Math.round(EPS / ulpOf(D.dc));
    const SNAP = Math.round(D.fBigP1 - D.fBig);
    const SNAP_D = Math.round(D.dBigP1 - D.dBig);

    /**
     * 장면 상태를 만들 때 쓰는 이전 단계 상태를 돌려준다. 장 첫 단계 앞의 단계가 없으면 빈 상태다.
     *
     * @param ch 장
     * @returns 장이 시작될 때의 단계 상태
     */
    function startState(ch) {
        return ch.idx[0] > 0 ? ch.data[ch.idx[0] - 1] : EMPTY[ch.kind];
    }

    /**
     * 비트 타일의 x 좌표를 돌려준다. 한 줄에 16개이며 첫 줄은 부호와 지수 경계에 틈이 있다.
     *
     * @param i 비트 번호
     * @returns x 좌표
     */
    function tileX(i) {
        const col = i % ROW_LEN;
        const gap = i < ROW_LEN ? (i >= 1 ? 0.12 : 0) + (i >= 9 ? 0.12 : 0) : 0;
        return (col - (ROW_LEN - 1) / 2) * TILE_PITCH + gap - 0.12;
    }

    /**
     * 계산판 줄을 2D 단계 데이터로 만든다.
     *
     * @returns 줄 목록({from, c, t})
     */
    function calcRows() {
        return [
            { from: 1, c: FCOL[0], t: '부호 s = ' + D.bits.s + ' → (−1)^' + D.bits.s + ' = ' + SIGN_TEXT },
            { from: 2, c: FCOL[1], t: '지수 e = ' + D.bits.e + ' → ' + D.bits.e + ' − 127 = ' + D.exp + ' → 2^' + D.exp + ' = ' + POW2 },
            { from: 3, c: FCOL[2], t: '가수 f = ' + D.bits.f + ' → 1 + f / 2^23 = ' + D.mant },
            { from: 4, c: INK, t: '값 = ' + SIGN_TEXT + ' × ' + D.mant + ' × ' + POW2 + ' = ' + (D.sign * D.mant * POW2) }
        ];
    }

    /**
     * 0.1 + 0.2 판의 줄을 2D 단계 데이터로 만든다. 줄마다 보이기 시작하는 단계가 있다.
     *
     * @returns 줄 목록({n, t, c})
     */
    function sumRows() {
        const ok = Math.abs(D.diff) < EPS;
        return [
            { n: 1, c: STORE_COL, t: '0.1 → ' + D.da.toFixed(D.dig) + '…' },
            { n: 2, c: STORE_COL, t: '0.2 → ' + D.db.toFixed(D.dig) + '…' },
            { n: 3, c: SUM_COL, t: STR.sumLbl + ' → ' + D.ds.toFixed(D.dig) + '… (' + String(D.ds) + ')' },
            { n: 4, c: STORE_COL, t: '0.3 → ' + D.dc.toFixed(D.dig) + '…' },
            { n: 4, c: D.ds === D.dc ? GOOD : BAD, t: '0.1 + 0.2 == 0.3  →  ' + (D.ds === D.dc) },
            { n: 5, c: ok ? GOOD : BAD, t: '|차이| = ' + String(DIFF_ABS) + ' < ' + String(EPS) + '  →  ' + ok }
        ];
    }

    /**
     * 장면에 쓰는 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        const cards = D.cards.map(function (c) { return c.title + ' ' + c.lines.join(' '); }).join(' ');
        return Object.keys(STR).map(function (k) { return STR[k]; }).join(' ') + ' ' + BADGES.join(' ') + ' ' + FNAME.join(' ') + ' ' + cards
            + ' ' + calcRows().map(function (r) { return r.t; }).join(' ') + ' ' + sumRows().map(function (r) { return r.t; }).join(' ')
            + ' 0123456789.+−×→=|<>()^/·…-eE±NaN ';
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 비트 타일 대, 눈금 자 대, 큰 수 자와 특수 지수 문 대를 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play)와 테마 훅(applyTheme, release)
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const state = v3.state;
        const alive = v3.alive;
        const wait = v3.wait;
        const say = v3.setCaption;
        const lowEnd = eng.lowEnd;

        scene.background = new THREE.Color(THEMES.dark.bg);
        scene.fog = new THREE.Fog(THEMES.dark.bg, 24, 56);

        /* ===================== 빛과 바닥 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.7);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.1);
        sun.position.set(-4, 12, 9);
        sun.castShadow = true;
        sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 40 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        scene.add(sun.target);
        const lamp = new THREE.PointLight(0xffd7a0, 0.5, 14);
        lamp.position.set(0, 3.6, 1.5);
        scene.add(lamp);

        const floorM = new THREE.MeshLambertMaterial({ color: THEMES.dark.ground });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 24), floorM);
        floor.rotation.x = -Math.PI / 2;
        floor.position.x = NX;
        floor.receiveShadow = true;
        scene.add(floor);
        const wallM = new THREE.MeshLambertMaterial({ map: eng.hatch('#e4dccb', 0.2, 80, 3) });
        Object.keys(ZONE_X).forEach(function (k) {
            const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 4.8), wallM);
            wall.position.set(ZONE_X[k], 2.4, WALL_Z);
            wall.receiveShadow = true;
            scene.add(wall);
        });

        const tableM = new THREE.MeshLambertMaterial({ color: 0x8b8577 });
        const rulerM = new THREE.MeshLambertMaterial({ color: 0xe9e2d3 });
        const tickM = new THREE.MeshLambertMaterial({ color: 0x3b3640 });
        const ghostM = new THREE.MeshBasicMaterial({ color: 0x8a8478, transparent: true, opacity: 0.45 });
        const bandM = new THREE.MeshBasicMaterial({ color: 0x1d9e75, transparent: true, opacity: 0.3, depthWrite: false });
        const doorM = new THREE.MeshLambertMaterial({ color: 0x5b5260 });

        /**
         * 상자를 만들어 위치를 잡고 씬에 붙인다.
         *
         * @param w       폭
         * @param h       높이
         * @param d       깊이
         * @param x       x 좌표
         * @param y       y 좌표
         * @param z       z 좌표
         * @param m       재료
         * @param outline 외곽선 여부
         * @returns 만든 메시
         */
        function box(w, h, d, x, y, z, m, outline) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (outline) eng.ink(mesh);
            scene.add(mesh);
            return mesh;
        }

        /**
         * 캔버스를 그린 평면을 만든다. redraw로 내용을 다시 그릴 수 있다.
         *
         * @param w    평면 폭
         * @param h    평면 높이
         * @param pw   캔버스 폭
         * @param ph   캔버스 높이
         * @param draw 그리기 함수(컨텍스트, 폭, 높이)
         * @returns 메시와 redraw 함수
         */
        function panel(w, h, pw, ph, draw) {
            const [c, x] = eng.canvas2d(pw, ph);
            const tex = eng.texture(c);
            const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            /**
             * 평면의 그림을 지우고 다시 그린다.
             *
             * @param fn 그리기 함수(컨텍스트, 폭, 높이)
             */
            function redraw(fn) {
                x.clearRect(0, 0, pw, ph);
                fn(x, pw, ph);
                tex.needsUpdate = true;
                eng.invalidate();
            }
            redraw(draw);
            return { mesh: mesh, redraw: redraw };
        }

        /**
         * 탁자 위에 눕혀 놓는 글자판을 만든다. 위에서 내려다보면 읽힌다.
         *
         * @param w    폭
         * @param d    깊이
         * @param x    x 좌표
         * @param z    z 좌표
         * @param draw 그리기 함수(컨텍스트, 폭, 높이)
         * @returns panel 반환값
         */
        function plate(w, d, x, z, draw) {
            const p = panel(w, d, Math.round(w * 200), Math.round(d * 200), draw);
            p.mesh.rotation.x = -Math.PI / 2;
            p.mesh.position.set(x, TOP + 0.012, z);
            scene.add(p.mesh);
            return p;
        }

        /**
         * 판을 칠하고 글자 줄을 가운데 정렬로 얹는다.
         *
         * @param x    캔버스 컨텍스트
         * @param pw   폭
         * @param ph   높이
         * @param bg   바탕 색
         * @param rows 글자 줄 목록({t, y, px, c, f, a})
         */
        function paint(x, pw, ph, bg, rows) {
            x.fillStyle = bg;
            x.fillRect(0, 0, pw, ph);
            x.strokeStyle = 'rgba(42,38,34,0.5)';
            x.lineWidth = 5;
            x.strokeRect(5, 5, pw - 10, ph - 10);
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            rows.forEach(function (r) {
                x.globalAlpha = r.a === undefined ? 1 : r.a;
                x.fillStyle = r.c;
                x.font = '700 ' + r.px + 'px ' + (r.f || SERIF);
                x.fillText(r.t, pw / 2, r.y * ph);
            });
            x.globalAlpha = 1;
        }

        const matCache = {};

        /**
         * 글자 판 평면 재료를 돌려준다. 같은 문구는 한 번만 만든다.
         *
         * @param text 적을 문구
         * @param fg   글자 색
         * @param bg   바탕 색
         * @returns 재료
         */
        function labelMat(text, fg, bg) {
            const key = fg + '|' + bg + '|' + text;
            if (!matCache[key]) {
                const [c, x] = eng.canvas2d(160, 100);
                kit.roundRect(x, 3, 3, 154, 94, 18);
                x.fillStyle = bg;
                x.fill();
                x.fillStyle = fg;
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                x.font = '700 ' + (text.length > 2 ? 48 : 74) + 'px ' + SERIF;
                x.fillText(text, 80, 52);
                matCache[key] = new THREE.MeshBasicMaterial({ map: eng.texture(c), transparent: true, depthWrite: false, toneMapped: false });
            }
            return matCache[key];
        }

        /**
         * 탁자 위에 세워 놓는 이름표를 만든다. 정면을 향한다.
         *
         * @param text 문구
         * @param fg   글자 색
         * @param bg   바탕 색
         * @param w    폭
         * @param x    x 좌표
         * @param y    y 좌표
         * @param z    z 좌표
         * @returns 메시
         */
        function tag(text, fg, bg, w, x, y, z) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.62), labelMat(text, fg, bg));
            m.position.set(x, y, z);
            scene.add(m);
            return m;
        }

        /* ===================== 작업대 1: 비트 타일 ===================== */
        box(10.4, TABLE_TOP, 4.6, ZONE_X.fields, TABLE_TOP / 2, 0.3, tableM, true);
        const tileGeo = new THREE.BoxGeometry(TILE, 0.16, TILE * 1.2);
        const faceGeo = new THREE.PlaneGeometry(TILE * 0.8, TILE * 0.5);
        const bodyLit = FCOL.map(function (c) { return new THREE.MeshLambertMaterial({ color: c }); });
        const bodyDim = new THREE.MeshLambertMaterial({ color: DIM_BG });
        const tiles = [];
        for (let i = 0; i < NB; i++) {
            const g = fieldOf(i);
            const body = new THREE.Mesh(tileGeo, bodyLit[g]);
            body.castShadow = true;
            body.receiveShadow = true;
            const face = new THREE.Mesh(faceGeo, labelMat(BITS[i], '#fffaf0', FCOL[g]));
            face.rotation.x = -Math.PI / 2;
            face.position.y = 0.085;
            body.add(face);
            body.userData = { g: g, lift: 0 };
            body.position.set(ZONE_X.fields + tileX(i), TOP + 0.08, i < ROW_LEN ? -0.55 : 0.2);
            scene.add(body);
            tiles.push(body);
        }
        FNAME.forEach(function (name, g) {
            const x = ZONE_X.fields + (g - 1) * 2.45;
            plate(2.25, 0.62, x, 1.35, function (c, pw, ph) {
                paint(c, pw, ph, FCOL[g], [{ t: name + ' · ' + countOf(g) + STR.bit, y: 0.52, px: 44, c: '#fffaf0' }]);
            });
        });

        let curK = 0;
        const calcBoard = panel(6.4, 2.0, 1280, 400, calcDraw);
        calcBoard.mesh.position.set(ZONE_X.fields, 2.45, WALL_Z + 0.04);
        scene.add(calcBoard.mesh);

        /**
         * 계산판을 그린다. 단계에 이른 줄은 선명하고 아직 이르지 못한 줄은 흐리다.
         *
         * @param c  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function calcDraw(c, pw, ph) {
            const rows = [{ t: STR.overview + ' ' + D.ex + ' = ' + NB + STR.bit, y: 0.14, px: 36, c: '#6b6358' }];
            calcRows().forEach(function (r, i) {
                rows.push({ t: r.t, y: 0.34 + i * 0.18, px: 40, c: r.c, a: curK >= r.from ? 1 : 0.2 });
            });
            paint(c, pw, ph, '#fbf8f1', rows);
        }

        /* ===================== 작업대 2: 눈금 자 ===================== */
        const SX = ZONE_X.sum;
        box(10.4, TABLE_TOP, 5.8, SX, TABLE_TOP / 2, 0.5, tableM, true);

        /**
         * 자의 눈금 x 좌표를 돌려준다. 소수 눈금 번호도 받는다.
         *
         * @param cx 자 가운데 x 좌표
         * @param k  눈금 번호
         * @returns x 좌표
         */
        function tickAt(cx, k) {
            return cx + (k - (RULER_TICKS - 1) / 2) * RULER_PITCH;
        }

        /**
         * 눈금이 있는 자를 만든다.
         *
         * @param cx  가운데 x 좌표
         * @param z   z 좌표
         * @param n   눈금 수
         * @param p   눈금 간격
         * @returns 그룹
         */
        function makeRuler(cx, z, n, p) {
            const g = new THREE.Group();
            const len = (n - 1) * p + 0.8;
            const base = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.7), rulerM);
            base.position.set(cx, TOP + 0.04, z);
            base.castShadow = true;
            base.receiveShadow = true;
            eng.ink(base);
            g.add(base);
            for (let k = 0; k < n; k++) {
                const t = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.4), tickM);
                t.position.set(cx + (k - (n - 1) / 2) * p, TOP + 0.09, z);
                g.add(t);
            }
            scene.add(g);
            return g;
        }

        const ruler1 = makeRuler(SX, R1_Z, RULER_TICKS, RULER_PITCH);
        const ruler2 = makeRuler(SX, R2_Z, RULER_TICKS, RULER_PITCH);

        /**
         * 값 기둥을 만든다. 눈금 위에 서고 윗면 위에 이름표가 붙는다.
         *
         * @param z    자의 z 좌표
         * @param k    눈금 번호
         * @param col  기둥 색
         * @param text 이름표 문구
         * @returns 그룹
         */
        function makePillar(z, k, col, text) {
            const g = new THREE.Group();
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.55, 18), new THREE.MeshLambertMaterial({ color: col }));
            body.position.y = 0.275;
            body.castShadow = true;
            g.add(body);
            const t = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.41), labelMat(text, '#fffaf0', col));
            t.position.set(0, 0.84, 0);
            g.add(t);
            g.position.set(tickAt(SX, k), TOP + 0.09, z);
            g.visible = false;
            scene.add(g);
            return g;
        }

        /**
         * 정확한 값의 위치를 가는 선으로 표시한다. 눈금 사이에 선다.
         *
         * @param z    자의 z 좌표
         * @param k    눈금 번호(소수 가능)
         * @returns 그룹
         */
        function makeHair(z, k) {
            const g = new THREE.Group();
            const line = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.07), new THREE.MeshBasicMaterial({ color: TRUE_COL }));
            line.position.y = 0.45;
            g.add(line);
            g.position.set(tickAt(SX, k), TOP + 0.09, z);
            g.visible = false;
            scene.add(g);
            return g;
        }

        const OFF1 = 3;
        const OFF2 = 6;
        const hairA = makeHair(R1_Z, OFF1 - 0.4);
        const hairB = makeHair(R1_Z, OFF2 - 0.4);
        const pillarA = makePillar(R1_Z, OFF1, STORE_COL, STR.zero1);
        const pillarB = makePillar(R1_Z, OFF2, STORE_COL, STR.zero2);
        const DC_K = 3;
        const hairC = makeHair(R2_Z, DC_K + 0.35);
        const pillarC = makePillar(R2_Z, DC_K, STORE_COL, STR.zero3);
        const pillarS = makePillar(R2_Z, DC_K + GAP_TICKS, SUM_COL, STR.sumLbl);
        const band = new THREE.Mesh(new THREE.BoxGeometry(EPS_TICKS * RULER_PITCH, 0.3, 0.5), bandM);
        band.position.set(tickAt(SX, DC_K) + (EPS_TICKS * RULER_PITCH) / 2, TOP + 0.24, R2_Z);
        band.visible = false;
        scene.add(band);
        const bandTag = plate(1.3, 0.4, band.position.x, R2_Z + 0.62, function (c, pw, ph) {
            paint(c, pw, ph, GOOD, [{ t: STR.eps, y: 0.52, px: 46, c: '#fffaf0' }]);
        });
        bandTag.mesh.visible = false;
        const ballA = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), new THREE.MeshLambertMaterial({ color: STORE_COL }));
        const ballB = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), new THREE.MeshLambertMaterial({ color: STORE_COL }));
        ballA.visible = false;
        ballB.visible = false;
        scene.add(ballA);
        scene.add(ballB);

        let curN = -1;
        const sumBoard = plate(8.8, 1.65, SX, BOARD_Z + 0.1, sumDraw);

        /**
         * 0.1 + 0.2 판을 그린다. 지금 단계까지 이른 줄만 보인다.
         *
         * @param c  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function sumDraw(c, pw, ph) {
            const rows = [{ t: STR.unit, y: 0.1, px: 28, c: '#6b6358' }];
            let y = 0.27;
            sumRows().forEach(function (r) {
                if (curN >= r.n) {
                    rows.push({ t: r.t, y: y, px: 33, c: r.c });
                    y += 0.125;
                }
            });
            paint(c, pw, ph, '#fbf8f1', rows);
        }

        /* ===================== 작업대 3: 큰 수와 특수값 ===================== */
        const RX = ZONE_X.range;
        box(10.4, TABLE_TOP, 5.4, RX, TABLE_TOP / 2, 0.3, tableM, true);
        const gapGroup = new THREE.Group();
        scene.add(gapGroup);
        const rf = makeRuler(RX, -0.9, 7, 1.15);
        const rd = makeRuler(RX, 0.4, 25, 0.29);
        gapGroup.add(rf);
        gapGroup.add(rd);
        const gapLbl = [
            tag(STR.float, '#fffaf0', FCOL[1], 0.8, RX - 4.3, TOP + 0.55, -0.9),
            tag(STR.double, '#fffaf0', FCOL[2], 0.8, RX - 4.3, TOP + 0.55, 0.4)
        ];
        gapLbl.forEach(function (m) { gapGroup.add(m); });

        const BIG_N = 7;
        const BIG_P = 1.1;
        const bigGroup = new THREE.Group();
        scene.add(bigGroup);
        const bigRuler = makeRuler(RX, -0.2, BIG_N, BIG_P);
        bigGroup.add(bigRuler);
        const bigX = function (k) { return RX + (k - (BIG_N - 1) / 2) * BIG_P; };
        for (let k = 1; k < BIG_N; k += 2) {
            const gh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 14), ghostM);
            gh.position.set(bigX(k), TOP + 0.34, -0.2);
            bigGroup.add(gh);
        }
        const bigTags = [];
        for (let j = 0; j < 4; j++) {
            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 18), new THREE.MeshLambertMaterial({ color: FCOL[1] }));
            col.position.set(bigX(j * 2), TOP + 0.34, -0.2);
            col.castShadow = true;
            bigGroup.add(col);
            const tg = panel(1.5, 0.38, 300, 76, function () {});
            tg.mesh.position.set(bigX(j * 2), TOP + 0.22, 0.5);
            bigGroup.add(tg.mesh);
            bigTags.push(tg);
        }
        const token = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), new THREE.MeshLambertMaterial({ color: SUM_COL }));
        token.castShadow = true;
        scene.add(token);
        const tokenTag = tag(STR.token, '#fffaf0', SUM_COL, 0.5, 0, 0, 0);
        scene.add(tokenTag);

        /**
         * 큰 수 자의 이름표를 다시 그린다. 첫 눈금은 2의 거듭제곱이고 나머지는 거기서 2씩 더한 값이다.
         *
         * @param value 첫 눈금 값(2의 거듭제곱)
         */
        function paintBigTags(value) {
            const e = Math.round(Math.log2(value));
            bigTags.forEach(function (tg, j) {
                tg.redraw(function (c, pw, ph) {
                    paint(c, pw, ph, '#fbf8f1', [{ t: j === 0 ? '2^' + e : '+' + j * 2, y: 0.52, px: 42, c: INK }]);
                });
            });
        }

        /**
         * 특수 지수 문 한 개를 만든다. 문 위에 지수 비트와 뜻이 적힌다.
         *
         * @param x    x 좌표
         * @param bit  지수 비트 문자('1' 또는 '0')
         * @param res  문 뒤에 나오는 값 문구
         * @param col  문 색
         * @returns 그룹
         */
        function makeDoor(x, bit, res, col) {
            const g = new THREE.Group();
            [-0.85, 0.85].forEach(function (dx) {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), doorM);
                post.position.set(dx, 0.8, 0);
                post.castShadow = true;
                g.add(post);
            });
            const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 0.2), doorM);
            lintel.position.y = 1.7;
            lintel.castShadow = true;
            g.add(lintel);
            const sign = panel(1.7, 0.52, 340, 104, function (c, pw, ph) {
                paint(c, pw, ph, col, [{ t: 'e = ' + bit.repeat(countOf(1)), y: 0.52, px: 36, c: '#fffaf0' }]);
            });
            sign.mesh.position.set(0, 1.7, 0.12);
            g.add(sign.mesh);
            const out = panel(1.9, 0.7, 380, 140, function (c, pw, ph) {
                paint(c, pw, ph, '#fbf8f1', [{ t: res, y: 0.52, px: 40, c: INK }]);
            });
            out.mesh.rotation.x = -Math.PI / 2;
            out.mesh.position.set(0, 0.013, 1.0);
            g.add(out.mesh);
            g.position.set(x, TOP, -0.2);
            scene.add(g);
            return g;
        }
        const doors = new THREE.Group();
        scene.add(doors);
        doors.add(makeDoor(RX - 2.4, '1', STR.inf, FCOL[0]));
        doors.add(makeDoor(RX + 2.4, '0', STR.zero, FCOL[2]));
        const doorA = doors.children[0];
        const doorB = doors.children[1];
        doors.visible = false;

        let curC = -1;
        const rangeBoard = plate(8.8, 1.3, RX, 2.1, rangeDraw);

        /**
         * 범위 판을 그린다. 지금 단계가 가리키는 2D 카드의 제목과 줄을 그대로 쓴다.
         *
         * @param c  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function rangeDraw(c, pw, ph) {
            const card = curC >= 1 ? D.cards[Math.min(curC, D.cards.length) - 1] : null;
            const rows = [];
            if (card) {
                rows.push({ t: card.title, y: 0.18, px: 36, c: '#6b6358' });
                card.lines.forEach(function (t, i) { rows.push({ t: t, y: 0.4 + i * 0.22, px: 34, c: INK }); });
                if (curC === 1) rows.push({ t: STR.ticksNote, y: 0.86, px: 26, c: '#6b6358' });
            } else if (curC === 0) {
                rows.push({ t: STR.gapBoard, y: 0.5, px: 40, c: '#6b6358' });
            }
            paint(c, pw, ph, '#fbf8f1', rows);
        }

        /* ===================== 움직임 도구 ===================== */
        /**
         * 배속을 반영한 트윈을 등록한다.
         *
         * @param ms   기준 밀리초
         * @param fn   값을 받는 함수 (0에서 1)
         * @param ease 이징 함수
         * @returns 완료 Promise
         */
        function tw(ms, fn, ease) {
            return eng.tween(ms / state.speed, fn, ease);
        }

        /**
         * 객체를 부풀려 나타나게 한다.
         *
         * @param obj 객체
         * @returns 완료 Promise
         */
        function pop(obj) {
            obj.scale.setScalar(0.001);
            obj.visible = true;
            return tw(380, function (p) { obj.scale.setScalar(Math.max(0.001, p)); }, eng.api.easeBack);
        }

        /**
         * 객체를 호를 그리며 옮긴다.
         *
         * @param obj 옮길 객체
         * @param to  도착 위치
         * @param ms  기준 밀리초
         * @returns 완료 Promise
         */
        function glide(obj, to, ms) {
            const from = obj.position.clone();
            const mid = from.clone().lerp(to, 0.5);
            mid.y = Math.max(from.y, to.y) + 0.7;
            const curve = new THREE.CatmullRomCurve3([from, mid, to]);
            return tw(ms, function (p) { curve.getPoint(p, obj.position); }, eng.api.easeInOut);
        }

        /* ===================== 장면 상태 ===================== */
        /**
         * 타일의 색과 높이를 단계에 맞춘다. 올릴 필드가 없으면 모두 제 색이고 바닥에 있다.
         *
         * @param k 비트 구성 단계의 필드 번호(1에서 3이 필드, 그 밖은 전체)
         * @param animate true면 높이를 부드럽게 바꾼다
         * @returns 완료 Promise
         */
        function setTiles(k, animate) {
            const g = k >= 1 && k <= 3 ? k - 1 : -1;
            tiles.forEach(function (t) {
                t.material = g < 0 || t.userData.g === g ? bodyLit[t.userData.g] : bodyDim;
            });
            const from = tiles.map(function (t) { return t.userData.lift; });
            const to = tiles.map(function (t) { return t.userData.g === g ? LIFT : 0; });
            /**
             * 타일 높이를 보간해 적용한다.
             *
             * @param p 진행 값(0에서 1)
             */
            function apply(p) {
                tiles.forEach(function (t, i) {
                    t.userData.lift = from[i] + (to[i] - from[i]) * p;
                    t.position.y = TOP + 0.08 + t.userData.lift;
                });
            }
            if (!animate) {
                apply(1);
                eng.invalidate();
                return Promise.resolve();
            }
            return tw(450, apply, eng.api.easeInOut);
        }

        /**
         * 범위 작업대에서 단계에 맞는 구성만 보이게 한다.
         *
         * @param c 범위 단계 번호
         */
        function showRange(c) {
            gapGroup.visible = c >= 0 && c <= 1;
            bigGroup.visible = c === 2 || c === 3;
            token.visible = c === 2 || c === 3;
            tokenTag.visible = token.visible;
            doors.visible = c === 4;
            doors.children.forEach(function (d) { d.scale.setScalar(1); });
            rangeBoard.mesh.visible = c >= 0;
            if (c === 2) paintBigTags(D.fBig);
            if (c === 3) paintBigTags(D.dBig);
            token.position.set(bigX(0), TOP + 0.75, -0.2);
            tokenTag.position.set(bigX(0), TOP + 1.2, -0.2);
            curC = c;
            rangeBoard.redraw(rangeDraw);
        }

        /**
         * 눈금 자 작업대 상태를 즉시 만든다.
         *
         * @param n 0.1 + 0.2 단계 번호
         */
        function showSum(n) {
            curN = n;
            ruler1.visible = n >= 0;
            ruler2.visible = n >= 3;
            hairA.visible = n >= 0;
            hairB.visible = n >= 0;
            pillarA.visible = n >= 1;
            pillarB.visible = n >= 2;
            pillarS.visible = n >= 3;
            pillarC.visible = n >= 4;
            hairC.visible = n >= 4;
            band.visible = n >= 5;
            bandTag.mesh.visible = n >= 5;
            ballA.visible = false;
            ballB.visible = false;
            [pillarA, pillarB, pillarS, pillarC, hairA, hairB, hairC].forEach(function (p) { p.scale.setScalar(1); });
            band.scale.set(1, 1, 1);
            band.position.x = tickAt(SX, DC_K) + (EPS_TICKS * RULER_PITCH) / 2;
            sumBoard.redraw(sumDraw);
        }

        /**
         * 단계 상태를 즉시 만든다. 장을 시작하거나 되감을 때 부른다.
         *
         * @param kind 장 종류
         * @param st   단계 상태
         */
        function setScene(kind, st) {
            eng.clearTweens();
            curK = kind === 'fields' ? st.k : 0;
            setTiles(kind === 'fields' ? st.k : 0, false);
            calcBoard.redraw(calcDraw);
            showSum(kind === 'sum' ? st.n : -1);
            showRange(kind === 'range' ? st.c : -1);
            eng.invalidate();
        }

        /**
         * 카메라 구도를 잡는다. 화면 비율과 폭, 높이에 맞춰 거리를 정한다.
         *
         * @param key SHOTS의 구도 이름
         */
        function view(key) {
            const s = SHOTS[key];
            const sw = eng.stage.clientWidth || 1;
            const sh = eng.stage.clientHeight || 1;
            const tanHalf = Math.tan((sw < 520 ? 46 : 32) * Math.PI / 360);
            const dw = (s.w * 1.12) / ((sw / sh) * 2 * tanHalf);
            const dh = s.h / (2 * tanHalf);
            const dir = new V(s.dir[0], s.dir[1], s.dir[2]).normalize();
            const t = new V(s.t[0], s.t[1], s.t[2]);
            const p = t.clone().addScaledVector(dir, Math.max(dw, dh));
            sun.position.set(t.x - 4, 12, 9);
            sun.target.position.set(t.x, 0, 0);
            lamp.position.x = t.x;
            eng.api.shot([p.x, p.y, p.z], [t.x, t.y, t.z]);
        }

        /* ===================== 단계 움직임 ===================== */
        /**
         * 비트 구성 단계를 재생한다. 필드 타일이 올라오고 계산판 줄이 선명해진다.
         *
         * @param g    단계 세대 번호
         * @param from 이전 상태({k})
         * @param to   이번 상태
         * @returns 단계가 아직 유효하면 true
         */
        async function runFields(g, from, to) {
            curK = to.k;
            calcBoard.redraw(calcDraw);
            await setTiles(to.k, true);
            return alive(g);
        }

        /**
         * 0.1 + 0.2 단계를 재생한다. 정확한 값 선, 저장 기둥, 합 기둥, 허용 오차 띠가 차례로 나타난다.
         *
         * @param g    단계 세대 번호
         * @param from 이전 상태({n})
         * @param to   이번 상태
         * @returns 단계가 아직 유효하면 true
         */
        async function runSum(g, from, to) {
            const a = from.n;
            const b = to.n;
            if (a < 0 && b >= 0) {
                ruler1.visible = true;
                hairA.visible = true;
                hairB.visible = true;
                await Promise.all([pop(hairA), pop(hairB)]);
                if (!alive(g)) return false;
            }
            if (a < 1 && b >= 1) {
                curN = Math.max(curN, 1);
                sumBoard.redraw(sumDraw);
                await pop(pillarA);
                if (!alive(g)) return false;
            }
            if (a < 2 && b >= 2) {
                curN = Math.max(curN, 2);
                sumBoard.redraw(sumDraw);
                await pop(pillarB);
                if (!alive(g)) return false;
            }
            if (a < 3 && b >= 3) {
                ruler2.visible = true;
                ballA.position.copy(pillarA.position).y += 0.7;
                ballB.position.copy(pillarB.position).y += 0.7;
                ballA.visible = true;
                ballB.visible = true;
                const dest = pillarS.position.clone();
                dest.y += 0.9;
                await Promise.all([glide(ballA, dest, 800), glide(ballB, dest, 800)]);
                if (!alive(g)) return false;
                ballA.visible = false;
                ballB.visible = false;
                curN = Math.max(curN, 3);
                sumBoard.redraw(sumDraw);
                await pop(pillarS);
                if (!alive(g)) return false;
            }
            if (a < 4 && b >= 4) {
                curN = Math.max(curN, 4);
                sumBoard.redraw(sumDraw);
                hairC.visible = true;
                await Promise.all([pop(hairC), pop(pillarC)]);
                if (!alive(g)) return false;
            }
            if (a < 5 && b >= 5) {
                curN = Math.max(curN, 5);
                sumBoard.redraw(sumDraw);
                band.visible = true;
                bandTag.mesh.visible = true;
                await tw(500, function (p) {
                    band.scale.set(Math.max(0.01, p), 1, 1);
                    band.position.x = tickAt(SX, DC_K) + (EPS_TICKS * RULER_PITCH * Math.max(0.01, p)) / 2;
                }, eng.api.easeInOut);
                if (!alive(g)) return false;
            }
            return true;
        }

        /**
         * 범위 단계를 재생한다. 큰 수 자에서는 +1 공이 건너뛴 눈금에 닿았다가 가장 가까운 눈금으로 돌아온다.
         *
         * @param g    단계 세대 번호
         * @param from 이전 상태({c})
         * @param to   이번 상태
         * @returns 단계가 아직 유효하면 true
         */
        async function runRange(g, from, to) {
            if (to.c !== from.c) showRange(to.c);
            if ((to.c === 2 || to.c === 3) && to.c !== from.c) {
                const snap = to.c === 2 ? SNAP : SNAP_D;
                const y = TOP + 0.75;
                await tw(500, function (p) {
                    token.position.set(bigX(0) + p * BIG_P, y + Math.sin(Math.PI * p) * 0.5, -0.2);
                    tokenTag.position.set(token.position.x, token.position.y + 0.45, -0.2);
                }, eng.api.easeInOut);
                if (!alive(g)) return false;
                await wait(500);
                if (!alive(g)) return false;
                await tw(500, function (p) {
                    token.position.set(bigX(snap) + (1 - p) * (BIG_P * (1 - snap)), y, -0.2);
                    tokenTag.position.set(token.position.x, y + 0.45, -0.2);
                }, eng.api.easeInOut);
                if (!alive(g)) return false;
            }
            if (to.c === 4 && from.c !== 4) {
                await Promise.all([pop(doorA), pop(doorB)]);
                if (!alive(g)) return false;
            }
            return true;
        }

        /* ===================== 장면 진행 ===================== */
        /**
         * 장 하나를 이전 단계의 끝 상태에서 시작해 재생한다. 장 안의 2D 단계를 차례로 보이며 자막은 2D 설명을 그대로 쓴다.
         *
         * @param i 장 번호
         * @param g 장 시작 시점의 세대 번호
         */
        async function play(i, g) {
            const ch = CHAPTERS[i];
            let prev = startState(ch);
            setScene(ch.kind, prev);
            view(ch.kind);
            const run = ch.kind === 'fields' ? runFields : (ch.kind === 'sum' ? runSum : runRange);
            for (let j = 0; j < ch.idx.length; j++) {
                const cur = ch.data[ch.idx[j]];
                say(ch.badge, cur.log);
                if (!await run(g, prev, cur)) return;
                prev = cur;
                if (j < ch.idx.length - 1) {
                    await wait(TICK_PAUSE);
                    if (!alive(g)) return;
                }
            }
        }

        /**
         * 사이트 테마에 맞춰 배경, 안개, 바닥, 조명을 바꾼다.
         */
        function applyTheme() {
            const th = window.CsFlow.viz3d.isLight() ? THEMES.light : THEMES.dark;
            scene.background.setHex(th.bg);
            scene.fog.color.setHex(th.bg);
            floorM.color.setHex(th.ground);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
        }

        /**
         * 월드가 쥔 재료와 텍스처는 엔진이 장면을 순회하며 해제하므로 따로 할 일이 없다.
         */
        function release() {}

        setScene('fields', EMPTY.fields);

        return {
            play: play,
            applyTheme: applyTheme,
            release: release
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: '부동소수점 눈금 작업대',
        badges: BADGES,
        canvasLabel: 'IEEE 754 부동소수점을 작업대 세 개로 보여 주는 3D. 비트 타일을 부호, 지수, 가수로 묶어 올려 보고, 눈금뿐인 자에서 0.1 더하기 0.2가 0.3과 어긋나는 모습을 재고, 큰 수에서 눈금 간격이 벌어지는 모습과 특수 지수 문을 봅니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: [0, 6.2, 8.2], t: [0, 1.0, -0.2] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();