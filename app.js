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
let transactions = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    document.getElementById('connectWallet').addEventListener('click', connectWallet);
    document.getElementById('prepareTransactions').addEventListener('click', prepareTransactions);
    document.getElementById('sendAll').addEventListener('click', sendAllTransactions);
    document.getElementById('clearTransactions').addEventListener('click', clearTransactions);
    document.getElementById('recipientList').addEventListener('input', updateStats);
    
    addStatusLog('Aplikasi siap. Hubungkan wallet untuk memulai.', 'info');
}

async function connectWallet() {
    try {
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

        // Update UI
        document.getElementById('walletInfo').innerHTML = `
            <p class="connected">✓ Terhubung: ${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}</p>
        `;
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
    document.getElementById('walletInfo').innerHTML = '<p>Belum terhubung ke wallet</p>';
    document.getElementById('connectWallet').textContent = 'Hubungkan Wallet';
    document.getElementById('connectWallet').disabled = false;
    addStatusLog('Wallet terputus', 'info');
}

function updateStats() {
    const recipientList = document.getElementById('recipientList').value.trim();
    if (!recipientList) {
        document.getElementById('totalRecipients').textContent = '0';
        document.getElementById('totalAmount').textContent = '0';
        return;
    }

    const lines = recipientList.split('\n').filter(line => line.trim());
    let totalAmount = 0;
    let validCount = 0;

    lines.forEach(line => {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length === 2) {
            const address = parts[0];
            const amount = parseFloat(parts[1]);
            if (ethers.utils.isAddress(address) && !isNaN(amount) && amount > 0) {
                totalAmount += amount;
                validCount++;
            }
        }
    });

    document.getElementById('totalRecipients').textContent = validCount;
    document.getElementById('totalAmount').textContent = totalAmount.toFixed(4);
}

function prepareTransactions() {
    if (!signer) {
        alert('Silakan hubungkan wallet terlebih dahulu!');
        return;
    }

    const recipientList = document.getElementById('recipientList').value.trim();
    if (!recipientList) {
        alert('Masukkan daftar penerima terlebih dahulu!');
        return;
    }

    const lines = recipientList.split('\n').filter(line => line.trim());
    transactions = [];

    lines.forEach((line, index) => {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length === 2) {
            const address = parts[0];
            const amount = parts[1];

            if (!ethers.utils.isAddress(address)) {
                addStatusLog(`Baris ${index + 1}: Alamat tidak valid - ${address}`, 'error');
                return;
            }

            const amountNum = parseFloat(amount);
            if (isNaN(amountNum) || amountNum <= 0) {
                addStatusLog(`Baris ${index + 1}: Jumlah tidak valid - ${amount}`, 'error');
                return;
            }

            transactions.push({
                id: index,
                address: address,
                amount: ethers.utils.parseEther(amountNum.toString()),
                amountDisplay: amountNum,
                status: 'pending'
            });
        } else {
            addStatusLog(`Baris ${index + 1}: Format tidak valid`, 'error');
        }
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
