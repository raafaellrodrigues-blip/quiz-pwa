const OpenAI = require('openai');

// Configura o cliente para usar o OpenRouter com a sua chave da Vercel
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

function buildPrompt(difficulty) {
  const diffLabel = DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.misto;
  return `Gere exatamente 20 questões de múltipla escolha no estilo ENEM. Nível: ${diffLabel}.
  RETORNE APENAS JSON:
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
    const response = await openai.chat.completions.create({
      model: 'anthropic/claude-3.5-sonnet', // Nome do modelo no OpenRouter
      messages: [{ role: 'user', content: buildPrompt(req.query.difficulty) }],
      response_format: { type: "json_object" }
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Erro na API:', err);
    return res.status(500).json({ error: 'Erro na geração', details: err.message });
  }
};