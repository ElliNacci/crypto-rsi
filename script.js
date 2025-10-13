const NUM_COINS = 125;
const RSI_PERIOD = 30;
const TARGET_DAY = 1; // 1 = Lundi UTC
const EXCLUDED_STABLECOINS = new Set([
    'usdt', 'usdc', 'busd', 'dai', 'tusd', 'usdp', 'gusd', 'trueusd', 'frax', 'lusd',
    // ajouter ici d'autres stablecoins connus si tu veux
]);

const container = document.getElementById('cryptoContainer');

// Fonction pour calculer le RSI
function calculateRSI(closes, period = RSI_PERIOD) {
    if (closes.length < period + 1) return null;

    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;

    const lastDiff = closes[closes.length - 1] - closes[closes.length - 2];
    if (lastDiff >= 0) {
        avgGain = (avgGain * (period - 1) + lastDiff) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
    } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - lastDiff) / period;
    }

    const RS = avgLoss === 0 ? Infinity : (avgGain / avgLoss);
    const RSI = 100 - (100 / (1 + RS));
    return +RSI.toFixed(2);
}

function timestampToDate(ts) {
    return new Date(ts);
}

function getWeeklyClosesFromDaily(prices, targetDay = TARGET_DAY) {
    const weekly = [];
    for (const [ts, price] of prices) {
        const d = timestampToDate(ts);
        if (d.getUTCDay() === targetDay) {
            weekly.push(price);
        }
    }
    return weekly.slice(-(RSI_PERIOD + 1));
}

async function getTopCoins(limit = NUM_COINS) {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`;
    const res = await fetch(url);
    const data = await res.json();
    // Filtrer les stablecoins via le symbole
    const filtered = data.filter(c => {
        const sym = (c.symbol || '').toLowerCase();
        return !EXCLUDED_STABLECOINS.has(sym);
    });
    return filtered.map(c => ({ id: c.id, symbol: c.symbol, name: c.name }));
}

async function fetchRSIforCoin(coin) {
    const daysBack = (RSI_PERIOD + 10) * 7; // marge pour avoir assez de jours
    const url = `https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=${daysBack}&interval=daily`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.prices) {
            console.warn(`Pas de prix pour ${coin.id}`);
            return null;
        }
        const weekly = getWeeklyClosesFromDaily(data.prices, TARGET_DAY);
        if (weekly.length < RSI_PERIOD + 1) {
            console.warn(`Données hebdo insuffisantes pour ${coin.id} (${weekly.length} semaines)`);
            return null;
        }
        const rsi = calculateRSI(weekly, RSI_PERIOD);
        return rsi;
    } catch (err) {
        console.error(`Erreur fetch pour ${coin.id}`, err);
        return null;
    }
}

async function displayAll() {
    const topCoins = await getTopCoins(NUM_COINS);

    for (const coin of topCoins) {
        const rsi = await fetchRSIforCoin(coin);

        const box = document.createElement('div');
        box.className = 'crypto-box';
        const label = coin.symbol.toUpperCase();
        if (rsi === null) {
            box.style.backgroundColor = 'grey';
            box.innerText = `${label}\nN/A`;
        } else {
            box.style.backgroundColor = (rsi > 50 ? 'green' : 'red');
            box.innerText = `${label}\n${rsi}`;
        }
        container.appendChild(box);

        // Pause pour ne pas surcharger l'API
        await new Promise(res => setTimeout(res, 250));
    }
}

// Appel initial
displayAll();
