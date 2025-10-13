const RSI_PERIOD = 30;
const COINS_LIMIT = 125;
const DAYS_FOR_WEEKLY = 210;
const BATCH_SIZE = 5;
const PAUSE_BETWEEN_BATCHES_MS = 500;

// Liste stricte à exclure (par ID exact)
const EXACT_IDS_TO_EXCLUDE = ['bitcoin', 'ethereum'];

// Mots-clés pour exclure stablecoins et wrapped tokens
const EXCLUDED_KEYWORDS = [
  'stablecoin', 'usd', 'usdt', 'usdc', 'tether', 'dai', 'busd', 'tusd',
  'wrapped', 'wbtc', 'weth', 'w'
];

// Exclure une crypto par ID ou nom
function isExcluded(coin) {
  const id = coin.id.toLowerCase();
  const name = coin.name.toLowerCase();

  return EXACT_IDS_TO_EXCLUDE.includes(id) ||
         EXCLUDED_KEYWORDS.some(keyword => name.includes(keyword) || id.includes(keyword));
}

// Obtenir la liste des 125 premières cryptos filtrées
async function getTopCoinsFiltered() {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${COINS_LIMIT}&page=1&sparkline=false`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();
    return data.filter(coin => !isExcluded(coin)).map(coin => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name
    }));
  } catch (error) {
    console.error("Erreur CoinGecko:", error);
    return [];
  }
}

// Récupérer les prix journaliers pour simuler du weekly
async function getDailyPrices(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${DAYS_FOR_WEEKLY}&interval=daily`;
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    return data.prices.map(p => p[1]); // [timestamp, price]
  } catch (err) {
    console.error(`Erreur récupération prix pour ${coinId}:`, err);
    return null;
  }
}

// Calcul du RSI
function calculateRSI(closes, period = RSI_PERIOD) {
  if (closes.length < period + 1) return null;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
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
  return 100 - (100 / (1 + rs));
}

// Création d’un carré pour une crypto
function createCryptoBox(symbol, rsi) {
  const box = document.createElement("div");
  box.className = "crypto-box";

  if (rsi === null) {
    box.style.backgroundColor = "gray";
    box.innerHTML = `${symbol}<br><span class="rsi">N/A</span>`;
  } else {
    box.style.backgroundColor = rsi > 50 ? "green" : "red";
    box.innerHTML = `${symbol}<br><span class="rsi">${rsi.toFixed(1)}</span>`;
  }

  return box;
}

// Pause entre batchs
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fonction principale
async function main() {
  const coins = await getTopCoinsFiltered();
  const container = document.getElementById("cryptoContainer");

  for (let i = 0; i < coins.length; i += BATCH_SIZE) {
    const batch = coins.slice(i, i + BATCH_SIZE);

    const tasks = batch.map(async coin => {
      const prices = await getDailyPrices(coin.id);

      if (!prices || prices.length < RSI_PERIOD * 7) {
        const box = createCryptoBox(coin.symbol, null);
        container.appendChild(box);
        return;
      }

      // Simule les clôtures weekly
      const weeklyCloses = [];
      for (let j = 0; j < prices.length; j += 7) {
        weeklyCloses.push(prices[j]);
      }

      const closes = weeklyCloses.slice(- (RSI_PERIOD + 1));
      const rsi = calculateRSI(closes, RSI_PERIOD);

      const box = createCryptoBox(coin.symbol, rsi);
      container.appendChild(box);
    });

    await Promise.all(tasks);
    await delay(PAUSE_BETWEEN_BATCHES_MS); // pause pour respecter l’API
  }
}

window.addEventListener("load", main);
