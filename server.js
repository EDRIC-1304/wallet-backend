// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { ethers } = require('ethers');

// ... (ABI, contract addresses, and provider are the same)
const USDT_CONTRACT_ADDRESS = '0x787A697324dbA4AB965C58CD33c13ff5eeA6295F';
const USDC_CONTRACT_ADDRESS = '0x342e3aA1248AB77E319e3331C6fD3f1F2d4B36B1';
const ABI = ["function transfer(address to, uint amount) returns (bool)"];
const provider = new ethers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545");

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = 'mongodb+srv://edric:wined@cluster0.49d4fas.mongodb.net/metamask';
mongoose.connect(MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error:", err));

// --- MODIFIED: Wallet Schema ---
const walletSchema = new mongoose.Schema({
  userId: String,
  username: { 
    type: String, 
    required: true, 
    unique: true,    // Ensures no two documents can have the same username
    lowercase: true, // Automatically converts username to lowercase before saving
  },
  address: String,
  mnemonic: String,
  encryptedJson: String,
});

const Wallet = mongoose.model('Wallet', walletSchema);

// ... (Transaction Schema is the same)
const transactionSchema = new mongoose.Schema({
    txHash: { type: String, required: true, unique: true, lowercase: true },
    from: String, to: String, amount: String, token: String, status: String,
    blockNumber: Number, gasUsed: String, gasFee: String, timestamp: String
});
const Transaction = mongoose.model('Transaction', transactionSchema);


// Endpoint to create wallet (no code change, but schema change makes it safer)
app.post('/api/wallets', async (req, res) => {
  try {
    const { userId, username, address, mnemonic, encryptedJson } = req.body;
    const wallet = new Wallet({ userId, username, address, mnemonic, encryptedJson });
    await wallet.save();
    res.status(201).send({ message: 'Wallet saved successfully' });
  } catch (err) {
    // Now, if a duplicate username is sent, this will catch the database error
    if (err.code === 11000) {
        return res.status(409).send({ error: 'Username already exists.' }); // 409 Conflict
    }
    res.status(500).send({ error: 'Error saving wallet' });
  }
});


// --- MODIFIED: Endpoint to find wallet (case-insensitive) ---
app.get('/api/wallets/:username', async (req, res) => {
  try {
    // Use a case-insensitive regular expression to find the user
    const found = await Wallet.findOne({ 
      username: { $regex: new RegExp(`^${req.params.username}$`, 'i') } 
    });

    if (!found) return res.status(404).send({ error: 'Wallet not found' });
    res.send(found);
  } catch {
    res.status(500).send({ error: 'Error fetching wallet' });
  }
});


// ... (The rest of your server.js file remains the same)
app.post("/api/transactions/record", async (req, res) => {
    // ... same code
});

app.get('/api/transactions/:address', async (req, res) => {
    // ... same code
});

app.listen(5000, () => {
  console.log("✅ Server running on port 5000");
});