/**
 * 비순차 실행 3D 출고 센터 장면 (Three.js r128)
 * 2D 시각화의 "3D 출고 센터" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.oooData)가 먼저 있어야 한다.
 * 주문서(명령어)가 접수 순서대로 예약 스테이션에 들어가고, 재료가 준비된 주문부터 작업대(실행 유닛)에서 처리된다.
 * 결과는 재정렬 선반(ROB)에 프로그램 순서대로 쌓였다가, 순서대로만 출고(확정)된다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.oooData) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const HAND = kit.HAND;
    const INK = kit.INK;

    /* ===================== 2D 데이터 (단계 값의 원본) ===================== */
    const DATA = window.CsFlow.oooData;
    const INSTR = DATA.instr;
    const N = INSTR.length;
    const IO_TOTAL = DATA.io.total;
    const OOO_START = DATA.ooo.start;
    const OOO_END = DATA.ooo.end;
    const OOO_TOTAL = DATA.ooo.total;
    const COMMIT = DATA.commit;
    const COMMIT_W = DATA.commitWidth;
    const LAST_COMMIT = Math.max.apply(null, COMMIT);

    /* ===================== 상수 ===================== */
    const BADGES = ['OVERVIEW', 'ARRIVE', 'BYPASS', 'OUT OF ORDER', 'COMMIT', 'EXCEPTION'];
    const START = [0, 0, 2, 4, 6, 7];
    const THEMES = {
        dark: { bg: 0x0f0f1a, ground: 0x2c2c3a, hemi: 0.7, sun: 1.0 },
        light: { bg: 0xd9d2c4, ground: 0xd6cfbf, hemi: 0.65, sun: 1.0 }
    };
    const X = { deck: -5.75, res: -3.0, bench: [0.0, 1.25, 2.5], rob: 5.4, door: 8.4 };
    const PITCH = 0.7;
    const SLIP_W = 0.66;
    const SLIP_H = 0.42;
    const RACK_Y0 = 0.85;
    const RACK_Y1 = 2.0;
    const CELL_Y = (RACK_Y0 + RACK_Y1) / 2;
    const BENCH_TOP = 0.95;
    const WALL_Z = -1.2;
    const TICK_PAUSE = 1000;
    const KINDS = ['tray', 'res', 'bench', 'rob', 'out'];
    const RANK = { tray: 0, res: 1, bench: 2, rob: 3, out: 4 };
    const SHOTS = {
        wide: { t: [1.4, 1.9, 0], dir: [0, 0.3, 1], w: 16.4, h: 6.2 },
        reserve: { t: [-3.4, 1.5, 0], dir: [0, 0.3, 1], w: 5.8, h: 3.6 },
        bench: { t: [1.25, 1.5, 0], dir: [0, 0.3, 1], w: 5.6, h: 3.6 },
        rob: { t: [5.9, 1.5, 0], dir: [0, 0.3, 1], w: 6.8, h: 3.6 }
    };
    const STATUS_LINE = { none: '#8a8a8a', wait: '#ff7a2f', ready: '#8a5cff', exec: '#1d9e75', done: '#e6b422', commit: '#2fb865', exc: '#e24b4a', disc: '#8a8a95' };
    const STATUS_TEXT = { none: '#6b6358', wait: '#b5532e', ready: '#6236d6', exec: '#0f7a58', done: '#8a6410', commit: '#1d7a45', exc: '#b3262a', disc: '#55555f' };
    const STATUS_LABEL = { none: '접수 대기', ready: '준비됨', done: '완료 · 확정 대기', commit: '확정', exc: '예외', disc: '폐기' };
    const SIGNS = [
        { t: '접수 대기', x: X.deck, w: 1.3 },
        { t: '예약 스테이션', x: X.res, w: 2.3 },
        { t: '실행 작업대', x: X.bench[1], w: 2.1 },
        { t: '재정렬 선반 · ROB', x: X.rob, w: 2.6 },
        { t: '출고 문', x: X.door, w: 1.3 }
    ];

    /* ===================== 파생 값 (2D 데이터에서 계산) ===================== */
    /**
     * 명령어를 처리할 작업대 번호를 돌려준다. 0은 메모리, 1은 곱셈, 2는 덧셈(ALU) 작업대다.
     *
     * @param i 명령어 번호
     * @returns 작업대 번호
     */
    function unitOf(i) {
        const op = INSTR[i].op;
        if (op === 'LOAD') return 0;
        if (op === 'MUL') return 1;
        return 2;
    }
    const UNIT_NAME = ['메모리 LOAD', '곱셈 MUL', '덧셈 ALU'];
    const UNIT_LAT = [0, 1, 2].map(function (u) {
        let lat = 0;
        INSTR.forEach(function (it, i) {
            if (unitOf(i) === u) lat = Math.max(lat, it.lat);
        });
        return lat;
    });
    const ORDER = INSTR.map(function (it, i) { return i; })
        .sort(function (a, b) { return OOO_START[a] - OOO_START[b]; })
        .map(function (i) { return INSTR[i].id; })
        .join(' → ');
    const CAP = {
        1: ['Arrive', 'I1 도착. 피연산자가 준비돼 바로 메모리 작업대로 발행됩니다 (LOAD, ' + UNIT_LAT[0] + '사이클)'],
        2: ['Wait', 'I2 도착. r1은 I1이 만들어야 해서 예약 스테이션에서 기다립니다'],
        3: ['Bypass', 'I3 도착. r5와 r6이 준비돼 있어 I2보다 먼저 곱셈 작업대로 발행됩니다 (MUL, ' + UNIT_LAT[1] + '사이클)'],
        4: ['Wait', 'I4 도착. r4는 I3이 계산 중이라 대기합니다. I2도 여전히 r1을 기다립니다'],
        5: ['Out of order', 'I5는 도착과 동시에 실행됩니다. I3이 끝나 r4가 준비되고, I3과 I5의 결과는 ROB 칸에 쌓입니다. 맨 앞 I1이 끝나지 않아 확정은 보류됩니다'],
        6: ['Out of order', 'I4 발행 (r4 준비). I1도 완료돼 ROB의 맨 앞(head)이 준비됐습니다. 확정은 다음 사이클부터 가능합니다'],
        7: ['Commit', 'I2를 마지막으로 발행합니다. head인 I1을 확정해 r1에 결과를 반영합니다'],
        8: ['Commit', 'I2, I3 확정. 한 사이클에 최대 ' + COMMIT_W + '개까지만 확정합니다'],
        9: ['Commit', 'I4, I5 확정. 실행은 ' + ORDER + ' 순서였지만 결과는 I1부터 I5까지 순서대로 나갑니다. 실행 ' + OOO_TOTAL + '사이클, 확정 ' + LAST_COMMIT + '사이클']
    };

    /* ===================== 상태 계산 (2D stateAt과 같은 기준) ===================== */
    /**
     * 명령어가 기다리는 피연산자 레지스터 이름을 돌려준다. 모두 준비돼 있으면 빈 문자열이다.
     *
     * @param i 명령어 번호
     * @param c 사이클 번호
     * @returns 레지스터 이름 또는 빈 문자열
     */
    function waitingReg(i, c) {
        const it = INSTR[i];
        for (let k = 0; k < it.src.length; k++) {
            const p = it.prod[k];
            if (p >= 0 && OOO_END[p] > c) return it.src[k];
        }
        return '';
    }

    /**
     * 사이클 c 끝 시점에서 명령어의 상태를 돌려준다.
     *
     * @param i 명령어 번호
     * @param c 사이클 번호
     * @returns none, wait, ready, exec, done, commit 중 하나
     */
    function statusOf(i, c) {
        if (INSTR[i].arrive > c) return 'none';
        if (COMMIT[i] <= c) return 'commit';
        if (OOO_END[i] <= c) return 'done';
        if (OOO_START[i] <= c) return 'exec';
        return waitingReg(i, c) ? 'wait' : 'ready';
    }

    /**
     * 사이클 c 끝 시점에서 명령어가 놓인 자리를 돌려준다.
     *
     * @param i 명령어 번호
     * @param c 사이클 번호
     * @returns tray, res, bench, rob, out 중 하나
     */
    function locOf(i, c) {
        if (INSTR[i].arrive > c) return 'tray';
        if (COMMIT[i] <= c) return 'out';
        if (OOO_END[i] <= c) return 'rob';
        if (OOO_START[i] <= c) return 'bench';
        return 'res';
    }

    /**
     * 캔버스에 그리는 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        const words = SIGNS.map(function (s) { return s.t; })
            .concat(UNIT_NAME, Object.keys(STATUS_LABEL).map(function (k) { return STATUS_LABEL[k]; }))
            .concat(['사이클', '실행', '완료', '확정', '출고 상황판', '실행 완료', '모두 확정', '접수 대기 · 5장', '대기', '준비됨', '사이클 ', '1사이클', '6사이클', '3사이클']);
        return words.join(' ') + ' 0123456789/ I1I2I3I4I5r1r2r4r7r9 HEAD LOADMULALU';
    }

    /**
     * 색 번호를 캔버스용 16진 문자열로 바꾼다.
     *
     * @param n 0xRRGGBB 색 번호
     * @returns #으로 시작하는 6자리 문자열
     */
    function hex6(n) {
        return '#' + n.toString(16).padStart(6, '0');
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 출고 센터 단면(접수 더미, 예약 스테이션, 작업대, 재정렬 선반, 출고 문)과 상황판을 포함한다.
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
        const easeInOut = eng.api.easeInOut;
        const lowEnd = eng.lowEnd;
        let curC = 0;
        let excMode = false;
        const where = INSTR.map(function () { return 'tray'; });
        const overrides = INSTR.map(function () { return null; });

        scene.background = new THREE.Color(THEMES.dark.bg);
        scene.fog = new THREE.Fog(THEMES.dark.bg, 24, 48);

        /* ===================== 빛과 바닥 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.7);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.1);
        sun.position.set(-4, 12, 9);
        sun.castShadow = true;
        sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 6, bottom: -6, near: 1, far: 40 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const lamp = new THREE.PointLight(0xffd7a0, 0.6, 14);
        lamp.position.set(1.4, 3.4, 3);
        scene.add(lamp);

        const floorM = new THREE.MeshLambertMaterial({ color: THEMES.dark.ground });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), floorM);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.2), new THREE.MeshLambertMaterial({ map: eng.hatch('#e4dccb', 0.2, 80, 3) }));
        wall.position.set(1.4, 2.1, WALL_Z);
        wall.receiveShadow = true;
        scene.add(wall);

        const steelM = new THREE.MeshLambertMaterial({ color: 0x6b7a8f });
        const steelDarkM = new THREE.MeshLambertMaterial({ color: 0x3e4a5a });
        const concreteM = new THREE.MeshLambertMaterial({ color: 0x8b8577 });
        const tealM = new THREE.MeshLambertMaterial({ color: 0x1d9e75 });
        const binM = new THREE.MeshLambertMaterial({ color: 0x8c3b3b });
        const hazardM = new THREE.MeshLambertMaterial({ color: 0xe0b020 });
        const doorM = new THREE.MeshLambertMaterial({ color: 0x17151c });

        /**
         * 상자를 만들어 위치를 잡고 씬에 붙인다.
         *
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
         * @returns 메시, 재료, redraw 함수
         */
        function panel(w, h, pw, ph, draw, basic) {
            const [c, x] = eng.canvas2d(pw, ph);
            const tex = eng.texture(c);
            const mat = basic
                ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false })
                : new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
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
            return { mesh: mesh, mat: mat, redraw: redraw };
        }

        /**
         * 칸마다 글자를 한 줄로 가운데에 그리는 함수를 돌려준다.
         *
         * @param texts 칸 수만큼의 문구
         * @returns 그리기 함수
         */
        function labelDraw(texts) {
            return function (x, pw, ph) {
                x.fillStyle = INK;
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                x.font = '700 ' + Math.round(ph * 0.6) + 'px ' + SERIF;
                texts.forEach(function (t, k) { x.fillText(t, (k + 0.5) * pw / texts.length, ph / 2 + 2); });
            };
        }

        /**
         * 벽에 거는 안내판을 만든다. 글씨가 넘치면 크기를 줄인다.
         */
        function sign(text, x, w, color) {
            const draw = function (c, pw, ph) {
                c.fillStyle = '#f6ecd6';
                c.fillRect(0, 0, pw, ph);
                c.strokeStyle = hex6(color);
                c.lineWidth = 8;
                c.strokeRect(4, 4, pw - 8, ph - 8);
                c.fillStyle = INK;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                let fs = 56;
                c.font = '700 ' + fs + 'px ' + SERIF;
                while (c.measureText(text).width > pw - 40 && fs > 24) {
                    fs -= 2;
                    c.font = '700 ' + fs + 'px ' + SERIF;
                }
                c.fillText(text, pw / 2, ph / 2 + 2);
            };
            const p = panel(w, w * 96 / 512, 512, 96, draw, true);
            p.mesh.position.set(x, 3.35, WALL_Z + 0.03);
            scene.add(p.mesh);
        }

        /* ===================== 건물과 선반 ===================== */
        box(18, 0.01, 0.12, 1.4, 0.005, 1.9, hazardM, false);
        const doorOpen = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.5), doorM);
        doorOpen.position.set(X.door, 1.25, WALL_Z + 0.01);
        scene.add(doorOpen);
        box(0.12, 2.6, 0.12, X.door - 0.56, 1.3, WALL_Z + 0.06, steelDarkM, true);
        box(0.12, 2.6, 0.12, X.door + 0.56, 1.3, WALL_Z + 0.06, steelDarkM, true);
        box(1.24, 0.12, 0.12, X.door, 2.6, WALL_Z + 0.06, steelDarkM, true);

        /**
         * 선반 한 줄을 만든다. 칸은 PITCH 간격으로 n개이고, 칸 사이는 칸막이로 나눈다.
         *
         * @param cx 선반 가운데 x 좌표
         * @param n  칸 수
         */
        function rack(cx, n) {
            const w = PITCH * n;
            const mid = (RACK_Y0 + RACK_Y1) / 2;
            const H = RACK_Y1 - RACK_Y0;
            box(w + 0.12, H + 0.1, 0.06, cx, mid, -0.2, steelDarkM, true);
            for (let k = 0; k <= n; k++) box(0.05, H, 0.5, cx + (k - n / 2) * PITCH, mid, 0, steelM, true);
            box(w + 0.1, 0.06, 0.5, cx, RACK_Y0 - 0.03, 0, steelM, true);
            box(w + 0.1, 0.06, 0.5, cx, RACK_Y1 + 0.03, 0, steelM, true);
        }
        rack(X.res, 5);
        rack(X.rob, 5);

        const resLabel = panel(PITCH * 5, 0.3, 700, 60, labelDraw(['1', '2', '3', '4', '5']), true);
        resLabel.mesh.position.set(X.res, 0.7, 0.27);
        scene.add(resLabel.mesh);
        const robLabel = panel(PITCH * 5, 0.3, 700, 60, labelDraw(INSTR.map(function (it) { return it.id; })), true);
        robLabel.mesh.position.set(X.rob, 0.7, 0.27);
        scene.add(robLabel.mesh);

        /* ===================== 접수 더미 ===================== */
        box(0.95, 0.9, 0.55, X.deck, 0.45, 0, steelDarkM, true);
        const deckLabel = panel(0.9, 0.2, 360, 80, labelDraw(['접수 대기 · 5장']), true);
        deckLabel.mesh.position.set(X.deck, 0.66, 0.285);
        scene.add(deckLabel.mesh);

        /* ===================== 실행 작업대 ===================== */
        const fills = [];
        X.bench.forEach(function (bx, u) {
            box(0.95, 0.07, 0.8, bx, BENCH_TOP - 0.035, 0, concreteM, true);
            [-0.4, 0.4].forEach(function (dx) {
                [-0.3, 0.3].forEach(function (dz) {
                    box(0.06, BENCH_TOP - 0.07, 0.06, bx + dx, (BENCH_TOP - 0.07) / 2, dz, steelDarkM, false);
                });
            });
            const plate = panel(0.9, 0.3, 480, 160, benchPlateDraw(u), true);
            plate.mesh.position.set(bx, 0.58, 0.42);
            scene.add(plate.mesh);
            box(0.8, 0.012, 0.06, bx, BENCH_TOP + 0.006, 0.28, steelDarkM, false);
            fills.push(box(1, 0.014, 0.06, bx, BENCH_TOP + 0.007, 0.28, tealM, false));
        });

        /**
         * 작업대 앞판 글씨를 그리는 함수를 돌려준다.
         *
         * @param u 작업대 번호
         * @returns 그리기 함수
         */
        function benchPlateDraw(u) {
            return function (x, pw, ph) {
                x.fillStyle = '#efe6d2';
                x.fillRect(0, 0, pw, ph);
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                x.fillStyle = INK;
                x.font = '700 ' + Math.round(ph * 0.3) + 'px ' + SERIF;
                x.fillText(UNIT_NAME[u], pw / 2, ph * 0.36);
                x.fillStyle = '#0f7a58';
                x.font = '700 ' + Math.round(ph * 0.26) + 'px ' + SERIF;
                x.fillText(UNIT_LAT[u] + '사이클', pw / 2, ph * 0.74);
            };
        }

        /* ===================== 폐기 바구니와 출고 문 ===================== */
        box(1.0, 0.6, 0.6, X.rob, 0.3, 1.0, binM, true);
        const binLabel = panel(0.9, 0.3, 300, 100, function (x, pw, ph) {
            x.fillStyle = '#8c3b3b';
            x.fillRect(0, 0, pw, ph);
            x.fillStyle = '#fff6ea';
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            x.font = '700 ' + Math.round(ph * 0.6) + 'px ' + SERIF;
            x.fillText('폐기', pw / 2, ph / 2 + 2);
        }, true);
        binLabel.mesh.position.set(X.rob, 0.3, 1.31);
        scene.add(binLabel.mesh);

        /* ===================== 상황판과 장식 ===================== */
        /**
         * 상황판을 그린다. 사이클, 실행 완료 수, 확정 수, 레지스터 확정 표시를 보여 준다.
         *
         * @param x  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function boardDraw(x, pw, ph) {
            let done = 0;
            let committed = 0;
            INSTR.forEach(function (it, i) {
                if (OOO_END[i] <= curC) done++;
                if (committedAt(i, curC)) committed++;
            });
            x.fillStyle = '#fbf8f1';
            x.fillRect(0, 0, pw, ph);
            x.strokeStyle = 'rgba(42,38,34,0.5)';
            x.lineWidth = 6;
            x.strokeRect(8, 8, pw - 16, ph - 16);
            x.textBaseline = 'middle';
            x.textAlign = 'left';
            x.fillStyle = '#6b6358';
            x.font = '700 30px ' + SERIF;
            x.fillText('출고 상황판', 26, 40);
            x.fillStyle = INK;
            x.fillText('사이클', 26, 118);
            x.font = '700 110px ' + HAND;
            x.fillText(String(curC), 150, 124);
            x.font = '700 28px ' + SERIF;
            x.fillStyle = '#6b6358';
            x.fillText('실행 완료 ' + done + '/' + N + ' · 확정 ' + committed + '/' + N, 26, 176);
            const tagW = (pw - 52 - 4 * 10) / N;
            INSTR.forEach(function (it, i) {
                const on = committedAt(i, curC);
                const tx0 = 26 + i * (tagW + 10);
                kit.roundRect(x, tx0, 200, tagW, 44, 8);
                x.fillStyle = on ? '#2fb865' : 'rgba(42,38,34,0.1)';
                x.fill();
                x.textAlign = 'center';
                x.font = '700 28px ' + SERIF;
                x.fillStyle = on ? '#ffffff' : '#6b6358';
                x.fillText(it.dst, tx0 + tagW / 2, 224);
            });
        }
        const board = panel(2.6, 1.3, 512, 256, boardDraw, true);
        board.mesh.position.set(1.25, 2.3, WALL_Z + 0.04);
        scene.add(board.mesh);

        /**
         * 재정렬 선반 위의 HEAD 표시를 그리는 함수를 돌려준다.
         *
         * @param has 확정할 칸이 남았으면 true
         * @returns 그리기 함수
         */
        function headDraw(has) {
            return function (x, pw, ph) {
                x.fillStyle = has ? '#8a5cff' : '#2fb865';
                x.fillRect(0, 0, pw, ph);
                x.fillStyle = '#ffffff';
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                x.font = '700 ' + Math.round(ph * 0.5) + 'px ' + SERIF;
                x.fillText(has ? 'HEAD' : '모두 확정', pw / 2, ph / 2 + 2);
            };
        }
        const head = panel(0.9, 0.26, 256, 74, headDraw(true), true);
        head.mesh.position.set(X.rob, RACK_Y1 + 0.32, 0.2);
        scene.add(head.mesh);

        SIGNS.forEach(function (s, k) {
            sign(s.t, s.x, s.w, [0x6b7a8f, 0x6b7a8f, 0x1d9e75, 0x6b7a8f, 0x17151c][k]);
        });

        /* ===================== 주문서 ===================== */
        /**
         * 주문서 한 장을 그린다. 테두리와 아래 줄은 현재 상태 색과 문구를 따른다.
         *
         * @param x  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         * @param i  명령어 번호
         */
        function drawSlip(x, pw, ph, i) {
            const it = INSTR[i];
            const st = overrides[i] || statusOf(i, curC);
            x.fillStyle = '#fffdf6';
            x.fillRect(0, 0, pw, ph);
            x.strokeStyle = STATUS_LINE[st];
            x.lineWidth = 14;
            x.strokeRect(7, 7, pw - 14, ph - 14);
            x.fillStyle = INK;
            x.textAlign = 'left';
            x.textBaseline = 'middle';
            x.font = '700 92px ' + HAND;
            x.fillText(it.id, 22, ph * 0.3);
            x.font = '700 32px ' + SERIF;
            x.fillText(it.asm, 22, ph * 0.6);
            x.fillStyle = STATUS_TEXT[st];
            x.fillText(slipLabel(i, st), 22, ph * 0.84);
        }

        /**
         * 주문서 아랫줄 문구를 돌려준다. 기다리는 레지스터와 실행 진행을 보여 준다.
         *
         * @param i  명령어 번호
         * @param st 상태 이름
         * @returns 문구
         */
        function slipLabel(i, st) {
            if (st === 'wait') return '대기 · ' + waitingReg(i, curC);
            if (st === 'exec') return '실행 ' + (curC - OOO_START[i] + 1) + '/' + INSTR[i].lat;
            return STATUS_LABEL[st] || '';
        }

        const slips = INSTR.map(function (it, i) {
            const p = panel(SLIP_W, SLIP_H, 330, 210, function () {}, true);
            scene.add(p.mesh);
            return { mesh: p.mesh, mat: p.mat, redraw: p.redraw };
        });

        /**
         * 주문서 한 장을 현재 사이클 상태로 다시 그린다.
         *
         * @param i 명령어 번호
         */
        function refresh(i) {
            slips[i].redraw(function (x, pw, ph) { drawSlip(x, pw, ph, i); });
        }

        /**
         * 명령어가 사이클 c 끝 시점에 확정된 것으로 볼지 정한다. 예외가 나면 그 뒤 명령어는 확정되지 않는다.
         *
         * @param i 명령어 번호
         * @param c 사이클 번호
         * @returns 확정이면 true
         */
        function committedAt(i, c) {
            return COMMIT[i] <= c && !(excMode && i > 0);
        }

        /**
         * 확정되지 않은 가장 앞의 명령어 번호를 돌려준다. 모두 확정이면 -1이다.
         *
         * @param c 사이클 번호
         * @returns 명령어 번호 또는 -1
         */
        function headOf(c) {
            for (let i = 0; i < N; i++) {
                if (!committedAt(i, c)) return i;
            }
            return -1;
        }

        /**
         * 재정렬 선반의 HEAD 표시를 옮긴다. 즉시 옮기거나 짧게 미끄러뜨린다.
         *
         * @param c       사이클 번호
         * @param instant 즉시 옮기면 true
         */
        function setHead(c, instant) {
            const h = headOf(c);
            const tx = X.rob + ((h >= 0 ? h : N - 1) - 2) * PITCH;
            head.redraw(headDraw(h >= 0));
            const from = head.mesh.position.x;
            if (instant) {
                head.mesh.position.x = tx;
            } else {
                tw(400, function (p) { head.mesh.position.x = from + (tx - from) * p; });
            }
        }

        /**
         * 장면 전체(주문서, 작업대 막대, 상황판)를 현재 사이클 상태로 다시 그린다.
         */
        function refreshAll() {
            INSTR.forEach(function (it, i) { refresh(i); });
            board.redraw(boardDraw);
            for (let u = 0; u < fills.length; u++) updateTrack(u);
        }

        /**
         * 작업대 위 실행 진행 막대를 현재 사이클에 맞춘다.
         *
         * @param u 작업대 번호
         */
        function updateTrack(u) {
            let frac = 0;
            INSTR.forEach(function (it, i) {
                if (unitOf(i) === u && OOO_START[i] <= curC && curC < OOO_END[i]) frac = (curC - OOO_START[i] + 1) / it.lat;
            });
            const bx = X.bench[u];
            fills[u].visible = frac > 0;
            fills[u].scale.x = Math.max(0.001, 0.8 * frac);
            fills[u].position.x = bx - 0.4 + 0.4 * frac;
        }

        /**
         * 주문서가 놓일 자리의 위치를 돌려준다.
         *
         * @param i    명령어 번호
         * @param kind 자리 이름
         * @returns 위치 벡터
         */
        function slipPos(i, kind) {
            if (kind === 'tray') return new V(X.deck - 0.2 + i * 0.1, 1.12, 0.22 - i * 0.04);
            if (kind === 'res') return new V(X.res + (i - 2) * PITCH, CELL_Y, 0.08);
            if (kind === 'bench') return new V(X.bench[unitOf(i)], BENCH_TOP + SLIP_H / 2 + 0.01, 0.12);
            if (kind === 'rob') return new V(X.rob + (i - 2) * PITCH, CELL_Y, 0.08);
            if (kind === 'out') return new V(X.door, 1.25, -0.5);
            return new V(X.rob, 0.8, 1.0);
        }

        /* ===================== 움직임 도구 ===================== */
        /**
         * 배속을 반영한 트윈을 등록한다.
         *
         * @param ms 기준 밀리초
         * @param fn 값을 받는 함수 (0에서 1)
         * @param ease 이징 함수
         * @returns 완료 Promise
         */
        function tw(ms, fn, ease) {
            return eng.tween(ms / state.speed, fn, ease);
        }

        /**
         * 주문서를 지나가는 곡선을 따라 옮긴다.
         *
         * @param mesh 옮길 메시
         * @param to   도착 위치
         * @param ms   기준 밀리초
         * @returns 완료 Promise
         */
        function glide(mesh, to, ms) {
            const from = mesh.position.clone();
            const mid = from.clone().lerp(to, 0.5);
            mid.y = Math.max(from.y, to.y) + 0.8;
            const curve = new THREE.CatmullRomCurve3([from, mid, to]);
            return tw(ms, function (p) { curve.getPoint(p, mesh.position); }, easeInOut);
        }

        /**
         * 주문서를 흐리게 지운다.
         *
         * @param mat 재료
         * @param ms  기준 밀리초
         * @returns 완료 Promise
         */
        function fade(mat, ms) {
            return tw(ms, function (p) { mat.opacity = 1 - p; });
        }

        /**
         * 주문서 한 장을 다음 자리로 옮긴다. 확정된 주문서는 출고 문으로 나가 사라진다.
         * 장면이 바뀌었으면 상태를 쓰지 않고 끝낸다.
         *
         * @param g    단계 세대 번호
         * @param i    명령어 번호
         * @param kind 옮길 자리 이름
         */
        async function moveTo(g, i, kind) {
            const s = slips[i];
            if (kind === 'out') refresh(i);
            await glide(s.mesh, slipPos(i, kind), 700);
            if (!alive(g)) return;
            where[i] = kind;
            if (kind === 'out') {
                await fade(s.mat, 380);
                if (!alive(g)) return;
                s.mesh.visible = false;
            }
        }

        /**
         * 폐기할 주문서를 바구니로 내려보내고 지운다.
         *
         * @param g 단계 세대 번호
         * @param i 명령어 번호
         */
        async function discard(g, i) {
            const s = slips[i];
            await glide(s.mesh, slipPos(i, 'bin'), 700);
            if (!alive(g)) return;
            await fade(s.mat, 380);
            if (!alive(g)) return;
            s.mesh.visible = false;
        }

        /* ===================== 장면 진행 ===================== */
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
            const dw = s.w / ((sw / sh) * 2 * tanHalf);
            const dh = s.h / (2 * tanHalf);
            const dir = new V(s.dir[0], s.dir[1], s.dir[2]).normalize();
            const t = new V(s.t[0], s.t[1], s.t[2]);
            const p = t.clone().addScaledVector(dir, Math.max(dw, dh));
            eng.api.shot([p.x, p.y, p.z], [t.x, t.y, t.z]);
        }

        /**
         * 사이클 c 끝 시점의 장면을 즉시 만든다. 단계를 시작하거나 되감을 때 부른다.
         *
         * @param c 사이클 번호
         */
        function setScene(c) {
            eng.clearTweens();
            curC = c;
            excMode = false;
            INSTR.forEach(function (it, i) {
                const kind = locOf(i, c);
                const s = slips[i];
                where[i] = kind;
                overrides[i] = null;
                s.mesh.position.copy(slipPos(i, kind));
                s.mesh.scale.setScalar(1);
                s.mat.opacity = 1;
                s.mesh.visible = kind !== 'out';
            });
            setHead(c, true);
            refreshAll();
            eng.invalidate();
        }

        /**
         * 사이클 하나를 진행한다. 들어오기, 발행, 완료, 확정 순서로 움직인다.
         *
         * @param g 단계 세대 번호
         * @param c 사이클 번호
         * @returns 단계가 아직 유효하면 true
         */
        async function tick(g, c) {
            curC = c;
            for (let p = 1; p <= 4; p++) {
                const jobs = [];
                INSTR.forEach(function (it, i) {
                    if (RANK[where[i]] < p && RANK[locOf(i, c)] >= p) jobs.push(moveTo(g, i, KINDS[p]));
                });
                if (jobs.length) {
                    await Promise.all(jobs);
                    if (!alive(g)) return false;
                }
            }
            refreshAll();
            setHead(c, false);
            return true;
        }

        /**
         * 여러 사이클을 차례로 진행하고 사이클마다 자막을 바꾼다.
         *
         * @param g    단계 세대 번호
         * @param from 첫 사이클
         * @param to   마지막 사이클
         * @returns 단계가 아직 유효하면 true
         */
        async function ticks(g, from, to) {
            for (let c = from; c <= to; c++) {
                say(CAP[c][0], CAP[c][1]);
                if (!await tick(g, c)) return false;
                await wait(TICK_PAUSE);
                if (!alive(g)) return false;
            }
            return true;
        }

        const FLOW = [
            /* OVERVIEW */
            async function overview() {
                view('wide');
                say('Overview', '주문서 5장(I1~I5)이 접수 순서대로 들어옵니다. 순차 실행은 ' + IO_TOTAL + '사이클, 비순차 실행은 ' + OOO_TOTAL + '사이클에 끝납니다');
            },
            /* ARRIVE */
            async function arrive(g) {
                view('reserve');
                if (!await ticks(g, 1, 2)) return;
                view('wide');
            },
            /* BYPASS */
            async function bypass(g) {
                view('bench');
                if (!await ticks(g, 3, 4)) return;
                view('wide');
            },
            /* OUT OF ORDER */
            async function outOfOrder(g) {
                view('wide');
                if (!await ticks(g, 5, 6)) return;
                view('wide');
            },
            /* COMMIT */
            async function commit(g) {
                view('rob');
                if (!await ticks(g, 7, 9)) return;
                view('wide');
            },
            /* EXCEPTION */
            async function exception(g) {
                view('rob');
                say('Exception', 'I2를 확정하려는 순간(사이클 8)에 예외가 확인됩니다. 예: 오버플로 트랩을 거는 명령어');
                curC = 8;
                excMode = true;
                overrides[1] = 'exc';
                setHead(8, false);
                refreshAll();
                await wait(1400);
                if (!alive(g)) return;
                say('Discard', 'I3~I5는 실행이 끝났어도 확정 전이라 버립니다. 폐기 바구니로 내려보냅니다');
                [2, 3, 4].forEach(function (i) { overrides[i] = 'disc'; });
                refreshAll();
                await Promise.all([2, 3, 4].map(function (i) { return discard(g, i); }));
                if (!alive(g)) return;
                view('wide');
                say('Precise', '레지스터에는 I1까지만 반영돼 있어 예외 지점이 정확합니다(정밀 예외). 분기 예측이 틀려 잘못 실행한 명령어를 버리는 것도 같은 원리입니다');
            }
        ];

        /**
         * 단계 하나를 시작 상태에서 끝까지 재생한다.
         *
         * @param i 단계 번호
         * @param g 단계 시작 시점의 세대 번호
         */
        async function play(i, g) {
            setScene(START[i]);
            await FLOW[i](g);
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
         * 월드가 쥔 재료와 인스턴스는 엔진이 장면을 순회하며 해제하므로 따로 할 일이 없다.
         */
        function release() {}

        /* ===================== 그림자 고정 ===================== */
        eng.renderer.shadowMap.autoUpdate = false;
        eng.renderer.shadowMap.needsUpdate = true;
        setScene(0);

        return {
            play: play,
            applyTheme: applyTheme,
            release: release
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'Out-of-Order 3D',
        badges: BADGES,
        canvasLabel: '비순차 실행을 출고 센터 장면으로 보여 주는 3D. 주문서가 접수 순서대로 예약 스테이션에 들어가고, 준비된 주문부터 작업대에서 처리되며, 결과는 재정렬 선반에서 순서대로 출고됩니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: [1.4, 4.4, 15.8], t: [1.4, 1.9, 0] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();