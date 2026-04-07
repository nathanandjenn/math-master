
// Game Config
const CONFIG = {
    minFactor: 2,
    maxFactor: 9,
    questionDuration: 4000,
    sessionDuration: 600000, // 10 minutes in ms
};

// State
// State
let state = {
    currentUser: 'Player',
    users: {}, // { "Name": { sessions: [], bestStreak: 0 } }
    apiBase: window.location.hostname === 'localhost' ? 'http://localhost:8080' : '', // Cloud Run URL will be injected or relative


    isPlaying: false,
    isPaused: false,
    score: 0,
    streak: 0,
    bestStreak: 0,
    currentQuestion: null,

    // Time Tracking
    questionStartTime: 0,
    questionRemaining: 0, // for pause logic

    sessionEndTime: 0,
    sessionDurationRemaining: 0, // for pause logic

    timerId: null, // Animation frame for bar
    logicTimeout: null, // Question timeout
    sessionTimerId: null, // Session timeout

    deck: [],
    history: [],
    missedQuestions: new Set(),
};

// DOM Elements
const els = {
    restartBtn: document.getElementById('restart-btn'),

    pauseBtn: document.getElementById('pause-btn'),
    resumeBtn: document.getElementById('resume-btn'),

    endSessionBtn: document.getElementById('end-session-btn'),

    endSessionBtn: document.getElementById('end-session-btn'),

    modeSelection: document.getElementById('mode-selection'),
    startBtn: document.getElementById('start-btn'),


    score: document.getElementById('score'),
    streak: document.getElementById('streak'),
    factorA: document.getElementById('factor-a'),
    factorB: document.getElementById('factor-b'),
    input: document.getElementById('answer-input'),
    form: document.getElementById('answer-form'),
    timerBar: document.getElementById('timer-bar'),

    feedbackOverlay: document.getElementById('feedback-overlay'),
    feedbackTitle: document.getElementById('feedback-title'),
    feedbackAnswer: document.getElementById('feedback-answer'),
    questionText: document.getElementById('question'),
    gameCard: document.querySelector('.game-card:not(#report-card)'),

    reportCard: document.getElementById('report-card'),
    reportTotal: document.getElementById('report-total'),
    reportAccuracy: document.getElementById('report-accuracy'),
    reportTime: document.getElementById('report-time'),

    reportUsername: document.getElementById('report-username'),
    historySessions: document.getElementById('history-sessions'),
    historyBestStreak: document.getElementById('history-best-streak'),
    historyTotalScore: document.getElementById('history-total-score'),

    missedList: document.getElementById('missed-list'),
};

// --- User Management ---



// --- User Management (Simplified) ---

function loadData() {
    const data = localStorage.getItem('mathMaster_data');
    if (data) {
        const parsed = JSON.parse(data);
        state.users = parsed.users || {};
        // Ensure default player exists
        if (!state.users['Player']) {
            state.users['Player'] = { sessions: [], bestStreak: 0 };
        }
    } else {
        // Init default
        state.users = { 'Player': { sessions: [], bestStreak: 0 } };
    }
}

