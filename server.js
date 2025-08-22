// server.js (Ready for Deployment on Render)

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

// --- API Endpoints (No changes needed here) ---
app.post('/api/agreements', async (req, res) => { /* ... your endpoint logic ... */ });
app.get('/api/agreements/:address', async (req, res) => { /* ... your endpoint logic ... */ });
app.put('/api/agreements/:contractAddress/status', async (req, res) => { /* ... your endpoint logic ... */ });


// --- Dynamic Port Binding ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});