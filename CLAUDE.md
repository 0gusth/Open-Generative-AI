# Open Generative AI — Studio (fork de 0gusth)

Fork personalizado de Open-Generative-AI. Branch de trabalho: `redesign` (main espelha o upstream). Dev: `npm run dev` → localhost:3000.

## O padrão deste app (não negociável)

Este é um **app padrão Apple**: fluido, ágil e gostoso de usar. Toda feature nova e todo fix nascem já nesse nível — não se constrói "funcional primeiro, polido depois".

### UX
- **Percepção instantânea**: feedback visual em <150ms para qualquer ação do usuário. Trabalho lento (upload, render) acontece em segundo plano com preview otimista + estado visível (spinner sutil, fila de renderização). Nunca uma ação sem resposta imediata na tela.
- **Nada se perde, nada duplica**: toda geração aparece no histórico (ledger em `.data/`) ou na fila pendente. Jobs aceitos por um provedor nunca são re-gerados em outro (dupla cobrança é bug crítico).
- **Motion Apple**: curva `cubic-bezier(0.32, 0.72, 0, 1)`, press-compress (`.pressable`), `prefers-reduced-motion` respeitado. Sem animação gratuita.
- **Visual**: grafite em camadas (#0f0f10/#171719/#212123), UM accent (#EF0328) só em ação primária/seleção/foco, SF Pro system stack, ícones Lucide stroke 1.75, popovers ≥95% opacos, sentence case, sem caps-lock nem font-black.

### Engenharia
- **Roteamento de provedores**: Runware primeiro (catálogo dinâmico via modelSearch, cache em localStorage) → fal (ganha quando preço empata ±15%) → Muapi só como último recurso. Ver `packages/studio/src/providers.js`.
- **Async sempre**: nunca segurar conexão HTTP esperando render (sync estoura proxy em modelo pesado). Submit + poll `getResponse` com o taskUUID ORIGINAL no campo taskUUID.
- **Self-healing**: quando a API diz o que aceita (ex.: `allowedValues` de dimensões), o adaptador lê e reenvia sozinho em vez de falhar.
- **Efeitos idempotentes**: guards contra re-execução (WeakSet de lotes processados) — StrictMode e churn de dependências não podem causar trabalho duplicado.
- **Medir, não achar**: toda claim de performance/correção é validada ao vivo (log do servidor, DOM, network) antes de dar por pronta.
- **Fallback nunca quebra, mas nunca é silencioso**: erro em provedor novo degrada para o caminho antigo em vez de matar o render — porém, quando o desvio muda QUEM é cobrado ou entrega menos do que foi pedido, a tela diz. Funcionalidade existente jamais regride.

### Anti-padrões (bloqueiam merge)
- Esperar rede para mostrar UI que pode ser otimista
- `transition-all`, glow neon, cores fora da paleta, ícone SVG desenhado à mão
- Trabalho síncrono no caminho de modelo pesado
- Estado importante só em localStorage (histórico é cross-browser via servidor)
- Segunda cobrança pelo mesmo trabalho, em qualquer hipótese

## Onde o app vive

| | endereço | o que é |
|---|---|---|
| Produção | `gusaistudio.vercel.app` | a versão que o Gustavo usa (travada por `APP_ACCESS_CODE`) |
| Cópia de trabalho | `localhost:3000` | onde se constrói; app inteiro, provedores reais |

Ciclo: construir na cópia → Gustavo aprova → `npm run publicar`.

- `npm run dev` — cópia de trabalho, **IAs reais**, faixa azul. Histórico em `.data/`, imagens em `public/generated/`; nada vaza para produção.
- `npm run dev:simulado` — gerações falsas e grátis, faixa laranja. Só para rodada de interface.
- `npm run espelhar` — traz o histórico real da produção para `.data/`. Mão única. Pede o código de acesso no terminal DELE — nunca peça esse código no chat.
- `npm run check` — testes + build de verificação em `.next-check`.
- `npm run publicar` — 5 portões; se um falhar, nada sobe.

**Nunca rodar `npm run build` com o dev no ar.** Os dois escrevem no mesmo `.next` e o servidor dele passa a devolver 500 até alguém reiniciar. Use `npm run check`.

## Contas próprias (não é revendedor)

Serviço em que o Gustavo tem conta própria não passa pelo Runware. Ambos entram no roteador ANTES dele:

- **Google → Vertex** (`lib/vertexGenerate.js`). Região `global`. AI Studio e Vertex têm carteiras **separadas** — os créditos dele só valem no Vertex. Fallback para o revendedor existe, mas é **visível** (evento `vertex-miss` → toast).
- **Seedream 5.0 → BytePlus** (`lib/byteplusGenerate.js`). **Sem fallback**, por decisão dele: se falhar, o erro aparece. O Pro **não faz 4K** (teto 4.624.220 px); o Lite não faz 1K. O seletor só oferece o que o modelo entrega.

Resolvedores casam por **família** (id ou nome de exibição), nunca por lista fixa de ids — uma lista fixa deixou o Nano Banana Lite vazando para o revendedor.

**Custo:** número do Runware é real (`includeCost`), aparece limpo. Vertex/BytePlus é estimativa nossa e aparece com `~`. Nunca apresentar palpite com cara de medição, e nunca devolver resolução menor do que a pedida em silêncio.

## Testes

- `npm run test:pipeline` — roteador de geração, offline, sem custo
- `npm run test:ui` — guardas de origem (toast sobre o compositor, botão travado, contraste de controle, sandbox fora do lugar)

Regra: **todo guarda novo tem de ser verificado reintroduzindo o defeito.** Um teste que não falha não vale nada.