function saveData() {
    const data = {
        users: state.users,
        lastUser: 'Player'
    };
    localStorage.setItem('mathMaster_data', JSON.stringify(data));

    // Also send to backend
    if (state.currentUser && state.users[state.currentUser]) {
        fetch(`${state.apiBase}/api/stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user: state.currentUser,
                stats: state.users[state.currentUser].sessions[state.users[state.currentUser].sessions.length - 1]
            })
        }).catch(err => console.error('Failed to sync with backend:', err));
    }
}

// --- Deck Logic (Now via Backend) ---

async function fetchDeck() {
    try {
        const response = await fetch(`${state.apiBase}/api/deck`);
        const data = await response.json();
        return data.deck;
    } catch (error) {
        console.error('Failed to fetch deck from backend, using local generator:', error);
        return createDeck(); // Fallback to local logic if server is down
    }
}

function createDeck() {
    let deck = [];
    for (let i = CONFIG.minFactor; i <= CONFIG.maxFactor; i++) {
        for (let j = CONFIG.minFactor; j <= CONFIG.maxFactor; j++) {
            deck.push({ a: i, b: j });
        }
    }
    // Add extra copy of 7s and 9s
    for (let i = CONFIG.minFactor; i <= CONFIG.maxFactor; i++) {
        for (let j = CONFIG.minFactor; j <= CONFIG.maxFactor; j++) {
            if (i === 7 || i === 9 || j === 7 || j === 9) {
                deck.push({ a: i, b: j });
            }
        }
    }
    return shuffle(deck);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getNextQuestion() {
    if (state.deck.length === 0) state.deck = createDeck();
    const q = state.deck.shift();
    const flip = Math.random() > 0.5;
    return {
        key: `${q.a}x${q.b}`,
        a: flip ? q.b : q.a,
        b: flip ? q.a : q.b,
        answer: q.a * q.b
    };
}

// --- Game Control ---

function startGame() {
    state.isPlaying = true;
    state.isPaused = false;
    state.score = 0;
    state.streak = 0;
    state.history = [];
    state.missedQuestions.clear();

    // Fetch deck from backend
    fetchDeck().then(deck => {
        state.deck = deck;

        els.score.innerText = '0';
        els.streak.innerText = '0';
        els.gameCard.classList.remove('hidden');
        els.reportCard.classList.add('hidden');
        els.modeSelection.classList.add('hidden');
        els.input.value = '';

        els.input.placeholder = "";
        els.input.disabled = false;
        els.input.style.border = "";

        // Start Session Timer
        state.sessionDurationRemaining = CONFIG.sessionDuration;
        startSessionTimer(state.sessionDurationRemaining);

        nextQuestion();
    });
}

// --- Speech Recognition Removed ---

function startSessionTimer(duration) {
    clearTimeout(state.sessionTimerId);
    state.sessionEndTime = Date.now() + duration;
    state.sessionTimerId = setTimeout(endSession, duration);
}

function pauseGame() {
    if (!state.isPlaying || state.isPaused) return;
    state.isPaused = true;

    // 1. Pause Session Timer
    clearTimeout(state.sessionTimerId);
    state.sessionDurationRemaining = state.sessionEndTime - Date.now();

    // 2. Pause Question Timer
    clearTimeout(state.logicTimeout); // Stop timeout
    cancelAnimationFrame(state.timerId); // Stop animation frame
    state.questionRemaining = CONFIG.questionDuration - (Date.now() - state.questionStartTime);

    // Freeze UI Bar
    const computedStyle = window.getComputedStyle(els.timerBar);
    const transform = computedStyle.getPropertyValue('transform');
    els.timerBar.style.transform = transform;
    els.timerBar.style.transition = 'none';

    // Show Modal
    els.pauseModal.classList.add('active');
}

function resumeGame() {
    if (!state.isPlaying || !state.isPaused) return;
    state.isPaused = false;
    els.pauseModal.classList.remove('active');

    // Resume Session Timer
    startSessionTimer(state.sessionDurationRemaining);

    // Resume Question Timer
    state.questionStartTime = Date.now() - (CONFIG.questionDuration - state.questionRemaining); // Faked start time

    els.input.focus();

    // Resume Bar Animation
    // We need to move from CURRENT transform to scaleX(0) over REMAINING time.
    // However, CSS transition handles "from current computed style" automatically if we re-apply target.
    els.timerBar.style.transition = `transform ${state.questionRemaining}ms linear`;
    els.timerBar.style.transform = 'scaleX(0)';

    state.logicTimeout = setTimeout(handleTimeout, state.questionRemaining);
}

function endSession() {
    state.isPlaying = false;
    state.isPaused = false;
    clearTimeout(state.logicTimeout);
    clearTimeout(state.sessionTimerId);
    els.pauseModal.classList.remove('active');

    // Show Report
    els.gameCard.classList.add('hidden');
    els.reportCard.classList.remove('hidden');

    const total = state.history.length;
    const correct = state.history.filter(h => h.result === 'correct').length;
    const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);
    const avgTime = total === 0 ? 0 : Math.round(state.history.reduce((a, b) => a + b.time, 0) / total / 10) / 100;

    // Save Session to User Profile
    if (state.currentUser) {
        const sessionStats = {
            date: Date.now(),
            total,
            accuracy,
            avgTime,
            score: state.score
        };
        state.users[state.currentUser].sessions.push(sessionStats);

        // Update Best Streak if needed
        if (state.bestStreak > state.users[state.currentUser].bestStreak) {
            state.users[state.currentUser].bestStreak = state.bestStreak;
        }

        saveData();

        // Update History UI
        const userData = state.users[state.currentUser];
        els.reportUsername.innerText = state.currentUser;
        els.historySessions.innerText = userData.sessions.length;
        els.historyBestStreak.innerText = userData.bestStreak;

        const totalScore = userData.sessions.reduce((acc, sess) => acc + (sess.score || 0), 0);
        els.historyTotalScore.innerText = totalScore;
    }

    els.reportTotal.innerText = total;
    els.reportAccuracy.innerText = `${accuracy}%`;
    els.reportTime.innerText = `${avgTime}s`;

    els.missedList.innerHTML = '';
    if (state.missedQuestions.size === 0) {
        els.missedList.innerHTML = '<div class="empty-state">Perfect Score! 🎉</div>';
    } else {
        state.missedQuestions.forEach(key => {
            const div = document.createElement('div');
            div.className = 'missed-item';
            div.innerText = key;
            els.missedList.appendChild(div);
        });
    }
}

function nextQuestion() {
    if (!state.isPlaying) return;

    // Failsafe check
    if (state.sessionDurationRemaining <= 0) {
        endSession();
        return;
    }

    state.currentQuestion = getNextQuestion();

    els.factorA.innerText = state.currentQuestion.a;
    els.factorB.innerText = state.currentQuestion.b;
    els.input.value = '';
    els.input.focus();

    els.questionText.classList.remove('pop-in');
    void els.questionText.offsetWidth;
    els.questionText.classList.add('pop-in');

    startTimer();
}

function startTimer() {
    if (state.timerId) cancelAnimationFrame(state.timerId);
    clearTimeout(state.logicTimeout);

    state.questionStartTime = Date.now();
    const duration = CONFIG.questionDuration;

    els.timerBar.style.transition = 'none';
    els.timerBar.style.transform = 'scaleX(1)';
    void els.timerBar.offsetWidth;
    els.timerBar.style.transition = `transform ${duration}ms linear`;
    els.timerBar.style.transform = 'scaleX(0)';

    state.logicTimeout = setTimeout(handleTimeout, duration);
}

function stopTimer() {
    clearTimeout(state.logicTimeout);
    return Date.now() - state.questionStartTime;
}

function handleAnswer(e) {
    if (e) e.preventDefault();
    if (!state.isPlaying || state.isPaused) return;

    const val = parseInt(els.input.value);
    const timeTaken = stopTimer();

    const isCorrect = val === state.currentQuestion.answer;

    state.history.push({
        question: state.currentQuestion.key,
        result: isCorrect ? 'correct' : 'wrong',
        time: timeTaken / 1000
    });

    if (isCorrect) handleCorrect();
    else handleWrong(val);
}

function handleCorrect() {
    state.score++;
    state.streak++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;

    els.score.innerText = state.score;
    els.streak.innerText = state.streak;

    setTimeout(nextQuestion, 200);
}

function handleWrong(inputVal) {
    state.streak = 0;
    els.streak.innerText = 0;
    state.missedQuestions.add(state.currentQuestion.key);

    const [a, b] = state.currentQuestion.key.split('x').map(Number);
    state.deck.splice(3, 0, { a, b });

    els.gameCard = document.querySelector('.game-card:not(#report-card)');
    els.gameCard.classList.add('shake');
    setTimeout(() => els.gameCard.classList.remove('shake'), 500);

    showFeedback("The answer is...", `${state.currentQuestion.a} × ${state.currentQuestion.b} = ${state.currentQuestion.answer}`);
}

function handleTimeout() {
    if (state.isPaused) return; // Should catch this, but just in case

    state.streak = 0;
    els.streak.innerText = 0;
    state.history.push({
        question: state.currentQuestion.key,
        result: 'timeout',
        time: CONFIG.questionDuration / 1000
    });

    state.missedQuestions.add(state.currentQuestion.key);
    const [a, b] = state.currentQuestion.key.split('x').map(Number);
    state.deck.splice(3, 0, { a, b });

    showFeedback("Time's Up!", `${state.currentQuestion.a} × ${state.currentQuestion.b} = ${state.currentQuestion.answer}`);
}

function showFeedback(title, subtitle) {
    els.feedbackTitle.innerText = title;
    els.feedbackAnswer.innerText = subtitle;
    els.feedbackOverlay.classList.add('active');

    setTimeout(() => {
        els.feedbackOverlay.classList.remove('active');
        nextQuestion();
    }, 2000);
}

// Events
// els.startBtn.addEventListener('click', startGame); // Replaced by mode selection

// Event Handlers for Mode Selection
// Event Handlers
els.startBtn.addEventListener('click', startGame);

els.restartBtn.addEventListener('click', () => {
    // Return to start screen
    els.reportCard.classList.add('hidden');
    els.modeSelection.classList.remove('hidden');
});

els.pauseBtn.addEventListener('click', pauseGame);
els.resumeBtn.addEventListener('click', resumeGame);
els.endSessionBtn.addEventListener('click', endSession);

els.form.addEventListener('submit', handleAnswer);

els.input.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
});

document.addEventListener('click', (e) => {
    // Keep focus unless paused or on report page
    if (state.isPlaying && !state.isPaused
        && !els.feedbackOverlay.classList.contains('active')
        && !e.target.closest('button')) {
        els.input.focus();
    }
});

// Init
loadData();
// Set initial best streak for display
if (state.users['Player']) {
    state.bestStreak = state.users['Player'].bestStreak;
}
els.score.innerText = '0';
els.streak.innerText = '0';
// Ensure game card is visible (if it was hidden by default, but it's not)
// Just ready effectively. User clicks "Start Quiz" to begin.
