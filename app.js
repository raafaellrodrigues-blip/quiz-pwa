/* =============================================
   QUIZ IA — app.js  v4.1 (Otimizado Parallel Fetch)
   ============================================= */

const CONFIG = {
  TOTAL_QUESTIONS: 10,
  TIMER_SECONDS: 30,
  CHALLENGE_SECONDS: 15,
  AUTO_NEXT_DELAY: 2500,
  CACHE_KEY: 'quizia_cache_v4',
  CACHE_TTL_MS: 1000 * 60 * 60 * 6,
  LEADERBOARD_KEY: 'quizia_leaderboard_v2',
  STATS_KEY: 'quizia_stats_v2',
  STREAK_KEY: 'quizia_streak_v1',
  HISTORY_KEY: 'quizia_history_v1',
  BADGES_KEY: 'quizia_badges_v1',
  LAST_TOPIC_KEY: 'quizia_last_topic_v1',
  API_ENDPOINT: '/api/quiz',
  POINTS: { easy: 10, medium: 15, hard: 25 },
  COMBO_BONUS: 5,
  XP_PER_CORRECT: 20,
  XP_PER_GAME: 10,
  LEVELS: [
    { name: 'Iniciante',    min: 0,    icon: '🌱' },
    { name: 'Aprendiz',     min: 100,  icon: '📚' },
    { name: 'Estudante',    min: 250,  icon: '🎓' },
    { name: 'Conhecedor',   min: 500,  icon: '🔭' },
    { name: 'Especialista', min: 900,  icon: '⚡' },
    { name: 'Mestre',       min: 1400, icon: '🏆' },
    { name: 'Lenda',        min: 2000, icon: '🌟' },
  ],
  CATEGORY_BADGES: [
    { id: 'medico',     label: '🩺 Clínico Geral',   topics: ['Medicina','Enfermagem','Fisioterapia'], threshold: 7 },
    { id: 'tecno',      label: '💻 Dev Master',      topics: ['Programação','TI','Redes'],             threshold: 7 },
    { id: 'juridico',   label: '⚖️ Defensor',         topics: ['Direito','Concursos'],                 threshold: 7 },
    { id: 'cientista',  label: '🔬 Cientista',        topics: ['Física','Química','Biologia'],         threshold: 7 },
    { id: 'humanista',  label: '🌎 Humanista',        topics: ['História','Geografia','Filosofia'],    threshold: 7 },
    { id: 'matematico', label: '➗ Calculista',       topics: ['Matemática','R. Lógico'],              threshold: 7 },
    { id: 'poliglota',  label: '🗣️ Poliglota',        topics: ['Inglês','Espanhol','Português'],       threshold: 7 },
    { id: 'enem_ace',   label: '🎓 Craque do ENEM',  topics: ['ENEM','Vestibulares'],                 threshold: 8 },
    { id: 'perfecto',   label: '🏅 Perfeito',         topics: [], threshold: 10, special: 'perfect' },
    { id: 'streak7',    label: '🔥 7 Dias Seguidos', topics: [], threshold: 7,  special: 'streak'  },
  ],
  MOTIVATIONAL: [
    '💡 Dica: tente o modo Desafio para mais XP!',
    '🎯 Meta: acerte 80% e ganhe a conquista de precisão.',
    '🔥 Jogue todo dia para manter sua ofensiva!',
    '📚 Experimente temas diferentes para novas medalhas.',
    '⚡ No modo Rápido você ganha a conquista Relâmpago.',
    '🏆 Chegue ao nível Mestre com 1400 XP!',
    '🧠 Questões Difíceis valem 25 pts — vai encarar?',
  ],
};

let G = {
  mode: 'estudo',
  difficulty: 'misto',
  questions: [],
  idx: 0,
  score: 0,
  combo: 0,
  maxCombo: 0,
  correct: 0,
  answered: false,
  timer: null,
  autoNextTimer: null,
  autoNextTick: null,
  timeLeft: CONFIG.TIMER_SECONDS,
  xp: 0,
  level: 0,
  prevLevel: 0,
};

// ── AUXILIARES ────────────────────────────────
function shuffle(array) {
  let cur = array.length, rand;
  while (cur !== 0) {
    rand = Math.floor(Math.random() * cur);
    cur--;
    [array[cur], array[rand]] = [array[rand], array[cur]];
  }
  return array;
}

