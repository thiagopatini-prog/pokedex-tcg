# Pokédex TCG

App pessoal para a coleção de cartas Pokémon TCG. É um site estático (PWA): não precisa de servidor nem de banco de dados.

## Testar no computador
Abra a pasta num servidor local, por exemplo `python3 -m http.server 8000`, e acesse http://localhost:8000.

## Publicar de graça (GitHub Pages)
1. Crie um repositório e envie o conteúdo desta pasta.
2. Em Settings > Pages, escolha a branch principal e a pasta raiz.
3. Abra o endereço no celular e use "Adicionar à tela inicial" para instalar como app.

Para gerar o APK depois, o mesmo projeto serve no PWABuilder ou no Capacitor.

## Como os dados funcionam
- `data.js`: sua planilha convertida (1.160 linhas: 1.025 Pokémon + 135 formas alternativas).
- `img/atlas-g1..9.webp`: arte dos Pokémon extraída do seu PDF, uma imagem por região.
- Mudanças feitas no app (marcar carta, lista de compras) ficam salvas no aparelho. Em Mais > Exportar CSV você baixa no formato da planilha.

## Imagens das cartas
O app busca a imagem oficial pela coleção + número na base pública TCGdex (primeiro em português, depois em inglês). Se não achar, mostra uma ficha com a arte do Pokémon. Para forçar uma imagem específica, crie `window.CARD_IMG = {"MEP-079":"https://..."}` no data.js.
Para forçar uma imagem específica, crie `cards.js` com `window.CARD_IMG = {"MEG-001": "https://..."}` e inclua `<script src="cards.js"></script>` antes de `app.js` no `index.html`.

## Atualizar o app
Troque o número da versão em `sw.js` (`pktcg-v2` para `pktcg-v2`) a cada atualização, para o celular baixar os arquivos novos.
