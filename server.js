// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { ethers } = require('ethers');

// --- Constants ---
const USDT_CONTRACT_ADDRESS = '0x787A697324dbA4AB965C58CD33c13ff5eeA6295F';
const USDC_CONTRACT_ADDRESS = '0x342e3aA1248AB77E319e3331C6fD3f1F2d4B36B1';
const ABI = ["function transfer(address to, uint amount) returns (bool)"];
const provider = new ethers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545");

const app = express();
app.use(cors());
app.use(express.json());

// --- Database Connection ---
const MONGO_URI = 'mongodb+srv://edric:wined@cluster0.49d4fas.mongodb.net/metamask';
mongoose.connect(MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error:", err));

// --- Wallet Schema with Unique Username ---
const walletSchema = new mongoose.Schema({
  userId: String,
  username: { 
    type: String, 
    required: true, 
    unique: true,    // Enforces unique usernames at the database level
    lowercase: true, // Automatically converts username to lowercase
  },
  address: String,
  mnemonic: String,
  encryptedJson: String,
});

const Wallet = mongoose.model('Wallet', walletSchema);

// --- Transaction Schema ---
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


// --- Endpoint to create wallet (handles duplicate usernames) ---
app.post('/api/wallets', async (req, res) => {
  try {
    const { userId, username, address, mnemonic, encryptedJson } = req.body;
    const wallet = new Wallet({ userId, username, address, mnemonic, encryptedJson });
    await wallet.save();
    res.status(201).send({ message: 'Wallet saved successfully' });
  } catch (err) {
    // Catches the database error for a duplicate username
    if (err.code === 11000) {
        return res.status(409).send({ error: 'Username already exists.' });
    }
    res.status(500).send({ error: 'Error saving wallet' });
  }
});


// --- Endpoint to find wallet (case-insensitive) ---
app.get('/api/wallets/:username', async (req, res) => {
  try {
    // Converts search term to lowercase to match the database schema
    const found = await Wallet.findOne({ 
      username: req.params.username.toLowerCase()
    });

    if (!found) return res.status(404).send({ error: 'Wallet not found' });
    res.send(found);
  } catch {
    res.status(500).send({ error: 'Error fetching wallet' });
  }
});


// --- Endpoint to record a transaction (saves addresses as lowercase for future consistency) ---
app.post("/api/transactions/record", async (req, res) => {
  const { txHash } = req.body;
  try {
    const existing = await Transaction.findOne({ txHash: txHash.toLowerCase() });
    if (existing) {
      return res.json(existing);
    }

    const tx = await provider.getTransaction(txHash);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!tx || !receipt || receipt.status !== 1) {
      return res.status(400).json({ error: "Transaction not found or it failed" });
    }

    const block = await provider.getBlock(receipt.blockNumber);
    const gasFee = ethers.formatEther(receipt.gasUsed * tx.gasPrice);

    let token = "BNB";
    let amount = ethers.formatEther(tx.value);
    let finalTo = tx.to;

    if (tx.data && tx.data.startsWith("0xa9059cbb")) {
      const iface = new ethers.Interface(ABI);
      const decodedData = iface.parseTransaction({ data: tx.data });
      finalTo = decodedData.args.to;
      amount = ethers.formatUnits(decodedData.args.amount, 18);
      if (tx.to.toLowerCase() === USDT_CONTRACT_ADDRESS.toLowerCase()) token = "USDT";
      else if (tx.to.toLowerCase() === USDC_CONTRACT_ADDRESS.toLowerCase()) token = "USDC";
    }
    
    const txData = {
      txHash: txHash.toLowerCase(),
      from: tx.from.toLowerCase(), // Standardize to lowercase
      to: finalTo.toLowerCase(),   // Standardize to lowercase
      amount, token, status: "success", blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(), gasFee,
      timestamp: new Date(block.timestamp * 1000).toISOString() 
    };

    const savedTx = await Transaction.create(txData);
    return res.status(201).json(savedTx);
  } catch (err) {
    console.error("Verification error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- FIXED: Get transactions by address (case-insensitive search) ---
app.get('/api/transactions/:address', async (req, res) => {
  try {
    const addr = req.params.address;

    // This is the definitive fix. It uses a case-insensitive regex search
    // to find transactions regardless of how the address was stored.
    const txs = await Transaction.find({
      $or: [
        { from: { $regex: new RegExp(`^${addr}$`, 'i') } },
        { to:   { $regex: new RegExp(`^${addr}$`, 'i') } }
      ]
    }).sort({ timestamp: -1 });

    res.send(txs);
  } catch (err) {
    console.error("Error fetching transactions:", err);
    res.status(500).send({ error: 'Error fetching transactions' });
  }
});

app.listen(5000, () => {
  console.log("✅ Server running on port 5000");
});