// ── BOOT ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  registerSW();
  monitorOffline();
  G.xp    = getStats().totalXP || 0;
  G.level = computeLevel(G.xp);
  G.prevLevel = G.level;
  updateStreak();

  document.getElementById('btn-leaderboard')?.addEventListener('click', showLeaderboard);
  document.getElementById('btn-progress')?.addEventListener('click', showProgress);

  setTimeout(boot, 200);
});

function boot() {
  animateLoading(
    ['Conectando com a IA...', 'Carregando sistema...', 'Pronto!'],
    () => {
      loadHomeStats();
      showLastTopicSuggestion();
      prefetchQuestions();
      showScreen('home');
    }
  );
}

function animateLoading(msgs, cb) {
  const bar = document.getElementById('loading-bar');
  const msg = document.getElementById('loading-msg');
  let step = 0;
  if (msg) msg.textContent = msgs[0];
  const iv = setInterval(() => {
    step++;
    if (bar) bar.style.width = Math.round((step / msgs.length) * 100) + '%';
    if (step < msgs.length && msg) msg.textContent = msgs[step];
    if (step >= msgs.length) { clearInterval(iv); setTimeout(cb, 350); }
  }, 480);
}

// ── MOTIVAÇÃO ─────────────────────────────────
function showMotivation() {
  const el = document.getElementById('home-motivation');
  if (!el) return;
  const tip = CONFIG.MOTIVATIONAL[Math.floor(Math.random() * CONFIG.MOTIVATIONAL.length)];
  el.textContent = tip;
  el.style.display = 'block';
}

// ── ÚLTIMO TEMA ───────────────────────────────
function showLastTopicSuggestion() {
  try {
    const last = JSON.parse(localStorage.getItem(CONFIG.LAST_TOPIC_KEY));
    if (!last) return;
    const el = document.getElementById('last-topic-hint');
    if (!el) return;
    el.innerHTML = 'Continuar em <strong>' + last.icon + ' ' + last.label + '</strong>?';
    el.style.display = 'flex';
    el.onclick = () => {
      if (window.selectTopic) window.selectTopic(last.icon, last.label, last.key);
      el.style.display = 'none';
    };
  } catch(e) {}
}

// ── PREFETCH ──────────────────────────────────
function prefetchQuestions() {
  const key = CONFIG.CACHE_KEY + '_misto_Aleatório';
  if (getCached(key)) return;
  setTimeout(() => {
    fetchQuestions('misto', 'Aleatório').then(qs => {
      if (qs && qs.length) setCache(key, qs);
    }).catch(() => {});
  }, 2500);
}

// ── NAVEGAÇÃO ─────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
}

function goHome() {
  closeModal();
  if (G.timer) clearInterval(G.timer);
  if (G.autoNextTimer) clearTimeout(G.autoNextTimer);
  if (G.autoNextTick) clearInterval(G.autoNextTick);
  loadHomeStats();
  showScreen('home');
}

function confirmExit() { document.getElementById('modal-exit').style.display = 'flex'; }
function closeModal()  { document.getElementById('modal-exit').style.display = 'none';  }

function selectMode(el, mode) {
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  G.mode = mode;
  const hint = document.getElementById('start-hint');
  if (mode === 'desafio')     hint.textContent = '10 perguntas • 15s por questão • modo hardcore';
  else if (mode === 'rapido') hint.textContent = '10 perguntas • 30s por questão';
  else                        hint.textContent = '10 perguntas • avança automático após resposta';
}

function selectDiff(el, diff) {
  document.querySelectorAll('.diff-pill').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  G.difficulty = diff;
}

// ── INÍCIO ────────────────────────────────────
async function startGame() {
  const btn   = document.getElementById('btn-start');
  const label = document.getElementById('btn-start-label');
  const hint  = document.getElementById('start-hint');

  btn.disabled = true;
  showSkeletonLoading(label, hint);

  try {
    const topicObj = window.getSelectedTopic ? window.getSelectedTopic() : { icon:'🎲', label:'Aleatório', key:'Aleatório' };
    const tema = topicObj.label;

    try { localStorage.setItem(CONFIG.LAST_TOPIC_KEY, JSON.stringify(topicObj)); } catch(e) {}

    const qs = await fetchQuestions(G.difficulty, tema);
    Object.assign(G, {
      questions: qs, idx: 0, score: 0, combo: 0,
      maxCombo: 0, correct: 0, answered: false,
      prevLevel: G.level,
    });
    hideSkeletonLoading(label, hint);
    showScreen('quiz');
    renderQuestion();
  } catch (err) {
    console.error(err);
    hideSkeletonLoading(label, hint);
    hint.textContent  = '❌ Erro no carregamento. Tente novamente.';
    label.textContent = 'Tentar novamente';
    btn.disabled = false;
  }
}

