// CELO Mainnet Configuration
const CELO_MAINNET = {
    chainId: '0xa4ec', // 42220 in decimal
    chainName: 'Celo Mainnet',
    nativeCurrency: {
        name: 'CELO',
        symbol: 'CELO',
        decimals: 18
    },
    rpcUrls: ['https://forno.celo.org'],
    blockExplorerUrls: ['https://explorer.celo.org']
};

let provider = null;
let signer = null;
let walletAddress = null;
let walletBalance = null;
let transactions = [];

// Initialize - Wait for ethers library to load
function waitForEthers() {
    return new Promise((resolve) => {
        if (typeof ethers !== 'undefined') {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (typeof ethers !== 'undefined') {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await waitForEthers();
        initializeApp();
    } catch (error) {
        console.error('Error loading ethers library:', error);
        alert('Gagal memuat library ethers.js. Pastikan koneksi internet Anda aktif.');
    }
});

function initializeApp() {
    // Check if ethers is available
    if (typeof ethers === 'undefined') {
        alert('Library ethers.js belum dimuat. Silakan refresh halaman.');
        addStatusLog('ERROR: Library ethers.js tidak tersedia', 'error');
        return;
    }

    document.getElementById('connectWallet').addEventListener('click', connectWallet);
    document.getElementById('prepareTransactions').addEventListener('click', prepareTransactions);
    document.getElementById('sendAll').addEventListener('click', sendAllTransactions);
    document.getElementById('clearTransactions').addEventListener('click', clearTransactions);
    document.getElementById('recipientList').addEventListener('input', updateStats);
    document.getElementById('sendAmount').addEventListener('input', updateStats);
    
    addStatusLog('Aplikasi siap. Hubungkan wallet untuk memulai.', 'info');
}

async function connectWallet() {
    try {
        // Check if ethers is available
        if (typeof ethers === 'undefined') {
            alert('Library ethers.js belum dimuat. Silakan refresh halaman.');
            addStatusLog('ERROR: Library ethers.js tidak tersedia', 'error');
            return;
        }

        if (typeof window.ethereum === 'undefined') {
            alert('MetaMask atau wallet lainnya tidak terdeteksi. Silakan install MetaMask terlebih dahulu.');
            addStatusLog('ERROR: Wallet tidak terdeteksi', 'error');
            return;
        }

        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        walletAddress = accounts[0];

        // Check if connected to CELO mainnet
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        
        if (chainId !== CELO_MAINNET.chainId) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: CELO_MAINNET.chainId }],
                });
            } catch (switchError) {
                // If chain doesn't exist, add it
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [CELO_MAINNET],
                    });
                } else {
                    throw switchError;
                }
            }
        }

        // Create provider and signer
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        walletAddress = await signer.getAddress();

        // Get wallet balance
        await updateWalletBalance();

        // Update UI
        document.getElementById('walletInfo').innerHTML = `
            <p class="connected">✓ Terhubung: ${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}</p>
        `;
        document.getElementById('walletBalance').style.display = 'flex';
        document.getElementById('connectWallet').textContent = 'Wallet Terhubung';
        document.getElementById('connectWallet').disabled = true;

        addStatusLog(`Wallet terhubung: ${walletAddress}`, 'success');

        // Listen for account changes
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                connectWallet();
            }
        });

        // Listen for chain changes
        window.ethereum.on('chainChanged', () => {
            connectWallet();
        });

    } catch (error) {
        console.error('Error connecting wallet:', error);
        addStatusLog(`ERROR: ${error.message}`, 'error');
        alert('Gagal menghubungkan wallet: ' + error.message);
    }
}

function disconnectWallet() {
    provider = null;
    signer = null;
    walletAddress = null;
    walletBalance = null;
    document.getElementById('walletInfo').innerHTML = '<p>Belum terhubung ke wallet</p>';
    document.getElementById('walletBalance').style.display = 'none';
    document.getElementById('connectWallet').textContent = 'Hubungkan Wallet';
    document.getElementById('connectWallet').disabled = false;
    updateStats();
    addStatusLog('Wallet terputus', 'info');
}

async function updateWalletBalance() {
    if (!provider || !walletAddress) {
        return;
    }

    try {
        const balance = await provider.getBalance(walletAddress);
        walletBalance = parseFloat(ethers.utils.formatEther(balance));
        document.getElementById('balanceValue').textContent = walletBalance.toFixed(4);
        document.getElementById('availableBalance').textContent = walletBalance.toFixed(4);
        updateBalanceWarning();
    } catch (error) {
        console.error('Error fetching balance:', error);
        addStatusLog(`ERROR: Gagal mengambil saldo - ${error.message}`, 'error');
    }
}

