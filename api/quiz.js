const OpenAI = require('openai');
const { isValidQuestion } = require('../question-validation');

function buildProviders() {
  const providers = [];

  // 1. Groq (Se a chave estiver configurada no Vercel)
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().startsWith('gsk_')) {
    providers.push({
      name: 'groq',
      client: new OpenAI({
        apiKey: process.env.GROQ_API_KEY.trim(),
        timeout: 15000,
        maxRetries: 0,
        baseURL: 'https://api.groq.com/openai/v1',
      }),
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    });
  }

  // 2. Gemini Direto (Se a chave estiver configurada no Vercel)
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().startsWith('AIza')) {
    providers.push({
      name: 'gemini',
      client: new OpenAI({
        apiKey: process.env.GEMINI_API_KEY.trim(),
        timeout: 15000,
        maxRetries: 0,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      }),
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
    });
  }

  // 3. OpenRouter (Modelos Gratuitos Válidos + Roteamento Automático)
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim() !== '') {
    const apiKey = process.env.OPENROUTER_API_KEY.trim();
    const baseURL = 'https://openrouter.ai/api/v1';

    // O roteador gratuito acompanha os modelos disponíveis sem IDs aposentados.
    const openRouterModels = [
      { name: 'openrouter-free', model: process.env.OPENROUTER_MODEL || 'openrouter/free' },
    ];

    for (const item of openRouterModels) {
      providers.push({
        name: item.name,
        client: new OpenAI({
          apiKey: apiKey,
          timeout: 15000,
          maxRetries: 0,
          baseURL: baseURL,
          defaultHeaders: {
            'HTTP-Referer': 'https://quiz-pwa-olive.vercel.app',
            'X-Title': 'Quiz IA',
          },
        }),
        model: item.model,
      });
    }
  }

  return providers;
}

function buildDifficultyInstruction(difficulty, count) {
  if (difficulty === 'misto') {
    const hard   = Math.max(1, Math.round(count * 0.3));
    const easy   = Math.max(1, Math.round(count * 0.3));
    const medium = Math.max(1, count - hard - easy);
    return `MISTO — distribua aproximadamente: ${easy} fáceis, ${medium} médias, ${hard} difíceis.`;
  }
  const DIFFICULTY_LABEL = {
    facil:   'FÁCIL — equivalente ao Ensino Médio',
    medio:   'MÉDIO — equivalente ao ENEM/vestibular',
    dificil: 'DIFÍCIL — equivalente a concurso público',
  };
  return DIFFICULTY_LABEL[difficulty] || DIFFICULTY_LABEL.medio;
}

function buildPrompt(difficulty, topic, count) {
  const diffLabel = buildDifficultyInstruction(difficulty, count);
  const topicInstruction = (!topic || topic === 'Aleatório')
    ? 'Escolha temas variados e interessantes.'
    : `TODAS as ${count} questões devem ser EXCLUSIVAMENTE sobre o tema: "${topic}". Não inclua perguntas de outros assuntos.`;

  return `Gere exatamente ${count} questões de múltipla escolha no estilo ENEM. Nível: ${diffLabel}.
${topicInstruction}
Cada questão deve ter quatro alternativas com o TEXTO COMPLETO das respostas, uma correta e três distratores plausíveis.
Nunca use apenas letras A, B, C, D ou placeholders como alternativas: o aplicativo já exibe as letras.
O campo correct é o índice de 0 a 3 da alternativa correta. A explicação deve justificar essa resposta.
Retorne APENAS um JSON válido no formato abaixo, sem texto extra e sem marcações markdown.
O conteúdo do exemplo é ilustrativo: substitua a categoria, enunciado, alternativas e explicação pelo tema e nível solicitados.
{
  "questions": [
    {
      "category": "Inglês",
      "difficulty": "Fácil",
      "question": "Qual frase está no futuro simples com will?",
      "options": ["She will study tomorrow.", "She studied yesterday.", "She is studying now.", "She studies every day."],
      "correct": 0,
      "explanation": "Will seguido do verbo na forma base expressa o futuro simples."
    }
  ]
}`;
}

