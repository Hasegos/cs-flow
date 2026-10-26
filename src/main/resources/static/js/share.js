/**
 * 토픽 공유 버튼 — 링크 복사 / 카카오톡 공유 / 스레드 공유.
 */
(function () {
    'use strict';

    function getMetaContent(selector) {
        var el = document.querySelector(selector);
        return el ? el.content : '';
    }

    var showToast = window.CsFlow.showToast;

    function initCopyButton() {
        var btn = document.querySelector('.topic-share__btn--copy');
        if (!btn) return;

        btn.addEventListener('click', function () {
            var url = window.location.href;

            var onCopied = function () {
                btn.classList.add('topic-share__btn--copied');
                setTimeout(function () {
                    btn.classList.remove('topic-share__btn--copied');
                }, 1500);
                showToast('링크가 복사되었습니다');
            };

            var onFailed = function () {
                showToast('주소창의 링크를 복사해 주세요');
            };

            if (!navigator.clipboard) {
                onFailed();
                return;
            }
            navigator.clipboard.writeText(url).then(onCopied, onFailed);
        });
    }

    function initKakaoButton() {
        var btn = document.querySelector('.topic-share__btn--kakao');
        if (!btn || !window.Kakao) return;

        if (!window.Kakao.isInitialized()) {
            var keyMeta = document.querySelector('meta[name="kakao-js-key"]');
            var jsKey = keyMeta ? keyMeta.content : '';
            if (!jsKey) return;
            window.Kakao.init(jsKey);
        }

        btn.addEventListener('click', function () {
            if (!window.Kakao.isInitialized()) return;

            window.Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title: getMetaContent('meta[property="og:title"]'),
                    description: getMetaContent('meta[property="og:description"]'),
                    imageUrl: getMetaContent('meta[property="og:image"]'),
                    link: {
                        mobileWebUrl: window.location.href,
                        webUrl: window.location.href
                    }
                }
            });
        });
    }

    function initThreadsButton() {
        var box = document.querySelector('.topic-share');
        if (!box) return;

        var canonical = document.querySelector('link[rel="canonical"]');
        var url = canonical ? canonical.href : window.location.origin + window.location.pathname;
        var text = getMetaContent('meta[property="og:title"]') + '\n' + url;

        var link = document.createElement('a');
        link.className = 'topic-share__btn topic-share__btn--threads';
        link.href = 'https://www.threads.net/intent/post?text=' + encodeURIComponent(text);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', '스레드로 공유');

        var ns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        var circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '4');
        var path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94');
        svg.appendChild(circle);
        svg.appendChild(path);
        link.appendChild(svg);
        box.appendChild(link);
    }

    initCopyButton();
    initKakaoButton();
    initThreadsButton();
})();