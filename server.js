// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { ethers } = require('ethers');

// Add these
const USDT_CONTRACT_ADDRESS = '0x787A697324dbA4AB965C58CD33c13ff5eeA6295F';
const USDC_CONTRACT_ADDRESS = '0x342e3aA1248AB77E319e3331C6fD3f1F2d4B36B1';
const ABI = ["function transfer(address to, uint amount) returns (bool)"];

// Set up provider
const provider = new ethers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545");


const app = express();
app.use(cors());
app.use(express.json());

// --- MODIFIED SECTION START ---

// Your MongoDB connection string
const MONGO_URI = 'mongodb+srv://edric:wined@cluster0.49d4fas.mongodb.net/metamask';

// Connect MongoDB
mongoose.connect(MONGO_URI)
.then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("MongoDB Error:", err));

// --- MODIFIED SECTION END ---


// Wallet Schema (no change)
const walletSchema = new mongoose.Schema({
  userId: String,
  username: String,
  address: String,
  mnemonic: String,
  encryptedJson: String,
});
const Wallet = mongoose.model('Wallet', walletSchema);

// Transaction Schema (added 'status' and made txHash unique)
const transactionSchema = new mongoose.Schema({
  txHash: { type: String, required: true, unique: true, lowercase: true },
  from: String,
  to: String,
  amount: String,
  token: String,
  status: String,
  blockNumber: Number,
  gasUsed: String,
  gasFee: String,
  timestamp: String
});
const Transaction = mongoose.model('Transaction', transactionSchema);

// Endpoint to create wallet (no change)
app.post('/api/wallets', async (req, res) => {
  try {
    const { userId, username, address, mnemonic, encryptedJson } = req.body;
    const wallet = new Wallet({ userId, username, address, mnemonic, encryptedJson });
    await wallet.save();
    res.status(201).send({ message: 'Wallet saved successfully' });
  } catch (err) {
    res.status(500).send({ error: 'Error saving wallet' });
  }
});

// Endpoint to find wallet (no change)
app.get('/api/wallets/:username', async (req, res) => {
  try {
    const found = await Wallet.findOne({ username: req.params.username });
    if (!found) return res.status(404).send({ error: 'Wallet not found' });
    res.send(found);
  } catch {
    res.status(500).send({ error: 'Error fetching wallet' });
  }
});

// NEW/REPURPOSED Endpoint to automatically record a transaction
app.post("/api/transactions/record", async (req, res) => {
  const { txHash } = req.body;

  try {
    // 1. Check if the transaction is already in the database to prevent duplicates
    const existing = await Transaction.findOne({ txHash: txHash.toLowerCase() });
    if (existing) {
      return res.json(existing); // If already exists, just return it.
    }

    // 2. Fetch transaction details from the blockchain
    const tx = await provider.getTransaction(txHash);
    const receipt = await provider.getTransactionReceipt(txHash);

    // 3. Ensure transaction was successful
    if (!tx || !receipt || receipt.status !== 1) { // status: 1 is success
      return res.status(400).json({ error: "Transaction not found or it failed" });
    }

    const block = await provider.getBlock(receipt.blockNumber);
    const gasUsed = receipt.gasUsed.toString();
    const gasPrice = tx.gasPrice;
    const gasFee = ethers.formatEther(BigInt(gasUsed) * gasPrice);

    let token = "BNB";
    let amount = ethers.formatEther(tx.value);
    let finalTo = tx.to; // The contract address for token transfers
    const status = "success";

    // 4. Decode data for token transfers (like USDT or USDC)
    if (tx.data.startsWith("0xa9059cbb")) { // This is the function signature for 'transfer'
      const iface = new ethers.Interface(ABI);
      const decodedData = iface.parseTransaction({ data: tx.data });
      finalTo = decodedData.args.to; // The actual recipient
      amount = ethers.formatUnits(decodedData.args.amount, 18); // Assuming 18 decimals

      if (tx.to.toLowerCase() === USDT_CONTRACT_ADDRESS.toLowerCase()) token = "USDT";
      else if (tx.to.toLowerCase() === USDC_CONTRACT_ADDRESS.toLowerCase()) token = "USDC";
    }

    // 5. Create the new transaction document
    const txData = {
      txHash: txHash.toLowerCase(),
      from: tx.from,
      to: finalTo,
      amount,
      token,
      status,
      blockNumber: receipt.blockNumber,
      gasUsed,
      gasFee,
      timestamp: new Date(block.timestamp * 1000).toISOString() 
    };

    // 6. Save it to the database
    const savedTx = await Transaction.create(txData);
    return res.status(201).json(savedTx);

  } catch (err) {
    console.error("Verification error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Get transactions by address (no change)
app.get('/api/transactions/:address', async (req, res) => {
  try {
    const addr = req.params.address.toLowerCase();
    const txs = await Transaction.find({
      $or: [
        { from: { $regex: new RegExp(`^${addr}$`, 'i') } },
        { to: { $regex: new RegExp(`^${addr}$`, 'i') } }
      ]
    }).sort({ _id: -1 });
    res.send(txs);
  } catch {
    res.status(500).send({ error: 'Error fetching transactions' });
  }
});

app.listen(5000, () => {
  console.log("✅ Server running on port 5000");
});