const POLYGON_CHAIN_ID = 137;
const POLYGON_CHAIN_ID_HEX = '0x89';

// Minimal ABI for Fenix Staking
const FENIX_ABI = [
    "function endStake(uint256 stakeIndex) external",
    "function stakeCount(address user) view returns (uint256)",
    "function stakeFor(address stakerAddress, uint256 stakeIndex) view returns (tuple(uint8 status, uint256 startTs, uint256 deferralTs, uint256 endTs, uint256 term, uint256 fenix, uint256 shares, uint256 payout))",
    "event StakeStarted(address indexed user, uint256 indexed stakeIndex, uint256 term, uint256 amount)",
    "event StartStake(address indexed user, uint256 indexed stakeIndex, uint256 term, uint256 amount)"
];

let provider;
let signer;
let userAddress;
let contract;

const ui = {
    connectBtn: document.getElementById('connect-btn'),
    walletInfo: document.getElementById('wallet-info'),
    walletAddress: document.getElementById('wallet-address'),
    networkStatus: document.getElementById('network-status'),
    contractAddress: document.getElementById('contract-address'),
    stakesSection: document.getElementById('stakes-section'),
    actionSection: document.getElementById('action-section'),
    fetchStakesBtn: document.getElementById('fetch-stakes-btn'),
    stakesList: document.getElementById('stakes-list'),
    loadingStakes: document.getElementById('loading-stakes'),
    stakeIdInput: document.getElementById('stake-id'),
    endStakeBtn: document.getElementById('end-stake-btn'),
    txStatus: document.getElementById('tx-status')
};

// Initialize App
async function init() {
    if (typeof window.ethereum !== 'undefined') {
        provider = new ethers.BrowserProvider(window.ethereum);
        
        // Check if already connected
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
            handleAccountsChanged(accounts);
        }

        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', () => window.location.reload());
        
        ui.connectBtn.addEventListener('click', connectWallet);
        ui.fetchStakesBtn.addEventListener('click', fetchStakes);
        ui.endStakeBtn.addEventListener('click', endStake);
    } else {
        ui.connectBtn.innerText = 'MetaMask Not Found';
        ui.connectBtn.disabled = true;
    }
}

async function connectWallet() {
    try {
        const accounts = await provider.send("eth_requestAccounts", []);
        handleAccountsChanged(accounts);
    } catch (error) {
        console.error("Connection error", error);
        alert("Failed to connect wallet: " + error.message);
    }
}

async function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        // Disconnected
        userAddress = null;
        ui.walletInfo.classList.add('hidden');
        ui.connectBtn.classList.remove('hidden');
        ui.stakesSection.classList.add('opacity-50', 'pointer-events-none');
        ui.actionSection.classList.add('opacity-50', 'pointer-events-none');
    } else {
        // Connected
        signer = await provider.getSigner();
        userAddress = accounts[0].address || accounts[0]; // depends on ethers version output
        
        // Ethers v6 signer.address is string
        if (typeof userAddress !== 'string') {
            userAddress = signer.address;
        }

        ui.walletAddress.innerText = `${userAddress.substring(0, 6)}...${userAddress.substring(userAddress.length - 4)}`;
        ui.walletInfo.classList.remove('hidden');
        ui.connectBtn.classList.add('hidden');
        
        await checkNetwork();
    }
}

async function checkNetwork() {
    const network = await provider.getNetwork();
    if (network.chainId !== BigInt(POLYGON_CHAIN_ID)) {
        ui.networkStatus.innerText = 'Wrong Network';
        ui.networkStatus.classList.replace('text-green-400', 'text-red-400');
        ui.networkStatus.classList.replace('bg-green-500/20', 'bg-red-500/20');
        ui.networkStatus.classList.replace('border-green-500/30', 'border-red-500/30');
        
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: POLYGON_CHAIN_ID_HEX }],
            });
        } catch (switchError) {
            console.error(switchError);
            alert("Please switch to the Polygon network in MetaMask.");
            return;
        }
    } else {
        ui.networkStatus.innerText = 'Polygon Network';
        ui.networkStatus.classList.replace('text-red-400', 'text-green-400');
        ui.networkStatus.classList.replace('bg-red-500/20', 'bg-green-500/20');
        ui.networkStatus.classList.replace('border-red-500/30', 'border-green-500/30');
        
        // Enable sections
        ui.stakesSection.classList.remove('opacity-50', 'pointer-events-none');
        ui.actionSection.classList.remove('opacity-50', 'pointer-events-none');
        
        initContract();
    }
}

