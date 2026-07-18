# Liga de Poker · Clube Alto dos Pinheiros

Aplicativo web para gerenciar e acompanhar o ranking da liga de poker do CAP.

- **Área pública** — aberta, somente leitura: ranking da temporada, histórico de etapas,
  estatísticas por jogador e filtros.
- **Painel de administração** — protegido por senha: cadastros, lançamento de etapas com cálculo
  automático de pontuação e premiação, e todas as regras editáveis.

Feito com **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase**, pronto para deploy na
Vercel.

---

## Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Configurar o Supabase](#configurar-o-supabase)
3. [Rodar localmente](#rodar-localmente)
4. [Migrations e seed](#migrations-e-seed)
5. [Deploy na Vercel](#deploy-na-vercel)
6. [Regras de negócio](#regras-de-negócio)
7. [Estrutura do projeto](#estrutura-do-projeto)
8. [Testes](#testes)

---

## Pré-requisitos

- **Node.js 20 ou superior** (o projeto foi desenvolvido com a 24)
- **npm**
- Uma conta gratuita no [Supabase](https://supabase.com)
- Uma conta na [Vercel](https://vercel.com) e no [GitHub](https://github.com), para publicar

---

## Configurar o Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto novo. Escolha a região
   **South America (São Paulo)** para menor latência.
2. Guarde a senha do banco que o Supabase pedir para você definir.
3. Com o projeto criado, vá em **Project Settings → API** e copie três valores:

| No painel do Supabase | Vai para a variável |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Project API keys → `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Project API keys → `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` |

> A **Project URL** aparece no painel do Supabase com `/rest/v1/` no final. Pode colar com ou sem
> o sufixo — o app corta automaticamente (`lib/supabase/url.ts`). Colar com o sufixo era o erro
> que deixava o site no ar mas sem carregar dado nenhum.

> A chave `anon` é pública por natureza (vai no navegador) e, pelas políticas de segurança
> configuradas nas migrations, só consegue **ler**. A chave `service_role` ignora todas as
> restrições e **nunca** pode ser exposta: ela só é usada no servidor, dentro do painel de admin.

4. Crie o arquivo de ambiente a partir do modelo:

   ```bash
   cp .env.example .env.local
   ```

5. Preencha o `.env.local` com os três valores acima, mais:

   - `ADMIN_PASSWORD` — a senha do painel `/admin`. Escolha algo longo.
   - `SESSION_SECRET` — segredo que assina o cookie de sessão. Gere com:

     ```bash
     openssl rand -hex 32
     ```

---

## Rodar localmente

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>.

Se o `.env.local` ainda não estiver preenchido, o app abre uma tela explicando o que falta em vez
de dar erro — dá para rodar e ver a interface antes de conectar o banco.

---

## Migrations e seed

### 1. Criar as tabelas

No painel do Supabase, abra **SQL Editor** e execute os arquivos de `supabase/migrations/`
**na ordem**:

1. `0001_schema.sql` — tabelas, tipos, índices e restrições
2. `0002_rls.sql` — políticas de segurança (leitura pública, escrita bloqueada)

Cole o conteúdo de cada arquivo, rode, confira que deu certo, e só então passe para o próximo.

> Se preferir usar a [Supabase CLI](https://supabase.com/docs/guides/cli):
> `supabase link --project-ref <ref>` seguido de `supabase db push`.

### 2. Importar a temporada 2026

O arquivo `data/2026.xlsx` é a planilha original da liga. O seed lê essa planilha e popula o banco:

```bash
npm run seed
```

Ele é **idempotente** — pode rodar quantas vezes quiser, que atualiza em vez de duplicar. Ao final
imprime um resumo para conferência:

```
Jogadores ............. 56
Etapas ................ 7
Participações ......... 171
Líder do ranking ...... Ligia (174 pontos)
Reserva da Final ...... R$ 5.210
```

**O que o seed importa e o que não importa.** A planilha registrava apenas a *pontuação* de cada
jogador por etapa e o total do pote. Então:

| Dado | Vem do seed? |
| --- | --- |
| Jogadores, etapas, pontos por etapa | ✅ |
| Colocação de cada jogador | ✅ derivada dos pontos (55 → 1º, 48 → 2º, …) |
| Arrecadação total de cada etapa | ✅ deduzida da linha dos 10% |
| Valor gasto por jogador | ❌ não existia na planilha |
| Prêmio pago a cada jogador | ❌ não existia na planilha |
| Sócio ou convidado, nº de sócio | ❌ todos entram como **“a definir”** |

Os dois últimos blocos são preenchidos pelo painel de admin. As etapas com pendência aparecem
destacadas em `/admin`.

**Colocações duplicadas.** A planilha de Jan/26 tem dois jogadores com 28 pontos e dois com 20 —
ou seja, dois “6º lugares” e dois “8º lugares”. São erros de digitação do arquivo original. O seed
importa os quatro e marca a participação como **“revisar”**; abrir a etapa no admin e salvar o
resultado limpa a marcação.

### 3. Conferir os números

| Comando | O que faz |
| --- | --- |
| `npm run checar` | Diz quais variáveis faltam e quais tabelas já existem |
| `npm run verificar` | Planilha → ranking, sem tocar no banco |
| `npm run verificar:banco` | Planilha → seed → Supabase → queries do app → ranking |
| `npm run verificar:rls` | Tenta escrever com a chave pública e falha se conseguir |
| `npm run sql` | Junta as migrations num arquivo só, para colar no SQL Editor |
| `npm run verificar:limite` | Testa o limite de tentativas de login contra o banco |
| `npm run destravar` | Limpa o histórico de tentativas, se você se bloquear |

O `verificar:banco` é o mais importante depois do seed: ele lê **do banco**, pelo mesmo código que
roda em produção, e compara com a planilha. É o que prova que o dado sobreviveu à ida e volta.

---

## Deploy na Vercel

### 1. Subir para o GitHub

O repositório já vem inicializado. Crie um repositório vazio no GitHub e conecte:

```bash
git remote add origin https://github.com/<seu-usuario>/<seu-repo>.git
git branch -M main
git push -u origin main
```

> O `.gitignore` já bloqueia `.env.local`. **Nunca** comite chaves do Supabase.

### 2. Importar na Vercel

1. Em [vercel.com/new](https://vercel.com/new), escolha **Import Git Repository** e selecione o
   repositório.
2. A Vercel detecta Next.js sozinha — não precisa mudar nada em build/output.
3. Em **Environment Variables**, cadastre as cinco variáveis, para os ambientes
   *Production*, *Preview* e *Development*:

   | Variável | Onde pegar |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (secret) |
   | `ADMIN_PASSWORD` | você escolhe |
   | `SESSION_SECRET` | `openssl rand -hex 32` |

4. Clique em **Deploy**.

A partir daí, todo `git push` para `main` publica automaticamente.

> As migrations e o seed rodam contra o Supabase, não contra a Vercel — se você já executou os
> passos anteriores, o site sobe com os dados prontos.

---

## Regras de negócio

### Pontuação

| Colocação | Pontos | | Colocação | Pontos |
| --- | --- | --- | --- | --- |
| 1º | 55 | | 9º | 17 |
| 2º | 48 | | 10º | 15 |
| 3º | 43 | | 11º | 13 |
| 4º | 38 | | 12º | 11 |
| 5º | 33 | | 13º | 9 |
| 6º | 28 | | 14º | 7 |
| 7º | 23 | | 15º | 6 |
| 8º | 20 | | **16º ou pior** | **5** |

Toda a tabela, incluindo a faixa “16º ou pior”, é editável em **Admin → Configurações**, por
temporada. Alterar a tabela **não** recalcula etapas já lançadas: os pontos ficam gravados como
foram salvos, para o histórico não mudar retroativamente.

### Desempate no ranking

Nesta ordem: **pontos** → **etapas vencidas** → **2º lugares** → **3º lugares** →
**melhor colocação individual** → **nome (A-Z)**.

O último critério existe para a ordem nunca depender de sorte: dois jogadores empatados em tudo
sempre aparecem na mesma sequência.

### Valores da mesa (padrão, editáveis)

- Buy-in: **R$ 150,00**
- Re-buy: **R$ 100,00** cada, sem limite de quantidade
- Add-on: **R$ 150,00**, após 90 minutos de jogo

Ao lançar uma etapa, o admin informa o **valor gasto** de cada jogador. Os campos “re-buys” e
“add-on” são apenas um auxiliar: o botão *Recalcular gastos pelos re-buys* preenche o valor a
partir deles, mas o campo que vale é sempre o valor digitado.

### Premiação de cada etapa

```
arrecadação (soma de tudo que os jogadores gastaram)
  ├─ 10%  ──────────────────────────► reserva, acumula para a Etapa Final
  └─ restante (distribuível)
       ├─ 1º lugar: 50% do distribuível
       ├─ 2º lugar: 30% do distribuível
       ├─ 4º lugar: R$ 150,00 fixo
       └─ 3º lugar: A DIFERENÇA (o que sobrar após 1º, 2º e 4º)
```

O 3º lugar é calculado por diferença de propósito: garante que a soma feche exata, sem sobra de
centavo por arredondamento.

Essa distribuição é **apenas uma sugestão pré-preenchida**. O admin pode sobrescrever qualquer
valor, premiar o 5º lugar, ou fazer uma divisão combinada entre os jogadores. Um aviso
**não-bloqueante** mostra se `prêmios pagos + reserva` bate com a arrecadação.

### Etapa Final

- Marcada com a flag *“É a Etapa Final”* na tela de Etapas.
- Distribui a **reserva acumulada** de todas as etapas da temporada, e não separa reserva nova.
- Os convidados são sugeridos automaticamente: os **20 primeiros** (quantidade editável) do
  ranking até a etapa marcada como *corte* (normalmente Outubro). Se alguém não puder participar,
  basta remover da lista e adicionar o próximo colocado — a lista é totalmente livre.

### Como ler as colunas do ranking

| Coluna | Significa |
| --- | --- |
| **Pago** | Quanto o jogador **gastou** (buy-in + re-buys + add-on), somando as etapas |
| **Arrecadado** | Quanto o jogador **recebeu** de premiação, somando as etapas |
| **Saldo** | Arrecadado − Pago (positivo = lucro) |
| **Média pts** | Média de pontos, só das etapas em que participou |
| **Class. média** | Média de colocação, só das etapas em que participou **e** teve colocação registrada |

Participações na faixa “16º ou pior” não têm posição exata registrada, então entram na média de
pontos mas ficam de fora da média de classificação.

---

## Estrutura do projeto

```
app/
  page.tsx                    ranking da temporada atual
  temporadas/                 lista e detalhe de temporadas
  etapas/                     lista e resultado de cada etapa
  jogadores/                  diretório e ficha de jogador
  admin/
    login/                    formulário de senha
    (painel)/                 telas protegidas
    actions.ts                Server Actions (todas checam a senha)
components/
  brand/icons.tsx             naipes, ficha, troféu, medalhas (SVG próprio)
  admin/                      formulários e editores do painel
  ranking/                    pódio e tabela de classificação
lib/
  domain/                     REGRAS DE NEGÓCIO, funções puras e testadas
    scoring.ts                colocação ↔ pontos
    prizes.ts                 reserva, distribuição, validação
    ranking.ts                agregação, desempate, estatísticas
    money.ts                  centavos e formatação em Real
    stage-name.ts             "Etapa 7 - Jul/26"
  import/parse-2026.ts        leitura da planilha
  db/                         consultas e tipos do banco
  supabase/                   clientes (leitura pública / escrita admin)
  auth.ts                     sessão do admin
supabase/migrations/          SQL versionado
scripts/
  seed.ts                     importa a planilha para o banco
  verificar.ts                confere os números sem tocar no banco
  extract-logo.ts             extrai o logo do clube de dentro da planilha
data/2026.xlsx                planilha original da liga
```

O ponto importante da organização: **toda regra de negócio mora em `lib/domain/` como função
pura**, sem depender do banco nem do React. É o mesmo código que roda em produção e que os testes
verificam contra os números reais da planilha.

---

## Testes

```bash
npm test           # roda uma vez
npm run test:watch # fica observando
```

A suíte cobre pontuação, premiação, arredondamento, desempate, estatísticas e a leitura da
planilha — incluindo casos ancorados em dados reais de 2026: a reserva acumulada de R$ 5.210, a
liderança da Ligia com 174 pontos e os empates de 116 pontos entre Rodolfo e Rodrigo.

---

## Segurança

- A área pública usa a chave `anon`, que só tem permissão de **leitura** — as políticas de RLS em
  `0002_rls.sql` não criam nenhuma regra de escrita, então gravação por essa chave é impossível.
- Toda escrita passa pela chave `service_role`, que **só existe no servidor**: o módulo
  `lib/supabase/admin.ts` importa `server-only`, e o build falha se algum componente de navegador
  tentar importá-lo.
- O painel usa uma senha única (`ADMIN_PASSWORD`), comparada em tempo constante. O cookie de
  sessão guarda apenas a validade, assinada com HMAC — a senha não trafega depois do login.
- A chave que assina o cookie mistura `SESSION_SECRET` com um resumo da senha atual, então
  **trocar `ADMIN_PASSWORD` derruba todas as sessões abertas na hora**. Sem isso, trocar a senha
  por suspeita de vazamento deixaria o invasor logado por até 12 horas.
- **Toda Server Action revalida a sessão**, não só o layout: proteger apenas a navegação deixaria
  os endpoints abertos a um POST direto.
- **Três tentativas de login a cada 15 minutos**, por origem. O contador vive no banco
  (`admin_login_attempts`), não em memória: a Vercel roda várias instâncias serverless, e um
  contador por instância deixaria passar muito mais que três. O IP é guardado como HMAC, não em
  claro. Tentativas feitas durante o bloqueio não são registradas — se fossem, a janela deslizante
  renovaria o bloqueio a cada nova tentativa e ele nunca expiraria. Se você se trancar do lado de
  fora, `npm run destravar` limpa o histórico.