// ── SKELETON / LOADING DA IA ──────────────────
let skeletonInterval = null;
const skeletonMsgs = [
  'Conectando com a IA... 🧠',
  'Gerando questões rápidas... ✨',
  'Processando em paralelo... ⚡',
  'Quase pronto... 🚀'
];

function showSkeletonLoading(label, hint) {
  const overlay = document.getElementById('ai-loading-overlay');
  if (overlay) overlay.style.display = 'flex';
  let msgIdx = 0;
  label.textContent = skeletonMsgs[0];
  hint.textContent  = 'Gerando de forma otimizada...';
  skeletonInterval = setInterval(() => {
    msgIdx = (msgIdx + 1) % skeletonMsgs.length;
    label.textContent = skeletonMsgs[msgIdx];
    const bar = document.getElementById('ai-loading-bar');
    if (bar) {
      const cur = parseFloat(bar.style.width) || 0;
      bar.style.width = Math.min(90, cur + Math.random() * 20) + '%';
    }
  }, 800);
}

function hideSkeletonLoading(label, hint) {
  clearInterval(skeletonInterval);
  const overlay = document.getElementById('ai-loading-overlay');
  if (overlay) {
    const bar = document.getElementById('ai-loading-bar');
    if (bar) bar.style.width = '100%';
    setTimeout(() => { overlay.style.display = 'none'; if(bar) bar.style.width = '0%'; }, 300);
  }
  label.textContent = 'Gerar Quiz com IA';
  hint.textContent  = '10 perguntas • novas a cada partida';
}

// ── CACHE / FETCH PARALELO ───────────────────
async function fetchQuestions(diff, tema) {
  tema = tema || 'Aleatório';
  const key = CONFIG.CACHE_KEY + '_' + diff + '_' + tema;
  const cached = getCached(key);
  if (cached && cached.length >= CONFIG.TOTAL_QUESTIONS) { 
    console.log('Cache hit:', diff, tema); 
    return shuffle(cached).slice(0, CONFIG.TOTAL_QUESTIONS); 
  }

  // Faz duas requisições simultâneas de 5 questões cada
  const fetchBatch = async () => {
    const res = await fetch(CONFIG.API_ENDPOINT + '?difficulty=' + diff + '&topic=' + encodeURIComponent(tema) + '&count=5');
    if (!res.ok) throw new Error('API Error: ' + res.status);
    const data = await res.json();
    return data.questions || [];
  };

  const results = await Promise.all([fetchBatch(), fetchBatch()]);
  const combined = [...results[0], ...results[1]];

  if (combined.length > 0) {
    setCache(key, combined);
  }

  return shuffle(combined).slice(0, CONFIG.TOTAL_QUESTIONS);
}

function getCached(key) {
  try {
    const r = localStorage.getItem(key);
    if (!r) return null;
    const parsed = JSON.parse(r);
    if (Date.now() - parsed.ts > CONFIG.CACHE_TTL_MS) { localStorage.removeItem(key); return null; }
    return parsed.data;
  } catch { return null; }
}

function setCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); }
  catch(e) { console.warn('Cache cheio', e); }
}

