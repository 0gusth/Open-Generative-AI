# Ambiente de teste

Três comandos. Todos rodam na pasta do projeto:
`~/Documents/CLAUDE/Open-Generative-AI`

---

## 1. Abrir o ambiente de teste

```
npm run dev
```

Abre em **http://localhost:3000/studio** com uma faixa laranja no topo:
*"Ambiente de teste — as gerações são simuladas e não custam nada"*.

Enquanto essa faixa estiver lá:

- **Gerar não custa nada.** Nenhuma IA é chamada. Você recebe uma imagem
  listrada de mentira, na proporção certa, na hora.
- **Não mexe no seu histórico de produção.** O que você gera aqui fica só
  nesta máquina, em `.data/` e `public/generated/`.
- **Não mexe nas suas imagens reais.** Elas continuam no Blob da nuvem,
  intocadas.

É aqui que testamos ferramenta nova: layout, botões, fluxo, erros. Tudo
menos a qualidade da imagem — que é a única coisa que a simulação não
mostra.

Para parar: `Ctrl + C` na janela do terminal.

---

## 2. Ver a saída real (isso gasta dinheiro)

```
npm run dev:real
```

Mesmo endereço, mas **sem a faixa laranja** e chamando as IAs de verdade.
Cada geração é cobrada nas suas contas (ByteDance, Google, Runware).

Use só quando a pergunta for "a imagem ficou boa?". Para todo o resto,
`npm run dev` responde igual e de graça.

---

## 3. Publicar no gusaistudio

```
npm run publicar
```

Sobe para **gusaistudio.vercel.app** — mas só se passar por cinco portões:

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

Roda todos os testes e o build sem publicar nada. Pode rodar com o
`npm run dev` aberto — ele compila numa pasta separada e não derruba o
servidor.

Se a tela local ficar branca ou der erro 500, quase sempre é build velho:

```
rm -rf .next && npm run dev
```
