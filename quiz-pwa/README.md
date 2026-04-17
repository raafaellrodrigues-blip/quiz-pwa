# QuizIA — Quiz Interativo com Inteligência Artificial

> Quiz PWA no estilo ENEM com perguntas geradas pelo Claude (Anthropic)

---

## 📁 Estrutura do Projeto

```
quiz-pwa/
├── index.html          ← App principal (HTML único)
├── style.css           ← Estilos (dark theme, mobile-first)
├── app.js              ← Lógica: jogo, cache, leaderboard, SW
├── sw.js               ← Service Worker (PWA offline)
├── manifest.json       ← Manifesto PWA
├── vercel.json         ← Configuração de deploy
├── package.json        ← Dependências Node.js
├── .env.example        ← Modelo de variáveis de ambiente
├── .gitignore
├── api/
│   └── quiz.js         ← Serverless function (chama Claude AI)
└── public/
    └── icons/
        ├── icon-192.png   ← Ícone PWA (192x192)
        └── icon-512.png   ← Ícone PWA (512x512)
```

---

## 🚀 PASSO A PASSO: Do Zero ao Deploy

### ETAPA 1 — Pré-requisitos

Instale estas ferramentas antes de começar:

- **Node.js 18+**: https://nodejs.org/
- **Git**: https://git-scm.com/
- **VS Code**: https://code.visualstudio.com/
- **Conta GitHub**: https://github.com/
- **Conta Vercel**: https://vercel.com/ (use login com GitHub)
- **Conta Anthropic**: https://console.anthropic.com/

---

### ETAPA 2 — Obter a API Key do Claude

1. Acesse https://console.anthropic.com/
2. Clique em **API Keys** no menu lateral
3. Clique em **Create Key**
4. Dê um nome (ex: `quiz-ia-pwa`)
5. Copie a chave gerada (começa com `sk-ant-api03-...`)
6. **Guarde em lugar seguro** — ela não aparece novamente!

---

### ETAPA 3 — Configurar localmente

Abra o terminal no VS Code (`Ctrl + J` ou `Cmd + J`):

```bash
# 1. Entre na pasta do projeto
cd quiz-pwa

# 2. Instale as dependências
npm install

# 3. Crie o arquivo .env a partir do exemplo
cp .env.example .env
```

Abra o arquivo `.env` no VS Code e substitua:
```
ANTHROPIC_API_KEY=sk-ant-api03-SUA-CHAVE-REAL-AQUI
```

---

### ETAPA 4 — Criar os ícones PWA

Você precisa de 2 ícones PNG na pasta `public/icons/`:
- `icon-192.png` (192×192 pixels)
- `icon-512.png` (512×512 pixels)

**Opção rápida:** Use https://favicon.io/ para gerar ícones gratuitos.
Ou use qualquer imagem PNG e redimensione com https://squoosh.app/

---

### ETAPA 5 — Testar localmente com Vercel CLI

```bash
# Instale o Vercel CLI globalmente
npm install -g vercel

# Faça login na Vercel (abre o navegador)
vercel login

# Inicie o servidor de desenvolvimento local
vercel dev
```

Acesse `http://localhost:3000` no navegador.
O quiz vai carregar e as perguntas serão geradas pelo Claude!

---

### ETAPA 6 — Criar repositório no GitHub

**Via terminal:**
```bash
# Dentro da pasta quiz-pwa

# Inicializa o repositório Git
git init

# Adiciona todos os arquivos (o .gitignore já exclui .env e node_modules)
git add .

# Primeiro commit
git commit -m "feat: QuizIA PWA com Claude AI"

# Cria repositório no GitHub (precisa do GitHub CLI instalado)
# OU faça manualmente no site: github.com/new
gh repo create quiz-ia-pwa --public --source=. --push
```

**Via GitHub.com (sem CLI):**
1. Acesse https://github.com/new
2. Nome: `quiz-ia-pwa`
3. Marque como **Public**
4. NÃO inicialize com README (já temos um)
5. Clique **Create repository**
6. No terminal, rode os comandos mostrados na página (algo como):
```bash
git remote add origin https://github.com/SEU-USUARIO/quiz-ia-pwa.git
git branch -M main
git push -u origin main
```

---

### ETAPA 7 — Deploy na Vercel

**Opção A — Via site (recomendado):**
1. Acesse https://vercel.com/new
2. Clique em **Import Git Repository**
3. Selecione seu repositório `quiz-ia-pwa`
4. Clique em **Deploy** (as configurações do `vercel.json` são detectadas automaticamente)

**Opção B — Via terminal:**
```bash
vercel --prod
```

---

### ETAPA 8 — Configurar a API Key na Vercel (OBRIGATÓRIO)

1. Acesse o dashboard da Vercel: https://vercel.com/dashboard
2. Clique no projeto `quiz-ia-pwa`
3. Vá em **Settings** → **Environment Variables**
4. Clique em **Add New**:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** `sk-ant-api03-SUA-CHAVE-AQUI`
   - **Environment:** marque **Production**, **Preview** e **Development**
5. Clique em **Save**
6. Vá em **Deployments** → clique nos 3 pontinhos do último deploy → **Redeploy**

Pronto! Seu quiz estará disponível em `https://quiz-ia-pwa.vercel.app` 🎉

---

## 🔄 Atualizações futuras

Para atualizar o projeto após mudanças:

```bash
git add .
git commit -m "feat: descrição da mudança"
git push
```

A Vercel faz o redeploy automaticamente a cada push!

---

## ⚙️ Como funciona a IA

```
Usuário clica "Gerar Quiz"
        ↓
app.js verifica cache local (6h de validade)
        ↓ (sem cache)
Chama /api/quiz?difficulty=misto
        ↓
api/quiz.js envia prompt para Claude AI
        ↓
Claude gera 20 questões em JSON
        ↓
API valida, filtra e retorna
        ↓
app.js embaralha, escolhe 10 e exibe
        ↓
Resultado salvo no localStorage (cache + leaderboard)
```

---

## 💰 Custo estimado da API

| Uso | Custo aproximado |
|-----|-----------------|
| 1 geração de quiz | ~$0.003 (menos de 1 centavo) |
| 100 partidas/mês | ~$0.30 |
| 1.000 partidas/mês | ~$3.00 |

O cache local de 6 horas reduz drasticamente o número de chamadas à API.

---

## 🐛 Solução de Problemas

**"Erro ao gerar perguntas"**
→ Verifique se `ANTHROPIC_API_KEY` está configurada corretamente na Vercel

**"API key inválida"**
→ A chave deve começar com `sk-ant-api03-`

**Ícones não aparecem no celular**
→ Certifique-se de que `public/icons/icon-192.png` e `icon-512.png` existem

**Quiz não funciona offline**
→ Acesse o site uma vez com internet para o Service Worker fazer o cache

---

## 📱 Instalar como app no celular

**Android (Chrome):**
Menu → "Adicionar à tela inicial"

**iPhone (Safari):**
Compartilhar → "Adicionar à Tela de Início"

---

## 📄 Licença

MIT — use livremente, dê os créditos 💜