// ── RENDER QUESTÃO ────────────────────────────
function renderQuestion() {
  const q = G.questions[G.idx];
  if (!q) { showResults(); return; }

  G.answered = false;
  if (G.timer) clearInterval(G.timer);
  if (G.autoNextTimer) clearTimeout(G.autoNextTimer);
  if (G.autoNextTick) clearInterval(G.autoNextTick);

  const pct = Math.round(((G.idx + 1) / CONFIG.TOTAL_QUESTIONS) * 100);
  document.getElementById('q-progress').style.width = pct + '%';
  document.getElementById('q-counter').textContent  = (G.idx + 1) + '/' + CONFIG.TOTAL_QUESTIONS;
  document.getElementById('live-score').textContent  = G.score;
  renderXPBar();

  document.getElementById('q-cat').textContent = q.category || 'Geral';
  const diffEl = document.getElementById('q-diff');
  diffEl.textContent = q.difficulty || 'Médio';
  diffEl.className   = 'q-diff ' + ({ 'Fácil': 'easy', 'Médio': 'medium', 'Difícil': 'hard' }[q.difficulty] || 'medium');

  document.getElementById('q-text').textContent = q.question;
  document.getElementById('explanation-box').style.display = 'none';
  document.getElementById('explanation-box').innerHTML     = '';
  document.getElementById('combo-toast').className         = 'combo-toast';
  document.getElementById('combo-toast').textContent       = '';
  const pf = document.getElementById('pts-flash');
  if (pf) { pf.textContent = ''; pf.className = 'pts-flash'; }

  const oldBtn = document.getElementById('btn-next');
  const newBtn = oldBtn.cloneNode(false);
  newBtn.style.display = 'none';
  newBtn.innerHTML = 'Próxima <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
  newBtn.addEventListener('click', nextQuestion);
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);

  const list = document.getElementById('options-list');
  list.innerHTML = '';
  ['A','B','C','D'].forEach((letter, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = '<span class="opt-letter">' + letter + '</span><span class="opt-text">' + (q.options[i] || '') + '</span>';
    btn.addEventListener('click', () => selectAnswer(i));
    list.appendChild(btn);
  });

  const tw = document.getElementById('timer-wrap');
  if (G.mode === 'rapido' || G.mode === 'desafio') {
    const timerSecs = G.mode === 'desafio' ? CONFIG.CHALLENGE_SECONDS : CONFIG.TIMER_SECONDS;
    tw.style.display = 'block';
    G.timeLeft = timerSecs;
    updateRing(G.timeLeft, timerSecs);
    G.timer = setInterval(() => {
      G.timeLeft--;
      updateRing(G.timeLeft, timerSecs);
      if (G.timeLeft <= 0) { clearInterval(G.timer); autoTimeout(); }
    }, 1000);
  } else {
    tw.style.display = 'none';
  }
}

function renderXPBar() {
  const lvl   = CONFIG.LEVELS[G.level];
  const next  = CONFIG.LEVELS[G.level + 1];
  const start = lvl.min;
  const end   = next ? next.min : start + 500;
  const pct   = Math.min(100, Math.round(((G.xp - start) / (end - start)) * 100));
  const bar   = document.getElementById('xp-bar-fill');
  const lbl   = document.getElementById('xp-level-label');
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = lvl.icon + ' ' + lvl.name + '  •  ' + G.xp + ' XP';
}

function updateRing(cur, total) {
  const circ = 94.25;
  const ring = document.getElementById('ring-fill');
  if (ring) {
    ring.style.strokeDasharray = Math.max(0, Math.round(circ * cur / total)) + ' ' + circ;
    ring.classList.toggle('warn', cur <= 5);
  }
  const timerNum = document.getElementById('timer-num');
  if (timerNum) timerNum.textContent = cur;
}

// ── RESPOSTA ──────────────────────────────────
function selectAnswer(idx) {
  if (G.answered) return;
  G.answered = true;
  if (G.timer) clearInterval(G.timer);

  const q    = G.questions[G.idx];
  const btns = document.querySelectorAll('.option-btn');
  btns.forEach(b => { b.disabled = true; });

  const ok      = idx === q.correct;
  const diffPts = { 'Fácil': CONFIG.POINTS.easy, 'Médio': CONFIG.POINTS.medium, 'Difícil': CONFIG.POINTS.hard };
  const base    = diffPts[q.difficulty] || CONFIG.POINTS.medium;

  if (btns[q.correct]) btns[q.correct].classList.add('correct');
  if (!ok && btns[idx]) btns[idx].classList.add('wrong');

  if (ok) {
    G.combo++;
    G.correct++;
    if (G.combo > G.maxCombo) G.maxCombo = G.combo;
    const bonus  = (G.combo - 1) * CONFIG.COMBO_BONUS;
    const earned = base + bonus;
    G.score += earned;
    G.xp    += CONFIG.XP_PER_CORRECT;
    const newLevel = computeLevel(G.xp);
    if (newLevel > G.level) {
      G.level = newLevel;
      showLevelUp(newLevel);
    } else {
      G.level = newLevel;
    }
    showPtsFlash('+' + earned, true);
    if (G.combo >= 2) showComboToast(G.combo, earned);
  } else {
    G.combo = 0;
    showPtsFlash('✗', false);
  }

  document.getElementById('live-score').textContent = G.score;
  showExplanation(ok, q.explanation, q.options[q.correct]);

  const btnNext = document.getElementById('btn-next');
  btnNext.style.display = 'flex';

  if (G.mode === 'estudo') {
    let countdown = Math.round(CONFIG.AUTO_NEXT_DELAY / 1000);
    const updateLabel = () => {
      btnNext.innerHTML = 'Próxima (' + countdown + 's) <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
    };
    updateLabel();
    G.autoNextTick = setInterval(() => {
      countdown--;
      if (countdown > 0) updateLabel();
      else clearInterval(G.autoNextTick);
    }, 1000);
    G.autoNextTimer = setTimeout(() => {
      clearInterval(G.autoNextTick);
      nextQuestion();
    }, CONFIG.AUTO_NEXT_DELAY);
  }
}

