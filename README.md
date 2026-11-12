# RaciocineIA

PWA de estudo com modos Estudo, Rápido e Desafio, progresso local, contas Supabase, sincronização, ranking online e banco central de questões. Hospedagem e APIs seguem na Vercel; os provedores existentes são Groq, Gemini e OpenRouter.

O guia completo, com configuração de Auth, banco, variáveis, carga em lotes, migração, validação e backup, está em [docs/CONFIGURACAO.md](docs/CONFIGURACAO.md).

```powershell
npm install
npm test
npm run build
npm run lint
npm run dev
```

Preserve seu `.env` e acrescente as variáveis de `.env.example`. Execute as migrações em `supabase/migrations` no projeto Supabase antes de ativar contas. Chaves privadas ficam somente no ambiente do servidor. Sem essa configuração, a integração online ainda não está ativa.

O catálogo de temas vem do seletor existente em `index.html`. A meta operacional é 300 questões validadas por tema, abastecidas gradualmente; o repositório não contém um banco já populado. O app mantém a identidade visual, os modos existentes e o histórico local.