function parseQuestionsJson(content, count) {
  if (!content) throw new Error('Resposta da IA vazia');

  let clean = content.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  const jsonStart = clean.indexOf('{');
  const jsonEnd = clean.lastIndexOf('}') + 1;

  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    throw new Error('Resposta da IA não contém JSON válido');
  }

  const cleanJson = clean.substring(jsonStart, jsonEnd);
  const parsed = JSON.parse(cleanJson);

  if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error('IA não retornou questões válidas');
  }

  const questions = parsed.questions;
  if (questions.length !== count || !questions.every(isValidQuestion) ||
      new Set(questions.map(q => q.question.trim().toLowerCase())).size !== count) {
    throw new Error('A IA retornou questões incompletas ou inválidas');
  }
  return parsed;
}

async function generateWithFallback(difficulty, topic, count) {
  const providers = buildProviders();

  if (providers.length === 0) {
    const err = new Error('Nenhuma chave de API válida configurada');
    err.allFailed = true;
    throw err;
  }

  // Reserva espaço para todas as questões e suas explicações.
  const maxTokens = Math.max(2000, count * 500);
  const prompt = buildPrompt(difficulty, topic, count);
  const failures = [];

  for (const provider of providers) {
    try {
      const payload = {
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: maxTokens,
      };

      if (!provider.name.startsWith('openrouter')) {
        payload.response_format = { type: 'json_object' };
      }

      const response = await provider.client.chat.completions.create(payload);
      const choice = response.choices?.[0];
      if (choice?.finish_reason === 'length') {
        throw new Error('A resposta da IA foi cortada antes de completar as questões');
      }
      const parsed = parseQuestionsJson(choice?.message?.content, count);
      console.log(`Sucesso via ${provider.name}`);
      return parsed;
    } catch (err) {
      const status = err.status || err.statusCode;
      console.warn(`Provedor ${provider.name} falhou (${status || 'erro'}): ${err.message}`);
      failures.push({ provider: provider.name, status, message: err.message });
    }
  }

  const allRateLimited = failures.every(f => f.status === 429);
  const err = new Error(
    allRateLimited
      ? 'Limite diário atingido em todos os provedores.'
      : 'Falha em todos os provedores: ' + failures.map(f => `${f.provider} (${f.status || 'erro'})`).join(', ')
  );
  err.allFailed = true;
  err.allRateLimited = allRateLimited;
  throw err;
}

module.exports = async function handler(req, res) {
  if (req.headers) { if (!require('../lib/backend').guard(req,res,['GET','OPTIONS'])) return; }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { difficulty, topic } = req.query;
    let count = parseInt(req.query.count, 10);
    if (!Number.isFinite(count) || count <= 0) count = 10;
    count = Math.min(count, 20);

    if (process.env.SUPABASE_URL) {
      const {topics}=require('../lib/catalog');
      const selected=topic||'Aleatório', diff=difficulty||'misto';
      if(!(selected==='Aleatório'||topics().some(t=>t.label===selected))||!['facil','medio','dificil','misto'].includes(diff))return res.status(400).json({error:'Tema ou dificuldade inválida'});
      const {stock,replenish}=require('../lib/stock');
      let saved;
      try { saved=await stock(selected,diff,count); } catch(e) {
        if(process.env.ALLOW_AI_DB_FALLBACK!=='true')throw e;
        await require('../lib/backend').user(req);
        return res.status(200).json(await generateWithFallback(diff,selected,count));
      }
      if(saved.length<count && process.env.ALLOW_PLAY_REPLENISH==='true') {
        await require('../lib/backend').user(req);
        const target=selected==='Aleatório'?topics()[Math.floor(Math.random()*topics().length)].label:selected;
        await replenish(target,diff==='misto'?'medio':diff,Math.min(10,count-saved.length),generateWithFallback);
        saved=await stock(selected,diff,count);
      }
      return res.status(saved.length?200:503).json({questions:saved,insufficient:saved.length<count,details:saved.length?'Estoque parcial':'Sem questões disponíveis. O administrador precisa abastecer o banco.'});
    }
    if(req.headers && process.env.ALLOW_LEGACY_AI!=='true')return res.status(503).json({error:'Configure o banco ou habilite explicitamente ALLOW_LEGACY_AI.'});
    const parsed = await generateWithFallback(difficulty, topic, count);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Erro na API:', err);
    const isRateLimit = err.allRateLimited === true;

    return res.status(isRateLimit ? 429 : 500).json({
      error: isRateLimit ? 'rate_limit' : 'Erro na geração',
      details: isRateLimit
        ? 'Limite diário de requisições atingido. Tente novamente mais tarde.'
        : err.message
    });
  }
};

module.exports.generateWithFallback = generateWithFallback;
