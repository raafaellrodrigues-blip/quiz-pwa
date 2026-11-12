const { createHash } = require('node:crypto');
const { isValidQuestion } = require('../question-validation');
function normalize(s) { return String(s).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim(); }
function hash(s) { return createHash('sha256').update(s).digest('hex'); }
function prepare(q, topic, difficulty) {
  if (!isValidQuestion(q) || q.question.length > 5000 || q.explanation.length > 10000 || q.options.some(o => o.length > 2000)) throw new Error('Questão inválida');
  const normalized = normalize(q.question);
  return { topic, difficulty, question:q.question.trim(), options:q.options.map(o=>o.trim()), correct:q.correct,
    explanation:q.explanation.trim(), source:'ai', status:'validated', normalized,
    canonical_hash:hash(normalized), signature:hash([normalize(topic),normalized,...q.options.map(normalize).sort(),normalize(q.options[q.correct])].join('|')) };
}
module.exports = { normalize, prepare };
