FENIX Unstake Tool (Polygon)
A lightweight, client-side web application designed to help users identify and end their FENIX stakes on the Polygon network.

The Problem
The official FENIX dashboard occasionally fails to load active stakes on Polygon. This is possibly due to network congestion or RPC node limitations (often rejecting large block history scans). This leaves users unable to find their Stake IDs to end their stakes.

The Solution
This tool bypasses event-log scanning entirely. Instead, it queries the staking contract directly to determine your exact stakeCount. It then runs a local simulation on the blockchain for every stake index tied to your wallet.

* Automatically filters out stakes that have already been ended.
* Identifies Active (Early) stakes and displays their exact maturity date (disabling the end button to protect you from early-unstaking penalties).
* Highlights Ready To End stakes that are fully matured, giving you a safe, 1-click button to claim your payout via MetaMask.

How to Use (Live Website)
1. Navigate to the live website.
2. Click Connect Wallet to connect your MetaMask. Ensure you are on the Polygon Network.
3. Click Scan for My Stakes.
4. Review your stakes. For any stake that is matured, click Select and confirm the transaction in MetaMask to end the stake.

How to Run Locally
If you prefer to run the tool locally on your own machine instead of using a hosted website:
1. Download or clone this repository to your local machine.
2. Because web browsers block MetaMask from interacting with local files directly (file:// protocol), you must run a local web server.
3. If you are on Windows, simply double-click the included start.bat file. This will start a local server using Python or Node.js and automatically open the app in your browser at http://127.0.0.1:8000.
4. Connect your wallet and scan for your stakes.

Security & Privacy
This is a purely front-end DApp. It consists entirely of HTML, CSS (Tailwind), and JavaScript (Ethers.js).
* There is no backend server.
* No data is collected, stored, or sent anywhere other than directly to the Polygon blockchain via your own MetaMask wallet.
* You can freely inspect app.js to verify the logic.

License
This project is licensed under the MIT License. See the LICENSE file for details.
Disclaimer: This software is provided "as is", without warranty of any kind. Use at your own risk. Always verify contract addresses and transactions in your wallet before signing.