function autoTimeout() {
  if (G.answered) return;
  G.answered = true;
  const q = G.questions[G.idx];
  document.querySelectorAll('.option-btn').forEach((b, i) => {
    b.disabled = true;
    if (i === q.correct) b.classList.add('correct');
  });
  G.combo = 0;
  showExplanation(false, q.explanation, q.options[q.correct], true);
  document.getElementById('btn-next').style.display = 'flex';
}

function showExplanation(ok, text, correctOption, timeout) {
  const box = document.getElementById('explanation-box');
  box.className = 'explanation-box ' + (ok ? 'correct-exp' : 'wrong-exp');
  const icon  = ok ? '✓' : timeout ? '⏱' : '✗';
  const label = ok ? 'Correto!' : timeout ? 'Tempo esgotado!' : 'Incorreto!';
  const color = ok ? 'var(--green)' : 'var(--red)';
  const parts    = (text || '').split(/(?<=[.!?])\s+/);
  const headline = parts[0] || text || '';
  const detail   = parts.slice(1).join(' ');
  box.innerHTML =
    '<div class="exp-header">' +
      '<span class="exp-status" style="color:' + color + '">' + icon + ' ' + label + '</span>' +
      (!ok && !timeout ? '<span class="exp-correct-lbl">Resposta certa: <strong>' + correctOption + '</strong></span>' : '') +
    '</div>' +
    '<p class="exp-headline">' + headline + '</p>' +
    (detail ? '<p class="exp-detail">' + detail + '</p>' : '');
  box.style.display = 'block';
}

// ── LEVEL UP TOAST ────────────────────────────
function showLevelUp(newLv) {
  const lvl = CONFIG.LEVELS[newLv];
  const el = document.getElementById('levelup-toast');
  if (!el) return;
  el.innerHTML = lvl.icon + ' Level Up! <strong>' + lvl.name + '</strong>';
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── CONFETE ───────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#7c6ff7','#3de88e','#f5c542','#ff5a5a','#ffffff'];
  const pieces = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -200,
    r: Math.random() * 7 + 3,
    d: Math.random() * 100 + 20,
    color: colors[Math.floor(Math.random() * colors.length)],
    tiltAngle: Math.random() * Math.PI * 2,
    tiltSpeed: Math.random() * 0.1 + 0.05,
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.tiltAngle += p.tiltSpeed;
      p.y += Math.cos(p.d / 30) * 1.5 + 2;
      p.x += Math.sin(frame / 25);
      ctx.beginPath();
      ctx.lineWidth = p.r / 2;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + Math.sin(p.tiltAngle) * p.r, p.y);
      ctx.lineTo(p.x, p.y + p.r);
      ctx.stroke();
    });
    frame++;
    if (frame < 140) requestAnimationFrame(draw);
    else { ctx.clearRect(0,0,canvas.width,canvas.height); canvas.style.display = 'none'; }
  }
  requestAnimationFrame(draw);
}

// ── EFEITOS VISUAIS ───────────────────────────
function showPtsFlash(text, ok) {
  const el = document.getElementById('pts-flash');
  if (!el) return;
  el.textContent = text;
  el.className   = 'pts-flash ' + (ok ? 'pts-ok' : 'pts-fail');
  void el.offsetHeight;
}

function showComboToast(combo, pts) {
  const labels = ['','','🔥 Combo!','⚡ Em Chama!','💥 Imparável!','🌟 Lendário!'];
  const msg    = combo < labels.length ? labels[combo] : '🌟 x' + combo;
  const el     = document.getElementById('combo-toast');
  if (!el) return;
  el.textContent = msg + '  ×' + combo + '  +' + pts + ' pts';
  el.className   = 'combo-toast show';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'combo-toast'; }, 2200);
}

