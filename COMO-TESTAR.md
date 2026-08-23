# A cópia de trabalho

Duas versões do mesmo app:

| | onde | o que é |
|---|---|---|
| **Produção** | gusaistudio.vercel.app | a versão final, a que você usa |
| **Cópia de trabalho** | localhost:3000 | onde construímos. Tudo funciona igual. |

Todos os comandos rodam na pasta do projeto:
`~/Documents/CLAUDE/Open-Generative-AI`

---

## Abrir a cópia de trabalho

```
npm run dev
```

Abre em **http://localhost:3000/studio** com uma faixa azul no topo:
*"Cópia de trabalho — tudo funciona de verdade. Não é o gusaistudio."*

**Tudo funciona:** as IAs são as reais, as imagens saem de verdade, o custo
é real. É o app inteiro. É aqui que trocamos modelos, mexemos em features,
tiramos e colocamos IA nova — e você olha o resultado antes de virar
produção.

O que **não** é compartilhado com a produção:

- O histórico daqui fica em `.data/`, nesta máquina.
- As imagens geradas aqui ficam em `public/generated/`, nesta máquina.
- Nada do que você fizer aqui aparece ou some no gusaistudio.

Para parar: `Ctrl + C` na janela do terminal.

---

## Encher a cópia com o seu trabalho real

```
npm run espelhar
```

Baixa o histórico, projetos e favoritos da produção para cá, para a cópia
não abrir vazia. Pede o código do gusaistudio na primeira vez e guarda só
nesta máquina.

**É mão única.** O script só lê a produção. O que você gerar ou apagar aqui
nunca volta para lá.

Para esquecer o código: `npm run espelhar -- --esquecer`

---

## Trabalhar sem gastar

```
npm run dev:simulado
```

Mesma coisa, mas a faixa fica laranja e as gerações são **falsas e
gratuitas** — uma imagem listrada na proporção certa, na hora.

Serve para quando a rodada é de interface: layout, botões, fluxo, erros.
Não serve para julgar qualidade de imagem nem modelo novo — para isso,
`npm run dev`.

---

## Subir a rodada aprovada

```
npm run publicar
```

Leva o que está aqui para o **gusaistudio.vercel.app**, passando por cinco
portões:

1. Pergunta o que mudou e registra
2. Guardas de interface
3. Testes do pipeline de geração
4. Build de verificação
5. Deploy

**Se qualquer um falhar, nada sobe** e a produção continua exatamente como
estava. O script diz qual portão barrou.

---

## Se algo travar

```
npm run check
```

Roda todos os testes e o build sem publicar. Pode rodar com o `npm run dev`
aberto — compila numa pasta separada e não derruba o servidor.

Tela branca ou erro 500 no local quase sempre é build velho:

```
rm -rf .next && npm run dev
```
