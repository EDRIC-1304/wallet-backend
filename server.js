// server.js (Ready for Deployment on Render - with typo corrected)

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); // Use dotenv for local development

const app = express();
app.use(express.json());

// --- Database Connection using Environment Variable ---
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- CORS Configuration using Environment Variable ---
const frontendURL = process.env.VERCEL_FRONTEND_URL;
const corsOptions = {
  origin: [frontendURL, 'http://localhost:3000'], // Allow Vercel and local dev
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// --- Escrow Agreement Schema ---
const agreementSchema = new mongoose.Schema({
    contractAddress: { type: String, required: true, unique: true, lowercase: true },
    depositor: { type: String, required: true, lowercase: true },
    arbiter: { type: String, required: true, lowercase:true },
    beneficiary: { type: String, required: true, lowercase: true },
    amount: { type: String, required: true },
    token: { type: String, required: true },
    tokenAddress: { type: String, required: true },
    status: { type: String, default: 'Created' },
    createdAt: { type: Date, default: Date.now }
});
const Agreement = mongoose.model('Agreement', agreementSchema);

// --- API Endpoints ---

// POST /api/agreements - Creates a new agreement
app.post('/api/agreements', async (req, res) => {
    try {
        const { contractAddress, depositor, arbiter, beneficiary, amount, token, tokenAddress } = req.body;
        if (!contractAddress || !depositor || !arbiter || !beneficiary || !amount || !token || !tokenAddress) {
            return res.status(400).send({ error: 'Missing required agreement fields.' });
        }
        const newAgreement = new Agreement({ contractAddress, depositor, arbiter, beneficiary, amount, token, tokenAddress });
        await newAgreement.save();
        res.status(201).send(newAgreement);
    } catch (err) {
        if (err.code === 11000) return res.status(409).send({ error: 'This agreement already exists.' });
        console.error("Error creating agreement:", err);
        res.status(500).send({ error: 'Server error while saving agreement' });
    }
});

// GET /api/agreements/:address - Fetches agreements for a user
app.get('/api/agreements/:address', async (req, res) => {
    try {
        const userAddress = req.params.address.toLowerCase();
        // **** THIS IS THE CORRECTED LOGIC ****
        const agreements = await Agreement.find({
            $or: [
                { depositor: userAddress },
                { arbiter: userAddress },
                { beneficiary: userAddress } // Corrected from userArray to userAddress
            ]
        }).sort({ createdAt: -1 });
        res.send(agreements);
    } catch (err) {
        console.error("Error fetching agreements:", err);
        res.status(500).send({ error: 'Server error while fetching agreements' });
    }
});

// PUT /api/agreements/:contractAddress/status - Updates an agreement's status
app.put('/api/agreements/:contractAddress/status', async (req, res) => {
    try {
        const { contractAddress } = req.params;
        const { status } = req.body;
        if (!status || !['Funded', 'Released'].includes(status)) {
            return res.status(400).send({ error: 'A valid status ("Funded" or "Released") is required.' });
        }
        const updatedAgreement = await Agreement.findOneAndUpdate(
            { contractAddress: contractAddress.toLowerCase() },
            { $set: { status: status } },
            { new: true }
        );
        if (!updatedAgreement) return res.status(404).send({ error: 'Agreement not found' });
        res.send(updatedAgreement);
    } catch (err) {
        console.error("Error updating agreement status:", err);
        res.status(500).send({ error: 'Server error while updating status' });
    }
});


// --- Dynamic Port Binding ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});