(function (root) {
  function isValidQuestion(q) {
    const nonempty = value => typeof value === 'string' && value.trim().length > 0;
    if (!q || !nonempty(q.question) || !nonempty(q.explanation) ||
        !Array.isArray(q.options) || q.options.length !== 4 ||
        !q.options.every(nonempty) || !Number.isInteger(q.correct) ||
        q.correct < 0 || q.correct > 3) return false;

    const options = q.options.map(value => value.trim().toLowerCase());
    if (new Set(options).size !== 4) return false;
    // A single-letter answer can be legitimate (e.g. the English article "a").
    // Reject a set made entirely of labels, without rejecting short real answers.
    if (options.every(value => /^(?:(?:alternativa|opção|opcao|option|resposta)\s*)?[a-d][.):]?$/i.test(value))) return false;
    if (options.some(value => /^(?:string|texto da (?:alternativa|resposta)(?:\s*[a-d1-4])?|alternativa\s*[1-4]|option\s*[1-4])$/i.test(value))) return false;
    return true;
  }

  if (typeof module === 'object' && module.exports) module.exports = { isValidQuestion };
  else root.isValidQuestion = isValidQuestion;
})(typeof globalThis !== 'undefined' ? globalThis : this);