function updateBalanceWarning() {
    if (!walletBalance && walletBalance !== 0) {
        // Don't show warning if balance not loaded yet
        return;
    }

    const totalAmount = parseFloat(document.getElementById('totalAmount').textContent) || 0;
    const totalRecipients = parseInt(document.getElementById('totalRecipients').textContent) || 0;
    const availableBalance = walletBalance || 0;
    
    // Estimate gas (roughly 0.001 CELO per transaction)
    const estimatedGas = totalRecipients * 0.001;
    const totalNeeded = totalAmount + estimatedGas;
    
    const balanceWarningEl = document.getElementById('balanceWarning');
    const availableBalanceEl = document.getElementById('availableBalance');
    
    if (!balanceWarningEl || !availableBalanceEl) {
        return; // Elements not ready yet
    }
    
    if (totalNeeded > availableBalance && totalRecipients > 0) {
        const shortage = (totalNeeded - availableBalance).toFixed(4);
        document.getElementById('balanceShortage').textContent = shortage;
        balanceWarningEl.style.display = 'block';
        availableBalanceEl.classList.add('insufficient');
    } else {
        balanceWarningEl.style.display = 'none';
        availableBalanceEl.classList.remove('insufficient');
    }
}

function updateStats() {
    if (typeof ethers === 'undefined') {
        return; // Skip if ethers not loaded
    }

    const recipientListEl = document.getElementById('recipientList');
    const sendAmountEl = document.getElementById('sendAmount');
    
    if (!recipientListEl || !sendAmountEl) {
        return; // Elements not ready
    }

    // Get amount per recipient
    const sendAmount = parseFloat(sendAmountEl.value) || 0;
    
    // Validate amount
    if (sendAmount <= 0 || sendAmount >= 1e18 || !isFinite(sendAmount)) {
        const totalRecipientsEl = document.getElementById('totalRecipients');
        const totalAmountEl = document.getElementById('totalAmount');
        if (totalRecipientsEl) totalRecipientsEl.textContent = '0';
        if (totalAmountEl) totalAmountEl.textContent = '0.0000';
        if (walletBalance !== null) {
            updateBalanceWarning();
        }
        return;
    }

    const recipientList = recipientListEl.value.trim();
    if (!recipientList) {
        const totalRecipientsEl = document.getElementById('totalRecipients');
        const totalAmountEl = document.getElementById('totalAmount');
        if (totalRecipientsEl) totalRecipientsEl.textContent = '0';
        if (totalAmountEl) totalAmountEl.textContent = '0.0000';
        if (walletBalance !== null) {
            updateBalanceWarning();
        }
        return;
    }

    const lines = recipientList.split('\n').filter(line => line.trim());
    let validCount = 0;

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return; // Skip empty lines
        
        // Try to find Ethereum address (0x followed by 40 hex characters)
        const addressMatch = trimmedLine.match(/0x[a-fA-F0-9]{40}/);
        
        if (!addressMatch) {
            return; // Skip if no valid address found
        }
        
        const address = addressMatch[0];
        
        // Validate address using ethers
        try {
            if (!ethers.utils.isAddress(address)) {
                return; // Skip invalid address
            }
        } catch (e) {
            return; // Skip invalid address
        }
        
        // If address is valid and matches the trimmed line (no extra content), count it
        if (trimmedLine.toLowerCase() === address.toLowerCase()) {
            validCount++;
        }
    });

    // Calculate total amount (sendAmount * validCount)
    const totalAmount = sendAmount * validCount;

    const totalRecipientsEl = document.getElementById('totalRecipients');
    const totalAmountEl = document.getElementById('totalAmount');
    
    if (totalRecipientsEl) {
        totalRecipientsEl.textContent = validCount;
    }
    if (totalAmountEl) {
        totalAmountEl.textContent = totalAmount.toFixed(4);
    }
    
    // Update balance warning only if wallet is connected
    if (walletBalance !== null && walletBalance !== undefined) {
        updateBalanceWarning();
    }
}

