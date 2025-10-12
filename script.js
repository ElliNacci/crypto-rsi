const topCryptos = ['Bitcoin', 'Ethereum', 'Tether', 'BNB', 'Solana'];
const container = document.getElementById('cryptoContainer');

// Simulation de RSI weekly (entre 0 et 100)
function mockRSI() {
    return Math.floor(Math.random() * 100);
}

topCryptos.forEach(crypto => {
    const rsi = mockRSI(); // à remplacer plus tard par vrai RSI

    const box = document.createElement('div');
    box.className = 'crypto-box';
    box.style.backgroundColor = rsi > 50 ? 'green' : 'red';
    box.title = `RSI Weekly : ${rsi}`;
    box.innerText = crypto;

    container.appendChild(box);
});
