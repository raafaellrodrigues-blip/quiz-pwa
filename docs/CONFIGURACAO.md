# RaciocineIA — contas, banco e operação

## O que foi implementado

A PWA existente continua em HTML/CSS/JS e usa funções Node na Vercel. Supabase Auth fornece contas; Postgres guarda perfis, questões, partidas, respostas, uso, medalhas e importações. O navegador recebe apenas a URL e chave pública por `/api/config`. As funções validam o token no Supabase antes de usar o identificador do usuário. A chave privilegiada fica no servidor.

A integração precisa ser ativada seguindo este guia. Não há banco criado, credenciais inventadas nem acervo pré-carregado. O estoque real deve ser consultado depois da configuração.

## 1. Preparar o projeto

1. Preserve seu `.env` atual. Acrescente nele somente as variáveis necessárias de `.env.example`.
2. Use Node 22 ou superior, abra o terminal nesta pasta e execute `npm install`.
3. Execute `npm test`, `npm run build` e `npm run lint`.
4. As mudanças locais que já existiam foram preservadas. Revise `git status` antes de escolher os arquivos para seu commit. Nunca inclua `.env`.

## 2. Criar o Supabase e aplicar o SQL

1. Crie um projeto no painel Supabase e guarde a senha do banco em seu gerenciador de senhas.
2. Abra o SQL Editor do projeto.
3. Execute os arquivos de `supabase/migrations` em ordem de nome, uma única vez cada. Comece com `202611120001_accounts_questions.sql`. Alternativamente, conecte a CLI Supabase ao projeto e use `supabase db push`.
4. Confira no Table Editor: `profiles`, `questions`, `game_sessions`, `question_attempts`, `question_usage`, `user_progress`, `user_achievements`, `generation_runs` e `generation_budget`.
5. Confira RLS habilitada. `anon` não pode ler dados privados. Usuários autenticados só leem seus próprios registros permitidos. Partidas completas e questões com gabarito só são lidas pelo servidor.
6. Em Project Settings / API, copie a URL, a chave pública anon (ou publishable compatível) e a chave privada service_role (ou secret compatível). Os nomes das áreas do painel podem variar.
7. Não rode a migração de novo sobre as mesmas tabelas. Faça backup antes de futuras alterações.

