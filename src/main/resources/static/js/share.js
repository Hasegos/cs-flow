/**
 * 토픽 공유 버튼 — 링크 복사 / 카카오톡 공유.
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

    initCopyButton();
    initKakaoButton();
})();