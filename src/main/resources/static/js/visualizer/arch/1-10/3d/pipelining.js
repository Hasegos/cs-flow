/**
 * 파이프라이닝 3D 세탁소 컨베이어 시각화 (Three.js r128)
 * 2D 시각화의 "3D 세탁소" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js가 먼저 로드돼 있어야 한다.
 * 천장 레일에 매달린 빨래 바구니(명령어)가 수거, 분류, 세탁, 보관, 다림질 다섯 칸을 클럭마다 한 칸씩 지난다.
 * 칸에는 바구니가 하나뿐이라 앞 칸이 비어야 뒤 바구니가 들어가고, 해저드가 생기면 뒤 바구니가 줄 서서 멈춘다.
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
    const THEMES = {
        dark: { bg: 0x121a22, ground: 0x1f2b36, hemi: 0.7, sun: 1.0, exposure: 1.0 },
        light: { bg: 0xe2edef, ground: 0xd3e1e4, hemi: 0.65, sun: 1.0, exposure: 1.0 }
    };
    const STAGES = [
        { id: 'IF', ko: '수거' },
        { id: 'ID', ko: '분류' },
        { id: 'EX', ko: '세탁' },
        { id: 'MEM', ko: '보관' },
        { id: 'WB', ko: '다림질' }
    ];
    const STAGE_COLOR = [0x8a5cff, 0x1d9e75, 0xff7a2f, 0xf472b6, 0x2fb865];
    const INSTRUCTIONS = [
        { op: 'LOAD R1', w: 'R1', r: [] },
        { op: 'ADD R2', w: 'R2', r: ['R1'] },
        { op: 'STORE R2', w: null, r: ['R2'] },
        { op: 'SUB R3', w: 'R3', r: ['R2'] }
    ];
    const STAGE_N = STAGES.length;
    const EX_IDX = 2;
    const WB_IDX = STAGE_N - 1;
    const DONE = STAGE_N;
    const SEQ_TOTAL = INSTRUCTIONS.length * STAGE_N;
    const BASKET_COL = [0x3fa7c2, 0xe0a13a, 0x7bc46a, 0xd5708f];
    const COLOR = { seq: 0x7d8b99, clean: 0x2fb865, stall: 0xe24b4a, steel: 0x5d6b76 };
    const STATION_X = [-4.4, -2.2, 0, 2.2, 4.4];
    const DONE_X = 6.6;
    const BASKET_Y = 1.95;
    const BASKET_Z = -0.6;
    const BAR_X = [-2.2, 0, 2.2];
    const BAR_Z = 3.2;
    const BAR_SCALE = 0.14;
    const SHOTS = {
        overview: [[0, 5.2, 12.5], [0, 1.5, -0.4]],
        wide: [[0, 4.6, 13.2], [0.1, 1.5, -0.4]],
        stall: [[-2.6, 3.4, 7.2], [-2.6, 1.6, -0.6]],
        compare: [[0, 3.8, 13.6], [0, 1.9, 2.8]]
    };

    /* ===================== 일정 계산 ===================== */
    /**
     * 명령어마다 기다려야 할 앞 명령어를 찾는다. 읽는 레지스터를 가장 최근에 쓴 명령어를 고른다.
     *
     * @returns 명령어마다 앞 명령어 번호 배열(없으면 -1)
     */
    function depsOf() {
        return INSTRUCTIONS.map(function (ins, i) {
            let p = -1;
            for (let j = 0; j < i; j++) {
                if (ins.r.indexOf(INSTRUCTIONS[j].w) >= 0) p = j;
            }
            return p;
        });
    }

    /**
     * 명령어마다 각 칸에 들어가는 클럭을 계산한다. 칸은 한 번에 바구니 하나만 쓰고, 포워딩이 없어 앞 명령어의 WB가 끝난 뒤에야 분류(ID)를 나간다.
     *
     * @param deps 명령어마다 기다릴 앞 명령어 번호 배열(없으면 -1)
     * @returns 단계 진입 클럭 표 E[명령어][칸]와 전체 클럭 수 total
     */
    function schedule(deps) {
        const E = [];
        INSTRUCTIONS.forEach(function (_, i) {
            const row = [];
            for (let k = 0; k < STAGE_N; k++) {
                if (i === 0) {
                    row.push(k);
                } else {
                    const free = k < WB_IDX ? E[i - 1][k + 1] : E[i - 1][k] + 1;
                    let t = k === 0 ? free : Math.max(row[k - 1] + 1, free);
                    if (k === EX_IDX && deps[i] >= 0) t = Math.max(t, E[deps[i]][WB_IDX] + 1);
                    row.push(t);
                }
            }
            E.push(row);
        });
        const total = Math.max.apply(null, E.map(function (r) { return r[WB_IDX] + 1; }));
        return { E: E, total: total };
    }

    /**
     * 명령어가 클럭 c에 있는 칸을 돌려준다.
     *
     * @param sch 일정
     * @param i   명령어 번호
     * @param c   클럭 번호(0부터)
     * @returns 칸 번호(0~4), 아직 들어오지 않았으면 -1, 끝났으면 DONE
     */
    function stageAt(sch, i, c) {
        const E = sch.E[i];
        if (c < E[0]) return -1;
        if (c > E[WB_IDX]) return DONE;
        let k = 0;
        for (let j = 0; j < STAGE_N; j++) {
            if (c >= E[j]) k = j;
        }
        return k;
    }

    /**
     * 클럭 c에 칸에서 기다리는 명령어 번호를 모은다. 칸에 들어간 뒤에도 남아 있으면 멈춘 것이다.
     *
     * @param sch 일정
     * @param c   클럭 번호(0부터)
     * @returns 멈춘 명령어 번호 배열
     */
    function stalledAt(sch, c) {
        const list = [];
        INSTRUCTIONS.forEach(function (_, i) {
            const k = stageAt(sch, i, c);
            if (k >= 0 && k < DONE && c > sch.E[i][k]) list.push(i);
        });
        return list;
    }

    /**
     * 클럭 c에 칸을 쓰고 있는 바구니 수와 끝난 바구니 수를 센다.
     *
     * @param sch 일정
     * @param c   클럭 번호(0부터)
     * @returns { done: 끝난 수, used: 칸을 쓰는 수 }
     */
    function countOf(sch, c) {
        let done = 0;
        let used = 0;
        INSTRUCTIONS.forEach(function (_, i) {
            const k = stageAt(sch, i, c);
            if (k === DONE) done++;
            else if (k >= 0) used++;
        });
        return { done: done, used: used };
    }

    /**
     * 클럭 c의 바구니 위치와 멈춘 바구니를 설명 문장으로 만든다. 화면 배치와 같은 일정 데이터에서 계산한다.
     *
     * @param sch 일정
     * @param c   클럭 번호(0부터)
     * @returns 설명 문장
     */
    function clockText(sch, c) {
        const parts = [];
        INSTRUCTIONS.forEach(function (_, i) {
            const k = stageAt(sch, i, c);
            if (k < 0 || k === DONE) return;
            parts.push(k === WB_IDX ? 'I' + (i + 1) + ' 다림질(WB) 완료' : 'I' + (i + 1) + ' ' + STAGES[k].ko + '(' + STAGES[k].id + ')');
        });
        let text = parts.length ? parts.join(' · ') : '칸이 모두 비었습니다';
        if (parts.length > 1) text += ' · ' + parts.length + '개가 동시에 처리 중';
        const stalls = stalledAt(sch, c);
        if (stalls.length) {
            text += ' · 멈춤: ' + stalls.map(function (i) {
                return 'I' + (i + 1) + ' ' + STAGES[stageAt(sch, i, c)].ko;
            }).join(', ') + ' (앞 칸이나 앞 결과를 기다림)';
        }
        return text;
    }

    const CLEAN = schedule(INSTRUCTIONS.map(function () { return -1; }));
    const HAZ = schedule(depsOf());
    const HAZ_STEP = CLEAN.total + 1;
    const CMP_STEP = CLEAN.total + 2;
    const BADGES = ['OVERVIEW'];
    for (let c = 0; c < CLEAN.total; c++) BADGES.push('CLK ' + (c + 1));
    BADGES.push('HAZARD', 'COMPARE');

    /* ===================== 그림 도구 ===================== */
    /**
     * 0xRRGGBB 색 숫자를 캔버스에 쓸 #RRGGBB 문자열로 바꾼다.
     *
     * @param c 색 숫자
     * @returns #으로 시작하는 6자리 16진수 문자열
     */
    function hex(c) {
        return '#' + c.toString(16).padStart(6, '0');
    }

    /**
     * 캔버스에 그리는 모든 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        const words = ['CLOCK', '완료', '칸 사용', '순차 실행', '파이프라인', '해저드 포함', '클럭', 'IF ID EX MEM WB', 'I1 I2 I3 I4 0123456789 / · ()', 'LOAD ADD STORE SUB R1 R2 R3'];
        return words.join('') + STAGES.map(function (s) { return s.ko; }).join('');
    }

    /**
     * 바구니에 붙이는 꼬리표를 그린다. 명령어 번호와 동작을 적는다.
     *
     * @param i  명령어 번호
     * @param cx 2D 컨텍스트
     * @param pw 캔버스 폭
     * @param ph 캔버스 높이
     */
    function drawTag(i, cx, pw, ph) {
        cx.fillStyle = '#fffdf6';
        cx.fillRect(0, 0, pw, ph);
        cx.strokeStyle = hex(BASKET_COL[i]);
        cx.lineWidth = 12;
        cx.strokeRect(6, 6, pw - 12, ph - 12);
        cx.fillStyle = INK;
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';
        cx.font = '700 80px ' + HAND;
        cx.fillText('I' + (i + 1), pw / 2, ph * 0.4);
        cx.font = '700 32px ' + SERIF;
        cx.fillText(INSTRUCTIONS[i].op, pw / 2, ph * 0.8);
    }

    /**
     * 접근 횟수 대신 클럭, 완료 수, 칸 사용 수를 적은 카운터 카드를 그린다.
     *
     * @param sch 일정
     * @param c   클럭 번호(0부터, -1이면 시작 전)
     * @param cx  2D 컨텍스트
     * @param pw  캔버스 폭
     * @param ph  캔버스 높이
     */
    function drawCounter(sch, c, cx, pw, ph) {
        const n = countOf(sch, c);
        cx.fillStyle = '#f4fbfb';
        cx.fillRect(0, 0, pw, ph);
        cx.strokeStyle = 'rgba(31,27,23,0.5)';
        cx.lineWidth = 6;
        cx.strokeRect(6, 6, pw - 12, ph - 12);
        cx.textAlign = 'left';
        cx.textBaseline = 'alphabetic';
        cx.fillStyle = '#4f5b63';
        cx.font = '500 36px ' + SERIF;
        cx.fillText('CLOCK', 28, 62);
        cx.fillStyle = INK;
        cx.font = '700 118px ' + HAND;
        cx.fillText(Math.max(0, c + 1) + ' / ' + sch.total, 28, 190);
        cx.fillStyle = '#2f7d5a';
        cx.font = '700 34px ' + SERIF;
        cx.fillText('완료 ' + n.done + ' / ' + INSTRUCTIONS.length, 28, 262);
        cx.fillStyle = '#8a5a1e';
        cx.fillText('칸 사용 ' + n.used + ' / ' + STAGE_N, 262, 262);
    }

    /**
     * 비교 막대 위에 붙이는 이름과 클럭 수 카드를 그린다.
     *
     * @param name 막대 이름
     * @param n    클럭 수
     * @param cx   2D 컨텍스트
     * @param pw   캔버스 폭
     * @param ph   캔버스 높이
     */
    function drawBarLabel(name, n, cx, pw, ph) {
        cx.fillStyle = '#fbf8f1';
        cx.fillRect(0, 0, pw, ph);
        cx.strokeStyle = 'rgba(31,27,23,0.45)';
        cx.lineWidth = 6;
        cx.strokeRect(6, 6, pw - 12, ph - 12);
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';
        cx.fillStyle = '#4f5b63';
        cx.font = '700 36px ' + SERIF;
        cx.fillText(name, pw / 2, ph * 0.32);
        cx.fillStyle = INK;
        cx.font = '700 66px ' + SERIF;
        cx.fillText(n + '클럭', pw / 2, ph * 0.74);
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 세탁소 벽과 천장 레일, 다섯 칸의 작업대, 바구니, 카운터와 비교 막대를 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play, applyTheme)
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
        const easeBack = eng.api.easeBack;
        const lowEnd = eng.lowEnd;
        const state = v3.state;
        const alive = v3.alive;
        const wait = v3.wait;
        const say = v3.setCaption;

        scene.background = new THREE.Color(THEMES.light.bg);

        /* ===================== 재료와 빛 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.7);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.2);
        sun.position.set(-5, 10, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 30 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const lamp = new THREE.PointLight(0xffd7a0, 0.6, 9);
        lamp.position.set(0, 2.8, 1.5);
        scene.add(lamp);

        const groundM = new THREE.MeshLambertMaterial({ color: THEMES.light.ground });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), groundM);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const wallM = new THREE.MeshLambertMaterial({ map: eng.hatch('#dce9e6', 0.16, 70, 2), side: THREE.DoubleSide });
        const steelM = new THREE.MeshLambertMaterial({ color: COLOR.steel });
        const woodM = new THREE.MeshLambertMaterial({ color: 0xb98a52 });
        const darkWoodM = new THREE.MeshLambertMaterial({ color: 0x6e5030 });
        const slabM = new THREE.MeshLambertMaterial({ color: 0x9c7a4c });
        const whiteM = new THREE.MeshLambertMaterial({ color: 0xe9eef1 });
        const solidMats = {};

        /**
         * 색깔 하나짜리 재료를 돌려준다. 같은 색은 한 번만 만든다.
         *
         * @param c 색 숫자
         * @returns 재료
         */
        function solidM(c) {
            if (!solidMats[c]) solidMats[c] = new THREE.MeshLambertMaterial({ color: c });
            return solidMats[c];
        }

        /**
         * 상자를 만들어 위치를 잡고 씬(또는 부모)에 붙인다.
         *
         * @param w       폭
         * @param h       높이
         * @param d       깊이
         * @param x       중심 x
         * @param y       중심 y
         * @param z       중심 z
         * @param m       재료
         * @param outline 잉크 외곽선 여부
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
         * @param draw  그리기 함수(cx, pw, ph)
         * @param basic 조명을 받지 않는 재료 여부
         * @returns { mesh, mat, redraw }
         */
        function panel(w, h, pw, ph, draw, basic) {
            const pair = canvas2d(pw, ph);
            const cx = pair[1];
            const tex = texture(pair[0]);
            const mat = basic
                ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false })
                : new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);

            /**
             * 평면의 그림을 지우고 다시 그린다.
             *
             * @param fn 그리기 함수(cx, pw, ph)
             */
            function redraw(fn) {
                cx.clearRect(0, 0, pw, ph);
                fn(cx, pw, ph);
                tex.needsUpdate = true;
                invalidate();
            }
            redraw(draw);
            return { mesh: mesh, mat: mat, redraw: redraw };
        }

        /**
         * 벽에 거는 안내판(칸 이름)을 만든다.
         *
         * @param text  안내 문구
         * @param x     중심 x
         * @param y     중심 y
         * @param z     중심 z
         * @param w     폭
         * @param color 테두리 색
         * @returns 평면 참조
         */
        function sign(text, x, y, z, w, color) {
            const ph = Math.round(512 * 0.34 / w);
            const p = panel(w, 0.34, 512, ph, function (cx, pw, h) {
                cx.fillStyle = '#f6ecd6';
                cx.fillRect(0, 0, pw, h);
                cx.strokeStyle = hex(color);
                cx.lineWidth = 8;
                cx.strokeRect(4, 4, pw - 8, h - 8);
                cx.fillStyle = INK;
                cx.font = '700 ' + Math.round(h * 0.5) + 'px ' + SERIF;
                cx.textAlign = 'center';
                cx.textBaseline = 'middle';
                cx.fillText(text, pw / 2, h / 2 + 2);
            }, true);
            p.mesh.position.set(x, y, z);
            scene.add(p.mesh);
            return p;
        }

        /* ===================== 건물: 벽과 천장 레일 ===================== */
        const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.2), wallM);
        back.position.set(0.1, 2.1, -2.0);
        scene.add(back);

        const RAIL_X0 = -7.0;
        const RAIL_X1 = 7.2;
        slab(RAIL_X1 - RAIL_X0, 0.12, 0.12, (RAIL_X0 + RAIL_X1) / 2, 3.2, BASKET_Z, steelM, true);
        [RAIL_X0, RAIL_X1].forEach(function (x) {
            slab(0.14, 3.2, 0.14, x, 1.6, BASKET_Z, steelM, true);
        });

        /* ===================== 칸: 다섯 작업대 ===================== */
        /**
         * 작업대(상판과 다리 네 개)를 만든다.
         *
         * @param x   중심 x
         * @param top 상판 높이
         */
        function table(x, top) {
            slab(1.4, 0.08, 1.0, x, top - 0.04, BASKET_Z, slabM, true);
            [-0.6, 0.6].forEach(function (dx) {
                [-0.4, 0.4].forEach(function (dz) {
                    slab(0.07, top - 0.08, 0.07, x + dx, (top - 0.08) / 2, BASKET_Z + dz, darkWoodM, false);
                });
            });
        }

        const x0 = STATION_X[0];
        slab(1.2, 0.9, 1.0, x0, 0.45, BASKET_Z, woodM, true);
        slab(1.2, 0.06, 1.0, x0, 0.93, BASKET_Z, darkWoodM, false);

        table(STATION_X[1], 1.0);
        slab(0.25, 0.02, 0.18, STATION_X[1] + 0.3, 1.05, BASKET_Z - 0.2, whiteM, false);

        const WASH_TOP = 1.25;
        const xw = STATION_X[2];
        slab(1.3, WASH_TOP, 1.0, xw, WASH_TOP / 2, BASKET_Z, whiteM, true);
        const glassM = new THREE.MeshLambertMaterial({ color: 0x6fa8c4, transparent: true, opacity: 0.8 });
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 24), glassM);
        glass.rotation.x = Math.PI / 2;
        glass.position.set(xw, 0.7, BASKET_Z + 0.53);
        scene.add(glass);
        const drumG = new THREE.Group();
        drumG.position.set(xw, 0.7, BASKET_Z + 0.58);
        drumG.add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.07, 0.04), steelM));
        drumG.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.56, 0.04), steelM));
        scene.add(drumG);

        const xr = STATION_X[3];
        [-0.7, 0.7].forEach(function (dx) {
            slab(0.07, 1.25, 0.6, xr + dx, 0.625, BASKET_Z, steelM, false);
        });
        [0.04, 0.6, 1.22].forEach(function (y) {
            slab(1.5, 0.06, 0.6, xr, y, BASKET_Z, darkWoodM, true);
        });
        slab(0.4, 0.34, 0.4, xr - 0.3, 0.24, BASKET_Z, solidM(0xc9a46a), true);
        slab(0.36, 0.3, 0.4, xr + 0.3, 0.22, BASKET_Z, solidM(0x9fb7c9), true);
        slab(0.4, 0.34, 0.4, xr + 0.3, 0.8, BASKET_Z, solidM(0xc9a46a), true);

        table(STATION_X[4], 1.0);
        slab(0.46, 0.2, 0.26, STATION_X[4] + 0.15, 1.1, BASKET_Z, steelM, true);

        STAGES.forEach(function (s, k) {
            sign(s.id + ' · ' + s.ko, STATION_X[k], 2.6, -1.93, 1.8, STAGE_COLOR[k]);
        });

        const counter = panel(1.5, 0.88, 512, 300, drawCounter.bind(null, CLEAN, -1), true);
        counter.mesh.position.set(-6.2, 2.6, -1.93);
        scene.add(counter.mesh);

        /**
         * 카운터 카드를 지정한 클럭 상태로 새로 그린다.
         *
         * @param sch 일정
         * @param c   클럭 번호(0부터, -1이면 시작 전)
         */
        function setCounter(sch, c) {
            counter.redraw(drawCounter.bind(null, sch, c));
        }

        /* ===================== 바구니(명령어) ===================== */
        const baskets = INSTRUCTIONS.map(function (ins, i) {
            const g = new THREE.Group();
            const bodyM = new THREE.MeshLambertMaterial({ color: BASKET_COL[i], side: THREE.DoubleSide });
            g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.7, 20, 1, true), bodyM));
            const cloth = new THREE.Mesh(new THREE.CircleGeometry(0.39, 20), solidM(0xf5f1ea));
            cloth.rotation.x = -Math.PI / 2;
            cloth.position.y = 0.18;
            g.add(cloth);
            const tag = panel(0.62, 0.36, 256, 150, drawTag.bind(null, i), true);
            tag.mesh.position.set(0, 0.04, 0.44);
            g.add(tag.mesh);
            const carrier = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.26), steelM);
            carrier.position.y = 1.25;
            g.add(carrier);
            const cord = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.85, 0.03), steelM);
            cord.position.y = 0.8;
            g.add(cord);
            g.position.set(STATION_X[0], BASKET_Y, BASKET_Z);
            g.visible = false;
            scene.add(g);
            return { group: g, stage: -1 };
        });

        /* ===================== 비교 막대 ===================== */
        const bars = [
            { name: '순차 실행', n: SEQ_TOTAL, col: COLOR.seq },
            { name: '파이프라인', n: CLEAN.total, col: COLOR.clean },
            { name: '해저드 포함', n: HAZ.total, col: COLOR.stall }
        ].map(function (b, i) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.9), solidM(b.col));
            mesh.position.set(BAR_X[i], 0.005, BAR_Z);
            mesh.scale.set(1, 0.01, 1);
            scene.add(mesh);
            const label = panel(1.9, 0.52, 512, 140, drawBarLabel.bind(null, b.name, b.n), true);
            label.mesh.position.set(BAR_X[i], 0.5, BAR_Z);
            scene.add(label.mesh);
            return { mesh: mesh, label: label, target: b.n * BAR_SCALE };
        });

        /**
         * 비교 막대 하나의 높이를 정하고 이름 카드를 위에 맞춘다.
         *
         * @param b 막대 묶음
         * @param h 높이
         */
        function setBar(b, h) {
            const hh = Math.max(0.01, h);
            b.mesh.scale.y = hh;
            b.mesh.position.y = hh / 2;
            b.label.mesh.position.y = hh + 0.5;
            b.label.mesh.visible = h > 0.02;
        }

        /* ===================== 번쩍임 ===================== */
        const pings = [];
        for (let i = 0; i < 3; i++) {
            const g = glow(0xffffff, 0.6);
            g.material.opacity = 0;
            scene.add(g);
            pings.push(g);
        }
        let pingIdx = 0;

        /**
         * 지정한 위치에 색 번쩍임을 잠깐 띄운다.
         *
         * @param pos   위치
         * @param color 색 숫자
         * @param size  크기
         * @param ms    지속 시간(배속 전)
         * @returns 끝나면 풀리는 Promise
         */
        function ping(pos, color, size, ms) {
            const g = pings[pingIdx++ % pings.length];
            g.position.copy(pos);
            g.material.color.setHex(color);
            g.scale.set(size, size, 1);
            return tween(ms / state.speed, function (p) { g.material.opacity = Math.sin(p * Math.PI) * 0.95; });
        }

        /* ===================== 움직임 도구 ===================== */
        /**
         * 시간을 배속에 맞춰 줄인 트윈을 등록한다.
         *
         * @param ms   밀리초(배속 전)
         * @param fn   값을 받는 함수
         * @param ease 이징 함수(없으면 기본값)
         * @returns 끝나면 풀리는 Promise
         */
        function tw(ms, fn, ease) {
            return tween(ms / state.speed, fn, ease);
        }

        /**
         * 카메라 샷을 적용한다. 화면 비율이 좁으면 뒤로 물린다.
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

        /* ===================== 바구니 배치 ===================== */
        /**
         * 바구니를 클럭 c의 상태대로 바로 놓는다. 장면을 되감을 때 쓴다.
         *
         * @param sch 일정
         * @param c   클럭 번호(0부터, -1이면 시작 전)
         */
        function setBasketsAt(sch, c) {
            baskets.forEach(function (b, i) {
                const k = stageAt(sch, i, c);
                const shown = k >= 0 && k < DONE;
                b.stage = k;
                b.group.visible = shown;
                b.group.scale.setScalar(1);
                b.group.position.set(shown ? STATION_X[k] : STATION_X[0], BASKET_Y, BASKET_Z);
            });
        }

        /**
         * 바구니 하나를 다음 칸으로 옮긴다. 칸에 들어오면 세탁기 드럼이 돈다.
         *
         * @param b  바구니
         * @param to 목표 칸(DONE이면 출구)
         * @param ms 시간(배속 전)
         * @returns 끝나면 풀리는 Promise
         */
        function moveBasket(b, to, ms) {
            const from = b.stage;
            const g = b.group;
            b.stage = to;
            if (from < 0 && to === 0) {
                g.visible = true;
                g.position.x = STATION_X[0];
                g.scale.setScalar(0.01);
                return tw(ms, function (p) { g.scale.setScalar(Math.max(0.01, p)); }, easeBack);
            }
            const x0 = g.position.x;
            if (to === DONE) {
                return tw(ms, function (p) {
                    g.position.x = x0 + (DONE_X - x0) * p;
                    g.scale.setScalar(Math.max(0.01, 1 - p));
                    if (p >= 1) g.visible = false;
                }, easeInOut);
            }
            const x1 = STATION_X[to];
            const jobs = [tw(ms, function (p) { g.position.x = x0 + (x1 - x0) * p; }, easeInOut)];
            if (to === EX_IDX) {
                jobs.push(tw(ms * 2, function (p) { drumG.rotation.z = p * Math.PI * 2; }, easeInOut));
            }
            return Promise.all(jobs);
        }

        /**
         * 바구니를 클럭 c의 칸으로 옮긴다. 칸이 그대로인 바구니는 움직이지 않는다(멈춤).
         *
         * @param g  세대 번호
         * @param sch 일정
         * @param c  클럭 번호(0부터)
         * @param ms 시간(배속 전)
         * @returns 단계가 아직 유효하면 true
         */
        async function moveTo(g, sch, c, ms) {
            const jobs = [];
            baskets.forEach(function (b, i) {
                const to = stageAt(sch, i, c);
                if (to !== b.stage) jobs.push(moveBasket(b, to, ms));
            });
            await Promise.all(jobs);
            return alive(g);
        }

        /* ===================== 장면 진행 ===================== */
        /**
         * 처음 화면을 소개한다.
         *
         * @param g 세대 번호
         * @returns 단계가 아직 유효하면 true
         */
        async function overviewFlow(g) {
            view('overview');
            say('Overview', '빨래 바구니 ' + INSTRUCTIONS.length + '개(명령어)가 수거 · 분류 · 세탁 · 보관 · 다림질 ' + STAGE_N + '개 칸을 한 클럭에 한 칸씩 지납니다. 칸마다 바구니는 하나뿐입니다');
            return alive(g);
        }

        /**
         * 클럭 c 한 번을 재생한다. 바구니를 목표 칸으로 옮기고 설명과 카운터를 갱신한다.
         *
         * @param c 클럭 번호(0부터)
         * @param g 세대 번호
         * @returns 단계가 아직 유효하면 true
         */
        async function clockFlow(c, g) {
            view('wide');
            say('Clock ' + (c + 1), clockText(CLEAN, c));
            if (!await moveTo(g, CLEAN, c, 800)) return false;
            setCounter(CLEAN, c);
            return alive(g);
        }

        /**
         * 해저드가 낀 같은 바구니 실행을 클럭마다 재생한다. 멈춘 바구니에 빨간 번쩍임을 준다.
         *
         * @param g 세대 번호
         * @returns 단계가 아직 유효하면 true
         */
        async function hazardFlow(g) {
            view('stall');
            say('Hazard', 'I2(ADD R2, R1)는 R1을 I1(LOAD R1)에게서 받아야 합니다. 포워딩이 없어 I1의 WB가 끝나야 I2가 분류 칸을 나갈 수 있고, 뒤 바구니도 함께 멈춥니다');
            await wait(1500);
            if (!alive(g)) return false;
            for (let c = 0; c < HAZ.total; c++) {
                view('wide');
                say('Hazard', clockText(HAZ, c));
                if (!await moveTo(g, HAZ, c, 600)) return false;
                stalledAt(HAZ, c).forEach(function (i) {
                    const k = stageAt(HAZ, i, c);
                    ping(new V(STATION_X[k], BASKET_Y, BASKET_Z + 0.5), COLOR.stall, 1.2, 500);
                });
                setCounter(HAZ, c);
            }
            await wait(1000);
            return alive(g);
        }

        /**
         * 순차 실행, 파이프라인, 해저드 포함 실행의 클럭 수를 막대로 비교한다.
         *
         * @param g 세대 번호
         * @returns 단계가 아직 유효하면 true
         */
        async function compareFlow(g) {
            view('compare');
            const pct = Math.round(CLEAN.total / SEQ_TOTAL * 100);
            say('Result', '같은 바구니 ' + INSTRUCTIONS.length + '개를 하나씩 끝내면 ' + SEQ_TOTAL + '클럭, 파이프라인은 ' + CLEAN.total + '클럭(' + pct + '%)입니다. 해저드가 끼면 ' + HAZ.total + '클럭으로 늘어납니다. 겹쳐 흐르면 처리량이 늘고, 해저드는 흐름을 멈춥니다');
            await Promise.all(bars.map(function (b) {
                return tw(900, function (p) { setBar(b, b.target * p); });
            }));
            return alive(g);
        }

        const FLOW = [overviewFlow];
        for (let c = 0; c < CLEAN.total; c++) FLOW.push(clockFlow.bind(null, c));
        FLOW.push(hazardFlow);
        FLOW.push(compareFlow);

        /**
         * 단계 s의 시작 상태로 장면을 되돌린다. 바구니, 카운터, 막대, 드럼을 모두 맞춘다.
         *
         * @param s 단계 번호
         */
        function reset(s) {
            eng.clearTweens();
            if (s <= CLEAN.total) setBasketsAt(CLEAN, s - 2);
            else setBasketsAt(HAZ, -1);
            if (s === HAZ_STEP) setCounter(HAZ, -1);
            else if (s === CMP_STEP) setCounter(CLEAN, CLEAN.total - 1);
            else setCounter(CLEAN, Math.max(-1, s - 2));
            bars.forEach(function (b) { setBar(b, 0); });
            drumG.rotation.z = 0;
            pings.forEach(function (g) { g.material.opacity = 0; });
            invalidate();
        }

        /**
         * 단계 하나를 시작 상태에서 끝까지 재생한다.
         *
         * @param i 단계 번호
         * @param g 단계 시작 시점의 세대 번호
         */
        async function play(i, g) {
            reset(i);
            await FLOW[i](g);
        }

        /**
         * 사이트 테마에 맞춰 배경, 바닥, 조명을 바꾼다.
         */
        function applyTheme() {
            const th = window.CsFlow.viz3d.isLight() ? THEMES.light : THEMES.dark;
            scene.background.setHex(th.bg);
            groundM.color.setHex(th.ground);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
            eng.renderer.toneMappingExposure = th.exposure;
        }

        eng.renderer.shadowMap.autoUpdate = false;
        eng.renderer.shadowMap.needsUpdate = true;
        reset(0);

        return {
            play: play,
            applyTheme: applyTheme
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'Pipelining 3D',
        badges: BADGES,
        canvasLabel: '파이프라인을 세탁소 컨베이어로 보여 주는 3D 장면. 빨래 바구니 4개가 수거, 분류, 세탁, 보관, 다림질 다섯 칸을 한 클럭에 한 칸씩 지납니다. 해저드가 생기면 뒤 바구니가 멈춥니다.',
        home: { p: SHOTS.overview[0], t: SHOTS.overview[1] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();