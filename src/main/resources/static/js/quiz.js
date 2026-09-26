/**
 * 토픽 퀴즈 탭
 */
(function () {
    'use strict';

    var section = document.querySelector('.quiz-section');
    var storage = window.CsFlow && window.CsFlow.storage;
    if (!section || !storage) return;

    var topicSlug = section.getAttribute('data-topic-slug');
    var STORAGE_KEY = 'csflow-quiz-' + topicSlug;

    var questions = section.querySelectorAll('.quiz-question');
    var state = {};

    function loadState() {
        var map = storage.getJSON(STORAGE_KEY);
        return (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
    }

    function saveAttempt(questionId, selected, correct, attempt) {
        state[questionId] = { selected: selected, correct: correct, attempt: attempt };
        storage.setJSON(STORAGE_KEY, state);
    }

    function restoreQuestion(question) {
        var questionId = question.getAttribute('data-question-id');
        var record = state[questionId];
        if (!record) return;

        setOptionsDisabled(question, true);
        var opts = question.querySelectorAll('.quiz-option');
        for (var i = 0; i < opts.length; i++) {
            if (opts[i].getAttribute('data-option') === record.selected) {
                opts[i].classList.add(record.correct ? 'quiz-option--correct' : 'quiz-option--wrong');
            }
        }

        if (record.correct || record.attempt > 1) {
            showBlock(question, 'quiz-question__explanation');
        } else {
            showBlock(question, 'quiz-question__hint');
        }
        showBlock(question, 'quiz-question__retry');
    }

    function setOptionsDisabled(question, disabled) {
        var opts = question.querySelectorAll('.quiz-option');
        for (var i = 0; i < opts.length; i++) opts[i].disabled = disabled;
    }

    function showBlock(question, className) {
        var el = question.querySelector('.' + className);
        if (el) el.classList.add('is-visible');
    }

    function hideBlock(question, className) {
        var el = question.querySelector('.' + className);
        if (el) el.classList.remove('is-visible');
    }

    function isAllCorrect() {
        if (questions.length === 0) return false;
        for (var i = 0; i < questions.length; i++) {
            var record = state[questions[i].getAttribute('data-question-id')];
            if (!record || record.correct !== true) return false;
        }
        return true;
    }

    function resetQuestion(question) {
        var questionId = question.getAttribute('data-question-id');
        var opts = question.querySelectorAll('.quiz-option');
        for (var i = 0; i < opts.length; i++) {
            opts[i].disabled = false;
            opts[i].classList.remove('quiz-option--correct', 'quiz-option--wrong');
        }
        hideBlock(question, 'quiz-question__hint');
        hideBlock(question, 'quiz-question__explanation');
        hideBlock(question, 'quiz-question__retry');

        delete state[questionId];
        storage.setJSON(STORAGE_KEY, state);
    }

    function handleAnswer(question, btn) {
        var questionId = question.getAttribute('data-question-id');
        var selected = btn.getAttribute('data-option');
        var attempt = Number(question.getAttribute('data-attempt') || '0') + 1;
        question.setAttribute('data-attempt', String(attempt));

        setOptionsDisabled(question, true);

        window.CsFlow.postJson('/api/quiz/check', { questionId: Number(questionId), selected: selected })
            .then(function (data) {
                if (typeof data.correct !== 'boolean') throw new Error('invalid response');
                saveAttempt(questionId, selected, data.correct, attempt);

                if (data.correct) {
                    btn.classList.add('quiz-option--correct');
                    showBlock(question, 'quiz-question__explanation');
                    showBlock(question, 'quiz-question__retry');
                    if (isAllCorrect()) {
                        document.dispatchEvent(new CustomEvent('csflow:quiz-all-correct', { detail: { slug: topicSlug } }));
                    }
                    return;
                }
                btn.classList.add('quiz-option--wrong');
                if (attempt === 1) {
                    showBlock(question, 'quiz-question__hint');
                } else {
                    showBlock(question, 'quiz-question__explanation');
                }
                showBlock(question, 'quiz-question__retry');
            })
            .catch(function () {
                question.setAttribute('data-attempt', String(attempt - 1));
                setOptionsDisabled(question, false);
                window.CsFlow.showToast('잠시 후 다시 시도해 주세요');
            });
    }

    window.CsFlow.quiz = { isAllCorrect: isAllCorrect };

    state = loadState();

    for (var i = 0; i < questions.length; i++) {
        (function (question) {
            var opts = question.querySelectorAll('.quiz-option');
            for (var j = 0; j < opts.length; j++) {
                opts[j].addEventListener('click', function () {
                    handleAnswer(question, this);
                });
            }
            var retryBtn = question.querySelector('.quiz-question__retry');
            if (retryBtn) {
                retryBtn.addEventListener('click', function () {
                    resetQuestion(question);
                });
            }
            restoreQuestion(question);
        })(questions[i]);
    }
})();