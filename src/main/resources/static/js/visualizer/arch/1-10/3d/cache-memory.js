/**
 * 캐시 메모리 3D 자판기 장면 (Three.js r128)
 * 2D 시각화의 "3D 자판기" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.cacheMemoryData)가 먼저 있어야 한다.
 * 칸 네 개짜리 자판기(캐시)와 뒤쪽 창고(메인 메모리)를 보여 준다. 손님(CPU)이 블록 번호를 누르면 칸에 있을 때는 복사본이 바로 나오고(HIT), 없으면 집게가 창고에서 가져와 칸에 채운다(MISS). 칸이 찼으면 LRU 순위가 가장 낮은 칸을 밀어낸다.
 * 장면 수, 자막, 칸 상태, 수치는 2D 단계 데이터에서 계산해 2D와 어긋나지 않게 한다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.cacheMemoryData) return;

    const D = window.CsFlow.cacheMemoryData;
    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const INK = kit.INK;
    const BLOCKS = D.BLOCKS;
    const STEPS = D.STEPS;
    const SLOTS = D.SLOTS;
    const replay = D.replay;

    /* ===================== 상수 ===================== */
    const BADGES = ['OVERVIEW'].concat(STEPS.map(function (s) { return s.badge; }));
    const THEMES = {
        dark: { bg: 0x0f0f1a, ground: 0x2a2838, hemi: 0.7, sun: 1.0, exposure: 1.0 },
        light: { bg: 0xd9d2c4, ground: 0xece4d4, hemi: 0.65, sun: 1.0, exposure: 1.0 }
    };
    const BLOCK_COLOR = [0xe24b4a, 0x2f80ed, 0x1d9e75, 0xd9a21b, 0x8a5cff, 0xff7a2f, 0x5f7796, 0xc04f8a];
    const COLOR = {
        cpu: 0x8a5cff, hit: 0x2fb865, miss: 0xff7a2f, evict: 0xe24b4a, load: 0x1fb89a,
        body: 0xb8402f, trim: 0xf1e4c8, dark: 0x2b2320, metal: 0x8a8f99, grey: 0xd8d2c4, staff: 0x3b5b8a
    };
    const COPY = {
        wall: '창고 · 메인 메모리',
        bin: '버림',
        empty: '빈 칸',
        lru: 'LRU ',
        evict: '교체',
        load: 'LOAD',
        hit: 'HIT',
        machine: '캐시 자판기 · 칸 ' + SLOTS + '개'
    };
    const BAY_X = [-0.9, -0.3, 0.3, 0.9];
    const BAY_Y = 1.95;
    const TUBE_X = [-3.0, -2.143, -1.286, -0.429, 0.429, 1.286, 2.143, 3.0];
    const TUBE_Z = -1.85;
    const TUBE_H = 3.2;
    const TUBE_R = 0.32;
    const CAN_R = 0.2;
    const CAN_H = 0.4;
    const RAIL_Y = 4.9;
    const RAIL_Z = -1.35;
    const BAR_Y = 4.64;
    const CABLE_TOP = 4.57;
    const TRAVEL_Y = 4.2;
    const GRAB_Y = 2.5;
    const SLOT_Y = 2.15;
    const DROP_Y = 0.67;
    const TRAY = { x: 0, z: 1.02 };
    const BIN = { x: -2.55, z: 0.9, top: 0.8 };
    const KEYS = { x: 1.62, y: 2.2, z: 0.93, w: 0.5, h: 0.42 };
    const CARD = { x: 3.95, y: 2.9, z: 0.3 };
    const LED = { y: 3.08, z: 0.94 };
    const JAW_OPEN = 0.33;
    const JAW_HOLD = 0.23;
    const SHOTS = {
        overview: [[0.4, 7.2, 10.0], [-0.1, 2.2, -0.4]],
        wide: [[0.3, 5.5, 10.6], [-0.1, 2.2, -0.4]],
        front: [[0.6, 3.1, 6.2], [0.0, 1.8, 0.4]],
        back: [[0.2, 6.6, 4.8], [0.0, 2.4, -1.2]]
    };

    /**
     * 캔버스에 그리는 모든 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        return '창고메인메모리버림빈칸교체요약요청회슬롯적재자판기캐시 · 개누적 HIT MISS LOAD LRU S0123456789 ' + BLOCKS.join('') + ' 칸 ' + COPY.wall + COPY.machine;
    }

    /**
     * 칸 상태에서 지정한 블록이 들어 있는 칸 번호를 돌려준다. 없으면 -1.
     *
     * @param st    replay 결과
     * @param block 블록 이름
     * @returns 칸 번호
     */
    function slotOf(st, block) {
        for (let j = 0; j < SLOTS; j++) {
            if (st.slots[j] && st.slots[j].block === block) return j;
        }
        return -1;
    }

    /**
     * 미스 뒤 내용이 새로 바뀐 칸 번호를 돌려준다. 없으면 -1.
     *
     * @param bef 단계 시작 상태
     * @param aft 단계 끝 상태
     * @returns 칸 번호
     */
    function placeOf(bef, aft) {
        for (let j = 0; j < SLOTS; j++) {
            const a = aft.slots[j];
            const b = bef.slots[j];
            if (a && (!b || b.block !== a.block)) return j;
        }
        return -1;
    }

    /**
     * 칸의 LRU 순위를 돌려준다. 1이면 가장 오래 쓰지 않은 칸이다.
     *
     * @param st 칸 상태
     * @param j  칸 번호 (비어 있지 않은 칸)
     * @returns 순위
     */
    function orderOf(st, j) {
        let o = 1;
        for (let k = 0; k < SLOTS; k++) {
            if (st.slots[k] && st.slots[j] && st.slots[k].rank < st.slots[j].rank) o++;
        }
        return o;
    }

    /**
     * 16진수 색을 CSS 색 문자열로 바꾼다.
     *
     * @param n 색 값
     * @returns #으로 시작하는 문자열
     */
    function hexStr(n) {
        return '#' + n.toString(16).padStart(6, '0');
    }

    /**
     * 손님이 누를 번호 키의 중심 좌표를 돌려준다.
     *
     * @param b 블록 이름
     * @returns 좌표
     */
    function keyPos(b) {
        const k = BLOCKS.indexOf(b);
        const col = k % 4;
        const row = Math.floor(k / 4);
        return new V(KEYS.x - KEYS.w / 2 + (col + 0.5) * KEYS.w / 4, KEYS.y + KEYS.h / 2 - (row + 0.5) * KEYS.h / 2, KEYS.z + 0.05);
    }

    /**
     * 칸 앞 자리의 중심 좌표를 돌려준다.
     *
     * @param j 칸 번호
     * @returns 좌표
     */
    function bayPos(j) {
        return new V(BAY_X[j], BAY_Y, 0.95);
    }

    /**
     * 칸 아래 글씨판 한 칸을 그린다.
     *
     * @param j   칸 번호
     * @param tag 칸 상태 문구
     * @param col 문구 색
     * @param c   2D 컨텍스트
     * @param pw  캔버스 폭
     * @param ph  캔버스 높이
     */
    function drawBay(j, tag, col, c, pw, ph) {
        c.fillStyle = hexStr(COLOR.dark);
        c.fillRect(0, 0, pw, ph);
        c.fillStyle = hexStr(col);
        c.font = '700 ' + Math.round(ph * 0.42) + 'px ' + SERIF;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('S' + j + '  ' + tag, pw / 2, ph / 2 + 2);
    }

    /**
     * 번호판 키패드를 그린다. 누른 블록의 키는 보라색으로 켠다.
     *
     * @param lit 켤 블록 이름. 없으면 null
     * @param c   2D 컨텍스트
     * @param pw  캔버스 폭
     * @param ph  캔버스 높이
     */
    function drawKeys(lit, c, pw, ph) {
        c.fillStyle = hexStr(COLOR.dark);
        c.fillRect(0, 0, pw, ph);
        const kw = pw / 4;
        const kh = ph / 2;
        BLOCKS.forEach(function (b, k) {
            const x = (k % 4) * kw + 8;
            const y = Math.floor(k / 4) * kh + 8;
            const w = kw - 16;
            const h = kh - 16;
            c.fillStyle = b === lit ? hexStr(COLOR.cpu) : '#4a423c';
            c.fillRect(x, y, w, h);
            c.fillStyle = '#fbf8f1';
            c.font = '700 ' + Math.round(h * 0.5) + 'px ' + SERIF;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(b, x + w / 2, y + h / 2 + 2);
        });
    }

    /**
     * 표시판(LED)에 HIT, MISS, 요청 수를 쓴다.
     *
     * @param hits 누적 HIT 수
     * @param miss 누적 MISS 수
     * @param reqN 처리한 요청 수
     * @param c    2D 컨텍스트
     * @param pw   캔버스 폭
     * @param ph   캔버스 높이
     */
    function drawLed(hits, miss, reqN, c, pw, ph) {
        c.fillStyle = '#14110f';
        c.fillRect(0, 0, pw, ph);
        c.textBaseline = 'middle';
        c.textAlign = 'left';
        c.font = '700 ' + Math.round(ph * 0.6) + 'px ' + SERIF;
        c.fillStyle = hexStr(COLOR.hit);
        c.fillText('HIT ' + hits, 24, ph / 2 + 2);
        c.fillStyle = hexStr(COLOR.miss);
        c.fillText('MISS ' + miss, pw * 0.36, ph / 2 + 2);
        c.fillStyle = hexStr(COLOR.grey);
        c.fillText('요청 ' + reqN + '회', pw * 0.7, ph / 2 + 2);
    }

    /**
     * 요약 카드를 그린다. 줄마다 글 내용, 색, 크기, 세로 위치를 받는다.
     *
     * @param lines 줄 배열 {text, col, size, y}
     * @param c     2D 컨텍스트
     * @param pw    캔버스 폭
     * @param ph    캔버스 높이
     */
    function drawCard(lines, c, pw, ph) {
        c.fillStyle = '#fffdf6';
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = INK;
        c.lineWidth = 8;
        c.strokeRect(6, 6, pw - 12, ph - 12);
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        lines.forEach(function (ln) {
            c.font = '700 ' + ln.size + 'px ' + SERIF;
            c.fillStyle = ln.col;
            c.fillText(ln.text, 30, ln.y);
        });
    }

    /**
     * 요약 카드에 들어갈 줄을 단계 데이터에서 만든다.
     *
     * @param i   처리한 요청 수
     * @param st  단계 끝 상태
     * @param s   이번 단계 데이터
     * @param hs  HIT이면 칸 번호, 아니면 -1
     * @param pl  미스 때 적재한 칸 번호
     * @returns 줄 배열
     */
    function cardLines(i, st, s, hs, pl) {
        let last;
        if (s.hit) last = { text: 'HIT · 슬롯 ' + hs, col: hexStr(COLOR.hit) };
        else if (s.evict) last = { text: '교체 ' + s.evict + ' -> ' + s.req, col: hexStr(COLOR.evict) };
        else last = { text: 'MISS · 슬롯 ' + pl + ' 적재', col: hexStr(COLOR.miss) };
        return [
            { text: '요약 · 요청 ' + i + '회', col: '#6b6358', size: 34, y: 70 },
            { text: 'HIT ' + st.hits + ' · MISS ' + st.miss, col: INK, size: 52, y: 160 },
            { text: last.text, col: last.col, size: 34, y: 250 }
        ];
    }

    /**
     * 장면 0의 자막 문구를 돌려준다.
     *
     * @returns 문자열
     */
    function overviewText() {
        return '캐시 칸 ' + SLOTS + '개 앞에 창고(메인 메모리) 블록 ' + BLOCKS.join(', ') + '. 칸에 있으면 HIT, 없으면 MISS';
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 자판기, 뒤쪽 창고, 천장 집게, 손님과 직원, 표시판을 포함한다.
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
        const easeBack = eng.api.easeBack;
        const lowEnd = eng.lowEnd;
        const state = v3.state;
        const alive = v3.alive;
        const wait = v3.wait;
        const say = v3.setCaption;

        scene.background = new THREE.Color(0xd9d2c4);
        scene.fog = new THREE.Fog(0xd9d2c4, 16, 34);

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
        const lamp = new THREE.PointLight(0xffe2b8, 0.6, 9);
        lamp.position.set(0, 2.8, 2.6);
        scene.add(lamp);

        const groundM = new THREE.MeshLambertMaterial({ color: 0xece4d4 });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundM);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const wallM = new THREE.MeshLambertMaterial({ map: eng.hatch('#e6d6b4', 0.22, 70, 2) });
        const bodyM = new THREE.MeshLambertMaterial({ color: COLOR.body });
        const trimM = new THREE.MeshLambertMaterial({ color: COLOR.trim });
        const darkM = new THREE.MeshLambertMaterial({ color: COLOR.dark });
        const metalM = new THREE.MeshLambertMaterial({ color: COLOR.metal });
        const glassM = new THREE.MeshLambertMaterial({ color: 0xcfeef2, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
        const solidMats = {};

        /**
         * 색깔 하나짜리 재료를 돌려준다. 같은 색은 한 번만 만든다.
         *
         * @param c 색 값
         * @returns 재료
         */
        function solidM(c) {
            if (!solidMats[c]) solidMats[c] = new THREE.MeshLambertMaterial({ color: c });
            return solidMats[c];
        }

        /**
         * 상자를 만들어 위치를 잡고 씬(또는 부모)에 붙인다.
         *
         * @returns 만든 메시
         */
        function slab(w, h, d, x, y, z, m, outline, parent) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x, y, z);
            mesh.castShadow = mesh.receiveShadow = true;
            if (outline) ink(mesh);
            (parent || scene).add(mesh);
            return mesh;
        }

        /**
         * 캔버스를 그린 평면을 만든다. redraw로 내용을 다시 그릴 수 있다.
         *
         * @returns {mesh, mat, redraw}
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
         * 벽이나 기둥에 붙이는 글씨판을 만든다.
         *
         * @returns 평면 묶음
         */
        function board(text, x, y, z, w, h, color) {
            const p = panel(w, h, 512, Math.round(512 * h / w), function (c, pw, ph) {
                c.fillStyle = '#f6ecd6';
                c.fillRect(0, 0, pw, ph);
                c.strokeStyle = hexStr(color);
                c.lineWidth = 8;
                c.strokeRect(4, 4, pw - 8, ph - 8);
                c.fillStyle = INK;
                c.font = '700 ' + Math.round(ph * 0.5) + 'px ' + SERIF;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(text, pw / 2, ph / 2 + 2);
            });
            p.mesh.position.set(x, y, z);
            scene.add(p.mesh);
            return p;
        }

        /**
         * 사람 모양 인형(몸통 + 머리)을 만든다.
         *
         * @param color 몸통 색
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

        /**
         * 캔 한 개를 만들어 씬에 붙이고 정리 목록에 넣는다. 블록 색 재료를 쓴다.
         *
         * @param block 블록 이름
         * @param x     x 좌표
         * @param y     y 좌표 (캔 중심)
         * @param z     z 좌표
         * @returns 캔 메시
         */
        function spawnCan(block, x, y, z) {
            const m = new THREE.Mesh(canGeo, canMats[BLOCKS.indexOf(block)]);
            m.rotation.y = Math.PI;
            m.castShadow = true;
            m.position.set(x, y, z);
            scene.add(m);
            spawned.push(m);
            return m;
        }

        /* ===================== 건물 ===================== */
        slab(3.8, 1.0, 1.8, 0, 0.5, 0, bodyM, true);
        slab(3.8, 0.2, 1.8, 0, 3.1, 0, trimM, true);
        [-1.85, 1.85].forEach(function (x) { slab(0.1, 3.0, 1.8, x, 1.5, 0, bodyM, true); });
        slab(3.6, 3.0, 0.1, 0, 1.5, -0.85, darkM, false);
        [-1.625, 1.625].forEach(function (x) { slab(0.55, 2.0, 0.1, x, 2.0, 0.85, trimM, true); });
        slab(2.7, 0.1, 0.1, 0, 2.95, 0.85, trimM, true);
        slab(2.7, 0.2, 0.1, 0, 1.1, 0.85, trimM, true);
        const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.7), glassM);
        glassPane.position.set(0, 2.05, 0.9);
        scene.add(glassPane);
        board(COPY.machine, 0, 3.36, 0.92, 2.4, 0.3, COLOR.body);

        BAY_X.forEach(function (bx) {
            slab(0.5, 1.7, 0.04, bx, 2.05, -0.78, darkM, false);
            slab(0.5, 0.04, 0.9, bx, 1.73, 0, metalM, false);
        });
        slab(1.0, 0.22, 0.26, TRAY.x, 0.36, TRAY.z, darkM, true);

        /* ===================== 표시판과 키패드 ===================== */
        const canGeo = new THREE.CylinderGeometry(CAN_R, CAN_R, CAN_H, 24);
        const canMats = BLOCKS.map(function (b, t) {
            const [c, x] = canvas2d(128, 128);
            x.fillStyle = hexStr(BLOCK_COLOR[t]);
            x.fillRect(0, 0, 128, 128);
            x.font = '700 92px ' + SERIF;
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            x.lineWidth = 10;
            x.strokeStyle = INK;
            x.strokeText(b, 64, 68);
            x.fillStyle = '#ffffff';
            x.fillText(b, 64, 68);
            return new THREE.MeshLambertMaterial({ map: texture(c) });
        });
        const spawned = [];

        const bayLabel = BAY_X.map(function (bx, j) {
            const p = panel(0.5, 0.2, 250, 100, drawBay.bind(null, j, COPY.empty, COLOR.grey));
            p.mesh.position.set(bx, 1.1, 0.94);
            scene.add(p.mesh);
            return p;
        });
        const keyPanel = panel(KEYS.w, KEYS.h, 250, 210, drawKeys.bind(null, null));
        keyPanel.mesh.position.set(KEYS.x, KEYS.y, KEYS.z);
        scene.add(keyPanel.mesh);
        const led = panel(2.4, 0.22, 720, 66, drawLed.bind(null, 0, 0, 0));
        led.mesh.position.set(0, LED.y, LED.z);
        scene.add(led.mesh);
        const card = panel(1.2, 0.8, 480, 320, drawCard.bind(null, []));
        card.mesh.position.set(CARD.x, CARD.y, CARD.z);
        card.mesh.visible = false;
        scene.add(card.mesh);

        slab(0.7, 0.8, 0.6, BIN.x, 0.4, BIN.z, metalM, true);
        board(COPY.bin, BIN.x, 0.62, BIN.z + 0.31, 0.5, 0.16, COLOR.body);

        /* ===================== 창고(메인 메모리) ===================== */
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 4.6), wallM);
        wall.position.set(0, 2.3, -2.45);
        wall.receiveShadow = true;
        scene.add(wall);
        board(COPY.wall, 0, 4.2, -2.4, 3.2, 0.5, COLOR.body);

        const tubes = BLOCKS.map(function (_, t) {
            const x = TUBE_X[t];
            slab(0.7, 0.08, 0.7, x, 0.04, TUBE_Z, darkM, false);
            const glassTube = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_R, TUBE_R, TUBE_H, 28, 1, true), glassM);
            glassTube.position.set(x, TUBE_H / 2, TUBE_Z);
            scene.add(glassTube);
            const stock = [];
            for (let k = 0; k < 6; k++) {
                const m = new THREE.Mesh(canGeo, canMats[t]);
                m.rotation.y = Math.PI;
                m.position.set(x, 0.3 + k * 0.4, TUBE_Z);
                m.castShadow = true;
                scene.add(m);
                stock.push(m);
            }
            return { x: x, top: stock[5] };
        });

        /* ===================== 천장 집게(보충 장치) ===================== */
        slab(8.0, 0.14, 0.14, 0, RAIL_Y, RAIL_Z, metalM, true);
        [-4.0, 4.0].forEach(function (x) { slab(0.14, RAIL_Y, 0.14, x, RAIL_Y / 2, RAIL_Z, metalM, true); });
        const carriage = slab(0.36, 0.22, 0.36, 0, RAIL_Y - 0.11, RAIL_Z, metalM, true);
        const bar = slab(0.12, 0.12, 3.0, 0, BAR_Y, -0.8, metalM, true);
        const trolley = slab(0.22, 0.14, 0.22, 0, BAR_Y, RAIL_Z, darkM, false);
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), darkM);
        scene.add(cable);
        const claw = new THREE.Group();
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.3), metalM);
        plate.position.set(0, -0.03, 0);
        claw.add(plate);
        const jaws = [-1, 1].map(function (sg) {
            const j = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.16), metalM);
            j.position.set(sg * JAW_OPEN, -0.2, 0);
            claw.add(j);
            return j;
        });
        scene.add(claw);
        const cs = { x: 0, y: TRAVEL_Y, z: RAIL_Z };
        const bayCan = [null, null, null, null];
        let carry = null;
        let jawX = JAW_OPEN;

        /* ===================== 손님과 직원 ===================== */
        const customer = person(COLOR.cpu);
        customer.position.set(2.4, 0, 1.6);
        const staff = person(COLOR.staff);
        staff.position.set(-4.5, 0, 0.3);

        /* ===================== 움직임 도구 ===================== */
        const pings = [];
        for (let k = 0; k < 3; k++) {
            const sp = glow(0xffffff, 0.6);
            sp.material.opacity = 0;
            scene.add(sp);
            pings.push(sp);
        }
        let pingIdx = 0;

        /**
         * 지정한 위치에 색 번쩍임을 잠깐 띄운다.
         *
         * @param pos   위치
         * @param color 색 값
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
         * 시간을 배속에 맞춰 줄인 트윈을 등록한다.
         *
         * @param ms   밀리초(배속 전)
         * @param fn   진행률 함수
         * @param ease 이징 함수
         * @returns 완료 Promise
         */
        function tw(ms, fn, ease) {
            return tween(ms / state.speed, fn, ease);
        }

        /**
         * 지나갈 점들을 이은 곡선을 따라 물체를 옮긴다.
         *
         * @param o   움직일 메시
         * @param pts 점 배열
         * @param ms  시간(배속 전)
         * @returns 완료 Promise
         */
        function arc(o, pts, ms) {
            const curve = new THREE.CatmullRomCurve3(pts);
            return tw(ms, function (p) { curve.getPoint(p, o.position); }, easeInOut);
        }

        /**
         * 카드를 키우며 보여 준다.
         *
         * @returns 완료 Promise
         */
        function popCard() {
            card.mesh.position.set(CARD.x, CARD.y, CARD.z);
            card.mesh.visible = true;
            card.mesh.scale.setScalar(0.01);
            return tw(350, function (p) { card.mesh.scale.setScalar(Math.max(0.01, p)); }, easeBack);
        }

        /**
         * 칸 아래 글씨판을 칸 상태 문구로 바꾼다.
         *
         * @param j   칸 번호
         * @param tag 문구
         * @param col 색 값
         */
        function setBay(j, tag, col) {
            bayLabel[j].redraw(drawBay.bind(null, j, tag, col));
        }

        /**
         * 모든 칸 글씨판을 상태 스냅샷의 LRU 순위로 맞춘다.
         *
         * @param st 칸 상태
         */
        function setBays(st) {
            for (let j = 0; j < SLOTS; j++) {
                if (st.slots[j]) setBay(j, COPY.lru + orderOf(st, j), COLOR.grey);
                else setBay(j, COPY.empty, COLOR.grey);
            }
        }

        /**
         * 번호 키패드에서 누른 블록의 키를 켠다.
         *
         * @param lit 블록 이름. 없으면 null
         */
        function setKeys(lit) {
            keyPanel.redraw(drawKeys.bind(null, lit));
        }

        /**
         * 표시판에 누적 HIT, MISS, 요청 수를 쓴다.
         *
         * @param st 칸 상태
         * @param n  처리한 요청 수
         */
        function setLed(st, n) {
            led.redraw(drawLed.bind(null, st.hits, st.miss, n));
        }

        /**
         * 집게 위치를 정하고, 줄과 들고 있는 캔도 함께 맞춘다.
         *
         * @param x 가로 위치
         * @param y 집게 위쪽 높이
         * @param z 깊이 위치
         */
        function setClaw(x, y, z) {
            cs.x = x;
            cs.y = y;
            cs.z = z;
            claw.position.set(x, y, z);
            carriage.position.x = x;
            bar.position.x = x;
            trolley.position.set(x, BAR_Y, z);
            const len = Math.max(0.01, CABLE_TOP - y);
            cable.position.set(x, y + len / 2, z);
            cable.scale.set(1, len, 1);
            if (carry) carry.position.set(x, y - CAN_H / 2, z);
        }

        /**
         * 집게 손가락 벌림을 적용한다.
         *
         * @param v 손가락 사이 간격
         */
        function applyJaw(v) {
            jawX = v;
            jaws[0].position.x = -v;
            jaws[1].position.x = v;
        }

        /**
         * 집게 손가락을 열거나 닫는다.
         *
         * @param open 열면 true
         * @param ms   시간(배속 전)
         * @returns 완료 Promise
         */
        function jawTo(open, ms) {
            const from = jawX;
            const to = open ? JAW_OPEN : JAW_HOLD;
            return tw(ms, function (p) { applyJaw(from + (to - from) * p); }, easeInOut);
        }

        /**
         * 집게를 목표 위치까지 옮긴다.
         *
         * @param x  가로 위치
         * @param y  높이
         * @param z  깊이 위치
         * @param ms 시간(배속 전)
         * @returns 완료 Promise
         */
        function clawTo(x, y, z, ms) {
            const fx = cs.x;
            const fy = cs.y;
            const fz = cs.z;
            return tw(ms, function (p) {
                setClaw(fx + (x - fx) * p, fy + (y - fy) * p, fz + (z - fz) * p);
            }, easeInOut);
        }

        /**
         * 모든 장면 캔과 집게 상태를 지운다.
         */
        function clearCans() {
            spawned.forEach(function (m) { scene.remove(m); });
            spawned.length = 0;
            carry = null;
        }

        /**
         * 단계 시작 상태에 맞춰 칸마다 캔을 만든다.
         *
         * @param st 칸 상태
         */
        function rebuildBays(st) {
            for (let j = 0; j < SLOTS; j++) {
                bayCan[j] = st.slots[j] ? spawnCan(st.slots[j].block, BAY_X[j], BAY_Y, 0) : null;
            }
        }

        /**
         * 손님이 받은 블록을 칸 아래 받는 곳으로 내보낸다. 칸의 캔은 그대로 남는다.
         *
         * @param g     장면 세대 번호
         * @param bay   칸 번호
         * @param block 블록 이름
         * @returns 장면이 유효하면 true
         */
        async function dispense(g, bay, block) {
            view('front');
            const bx = BAY_X[bay];
            const m = spawnCan(block, bx, BAY_Y, 0.3);
            await arc(m, [new V(bx, BAY_Y, 0.3), new V(bx, BAY_Y, 0.85), new V(0, 1.25, 1.15), new V(TRAY.x, DROP_Y, TRAY.z)], 1100);
            if (!alive(g)) return false;
            await tw(180, function (p) { m.position.y = DROP_Y + 0.1 * Math.sin(p * Math.PI); });
            return alive(g);
        }

        /**
         * 밀려날 칸의 캔을 앞으로 빼서 버림 통에 넣는다.
         *
         * @param g   장면 세대 번호
         * @param bay 칸 번호
         * @returns 장면이 유효하면 true
         */
        async function eject(g, bay) {
            view('front');
            const m = bayCan[bay];
            bayCan[bay] = null;
            const bx = BAY_X[bay];
            await arc(m, [new V(bx, BAY_Y, 0), new V(bx, BAY_Y, 0.85), new V(-1.6, 2.0, 1.4), new V(BIN.x, BIN.top + CAN_H / 2, BIN.z)], 1200);
            return alive(g);
        }

        /**
         * 집게가 창고 블록 통에서 캔을 꺼내 칸에 넣는다.
         *
         * @param g     장면 세대 번호
         * @param block 가져올 블록 이름
         * @param bay   넣을 칸 번호
         * @returns 장면이 유효하면 true
         */
        async function restock(g, block, bay) {
            const tube = tubes[BLOCKS.indexOf(block)];
            view('back');
            await clawTo(tube.x, TRAVEL_Y, TUBE_Z, 900);
            if (!alive(g)) return false;
            await clawTo(tube.x, GRAB_Y, TUBE_Z, 600);
            if (!alive(g)) return false;
            await jawTo(false, 260);
            if (!alive(g)) return false;
            tube.top.visible = false;
            carry = spawnCan(block, tube.x, GRAB_Y - CAN_H / 2, TUBE_Z);
            await clawTo(tube.x, TRAVEL_Y, TUBE_Z, 500);
            if (!alive(g)) return false;
            tube.top.visible = true;
            await clawTo(BAY_X[bay], TRAVEL_Y, 0, 1000);
            if (!alive(g)) return false;
            await clawTo(BAY_X[bay], SLOT_Y, 0, 600);
            if (!alive(g)) return false;
            await jawTo(true, 260);
            if (!alive(g)) return false;
            bayCan[bay] = carry;
            carry = null;
            await clawTo(BAY_X[bay], TRAVEL_Y, 0, 400);
            if (!alive(g)) return false;
            await clawTo(0, TRAVEL_Y, RAIL_Z, 700);
            return alive(g);
        }

        /**
         * 건물과 캔을 단계 시작 상태로 되돌린다. 단계를 시작할 때마다 부른다.
         *
         * @param i 장면 번호 (0은 개요)
         */
        function reset(i) {
            eng.clearTweens();
            clearCans();
            const bef = replay(Math.max(i - 1, 0));
            rebuildBays(bef);
            tubes.forEach(function (t) { t.top.visible = true; });
            setClaw(0, TRAVEL_Y, RAIL_Z);
            applyJaw(JAW_OPEN);
            setKeys(null);
            setLed(bef, Math.max(i - 1, 0));
            setBays(bef);
            pings.forEach(function (sp) { sp.material.opacity = 0; });
            card.mesh.visible = false;
            card.mesh.scale.setScalar(1);
            invalidate();
        }

        /**
         * 화면 비율에 맞춰 카메라를 뒤로 물린 샷을 적용한다.
         *
         * @param key 샷 이름
         */
        function view(key) {
            const s = SHOTS[key];
            const aspect = eng.stage.clientWidth / Math.max(1, eng.stage.clientHeight);
            const k = aspect >= 1.5 ? 1 : Math.min(2.2, 1.5 / aspect);
            const t = new V(s[1][0], s[1][1], s[1][2]);
            const p = new V(s[0][0], s[0][1], s[0][2]).sub(t).multiplyScalar(k).add(t);
            eng.api.shot([p.x, p.y, p.z], [t.x, t.y, t.z]);
        }

        /**
         * 장면 하나를 처음 상태에서 끝까지 재생한다. 장면 i는 2D 단계 i-1(0은 개요)을 보여 준다.
         *
         * @param i 장면 번호
         * @param g 장면 시작 시점의 세대 번호
         */
        async function play(i, g) {
            reset(i);
            if (i === 0) {
                view('overview');
                say('Overview', overviewText());
                return;
            }
            const s = STEPS[i - 1];
            const bef = replay(i - 1);
            const aft = replay(i);
            const hs = s.hit ? slotOf(bef, s.req) : -1;
            const vs = s.evict ? slotOf(bef, s.evict) : -1;
            const pl = placeOf(bef, aft);
            view('front');
            say('Request', 'CPU가 블록 ' + s.req + ' 요청. 손님이 ' + s.req + ' 번호를 누릅니다');
            setKeys(s.req);
            ping(keyPos(s.req), COLOR.cpu, 0.7, 500);
            await wait(800);
            if (!alive(g)) return;
            if (s.hit) {
                setBay(hs, COPY.hit, COLOR.hit);
                say('HIT', '슬롯 ' + hs + '에 ' + s.req + ' 있음. 창고에 가지 않고 칸의 복사본을 바로 꺼냅니다');
                ping(bayPos(hs), COLOR.hit, 0.9, 500);
                await wait(600);
                if (!alive(g)) return;
                if (!await dispense(g, hs, s.req)) return;
            } else {
                say('MISS', s.req + ' 없음. 창고(메인 메모리)에서 가져와야 합니다');
                if (s.evict) {
                    setBay(vs, COPY.evict, COLOR.evict);
                    say('Evict', '칸이 찼습니다. LRU 순위가 가장 낮은 ' + s.evict + '를 슬롯 ' + vs + '에서 밀어냅니다');
                    ping(bayPos(vs), COLOR.evict, 1.0, 500);
                    await wait(700);
                    if (!alive(g)) return;
                    if (!await eject(g, vs)) return;
                }
                say('Load', '창고의 블록 ' + s.req + '를 집게로 꺼내 슬롯 ' + pl + '에 채웁니다');
                if (!await restock(g, s.req, pl)) return;
                setBay(pl, COPY.load, COLOR.load);
                if (!await dispense(g, pl, s.req)) return;
            }
            setBays(aft);
            setLed(aft, i);
            card.redraw(drawCard.bind(null, cardLines(i, aft, s, hs, pl)));
            popCard();
            view('wide');
            const total = '누적 HIT ' + aft.hits + '회, MISS ' + aft.miss + '회';
            if (s.hit) say('Result', '슬롯 ' + hs + ' HIT. ' + s.req + '를 최근 사용으로 바꿔 LRU 순위를 갱신합니다. ' + total);
            else say('Result', '슬롯 ' + pl + '에 ' + s.req + ' 적재' + (s.evict ? ', ' + s.evict + ' 교체' : '') + '. ' + total);
        }

        /**
         * 사이트 테마에 맞춰 배경, 안개, 바닥, 조명을 바꾼다.
         */
        function applyTheme() {
            const th = window.CsFlow.viz3d.isLight() ? THEMES.light : THEMES.dark;
            scene.background.setHex(th.bg);
            scene.fog.color.setHex(th.bg);
            groundM.color.setHex(th.ground);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
            eng.renderer.toneMappingExposure = th.exposure;
        }

        reset(0);

        return {
            play: play,
            busy: function () { return false; },
            applyTheme: applyTheme
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'Cache Memory 3D',
        badges: BADGES,
        canvasLabel: '캐시 메모리를 자판기 장면으로 보여 주는 3D 장면. 손님이 블록 번호를 누르면 칸에 있을 때는 바로 나오고, 없을 때는 집게가 뒤쪽 창고에서 가져와 칸에 채웁니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: SHOTS.overview[0], t: SHOTS.overview[1] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();