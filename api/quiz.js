const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const DIFFICULTY_MAP = {
  facil:   'FÁCIL — equivalente ao Ensino Médio',
  medio:   'MÉDIO — equivalente ao ENEM/vestibular',
  dificil: 'DIFÍCIL — equivalente a concurso público',
  misto:   'MISTO — distribua questões de fácil a difícil',
};

function buildPrompt(difficulty, topic, count) {
  const diffLabel = DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.misto;
  const numQuestions = parseInt(count, 10) || 5;

  const topicInstruction = (!topic || topic === 'Aleatório')
    ? 'Escolha temas variados e interessantes.'
    : `TODAS as ${numQuestions} questões devem ser EXCLUSIVAMENTE sobre o tema: "${topic}".`;

  return `Gere exatamente ${numQuestions} questões de múltipla escolha no estilo ENEM. Nível: ${diffLabel}.
${topicInstruction}
Retorne APENAS um objeto JSON válido, sem formatação markdown e sem texto antes ou depois:
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
    const { difficulty, topic, count = 5 } = req.query;

    const response = await openai.chat.completions.create({
      model: 'qwen/qwen-2.5-72b-instruct:free',
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'user',
          content: buildPrompt(difficulty, topic, count)
        }
      ],
      temperature: 0.7,
      max_tokens: 2500
    });

    const content = response.choices[0].message.content;
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}') + 1;

    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error('A resposta da IA não contém um objeto JSON válido.');
    }

    const cleanJson = content.substring(jsonStart, jsonEnd);
    const parsed = JSON.parse(cleanJson);

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Erro na API:', err);
    return res.status(500).json({
      error: 'Erro na geração de perguntas',
      details: err.message
    });
  }
};