// ── PRÓXIMA QUESTÃO ───────────────────────────
function nextQuestion() {
  if (G.autoNextTimer) { clearTimeout(G.autoNextTimer); G.autoNextTimer = null; }
  if (G.autoNextTick)  { clearInterval(G.autoNextTick); G.autoNextTick = null; }
  G.idx++;
  if (G.idx >= CONFIG.TOTAL_QUESTIONS) { showResults(); return; }
  const body = document.querySelector('.quiz-body');
  if (body) {
    body.style.transition = 'opacity .18s ease, transform .18s ease';
    body.style.opacity    = '0';
    body.style.transform  = 'translateX(28px)';
    setTimeout(() => {
      renderQuestion();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        body.style.transition = 'opacity .25s ease, transform .25s ease';
        body.style.opacity    = '1';
        body.style.transform  = 'translateX(0)';
        setTimeout(() => { body.style.transition = ''; }, 300);
      }));
    }, 200);
  } else {
    renderQuestion();
  }
}

// ── RESULTADOS ────────────────────────────────
function showResults() {
  const pct = Math.round((G.correct / CONFIG.TOTAL_QUESTIONS) * 100);
  G.xp   += CONFIG.XP_PER_GAME;
  G.level = computeLevel(G.xp);

  let emoji = '😅', title = 'Quase lá!', sub = 'Continue praticando!';
  if      (pct === 100) { emoji = '🏆'; title = 'Perfeito!';      sub = 'Nota 10! Desempenho impecável!'; }
  else if (pct >= 80)   { emoji = '🎉'; title = 'Muito bom!';     sub = 'Excelente! Está dominando!'; }
  else if (pct >= 60)   { emoji = '👍'; title = 'Bom trabalho!';  sub = 'No caminho certo. Continue!'; }
  else if (pct >= 40)   { emoji = '📚'; title = 'Pode melhorar!'; sub = 'A prática leva à perfeição!'; }

  document.getElementById('r-emoji').textContent   = emoji;
  document.getElementById('r-title').textContent   = title;
  document.getElementById('r-sub').textContent     = sub;
  document.getElementById('r-score').textContent   = G.score;
  document.getElementById('r-correct').textContent = G.correct + '/' + CONFIG.TOTAL_QUESTIONS;
  document.getElementById('r-combo').textContent   = G.maxCombo + 'x';
  document.getElementById('r-acc').textContent     = pct + '%';

  const rlv = document.getElementById('r-level');
  if (rlv) rlv.textContent = CONFIG.LEVELS[G.level].icon + ' ' + CONFIG.LEVELS[G.level].name;

  const tema = window.getSelectedTopic ? window.getSelectedTopic().label : 'Aleatório';
  saveHistory({ date: new Date().toLocaleDateString('pt-BR'), tema, mode: G.mode, correct: G.correct, total: CONFIG.TOTAL_QUESTIONS, score: G.score, pct });

  const newBadges    = checkCategoryBadges(tema, G.correct, pct);
  const achievements = computeAchievements(pct);

  document.getElementById('ach-list').innerHTML = [
    ...achievements.map(a => '<span class="ach-badge ' + (a.earned ? 'earned' : '') + '">' + a.label + '</span>'),
    ...newBadges.map(b => '<span class="ach-badge earned new-badge">' + b + ' <span class="badge-new">NOVO!</span></span>'),
  ].join('');

  saveScore(G.score, G.mode, pct);
  saveStats(G.correct, CONFIG.TOTAL_QUESTIONS, G.score, G.xp);
  showScreen('result');

  if (pct >= 80) setTimeout(launchConfetti, 400);
  if (G.level > G.prevLevel) setTimeout(() => showLevelUp(G.level), 900);

  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-start-label').textContent = 'Gerar Quiz com IA';
  document.getElementById('start-hint').textContent = '10 perguntas • novas a cada partida';
}

function computeAchievements(pct) {
  const streak = getStreak();
  return [
    { label: '🏅 Nota 10',        earned: pct === 100 },
    { label: '🔥 Combo x5',       earned: G.maxCombo >= 5 },
    { label: '⚡ Relâmpago',      earned: (G.mode === 'rapido' || G.mode === 'desafio') && pct >= 60 },
    { label: '💀 Desafio 15s',    earned: G.mode === 'desafio' && pct >= 50 },
    { label: '🎯 Precisão 80%',   earned: pct >= 80 },
    { label: '💪 3 Partidas',     earned: getTotalGames() >= 3 },
    { label: '🧠 Expert Difícil', earned: G.difficulty === 'dificil' && pct >= 70 },
    { label: '📚 Veterano',       earned: getTotalGames() >= 10 },
    { label: '🌟 500 XP',         earned: G.xp >= 500 },
    { label: '🔥 ' + streak + ' dias', earned: streak >= 3 },
  ];
}

