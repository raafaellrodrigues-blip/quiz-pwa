const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function app(stats = {}, history = []) {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id]) => [id, {
    textContent: '', innerHTML: '', style: {}, attributes: {}, value: id === 'pd-trend-period' ? '12' : '',
    setAttribute(name, value) { this.attributes[name] = value; },
    classList: { add() {}, remove() {} },
  }]));
  const storage = new Map([
    ['quizia_stats_v2', JSON.stringify(stats)],
    ['quizia_history_v1', JSON.stringify(history)],
  ]);
  const context = { window: { addEventListener() {} }, document: {
    addEventListener() {}, getElementById: id => elements.get(id) || null,
    querySelectorAll: () => [],
  }, localStorage: { getItem: key => storage.get(key) || null }, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../app'), 'utf8'), context);
  return { context, elements, storage };
}

test('empty dashboard displays honest empty state and no invented scores', () => {
  const { context, elements } = app();
  vm.runInContext('showProgress()', context);
  assert.equal(elements.get('pd-games').textContent, '0');
  assert.equal(elements.get('pd-accuracy').textContent, '—');
  assert.ok(elements.get('pd-trend').innerHTML.includes('Sua evolução começa aqui'));
  assert.equal(elements.get('pd-topics-empty').hidden, false);
  assert.equal(elements.get('pd-level-fill').style.width, '0%');
});

test('dashboard uses lifetime weighted accuracy and XP without modifying saved data', () => {
  const stats = { totalGames: 25, totalAnswered: 250, totalCorrect: 163, totalXP: 400, bestScore: 185 };
  const history = [ { date: '11/11/2026', tema: 'Inglês', total: 10, correct: 9, pct: 90 } ];
  const { context, elements, storage } = app(stats, history);
  const before = JSON.stringify([...storage]);
  vm.runInContext('showProgress()', context);
  assert.equal(elements.get('pd-games').textContent, '25');
  assert.equal(elements.get('pd-accuracy').textContent, '65%');
  assert.equal(elements.get('pd-level').textContent, 'Estudante');
  assert.equal(elements.get('pd-level-fill').style.width, '60%');
  assert.equal(elements.get('pd-accuracy-ring').attributes['stroke-dasharray'], '65 100');
  assert.ok(elements.get('pd-trend').innerHTML.includes('90<span>%'));
  assert.equal(JSON.stringify([...storage]), before);
});

test('highest level stays at 100 percent and has no invalid next level', () => {
  const { context } = app();
  const summary = vm.runInContext('getProgressSummary({totalXP: 9999})', context);
  assert.equal(summary.level, 'Lenda');
  assert.equal(summary.levelPct, 100);
  assert.equal(summary.nextXP, undefined);
});

test('trend respects period and chronological order, supports one result and escapes labels', () => {
  const history = Array.from({ length: 30 }, (_, i) => ({ date: `Date-${30-i}`, tema: '<script>bad()</script>', correct: i % 11, total: 10, pct: i % 11 * 10 }));
  const { context, elements } = app({}, history);
  vm.runInContext('renderProgressTrend(getHistory(), 12)', context);
  let chart = elements.get('pd-trend').innerHTML;
  assert.equal((chart.match(/class="trend-dot"/g) || []).length, 12);
  assert.ok(chart.indexOf('Date-19:') < chart.indexOf('Date-30:'));
  assert.ok(!chart.includes('<script>'));
  assert.ok(!chart.includes('NaN'));
  vm.runInContext('renderProgressTrend(getHistory(), 30)', context);
  chart = elements.get('pd-trend').innerHTML;
  assert.equal((chart.match(/class="trend-dot"/g) || []).length, 30);
  vm.runInContext('renderProgressTrend(getHistory().slice(0,1))', context);
  chart = elements.get('pd-trend').innerHTML;
  assert.equal((chart.match(/class="trend-dot"/g) || []).length, 1);
  assert.ok(!chart.includes('NaN'));
  assert.ok(!chart.includes('<path'));
});
