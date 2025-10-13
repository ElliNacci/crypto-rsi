const RSI_PERIOD = 30;

// Obtenir les 125 cryptos les plus capitalisées via CoinGecko
async function getTop125Coins() {
  const perPage = 125;
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=false`;
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    return data.map(coin => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name
    }));
  } catch (err) {
    console.error("Erreur CoinGecko top coins:", err);
    return [];
  }
}

// Récupérer les symboles disponibles sur Binance
async function getBinanceSymbols() {
  try {
    const resp = await fetch("https://api.binance.com/api/v3/exchangeInfo");
    const data = await resp.json();
    const symSet = new Set(data.symbols.map(s => s.symbol));
    return symSet;
  } catch (err) {
    console.error("Erreur Binance exchangeInfo:", err);
    return new Set();
  }
}

// Récupérer les bougies weekly pour un symbole Binance
async function getWeeklyKlines(binSymbol) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${binSymbol}&interval=1w&limit=50`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data;
  } catch (err) {
    return null;
  }
}

// Calculer RSI
function calculateRSI(closes, period = RSI_PERIOD) {
  if (!closes || closes.length < period + 1) return null;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  return rsi;
}

// Créer le carré d'affichage
function createCryptoBox(symbol, rsi) {
  const div = document.createElement("div");
  div.className = "crypto-box";
  div.textContent = symbol;
  if (rsi === null) {
    div.style.backgroundColor = "#777";
    div.title = `${symbol}: RSI indisponible`;
  } else {
    div.style.backgroundColor = rsi > 50 ? "green" : "red";
    div.title = `${symbol}: RSI = ${rsi.toFixed(2)}`;
  }
  return div;
}

// Fonction pour créer une pause
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fonction principale avec batchs
async function main() {
  const coins = await getTop125Coins();
  const binanceSymbols = await getBinanceSymbols();
  const container = document.getElementById("cryptoContainer");

  const batchSize = 5;
  for (let i = 0; i < coins.length; i += batchSize) {
    const batch = coins.slice(i, i + batchSize);

    const tasks = batch.map(async coin => {
      const binSymbol = (coin.symbol + "USDT").toUpperCase();

      if (!binanceSymbols.has(binSymbol)) {
        const box = createCryptoBox(coin.symbol, null);
        container.appendChild(box);
        return;
      }

      const klines = await getWeeklyKlines(binSymbol);
      if (!klines) {
        const box = createCryptoBox(coin.symbol, null);
        container.appendChild(box);
        return;
      }

      const closes = klines.map(k => parseFloat(k[4]));
      const relevant = closes.slice(- (RSI_PERIOD + 1));
      const rsi = calculateRSI(relevant, RSI_PERIOD);

      const box = createCryptoBox(coin.symbol, rsi);
      container.appendChild(box);
    });

    await Promise.all(tasks);
    await delay(300); // Pause de 300ms entre les batchs
  }
}

// Lancer après chargement de la page
window.addEventListener("load", main);
