/**
 * RISC vs CISC 3D 두 주방 장면 (Three.js r128)
 * 2D 시각화의 "3D 두 주방" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.riscVsCiscData)가 먼저 있어야 한다.
 * 작업대 세 개를 나란히 둔다. 같은 일을 한 장의 주문서로 맡는 CISC 주방과 세 장으로 나눠 맡는 RISC 주방. 명령어 경계를 찾는 고정 길이 · 가변 길이 띠. 명령어 수 · CPI · 사이클 시간이 가로 · 세로 · 높이인 CPU 시간 상자.
 * 명령어, 길이, 시간과 자막은 모두 2D 단계 데이터에서 읽는다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.riscVsCiscData) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const INK = kit.INK;

    /* ===================== 2D 데이터 (단계 값의 원본) ===================== */
    const D = window.CsFlow.riscVsCiscData;
    const CISC_I = D.ciscI;
    const RISC_I = D.riscI;
    const RISC_NOTE = D.riscNote;
    const UOPS = D.uops;
    const ONE = D.one;
    const DECODE = D.decode;
    const PERF = D.perf;
    const RISC_LEN = D.riscLen;
    const CISC_LEN = D.ciscLen;
    const RISC_START = D.riscStart;
    const CISC_START = D.ciscStart;
    const NI = RISC_LEN.length;
    const PA = D.pa;
    const PB = D.pb;
    const NR = RISC_I.length;

    /* ===================== 상수 ===================== */
    const CHAPTERS = [
        { badge: '개요', kind: 'one', data: ONE, idx: [0] },
        { badge: 'CISC', kind: 'one', data: ONE, idx: [1] },
        { badge: 'RISC 읽기', kind: 'one', data: ONE, idx: [2] },
        { badge: 'RISC 계산·쓰기', kind: 'one', data: ONE, idx: [3, 4] },
        { badge: '마이크로 연산', kind: 'one', data: ONE, idx: [5, 6] },
        { badge: '고정 길이', kind: 'decode', data: DECODE, idx: [0, 1] },
        { badge: '가변 길이', kind: 'decode', data: DECODE, idx: [2, 3] },
        { badge: '바이트 비교', kind: 'decode', data: DECODE, idx: [4, 5] },
        { badge: '명령어 수', kind: 'perf', data: PERF, idx: [0, 1] },
        { badge: 'CPI', kind: 'perf', data: PERF, idx: [2] },
        { badge: 'CPU 시간', kind: 'perf', data: PERF, idx: [3, 4] }
    ];
    const BADGES = CHAPTERS.map(function (c) { return c.badge; });
    const EMPTY = { one: { c: 0, r: 0, u: false }, decode: { rk: 0, ck: 0 }, perf: { k: -1 } };
    const THEMES = {
        dark: { bg: 0x15171d, ground: 0x2b2e36, hemi: 0.7, sun: 1.0 },
        light: { bg: 0xd9d2c4, ground: 0xd6cfbf, hemi: 0.65, sun: 1.0 }
    };
    const CISC_COL = '#e6893a';
    const RISC_COL = '#1d9e75';
    const GREY = '#8a8478';
    const SEG_COL = [['#e6893a', '#f0b074'], ['#1d9e75', '#52c4a0']];
    const NX = 16;
    const ZONE_X = { one: 0, decode: NX, perf: NX * 2 };
    const WALL_Z = -3.0;
    const TABLE_TOP = 0.5;
    const TOP = TABLE_TOP;
    const KIT_X = { cisc: -3.2, risc: 3.4 };
    const CHEF_X = [KIT_X.cisc, 1.9, 3.4, 4.9];
    const FRIDGE_Z = -1.95;
    const CHEF_Z = 0.0;
    const TICKET_Z = 1.45;
    const UNIT = 0.36;
    const TAPE_Z = { risc: -0.7, cisc: 1.2 };
    const SEG_H = 0.22;
    const TICK_PAUSE = 1100;
    const SHOTS = {
        one: { t: [0, 0.8, 0.5], dir: [0, 0.85, 1], w: 13, h: 9.2 },
        decode: { t: [NX, 0.8, 0.5], dir: [0, 0.85, 1], w: 9.8, h: 6.6 },
        perf: { t: [NX * 2, 0.8, 0.3], dir: [0, 0.8, 1], w: 9.6, h: 6.4 }
    };
    const STR = {
        cisc: 'CISC(x86)',
        risc: 'RISC(RISC-V)',
        fridge: 'x',
        cnt: '명령어 수',
        ciscNote: '읽기 + 덧셈 + 쓰기',
        riscTape: 'RISC 고정 길이',
        ciscTape: 'CISC 가변 길이',
        formula: 'CPU 시간 = 명령어 수 × CPI × 사이클 시간',
        axes: '가로 = 명령어 수 · 깊이 = CPI · 높이 = 사이클 시간 (부피 = CPU 시간)',
        ic: '명령어 수',
        cpi: 'CPI',
        cycle: '사이클 시간',
        ns: 'ns',
        ms: 'ms'
    };

    /* ===================== 파생 값 (2D 데이터에서 계산) ===================== */
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
     * 같은 일의 바이트 비교 문구를 돌려준다. 2D 디코딩 모드의 설명 문구와 같다.
     *
     * @returns 문구
     */
    function totalText() {
        return '같은 ' + NI + '개 명령어: ' + D.totalR + '바이트 vs ' + D.totalC + '바이트';
    }

    /**
     * 시간 식 한 줄을 돌려준다. 2D 성능 식 모드의 CPU 시간 계산과 같다.
     *
     * @param p 성능 값(name, ic, cpi)
     * @returns 문구
     */
    function timeText(p) {
        return p.name + ' ' + D.fmtN(p.ic) + ' × ' + p.cpi + ' × ' + D.clockNs + STR.ns + ' = ' + D.cpuTimeMs(p) + STR.ms;
    }

    /**
     * 장면에 쓰는 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        return Object.keys(STR).map(function (k) { return STR[k]; }).join(' ') + ' ' + BADGES.join(' ') + ' ' + CISC_I.concat(RISC_I, RISC_NOTE, UOPS).join(' ')
            + ' ' + totalText() + ' ' + timeText(PA) + ' ' + timeText(PB) + ' ' + PA.name + ' ' + PB.name + ' 0123456789,.× = I바이트 ';
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 주방 두 개, 명령어 띠 두 개, CPU 시간 상자 두 개를 포함한다.
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
        Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 40 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        scene.add(sun.target);
        const lamp = new THREE.PointLight(0xffd7a0, 0.5, 15);
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
        const fridgeM = new THREE.MeshLambertMaterial({ color: 0xcfd6e0 });
        const chefM = new THREE.MeshLambertMaterial({ color: 0xf4efe6 });
        const skinM = new THREE.MeshLambertMaterial({ color: 0xe8b894 });
        const paperM = new THREE.MeshLambertMaterial({ color: 0xf6ecd6 });
        const laserM = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 });
        const chipCold = new THREE.MeshLambertMaterial({ color: 0xe6893a });
        const chipHot = new THREE.MeshLambertMaterial({ color: 0x1d9e75 });

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
         * @param rows 글자 줄 목록({t, y, px, c, f})
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
                x.fillStyle = r.c;
                x.font = '700 ' + r.px + 'px ' + (r.f || SERIF);
                x.fillText(r.t, pw / 2, r.y * ph);
            });
        }

        const matCache = {};

        /**
         * 글자 한 줄이 적힌 둥근 표 재료를 돌려준다. 같은 문구는 한 번만 만든다.
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
                x.font = '700 ' + (text.length > 4 ? 40 : (text.length > 2 ? 52 : 74)) + 'px ' + SERIF;
                x.fillText(text, 80, 52);
                matCache[key] = new THREE.MeshBasicMaterial({ map: eng.texture(c), transparent: true, depthWrite: false, toneMapped: false });
            }
            return matCache[key];
        }

        /**
         * 정면을 향한 글자 표를 만든다. 그룹 안에 넣어 쓴다.
         *
         * @param text 문구
         * @param fg   글자 색
         * @param bg   바탕 색
         * @param w    폭
         * @returns 메시
         */
        function tag(text, fg, bg, w) {
            return new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.62), labelMat(text, fg, bg));
        }

        /* ===================== 작업대 1: 두 주방 ===================== */
        box(12, TABLE_TOP, 6.4, ZONE_X.one, TABLE_TOP / 2, 0.2, tableM, true);

        /**
         * 냉장고 한 대를 만든다. 앞면에 변수 이름이 붙는다.
         *
         * @param x x 좌표
         */
        function makeFridge(x) {
            box(1.2, 1.4, 0.9, x, TOP + 0.7, FRIDGE_Z, fridgeM, true);
            const t = tag(STR.fridge, INK, '#fbf8f1', 0.7);
            t.position.set(x, TOP + 0.9, FRIDGE_Z + 0.46);
            scene.add(t);
        }

        /**
         * 요리사를 만든다. 몸, 머리, 모자로 이루어진다.
         *
         * @param x x 좌표
         * @returns 그룹
         */
        function makeChef(x) {
            const g = new THREE.Group();
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 20), chefM);
            body.position.y = 0.45;
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), skinM);
            head.position.y = 1.12;
            head.castShadow = true;
            g.add(head);
            const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.34, 18), chefM);
            hat.position.y = 1.5;
            hat.castShadow = true;
            g.add(hat);
            g.position.set(x, TOP, CHEF_Z);
            scene.add(g);
            return g;
        }

        makeFridge(KIT_X.cisc);
        makeFridge(KIT_X.risc);
        const chefs = CHEF_X.map(makeChef);
        const kitchen = [
            plate(3.4, 0.55, KIT_X.cisc, TICKET_Z + 1.15, function (c, pw, ph) {
                paint(c, pw, ph, '#fbf8f1', [{ t: STR.cisc, y: 0.52, px: 60, c: CISC_COL }]);
            }),
            plate(3.4, 0.55, KIT_X.risc, TICKET_Z + 1.15, function (c, pw, ph) {
                paint(c, pw, ph, '#fbf8f1', [{ t: STR.risc, y: 0.52, px: 60, c: RISC_COL }]);
            })
        ];

        /**
         * 주문서를 탁자 위에 눕혀 만든다. 명령어와 설명이 적히고 처음에는 숨어 있다.
         *
         * @param w     폭
         * @param x     x 좌표
         * @param instr 명령어 문구
         * @param note  설명 문구
         * @param col   명령어 색
         * @returns panel 반환값
         */
        function makeTicket(w, x, instr, note, col) {
            const p = plate(w, 0.9, x, TICKET_Z, function (c, pw, ph) {
                paint(c, pw, ph, '#f6ecd6', [
                    { t: instr, y: 0.36, px: 38, c: col },
                    { t: note, y: 0.76, px: 24, c: '#6b6358' }
                ]);
            });
            p.mesh.visible = false;
            return p;
        }

        const ticketC = makeTicket(3.2, KIT_X.cisc, CISC_I[0], STR.ciscNote, CISC_COL);
        const ticketR = RISC_I.map(function (t, i) { return makeTicket(1.45, CHEF_X[i + 1], t, RISC_NOTE[i], RISC_COL); });
        const chipC = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 20), chipCold);
        const chipR = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 20), chipCold);
        chipC.castShadow = true;
        chipR.castShadow = true;
        scene.add(chipC);
        scene.add(chipR);

        const uopBubbles = UOPS.map(function (u, j) {
            const m = tag(u, '#fffaf0', '#7a5cc8', 0.62);
            m.position.set(KIT_X.cisc + (j - (UOPS.length - 1) / 2) * 0.72, TOP + 2.4, CHEF_Z);
            m.visible = false;
            scene.add(m);
            return m;
        });

        let curOne = EMPTY.one;
        const countBoard = panel(3.6, 1.5, 576, 240, countDraw);
        countBoard.mesh.position.set(0, 2.5, WALL_Z + 0.04);
        scene.add(countBoard.mesh);

        /**
         * 명령어 수 판을 그린다. 같은 일에 필요한 CISC와 RISC 명령어 수를 2D 데이터로 보여 준다.
         *
         * @param c  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function countDraw(c, pw, ph) {
            const show = curOne.r >= NR;
            paint(c, pw, ph, '#fbf8f1', [
                { t: STR.cnt, y: 0.18, px: 40, c: '#6b6358' },
                { t: show ? STR.cisc + '  ' + CISC_I.length : STR.cisc, y: 0.5, px: 50, c: CISC_COL },
                { t: show ? STR.risc + '  ' + NR : STR.risc, y: 0.8, px: 50, c: RISC_COL }
            ]);
        }

        /**
         * 냉장고 앞 칩 자리를 돌려준다.
         *
         * @param x 냉장고 x 좌표
         * @returns 위치 벡터
         */
        function fridgePos(x) {
            return new V(x, TOP + 0.08, FRIDGE_Z + 0.9);
        }

        /**
         * 요리사 손 위 칩 자리를 돌려준다.
         *
         * @param x 요리사 x 좌표
         * @returns 위치 벡터
         */
        function handPos(x) {
            return new V(x, TOP + 1.05, CHEF_Z + 0.5);
        }

        /* ===================== 작업대 2: 명령어 띠 ===================== */
        const DX = ZONE_X.decode;
        box(10.8, TABLE_TOP, 5.4, DX, TABLE_TOP / 2, 0.9, tableM, true);

        /**
         * 명령어 띠 하나를 만든다. 명령어마다 길이만큼의 칸이 이어 붙는다.
         *
         * @param z      z 좌표
         * @param lens   명령어 길이 배열(바이트)
         * @param starts 명령어 시작 위치 배열(바이트)
         * @returns 칸 목록({mesh, x0, x1, w})
         */
        function makeTape(z, lens, starts) {
            const total = lens.reduce(function (a, b) { return a + b; }, 0);
            const x0 = DX - (total * UNIT) / 2;
            box(total * UNIT + 0.3, 0.06, 0.8, DX, TOP + 0.03, z, tableM, true);
            return lens.map(function (len, j) {
                const w = len * UNIT;
                const seg = new THREE.Mesh(new THREE.BoxGeometry(w, SEG_H, 0.56), new THREE.MeshLambertMaterial({ color: GREY }));
                seg.position.set(x0 + starts[j] * UNIT + w / 2, TOP + 0.06 + SEG_H / 2, z);
                seg.castShadow = true;
                eng.ink(seg);
                scene.add(seg);
                const lb = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.9, 0.5), Math.min(w * 0.9, 0.5) * 0.62), labelMat('I' + (j + 1), '#fffaf0', '#3b3640'));
                lb.rotation.x = -Math.PI / 2;
                lb.position.set(seg.position.x, TOP + 0.06 + SEG_H + 0.012, z);
                lb.visible = false;
                scene.add(lb);
                return { mesh: seg, label: lb, x0: x0 + starts[j] * UNIT, x1: x0 + (starts[j] + len) * UNIT, z: z };
            });
        }

        const tapeR = makeTape(TAPE_Z.risc, RISC_LEN, RISC_START);
        const tapeC = makeTape(TAPE_Z.cisc, CISC_LEN, CISC_START);
        plate(3.0, 0.5, DX - 3.8, TAPE_Z.risc - 0.95, function (c, pw, ph) {
            paint(c, pw, ph, '#fbf8f1', [{ t: STR.riscTape, y: 0.52, px: 46, c: RISC_COL }]);
        });
        plate(3.0, 0.5, DX - 3.8, TAPE_Z.cisc - 0.95, function (c, pw, ph) {
            paint(c, pw, ph, '#fbf8f1', [{ t: STR.ciscTape, y: 0.52, px: 46, c: CISC_COL }]);
        });
        const lasers = RISC_START.map(function (s, j) {
            const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.7), laserM);
            l.position.set(tapeR[j].x0, TOP + 0.4, TAPE_Z.risc);
            l.visible = false;
            scene.add(l);
            return l;
        });
        const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 18), new THREE.MeshLambertMaterial({ color: 0x7a5cc8 }));
        pointer.rotation.x = Math.PI;
        pointer.castShadow = true;
        pointer.visible = false;
        scene.add(pointer);
        const totalPlate = plate(7.2, 0.6, DX, 2.9, function (c, pw, ph) {
            paint(c, pw, ph, '#fbf8f1', [{ t: totalText(), y: 0.52, px: 50, c: INK }]);
        });

        /* ===================== 작업대 3: CPU 시간 상자 ===================== */
        const PX = ZONE_X.perf;
        box(10.4, TABLE_TOP, 5.2, PX, TABLE_TOP / 2, 0.4, tableM, true);
        const SCALE_IC = 2.2 / 1000000;
        const SCALE_CPI = 0.7;
        const CYCLE_H = 0.9;
        const BOX_Z = -1.6;
        const perfBox = [[PA, -2.9, CISC_COL], [PB, 2.9, RISC_COL]].map(function (def) {
            const p = def[0];
            const w = p.ic * SCALE_IC;
            const d = p.cpi * SCALE_CPI;
            const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: def[2] }));
            m.castShadow = true;
            m.receiveShadow = true;
            eng.ink(m);
            m.visible = false;
            scene.add(m);
            return { p: p, x: PX + def[1], w: w, d: d, mesh: m, col: def[2] };
        });
        perfBox.forEach(function (b) {
            b.mesh.position.set(b.x, TOP, BOX_Z + b.d / 2);
        });
        let curPerf = EMPTY.perf;
        const perfPlate = perfBox.map(function (b) {
            return plate(3.5, 1.6, b.x, 1.65, function (c, pw, ph) { perfDraw(b, c, pw, ph); });
        });
        const formulaBoard = panel(6.8, 1.3, 1360, 260, function (c, pw, ph) {
            paint(c, pw, ph, '#fbf8f1', [
                { t: STR.formula, y: 0.32, px: 56, c: INK },
                { t: STR.axes, y: 0.76, px: 34, c: '#6b6358' }
            ]);
        });
        formulaBoard.mesh.position.set(PX, 2.6, WALL_Z + 0.04);
        scene.add(formulaBoard.mesh);

        /**
         * CPU 시간 판을 그린다. 단계가 올라갈수록 명령어 수, CPI, 시간 줄이 나타난다.
         *
         * @param b  상자 정의
         * @param c  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function perfDraw(b, c, pw, ph) {
            const k = curPerf.k;
            const rows = [{ t: b.p.name, y: 0.14, px: 48, c: b.col }];
            if (k >= 1) rows.push({ t: STR.ic + ' ' + D.fmtN(b.p.ic), y: 0.34, px: 40, c: INK });
            if (k >= 2) rows.push({ t: STR.cpi + ' ' + b.p.cpi, y: 0.52, px: 40, c: INK });
            if (k >= 3) {
                rows.push({ t: STR.cycle + ' ' + D.clockNs + STR.ns, y: 0.7, px: 40, c: INK });
                rows.push({ t: timeText(b.p), y: 0.88, px: 28, c: INK });
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
            mid.y = Math.max(from.y, to.y) + 0.5;
            const curve = new THREE.CatmullRomCurve3([from, mid, to]);
            return tw(ms, function (p) { curve.getPoint(p, obj.position); }, eng.api.easeInOut);
        }

        /**
         * 요리사를 한 번 들썩이게 한다. 일하는 중임을 나타낸다.
         *
         * @param chef 요리사 그룹
         * @returns 완료 Promise
         */
        function bounce(chef) {
            return tw(450, function (p) { chef.position.y = TOP + Math.sin(Math.PI * p) * 0.22; });
        }

        /* ===================== 장면 상태 ===================== */
        /**
         * 주방 상태를 즉시 만든다.
         *
         * @param st 단계 상태({c, r, u})
         */
        function setOne(st) {
            curOne = st;
            ticketC.mesh.visible = st.c >= 1;
            ticketC.mesh.scale.setScalar(1);
            ticketR.forEach(function (t, i) {
                t.mesh.visible = st.r > i;
                t.mesh.scale.setScalar(1);
            });
            uopBubbles.forEach(function (b) { b.visible = st.u; b.scale.setScalar(1); });
            chipC.material = st.c >= 1 ? chipHot : chipCold;
            chipC.position.copy(fridgePos(KIT_X.cisc));
            const pos = st.r === 0 || st.r >= NR ? fridgePos(KIT_X.risc) : handPos(CHEF_X[st.r]);
            chipR.material = st.r >= 2 ? chipHot : chipCold;
            chipR.position.copy(pos);
            chefs.forEach(function (ch) { ch.position.y = TOP; });
            countBoard.redraw(countDraw);
        }

        /**
         * 명령어 띠 상태를 즉시 만든다. 찾은 경계만 색이 입혀진다.
         *
         * @param st 단계 상태({rk, ck})
         */
        function setDecode(st) {
            tapeR.forEach(function (s, j) {
                s.mesh.material.color.set(j < st.rk ? SEG_COL[0][j % 2] : GREY);
                s.mesh.scale.x = j < st.rk ? 0.96 : 1;
                s.label.visible = j < st.rk;
            });
            tapeC.forEach(function (s, j) {
                s.mesh.material.color.set(j < st.ck ? SEG_COL[1][j % 2] : GREY);
                s.mesh.scale.x = j < st.ck ? 0.96 : 1;
                s.label.visible = j < st.ck;
            });
            lasers.forEach(function (l) { l.visible = st.rk > 0; l.scale.y = 1; });
            pointer.visible = st.ck > 0 && st.ck < NI;
            if (st.ck > 0) pointer.position.set(tapeC[Math.min(st.ck, NI) - 1].x1, TOP + 0.85, TAPE_Z.cisc);
            totalPlate.mesh.visible = st.rk >= NI && st.ck >= NI;
        }

        /**
         * 시간 상자 상태를 즉시 만든다. 단계가 올라갈수록 가로, 깊이, 높이가 차례로 자란다.
         *
         * @param st 단계 상태({k})
         */
        function setPerf(st) {
            curPerf = st;
            perfBox.forEach(function (b) { sizeBox(b, st.k >= 1 ? 1 : 0, st.k >= 2 ? 1 : 0, st.k >= 3 ? 1 : 0); });
            perfPlate.forEach(function (p, i) { p.redraw(function (c, pw, ph) { perfDraw(perfBox[i], c, pw, ph); }); });
            formulaBoard.mesh.visible = st.k >= 0;
            perfPlate.forEach(function (p) { p.mesh.visible = st.k >= 0; });
        }

        /**
         * 상자 크기를 가로 · 깊이 · 높이 진행 값에 맞춘다. 0이면 얇은 판, 1이면 완성 크기다.
         *
         * @param b  상자 정의
         * @param pw 가로 진행(명령어 수)
         * @param pd 깊이 진행(CPI)
         * @param ph 높이 진행(사이클 시간)
         */
        function sizeBox(b, pw, pd, ph) {
            b.mesh.visible = pw > 0;
            const d = Math.max(0.05, b.d * pd);
            const h = Math.max(0.04, CYCLE_H * ph);
            b.mesh.scale.set(Math.max(0.01, b.w * pw), h, d);
            b.mesh.position.set(b.x, TOP + h / 2, BOX_Z + d / 2);
        }

        /**
         * 단계 상태를 즉시 만든다. 장을 시작하거나 되감을 때 부른다.
         *
         * @param kind 장 종류
         * @param st   단계 상태
         */
        function setScene(kind, st) {
            eng.clearTweens();
            setOne(kind === 'one' ? st : EMPTY.one);
            setDecode(kind === 'decode' ? st : EMPTY.decode);
            setPerf(kind === 'perf' ? st : EMPTY.perf);
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
         * 주방 단계를 재생한다. 주문서가 나타나고 칩이 냉장고와 요리사 사이를 오간다.
         *
         * @param g    단계 세대 번호
         * @param from 이전 상태({c, r, u})
         * @param to   이번 상태
         * @returns 단계가 아직 유효하면 true
         */
        async function runOne(g, from, to) {
            curOne = to;
            if (to.c >= 1 && from.c < 1) {
                await pop(ticketC.mesh);
                if (!alive(g)) return false;
                await glide(chipC, handPos(KIT_X.cisc), 600);
                if (!alive(g)) return false;
                await bounce(chefs[0]);
                if (!alive(g)) return false;
                chipC.material = chipHot;
                await glide(chipC, fridgePos(KIT_X.cisc), 600);
                if (!alive(g)) return false;
            }
            for (let i = from.r; i < to.r; i++) {
                await pop(ticketR[i].mesh);
                if (!alive(g)) return false;
                await glide(chipR, handPos(CHEF_X[i + 1]), 600);
                if (!alive(g)) return false;
                await bounce(chefs[i + 1]);
                if (!alive(g)) return false;
                if (i >= 1) chipR.material = chipHot;
                if (i + 1 >= NR) {
                    await glide(chipR, fridgePos(KIT_X.risc), 600);
                    if (!alive(g)) return false;
                }
            }
            countBoard.redraw(countDraw);
            if (to.u && !from.u) {
                for (let j = 0; j < uopBubbles.length; j++) {
                    await pop(uopBubbles[j]);
                    if (!alive(g)) return false;
                }
            }
            return true;
        }

        /**
         * 명령어 띠 단계를 재생한다. 고정 길이는 경계가 한 번에, 가변 길이는 앞에서 뒤로 차례로 찾아진다.
         *
         * @param g    단계 세대 번호
         * @param from 이전 상태({rk, ck})
         * @param to   이번 상태
         * @returns 단계가 아직 유효하면 true
         */
        async function runDecode(g, from, to) {
            if (to.rk > from.rk) {
                tapeR.forEach(function (s, j) {
                    s.mesh.material.color.set(SEG_COL[0][j % 2]);
                    s.mesh.scale.x = 0.96;
                    s.label.visible = true;
                });
                lasers.forEach(function (l) { l.visible = true; });
                await tw(600, function (p) { lasers.forEach(function (l) { l.scale.y = Math.max(0.01, p); }); }, eng.api.easeBack);
                if (!alive(g)) return false;
            }
            for (let j = from.ck; j < to.ck; j++) {
                const s = tapeC[j];
                if (!pointer.visible) {
                    pointer.position.set(s.x0, TOP + 0.85, TAPE_Z.cisc);
                    pointer.visible = true;
                }
                await glide(pointer, new V(s.x0, TOP + 0.85, TAPE_Z.cisc), 450);
                if (!alive(g)) return false;
                s.mesh.material.color.set(SEG_COL[1][j % 2]);
                s.mesh.scale.x = 0.96;
                s.label.visible = true;
                await glide(pointer, new V(s.x1, TOP + 0.85, TAPE_Z.cisc), 450);
                if (!alive(g)) return false;
            }
            pointer.visible = to.ck > 0 && to.ck < NI;
            totalPlate.mesh.visible = to.rk >= NI && to.ck >= NI;
            eng.invalidate();
            return true;
        }

        /**
         * 시간 상자 단계를 재생한다. 명령어 수는 가로, CPI는 깊이, 사이클 시간은 높이로 자라나 부피가 CPU 시간이 된다.
         *
         * @param g    단계 세대 번호
         * @param from 이전 상태({k})
         * @param to   이번 상태
         * @returns 단계가 아직 유효하면 true
         */
        async function runPerf(g, from, to) {
            curPerf = to;
            perfPlate.forEach(function (p, i) { p.redraw(function (c, pw, ph) { perfDraw(perfBox[i], c, pw, ph); }); });
            formulaBoard.mesh.visible = to.k >= 0;
            perfPlate.forEach(function (p) { p.mesh.visible = to.k >= 0; });
            for (let k = from.k + 1; k <= to.k; k++) {
                if (k < 1) continue;
                await tw(700, function (p) {
                    perfBox.forEach(function (b) {
                        sizeBox(b, k === 1 ? p : 1, k === 2 ? p : (k > 2 ? 1 : 0), k === 3 ? p : 0);
                    });
                }, eng.api.easeInOut);
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
            const run = ch.kind === 'one' ? runOne : (ch.kind === 'decode' ? runDecode : runPerf);
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

        setScene('one', EMPTY.one);

        return {
            play: play,
            applyTheme: applyTheme,
            release: release
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'RISC vs CISC 두 주방',
        badges: BADGES,
        canvasLabel: '같은 일을 CISC는 한 장의 주문서로, RISC는 여러 장으로 나눠 맡는 두 주방의 3D. 명령어 길이가 고정일 때와 가변일 때 경계를 찾는 띠와, 명령어 수와 CPI와 사이클 시간이 가로와 깊이와 높이인 CPU 시간 상자도 봅니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: [0, 7.6, 10.4], t: [0, 1.0, 0] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();