/* =============================================
   QUIZ IA — app.js  v2.0
   Correções: avanço de perguntas, gamificação
   completa, XP, níveis, combo visual
   ============================================= */

const CONFIG = {
  TOTAL_QUESTIONS: 10,
  TIMER_SECONDS: 30,
  CACHE_KEY: 'quizia_cache_v3',
  CACHE_TTL_MS: 1000 * 60 * 60 * 6,
  LEADERBOARD_KEY: 'quizia_leaderboard_v2',
  STATS_KEY: 'quizia_stats_v2',
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
  timeLeft: CONFIG.TIMER_SECONDS,
  xp: 0,
  level: 0,
};

// ── BOOT ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  registerSW();
  monitorOffline();
  G.xp    = getStats().totalXP || 0;
  G.level = computeLevel(G.xp);

  const lbBtn = document.getElementById('btn-leaderboard');
  if (lbBtn) lbBtn.addEventListener('click', showLeaderboard);

  setTimeout(boot, 200);
});

function boot() {
  animateLoading(
    ['Conectando com a IA...', 'Carregando sistema...', 'Pronto!'],
    () => { loadHomeStats(); showScreen('home'); }
  );
}

function animateLoading(msgs, cb) {
  const bar = document.getElementById('loading-bar');
  const msg = document.getElementById('loading-msg');
  let step = 0;
  msg.textContent = msgs[0];
  const iv = setInterval(() => {
    step++;
    bar.style.width = Math.round((step / msgs.length) * 100) + '%';
    if (step < msgs.length) msg.textContent = msgs[step];
    if (step >= msgs.length) { clearInterval(iv); setTimeout(cb, 350); }
  }, 480);
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
  loadHomeStats();
  showScreen('home');
}

function confirmExit() { document.getElementById('modal-exit').style.display = 'flex'; }
function closeModal()  { document.getElementById('modal-exit').style.display = 'none';  }

function selectMode(el, mode) {
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  G.mode = mode;
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

  btn.disabled  = true;
  label.textContent = 'Gerando perguntas...';
  hint.textContent  = 'A IA está criando questões únicas ✨';

  try {
    const tema = window.getSelectedTopic ? window.getSelectedTopic().label : 'Aleatório';
    const qs = await fetchQuestions(G.difficulty, tema);
    Object.assign(G, { questions: qs, idx: 0, score: 0, combo: 0, maxCombo: 0, correct: 0, answered: false });
    showScreen('quiz');
    renderQuestion();
  } catch (err) {
    console.error(err);
    hint.textContent  = '❌ Erro. Verifique a API key no Vercel.';
    label.textContent = 'Tentar novamente';
    btn.disabled = false;
  }
}

// ── CACHE / FETCH ─────────────────────────────
async function fetchQuestions(diff, tema = 'Aleatório') {
  const key    = CONFIG.CACHE_KEY + '_' + diff + '_' + tema;
  const cached = getCached(key);
  if (cached) { console.log('Cache hit:', diff, tema); return shuffle(cached).slice(0, CONFIG.TOTAL_QUESTIONS); }

  const res = await fetch(CONFIG.API_ENDPOINT + '?difficulty=' + diff + '&topic=' + encodeURIComponent(tema));
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  setCache(key, data.questions);
  return shuffle(data.questions).slice(0, CONFIG.TOTAL_QUESTIONS);
}

function getCached(key) {
  try {
    const r = localStorage.getItem(key);
    if (!r) return null;
    const { ts, data } = JSON.parse(r);
    if (Date.now() - ts > CONFIG.CACHE_TTL_MS) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function setCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); }
  catch(e) { console.warn('cache cheio', e); }
}

