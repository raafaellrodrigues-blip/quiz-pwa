const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const DIFFICULTY_LABEL = {
  facil:   'FÁCIL — equivalente ao Ensino Médio',
  medio:   'MÉDIO — equivalente ao ENEM/vestibular',
  dificil: 'DIFÍCIL — equivalente a concurso público',
};

function buildDifficultyInstruction(difficulty, count) {
  if (difficulty === 'misto') {
    const hard   = Math.max(1, Math.round(count * 0.3));
    const easy   = Math.max(1, Math.round(count * 0.3));
    const medium = Math.max(1, count - hard - easy);
    return `MISTO — distribua aproximadamente: ${easy} fáceis, ${medium} médias, ${hard} difíceis.`;
  }
  return DIFFICULTY_LABEL[difficulty] || DIFFICULTY_LABEL.medio;
}

function buildPrompt(difficulty, topic, count) {
  const diffLabel = buildDifficultyInstruction(difficulty, count);

  const topicInstruction = (!topic || topic === 'Aleatório')
    ? 'Escolha temas variados e interessantes.'
    : `TODAS as ${count} questões devem ser EXCLUSIVAMENTE sobre o tema: "${topic}". Não inclua perguntas de outros assuntos.`;

  return `Gere exatamente ${count} questões de múltipla escolha no estilo ENEM. Nível: ${diffLabel}.
${topicInstruction}
Retorne APENAS o objeto JSON puro, sem markdown, sem texto extra:
{
  "questions": [
    {
      "category": "string",
      "difficulty": "Fácil",
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correct": 0,
      "explanation": "string"
    }
  ]
}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { difficulty, topic } = req.query;

    // Respeita o "count" enviado pelo front-end (antes era ignorado e o
    // prompt sempre pedia 20 questões, mesmo quando o front pedia 5 —
    // isso estourava o max_tokens e cortava o JSON no meio, quebrando o parse).
    let count = parseInt(req.query.count, 10);
    if (!Number.isFinite(count) || count <= 0) count = 10;
    count = Math.min(count, 20);

    // Orçamento de tokens proporcional à quantidade de questões pedidas.
    const maxTokens = Math.min(4000, Math.max(1200, count * 300));

    const response = await openai.chat.completions.create({
      model: 'openrouter/free', // Roteia automaticamente para um modelo gratuito ativo
      response_format: { type: "json_object" }, // Força o retorno em formato JSON
      messages: [
        {
          role: 'user',
          content: buildPrompt(difficulty, topic, count)
        }
      ],
      temperature: 0.7,
      max_tokens: maxTokens
    });

    const content = response.choices[0].message.content;
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}') + 1;

    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      throw new Error('Resposta da IA não contém JSON válido');
    }

    const cleanJson = content.substring(jsonStart, jsonEnd);

    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (parseErr) {
      throw new Error('Falha ao interpretar JSON da IA (resposta pode ter sido cortada): ' + parseErr.message);
    }

    if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error('IA não retornou questões');
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Erro na API:', err);
    return res.status(500).json({
      error: 'Erro na geração',
      details: err.message
    });
  }
};