function initContract() {
    const address = ui.contractAddress.value.trim();
    if (ethers.isAddress(address)) {
        contract = new ethers.Contract(address, FENIX_ABI, signer);
    } else {
        alert("Invalid Contract Address");
    }
}

async function fetchStakes() {
    if (!contract || !userAddress) return;
    
    ui.loadingStakes.classList.remove('hidden');
    ui.stakesList.classList.add('hidden');
    ui.stakesList.innerHTML = '';
    
    ui.loadingStakes.innerHTML = `<p class="text-slate-400 animate-pulse text-sm">Checking your active stakes on the contract... This takes just a moment.</p>`;
    
    try {
        // Find how many stakes the user has
        let count = 0;
        try {
            // Fenix/XEN usually has stakeCount
            const countBN = await contract.stakeCount(userAddress);
            count = Number(countBN);
        } catch(e) {
            console.log("stakeCount failed, assuming 50 for testing limit");
            count = 50; // Fallback to check first 50 indices
        }
        
        if (count === 0) {
            ui.loadingStakes.classList.add('hidden');
            ui.stakesList.classList.remove('hidden');
            ui.stakesList.innerHTML = `<div class="p-4 bg-slate-800 rounded-lg text-slate-400 text-center">No stakes found for this address.</div>`;
            return;
        }

        ui.loadingStakes.innerHTML = `<p class="text-slate-400 animate-pulse text-sm">Found ${count} stakes total. Checking which ones are ready to end...</p>`;

        let endableStakes = [];
        let earlyStakes = [];
        let endedStakes = [];
        
        const currentTs = Math.floor(Date.now() / 1000);

        // Loop through all stake indices
        for (let i = 0; i < count; i++) {
            try {
                // Fetch the stake details from the contract
                const stake = await contract.stakeFor(userAddress, i);
                const status = Number(stake.status); // 0 = Active, 2 = End
                const endTs = Number(stake.endTs);

                if (status === 2) {
                    endedStakes.push(i);
                    continue;
                }

                // If status is active, check the maturity
                if (currentTs >= endTs) {
                    // It has matured! Double-check with estimateGas to ensure no reverting.
                    try {
                        await contract.endStake.estimateGas(i);
                        endableStakes.push({ id: i, endTs });
                    } catch(err) {
                        console.log(`Stake ${i} matured but gas estimation failed:`, err.message);
                    }
                } else {
                    // Active but not matured yet. Ending now would cause a penalty.
                    earlyStakes.push({ id: i, endTs });
                }
            } catch(err) {
                console.log(`Failed to fetch details for Stake ${i}`, err.message);
            }
        }

        ui.loadingStakes.classList.add('hidden');
        ui.stakesList.classList.remove('hidden');

        if (endableStakes.length === 0 && earlyStakes.length === 0) {
            ui.stakesList.innerHTML = `<div class="p-4 bg-slate-800 rounded-lg text-slate-400 text-center">You have ${count} stakes on record, but none of them are currently active. They have all been ended already.</div>`;
            return;
        }

        // Render Matured Stakes
        endableStakes.forEach((stake) => {
            const dateStr = new Date(stake.endTs * 1000).toLocaleDateString();
            const stakeEl = document.createElement('div');
            stakeEl.className = 'p-4 bg-slate-800 border border-slate-700 rounded-lg flex justify-between items-center hover:border-green-500/50 cursor-pointer transition-colors mb-2';
            stakeEl.innerHTML = `
                <div>
                    <span class="text-green-400 font-mono font-bold">READY TO END - ID: ${stake.id}</span>
                    <p class="text-slate-400 text-xs mt-1">Matured on: ${dateStr}</p>
                </div>
                <button class="text-sm bg-green-600/20 text-green-400 px-3 py-1 rounded hover:bg-green-600 hover:text-white transition-colors">Select</button>
            `;
            
            stakeEl.addEventListener('click', () => {
                ui.stakeIdInput.value = stake.id;
                ui.actionSection.scrollIntoView({ behavior: 'smooth' });
                ui.stakeIdInput.classList.add('ring-2', 'ring-green-500');
                setTimeout(() => ui.stakeIdInput.classList.remove('ring-2', 'ring-green-500'), 1000);
            });
            
            ui.stakesList.appendChild(stakeEl);
        });

        // Render Early Stakes
        earlyStakes.forEach((stake) => {
            const dateStr = new Date(stake.endTs * 1000).toLocaleDateString();
            const stakeEl = document.createElement('div');
            stakeEl.className = 'p-4 bg-slate-800 border border-slate-700/50 rounded-lg flex justify-between items-center opacity-75 mb-2';
            stakeEl.innerHTML = `
                <div>
                    <span class="text-yellow-400 font-mono font-bold">ACTIVE (EARLY) - ID: ${stake.id}</span>
                    <p class="text-slate-400 text-xs mt-1">Matures on: ${dateStr}. Ending now incurs a penalty.</p>
                </div>
            `;
            ui.stakesList.appendChild(stakeEl);
        });

    } catch (error) {
        console.error(error);
        ui.loadingStakes.classList.add('hidden');
        ui.stakesList.classList.remove('hidden');
        ui.stakesList.innerHTML = `<div class="p-4 bg-red-900/50 border border-red-500/30 text-red-300 rounded-lg text-sm">Error: ${error.message}.</div>`;
    }
}

