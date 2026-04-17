module.exports = async function handler(req, res) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "user",
            content: `
Crie 10 perguntas de múltipla escolha em português.

Formato JSON:
[
  {
    "question": "Pergunta aqui",
    "options": ["A", "B", "C", "D"],
    "answer": 0
  }
]
`
          }
        ]
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: "Resposta inválida da IA" });
    }

    const questions = JSON.parse(content);

    return res.status(200).json({ questions });

  } catch (error) {
    console.error("ERRO:", error);
    return res.status(500).json({ error: "Erro ao gerar perguntas" });
  }
};