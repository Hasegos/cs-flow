/**
 * 면접 대비 계획 페이지 — 계획 만들기 · 조건 바꾸기 / 오늘 풀 질문 / 약한 과목 / 달력
 */
(function () {
    'use strict';

    const formEl = document.getElementById('interview-form');
    if (!formEl || !window.CsFlow) return;

    const storage = window.CsFlow.storage;
    const showToast = window.CsFlow.showToast;

    const TOKEN_KEY = 'csflow-interview';
    const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
    const SLUG_PATTERN = /^[a-z0-9-]+$/;
    const API = '/api/plans';
    const DAY_TYPE_TEXT = { LEARN: '학습', REVIEW: '약점 보충', MOCK: '모의 면접', REST: '휴식' };
    const ROLE_TEXT = { BACKEND: '백엔드', FRONTEND: '프런트엔드', EMBEDDED: '임베디드', COMMON: '공통' };
    const WEEKDAY_TEXT = ['월', '화', '수', '목', '금', '토', '일'];
    const RATINGS = [
        { value: 'KNOW', text: '알고 있었어요' },
        { value: 'UNSURE', text: '애매했어요' },
        { value: 'DONT', text: '몰랐어요' }
    ];

    const loadingEl = document.getElementById('interview-loading');
    const setupEl = document.getElementById('interview-setup');
    const setupTitleEl = document.getElementById('interview-setup-title');
    const planEl = document.getElementById('interview-plan');
    const errorEl = document.getElementById('interview-error');
    const submitBtn = document.getElementById('interview-submit');
    const cancelBtn = document.getElementById('interview-cancel');
    const roleEl = document.getElementById('interview-role');
    const targetEl = document.getElementById('interview-target');

    const subjectNames = Object.create(null);
    document.querySelectorAll('.interview-subject-name').forEach(function (node) {
        subjectNames[node.getAttribute('data-slug')] = node.getAttribute('data-name');
    });

    let token = null;
    let plan = null;
    let editing = false;
    let loadSeq = 0;

    /* ===================== 공용 ===================== */

    /**
     * 요소를 만든다.
     *
     * @param tag       태그 이름
     * @param className 클래스, 없으면 생략
     * @param text      텍스트, 없으면 생략
     * @returns 만든 요소
     */
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    /**
     * 요소의 자식을 모두 지운다.
     *
     * @param node 비울 요소
     */
    function clear(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
    }

    /**
     * 과목 slug를 화면에 보여 줄 이름으로 바꾼다.
     *
     * @param slug 과목 영문 식별자
     * @returns 과목 이름, 모르는 slug면 slug 그대로
     */
    function subjectName(slug) {
        return subjectNames[slug] || slug;
    }

    /**
     * ISO 날짜 문자열을 로컬 시간 Date로 바꾼다.
     *
     * @param iso YYYY-MM-DD
     * @returns Date
     */
    function parseDate(iso) {
        const p = iso.split('-');
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }

    /**
     * ISO 날짜를 월/일 표기로 바꾼다.
     *
     * @param iso YYYY-MM-DD
     * @returns 예: 11/2
     */
    function monthDay(iso) {
        const d = parseDate(iso);
        return (d.getMonth() + 1) + '/' + d.getDate();
    }

    /**
     * Date를 ISO 날짜 문자열로 바꾼다.
     *
     * @param date Date
     * @returns YYYY-MM-DD
     */
    function toIso(date) {
        const m = date.getMonth() + 1;
        const d = date.getDate();
        return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
    }

    /**
     * 같은 도메인 API를 호출한다. 에러 응답의 상태 코드와 본문(message)을 화면이 쓸 수 있도록 reject하지 않고 돌려준다.
     *
     * @param method HTTP 메서드
     * @param url    요청 경로
     * @param body   JSON 본문, 없으면 생략
     * @returns {ok, status, data}로 풀리는 Promise
     */
    function api(method, url, body) {
        const options = { method: method };
        if (body !== undefined) {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify(body);
        }
        return fetch(url, options).then(function (res) {
            return res.text().then(function (text) {
                let data = null;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
                return { ok: res.ok, status: res.status, data: data };
            });
        });
    }

    /* ===================== 계획 주소 ===================== */

    /**
     * 계획 주소를 메모리와 localStorage에 저장한다.
     *
     * @param value 계획 공개 토큰
     */
    function saveToken(value) {
        token = value;
        storage.set(TOKEN_KEY, value);
    }

    /**
     * 이 브라우저의 계획 주소를 잊는다. 서버의 계획은 지우지 않는다.
     */
    function forgetToken() {
        token = null;
        plan = null;
        storage.remove(TOKEN_KEY);
    }

    /**
     * localStorage에서 형식이 맞는 계획 주소를 읽는다.
     *
     * @returns 계획 주소, 없거나 형식이 틀리면 null
     */
    function readToken() {
        const saved = storage.get(TOKEN_KEY);
        return saved && TOKEN_PATTERN.test(saved) ? saved : null;
    }

    /**
     * 공유 링크의 URL 해시(#토큰)에서 계획 주소를 가져와 저장하고 주소창에서 해시를 지운다.
     * 이미 저장된 다른 계획이 있으면 바꿀지 확인한다.
     */
    function importFromHash() {
        const raw = window.location.hash.replace('#', '');
        if (!TOKEN_PATTERN.test(raw)) return;
        history.replaceState(null, '', window.location.pathname);

        const existing = readToken();
        if (existing && existing !== raw &&
            !window.confirm('이 브라우저에 저장된 계획이 있어요.\n공유받은 계획으로 바꿀까요?\n(계획 주소를 복사해 두지 않았다면 기존 계획은 다시 열 수 없어요.)')) {
            return;
        }
        saveToken(raw);
        showToast('공유받은 계획을 불러왔어요');
    }

    /* ===================== 화면 전환 ===================== */

    /**
     * 불러오는 중 · 폼 · 계획 중 하나만 보여 준다.
     *
     * @param which 'setup' 또는 'plan', 그 외는 둘 다 숨김
     */
    function showOnly(which) {
        loadingEl.hidden = true;
        setupEl.hidden = which !== 'setup';
        planEl.hidden = which !== 'plan';
    }

    /**
     * 폼 오류 메시지를 보이거나 숨긴다.
     *
     * @param message 메시지, 비우면 숨긴다
     */
    function setError(message) {
        errorEl.textContent = message || '';
        errorEl.hidden = !message;
    }

    /**
     * 계획 만들기 · 조건 바꾸기 폼을 연다.
     *
     * @param isEdit true면 현재 계획 값을 채우고 바꾸기 모드로 연다
     */
    function openSetup(isEdit) {
        editing = isEdit;
        setError('');
        setupTitleEl.textContent = isEdit ? '조건 바꾸기' : '계획 만들기';
        submitBtn.textContent = isEdit ? '바꾸기' : '계획 만들기';
        cancelBtn.hidden = !isEdit;

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        targetEl.min = toIso(tomorrow);
        const limit = new Date();
        limit.setDate(limit.getDate() + 210);
        targetEl.max = toIso(limit);

        if (isEdit && plan) {
            roleEl.value = plan.role;
            targetEl.value = plan.targetDate;
            formEl.querySelectorAll('input[name="minutes"]').forEach(function (input) {
                input.checked = Number(input.value) === plan.dailyMinutes;
            });
            formEl.querySelectorAll('input[name="rest"]').forEach(function (input) {
                input.checked = plan.restWeekdays.indexOf(input.value) >= 0;
            });
        }
        showOnly('setup');
    }

    /**
     * 저장된 계획을 서버에서 불러와 화면에 그린다. 늦게 온 이전 응답은 버린다.
     *
     * @param show true면 응답 뒤 계획 화면으로 전환하고, false면 지금 보이는 화면을 그대로 둔다
     * @returns 끝나면 풀리는 Promise
     */
    function loadPlan(show) {
        if (!token) return Promise.resolve();
        const seq = ++loadSeq;
        return api('GET', API + '/' + token).then(function (res) {
            if (seq !== loadSeq) return;
            if (res.status === 404) {
                forgetToken();
                showToast('저장된 계획을 찾을 수 없어요');
                openSetup(false);
                return;
            }
            if (!res.ok || !res.data) {
                showLoadError('계획을 불러오지 못했어요. 새로고침해서 다시 시도해 주세요.');
                return;
            }
            plan = res.data;
            renderPlan();
            if (show) showOnly('plan');
        }).catch(function () {
            if (seq === loadSeq) showLoadError('네트워크 오류로 계획을 불러오지 못했어요. 새로고침해서 다시 시도해 주세요.');
        });
    }

    /**
     * 불러오기 실패 안내만 보여 준다.
     *
     * @param message 안내 문구
     */
    function showLoadError(message) {
        loadingEl.textContent = message;
        showOnly('none');
        loadingEl.hidden = false;
    }

    /**
     * 폼 입력값을 API 요청 본문으로 읽는다.
     *
     * @returns 직무, 면접일, 쉬는 요일, 하루 학습 시간
     */
    function readForm() {
        const minutes = formEl.querySelector('input[name="minutes"]:checked');
        const rest = [];
        formEl.querySelectorAll('input[name="rest"]:checked').forEach(function (input) {
            rest.push(input.value);
        });
        return {
            role: roleEl.value,
            targetDate: targetEl.value,
            restWeekdays: rest,
            dailyMinutes: minutes ? Number(minutes.value) : null
        };
    }

    /**
     * 폼을 제출해 계획을 만들거나 조건을 바꾼다.
     *
     * @param event submit 이벤트
     */
    function submitForm(event) {
        event.preventDefault();
        const body = readForm();
        if (!body.targetDate) {
            setError('면접 날짜를 선택해 주세요.');
            return;
        }
        setError('');
        submitBtn.disabled = true;

        const request = editing
            ? api('PATCH', API + '/' + token, body)
            : api('POST', API, body);
        request.then(function (res) {
            submitBtn.disabled = false;
            if (editing && res.status === 404) {
                forgetToken();
                showToast('저장된 계획을 찾을 수 없어요');
                openSetup(false);
                return;
            }
            if (!res.ok) {
                setError(res.data && res.data.message ? res.data.message : '저장하지 못했어요. 입력을 확인해 주세요.');
                return;
            }
            if (editing) {
                editing = false;
                plan = res.data;
                renderPlan();
                showOnly('plan');
                showToast('조건을 바꿨어요');
            } else {
                saveToken(res.data.token);
                loadPlan(true);
            }
        }).catch(function () {
            submitBtn.disabled = false;
            setError('네트워크 오류가 났어요. 잠시 뒤 다시 시도해 주세요.');
        });
    }

    /**
     * 오늘 질문 하나의 답변을 기록하고 계획을 다시 불러온다.
     *
     * @param task    기록할 질문
     * @param body    keywordMask 또는 selfRating
     * @param buttons 요청 중 비활성화할 버튼들
     */
    function recordAnswer(task, body, buttons) {
        buttons.forEach(function (btn) { btn.disabled = true; });
        body.questionId = task.id;
        api('POST', API + '/' + token + '/answers', body).then(function (res) {
            if (!res.ok) {
                buttons.forEach(function (btn) { btn.disabled = false; });
                showToast(res.data && res.data.message ? res.data.message : '기록하지 못했어요');
                return;
            }
            showToast('기록했어요');
            loadPlan(false);
        }).catch(function () {
            buttons.forEach(function (btn) { btn.disabled = false; });
            showToast('네트워크 오류가 났어요');
        });
    }

    /* ===================== 계획 화면 ===================== */

    /**
     * 요약, 오늘 할 일, 약한 과목, 달력을 모두 다시 그린다.
     */
    function renderPlan() {
        renderSummary();
        renderToday();
        renderWeak();
        renderCalendar();
    }

    /**
     * D-day와 직무 · 기간 · 진행 상황을 그린다.
     */
    function renderSummary() {
        document.getElementById('interview-dday').textContent = plan.daysLeft === 0 ? 'D-DAY' : 'D-' + plan.daysLeft;
        document.getElementById('interview-meta').textContent =
            ROLE_TEXT[plan.role] + ' · 하루 ' + plan.dailyMinutes + '분 · ' + monthDay(plan.startDate) + ' ~ ' +
            monthDay(plan.targetDate) + ' 면접';

        let total = 0;
        let done = 0;
        plan.days.forEach(function (day) {
            total += day.total;
            done += day.done;
        });
        document.getElementById('interview-progress').textContent =
            total > 0 ? '지금까지 ' + done + ' / ' + total + '문제를 풀었어요' : '';
    }

    /**
     * 오늘 풀 질문이 없을 때 보여 줄 안내 문구를 고른다.
     *
     * @returns 안내 문구
     */
    function todayNote() {
        if (plan.todayType === 'REST') return '오늘은 쉬는 날이에요. 푹 쉬고 내일 이어서 해요.';
        if (plan.todayType === 'REVIEW') return '아직 보충할 질문이 없어요. 답변이 쌓이면 약한 부분을 여기에 채워 드려요.';
        if (plan.todayType) return '오늘 풀 질문이 없어요.';
        if (plan.today < plan.startDate) return monthDay(plan.startDate) + '부터 시작해요.';
        if (plan.today === plan.targetDate) return '오늘이 면접일이에요. 지금까지 한 만큼 충분해요. 잘 다녀오세요!';
        return '면접일이 지났어요. 새 계획을 만들려면 아래에서 조건을 바꿔 주세요.';
    }

    /**
     * 오늘 할 일(질문 카드 목록)을 그린다.
     */
    function renderToday() {
        const typeEl = document.getElementById('interview-today-type');
        const noteEl = document.getElementById('interview-today-note');
        const listEl = document.getElementById('interview-tasks');
        clear(listEl);

        typeEl.textContent = plan.todayType ? DAY_TYPE_TEXT[plan.todayType] : '';
        if (plan.todayTasks.length === 0) {
            noteEl.textContent = todayNote();
            noteEl.hidden = false;
            return;
        }
        noteEl.hidden = true;
        plan.todayTasks.forEach(function (task, index) {
            listEl.appendChild(buildTask(task, index));
        });
    }

    /**
     * 질문 카드 하나를 만든다. 답변 보기를 누르면 모범 답변과 기록 폼이 열린다.
     *
     * @param task  오늘 풀 질문
     * @param index 목록에서의 순서(요소 ID용)
     * @returns 질문 카드
     */
    function buildTask(task, index) {
        const card = el('article', 'interview-task' + (task.done ? ' is-done' : ''));

        const head = el('div', 'interview-task__head');
        head.appendChild(el('span', 'interview-task__subject', subjectName(task.subject)));
        if (task.done) head.appendChild(el('span', 'interview-task__done', '기록 완료'));
        card.appendChild(head);
        card.appendChild(el('h3', 'interview-task__question', task.question));

        const toggle = el('button', 'interview-btn interview-task__toggle', '답변 보기');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', 'interview-answer-' + index);
        card.appendChild(toggle);

        const answer = el('div', 'interview-task__answer');
        answer.id = 'interview-answer-' + index;
        answer.hidden = true;
        answer.appendChild(el('p', 'interview-task__answer-text', task.answer));
        if (SLUG_PATTERN.test(task.subject) && SLUG_PATTERN.test(task.topicSlug)) {
            const link = el('a', 'interview-task__link', '관련 토픽 보기');
            link.href = '/' + task.subject + '/' + task.topicSlug;
            answer.appendChild(link);
        }
        if (!task.done) answer.appendChild(buildAnswerForm(task));
        card.appendChild(answer);

        toggle.addEventListener('click', function () {
            answer.hidden = !answer.hidden;
            toggle.textContent = answer.hidden ? '답변 보기' : '답변 접기';
            toggle.setAttribute('aria-expanded', answer.hidden ? 'false' : 'true');
        });
        return card;
    }

    /**
     * 답변 기록 폼을 만든다. 키워드가 있으면 체크박스, 없으면 자기 평가 버튼이다.
     *
     * @param task 오늘 풀 질문
     * @returns 기록 폼
     */
    function buildAnswerForm(task) {
        const box = el('div', 'interview-task__form');
        const buttons = [];

        if (task.keywords.length > 0) {
            box.appendChild(el('p', 'interview-task__prompt', '내 답변에 들어 있던 핵심 키워드를 체크하세요'));
            const choices = el('div', 'interview-choices');
            const inputs = [];
            task.keywords.forEach(function (keyword) {
                const label = el('label', 'interview-choice');
                const input = document.createElement('input');
                input.type = 'checkbox';
                inputs.push(input);
                label.appendChild(input);
                label.appendChild(el('span', 'interview-choice__text', keyword));
                choices.appendChild(label);
            });
            box.appendChild(choices);

            const save = el('button', 'interview-btn interview-btn--primary', '기록하기');
            save.type = 'button';
            buttons.push(save);
            save.addEventListener('click', function () {
                let mask = 0;
                inputs.forEach(function (input, index) {
                    if (input.checked) mask += Math.pow(2, index);
                });
                recordAnswer(task, { keywordMask: mask }, buttons);
            });
            const actions = el('div', 'interview-actions');
            actions.appendChild(save);
            box.appendChild(actions);
            return box;
        }

        box.appendChild(el('p', 'interview-task__prompt', '답변을 보기 전에 얼마나 알고 있었나요?'));
        const actions = el('div', 'interview-actions');
        RATINGS.forEach(function (rating) {
            const btn = el('button', 'interview-btn', rating.text);
            btn.type = 'button';
            buttons.push(btn);
            btn.addEventListener('click', function () {
                recordAnswer(task, { selfRating: rating.value }, buttons);
            });
            actions.appendChild(btn);
        });
        box.appendChild(actions);
        return box;
    }

    /**
     * 약한 과목과 뺀 질문 수 안내를 그린다.
     */
    function renderWeak() {
        const noteEl = document.getElementById('interview-weak-note');
        const listEl = document.getElementById('interview-weak');
        clear(listEl);

        if (plan.weakSubjects.length === 0) {
            noteEl.textContent = '아직 답변이 쌓이지 않았어요. 답변이 쌓이면 약한 과목을 알려 드려요.';
        } else {
            noteEl.textContent = '약점 보충일에 이 과목의 질문을 먼저 다시 풀어요.';
            plan.weakSubjects.forEach(function (slug) {
                listEl.appendChild(el('span', 'interview-weak__item', subjectName(slug)));
            });
        }
        if (plan.droppedCount > 0) {
            noteEl.textContent += ' 밀린 질문이 많아 ' + plan.droppedCount + '문제는 이번 계획에서 뺐어요.';
        }
    }

    /**
     * 시작일부터 면접일까지의 달력을 그린다. 월요일 시작이다.
     */
    function renderCalendar() {
        const legendEl = document.getElementById('interview-legend');
        const calEl = document.getElementById('interview-calendar');
        clear(legendEl);
        clear(calEl);

        [['learn', '학습'], ['review', '약점 보충'], ['mock', '모의 면접 · 면접일'], ['rest', '휴식']].forEach(function (item) {
            legendEl.appendChild(el('span', 'interview-legend__item interview-legend__item--' + item[0], item[1]));
        });

        WEEKDAY_TEXT.forEach(function (name) {
            calEl.appendChild(el('div', 'interview-calendar__week', name));
        });

        const offset = (parseDate(plan.days[0].date).getDay() + 6) % 7;
        for (let i = 0; i < offset; i++) {
            calEl.appendChild(el('div', 'interview-day interview-day--empty'));
        }
        plan.days.forEach(function (day) {
            calEl.appendChild(buildDay(day.date, day.type.toLowerCase(), DAY_TYPE_TEXT[day.type],
                day.total > 0 ? day.done + '/' + day.total : '', day.date === plan.today));
        });
        calEl.appendChild(buildDay(plan.targetDate, 'dday', '면접', '', plan.targetDate === plan.today));
    }

    /**
     * 달력 칸 하나를 만든다.
     *
     * @param iso     날짜
     * @param type    칸 종류(learn, review, mock, rest, dday)
     * @param label   종류 이름
     * @param count   완료/문제 수, 없으면 빈 문자열
     * @param isToday 오늘이면 true
     * @returns 달력 칸
     */
    function buildDay(iso, type, label, count, isToday) {
        const cell = el('div', 'interview-day interview-day--' + type + (isToday ? ' is-today' : ''));
        cell.appendChild(el('span', 'interview-day__date', monthDay(iso)));
        cell.appendChild(el('span', 'interview-day__label', label));
        if (count) cell.appendChild(el('span', 'interview-day__count', count));
        return cell;
    }

    /* ===================== 버튼 ===================== */
    formEl.addEventListener('submit', submitForm);

    cancelBtn.addEventListener('click', function () {
        editing = false;
        showOnly('plan');
    });

    document.getElementById('interview-edit').addEventListener('click', function () {
        openSetup(true);
    });

    document.getElementById('interview-copy').addEventListener('click', function () {
        const link = window.location.origin + window.location.pathname + '#' + token;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(function () {
                showToast('계획 주소를 복사했어요');
            }).catch(function () {
                window.prompt('이 주소를 복사해 두세요', link);
            });
        } else {
            window.prompt('이 주소를 복사해 두세요', link);
        }
    });

    document.getElementById('interview-forget').addEventListener('click', function () {
        if (!window.confirm('이 브라우저에서 계획을 해제할까요?\n계획 주소를 복사해 두지 않았다면 다시 열 수 없어요.')) return;
        loadSeq++;
        forgetToken();
        openSetup(false);
    });

    /* ===================== 시작 ===================== */
    importFromHash();
    token = token || readToken();
    if (token) {
        loadPlan(true);
    } else {
        openSetup(false);
    }
})();