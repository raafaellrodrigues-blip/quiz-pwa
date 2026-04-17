const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const DIFFICULTY_MAP = {
  facil:   'FÁCIL — equivalente ao Ensino Médio',
  medio:   'MÉDIO — equivalente ao ENEM/vestibular',
  dificil: 'DIFÍCIL — equivalente a concurso público',
  misto:   'MISTO — distribua: 3 fáceis, 4 médias, 3 difíceis',
};

function buildPrompt(difficulty, topic) {
  const diffLabel = DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.misto;

  const topicInstruction = (!topic || topic === 'Aleatório')
    ? 'Escolha temas variados e interessantes.'
    : `TODAS as 20 questões devem ser EXCLUSIVAMENTE sobre o tema: "${topic}". Não inclua perguntas de outros assuntos.`;

  return `Gere exatamente 20 questões de múltipla escolha no estilo ENEM. Nível: ${diffLabel}.
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

    const response = await openai.chat.completions.create({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        {
          role: 'user',
          content: buildPrompt(difficulty, topic)
        }
      ],
      temperature: 0.7
    });

    const content = response.choices[0].message.content;
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}') + 1;
    const cleanJson = content.substring(jsonStart, jsonEnd);

    const parsed = JSON.parse(cleanJson);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Erro na API:', err);
    return res.status(500).json({
      error: 'Erro na geração',
      details: err.message
    });
  }
};