// ── XP / NÍVEL ────────────────────────────────
function computeLevel(xp) {
  let lv = 0;
  CONFIG.LEVELS.forEach((l, i) => { if (xp >= l.min) lv = i; });
  return lv;
}

// ── STREAKS ───────────────────────────────────
function updateStreak() {
  try {
    const s = JSON.parse(localStorage.getItem(CONFIG.STREAK_KEY)) || { streak: 0, lastDate: null };
    const today     = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (s.lastDate === today) return;
    s.streak = (s.lastDate === yesterday) ? (s.streak || 0) + 1 : 1;
    s.lastDate = today;
    localStorage.setItem(CONFIG.STREAK_KEY, JSON.stringify(s));
  } catch(e) { console.warn('streak err', e); }
}

function getStreak() {
  try { return JSON.parse(localStorage.getItem(CONFIG.STREAK_KEY))?.streak || 0; }
  catch { return 0; }
}

// ── MEDALHAS POR CATEGORIA ────────────────────
function checkCategoryBadges(tema, correct, pct) {
  const earned = JSON.parse(localStorage.getItem(CONFIG.BADGES_KEY) || '[]');
  const newOnes = [];
  CONFIG.CATEGORY_BADGES.forEach(b => {
    if (earned.includes(b.id)) return;
    const qualifies = b.special === 'perfect' ? pct === 100
                    : b.special === 'streak'  ? getStreak() >= b.threshold
                    : b.topics.includes(tema) && correct >= b.threshold;
    if (qualifies) { earned.push(b.id); newOnes.push(b.label); }
  });
  if (newOnes.length) localStorage.setItem(CONFIG.BADGES_KEY, JSON.stringify(earned));
  return newOnes;
}

function getAllBadges() {
  const earned = JSON.parse(localStorage.getItem(CONFIG.BADGES_KEY) || '[]');
  return CONFIG.CATEGORY_BADGES.map(b => ({ ...b, earned: earned.includes(b.id) }));
}

// ── HISTÓRICO LOCAL ───────────────────────────
function saveHistory(entry) {
  try {
    const h = JSON.parse(localStorage.getItem(CONFIG.HISTORY_KEY) || '[]');
    h.unshift(entry);
    localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(h.slice(0, 50)));
  } catch(e) { console.warn('history err', e); }
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(CONFIG.HISTORY_KEY)) || []; }
  catch { return []; }
}

function showProgress() {
  const history = getHistory();
  const badges  = getAllBadges();
  const streak  = getStreak();

  const streakEl = document.getElementById('progress-streak');
  if (streakEl) streakEl.textContent = streak + ' dia' + (streak !== 1 ? 's' : '') + ' seguidos 🔥';

  const badgeList = document.getElementById('progress-badges');
  if (badgeList) {
    badgeList.innerHTML = badges.map(b =>
      '<span class="ach-badge ' + (b.earned ? 'earned' : '') + '">' + b.label + (b.earned ? '' : ' 🔒') + '</span>'
    ).join('');
  }

  const byTema = {};
  history.forEach(e => {
    if (!byTema[e.tema]) byTema[e.tema] = { total: 0, correct: 0 };
    byTema[e.tema].total   += e.total;
    byTema[e.tema].correct += e.correct;
  });
  const chartEl = document.getElementById('progress-chart');
  if (chartEl) {
    const sorted = Object.entries(byTema)
      .map(([tema, d]) => ({ tema, pct: Math.round((d.correct / d.total) * 100) }))
      .sort((a, b) => b.pct - a.pct).slice(0, 6);
    if (sorted.length) {
      chartEl.innerHTML = sorted.map(item =>
        '<div class="chart-row">' +
          '<span class="chart-label">' + item.tema + '</span>' +
          '<div class="chart-bar-wrap"><div class="chart-bar ' + (item.pct >= 70 ? 'good' : item.pct >= 40 ? 'ok' : 'bad') + '" style="width:' + item.pct + '%"></div></div>' +
          '<span class="chart-pct">' + item.pct + '%</span>' +
        '</div>'
      ).join('');
      chartEl.style.display = 'block';
    } else {
      chartEl.style.display = 'none';
    }
  }

  const list = document.getElementById('progress-list');
  if (list) {
    list.innerHTML = history.length
      ? history.map(e =>
          '<div class="history-row">' +
            '<div class="history-meta">' +
              '<span class="history-date">' + e.date + '</span>' +
              '<span class="history-tema">' + (e.tema || 'Aleatório') + '</span>' +
            '</div>' +
            '<div class="history-stats">' +
              '<span class="history-correct">' + e.correct + '/' + e.total + '</span>' +
              '<span class="history-score ' + (e.pct >= 70 ? 'good' : e.pct >= 40 ? 'ok' : 'bad') + '">' + e.pct + '%</span>' +
            '</div>' +
          '</div>'
        ).join('')
      : '<p class="lb-empty">Nenhuma partida ainda.</p>';
  }
  showScreen('progress');
}

