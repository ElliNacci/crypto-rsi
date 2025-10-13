// script.js — CoinGecko + Binance, exclut stablecoins + wrapped + "wrath"

// Liste de stablecoins courants à exclure
const STABLECOINS = [
  "usdt", "usdc", "dai", "busd", "tusd", "usdp", "usdn", "gusd", "husd", "pax", "usdx", "ust"
];

// Mots pour exclure les tokens "wrapped" ou similaires, et "wrath" si présent
const EXCLUDE_KEYWORDS = ['wrapped', 'wrap', 'wrath'];

// RSI
const RSI_PERIOD = 30;

// Fonction utilitaire : calcul RSI 30 périodes (Wilder smoothing approximatif)
function calculateRSI(closes, period = RSI_PERIOD) {
  if (!closes || closes.length < period + 1) return null;

  // Initial gains/losses
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Smoothing using the last values if array longer than period+1
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return rsi;
}

// Convert CoinGecko ID en symbole Binance USDT (approximation simple)
// Remarque : mapping manuel pour cas spéciaux
function coingeckoIdToBinanceSymbol(id) {
  const mapSpecial = {
    "bitcoin-cash-sv": "BCHSVUSDT",
    "bitcoin-cash": "BCHUSDT",
    "binancecoin": "BNBUSDT",
    "terra-luna": "LUNAUSDT",
    "wrapped-bitcoin": "WBTCUSDT",
    "wrapped-ether": "WETHUSDT",
    "usd-coin": "USDCUSDT"
    // ajouter d'autres cas si besoin
  };
  if (mapSpecial[id]) return mapSpecial[id];

  // par défaut : retirer les tirets et ajouter USDT (majuscule)
  return (id.replace(/-/g, "") + "usdt").toUpperCase();
}

// Récupérer la liste top cryptos CoinGecko (sans stablecoins, sans wrapped, sans wrath)
async function getTopCoins() {
  const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=150&page=1";
  const resp = await fetch(url);
  const data = await resp.json();

  // Filtrer stablecoins et tokens contenant mots interdits (wrapped, wrap, wrath)
  const filtered = data.filter(c => {
    const sym = (c.symbol || '').toLowerCase();
    const id = (c.id || '').toLowerCase();
    const name = (c.name || '').toLowerCase();

    if (STABLECOINS.includes(sym)) return false;

    // Exclure si id ou name contient un mot d'exclusion
    for (const kw of EXCLUDE_KEYWORDS) {
      if (id.includes(kw) || name.includes(kw)) return false;
    }

    return true;
  });

  return filtered.map(c => ({ id: c.id, symbol: c.symbol, name: c.name }));
}

// Charger la liste des symboles disponibles sur Binance (cache)
let binanceSymbolsCache = null;
async function loadBinanceSymbols() {
  if (binanceSymbolsCache) return binanceSymbolsCache;
  const resp = await fetch("https://api.binance.com/api/v3/exchangeInfo");
  const data = await resp.json();
  binanceSymbolsCache = new Set(data.symbols.map(s => s.symbol));
  return binanceSymbolsCache;
}

// Obtenir bougies weekly depuis Binance
async function getWeeklyKlines(symbol) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1w&limit=50`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data; // tableau de bougies
  } catch (e) {
    console.error("Erreur kline:", e);
    return null;
  }
}

// Créer un élément visuel pour la crypto
function createCryptoBox(symbol, rsi) {
  const div = document.createElement("div");
  div.classList.add("crypto-box");
  div.style.width = "1cm";
  div.style.height = "1cm";
  div.style.display = "flex";
  div.style.alignItems = "center";
  div.style.justifyContent = "center";
  div.style.fontSize = "9px";
  div.style.color = "#fff";
  div.style.borderRadius = "4px";
  div.style.boxSizing = "border-box";
  div.textContent = symbol;

  if (rsi === null) {
    div.style.backgroundColor = "#777";
    div.title = "RSI indisponible";
  } else if (rsi > 50) {
    div.style.backgroundColor = "#28a745"; // vert
    div.title = `${symbol} — RSI: ${rsi.toFixed(2)} (>50)`;
  } else {
    div.style.backgroundColor = "#dc3545"; // rouge
    div.title = `${symbol} — RSI: ${rsi.toFixed(2)} (<=50)`;
  }

  return div;
}

// Fonction principale : combine CoinGecko (liste) + Binance (klines) + calcul RSI
async function main() {
  const coins = await getTopCoins();                // déjà filtrés
  const binanceSymbols = await loadBinanceSymbols();

  // Limite à 125 (hors exclusions déjà faites)
  const targetCoins = coins.slice(0, 125);

  // Container dans le body — tu peux remplacer par #cryptoContainer si présent
  let container = document.getElementById('cryptoContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'cryptoContainer';
    // Grid 16 colonnes si tu veux
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(16, 1fr)';
    container.style.gap = '6px';
    document.body.appendChild(container);
  }

  // Traiter par batch pour ne pas dépasser rate limits
  const batchSize = 6;     // ajustable
  for (let i = 0; i < targetCoins.length; i += batchSize) {
    const batch = targetCoins.slice(i, i + batchSize);

    const promises = batch.map(async coin => {
      const binSym = coingeckoIdToBinanceSymbol(coin.id);

      // Vérifier existence sur Binance
      if (!binanceSymbols.has(binSym)) {
        // Si la paire USDT n'existe pas, on marque comme indisponible
        const box = createCryptoBox(coin.symbol.toUpperCase(), null);
        container.appendChild(box);
        return;
      }

      const klines = await getWeeklyKlines(binSym);
      if (!klines || klines.length < RSI_PERIOD + 1) {
        const box = createCryptoBox(coin.symbol.toUpperCase(), null);
        container.appendChild(box);
        return;
      }

      // Extraire les closes (en nombre suffisant)
      const closes = klines.map(k => parseFloat(k[4]));
      // S'assurer qu'on envoie au moins period+1 derniers closes
      const relevantCloses = closes.slice(- (RSI_PERIOD + 1));

      const rsi = calculateRSI(relevantCloses, RSI_PERIOD);
      const box = createCryptoBox(coin.symbol.toUpperCase(), rsi);
      container.appendChild(box);
    });

    await Promise.all(promises);
    // Pause entre batches pour réduire risque de rate limit
    await new Promise(r => setTimeout(r, 400));
  }
}

// Lancer
main().catch(e => console.error("Erreur main:", e));
