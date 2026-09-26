/**
 * 토픽 추천(좋아요) 버튼
 */
(function () {
    'use strict';

    var btn = document.querySelector('.topic-like');
    if (!btn) return;

    var countEl = btn.querySelector('.topic-like__count');
    var topicSlug = btn.getAttribute('data-topic-slug');

    btn.addEventListener('click', function () {
        btn.disabled = true;

        window.CsFlow.postJson('/api/topic/' + topicSlug + '/like')
            .then(function (data) {
                btn.classList.toggle('topic-like--active', data.liked === true);
                if (countEl && typeof data.count === 'number') countEl.textContent = String(data.count);
            })
            .catch(function () {
                window.CsFlow.showToast('잠시 후 다시 시도해 주세요');
            })
            .finally(function () {
                btn.disabled = false;
            });
    });
})();