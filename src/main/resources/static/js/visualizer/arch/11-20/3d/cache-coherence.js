/**
 * 캐시 일관성 3D 공동 편집 노트 장면 (Three.js r128)
 * 2D 시각화의 "3D 공동 편집 노트" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.cacheCoherenceData)가 먼저 있어야 한다.
 * 두 책상(코어 캐시)의 사본 노트에 MESI 태그가 붙고, 뒤쪽 서고 벽의 원본(메인 메모리)과 가운데 공용 인터콤(버스)을 거쳐 값과 무효화 신호가 오간다.
 * 거짓 공유는 한 장의 노트(캐시 라인)가 두 책상 사이를 옮겨 다니는 것으로 보여 주고, 라인을 나누면 책상마다 한 칸씩 남는다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.cacheCoherenceData) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const INK = kit.INK;

    /* ===================== 2D 데이터 (단계 값의 원본) ===================== */
    const DATA = window.CsFlow.cacheCoherenceData;
    const PROB = DATA.prob;
    const MESI = DATA.mesi;
    const FALSE_ST = DATA.falseShare;
    const FS_N = DATA.seq.length;
    const ST_LABEL = DATA.stLabel;
    const fsMoves = DATA.fsMoves;
    const fsState = DATA.fsState;
    const fsOwner = DATA.fsOwner;

    /* ===================== 상수 ===================== */
    const CHAPTERS = [
        { badge: '개요', kind: 'coh', data: PROB, idx: [0] },
        { badge: '읽기', kind: 'coh', data: PROB, idx: [1, 2] },
        { badge: '몰래 쓰기', kind: 'coh', data: PROB, idx: [3, 4] },
        { badge: '문제 정리', kind: 'coh', data: PROB, idx: [5] },
        { badge: 'E → M', kind: 'coh', data: MESI, idx: [1, 2] },
        { badge: '값 제공', kind: 'coh', data: MESI, idx: [3] },
        { badge: '무효화', kind: 'coh', data: MESI, idx: [4, 5] },
        { badge: '같은 라인', kind: 'false', data: FALSE_ST, idx: [0, 1, 2, 3, 4] },
        { badge: '라인 분리', kind: 'false', data: FALSE_ST, idx: [5, 6] }
    ];
    const BADGES = CHAPTERS.map(function (c) { return c.badge; });
    const THEMES = {
        dark: { bg: 0x121418, ground: 0x2e2b28, hemi: 0.7, sun: 1.0 },
        light: { bg: 0xd9d2c4, ground: 0xd3ccbc, hemi: 0.65, sun: 1.0 }
    };
    const DESK_X = [-2.15, 2.15];
    const NOTE_W = 1.6;
    const NOTE_H = 1.05;
    const NOTE_Y = 1.485;
    const NOTE_Z = 0.25;
    const TAG_X = [-3.3, 3.3];
    const TAG_Y = 1.21;
    const TAG_W = 0.56;
    const TAG_H = 0.5;
    const WALL_Z = -2.6;
    const MEM_Z = -2.45;
    const BUS = new V(0, 1.55, 0.6);
    const MEM = new V(0, 2.3, -2.2);
    const TICK_PAUSE = 900;
    const DIM = '#8a8478';
    const COL = { read: '#f2c230', data: '#2fb865', inv: '#e24b4a', wb: '#ff8a3d', line: '#ff8a3d' };
    const STATE_COL = { M: '#e8761e', E: '#1d9e75', S: '#178a8a', C: '#8a5cff', I: '#6f6f7a', N: '#9a9488' };
    const MSG_COL = { '읽기 요청': '#f2c230', '데이터 제공(코어 0)': '#2fb865', '무효화 신호': '#e24b4a', '신호 없음': '#9a9488' };
    const SHOTS = { wide: { t: [0, 1.6, 0], dir: [0, 0.3, 1], w: 7.8, h: 4.2 } };
    const HOME = { p: [0, 3.2, 9.5], t: [0, 1.6, 0] };
    const SAMPLE = ['Core 0', 'Core 1', '원본 · 메인 메모리', '라인 이동', '회', '라인 없음', '라인이 오갔다', '오간 라인 없음',
        '같은 라인', '분리', '최신', '낡음', '낡은 값', '읽기', '데이터', '무효화', '신호 없음', '버스', '버스 사용 없음',
        '데이터 제공(코어 0)', '수정됨', '단독', '공유', '무효', '복사본', '캐시에 없음', '값', '→', '—', 'X = ', 'a', 'b', 'M', 'E', 'S', 'I', 'C', 'N', '0123456789'];

    /* ===================== 공용 도구 ===================== */
    /**
     * 글씨가 최대 폭 안에 들도록 글꼴 크기를 줄여 설정한다.
     *
     * @param x    2D 컨텍스트
     * @param str  그릴 문자열
     * @param maxW 최대 폭
     * @param px   시작 글자 크기
     * @param font 글꼴 이름
     */
    function fitText(x, str, maxW, px, font) {
        let size = px;
        x.font = '700 ' + size + 'px ' + font;
        while (x.measureText(str).width > maxW && size > 12) {
            size -= 2;
            x.font = '700 ' + size + 'px ' + font;
        }
    }

    /**
     * 조명을 받는 단색 재료를 만든다.
     *
     * @param hex 색 번호
     * @returns 재료
     */
    function lam(hex) {
        return new THREE.MeshLambertMaterial({ color: hex });
    }

    /**
     * #RRGGBB 문자열을 색 번호로 바꾼다.
     *
     * @param col #으로 시작하는 6자리 문자열
     * @returns 색 번호
     */
    function hexOf(col) {
        return parseInt(col.slice(1), 16);
    }

    /**
     * 빈 종이 그림을 돌려준다. 장면을 만든 뒤 실제 내용으로 바꾼다.
     *
     * @param x  2D 컨텍스트
     * @param pw 폭
     * @param ph 높이
     */
    function blankDraw(x, pw, ph) {
        x.fillStyle = '#fffdf6';
        x.fillRect(0, 0, pw, ph);
    }

    /**
     * 코어 책상의 노트 앞에서 인터콤까지 가는 경로를 돌려준다.
     *
     * @param i 코어 번호
     * @returns 점 배열
     */
    function routeToBus(i) {
        return [new V(DESK_X[i], 1.6, 0.8), new V(DESK_X[i] * 0.5, 2.25, 0.85), BUS];
    }

    /**
     * 코어 노트에서 인터콤을 거쳐 원본(메인 메모리)까지 가는 경로를 돌려준다.
     *
     * @param i 코어 번호
     * @returns 점 배열
     */
    function routeMem(i) {
        return routeToBus(i).concat([new V(0, 2.0, -0.9), MEM]);
    }

    /**
     * 원본에서 인터콤을 거쳐 코어 노트까지 가는 경로를 돌려준다.
     *
     * @param i 코어 번호
     * @returns 점 배열
     */
    function routeMemToDesk(i) {
        return routeMem(i).reverse();
    }

    /**
     * 한 코어 노트에서 인터콤을 거쳐 다른 코어 노트까지 가는 경로를 돌려준다.
     *
     * @param a 출발 코어 번호
     * @param b 도착 코어 번호
     * @returns 점 배열
     */
    function routeDeskToDesk(a, b) {
        return routeToBus(a).concat(routeToBus(b).reverse().slice(1));
    }

    /**
     * 카드 글꼴 샘플에 쓰는 문구를 모아 돌려준다. 글꼴을 미리 불러올 때 쓴다.
     *
     * @returns 문자열
     */
    function fontSample() {
        return SAMPLE.concat(Object.keys(ST_LABEL).map(function (k) { return ST_LABEL[k]; })).join(' ');
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 두 책상의 사본 노트와 MESI 태그, 가운데 인터콤, 뒤쪽 서고 벽의 원본을 포함한다.
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

        scene.background = new THREE.Color(THEMES.dark.bg);

        /* ===================== 빛과 바닥 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.7);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.0);
        sun.position.set(-4, 12, 9);
        sun.castShadow = true;
        sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 40 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const lamp = new THREE.PointLight(0xffd7a0, 0.6, 14);
        lamp.position.set(1.4, 3.4, 3);
        scene.add(lamp);

        const floorM = new THREE.MeshLambertMaterial({ color: THEMES.dark.ground });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), floorM);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, -1);
        floor.receiveShadow = true;
        scene.add(floor);

        const woodM = lam(0x9c7a55);
        const legM = lam(0x4e3d2c);
        const steelM = lam(0x6b7a8f);
        const steelDarkM = lam(0x3e4a5a);
        const frameM = new THREE.MeshBasicMaterial({ color: 0x8a5cff, toneMapped: false });
        const binderM = [lam(0x8c3b3b), lam(0x1d9e75), lam(0x3e5a8c), lam(0xc9a227)];

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
         * @param outline 잉크 외곽선 여부
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
         * @param draw 처음 그릴 함수(컨텍스트, 폭, 높이)
         * @returns 메시, 재료, redraw 함수
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
            return { mesh: mesh, mat: mat, redraw: redraw };
        }

        /* ===================== 서고 벽과 원본 ===================== */
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.6), new THREE.MeshLambertMaterial({ map: eng.hatch('#e4dccb', 0.2, 80, 3) }));
        wall.position.set(0, 2.3, WALL_Z);
        wall.receiveShadow = true;
        scene.add(wall);

        const memCard = panel(2.3, 1.5, 460, 300, blankDraw);
        memCard.mesh.position.set(0, 2.3, MEM_Z);
        scene.add(memCard.mesh);

        [-3.0, 3.0].forEach(function (sx) {
            box(1.9, 0.07, 0.5, sx, 1.2, -2.3, steelDarkM, true);
            box(1.9, 0.07, 0.5, sx, 3.1, -2.3, steelDarkM, true);
            [-0.6, -0.2, 0.2].forEach(function (dx, k) {
                box(0.28, 0.5, 0.4, sx + dx, 1.485, -2.3, binderM[k], true);
                box(0.28, 0.5, 0.4, sx + dx, 3.385, -2.3, binderM[3 - k], true);
            });
        });

        /* ===================== 책상(코어 캐시)과 노트 ===================== */
        const notes = [];
        const tags = [];
        const frames = [];
        DESK_X.forEach(function (xd, i) {
            box(2.4, 0.1, 1.4, xd, 0.91, 0.2, woodM, true);
            [-1.1, 1.1].forEach(function (dx) {
                [-0.6, 0.6].forEach(function (dz) {
                    box(0.08, 0.9, 0.08, xd + dx, 0.45, 0.2 + dz, legM, false);
                });
            });
            const fr = box(NOTE_W + 0.12, NOTE_H + 0.12, 0.03, xd, NOTE_Y, NOTE_Z - 0.04, frameM, false);
            fr.visible = false;
            frames.push(fr);
            const n = panel(NOTE_W, NOTE_H, 480, 315, blankDraw);
            n.mesh.position.set(xd, NOTE_Y, NOTE_Z);
            scene.add(n.mesh);
            notes.push(n);
            const t = panel(TAG_W, TAG_H, 252, 225, blankDraw);
            t.mesh.position.set(TAG_X[i], TAG_Y, NOTE_Z);
            scene.add(t.mesh);
            tags.push(t);
        });

        /* ===================== 인터콤(버스) ===================== */
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.12, 24), steelDarkM);
        base.position.set(0, 0.06, 0.2);
        base.castShadow = true;
        scene.add(base);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 12), steelM);
        pole.position.set(0, 0.66, 0.2);
        scene.add(pole);
        const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.2, 0.5, 24), steelDarkM);
        horn.rotation.x = Math.PI / 2;
        horn.position.set(0, 1.55, 0.2);
        horn.castShadow = true;
        eng.ink(horn);
        scene.add(horn);
        const face = panel(0.6, 0.34, 264, 150, blankDraw);
        face.mesh.position.set(0, 1.55, 0.47);
        scene.add(face.mesh);
        const glowSp = eng.glow(0xffd166, 1.5);
        glowSp.position.set(0, 1.55, 0.75);
        glowSp.visible = false;
        scene.add(glowSp);

        /* ===================== 패킷(메시지 카드) ===================== */
        const pk = {};
        ['read', 'data', 'inv', 'wb', 'line'].forEach(function (k) {
            const p = panel(0.92, 0.34, 296, 110, blankDraw);
            p.mesh.visible = false;
            scene.add(p.mesh);
            pk[k] = p;
        });

        /* ===================== 그리기 함수 ===================== */
        /**
         * 노트 그림을 돌려준다. 코어 번호, 상태 색 테두리, 본문, 아랫줄 문구를 그린다.
         *
         * @param core 코어 번호
         * @param st   상태 이름
         * @param body 본문 그리기 함수
         * @param sub  아랫줄 {text, col} 또는 null
         * @returns 그리기 함수
         */
        function noteDraw(core, st, body, sub) {
            return function (x, pw, ph) {
                x.fillStyle = st === 'N' ? '#e9e5da' : '#fffdf6';
                x.fillRect(0, 0, pw, ph);
                x.strokeStyle = STATE_COL[st] || STATE_COL.N;
                x.lineWidth = 14;
                x.strokeRect(7, 7, pw - 14, ph - 14);
                x.fillStyle = INK;
                x.textAlign = 'left';
                x.textBaseline = 'middle';
                x.font = '700 ' + Math.round(ph * 0.15) + 'px ' + SERIF;
                x.fillText('Core ' + core, pw * 0.07, ph * 0.16);
                body(x, pw, ph);
                if (sub) {
                    x.fillStyle = sub.col;
                    x.textAlign = 'left';
                    fitText(x, sub.text, pw * 0.86, Math.round(ph * 0.14), SERIF);
                    x.fillText(sub.text, pw * 0.07, ph * 0.84);
                }
            };
        }

        /**
         * 한 줄짜리 본문 그리기 함수를 돌려준다.
         *
         * @param str 본문 문자열
         * @param col 글자 색
         * @returns 그리기 함수
         */
        function textBody(str, col) {
            return function (x, pw, ph) {
                x.fillStyle = col;
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                fitText(x, str, pw * 0.9, Math.round(ph * 0.34), SERIF);
                x.fillText(str, pw / 2, ph * 0.54);
            };
        }

        /**
         * 변수 칸들을 나란히 그리는 본문 그리기 함수를 돌려준다. hi 칸은 보라색 테두리로 강조한다.
         *
         * @param cells 칸에 적을 문자열 배열
         * @param hi    강조할 칸 번호 (없으면 -1)
         * @param col   글자 색
         * @returns 그리기 함수
         */
        function cellBody(cells, hi, col) {
            return function (x, pw, ph) {
                const n = cells.length;
                const cw = pw * 0.34;
                const ch = ph * 0.34;
                const cy = ph * 0.54;
                for (let k = 0; k < n; k++) {
                    const cx = pw * (k + 1) / (n + 1);
                    kit.roundRect(x, cx - cw / 2, cy - ch / 2, cw, ch, 14);
                    x.fillStyle = k === hi ? '#e4d9ff' : '#f1ead9';
                    x.fill();
                    if (k === hi) {
                        x.strokeStyle = '#8a5cff';
                        x.lineWidth = 6;
                        x.stroke();
                    }
                    x.fillStyle = col;
                    x.textAlign = 'center';
                    x.textBaseline = 'middle';
                    fitText(x, cells[k], cw * 0.8, Math.round(ch * 0.6), SERIF);
                    x.fillText(cells[k], cx, cy);
                }
            };
        }

        /**
         * MESI 태그 그림을 돌려준다. 상태 색 바탕에 상태 글자와 한글 이름을 쓴다.
         *
         * @param st 상태 이름(M, E, S, I, C, N)
         * @returns 그리기 함수
         */
        function tagDraw(st) {
            let label = ST_LABEL[st] || '';
            if (label.indexOf(st + ' ') === 0) label = label.slice(st.length + 1);
            return function (x, pw, ph) {
                x.fillStyle = STATE_COL[st] || STATE_COL.N;
                kit.roundRect(x, 4, 4, pw - 8, ph - 8, 24);
                x.fill();
                x.fillStyle = '#ffffff';
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                x.font = '700 ' + Math.round(ph * 0.4) + 'px ' + SERIF;
                x.fillText(st, pw / 2, ph * 0.4);
                fitText(x, label, pw * 0.9, Math.round(ph * 0.17), SERIF);
                x.fillText(label, pw / 2, ph * 0.76);
            };
        }

        /**
         * 원본(메인 메모리) 카드 그림을 돌려준다. 머리글과 아랫줄 띠를 붙인다.
         *
         * @param body      본문 그리기 함수
         * @param stripCol  아랫줄 띠 색
         * @param stripText 아랫줄 띠 문구
         * @returns 그리기 함수
         */
        function memDraw(body, stripCol, stripText) {
            return function (x, pw, ph) {
                x.fillStyle = '#f6f0e0';
                x.fillRect(0, 0, pw, ph);
                x.fillStyle = INK;
                x.textAlign = 'left';
                x.textBaseline = 'middle';
                x.font = '700 ' + Math.round(ph * 0.11) + 'px ' + SERIF;
                x.fillText('원본 · 메인 메모리', pw * 0.06, ph * 0.12);
                body(x, pw, ph);
                x.fillStyle = stripCol;
                x.fillRect(0, ph * 0.8, pw, ph * 0.2);
                x.fillStyle = '#ffffff';
                x.textAlign = 'center';
                x.font = '700 ' + Math.round(ph * 0.12) + 'px ' + SERIF;
                x.fillText(stripText, pw / 2, ph * 0.9);
            };
        }

        /**
         * 거짓 공유의 라인 이동 횟수 본문을 돌려준다. 합계 문장이 있으면 아래 줄에 쓴다.
         *
         * @param count 라인 이동 횟수
         * @param sum   아래 줄 문구 또는 null
         * @returns 그리기 함수
         */
        function countBody(count, sum) {
            const top = '라인 이동 ' + count + '회';
            return function (x, pw, ph) {
                x.fillStyle = INK;
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                fitText(x, top, pw * 0.9, Math.round(ph * 0.2), SERIF);
                x.fillText(top, pw / 2, sum ? ph * 0.45 : ph * 0.54);
                if (sum) {
                    x.fillStyle = '#6b6358';
                    fitText(x, sum, pw * 0.92, Math.round(ph * 0.1), SERIF);
                    x.fillText(sum, pw / 2, ph * 0.67);
                }
            };
        }

        /**
         * 인터콤 면 그림을 돌려준다. 어두운 바탕에 현재 신호 문구를 쓴다.
         *
         * @param text 신호 문구
         * @param col  글자와 테두리 색
         * @returns 그리기 함수
         */
        function faceDraw(text, col) {
            return function (x, pw, ph) {
                x.fillStyle = '#1f1b17';
                x.fillRect(0, 0, pw, ph);
                x.strokeStyle = col;
                x.lineWidth = 8;
                x.strokeRect(6, 6, pw - 12, ph - 12);
                x.fillStyle = col;
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                fitText(x, text, pw * 0.86, Math.round(ph * 0.3), SERIF);
                x.fillText(text, pw / 2, ph / 2 + 2);
            };
        }

        /**
         * 패킷 카드 그림을 돌려준다. 색 알약 모양에 문구를 쓴다.
         *
         * @param text 패킷 문구
         * @param col  바탕 색
         * @returns 그리기 함수
         */
        function pillDraw(text, col) {
            return function (x, pw, ph) {
                x.fillStyle = col;
                kit.roundRect(x, 4, 4, pw - 8, ph - 8, 16);
                x.fill();
                x.fillStyle = '#111111';
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                fitText(x, text, pw - 24, Math.round(ph * 0.5), SERIF);
                x.fillText(text, pw / 2, ph / 2 + 1);
            };
        }

        /* ===================== 상태 그리기 ===================== */
        /**
         * 인터콤 면과 빛을 현재 신호에 맞춘다.
         *
         * @param msg 신호 문구(없으면 빈 문자열)
         * @param act 행동한 코어 번호(없으면 -1)
         */
        function paintBus(msg, act) {
            const text = msg || (act >= 0 ? '버스 사용 없음' : '버스');
            const col = msg ? (MSG_COL[msg] || DIM) : DIM;
            face.redraw(faceDraw(text, col));
            glowSp.visible = !!msg;
            glowSp.material.color.setHex(hexOf(col));
        }

        /**
         * 행동한 코어 노트 둘레에 보라색 틀을 보인다.
         *
         * @param idx 틀을 보일 코어 번호(없으면 -1)
         */
        function setFrame(idx) {
            frames.forEach(function (f, k) { f.visible = k === idx; });
        }

        /**
         * 두 코어 노트와 태그, 원본, 인터콤을 MESI 단계 값 그대로 칠한다.
         *
         * @param s 2D MESI 단계 값
         */
        function paintCoh(s) {
            for (let i = 0; i < 2; i++) {
                const c = s.c[i];
                const val = c.v === null ? 'X = —' : 'X = ' + c.v;
                const sub = c.stale ? { text: '낡은 값', col: '#c23a3a' } : null;
                notes[i].redraw(noteDraw(i, c.s, textBody(val, c.s === 'N' ? DIM : INK), sub));
                tags[i].redraw(tagDraw(c.s));
            }
            const stale = !!s.ms;
            memCard.redraw(memDraw(textBody('X = ' + s.mem, INK), stale ? '#c23a3a' : '#1d9e75', stale ? '낡음' : '최신'));
            paintBus(s.msg, s.act);
            setFrame(s.act);
        }

        /**
         * 거짓 공유 단계 값을 칠한다. 라인이 한 장이면 주인 책상에, 나뉘면 책상마다 한 칸씩 둔다.
         *
         * @param s 2D 거짓 공유 단계 값
         */
        function paintFalse(s) {
            const n = s.n;
            const split = s.split;
            const owner = fsOwner(n, false);
            for (let i = 0; i < 2; i++) {
                const st = fsState(n, split, i);
                let body;
                if (st === 'N') body = textBody('라인 없음', DIM);
                else if (split) body = cellBody([i === 0 ? 'a' : 'b'], 0, INK);
                else if (st === 'M') body = cellBody(['a', 'b'], owner, INK);
                else body = cellBody(['a', 'b'], -1, DIM);
                notes[i].redraw(noteDraw(i, st, body, null));
                tags[i].redraw(tagDraw(st));
            }
            const count = fsMoves(split, n);
            const sum = s.sum ? '같은 라인 ' + fsMoves(false, FS_N) + '회 → 분리 ' + fsMoves(true, FS_N) + '회' : null;
            memCard.redraw(memDraw(countBody(count, sum), count > 0 ? '#e8761e' : '#1d9e75', count > 0 ? '라인이 오갔다' : '오간 라인 없음'));
            paintBus('', -1);
            setFrame(split ? -1 : owner);
        }

        /**
         * 단계 종류에 맞춰 칠한다.
         *
         * @param ch 챕터 정보
         * @param s  2D 단계 값
         */
        function paintBy(ch, s) {
            if (ch.kind === 'false') paintFalse(s);
            else paintCoh(s);
        }

        /* ===================== 움직임 ===================== */
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
         * 노트나 태그를 잠깐 부풀려 바뀌었음을 보인다.
         *
         * @param mesh 부풀릴 메시
         */
        function pulse(mesh) {
            tw(420, function (q) { mesh.scale.setScalar(1 + 0.06 * (1 - q)); });
        }

        /**
         * 코어의 노트와 태그를 함께 부풀린다.
         *
         * @param i 코어 번호
         */
        function flash(i) {
            pulse(notes[i].mesh);
            pulse(tags[i].mesh);
        }

        /**
         * 패킷 카드 하나를 경로를 따라 옮긴다. 도착하면 숨긴다.
         *
         * @param g    단계 세대 번호
         * @param key  패킷 이름
         * @param text 카드 문구
         * @param col  카드 바탕 색
         * @param pts  지나갈 점 배열
         * @param ms   기준 밀리초
         * @returns 단계가 아직 유효하면 true
         */
        async function fly(g, key, text, col, pts, ms) {
            const p = pk[key];
            p.redraw(pillDraw(text, col));
            p.mesh.position.copy(pts[0]);
            p.mesh.visible = true;
            const curve = new THREE.CatmullRomCurve3(pts);
            await tw(ms, function (q) { curve.getPoint(q, p.mesh.position); }, easeInOut);
            if (!alive(g)) return false;
            p.mesh.visible = false;
            return true;
        }

        /**
         * MESI 단계의 버스 동작을 재생한다. 읽기는 원본까지 오가고, 값 제공은 코어끼리, 무효화는 다른 코어로 간다.
         *
         * @param g 단계 세대 번호
         * @param s 2D MESI 단계 값 (이 단계로 들어오는 동작)
         * @returns 단계가 아직 유효하면 true
         */
        async function cohEvent(g, s) {
            setFrame(s.act);
            if (s.msg === '읽기 요청' && s.act >= 0) {
                if (!await fly(g, 'read', '읽기', COL.read, routeMem(s.act), 900)) return false;
                return fly(g, 'data', 'X = ' + s.mem, COL.data, routeMemToDesk(s.act), 900);
            }
            if (s.msg === '데이터 제공(코어 0)') {
                if (!await fly(g, 'read', '읽기', COL.read, routeToBus(1), 500)) return false;
                if (!await fly(g, 'data', 'X = ' + s.c[0].v, COL.data, routeDeskToDesk(0, 1), 800)) return false;
                return fly(g, 'wb', 'X = ' + s.mem, COL.wb, routeMem(0), 800);
            }
            if (s.msg === '무효화 신호') {
                return fly(g, 'inv', '무효화', COL.inv, routeDeskToDesk(s.act, 1 - s.act), 900);
            }
            if (s.act >= 0) {
                flash(s.act);
                await wait(300);
            }
            return alive(g);
        }

        /**
         * 거짓 공유 단계의 라인 이동을 재생한다. 주인이 바뀌면 카드가 인터콤을 거쳐 옮겨 간다.
         *
         * @param g 단계 세대 번호
         * @param p 바로 앞 단계 값
         * @param s 이 단계 값
         * @returns 단계가 아직 유효하면 true
         */
        async function falseEvent(g, p, s) {
            if (s.split) {
                setFrame(-1);
                flash(0);
                flash(1);
                await wait(300);
                return alive(g);
            }
            const from = fsOwner(p.n, false);
            const to = fsOwner(s.n, false);
            setFrame(to);
            if (from >= 0 && from !== to) return fly(g, 'line', 'a | b', COL.line, routeDeskToDesk(from, to), 800);
            flash(to);
            await wait(300);
            return alive(g);
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
         * 단계 하나를 재생한다. 챕터의 첫 단계 직전 상태를 먼저 그리고, 그 뒤 단계마다 버스 동작을 보인 뒤 상태를 칠한다.
         *
         * @param i 챕터 번호
         * @param g 단계 시작 시점의 세대 번호
         */
        async function play(i, g) {
            const ch = CHAPTERS[i];
            eng.clearTweens();
            Object.keys(pk).forEach(function (key) { pk[key].mesh.visible = false; });
            for (let c = 0; c < 2; c++) {
                notes[c].mesh.scale.setScalar(1);
                tags[c].mesh.scale.setScalar(1);
            }
            paintBy(ch, ch.data[Math.max(0, ch.idx[0] - 1)]);
            view('wide');
            for (let j = 0; j < ch.idx.length; j++) {
                const k = ch.idx[j];
                const s = ch.data[k];
                say(ch.badge, s.log);
                if (k > 0) {
                    const ok = ch.kind === 'false' ? await falseEvent(g, ch.data[k - 1], s) : await cohEvent(g, s);
                    if (!ok) return;
                    paintBy(ch, s);
                    pulse(tags[0].mesh);
                    pulse(tags[1].mesh);
                } else {
                    paintBy(ch, s);
                }
                if (!alive(g)) return;
                if (j < ch.idx.length - 1) {
                    await wait(TICK_PAUSE);
                    if (!alive(g)) return;
                }
            }
            view('wide');
        }

        /* ===================== 테마와 해제 ===================== */
        /**
         * 사이트 테마에 맞춰 배경, 바닥, 조명을 바꾼다.
         */
        function applyTheme() {
            const th = window.CsFlow.viz3d.isLight() ? THEMES.light : THEMES.dark;
            scene.background.setHex(th.bg);
            floorM.color.setHex(th.ground);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
        }

        /**
         * 월드가 쥔 재료와 인스턴스는 엔진이 장면을 순회하며 해제하므로 따로 할 일이 없다.
         */
        function release() {}

        /* ===================== 그림자 고정과 첫 장면 ===================== */
        eng.renderer.shadowMap.autoUpdate = false;
        eng.renderer.shadowMap.needsUpdate = true;
        paintCoh(PROB[0]);

        return {
            play: play,
            applyTheme: applyTheme,
            release: release
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'CACHE COHERENCE 3D',
        badges: BADGES,
        canvasLabel: '캐시 일관성을 공동 편집 노트 장면으로 보여 주는 3D. 두 책상의 사본 노트에 MESI 상태 태그가 붙고, 한 코어가 쓰면 공용 인터콤으로 무효화 신호가 나갑니다. 원본은 뒤쪽 서고 벽에 있습니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: HOME,
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();