Referências oficiais: [Auth](https://supabase.com/docs/guides/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [dados dos usuários](https://supabase.com/docs/guides/auth/managing-user-data).

## 3. Configurar cadastro e recuperação de senha

1. Em Authentication / Providers, habilite Email e mantenha a confirmação de e-mail para produção.
2. Em Authentication / URL Configuration, configure Site URL como a URL HTTPS definitiva da Vercel.
3. Cadastre essa URL com `/` na lista permitida de redirecionamentos. Para desenvolvimento, adicione `http://localhost:3000/`. Adicione URLs de preview específicas somente quando for testar nelas.
4. Configure um serviço SMTP para envio de e-mails de produção e teste um cadastro real e um link de recuperação.
5. No aplicativo, clique em Entrar / Criar conta, confirme o e-mail e entre. Para recuperar acesso, informe o e-mail e clique em Recuperar senha. Ao abrir o link recebido, informe a nova senha em Minha conta e clique em Atualizar senha.
6. O usuário escolhe seu nome público em Minha conta. A participação no ranking é obrigatória para todas as contas. Essa regra é informada na tela inicial de acesso.

## 4. Configurar Vercel

Em Settings / Environment Variables do projeto existente, adicione:

| Variável | Valor / finalidade |
| --- | --- |
| `APP_ORIGIN` | URL exata do site, sem barra final |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave pública destinada ao navegador |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave privada exclusiva das funções |
| `ADMIN_GENERATION_TOKEN` | Segredo aleatório longo para administração |
| `GENERATION_DAILY_BATCHES` | Limite global de lotes por dia; padrão 10 |
| `GROQ_API_KEY`, `GEMINI_API_KEY` ou `OPENROUTER_API_KEY` | Configure pelo menos um provedor existente |

Mantenha `ALLOW_PLAY_REPLENISH=false`, `ALLOW_AI_DB_FALLBACK=false` e `ALLOW_LEGACY_AI=false` inicialmente. O reabastecimento administrativo facilita controlar gastos. O fallback de banco para IA exige login quando habilitado. Sem Supabase, `ALLOW_LEGACY_AI=true` permite deliberadamente o fluxo público anterior e deve ser usado apenas quando você quiser essa operação.

Gere o token administrativo localmente com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` e copie-o para seu `.env` e para a Vercel. Não o inclua em capturas públicas, repositório ou frontend.

Selecione os ambientes corretos, salve e faça Redeploy. As variáveis entram em uma nova implantação. Referência: [variáveis da Vercel](https://vercel.com/docs/environment-variables/managing-environment-variables).

Para testar localmente, use `npm run dev` e configure `APP_ORIGIN=http://localhost:3000` no ambiente local. Um servidor estático sozinho não executa `/api`.

## 5. Abastecer o acervo gradualmente

A meta é 100 fáceis + 100 médias + 100 difíceis por tema específico: 300 por tema. Os temas são lidos diretamente do seletor em `index.html`. Aleatório usa o catálogo existente.

No terminal, com `APP_ORIGIN` e `ADMIN_GENERATION_TOKEN` no `.env`:

```powershell
# Ver contagem real
node --env-file=.env scripts/stock.js inventory
# Planejar um lote, sem chamar IA nem inserir
node --env-file=.env scripts/stock.js fill
# Gerar até 5 questões em um lote
node --env-file=.env scripts/stock.js fill --apply
# Executar sequencialmente até 3 lotes, respeitando o orçamento diário
node --env-file=.env scripts/stock.js fill --apply --batches=3
```

Repita em dias seguintes até alcançar o estoque. Reiniciar retoma as faixas incompletas. Cada requisição gera no máximo 10 itens e faz no máximo duas tentativas. Há trava por tema/dificuldade no banco; travas de processos interrompidos expiram em 10 minutos. A reserva diária de lotes é global e transacional; uma tentativa que falhe também consome orçamento, de modo conservador. Cada lote aparece em `generation_runs`. O CLI nunca imprime o token.

`validated` significa formato aprovado automaticamente, não revisão humana. `reviewed` indica revisão humana. Possíveis semelhantes ficam em `candidate`, fora do jogo e da meta. Revise enunciado, alternativas, gabarito e explicação antes de promover um candidato. `disabled` retira uma questão do jogo. Não apague questões usadas: as referências impedem apagar histórico acidentalmente.

Exemplo de inventário direto no SQL Editor:

```sql
select topic, difficulty, status, count(*)
from public.questions
group by topic, difficulty, status
order by topic, difficulty, status;
```

O banco impõe identidade única global por enunciado normalizado e assinatura de conteúdo, incluindo em importações e atualizações diretas. A triagem textual usa similaridade de palavras como detector de candidatos; não equivale a compreensão semântica e não substitui revisão. Enunciados iguais com alternativas diferentes são tratados conservadoramente como duplicatas.

## 6. Migrar o progresso antigo

1. Entre na conta usando o navegador onde o histórico antigo está salvo.
2. Em Minha conta, clique em Importar progresso deste dispositivo.
3. Espere a confirmação do servidor.
4. Entre em outro navegador e confira Meu Progresso.

Regra: uma importação por conta, registrada transacionalmente no servidor. O agregado local entra como base e é somado às novas partidas da conta. Não substitui partidas remotas. Histórico e medalhas são unidos; o histórico visível mantém até 50 resultados. A migração preserva as cinco chaves antigas; pontuações do ranking antigo são preservadas no arquivo de importação privado, sem ingresso no ranking público. Repetir o pedido não soma a base de novo. Faça a primeira importação no dispositivo com o histórico mais completo. Dados locais não são apagados ao sair ou importar.

Cada conta tem armazenamento local separado do visitante e das outras contas. Partidas de prática concluídas ficam numa fila por conta e UUID. A reconexão reenvia os eventos; o banco rejeita duplicação pelo ID. O app só indica Sincronizado depois da confirmação. Não limpe os dados do navegador enquanto houver eventos pendentes. O botão Sincronizar novamente permite repetir tentativas.

## 7. Regras do ranking e integridade

O ranking geral soma pontos de partidas online concluídas e validadas. O semanal usa segunda-feira à meia-noite no fuso America/Sao_Paulo. Desempates: menor número de partidas, primeiro resultado concluído e nome público. Cada resposta é validada no banco com a partida bloqueada na transação; reenvio da mesma posição retorna o mesmo resultado. Pontuação final enviada pelo navegador não é aceita.

As regras de referência são 10/15/25 pontos por acerto fácil/médio/difícil, bônus de 5 por acerto anterior do combo, 20 XP por acerto e 10 XP ao concluir a partida. O servidor usa o horário de recebimento para os modos cronometrados com tolerância de rede. Sessões expiram em 24 horas; no máximo 20 partidas online iniciadas por conta por hora. Estudo continua elegível, como nos modos anteriores. Histórico importado e prática offline não são elegíveis.

O ranking só expõe posição, nome público, pontos e número de partidas; e-mail e IDs privados não são enviados. A rota aceita páginas de 20 jogadores via `page`, além de filtros `period=all|week`. O frontend mostra a primeira página; resultados locais permanecem acessíveis por botão.

Nenhum quiz público pode impedir consulta externa às respostas, automação ou múltiplas contas apenas com essas medidas. Para competição com prêmio, acrescente moderação, limites por IP na borda e detecção de abuso.

## 8. Conferência final no ambiente configurado

1. Cadastre contas A e B; confirme e-mails. Teste login, recarga, logout e recuperação.
2. Gere um lote; confira contagens e status no SQL. Abasteça pelo menos 10 questões compatíveis antes de testar partida online.
3. Como A, jogue uma partida. Confira uma sessão, 10 respostas, XP e medalhas. Reenvie uma resposta pelo painel de rede: a pontuação não deve duplicar.
4. Entre como A em outro navegador. Confira os mesmos dados.
5. Como B, verifique que não vê dados privados de A. Um pedido ao Supabase com token de B não deve ler registros de A. Escritas diretas em progresso, sessões e respostas devem ser negadas.
6. Escolha o nome público de A e confira sua participação automática nos rankings geral e semanal. Uma atualização com listed=false deve ser rejeitada após a segunda migração.
7. Simule falta de rede durante a prática local. Conclua, reconecte e sincronize duas vezes; confira que só uma partida foi registrada.
8. Importe o mesmo progresso antigo duas vezes e confira que os totais não duplicam.
9. Tente inserir duas questões com diferenças triviais de acentuação/pontuação ao mesmo tempo; apenas uma deve ser aceita. Revise possíveis semelhantes em `candidate`.
10. Inspecione os arquivos servidos: nenhuma chave privada ou `.env` deve estar disponível. O Service Worker não deve guardar requisições de API ou Auth.

## 9. Backup e exclusão

Configure os backups disponíveis no seu plano Supabase. Antes de migrações, exporte o banco por ferramenta oficial (`supabase db dump` ou `pg_dump`) e armazene a cópia fora do repositório, com acesso restrito. Teste restauração em um projeto separado. Confira também a política de backup dos usuários Auth; backup só das tabelas públicas não recria credenciais de autenticação.

Exclusão de conta é administrativa nesta versão: confirme a solicitação do titular e exclua o usuário em Authentication / Users no Supabase. As FKs com cascade apagam perfil, sessões, respostas, progresso, uso e medalhas dessa conta. O acervo compartilhado permanece. Faça essa ação apenas para o usuário confirmado, pois é irreversível sem backup. O frontend não oferece exclusão ainda.

## Limites e diagnóstico

Sem credenciais não é possível verificar e-mail real, políticas no projeto remoto, entrega SMTP, latência nem deploy. Estoque vazio é mostrado como indisponível; não há 300 questões fictícias. No modo local sem rede, só é possível jogar com questões previamente armazenadas.

Se uma partida online perder conexão ao responder, ela aguarda nova tentativa na mesma pergunta; não muda silenciosamente para resultado competitivo local. O progresso de uma partida concluída fica no servidor, mesmo se a consulta seguinte falhar. Recarregar uma partida online em andamento ainda não retoma a tela; sessões incompletas não pontuam. Evite trocar de conta durante o jogo.

Problemas comuns: confira APP_ORIGIN exato para erro de origem; confirme todas as migrações para falha de banco; configure URL de redirecionamento e SMTP para e-mail; consulte estoque para falta de questões; verifique os logs Vercel e generation_runs sem publicar chaves. Providers podem mudar modelos e limites; as variáveis *_MODEL continuam configuráveis.

## Validação realizada nesta entrega

- 23 testes passaram, preservando os testes existentes e acrescentando testes de APIs, sincronização e banco.
- A migração foi executada em PostgreSQL local via PGlite, com testes de RLS entre duas contas, deduplicação, pontuação, reenvio e importação idempotente. Isso não substitui conferir o projeto Supabase real após aplicar o SQL.
- Build e lint verificam a sintaxe dos 17 arquivos JavaScript e das configurações JSON; não há etapa de compilação para esta PWA estática.
- A auditoria das dependências de produção ficou sem alertas após atualizar `form-data`. Permanecem 22 alertas na árvore de desenvolvimento do projeto, que inclui o Vercel CLI existente; a atualização ampla dessas ferramentas exige avaliação separada de compatibilidade.
- E-mails reais, telas em navegador, deploy e integração remota ainda precisam da conferência descrita na etapa 8.

Arquivos principais: `cloud.js` integra Auth e fila; `api/account.js`, `api/game.js`, `api/leaderboard.js`, `api/config.js` e `api/admin-questions.js` expõem as rotas; `lib/` contém acesso ao banco, catálogo e validação; `supabase/migrations/` cria o banco; `scripts/stock.js` opera o acervo. `app.js`, `index.html`, `style.css`, `sw.js` e `vercel.json` foram adaptados. `.env.example`, README e este guia documentam a ativação. O `.env` existente não foi alterado.

O orçamento `GENERATION_DAILY_BATCHES` limita lotes administrativos iniciados, não tokens nem custo monetário. Um lote pode fazer duas tentativas, e cada tentativa pode percorrer os provedores configurados. Ajuste a cota e os limites nos provedores de acordo com seu orçamento. O fallback `ALLOW_AI_DB_FALLBACK`, se habilitado deliberadamente, fica fora desse orçamento de lotes administrativos; mantenha desativado até definir limites apropriados na sua infraestrutura.

## Atualização: login inicial e ranking obrigatório

O aplicativo agora abre em uma página de login. Jogo, progresso e ranking exigem uma conta autenticada. Uma sessão válida já salva permite continuar sem digitar a senha novamente; ao sair ou expirar a sessão, a tela inicial de acesso volta. A prática offline depende de entrar na conta primeiro. As APIs de questões e ranking também exigem token válido.

Quem já executou a primeira migração deve executar **somente** `supabase/migrations/202611120002_required_ranking.sql` no SQL Editor. Ela ativa o ranking nos perfis existentes, define o padrão para novas contas e impede gravar `listed=false`. Não execute novamente a primeira migração. O código passa a ativar o ranking também ao carregar uma conta antiga, para compatibilidade durante a atualização. O critério de pontos continua usando apenas partidas online concluídas e validadas; prática e histórico importado ficam privados.

A nova regra substitui as referências antigas deste guia a acesso de visitantes ou participação opcional. O fluxo de entrada oferece login, cadastro e recuperação de senha; a informação de ranking obrigatório fica visível antes de criar a conta. Somente nome público e métricas de jogo são compartilhados. Teste também abrir uma janela anônima: o conteúdo de estudo deve ficar bloqueado até entrar. Ao sair, o aplicativo deve voltar ao login imediatamente.

## Correção de avanço e retomada de partidas

O avanço de questão agora é bloqueado durante a transição, impedindo que clique repetido ou sobreposição do avanço automático pule uma pergunta. Quando uma resposta falha, a escolha original fica disponível para reenvio pelo botão de tentativa. Uma resposta já gravada é recuperada sem conceder pontos novamente.

A página inicial mostra **Retomar partida** quando há uma sessão online incompleta das últimas 24 horas. A retomada usa o número de respostas confirmadas no banco, restaura o placar e os combos e reabre a primeira questão pendente. Essa funcionalidade substitui a limitação anterior sobre recarregar partidas em andamento. Não é necessária nova migração SQL para esta correção.