async function endStake() {
    if (!contract) {
        initContract();
    }
    
    const stakeId = ui.stakeIdInput.value.trim();
    if (!stakeId) {
        showTxStatus("Please enter a Stake ID.", "error");
        return;
    }

    try {
        ui.endStakeBtn.disabled = true;
        ui.endStakeBtn.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Confirming in Wallet...`;
        
        showTxStatus("Please confirm the transaction in MetaMask...", "info");
        
        const tx = await contract.endStake(stakeId);
        
        ui.endStakeBtn.innerHTML = `Transaction Sent! Waiting for confirmation...`;
        showTxStatus(`Transaction broadcasted. Hash: <a href="https://polygonscan.com/tx/${tx.hash}" target="_blank" class="text-blue-400 hover:underline">${tx.hash}</a>`, "info");
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            ui.endStakeBtn.innerHTML = `Stake Ended Successfully!`;
            ui.endStakeBtn.classList.replace('bg-red-600/90', 'bg-green-600');
            showTxStatus(`Success! View on Explorer: <a href="https://polygonscan.com/tx/${tx.hash}" target="_blank" class="text-green-400 hover:underline">${tx.hash}</a>`, "success");
            
            // Reset UI and refresh stakes after 3 seconds
            setTimeout(() => {
                ui.endStakeBtn.innerHTML = `End Stake Now`;
                ui.endStakeBtn.disabled = false;
                ui.endStakeBtn.classList.replace('bg-green-600', 'bg-red-600/90');
                ui.stakeIdInput.value = '';
                fetchStakes();
            }, 3000);
            
        } else {
            throw new Error("Transaction failed on-chain.");
        }
        
    } catch (error) {
        console.error(error);
        ui.endStakeBtn.innerHTML = `End Stake Now`;
        ui.endStakeBtn.disabled = false;
        
        let errorMsg = error.message;
        if (error.reason) errorMsg = error.reason;
        if (error.code === 'ACTION_REJECTED') errorMsg = "Transaction rejected by user.";
        
        showTxStatus(`Error: ${errorMsg}`, "error");
    }
}

function showTxStatus(message, type) {
    ui.txStatus.classList.remove('hidden', 'bg-blue-900/30', 'text-blue-300', 'border-blue-500/30', 'bg-red-900/30', 'text-red-300', 'border-red-500/30', 'bg-green-900/30', 'text-green-300', 'border-green-500/30');
    ui.txStatus.classList.add('border');
    
    if (type === 'error') {
        ui.txStatus.classList.add('bg-red-900/30', 'text-red-300', 'border-red-500/30');
    } else if (type === 'success') {
        ui.txStatus.classList.add('bg-green-900/30', 'text-green-300', 'border-green-500/30');
    } else {
        ui.txStatus.classList.add('bg-blue-900/30', 'text-blue-300', 'border-blue-500/30');
    }
    
    ui.txStatus.innerHTML = message;
}

// Start
document.addEventListener('DOMContentLoaded', init);
