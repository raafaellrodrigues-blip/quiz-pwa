const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// 🔹 Mapeamento de dificuldade
const DIFFICULTY_MAP = {
  facil:   'FÁCIL — Ensino Médio',
  medio:   'MÉDIO — ENEM',
  dificil: 'DIFÍCIL — Concurso',
  misto:   'MISTO — (2 fáceis, 2 médias, 1 difícil)',
};

// 🔹 Prompt otimizado (LEVE e RÁPIDO)
function buildPrompt(difficulty, topic) {
  const diffLabel = DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.misto;

  const topicInstruction = (!topic || topic === 'Aleatório')
    ? 'Escolha temas variados.'
    : `Todas as questões devem ser sobre: "${topic}".`;

  return `Gere exatamente 5 questões de múltipla escolha estilo ENEM.
Nível: ${diffLabel}.
${topicInstruction}

Seja direto e objetivo.

Retorne SOMENTE JSON válido:
{
  "questions": [
    {
      "category": "string",
      "difficulty": "Fácil",
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correct": 0
    }
  ]
}`;
}

// 🔁 Retry automático
async function generateWithRetry(fn, retries = 2) {
  try {
    return await fn();
  } catch (err) {
    if (retries === 0) throw err;
    await new Promise(res => setTimeout(res, 2000));
    return generateWithRetry(fn, retries - 1);
  }
}

// 🧠 Cache simples (melhora performance e reduz custo)
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 1000 * 60 * 2; // 2 minutos

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { difficulty, topic } = req.query;

    // ⚡ Usa cache se ainda válido
    const now = Date.now();
    if (cache && (now - cacheTime < CACHE_TTL)) {
      return res.status(200).json(cache);
    }

    // ⏱️ Timeout manual
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await generateWithRetry(() =>
      openai.chat.completions.create({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          {
            role: 'user',
            content: buildPrompt(difficulty, topic)
          }
        ],
        temperature: 0.7,
        max_tokens: 1200,
        signal: controller.signal
      })
    );

    clearTimeout(timeout);

    const content = response.choices?.[0]?.message?.content || '';

    // 🔧 Extração segura do JSON
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}') + 1;

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('Resposta inválida da IA');
    }

    const cleanJson = content.substring(jsonStart, jsonEnd);
    const parsed = JSON.parse(cleanJson);

    // 🧠 salva cache
    cache = parsed;
    cacheTime = now;

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Erro na API:', err);

    return res.status(500).json({
      error: 'Erro na geração',
      message: err.message,
      hint: 'Tente novamente em alguns segundos'
    });
  }
};