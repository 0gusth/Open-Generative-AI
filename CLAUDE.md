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
- **Fallback nunca quebra**: erro em provedor novo degrada para o caminho antigo silenciosamente; funcionalidade existente jamais regride.

### Anti-padrões (bloqueiam merge)
- Esperar rede para mostrar UI que pode ser otimista
- `transition-all`, glow neon, cores fora da paleta, ícone SVG desenhado à mão
- Trabalho síncrono no caminho de modelo pesado
- Estado importante só em localStorage (histórico é cross-browser via servidor)
- Segunda cobrança pelo mesmo trabalho, em qualquer hipótese
