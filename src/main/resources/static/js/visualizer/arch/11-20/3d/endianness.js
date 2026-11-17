/**
 * 엔디언 3D 서랍장 우체국 장면 (Three.js r128)
 * 2D 시각화의 "3D 서랍장 우체국" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.endiannessData)가 먼저 있어야 한다.
 * 바이트 카드가 번지 순서대로 칸에 놓이는 서랍장(저장 순서 · 읽기)과, 송신 호스트에서 수신 호스트로 카드가 가는 우체국(네트워크 바이트 순서)을 나란히 둔다.
 * 카드 값, 읽은 값, 전송 순서와 자막은 모두 2D 단계 데이터에서 읽는다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.endiannessData) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const HAND = kit.HAND;
    const INK = kit.INK;

    /* ===================== 2D 데이터 (단계 값의 원본) ===================== */
    const DATA = window.CsFlow.endiannessData;
    const BYTES = DATA.bytes;
    const N = BYTES.length;
    const BASE = DATA.base;
    const hx = DATA.hx;
    const valOf = DATA.valOf;
    const STORE = DATA.store;
    const NET = DATA.net;
    const READ = DATA.read;
    const HOST_MEM = DATA.hostMem;
    const NET_ORDER = DATA.netOrder;
    const NM = HOST_MEM.length;
    const VAL_TEXT = '0x' + hx(DATA.val, N * 2);

    /* ===================== 상수 ===================== */
    const CHAPTERS = [
        { badge: '개요', kind: 'store', data: STORE, idx: [0] },
        { badge: '빅 엔디언', kind: 'store', data: STORE, idx: [1] },
        { badge: '리틀 엔디언', kind: 'store', data: STORE, idx: [2] },
        { badge: '비교', kind: 'store', data: STORE, idx: [3, 4] },
        { badge: '송신', kind: 'net', data: NET, idx: [0, 1] },
        { badge: '그대로 전송', kind: 'net', data: NET, idx: [2] },
        { badge: 'htons', kind: 'net', data: NET, idx: [3] },
        { badge: 'ntohs', kind: 'net', data: NET, idx: [4, 5] },
        { badge: '1바이트', kind: 'read', data: READ, idx: [0, 1] },
        { badge: '16비트', kind: 'read', data: READ, idx: [2] },
        { badge: '32비트', kind: 'read', data: READ, idx: [3, 4] }
    ];
    const BADGES = CHAPTERS.map(function (c) { return c.badge; });
    const EMPTY = { store: { big: false, little: false }, net: { s: null, w: null, r: null }, read: { n: 0 } };
    const THEMES = {
        dark: { bg: 0x14121c, ground: 0x2b2833, hemi: 0.7, sun: 1.0 },
        light: { bg: 0xd9d2c4, ground: 0xd6cfbf, hemi: 0.65, sun: 1.0 }
    };
    const BYTE_COL = ['#e6893a', '#7a5cc8', '#1d9e75', '#4aa84a'];
    const GOOD = '#1d9e75';
    const BAD = '#d6453d';
    const NX = 16;
    const WALL_Z = -3.4;
    const TABLE_TOP = 0.5;
    const TRAY_H = 0.14;
    const TOP = TABLE_TOP + TRAY_H;
    const CARD_Y = TOP + 0.07;
    const PITCH = 0.85;
    const CARD = 0.66;
    const SRC_Z = -2.2;
    const BIG_Z = -0.5;
    const LIT_Z = 1.7;
    const NET_Z = 0.2;
    const SENDER_X = NX - 3.7;
    const RECV_X = NX + 3.7;
    const GATE1_X = NX - 1.9;
    const GATE2_X = NX + 1.9;
    const BELT_X = [NX + 0.45, NX - 0.45];
    const TICK_PAUSE = 1100;
    const SHOTS = {
        store: { t: [0, 0.7, -0.3], dir: [0, 0.95, 1], w: 9.4, h: 7.6 },
        net: { t: [NX, 0.7, 0.4], dir: [0, 0.9, 1], w: 11.2, h: 4.8 },
        read: { t: [0, 0.7, 0.5], dir: [0, 0.95, 1], w: 7, h: 5.4 }
    };
    const STR = {
        origin: '원본 값',
        msb: 'MSB(가장 큰 자릿수)',
        lsb: 'LSB(가장 작은 자릿수)',
        big: '빅 엔디언',
        little: '리틀 엔디언',
        lowAddr: '낮은 주소부터',
        sender: '송신 호스트',
        recv: '수신 호스트',
        first: '먼저',
        later: '나중',
        notRead: '아직 읽지 않음',
        pick: '읽는 크기를 고르는 중',
        cpuBig: '빅 엔디언 CPU',
        cpuLit: '리틀 엔디언 CPU',
        wrong: '값이 달라졌습니다',
        right: '원래 값 그대로',
        same: '어느 엔디언이든 같음'
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
     * 칸 하나의 x 좌표를 돌려준다. 가운데 정렬된 n칸 중 k번째다.
     *
     * @param cx 가운데 x 좌표
     * @param k  칸 번호
     * @param n  칸 수
     * @returns x 좌표
     */
    function pocketX(cx, k, n) {
        return cx + (k - (n - 1) / 2) * PITCH;
    }

    /**
     * 읽은 정수 값의 16진 글자를 돌려준다.
     *
     * @param n      읽는 바이트 수
     * @param little 리틀 엔디언이면 true
     * @returns 0x로 시작하는 글자
     */
    function readText(n, little) {
        return '0x' + hx(valOf(BYTES, n, little), n * 2);
    }

    /**
     * 카드 색을 돌려준다. 저장 예의 카드는 큰 자릿수 순서로, 전송 예의 카드는 바이트 값으로 정한다.
     *
     * @param v 전송 예의 바이트 값
     * @returns 색 문자열
     */
    function netCol(v) {
        return v === NET_ORDER[0] ? BYTE_COL[0] : BYTE_COL[1];
    }

    /**
     * 장면에 쓰는 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        return Object.keys(STR).map(function (k) { return STR[k]; }).join(' ') + ' ' + BADGES.join(' ')
            + ' 바이트 비트로 읽은 값 htons ntohs 0123456789ABCDEFx ()· ';
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 번지 칸이 있는 서랍장 두 개와 원본 카드, 읽기 판, 송신 · 수신 호스트와 변환 문, 전송 벨트를 포함한다.
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
        scene.fog = new THREE.Fog(THEMES.dark.bg, 24, 52);

        /* ===================== 빛과 바닥 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c8aa0, 0.7);
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
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 24), floorM);
        floor.rotation.x = -Math.PI / 2;
        floor.position.x = NX / 2;
        floor.receiveShadow = true;
        scene.add(floor);
        const wallM = new THREE.MeshLambertMaterial({ map: eng.hatch('#e4dccb', 0.2, 80, 3) });
        [0, NX].forEach(function (cx) {
            const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 4.6), wallM);
            wall.position.set(cx, 2.3, WALL_Z);
            wall.receiveShadow = true;
            scene.add(wall);
        });

        const tableM = new THREE.MeshLambertMaterial({ color: 0x8b8577 });
        const trayM = new THREE.MeshLambertMaterial({ color: 0x5b5260 });
        const pocketM = new THREE.MeshLambertMaterial({ color: 0x2a2630 });
        const beltM = new THREE.MeshLambertMaterial({ color: 0x4d4a55 });
        const gateM = new THREE.MeshLambertMaterial({ color: 0x9aa3b4 });
        const bracketM = new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.5, depthWrite: false });

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
            const p = panel(w, d, Math.round(w * 220), Math.round(d * 220), draw);
            p.mesh.rotation.x = -Math.PI / 2;
            p.mesh.position.set(x, TOP + 0.012, z);
            scene.add(p.mesh);
            return p;
        }

        /**
         * 판에 가운데 정렬 글자를 그린다. 판 전체를 칠한 뒤 글자를 얹는다.
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

        /* ===================== 카드와 글자 표 ===================== */
        const cardGeo = new THREE.BoxGeometry(CARD, 0.1, CARD);
        const faceGeo = new THREE.PlaneGeometry(CARD * 0.84, CARD * 0.52);
        const addrGeo = new THREE.PlaneGeometry(0.5, 0.31);
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
                x.font = '700 ' + (text.length > 2 ? 50 : 74) + 'px ' + SERIF;
                x.fillText(text, 80, 52);
                matCache[key] = new THREE.MeshBasicMaterial({ map: eng.texture(c), transparent: true, depthWrite: false, toneMapped: false });
            }
            return matCache[key];
        }

        /**
         * 바이트 카드 하나를 만든다. 윗면에 16진 값이 적힌다.
         *
         * @param value 바이트 값
         * @param col   카드 색
         * @returns 그룹
         */
        function makeCard(value, col) {
            const g = new THREE.Group();
            const body = new THREE.Mesh(cardGeo, new THREE.MeshLambertMaterial({ color: col }));
            body.castShadow = true;
            g.add(body);
            const face = new THREE.Mesh(faceGeo, labelMat(hx(value, 2), '#fffaf0', col));
            face.rotation.x = -Math.PI / 2;
            face.position.y = 0.056;
            g.add(face);
            g.visible = false;
            scene.add(g);
            return g;
        }

        /* ===================== 탁자와 서랍장 ===================== */
        box(9.8, TABLE_TOP, 5.8, 0, TABLE_TOP / 2, -0.1, tableM, true);
        box(9.8, TABLE_TOP, 4.4, NX, TABLE_TOP / 2, 0.3, tableM, true);

        /**
         * 번지 칸이 n개인 서랍장을 만든다. 칸 앞에는 번지 글자가 눕는다.
         *
         * @param cx 가운데 x 좌표
         * @param z  z 좌표
         * @param n  칸 수
         * @param a0 첫 칸의 번지
         * @returns 서랍장 그룹
         */
        function makeTray(cx, z, n, a0) {
            const grp = new THREE.Group();
            const w = n * PITCH + 0.5;
            const body = new THREE.Mesh(new THREE.BoxGeometry(w, TRAY_H, 1.3), trayM);
            body.position.set(cx, TABLE_TOP + TRAY_H / 2, z);
            body.castShadow = true;
            body.receiveShadow = true;
            eng.ink(body);
            grp.add(body);
            for (let k = 0; k < n; k++) {
                const pocket = new THREE.Mesh(new THREE.BoxGeometry(CARD + 0.08, 0.01, CARD + 0.08), pocketM);
                pocket.position.set(pocketX(cx, k, n), TOP + 0.005, z - 0.1);
                grp.add(pocket);
                const addr = new THREE.Mesh(addrGeo, labelMat(hx(BASE + a0 + k, 4), '#3b3640', '#e9e2d3'));
                addr.rotation.x = -Math.PI / 2;
                addr.position.set(pocketX(cx, k, n), TOP + 0.012, z + 0.48);
                grp.add(addr);
            }
            scene.add(grp);
            return grp;
        }

        const trayBig = makeTray(0, BIG_Z, N, 0);
        const trayLit = makeTray(0, LIT_Z, N, 0);
        const traySend = makeTray(SENDER_X, NET_Z, NM, 0);

        /**
         * 서랍장 이름판을 탁자 위에 눕혀 놓는다.
         *
         * @param x    x 좌표
         * @param z    z 좌표
         * @param name 이름
         * @param sub  보조 설명
         * @param col  이름 색
         * @returns panel 반환값
         */
        function nameplate(x, z, name, sub, col) {
            return plate(2.3, 0.78, x, z, function (c, pw, ph) {
                paint(c, pw, ph, '#fbf8f1', [
                    { t: name, y: 0.38, px: 56, c: col },
                    { t: sub, y: 0.74, px: 38, c: '#6b6358' }
                ]);
            });
        }
        const plateBig = nameplate(-3.05, BIG_Z, STR.big, STR.lowAddr, BYTE_COL[0]);
        const plateLit = nameplate(-3.05, LIT_Z, STR.little, STR.lowAddr, BYTE_COL[1]);
        const plateSend = nameplate(SENDER_X, NET_Z + 1.2, STR.sender, STR.little, BYTE_COL[1]);

        /* ===================== 원본 값 판 ===================== */
        const valueBoard = panel(3.6, 1.3, 576, 208, function (c, pw, ph) {
            paint(c, pw, ph, '#fbf8f1', [
                { t: STR.origin, y: 0.18, px: 34, c: '#6b6358' },
                { t: VAL_TEXT, y: 0.5, px: 84, c: INK },
                { t: hx(BYTES[0], 2) + ' = ' + STR.msb, y: 0.75, px: 28, c: '#6b6358' },
                { t: hx(BYTES[N - 1], 2) + ' = ' + STR.lsb, y: 0.9, px: 28, c: '#6b6358' }
            ]);
        });
        valueBoard.mesh.position.set(0, 2.5, WALL_Z + 0.04);
        scene.add(valueBoard.mesh);

        const src = [];
        const big = [];
        const lit = [];
        for (let i = 0; i < N; i++) {
            const col = BYTE_COL[i];
            src.push(makeCard(BYTES[i], col));
            big.push(makeCard(BYTES[i], col));
            lit.push(makeCard(BYTES[i], col));
            src[i].position.set(pocketX(0, i, N), CARD_Y, SRC_Z);
            src[i].visible = true;
        }
        const srcTray = box(N * PITCH + 0.5, 0.05, 1.0, 0, TOP - 0.04, SRC_Z, trayM, true);

        /**
         * 서랍장 칸 하나 위의 카드 자리를 돌려준다.
         *
         * @param z z 좌표
         * @param k 칸 번호
         * @returns 위치 벡터
         */
        function slotPos(z, k) {
            return new V(pocketX(0, k, N), CARD_Y, z - 0.1);
        }

        /* ===================== 읽기 판과 묶음 틀 ===================== */
        let curN = 0;
        /**
         * 읽기 판을 그린다. 읽는 크기에 따라 빅 · 리틀 CPU가 얻는 값을 2D 계산 함수로 보여 준다.
         *
         * @param c  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function readDraw(c, pw, ph) {
            const n = curN;
            const rows = [{ t: n ? n * 8 + '비트로 읽은 값' : STR.pick, y: 0.16, px: 36, c: '#6b6358' }];
            if (n) {
                rows.push({ t: STR.cpuBig, y: 0.38, px: 34, c: BYTE_COL[0] });
                rows.push({ t: readText(n, false), y: 0.54, px: 60, c: INK, f: HAND });
                rows.push({ t: STR.cpuLit, y: 0.72, px: 34, c: BYTE_COL[1] });
                rows.push({ t: readText(n, true), y: 0.88, px: 60, c: INK, f: HAND });
                if (valOf(BYTES, n, false) === valOf(BYTES, n, true)) rows[0].t += ' · ' + STR.same;
            }
            paint(c, pw, ph, '#fbf8f1', rows);
        }
        const readBoard = plate(4.1, 1.5, 0, LIT_Z, readDraw);
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, CARD + 0.4), bracketM);
        eng.ink(bracket);
        bracket.position.set(0, TOP + 0.15, BIG_Z - 0.1);
        bracket.visible = false;
        scene.add(bracket);

        /**
         * 묶음 틀의 크기와 위치를 읽는 바이트 수에 맞춘다.
         *
         * @param n 읽는 바이트 수(0이면 숨김)
         */
        function setBracket(n) {
            bracket.visible = n > 0;
            if (n > 0) {
                bracket.scale.x = n * PITCH - 0.1;
                bracket.position.x = pocketX(0, 0, N) - PITCH / 2 + (n * PITCH) / 2;
            }
        }

        /* ===================== 우체국 (송신, 변환 문, 벨트, 수신) ===================== */
        box(3.0, 0.1, 1.0, NX, TABLE_TOP + 0.05, NET_Z, beltM, true);
        [BELT_X[0], BELT_X[1]].forEach(function (x, j) {
            const slot = new THREE.Mesh(new THREE.BoxGeometry(CARD + 0.08, 0.01, CARD + 0.08), pocketM);
            slot.position.set(x, TABLE_TOP + 0.105, NET_Z);
            scene.add(slot);
            plate(0.7, 0.3, x, NET_Z + 0.78, function (c, pw, ph) {
                paint(c, pw, ph, '#e9e2d3', [{ t: j === 0 ? STR.first : STR.later, y: 0.52, px: 56, c: '#3b3640' }]);
            });
        });

        /**
         * 변환 문을 만든다. 문틀 두 기둥과 윗보로 이루어지고 이름판이 앞에 눕는다.
         *
         * @param x    x 좌표
         * @param name 문 이름
         * @returns 번짐 스프라이트
         */
        function makeGate(x, name) {
            box(0.14, 1.1, 0.14, x, TABLE_TOP + 0.55, NET_Z - 0.62, gateM, true);
            box(0.14, 1.1, 0.14, x, TABLE_TOP + 0.55, NET_Z + 0.62, gateM, true);
            box(0.18, 0.16, 1.4, x, TABLE_TOP + 1.18, NET_Z, gateM, true);
            plate(1.1, 0.42, x, NET_Z + 1.25, function (c, pw, ph) {
                paint(c, pw, ph, '#fbf8f1', [{ t: name, y: 0.52, px: 70, c: INK, f: HAND }]);
            });
            const sp = eng.glow(0xffe08a, 1.9);
            sp.position.set(x, TABLE_TOP + 0.7, NET_Z);
            sp.visible = false;
            scene.add(sp);
            return sp;
        }
        const glow1 = makeGate(GATE1_X, 'htons');
        const glow2 = makeGate(GATE2_X, 'ntohs');

        const sendCard = {};
        const wireCard = {};
        NET_ORDER.forEach(function (v) {
            sendCard[v] = makeCard(v, netCol(v));
            wireCard[v] = makeCard(v, netCol(v));
        });

        let curNet = EMPTY.net;
        /**
         * 수신 호스트 판을 그린다. 받은 값과 맞았는지 틀렸는지가 색으로 보인다.
         *
         * @param c  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function recvDraw(c, pw, ph) {
            const r = curNet.r;
            const rows = [{ t: STR.recv, y: 0.16, px: 38, c: '#6b6358' }, { t: STR.big, y: 0.3, px: 34, c: BYTE_COL[0] }];
            if (r === null) {
                rows.push({ t: STR.notRead, y: 0.64, px: 44, c: '#6b6358' });
            } else {
                rows.push({ t: '0x' + hx(r, NM * 2), y: 0.56, px: 80, c: curNet.bad ? BAD : GOOD, f: HAND });
                rows.push({ t: '(' + r + ') ' + (curNet.bad ? STR.wrong : STR.right), y: 0.84, px: 32, c: curNet.bad ? BAD : GOOD });
            }
            paint(c, pw, ph, '#fbf8f1', rows);
        }
        const recvBoard = plate(2.9, 1.9, RECV_X, NET_Z, recvDraw);

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
         * 카드를 호를 그리며 옮긴다.
         *
         * @param obj 옮길 그룹
         * @param to  도착 위치
         * @param ms  기준 밀리초
         * @returns 완료 Promise
         */
        function glide(obj, to, ms) {
            const from = obj.position.clone();
            const mid = from.clone().lerp(to, 0.5);
            mid.y = Math.max(from.y, to.y) + 0.8;
            const curve = new THREE.CatmullRomCurve3([from, mid, to]);
            return tw(ms, function (p) { curve.getPoint(p, obj.position); }, eng.api.easeInOut);
        }

        /**
         * 카드를 부풀려 나타나게 한다.
         *
         * @param obj 카드 그룹
         * @param pos 놓을 위치
         * @returns 완료 Promise
         */
        function popAt(obj, pos) {
            obj.position.copy(pos);
            obj.scale.setScalar(0.001);
            obj.visible = true;
            return tw(380, function (p) { obj.scale.setScalar(Math.max(0.001, p)); }, eng.api.easeBack);
        }

        /**
         * 카드를 줄여 사라지게 한다.
         *
         * @param obj 카드 그룹
         * @param g   단계 세대 번호(장면이 바뀌었으면 숨기지 않는다)
         * @returns 완료 Promise
         */
        function shrink(obj, g) {
            return tw(250, function (p) { obj.scale.setScalar(Math.max(0.001, 1 - p)); }).then(function () {
                if (!alive(g)) return;
                obj.visible = false;
                obj.scale.setScalar(1);
            });
        }

        /**
         * 문의 번짐을 한 번 반짝인다.
         *
         * @param sp 번짐 스프라이트
         * @returns 완료 Promise
         */
        function flash(sp) {
            sp.visible = true;
            return tw(700, function (p) { sp.material.opacity = Math.sin(Math.PI * p) * 0.9; }).then(function () { sp.visible = false; });
        }

        /* ===================== 장면 상태 ===================== */
        /**
         * 카드 한 장의 위치와 보임 여부를 정한다.
         *
         * @param obj 카드 그룹
         * @param pos 위치
         * @param on  보이면 true
         */
        function put(obj, pos, on) {
            obj.position.copy(pos);
            obj.scale.setScalar(1);
            obj.visible = on;
        }

        /**
         * 벨트 칸 위 카드 자리를 돌려준다.
         *
         * @param j 칸 번호(0이 먼저 가는 칸)
         * @returns 위치 벡터
         */
        function beltPos(j) {
            return new V(BELT_X[j], TABLE_TOP + 0.105 + 0.07, NET_Z);
        }

        /**
         * 송신 서랍장 칸 위 카드 자리를 돌려준다.
         *
         * @param k 칸 번호
         * @returns 위치 벡터
         */
        function sendPos(k) {
            return new V(pocketX(SENDER_X, k, NM), CARD_Y, NET_Z - 0.1);
        }

        /**
         * 읽기 판 상태를 그려 넣는다.
         *
         * @param n 읽는 바이트 수
         */
        function setRead(n) {
            curN = n;
            setBracket(n);
            readBoard.redraw(readDraw);
        }

        /**
         * 우체국 상태를 즉시 만든다.
         *
         * @param st 단계 상태({s, w, r, bad, c1, c2})
         */
        function setNet(st) {
            curNet = st;
            NET_ORDER.forEach(function (v) {
                put(sendCard[v], sendPos(Math.max(0, HOST_MEM.indexOf(v))), !!st.s);
                put(wireCard[v], beltPos(Math.max(0, st.w ? st.w.indexOf(v) : 0)), !!st.w);
            });
            glow1.visible = false;
            glow2.visible = false;
            recvBoard.redraw(recvDraw);
        }

        /**
         * 장 종류에 맞게 보이는 서랍장과 판을 바꾼다.
         *
         * @param kind 장 종류(store, net, read)
         */
        function showKind(kind) {
            const store = kind === 'store';
            const read = kind === 'read';
            trayLit.visible = store;
            plateLit.mesh.visible = store;
            plateBig.mesh.visible = !read;
            readBoard.mesh.visible = read;
            valueBoard.mesh.visible = !read;
            srcTray.visible = !read;
            src.forEach(function (c) { c.visible = !read; });
            eng.invalidate();
        }

        /**
         * 단계 상태를 즉시 만든다. 장을 시작하거나 되감을 때 부른다.
         *
         * @param kind 장 종류
         * @param st   단계 상태
         */
        function setScene(kind, st) {
            eng.clearTweens();
            showKind(kind);
            const store = kind === 'store' ? st : EMPTY.store;
            for (let i = 0; i < N; i++) {
                put(big[i], slotPos(BIG_Z, i), kind === 'read' || store.big);
                put(lit[i], slotPos(LIT_Z, N - 1 - i), store.little);
            }
            setRead(kind === 'read' ? st.n : 0);
            setNet(kind === 'net' ? st : EMPTY.net);
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
         * 원본 카드를 복사해 서랍장 칸에 한 장씩 놓는다.
         *
         * @param g     단계 세대 번호
         * @param cards 서랍장 카드 목록
         * @param z     서랍장 z 좌표
         * @param rev   칸 순서를 뒤집으면 true(리틀 엔디언)
         * @returns 단계가 아직 유효하면 true
         */
        async function fillTray(g, cards, z, rev) {
            for (let i = 0; i < N; i++) {
                const c = cards[i];
                c.position.copy(src[i].position);
                c.visible = true;
                await glide(c, slotPos(z, rev ? N - 1 - i : i), 520);
                if (!alive(g)) return false;
            }
            return true;
        }

        /**
         * 저장 순서 단계를 재생한다. 아직 놓이지 않은 서랍장만 채운다.
         *
         * @param g    단계 세대 번호
         * @param from 이전 상태({big, little})
         * @param to   이번 상태
         * @returns 단계가 아직 유효하면 true
         */
        async function runStore(g, from, to) {
            if (to.big && !from.big && !await fillTray(g, big, BIG_Z, false)) return false;
            if (to.little && !from.little && !await fillTray(g, lit, LIT_Z, true)) return false;
            return true;
        }

        /**
         * 우체국 단계를 재생한다. 송신 카드 등장, 벨트 올리기, 변환 문 통과, 수신 판 갱신 순이다.
         *
         * @param g    단계 세대 번호
         * @param from 이전 상태
         * @param to   이번 상태
         * @returns 단계가 아직 유효하면 true
         */
        async function runNet(g, from, to) {
            if (to.s && !from.s) {
                await Promise.all(NET_ORDER.map(function (v) { return popAt(sendCard[v], sendPos(HOST_MEM.indexOf(v))); }));
                if (!alive(g)) return false;
            }
            if (to.w && from.w !== to.w) {
                if (from.w) {
                    await Promise.all(NET_ORDER.map(function (v) { return shrink(wireCard[v], g); }));
                    if (!alive(g)) return false;
                }
                if (to.c1) {
                    flash(glow1);
                }
                for (const v of to.w) {
                    wireCard[v].position.copy(sendPos(HOST_MEM.indexOf(v)));
                    wireCard[v].visible = true;
                    await glide(wireCard[v], beltPos(to.w.indexOf(v)), 650);
                    if (!alive(g)) return false;
                }
            }
            if (to.c2 && !from.c2) {
                await flash(glow2);
                if (!alive(g)) return false;
            }
            if (to.r !== from.r || to.bad !== from.bad) {
                curNet = to;
                recvBoard.redraw(recvDraw);
            }
            return true;
        }

        /**
         * 읽기 단계를 재생한다. 묶음 틀이 읽는 크기만큼 늘어나고 읽은 값이 판에 나타난다.
         *
         * @param g    단계 세대 번호
         * @param from 이전 상태({n})
         * @param to   이번 상태
         * @returns 단계가 아직 유효하면 true
         */
        async function runRead(g, from, to) {
            if (to.n === from.n) return true;
            bracket.visible = true;
            const a = from.n;
            await tw(450, function (p) {
                const n = a + (to.n - a) * p;
                bracket.scale.x = Math.max(0.05, n * PITCH - 0.1);
                bracket.position.x = pocketX(0, 0, N) - PITCH / 2 + (n * PITCH) / 2;
            }, eng.api.easeInOut);
            if (!alive(g)) return false;
            setRead(to.n);
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
            for (let j = 0; j < ch.idx.length; j++) {
                const cur = ch.data[ch.idx[j]];
                say(ch.badge, cur.log);
                const run = ch.kind === 'store' ? runStore : (ch.kind === 'net' ? runNet : runRead);
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

        setScene('store', EMPTY.store);

        return {
            play: play,
            applyTheme: applyTheme,
            release: release
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: '엔디언 서랍장 우체국',
        badges: BADGES,
        canvasLabel: '바이트 카드가 번지 순서대로 칸에 놓이는 서랍장과 호스트 사이로 카드가 오가는 우체국의 3D. 빅 엔디언은 큰 자릿수 바이트부터, 리틀 엔디언은 작은 자릿수 바이트부터 낮은 주소에 놓이고, 네트워크로 보낼 때는 변환 문을 지납니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: [0, 7.2, 8.4], t: [0, 0.7, -0.1] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();