function prepareTransactions() {
    if (typeof ethers === 'undefined') {
        alert('Library ethers.js belum dimuat. Silakan refresh halaman.');
        addStatusLog('ERROR: Library ethers.js tidak tersedia', 'error');
        return;
    }

    if (!signer) {
        alert('Silakan hubungkan wallet terlebih dahulu!');
        return;
    }

    // Get amount per recipient
    const sendAmountEl = document.getElementById('sendAmount');
    const sendAmount = parseFloat(sendAmountEl.value) || 0;
    
    if (!sendAmount || sendAmount <= 0 || sendAmount >= 1e18 || !isFinite(sendAmount)) {
        alert('Masukkan jumlah CELO yang valid (lebih dari 0 dan kurang dari 1e18)!');
        addStatusLog('ERROR: Jumlah CELO tidak valid', 'error');
        return;
    }

    const recipientList = document.getElementById('recipientList').value.trim();
    if (!recipientList) {
        alert('Masukkan daftar alamat penerima terlebih dahulu!');
        return;
    }

    const lines = recipientList.split('\n').filter(line => line.trim());
    transactions = [];

    lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return; // Skip empty lines
        
        // Try to find Ethereum address (0x followed by 40 hex characters)
        const addressMatch = trimmedLine.match(/0x[a-fA-F0-9]{40}/);
        
        if (!addressMatch) {
            addStatusLog(`Baris ${index + 1}: Alamat Ethereum tidak ditemukan - ${trimmedLine.substring(0, 30)}...`, 'error');
            return;
        }
        
        const address = addressMatch[0];
        
        // Validate that line contains only address (no extra content)
        if (trimmedLine.toLowerCase() !== address.toLowerCase()) {
            addStatusLog(`Baris ${index + 1}: Baris harus berisi hanya alamat (tanpa jumlah) - ${trimmedLine.substring(0, 30)}...`, 'error');
            return;
        }
        
        // Validate address using ethers
        try {
            if (!ethers.utils.isAddress(address)) {
                addStatusLog(`Baris ${index + 1}: Alamat tidak valid - ${address}`, 'error');
                return;
            }
        } catch (e) {
            addStatusLog(`Baris ${index + 1}: Alamat tidak valid - ${address}`, 'error');
            return;
        }

        // Use the same amount for all recipients
        transactions.push({
            id: transactions.length,
            address: address,
            amount: ethers.utils.parseEther(sendAmount.toString()),
            amountDisplay: sendAmount,
            status: 'pending'
        });
    });

    if (transactions.length === 0) {
        alert('Tidak ada transaksi valid yang ditemukan!');
        return;
    }

    displayTransactions();
    document.getElementById('transactionsSection').style.display = 'block';
    document.getElementById('sendAll').disabled = false;
    addStatusLog(`Disiapkan ${transactions.length} transaksi`, 'success');
}

function displayTransactions() {
    const transactionsList = document.getElementById('transactionsList');
    transactionsList.innerHTML = '';

    transactions.forEach(tx => {
        const txElement = document.createElement('div');
        txElement.className = `transaction-item ${tx.status}`;
        txElement.id = `tx-${tx.id}`;
        
        const statusClass = tx.status === 'success' ? 'success' : tx.status === 'failed' ? 'failed' : 'pending';
        const statusText = tx.status === 'success' ? 'Berhasil' : tx.status === 'failed' ? 'Gagal' : 'Menunggu';

        txElement.innerHTML = `
            <div class="transaction-header">
                <div class="transaction-info">
                    <div class="transaction-address">${tx.address}</div>
                    <div class="transaction-amount">${tx.amountDisplay} CELO</div>
                </div>
                <div class="transaction-status ${statusClass}">${statusText}</div>
            </div>
        `;

        transactionsList.appendChild(txElement);
    });
}

