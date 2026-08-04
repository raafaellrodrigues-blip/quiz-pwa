const OpenAI = require('openai');

// ── PROVEDORES (ordem de tentativa) ───────────
// Cada provedor tem sua própria cota diária gratuita e independente.
// Se um estourar o limite (429) ou falhar, tentamos o próximo.
// Groq primeiro: maior cota gratuita (~14.400 req/dia).
// Gemini depois: cota generosa (~1.500 req/dia).
// OpenRouter por último: cota mais apertada (50/dia sem crédito), mas
// serve como rede de segurança final.
function buildProviders() {
  const providers = [];

  if (process.env.GROQ_API_KEY) {
    providers.push({
      name: 'groq',
      client: new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      }),
      model: 'llama-3.3-70b-versatile',
    });
  }

  if (process.env.GEMINI_API_KEY) {
    providers.push({
      name: 'gemini',
      client: new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      }),
      model: 'gemini-2.5-flash',
    });
  }

  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      name: 'openrouter',
      client: new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
      }),
      model: 'openrouter/free',
    });
  }

  return providers;
}

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

function parseQuestionsJson(content) {
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

  return parsed;
}

// Tenta cada provedor em ordem. Só desiste de vez se TODOS falharem.
async function generateWithFallback(difficulty, topic, count) {
  const providers = buildProviders();

  if (providers.length === 0) {
    const err = new Error('Nenhuma chave de API configurada (GROQ_API_KEY, GEMINI_API_KEY ou OPENROUTER_API_KEY)');
    err.allFailed = true;
    throw err;
  }

  const maxTokens = Math.min(4000, Math.max(1200, count * 300));
  const prompt = buildPrompt(difficulty, topic, count);

  const failures = [];

  for (const provider of providers) {
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: maxTokens,
      });

      const content = response.choices[0].message.content;
      const parsed = parseQuestionsJson(content);
      console.log(`Sucesso via ${provider.name}`);
      return parsed;

    } catch (err) {
      const status = err.status || err.statusCode;
      console.warn(`Provedor ${provider.name} falhou (${status || 'erro'}): ${err.message}`);
      failures.push({ provider: provider.name, status, message: err.message });
      // Tenta o próximo provedor da lista, independente do motivo da falha.
    }
  }

  // Todos os provedores falharam.
  const allRateLimited = failures.every(f => f.status === 429);
  const err = new Error(
    allRateLimited
      ? 'Limite diário atingido em todos os provedores configurados.'
      : 'Falha em todos os provedores: ' + failures.map(f => `${f.provider} (${f.status || 'erro'})`).join(', ')
  );
  err.allFailed = true;
  err.allRateLimited = allRateLimited;
  err.failures = failures;
  throw err;
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

    const parsed = await generateWithFallback(difficulty, topic, count);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Erro na API:', err);

    const isRateLimit = err.allRateLimited === true;

    return res.status(isRateLimit ? 429 : 500).json({
      error: isRateLimit ? 'rate_limit' : 'Erro na geração',
      details: isRateLimit
        ? 'Limite diário de requisições gratuitas atingido em todos os provedores. Tente novamente mais tarde.'
        : err.message
    });
  }
};
