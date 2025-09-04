// server.js (UPDATED with Deadline Logic - FULL CODE)

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());

// --- Configuration ---
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URI || !JWT_SECRET) {
    console.error("FATAL ERROR: MONGO_URI and JWT_SECRET environment variables are required.");
    process.exit(1);
}

// --- Database Connection & CORS ---
mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));
const frontendURL = process.env.VERCEL_FRONTEND_URL;
const corsOptions = {
  origin: [frontendURL, 'http://localhost:3000'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
    address: { type: String, required: true, unique: true, lowercase: true },
    username: { type: String, required: true, unique: true, lowercase: true }, // Made required
    email: { type: String, required: true, unique: true, lowercase: true },     // Made required
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

const agreementSchema = new mongoose.Schema({
    contractAddress: { type: String, required: true, unique: true, lowercase: true },
    depositor: { type: String, required: true, lowercase: true },
    arbiter: { type: String, required: true, lowercase:true },
    beneficiary: { type: String, required: true, lowercase: true },
    amount: { type: String, required: true },
    token: { type: String, required: true },
    tokenAddress: { type: String, required: true },
    status: { type: String, default: 'Created' }, // Now includes 'Expired'
    createdAt: { type: Date, default: Date.now },
    // --- NEW ---
    deadline: { type: Date, required: true } // Store the expiration time
});
const Agreement = mongoose.model('Agreement', agreementSchema);

// --- MIDDLEWARE ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader) return res.status(401).send({ error: 'Access denied. No token provided.' });
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).send({ error: 'Access denied. Malformed token.' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        res.status(400).send({ error: 'Invalid token.' });
    }
};

// --- AUTH API ENDPOINTS ---
app.get('/api/auth/check-user/:address', async (req, res) => {
    try {
        const user = await User.findOne({ address: req.params.address.toLowerCase() });
        res.send({ isRegistered: !!user });
    } catch (err) {
        console.error("Check-user error:", err);
        res.status(500).send({ error: 'Server error' });
    }
});

        app.post('/api/auth/register', async (req, res) => {
        try {
        const { address, password, username, email } = req.body;
        // NEW: All three (address, username, email, password) are now required
        if (!address || !password || !username || !email) {
            return res.status(400).send({ error: 'Address, username, email, and password are required for registration.' });
        }

        if (await User.findOne({ address: address.toLowerCase() })) {
            return res.status(400).send({ error: 'Wallet address already registered.' });
        }
        if (await User.findOne({ username: username.toLowerCase() })) {
            return res.status(400).send({ error: 'Username is already taken.' });
        }
        if (await User.findOne({ email: email.toLowerCase() })) {
            return res.status(400).send({ error: 'Email is already registered.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            address: address.toLowerCase(),
            username: username.toLowerCase(), // Now required
            email: email.toLowerCase(),       // Now required
            password: hashedPassword,
        });
        await newUser.save();

        const payload = { address: newUser.address };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).send({ token });
    } catch (err) {
    if (err.code === 11000) return res.status(400).send({ error: 'Username or Email is already taken.' }); // MODIFIED: Updated error message
        console.error("Register error:", err);
        res.status(500).send({ error: 'Server error during registration.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, email, password } = req.body; // Expect username OR email, and password

        // NEW: Ensure at least one identifier (username or email) and password are provided
        if (!password || (!username && !email)) {
            return res.status(400).send({ error: 'Password and either username or email are required for login.' });
        }

        let user = null;
        if (username) {
            user = await User.findOne({ username: username.toLowerCase() });
        } else if (email) { // If username is not provided, try with email
            user = await User.findOne({ email: email.toLowerCase() });
        }

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).send({ error: 'Invalid username, email, or password.' });
        }

        const payload = { address: user.address };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        res.send({ token });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).send({ error: 'Server error during login.' });
    }
});

// --- AGREEMENT API ENDPOINTS ---
app.get('/api/agreements', authMiddleware, async (req, res) => {
    try {
        const userAddress = req.user.address.toLowerCase();
        let agreements = await Agreement.find({
            $or: [{ depositor: userAddress }, { arbiter: userAddress }, { beneficiary: userAddress }]
        }).sort({ createdAt: -1 }).lean();
        
        const now = new Date();
        for (const agg of agreements) {
            if (agg.status === 'Created' && now > agg.deadline) {
                agg.status = 'Expired';
            }
        }
        res.send(agreements);
    } catch (err) {
        console.error("Error fetching agreements:", err);
        res.status(500).send({ error: 'Server error while fetching agreements' });
    }
});

app.post('/api/agreements', authMiddleware, async (req, res) => {
    try {
        const { contractAddress, depositor, arbiter, beneficiary, amount, token, tokenAddress } = req.body;
        
        const deadline = new Date(Date.now() + 2 * 60 * 1000);
        const newAgreement = new Agreement({
            contractAddress, depositor, arbiter, beneficiary, amount, token, tokenAddress, deadline
        });
        await newAgreement.save();
        res.status(201).send(newAgreement);
    } catch (err) {
        console.error("Error saving agreement:", err);
        res.status(500).send({ error: 'Server error while saving agreement' });
    }
});

app.put('/api/agreements/:contractAddress/status', authMiddleware, async (req, res) => {
    try {
        const { contractAddress } = req.params;
        const { status } = req.body;
        const updatedAgreement = await Agreement.findOneAndUpdate(
            { contractAddress: contractAddress.toLowerCase() },
            { $set: { status: status } },
            { new: true }
        );
        if (!updatedAgreement) return res.status(404).send({ error: 'Agreement not found' });
        res.send(updatedAgreement);
    } catch (err) {
        console.error("Error updating status:", err);
        res.status(500).send({ error: 'Server error while updating agreement status' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));