// ── RENDER QUESTÃO ────────────────────────────
function renderQuestion() {
  const q = G.questions[G.idx];
  if (!q) { showResults(); return; }

  G.answered = false;
  if (G.timer) clearInterval(G.timer);

  // Progresso
  const pct = Math.round(((G.idx + 1) / CONFIG.TOTAL_QUESTIONS) * 100);
  document.getElementById('q-progress').style.width = pct + '%';
  document.getElementById('q-counter').textContent  = (G.idx + 1) + '/' + CONFIG.TOTAL_QUESTIONS;
  document.getElementById('live-score').textContent  = G.score;
  renderXPBar();

  // Meta
  document.getElementById('q-cat').textContent = q.category;
  const diffEl = document.getElementById('q-diff');
  diffEl.textContent = q.difficulty;
  diffEl.className   = 'q-diff ' + ({ 'Fácil': 'easy', 'Médio': 'medium', 'Difícil': 'hard' }[q.difficulty] || '');

  // Texto da questão
  document.getElementById('q-text').textContent = q.question;

  // Limpa área de explicação e efeitos
  document.getElementById('explanation-box').style.display = 'none';
  document.getElementById('explanation-box').innerHTML     = '';
  document.getElementById('combo-toast').className         = 'combo-toast';
  document.getElementById('combo-toast').textContent       = '';
  const pf = document.getElementById('pts-flash');
  if (pf) { pf.textContent = ''; pf.className = 'pts-flash'; }

  // ── BOTÃO PRÓXIMA: recria para não acumular listeners ──
  const oldBtn = document.getElementById('btn-next');
  const newBtn = oldBtn.cloneNode(true);
  newBtn.style.display = 'none';
  newBtn.addEventListener('click', nextQuestion);
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);

  // Opções
  const list    = document.getElementById('options-list');
  list.innerHTML = '';
  ['A','B','C','D'].forEach((letter, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="opt-letter">${letter}</span><span class="opt-text">${q.options[i]}</span>`;
    btn.addEventListener('click', () => selectAnswer(i));
    list.appendChild(btn);
  });

  // Timer
  const tw = document.getElementById('timer-wrap');
  if (G.mode === 'rapido') {
    tw.style.display = 'block';
    G.timeLeft = CONFIG.TIMER_SECONDS;
    updateRing(G.timeLeft, CONFIG.TIMER_SECONDS);
    G.timer = setInterval(() => {
      G.timeLeft--;
      updateRing(G.timeLeft, CONFIG.TIMER_SECONDS);
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
  ring.style.strokeDasharray = Math.max(0, Math.round(circ * cur / total)) + ' ' + circ;
  document.getElementById('timer-num').textContent = cur;
  ring.classList.toggle('warn', cur <= 10);
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

  btns[q.correct].classList.add('correct');
  if (!ok) btns[idx].classList.add('wrong');

  if (ok) {
    G.combo++;
    G.correct++;
    if (G.combo > G.maxCombo) G.maxCombo = G.combo;
    const bonus  = (G.combo - 1) * CONFIG.COMBO_BONUS;
    const earned = base + bonus;
    G.score += earned;
    G.xp    += CONFIG.XP_PER_CORRECT;
    G.level  = computeLevel(G.xp);
    showPtsFlash('+' + earned, true);
    if (G.combo >= 2) showComboToast(G.combo, earned);
  } else {
    G.combo = 0;
    showPtsFlash('✗', false);
  }

  document.getElementById('live-score').textContent = G.score;
  showExplanation(ok, q.explanation, q.options[q.correct]);
  document.getElementById('btn-next').style.display = 'flex';
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

// ── EXPLICAÇÃO FOCO NA RESPOSTA CORRETA ───────
function showExplanation(ok, text, correctOption, timeout) {
  const box = document.getElementById('explanation-box');
  box.className = 'explanation-box ' + (ok ? 'correct-exp' : 'wrong-exp');

  const icon  = ok ? '✓' : timeout ? '⏱' : '✗';
  const label = ok ? 'Correto!' : timeout ? 'Tempo esgotado!' : 'Incorreto!';
  const color = ok ? 'var(--green)' : 'var(--red)';

  // Divide em frase de destaque + detalhe
  const parts    = text.split(/(?<=[.!?])\s+/);
  const headline = parts[0] || text;
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

// ── EFEITOS VISUAIS ───────────────────────────
function showPtsFlash(text, ok) {
  const el = document.getElementById('pts-flash');
  if (!el) return;
  el.textContent = text;
  el.className   = 'pts-flash ' + (ok ? 'pts-ok' : 'pts-fail');
  void el.offsetHeight;           // força reflow para reiniciar animação CSS
}

function showComboToast(combo, pts) {
  const labels = ['','','🔥 Combo!','⚡ Em Chama!','💥 Imparável!','🌟 Lendário!'];
  const msg    = combo < labels.length ? labels[combo] : '🌟 x' + combo;
  const el     = document.getElementById('combo-toast');
  el.textContent = msg + '  ×' + combo + '  +' + pts + ' pts';
  el.className   = 'combo-toast show';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'combo-toast'; }, 2200);
}

// ── PRÓXIMA QUESTÃO ───────────────────────────
function nextQuestion() {
  G.idx++;
  if (G.idx >= CONFIG.TOTAL_QUESTIONS) { showResults(); return; }

  const body = document.querySelector('.quiz-body');
  body.style.transition = 'opacity .18s ease, transform .18s ease';
  body.style.opacity    = '0';
  body.style.transform  = 'translateX(28px)';

  setTimeout(() => {
    renderQuestion();
    // pequeno delay para o DOM atualizar antes de animar entrada
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        body.style.transition = 'opacity .25s ease, transform .25s ease';
        body.style.opacity    = '1';
        body.style.transform  = 'translateX(0)';
        setTimeout(() => { body.style.transition = ''; }, 300);
      });
    });
  }, 200);
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

  document.getElementById('ach-list').innerHTML = computeAchievements(pct)
    .map(a => '<span class="ach-badge ' + (a.earned ? 'earned' : '') + '">' + a.label + '</span>')
    .join('');

  saveScore(G.score, G.mode, pct);
  saveStats(G.correct, CONFIG.TOTAL_QUESTIONS, G.score, G.xp);
  showScreen('result');

  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-start-label').textContent = 'Gerar Quiz com IA';
  document.getElementById('start-hint').textContent = '10 perguntas • novas a cada partida';
}

function computeAchievements(pct) {
  return [
    { label: '🏅 Nota 10',        earned: pct === 100 },
    { label: '🔥 Combo x5',       earned: G.maxCombo >= 5 },
    { label: '⚡ Relâmpago',      earned: G.mode === 'rapido' && pct >= 60 },
    { label: '🎯 Precisão 80%',   earned: pct >= 80 },
    { label: '💪 3 Partidas',     earned: getTotalGames() >= 3 },
    { label: '🧠 Expert Difícil', earned: G.difficulty === 'dificil' && pct >= 70 },
    { label: '📚 Veterano',       earned: getTotalGames() >= 10 },
    { label: '🌟 500 XP',         earned: G.xp >= 500 },
  ];
}

// ── XP / NÍVEL ────────────────────────────────
function computeLevel(xp) {
  let lv = 0;
  CONFIG.LEVELS.forEach((l, i) => { if (xp >= l.min) lv = i; });
  return lv;
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
  list.innerHTML = lb.length
    ? lb.map((e, i) =>
        '<div class="lb-row">' +
          '<span class="lb-rank ' + (medals[i]||'') + '">' + (i+1) + '°</span>' +
          '<div style="flex:1">' +
            '<div class="lb-name">' + e.date + ' — ' + (e.mode==='rapido' ? '⚡ Rápido' : '📖 Estudo') + '</div>' +
            '<div class="lb-mode">' + e.acc + '% de precisão</div>' +
          '</div>' +
          '<span class="lb-score">' + e.score + ' pts</span>' +
        '</div>'
      ).join('')
    : '<p class="lb-empty">Nenhuma partida ainda.<br/>Jogue para aparecer no ranking!</p>';
  showScreen('leaderboard');
}
function clearLeaderboard() {
  if (!confirm('Limpar todo o histórico?')) return;
  localStorage.removeItem(CONFIG.LEADERBOARD_KEY);
  localStorage.removeItem(CONFIG.STATS_KEY);
  G.xp = 0; G.level = 0;
  showLeaderboard();
  loadHomeStats();
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
  const s   = getStats();
  if (!s.totalGames) return;
  const acc = s.totalAnswered ? Math.round((s.totalCorrect / s.totalAnswered) * 100) : 0;
  document.getElementById('hs-record').textContent = s.bestScore || 0;
  document.getElementById('hs-games').textContent  = s.totalGames || 0;
  document.getElementById('hs-acc').textContent    = acc + '%';
  const lbl = document.getElementById('hs-level');
  if (lbl) lbl.textContent = CONFIG.LEVELS[G.level].icon + ' ' + CONFIG.LEVELS[G.level].name;
  document.getElementById('home-stats').style.display = 'flex';
}

// ── SERVICE WORKER + OFFLINE ──────────────────
function registerSW() {
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('/sw.js')
      .then(r => console.log('SW:', r.scope))
      .catch(e => console.warn('SW erro:', e));
}
function monitorOffline() {
  window.addEventListener('offline', () => {
    const b = document.createElement('div');
    b.className = 'offline-badge';
    b.textContent = '📡 Sem conexão — usando cache';
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 4000);
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
