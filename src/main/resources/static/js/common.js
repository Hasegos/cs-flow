/**
 * 공통 JS — 공용 헬퍼(저장소·POST·토스트) / 햄버거 메뉴 / 탭 전환 / 테마
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

    /* ===================== 햄버거 메뉴 ===================== */
    const hamburger = document.getElementById('hamburgerBtn');
    const drawer    = document.getElementById('gnbDrawer');

    if (hamburger && drawer) {
        hamburger.addEventListener('click', function () {
            const isOpen = drawer.classList.toggle('gnb__drawer--open');
            hamburger.classList.toggle('gnb__hamburger--open', isOpen);
            hamburger.setAttribute('aria-label', isOpen ? '메뉴 닫기' : '메뉴 열기');
        });

        document.addEventListener('click', function (e) {
            if (!hamburger.contains(e.target) && !drawer.contains(e.target)) {
                drawer.classList.remove('gnb__drawer--open');
                hamburger.classList.remove('gnb__hamburger--open');
                hamburger.setAttribute('aria-label', '메뉴 열기');
            }
        });
    }

    /* ===================== 탭 전환 ===================== */
    const tabBtns = document.querySelectorAll('.topic-tabs__btn');
    const panels  = document.querySelectorAll('.topic-panel');

    if (tabBtns.length > 0) {
        tabBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                const target = btn.dataset.tab;

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

                if (target === 'visualizer') {
                    window.dispatchEvent(new CustomEvent('csflow-viz-resume'));
                }
            });
        });
    }

    /* ===================== 테마 토글 ===================== */
    const themeBtn = document.getElementById('themeToggleBtn');

    if (storage.get('csflow-theme') === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
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
})();