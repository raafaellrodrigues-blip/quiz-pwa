const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../api/quiz'), 'utf8');
const questions = Array.from({ length: 10 }, (_, i) => ({
  question: `Pergunta ${i}`, options: ['She will study tomorrow.', 'She studied yesterday.', 'She is studying now.', 'She studies every day.'], correct: 0, explanation: 'Explicação'
}));
async function run(replies, env = { GROQ_API_KEY: 'gsk_test', OPENROUTER_API_KEY: 'test' }, count = 10) {
  const calls = [];
  class OpenAI {
    constructor(config) {
      this.chat = { completions: { create: async payload => {
        calls.push({ config, payload });
        const reply = replies.shift();
        if (reply instanceof Error) throw reply;
        return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ questions }) }, ...reply }] };
      } } };
    }
  }
  const context = { require: name => name === 'openai' ? OpenAI : require('../question-validation'), process: { env }, module: { exports: {} }, console: { log() {}, warn() {}, error() {} } };
  vm.runInNewContext(source, context);
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await context.module.exports({ method: 'GET', query: { count: String(count) } }, res);
  return { calls, res };
}
test('404 on first provider falls back to free router and returns all ten questions', async () => {
  const { calls, res } = await run([Object.assign(new Error('model missing'), { status: 404 }), {}]);
  assert.equal(res.code, 200);
  assert.equal(res.body.questions.length, 10);
  assert.equal(calls[1].payload.model, 'openrouter/free');
  assert.equal(calls[1].payload.response_format.type, 'json_object');
  assert.equal(calls[1].payload.provider.require_parameters, true);
  assert.equal(calls[1].payload.max_tokens, 5000);
  assert.equal(calls[0].config.maxRetries, 0);
});
test('truncated response uses next provider', async () => {
  const { calls, res } = await run([{ finish_reason: 'length' }, {}]);
  assert.equal(res.code, 200);
  assert.equal(calls.length, 2);
});
test('incomplete questions use next provider', async () => {
  const { calls, res } = await run([{ message: { content: JSON.stringify({ questions: questions.slice(0, 2) }) } }, {}]);
  assert.equal(res.code, 200);
  assert.equal(calls.length, 2);
});
test('invalid answer index is rejected', async () => {
  const invalid = questions.map(q => ({ ...q, correct: 4 }));
  const { res } = await run([{ message: { content: JSON.stringify({ questions: invalid }) } }], { OPENROUTER_API_KEY: 'test' });
  assert.equal(res.code, 500);
});
test('rate limits preserve 429 response', async () => {
  const error = () => Object.assign(new Error('rate limit'), { status: 429 });
  const { res } = await run([error(), error()]);
  assert.equal(res.code, 429);
  assert.equal(res.body.error, 'rate_limit');
});

test('letter-only options trigger fallback instead of being returned as answers', async () => {
  const invalid = questions.map(q => ({ ...q, options: ['A', 'B', 'C', 'D'] }));
  const { calls, res } = await run([{ message: { content: JSON.stringify({ questions: invalid }) } }, {}]);
  assert.equal(res.code, 200);
  assert.equal(calls.length, 2);
  assert.equal(res.body.questions[0].options[0], 'She will study tomorrow.');
  assert.ok(!calls[0].payload.messages[0].content.includes('["A", "B", "C", "D"]'));
});

test('small batches reserve enough output for reasoning models and JSON',async()=>{
 const {calls,res}=await run([{message:{content:JSON.stringify({questions:questions.slice(0,4)})}}],{GROQ_API_KEY:'gsk_test'},4);
 assert.equal(res.code,200);assert.equal(calls[0].payload.max_tokens,4000);assert.equal(calls[0].payload.reasoning_effort,'low');
});
