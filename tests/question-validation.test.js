const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { isValidQuestion } = require('../question-validation');
const valid = { question: 'Choose the future tense.', options: ['She will go.', 'She went.', 'She goes.', 'She is going.'], correct: 0, explanation: 'Will expresses the future.' };

test('rejects labels, blanks and duplicate options but accepts short real answers', () => {
  for (const options of [['A','B','C','D'], ['A)','B)','C)','D)'], ['Alternativa A','Alternativa B','Alternativa C','Alternativa D'], ['', 'yes', 'no', 'maybe'], ['Yes',' yes ','No','Maybe']]) {
    assert.equal(isValidQuestion({ ...valid, options }), false);
  }
  for (const options of [['a', 'an', 'the', 'no article'], ['1','2','3','4'], ['Yes','No','Perhaps','Never']]) {
    assert.equal(isValidQuestion({ ...valid, options }), true);
  }
});

function browser(fetch) {
  const storage = new Map();
  const context = { window: { addEventListener() {} }, document: { addEventListener() {} },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    console: { warn() {}, log() {} }, fetch };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../question-validation'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../app'),'utf8'),context);
  return { context, storage };
}

test('invalid cached English questions are replaced while valid cached questions survive offline', async () => {
  const fresh = Array.from({ length: 10 }, (_, i) => ({ ...valid, question: `Fresh ${i}` }));
  const { context, storage } = browser(async () => ({ ok: true, json: async () => ({ questions: fresh }) }));
  const key = 'quizia_cache_v4_facil_Inglês';
  storage.set(key, JSON.stringify({ ts: Date.now(), data: [{ ...valid, options: ['A','B','C','D'] }] }));
  const result = await vm.runInContext("fetchQuestions('facil', 'Inglês')", context);
  assert.equal(result.length, 10);
  assert.ok(result.every(isValidQuestion));
  assert.equal(JSON.parse(storage.get(key)).data.length, 10);
  context.fetch = async () => { throw new Error('offline'); };
  const offline = await vm.runInContext("fetchQuestions('facil', 'Inglês')", context);
  assert.equal(offline.length, 10);
  assert.ok(offline.every(isValidQuestion));
});

test('invalid API response cannot start a game or fall back to invalid cached questions', async () => {
  const invalid = { ...valid, options: ['A','B','C','D'] };
  const { context, storage } = browser(async () => ({ ok: true, json: async () => ({ questions: Array(10).fill(invalid) }) }));
  const key = 'quizia_cache_v4_facil_Inglês';
  storage.set(key, JSON.stringify({ ts: Date.now(), data: [invalid] }));
  await assert.rejects(vm.runInContext("fetchQuestions('facil', 'Inglês')", context), /alternativas incompletas/);
  assert.equal(JSON.parse(storage.get(key)).data.length, 0);
});
