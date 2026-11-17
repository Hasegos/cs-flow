/**
 * 공통 JS — 공용 헬퍼(저장소·POST·토스트) / 과목 토픽 목차 / 하단 탭 / 탭 전환 / 테마 / 단축키
 */
(function () {
    'use strict';

    /* ===================== 공용 헬퍼 ===================== */
    window.CsFlow = window.CsFlow || {};

    const storage = {
        available: (function () {
            try {
                localStorage.setItem('__csflow_probe__', '1');
                localStorage.removeItem('__csflow_probe__');
                return true;
            } catch (e) {
                return false;
            }
        })(),
        get: function (key) {
            try { return localStorage.getItem(key); } catch (e) { return null; }
        },
        set: function (key, value) {
            try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
        },
        remove: function (key) {
            try { localStorage.removeItem(key); } catch (e) { }
        },
        getJSON: function (key) {
            const raw = storage.get(key);
            if (raw === null) return null;
            try { return JSON.parse(raw); } catch (e) { return null; }
        },
        setJSON: function (key, value) {
            return storage.set(key, JSON.stringify(value));
        }
    };

    function postJson(url, body) {
        const options = { method: 'POST' };
        if (body !== undefined) {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify(body);
        }
        return fetch(url, options).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        });
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'share-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(function () {
            toast.classList.add('share-toast--visible');
        });

        setTimeout(function () {
            toast.classList.remove('share-toast--visible');
            setTimeout(function () {
                toast.remove();
            }, 300);
        }, 1500);
    }

    window.CsFlow.storage   = storage;
    window.CsFlow.postJson  = postJson;
    window.CsFlow.showToast = showToast;

    /* ===================== 폰트 CSS 적용 ===================== */
    document.querySelectorAll('link[data-async-css]').forEach(function (link) {
        link.media = 'all';
    });

    /* 폰트가 늦게 오면 글이 다시 흘러 #주소로 들어온 자리가 어긋난다. 다 읽은 뒤 한 번 더 맞춘다 */
    if (location.hash.length > 1) {
        let userMoved = false;
        const markMoved = function () { userMoved = true; };
        window.addEventListener('wheel',     markMoved, { passive: true, once: true });
        window.addEventListener('touchmove', markMoved, { passive: true, once: true });
        window.addEventListener('keydown',   markMoved, { once: true });

        /** 사용자가 아직 안 움직였으면 #주소가 가리키는 자리로 다시 맞춘다. */
        function settleHash() {
            if (userMoved) return;
            const target = document.getElementById(location.hash.slice(1));
            if (target) target.scrollIntoView();
        }

        window.addEventListener('load', settleHash);
        /* 글꼴은 load 뒤에 올 수도 있다 */
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(settleHash);
    }

    /* ===================== 과목 토픽 목차 ===================== */
    const navEl = document.querySelector('.side-nav');

    /* 과목 강조색을 루트로 올려 목차 밖에서도 쓰게 한다 */
    if (navEl) {
        const accent = navEl.style.getPropertyValue('--subject-accent');
        if (accent) document.documentElement.style.setProperty('--subject-accent', accent.trim());
    }

    const navToggle = document.getElementById('sideNavToggle');
    const navPanel  = document.getElementById('sideNavPanel');

    /* 토글 버튼은 1140px 미만에서만 보인다 */
    if (navToggle && navPanel) {
        navToggle.addEventListener('click', function () {
            const isOpen = navPanel.classList.toggle('side-nav__panel--open');
            navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
    }

    /* --- 너비 조절 --- */
    const navResizer = document.getElementById('sideNavResizer');

    if (navResizer) {
        const root = document.documentElement;
        const KEY = 'csflow-nav-width';
        const DEFAULT_W = 300;
        const STEP = 16;

        /**
         * 지금 화면에서 쓸 수 있는 너비 범위를 돌려준다.
         * 화면이 좁으면 본문이 사라지지 않도록 최대값을 더 줄인다.
         *
         * @returns {{min: number, max: number}} 최소 · 최대 너비(px)
         */
        function limits() {
            const cs = getComputedStyle(root);
            const min = parseInt(cs.getPropertyValue('--side-nav-w-min'), 10) || 220;
            const max = parseInt(cs.getPropertyValue('--side-nav-w-max'), 10) || 480;
            return { min: min, max: Math.min(max, Math.round(window.innerWidth * 0.4)) };
        }

        /**
         * 너비를 범위 안으로 맞춰 적용한다.
         *
         * @param px       적용할 너비(px)
         * @param remember true면 브라우저에 기억한다
         * @returns {number} 실제로 적용된 너비(px)
         */
        function apply(px, remember) {
            const lim = limits();
            const w = Math.min(Math.max(Math.round(px), lim.min), lim.max);
            root.style.setProperty('--side-nav-w', w + 'px');
            navResizer.setAttribute('aria-valuenow', String(w));
            if (remember) storage.set(KEY, String(w));
            return w;
        }

        const saved = parseInt(storage.get(KEY), 10);
        if (saved) apply(saved, false);

        const lim0 = limits();
        navResizer.setAttribute('aria-valuemin', String(lim0.min));
        navResizer.setAttribute('aria-valuemax', String(lim0.max));

        navResizer.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            navResizer.setPointerCapture(e.pointerId);
            document.body.classList.add('is-nav-resizing');

            function move(ev) { apply(ev.clientX, false); }

            function up(ev) {
                navResizer.removeEventListener('pointermove', move);
                navResizer.removeEventListener('pointerup', up);
                navResizer.removeEventListener('pointercancel', up);
                document.body.classList.remove('is-nav-resizing');
                apply(ev.clientX, true);
            }

            navResizer.addEventListener('pointermove', move);
            navResizer.addEventListener('pointerup', up);
            navResizer.addEventListener('pointercancel', up);
        });

        /* 더블클릭하면 기본값으로 */
        navResizer.addEventListener('dblclick', function () {
            root.style.removeProperty('--side-nav-w');
            storage.remove(KEY);
            navResizer.setAttribute('aria-valuenow', String(DEFAULT_W));
        });

        /* 좌우 화살표로 16px씩 */
        navResizer.addEventListener('keydown', function (e) {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const now = parseInt(getComputedStyle(root).getPropertyValue('--side-nav-w'), 10) || DEFAULT_W;
            apply(now + (e.key === 'ArrowRight' ? STEP : -STEP), true);
        });
    }

    /* --- 접기 --- */
    const navCollapse = document.getElementById('sideNavCollapse');
    const navOpen     = document.getElementById('sideNavOpen');

    if (navCollapse && navOpen) {
        const COLLAPSE_KEY = 'csflow-nav-collapsed';
        const root = document.documentElement;

        /**
         * 목차를 접거나 편다. 접으면 --side-nav-w 를 0 으로 두어
         * 본문 여백과 읽기 진행 바까지 한 번에 따라오게 한다.
         *
         * @param on true면 접는다
         */
        function setCollapsed(on) {
            document.body.classList.toggle('is-nav-collapsed', on);
            if (on) {
                root.style.setProperty('--side-nav-w', '0px');
            } else {
                const saved = parseInt(storage.get('csflow-nav-width'), 10);
                if (saved) root.style.setProperty('--side-nav-w', saved + 'px');
                else root.style.removeProperty('--side-nav-w');
            }
            storage.set(COLLAPSE_KEY, on ? '1' : '0');
        }

        if (storage.get(COLLAPSE_KEY) === '1') setCollapsed(true);

        navCollapse.addEventListener('click', function () {
            setCollapsed(true);
            navOpen.focus();
        });

        navOpen.addEventListener('click', function () {
            setCollapsed(false);
            navCollapse.focus();
        });
    }

    const navFilter = document.getElementById('sideNavFilter');
    const navList   = document.getElementById('sideNavList');
    const navEmpty  = document.getElementById('sideNavEmpty');

    if (navFilter && navList) {
        const items = Array.prototype.slice.call(navList.querySelectorAll('.side-nav__item'));
        const titles = items.map(function (item) {
            const text = item.querySelector('.side-nav__text');
            return (text ? text.textContent : '').replace(/\s+/g, '').toLowerCase();
        });

        navFilter.addEventListener('input', function () {
            const needle = navFilter.value.replace(/\s+/g, '').toLowerCase();
            let shown = 0;

            for (let i = 0; i < items.length; i++) {
                const hit = needle === '' || titles[i].indexOf(needle) !== -1;
                items[i].classList.toggle('side-nav__item--hidden', !hit);
                if (hit) shown++;
            }

            if (navEmpty) navEmpty.hidden = shown > 0;
        });
    }

    /* ===================== 과목 시트 ===================== */
    /* 아래 탭(좁은 화면)과 헤더 단추(태블릿)가 같은 시트를 연다 */
    const sheetBtns = [document.getElementById('tabbarBrowse'), document.getElementById('gnbBrowse')]
        .filter(Boolean);
    const sheet = document.getElementById('tabbarSheet');
    const scrim = document.getElementById('tabbarScrim');

    if (sheetBtns.length && sheet && scrim) {
        let lastSheetBtn = sheetBtns[0];

        /**
         * 과목 시트를 열거나 닫는다.
         *
         * @param open true면 연다
         */
        function toggleSheet(open) {
            sheet.hidden = !open;
            scrim.hidden = !open;
            sheetBtns.forEach(function (btn) {
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
            document.body.classList.toggle('is-sheet-open', open);
            if (open) {
                const first = sheet.querySelector('.tabbar__sheet-item');
                if (first) first.focus();
            }
        }

        sheetBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                lastSheetBtn = btn;
                toggleSheet(sheet.hidden);
            });
        });

        scrim.addEventListener('click', function () {
            toggleSheet(false);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !sheet.hidden) {
                toggleSheet(false);
                lastSheetBtn.focus();
            }
        });
    }

    /* ===================== 탭 전환 ===================== */
    const tabBtns = document.querySelectorAll('.topic-tabs__btn');
    const panels  = document.querySelectorAll('.topic-panel');

    /* 코드 연결 탭을 작동 원리 안으로 합쳤다. 옛 주소가 빈 화면이 되지 않게 보낸다 */
    const TAB_ALIAS = { code: 'visualizer' };

    if (tabBtns.length > 0) {
        const tabList = document.querySelector('.topic-tabs__inner');
        if (tabList) tabList.setAttribute('role', 'tablist');

        /* 탭 버튼이 토픽 템플릿 128개에 흩어져 있어 ARIA 속성은 여기에서 붙인다 */
        tabBtns.forEach(function (btn) {
            const target = btn.dataset.tab;
            btn.setAttribute('role', 'tab');
            btn.id = 'tab-' + target;
            btn.setAttribute('aria-controls', 'panel-' + target);

            const panel = document.getElementById('panel-' + target);
            if (panel) {
                panel.setAttribute('role', 'tabpanel');
                panel.setAttribute('aria-labelledby', btn.id);
                panel.setAttribute('tabindex', '0');
            }
        });

        /** 활성 탭에만 aria-selected 와 tabindex 0 을 둔다. */
        function syncTabState() {
            tabBtns.forEach(function (b) {
                const on = b.classList.contains('is-active');
                b.setAttribute('aria-selected', on ? 'true' : 'false');
                b.setAttribute('tabindex', on ? '0' : '-1');
            });
        }

        /**
         * 탭을 연다. 이미 열려 있으면 아무것도 하지 않는다.
         *
         * @param target 탭 식별자 (data-tab 값)
         * @param opts   scroll 이면 내용 맨 위로, focus 면 탭 버튼에 초점을 준다
         * @returns {boolean} 실제로 바뀌었으면 true
         */
        function activateTab(target, opts) {
            const btn = Array.prototype.find.call(tabBtns, function (b) {
                return b.dataset.tab === target;
            });
            if (!btn || btn.classList.contains('is-active')) return false;

            const activePanel = document.querySelector('.topic-panel.is-active');
            if (activePanel) {
                const c = activePanel.querySelector('canvas');
                if (c) {
                    c.width = 1;
                    c.height = 1;
                    window.dispatchEvent(new CustomEvent('csflow-viz-pause'));
                }
            }

            tabBtns.forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');

            panels.forEach(function (panel) {
                panel.classList.remove('is-active');
            });
            const targetPanel = document.getElementById('panel-' + target);
            if (targetPanel) targetPanel.classList.add('is-active');

            syncTabState();
            if (opts && opts.scroll) scrollToTabTop();
            if (opts && opts.focus) btn.focus();

            if (target === 'visualizer') {
                window.dispatchEvent(new CustomEvent('csflow-viz-resume'));
            }
            return true;
        }

        tabBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                const target = btn.dataset.tab;
                if (activateTab(target, { scroll: true }) && window.history.pushState) {
                    window.history.pushState({ tab: target }, '', '#' + target);
                }
            });
        });

        /* 좌우 화살표로 탭 이동 */
        tabBtns.forEach(function (btn, i) {
            btn.addEventListener('keydown', function (e) {
                let next = null;
                if (e.key === 'ArrowRight') next = tabBtns[(i + 1) % tabBtns.length];
                else if (e.key === 'ArrowLeft') next = tabBtns[(i - 1 + tabBtns.length) % tabBtns.length];
                else if (e.key === 'Home') next = tabBtns[0];
                else if (e.key === 'End') next = tabBtns[tabBtns.length - 1];
                if (!next) return;
                e.preventDefault();
                activateTab(next.dataset.tab, { scroll: false, focus: true });
                if (window.history.replaceState) {
                    window.history.replaceState({ tab: next.dataset.tab }, '', '#' + next.dataset.tab);
                }
            });
        });

        window.addEventListener('popstate', function () {
            /* 해시가 없는 자리로 돌아오면 첫 탭이 열려 있어야 한다 */
            const hash = window.location.hash.replace('#', '');
            activateTab(TAB_ALIAS[hash] || hash || tabBtns[0].dataset.tab, { scroll: false });
        });

        syncTabState();

        /* 주소에 탭이 있으면 그 탭으로 */
        const initial = window.location.hash.replace('#', '');
        if (initial) {
            const target = TAB_ALIAS[initial] || initial;
            activateTab(target, { scroll: false });
            if (target !== initial && window.history.replaceState) {
                window.history.replaceState({ tab: target }, '', '#' + target);
            }
        }
    }

    /**
     * 탭을 바꾼 뒤 새 내용이 맨 위부터 보이게 스크롤한다.
     * 탭 막대는 헤더 아래에 붙어 있으므로, 막대가 원래 놓인 자리(히어로 바로 아래)까지만 올린다.
     * 이미 그 위에 있으면 움직이지 않는다.
     */
    function scrollToTabTop() {
        const tabs = document.querySelector('.topic-tabs');
        const above = tabs && tabs.previousElementSibling;
        if (!above) return;
        const stuckTop = parseFloat(getComputedStyle(tabs).top) || 0;
        const natural = above.getBoundingClientRect().bottom + window.scrollY - stuckTop;
        if (window.scrollY > natural) window.scrollTo(0, Math.max(0, natural));
    }

    /* ===================== 다음 단계 버튼 ===================== */
    if (tabBtns.length > 1) {
        const nextTopicMeta = document.querySelector('meta[name="csflow-next-topic"]');

        tabBtns.forEach(function (btn, i) {
            const panel = document.getElementById('panel-' + btn.dataset.tab);
            if (!panel) return;

            const nextBtn = tabBtns[i + 1];
            const bar = document.createElement('div');
            bar.className = 'topic-next';

            const link = document.createElement(nextBtn ? 'button' : 'a');
            link.className = 'topic-next__btn';
            if (nextBtn) {
                link.type = 'button';
                link.textContent = '다음: ' + nextBtn.textContent.trim() + ' \u2192';
                link.addEventListener('click', function () {
                    nextBtn.click();
                });
            } else if (nextTopicMeta) {
                link.href = nextTopicMeta.content;
                link.textContent = '다음 토픽: ' + nextTopicMeta.dataset.title + ' \u2192';
            } else {
                return;
            }
            bar.appendChild(link);
            panel.appendChild(bar);
        });
    }

    /* ===================== 테마 토글 ===================== */
    const themeBtn = document.getElementById('themeToggleBtn');

    /* 고른 적이 없으면 운영체제 설정을 따른다 */
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
    const savedTheme = storage.get('csflow-theme');

    if (savedTheme === 'light' || (savedTheme === null && prefersLight && prefersLight.matches)) {
        document.documentElement.setAttribute('data-theme', 'light');
    }

    /* 직접 고르기 전까지는 운영체제 설정 변경을 따라간다 */
    if (savedTheme === null && prefersLight && prefersLight.addEventListener) {
        prefersLight.addEventListener('change', function (e) {
            if (storage.get('csflow-theme') !== null) return;
            if (e.matches) document.documentElement.setAttribute('data-theme', 'light');
            else document.documentElement.removeAttribute('data-theme');
            window.dispatchEvent(new CustomEvent('csflow-theme-change'));
        });
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', function () {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            if (isLight) {
                document.documentElement.removeAttribute('data-theme');
                storage.set('csflow-theme', 'dark');
                themeBtn.setAttribute('aria-label', '라이트 모드로 전환');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                storage.set('csflow-theme', 'light');
                themeBtn.setAttribute('aria-label', '다크 모드로 전환');
            }
            window.dispatchEvent(new CustomEvent('csflow-theme-change'));
        });

        themeBtn.setAttribute('aria-label',
            document.documentElement.getAttribute('data-theme') === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'
        );
    }
    /* ===================== 키보드 단축키 ===================== */
    function isTyping(el) {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    /**
     * 이 화면에서 '/' 로 갈 검색 칸을 고른다. 과목 검색 칸이 있으면 그쪽을 먼저 쓴다.
     *
     * @returns {HTMLElement|null} 검색 칸, 없으면 null
     */
    function findSearchInput() {
        return document.querySelector('.topic-filter__input')
            || document.getElementById('sideNavFilter')
            || null;
    }

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        if (e.key === '/' && !isTyping(e.target)) {
            const input = findSearchInput();
            if (!input) return;
            e.preventDefault();
            const panel = document.getElementById('sideNavPanel');
            const toggle = document.getElementById('sideNavToggle');
            if (input.id === 'sideNavFilter' && panel && !panel.classList.contains('side-nav__panel--open')
                && toggle && getComputedStyle(toggle).display !== 'none') {
                toggle.click();
            }
            input.focus();
            input.select();
            return;
        }

        if (e.key === 'Escape' && isTyping(e.target) && e.target.type === 'search') {
            e.target.value = '';
            e.target.dispatchEvent(new Event('input', { bubbles: true }));
            e.target.blur();
        }
    });

    /* ===================== 시각화 단축키 ===================== */
    /**
     * 작동 원리 탭의 시각화 버튼을 라벨로 찾는다. 버튼을 시각화마다 따로 만들어
     * 클래스 이름이 과목별로 달라서 라벨로 고른다. 3D 화면이 열려 있으면 2D 버튼이
     * 숨어 있으므로 보이는 버튼만 돌려준다.
     *
     * @param {string} label 버튼 라벨
     * @returns {HTMLButtonElement|null} 찾은 버튼, 없으면 null
     */
    function findVizButton(label) {
        const host = document.getElementById('visualizer-container');
        if (!host) return null;
        const btns = host.querySelectorAll('button');
        for (let i = 0; i < btns.length; i++) {
            if (btns[i].offsetParent !== null && btns[i].textContent.trim() === label) return btns[i];
        }
        return null;
    }

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        if (isTyping(e.target)) return;

        /* 버튼과 목차 손잡이는 Space · 화살표를 이미 쓴다 */
        if (e.target && (e.target.tagName === 'BUTTON'
            || (e.target.classList && e.target.classList.contains('side-nav__resizer')))) return;

        const panel = document.getElementById('panel-visualizer');
        if (!panel || !panel.classList.contains('is-active')) return;

        if (e.key === ' ') {
            const play = findVizButton('▶ PLAY');
            if (!play) return;
            e.preventDefault();
            if (!play.disabled) {
                play.click();
                return;
            }
            /* 재생 중이면 멈춘다. 탭을 떠날 때 쓰는 신호를 그대로 쓴다 */
            window.dispatchEvent(new CustomEvent('csflow-viz-pause'));
            play.disabled = false;
            const step = findVizButton('▶| STEP');
            if (step) step.disabled = false;
            return;
        }

        if (e.key === 'ArrowRight') {
            const step = findVizButton('▶| STEP');
            if (!step || step.disabled) return;
            e.preventDefault();
            step.click();
            return;
        }

        if (e.key === 'r' || e.key === 'R') {
            const reset = findVizButton('↺ RESET');
            if (!reset) return;
            e.preventDefault();
            reset.click();
        }
    });

    /* 키보드가 있는 기기에만, 재생 버튼이 있는 시각화에만 안내를 붙인다 */
    const vizWrap = document.querySelector('.visualizer-wrap');
    if (vizWrap && window.matchMedia('(pointer: fine)').matches) {
        const hint = document.createElement('p');
        hint.className = 'viz-hint';
        hint.hidden = true;
        hint.innerHTML = '<kbd>Space</kbd> 재생 · 정지'
            + '<kbd>→</kbd> 한 단계'
            + '<kbd>R</kbd> 처음으로'
            + '<a class="viz-hint__more" href="/guide#shortcuts">이용 가이드</a>';
        vizWrap.appendChild(hint);

        const vizWatch = new MutationObserver(revealVizHint);

        /** 재생 버튼이 그려졌으면 안내를 보여 주고 지켜보기를 멈춘다. */
        function revealVizHint() {
            const btns = vizWrap.querySelectorAll('button');
            for (let i = 0; i < btns.length; i++) {
                if (btns[i].textContent.trim() === '▶ PLAY') {
                    hint.hidden = false;
                    vizWatch.disconnect();
                    return;
                }
            }
        }

        revealVizHint();
        if (hint.hidden) {
            vizWatch.observe(vizWrap, { childList: true, subtree: true });
            /* 재생 버튼이 없는 시각화도 있으므로 오래 지켜보지 않는다 */
            setTimeout(function () { vizWatch.disconnect(); }, 8000);
        }
    }

    /* ===================== 코드 패널 ===================== */
    /* 시각화가 단계를 넘길 때마다 같은 이름이 달린 코드 줄을 밝힌다 */
    const codeSync = document.querySelector('[data-code-sync]');
    if (codeSync) {
        const langSel  = codeSync.querySelector('.code-sync__select');
        const stateEl  = codeSync.querySelector('[data-code-sync-state]');
        const allLists = codeSync.querySelectorAll('.code-sync__lines');
        const LANG_KEY = 'csflow-code-lang';

        let variant  = allLists[0].dataset.variant;
        let lastStep = null;

        /*
         * 위아래로 쌓이면 코드가 화면 밖으로 밀린다. 지금 실행 중인 한 줄만
         * 시각화 위에 붙여 둔다. 전체 코드는 그대로 아래에서 읽는다.
         */
        const OPEN_KEY = 'csflow-nowbar-open';
        const nowBar = document.createElement('button');
        nowBar.type = 'button';
        nowBar.className = 'code-sync__now';
        nowBar.setAttribute('aria-expanded', 'false');
        nowBar.innerHTML = '<span class="code-sync__now-caret" aria-hidden="true">&#9656;</span>'
            + '<span class="code-sync__now-body"></span>'
            + '<span class="code-sync__now-num"></span>';
        const nowBody = nowBar.querySelector('.code-sync__now-body');
        const nowNum  = nowBar.querySelector('.code-sync__now-num');
        codeSync.parentNode.insertBefore(nowBar, codeSync.parentNode.firstChild);

        /* 한 단계가 여러 줄이면 접힌 채로는 첫 줄만 보인다. 눌러서 전부 편다 */
        /* 기본은 전부 보여 준다. 접으면 첫 줄만 남고, 그 선택은 기억한다 */
        let nowOpen = storage.get(OPEN_KEY) !== '0';

        /** 띠를 접거나 편다. */
        function setNowOpen(on) {
            nowOpen = on;
            nowBar.classList.toggle('code-sync__now--open', on);
            nowBar.setAttribute('aria-expanded', on ? 'true' : 'false');
            storage.set(OPEN_KEY, on ? '1' : '0');
        }

        nowBar.addEventListener('click', function () { setNowOpen(!nowOpen); });
        setNowOpen(nowOpen);
        let lang     = storage.get(LANG_KEY) || langSel.value;
        if (!codeSync.querySelector('.code-sync__lines[data-lang="' + lang + '"]')) lang = langSel.value;
        langSel.value = lang;

        /** 고른 갈래와 언어에 맞는 목록 하나만 보여 준다. */
        function showList() {
            allLists.forEach(function (list) {
                list.hidden = !(list.dataset.variant === variant && list.dataset.lang === lang);
            });
        }

        /**
         * 지금 단계에 해당하는 줄을 밝힌다.
         *
         * @param step 단계 이름. null 이면 모두 끈다
         */
        function markStep(step) {
            const list = codeSync.querySelector('.code-sync__lines:not([hidden])');
            if (!list) return;

            let first = null;
            list.querySelectorAll('li').forEach(function (li) {
                const names = (li.dataset.step || '').split(' ');
                const on = step !== null && names.indexOf(step) !== -1;
                li.classList.toggle('is-now', on);
                if (on && !first) first = li;
            });

            if (first) bringIntoView(list, first);
            fillNowBar(list, step);
        }

        /**
         * 지금 밝은 줄을 모두 띠에 옮겨 적는다.
         * 한 단계가 여러 줄에 걸치는 일이 흔해서(반복문 머리 + 가운데 고르기 등)
         * 접힌 채로는 첫 줄만, 펴면 전부 보인다.
         *
         * @param list 지금 보이는 코드 목록
         * @param step 단계 이름. null 이면 시작 전
         */
        function fillNowBar(list, step) {
            const lines = Array.prototype.slice.call(list.querySelectorAll('li'));
            const lit = lines.filter(function (li) {
                return step !== null && (li.dataset.step || '').split(' ').indexOf(step) !== -1;
            });

            nowBody.textContent = '';
            if (lit.length === 0) {
                const p = document.createElement('span');
                p.className = 'code-sync__now-line';
                p.textContent = '재생하면 지금 줄이 여기에 나옵니다';
                nowBody.appendChild(p);
                nowNum.textContent = '';
                nowBar.classList.remove('code-sync__now--on', 'code-sync__now--many');
                nowBar.disabled = true;
                return;
            }

            lit.forEach(function (li) {
                const row = document.createElement('span');
                row.className = 'code-sync__now-line';
                const no = document.createElement('b');
                no.textContent = lines.indexOf(li) + 1;
                row.appendChild(no);
                row.appendChild(document.createTextNode(li.textContent.trim()));
                nowBody.appendChild(row);
            });

            nowNum.textContent = lit.length > 1 ? lit.length + '줄' : '';
            nowBar.classList.add('code-sync__now--on');
            nowBar.classList.toggle('code-sync__now--many', lit.length > 1);
            nowBar.disabled = lit.length < 2;
        }

        /**
         * 밝아진 줄을 목록 가운데로 옮긴다.
         * 목록이 통째로 펼쳐져 스스로 스크롤하지 않으면 아무것도 하지 않는다.
         * 그때 화면을 움직이면 사용자가 보던 자리를 빼앗는다.
         *
         * @param list  지금 보이는 코드 목록
         * @param line  밝아진 첫 줄
         */
        function bringIntoView(list, line) {
            if (list.scrollHeight <= list.clientHeight + 1) return;

            /* offsetTop 은 패널 기준이 아니라 어긋난다. 실제 자리 차이로 잰다 */
            const lr = list.getBoundingClientRect();
            const fr = line.getBoundingClientRect();
            const top = list.scrollTop + (fr.top - lr.top) - list.clientHeight / 2 + fr.height / 2;
            list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }

        langSel.addEventListener('change', function () {
            lang = langSel.value;
            storage.set(LANG_KEY, lang);
            showList();
            markStep(lastStep);
        });

        window.addEventListener('csflow-viz-step', function (e) {
            const d = e.detail || {};
            if (d.variant && d.variant !== variant) {
                variant = d.variant;
                showList();
            }
            lastStep = d.step || null;
            markStep(lastStep);
            /* 한 번 밝아지고 나면 안내는 필요 없다 */
            if (stateEl) stateEl.hidden = lastStep !== null;
        });

        showList();
        markStep(null);

    }

    /* ===================== 아래 고정 조작 막대 ===================== */
    /*
     * .topic-panel 이 animation ... both 로 transform 을 남겨 고정 위치의
     * 기준이 된다. 그래서 진짜 버튼을 옮기지 않고 body 에 대신 누를 막대를
     * 만들어 둔다. 좁은 화면에서 진짜 버튼이 화면 밖으로 나가면 나타난다.
     */
    if (document.querySelector('[data-code-sync]') && document.getElementById('visualizer-container')) {
        const DOCK_KEYS = [
            { label: '▶',  target: '▶ PLAY',  aria: '재생' },
            { label: '▶|', target: '▶| STEP', aria: '한 단계' },
            { label: '↺',  target: '↺ RESET', aria: '처음으로' }
        ];

        const dock = document.createElement('div');
        dock.className = 'viz-dock';
        dock.hidden = true;
        DOCK_KEYS.forEach(function (k) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'viz-dock__btn';
            b.textContent = k.label;
            b.setAttribute('aria-label', k.aria);
            b.addEventListener('click', function () {
                const real = findVizButton(k.target);
                if (real) real.click();
            });
            dock.appendChild(b);
        });
        document.body.appendChild(dock);

        /** 진짜 조작 막대가 화면 밖이고 작동 원리 탭일 때만 띄운다. */
        function watchControls() {
            const play = findVizButton('▶ PLAY');
            if (!play || !play.parentNode) return false;

            /* isIntersecting 은 1% 만 보여도 참이다. 다 보일 때만 막대를 숨긴다 */
            const io = new IntersectionObserver(function (entries) {
                const panel = document.getElementById('panel-visualizer');
                const open = panel && panel.classList.contains('is-active');
                dock.hidden = !open || entries[0].intersectionRatio > 0.95;
            }, { threshold: [0, 0.5, 0.95, 1] });
            io.observe(play.parentNode);
            return true;
        }

        if (!watchControls()) {
            /* 시각화는 나중에 그려진다. 생기면 그때 붙인다 */
            const mo = new MutationObserver(function () { if (watchControls()) mo.disconnect(); });
            mo.observe(document.getElementById('visualizer-container'), { childList: true, subtree: true });
            setTimeout(function () { mo.disconnect(); }, 8000);
        }
    }

    /* ===================== 읽기 진행 바 ===================== */
    if (document.querySelector('.topic-content')) {
        const readBar = document.createElement('div');
        readBar.className = 'reading-progress';
        readBar.setAttribute('aria-hidden', 'true');

        const readFill = document.createElement('span');
        readFill.className = 'reading-progress__fill';
        readBar.appendChild(readFill);
        document.body.appendChild(readBar);

        let ticking = false;
        function updateReadBar() {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            const pct = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
            readFill.style.width = pct + '%';
            ticking = false;
        }

        window.addEventListener('scroll', function () {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(updateReadBar);
        }, { passive: true });

        window.addEventListener('resize', updateReadBar, { passive: true });
        updateReadBar();
    }
})();