// ── LEADERBOARD ───────────────────────────────
function saveScore(score, mode, acc) {
  const lb = getLeaderboard();
  lb.push({ score, mode, acc, date: new Date().toLocaleDateString('pt-BR') });
  lb.sort((a, b) => b.score - a.score);
  localStorage.setItem(CONFIG.LEADERBOARD_KEY, JSON.stringify(lb.slice(0, 20)));
}
function getLeaderboard() {
  try { return JSON.parse(localStorage.getItem(CONFIG.LEADERBOARD_KEY)) || []; }
  catch { return []; }
}
function showLeaderboard() {
  const lb     = getLeaderboard();
  const list   = document.getElementById('lb-list');
  const medals = ['gold','silver','bronze'];
  if (list) {
    list.innerHTML = lb.length
      ? lb.map((e, i) =>
          '<div class="lb-row">' +
            '<span class="lb-rank ' + (medals[i]||'') + '">' + (i+1) + '°</span>' +
            '<div style="flex:1">' +
              '<div class="lb-name">' + e.date + ' — ' + (e.mode==='rapido' ? '⚡ Rápido' : e.mode==='desafio' ? '💀 Desafio' : '📖 Estudo') + '</div>' +
              '<div class="lb-mode">' + e.acc + '% de precisão</div>' +
            '</div>' +
            '<span class="lb-score">' + e.score + ' pts</span>' +
          '</div>'
        ).join('')
      : '<p class="lb-empty">Nenhuma partida ainda.<br/>Jogue para aparecer no ranking!</p>';
  }
  showScreen('leaderboard');
}

// ── STATS ─────────────────────────────────────
function saveStats(correct, total, score, xp) {
  const s = getStats();
  s.totalGames    = (s.totalGames   ||0) + 1;
  s.totalCorrect  = (s.totalCorrect ||0) + correct;
  s.totalAnswered = (s.totalAnswered||0) + total;
  s.bestScore     = Math.max(s.bestScore||0, score);
  s.totalXP       = xp;
  localStorage.setItem(CONFIG.STATS_KEY, JSON.stringify(s));
}
function getStats() {
  try { return JSON.parse(localStorage.getItem(CONFIG.STATS_KEY)) || {}; }
  catch { return {}; }
}
function getTotalGames() { return getStats().totalGames || 0; }

function loadHomeStats() {
  const s      = getStats();
  const streak = getStreak();
  if (!s.totalGames) { showMotivation(); return; }
  const acc = s.totalAnswered ? Math.round((s.totalCorrect / s.totalAnswered) * 100) : 0;
  
  const recEl = document.getElementById('hs-record');
  if (recEl) recEl.textContent = s.bestScore || 0;
  
  const gamesEl = document.getElementById('hs-games');
  if (gamesEl) gamesEl.textContent = s.totalGames || 0;
  
  const accEl = document.getElementById('hs-acc');
  if (accEl) accEl.textContent = acc + '%';
  
  const lbl = document.getElementById('hs-level');
  if (lbl) lbl.textContent = CONFIG.LEVELS[G.level].icon + ' ' + CONFIG.LEVELS[G.level].name;
  
  const streakEl = document.getElementById('hs-streak');
  if (streakEl) {
    streakEl.textContent = streak + (streak >= 3 ? '🔥' : '');
    const streakParent = streakEl.closest('.hstat');
    if (streakParent) streakParent.style.display = streak > 0 ? '' : 'none';
  }
  const homeStats = document.getElementById('home-stats');
  if (homeStats) homeStats.style.display = 'flex';
  
  const motEl = document.getElementById('home-motivation');
  if (motEl) motEl.style.display = 'none';
}

// ── SERVICE WORKER + OFFLINE ──────────────────
function registerSW() {
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('/sw.js')
      .then(r => console.log('SW:', r.scope))
      .catch(e => console.warn('SW erro:', e));
}
function monitorOffline() {
  window.addEventListener('offline', () => console.log('Offline'));
  window.addEventListener('online', () => console.log('Online'));
}