async function sendAllTransactions() {
    if (typeof ethers === 'undefined') {
        alert('Library ethers.js belum dimuat. Silakan refresh halaman.');
        addStatusLog('ERROR: Library ethers.js tidak tersedia', 'error');
        return;
    }

    if (!signer) {
        alert('Silakan hubungkan wallet terlebih dahulu!');
        return;
    }

    if (transactions.length === 0) {
        alert('Tidak ada transaksi untuk dikirim!');
        return;
    }

    // Check balance first
    const balance = await provider.getBalance(walletAddress);
    const totalAmount = transactions.reduce((sum, tx) => sum.add(tx.amount), ethers.BigNumber.from(0));
    
    // Estimate gas for all transactions (rough estimate: 21000 per transaction)
    const estimatedGas = ethers.BigNumber.from(21000).mul(transactions.length);
    const gasPrice = await provider.getGasPrice();
    const totalGasCost = estimatedGas.mul(gasPrice);
    const totalNeeded = totalAmount.add(totalGasCost);

    if (balance.lt(totalNeeded)) {
        alert(`Saldo tidak cukup! Diperlukan: ${ethers.utils.formatEther(totalNeeded)} CELO, Tersedia: ${ethers.utils.formatEther(balance)} CELO`);
        addStatusLog('ERROR: Saldo tidak cukup', 'error');
        return;
    }

    document.getElementById('sendAll').disabled = true;
    addStatusLog(`Memulai pengiriman ${transactions.length} transaksi...`, 'info');

    // Send transactions one by one with manual confirmation
    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        
        if (tx.status === 'success') {
            continue; // Skip already successful transactions
        }

        addStatusLog(`Transaksi ${i + 1}/${transactions.length}: Mengirim ${tx.amountDisplay} CELO ke ${tx.address.substring(0, 10)}...`, 'info');
        
        // Update UI to show current transaction
        updateTransactionStatus(tx.id, 'pending');
        
        // Ask for confirmation
        const confirmed = confirm(
            `Konfirmasi Transaksi ${i + 1}/${transactions.length}\n\n` +
            `Penerima: ${tx.address}\n` +
            `Jumlah: ${tx.amountDisplay} CELO\n\n` +
            `Klik OK untuk mengirim, atau Cancel untuk skip.`
        );

        if (!confirmed) {
            addStatusLog(`Transaksi ${i + 1} dibatalkan oleh user`, 'info');
            continue;
        }

        try {
            // Send transaction
            const txResponse = await signer.sendTransaction({
                to: tx.address,
                value: tx.amount,
                gasLimit: 21000
            });

            addStatusLog(`Transaksi ${i + 1} dikirim. Hash: ${txResponse.hash}`, 'info');
            addStatusLog(`Menunggu konfirmasi untuk transaksi ${i + 1}...`, 'info');

            // Wait for confirmation
            const receipt = await txResponse.wait();
            
            if (receipt.status === 1) {
                tx.status = 'success';
                updateTransactionStatus(tx.id, 'success');
                addStatusLog(`✓ Transaksi ${i + 1} berhasil! Hash: ${txResponse.hash}`, 'success');
                // Update balance after successful transaction
                await updateWalletBalance();
            } else {
                tx.status = 'failed';
                updateTransactionStatus(tx.id, 'failed');
                addStatusLog(`✗ Transaksi ${i + 1} gagal! Hash: ${txResponse.hash}`, 'error');
            }

        } catch (error) {
            tx.status = 'failed';
            updateTransactionStatus(tx.id, 'failed');
            addStatusLog(`✗ Transaksi ${i + 1} error: ${error.message}`, 'error');
        }

        // Small delay between transactions
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Final balance update
    await updateWalletBalance();
    
    document.getElementById('sendAll').disabled = false;
    addStatusLog('Semua transaksi selesai diproses!', 'info');
}

function updateTransactionStatus(id, status) {
    const tx = transactions.find(t => t.id === id);
    if (tx) {
        tx.status = status;
    }
    
    const txElement = document.getElementById(`tx-${id}`);
    if (txElement) {
        txElement.className = `transaction-item ${status}`;
        const statusElement = txElement.querySelector('.transaction-status');
        if (statusElement) {
            statusElement.className = `transaction-status ${status}`;
            statusElement.textContent = status === 'success' ? 'Berhasil' : status === 'failed' ? 'Gagal' : 'Menunggu';
        }
    }
}

function clearTransactions() {
    if (confirm('Yakin ingin membersihkan semua transaksi?')) {
        transactions = [];
        document.getElementById('transactionsList').innerHTML = '';
        document.getElementById('transactionsSection').style.display = 'none';
        document.getElementById('sendAll').disabled = true;
        addStatusLog('Daftar transaksi dibersihkan', 'info');
    }
}

function addStatusLog(message, type = 'info') {
    const statusLog = document.getElementById('statusLog');
    const logItem = document.createElement('div');
    logItem.className = `status-log-item ${type}`;
    
    const timestamp = new Date().toLocaleTimeString('id-ID');
    logItem.textContent = `[${timestamp}] ${message}`;
    
    statusLog.appendChild(logItem);
    statusLog.scrollTop = statusLog.scrollHeight;
}
