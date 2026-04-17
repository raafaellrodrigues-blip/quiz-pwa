const Anthropic = require('@anthropic-ai/sdk');

// Certifique-se que a variável ANTHROPIC_API_KEY esteja cadastrada na Vercel!
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DIFFICULTY_MAP = {
  facil:   'FÁCIL — equivalente ao Ensino Médio (conhecimento básico, conceitos diretos)',
  medio:   'MÉDIO — equivalente ao ENEM/vestibular (requer interpretação e raciocínio)',
  dificil: 'DIFÍCIL — equivalente a concurso público ou graduação (análise aprofundada)',
  misto:   'MISTO — distribua: 3 fáceis, 4 médias, 3 difíceis',
};

function buildPrompt(difficulty) {
  const diffLabel = DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.misto;
  return `Você é um professor especialista em elaboração de questões para vestibular e ENEM.
Gere exatamente 20 questões de múltipla escolha no estilo ENEM. Nível: ${diffLabel}.

FORMATO — retorne APENAS JSON válido:
{
  "questions": [
    {
      "category": "string",
      "difficulty": "Fácil" | "Médio" | "Difícil",
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correct": 0,
      "explanation": "string"
    }
  ]
}`;
}

module.exports = async function handler(req, res) {
  // Configuração de CORS para permitir que o seu index.html acesse a API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  const difficulty = req.query.difficulty || 'misto';

  try {
    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20240620', // NOME CORRIGIDO
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(difficulty) }],
    });

    const rawText = message.content[0].text; // Acesso direto ao texto simplificado

    // Limpeza de Markdown mais robusta
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;
    const cleanJson = rawText.substring(jsonStart, jsonEnd);

    const parsed = JSON.parse(cleanJson);

    // Validação básica dos dados recebidos
    const validated = parsed.questions.map(q => ({
      category:    (q.category || 'Geral').trim(),
      difficulty:  (q.difficulty || 'Médio').trim(),
      question:    q.question.trim(),
      options:     q.options.map(o => String(o).trim()),
      correct:     Number(q.correct),
      explanation: q.explanation.trim(),
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=21600');
    return res.status(200).json({ questions: validated });

  } catch (err) {
    console.error('[quiz.js] Erro detalhado:', err);
    return res.status(500).json({ 
      error: 'Erro na geração', 
      details: err.message 
    });
  }
};