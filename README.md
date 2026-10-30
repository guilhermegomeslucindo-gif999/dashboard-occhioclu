# Painel Occhio Blu · Meta Ads

Painel de performance da conta de anúncios **CA – Occhio Blu** (act_465585599582830), feito pela QH4.

Ele busca tudo **ao vivo** na API de Marketing do Meta sempre que alguém abre ou recarrega a página:

- campanhas novas aparecem sozinhas, inclusive as ativas que ainda não gastaram;
- anúncios novos aparecem sozinhos, com capa, formato (vídeo ou imagem), status e link para a prévia e para o Gerenciador;
- vendas, faturamento, CPA e ROAS são preenchidos automaticamente quando o Meta registrar compras (pixel, API de Conversões ou WhatsApp);
- cada número é comparado com o período anterior de mesmo tamanho.

Ninguém precisa mexer no código quando uma campanha ou um anúncio for criado.

---

## Como funciona

```
Navegador (index.html)  →  /api/meta (função da Vercel)  →  API do Meta
```

O token do Meta fica **só no servidor**, nas variáveis de ambiente da Vercel. Ele nunca aparece no navegador nem no GitHub.
A resposta fica guardada por até 1 minuto para a página abrir rápido. O botão **“Atualizar agora”** busca na hora.

| Arquivo | O que é |
|---|---|
| `index.html` | O painel (visual, filtros, temas, gráficos, galeria de anúncios) |
| `api/meta.js` | Função de servidor que consulta o Meta e devolve os dados prontos |
| `vercel.json` | Configurações da Vercel (bloqueia o Google de indexar o painel) |
| `test/meta.test.js` | Testes da função com dados simulados (`npm test`) |
| `.env.example` | Modelo das variáveis de ambiente |

---

## 1. Gerar o token do Meta (uma vez só)

O ideal é um token de **Usuário do Sistema**, porque ele **não expira**.

1. Se você ainda não tem um app: em **developers.facebook.com → Meus apps → Criar app**, escolha o tipo **Empresa** e vincule ao portfólio da QH4.
2. No **Gerenciador de Negócios** (business.facebook.com) → **Configurações do negócio** → **Usuários → Usuários do sistema** → **Adicionar**. Crie, por exemplo, “Painel QH4”, com função **Administrador** ou **Funcionário**.
3. Com o usuário criado, clique em **Atribuir ativos** → **Contas de anúncios** → marque **CA – Occhio Blu** → dê pelo menos a permissão de **ver desempenho**.
4. Ainda em **Atribuir ativos**, adicione também o **app** do passo 1 ao usuário.
5. Clique em **Gerar novo token** → escolha o app → em validade, escolha **Nunca** → marque a permissão **`ads_read`** → **Gerar**.
6. Copie o token e guarde em lugar seguro. Ele é a “senha” de leitura da conta.

> Para usar o mesmo painel com outro cliente, basta dar acesso à conta desse cliente ao mesmo Usuário do Sistema e trocar `META_AD_ACCOUNT_ID`.

## 2. Subir no GitHub

1. Crie um repositório (de preferência **privado**), por exemplo `occhioblu-dashboard`.
2. Envie todos os arquivos desta pasta. **Não** envie nenhum arquivo `.env` com o token; o `.gitignore` já impede isso.

## 3. Publicar na Vercel

1. Em **vercel.com → Add New → Project**, importe o repositório.
2. Em **Framework Preset**, deixe **Other**. Não há comando de build.
3. Antes de clicar em Deploy, abra **Environment Variables** e cadastre:

| Nome | Valor | Obrigatória |
|---|---|---|
| `META_ACCESS_TOKEN` | o token do passo 1 | sim |
| `META_AD_ACCOUNT_ID` | `465585599582830` | não (já é o padrão) |
| `META_APP_SECRET` | a chave secreta do app (Configurações → Básico) | não, mas deixa mais seguro |
| `META_API_VERSION` | `v23.0` | não |

4. Clique em **Deploy**. Pronto: o link da Vercel é o painel.

Se mudar alguma variável depois, vá em **Deployments → ⋯ → Redeploy** para valer.

## 4. Compartilhar

Qualquer pessoa com o link vê o painel: você, outro gestor ou a cliente. Não precisa de login nem de conta no Meta.
O link guarda o período e a campanha escolhidos, por exemplo `…/?inicio=2026-10-01&fim=2026-10-31&campanha=120252327956700463`.
Tema e paleta ficam salvos no navegador de cada pessoa.

O painel não aparece no Google (`noindex`). Se quiser exigir senha, a Vercel tem **Password Protection** nos planos pagos, ou dá para adicionar uma senha simples na função.

---

## Definições dos números

- **Leads** = conversas iniciadas no WhatsApp (`messaging_conversation_started_7d`, pessoas sem contato há 7+ dias) + cadastros (`lead`).
- **Cliques no link** = `inline_link_clicks`.
- **Vendas / Faturamento** = `omni_purchase` (todas as fontes que o Meta registra). Se não existir, usa `purchase`.
- **CTR** = cliques no link ÷ impressões · **CPC** = investimento ÷ cliques no link · **Custo por lead** = investimento ÷ leads
- **CPA** = investimento ÷ vendas · **ROAS** = faturamento ÷ investimento
- **Atribuição**: a mesma configurada em cada conjunto de anúncios, igual ao Gerenciador (`use_unified_attribution_setting`).
- **Período anterior**: o mesmo número de dias, logo antes do período escolhido.

Quais campanhas e anúncios aparecem: os que **tiveram entrega no período** + todos os que estão **ativos agora**, mesmo sem gasto.

## Problemas comuns

| Mensagem no painel | O que fazer |
|---|---|
| “Falta configurar a variável META_ACCESS_TOKEN” | Cadastre o token na Vercel e faça o Redeploy |
| “O token do Meta expirou ou é inválido” | Gere um novo token (passo 1) e atualize a variável |
| “O token não tem acesso a esta conta” | Atribua a conta de anúncios ao Usuário do Sistema e confirme a permissão `ads_read` |
| “O Meta limitou as consultas” | Espere alguns minutos. Acontece se muita gente recarregar ao mesmo tempo |
| Capa “indisponível” | O link da imagem do Meta venceu. Recarregue a página |

## Testar no computador (opcional)

```bash
npm i -g vercel
cp .env.example .env.local   # e cole o token
vercel dev                   # abre em http://localhost:3000
npm test                     # testes da função, sem acessar o Meta
```
