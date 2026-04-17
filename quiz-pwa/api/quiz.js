const OpenAI = require('openai');

// Configura o cliente para usar o OpenRouter
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
  Retorne APENAS o objeto JSON puro, sem textos explicativos antes ou depois.
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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  try {
    const response = await openai.chat.completions.create({
      model: 'google/gemini-flash-1.5',
      messages: [{ role: 'user', content: buildPrompt(req.query.difficulty) }],
      temperature: 0.7
    });

    const content = response.choices[0].message.content;
    
    // Filtro para garantir que pegamos apenas o JSON
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}') + 1;
    const cleanJson = content.substring(jsonStart, jsonEnd);

    const parsed = JSON.parse(cleanJson);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Erro detalhado na API:', err);
    return res.status(500).json({ 
      error: 'Erro na geração', 
      details: err.message 
    });
  }
};