// server.js (Final, Complete Version with JWT Authentication)

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

// --- Database Connection ---
mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- CORS Configuration ---
const frontendURL = process.env.VERCEL_FRONTEND_URL;
const corsOptions = {
  origin: [frontendURL, 'http://localhost:3000'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));


// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
    address: { type: String, required: true, unique: true, lowercase: true },
    username: { type: String, unique: true, sparse: true, lowercase: true },
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
    status: { type: String, default: 'Created' },
    createdAt: { type: Date, default: Date.now }
});
const Agreement = mongoose.model('Agreement', agreementSchema);


// --- MIDDLEWARE ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader) return res.status(401).send({ error: 'Access denied. No token provided.' });
    
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).send({ error: 'Access denied. Malformed token.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(400).send({ error: 'Invalid token.' });
    }
};

// --- API ENDPOINTS ---

// Auth Routes
app.get('/api/auth/check-user/:address', async (req, res) => {
    try {
        const user = await User.findOne({ address: req.params.address.toLowerCase() });
        res.send({ isRegistered: !!user });
    } catch (err) {
        res.status(500).send({ error: 'Server error' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { address, password, username } = req.body;
        if (!address || !password) {
            return res.status(400).send({ error: 'Address and password are required.' });
        }
        let user = await User.findOne({ address: address.toLowerCase() });
        if (user) return res.status(400).send({ error: 'User already registered.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newUser = new User({
            address: address.toLowerCase(),
            password: hashedPassword,
            ...(username && { username: username.toLowerCase() })
        });
        await newUser.save();

        const payload = { address: newUser.address };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).send({ token });
    } catch (err) {
        if (err.code === 11000) return res.status(400).send({ error: 'Username is already taken.' });
        res.status(500).send({ error: 'Server error during registration.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) {
            return res.status(400).send({ error: 'Identifier and password are required.' });
        }
        const isAddress = identifier.startsWith('0x');
        const query = isAddress ? { address: identifier.toLowerCase() } : { username: identifier.toLowerCase() };
        
        const user = await User.findOne(query);
        if (!user) return res.status(400).send({ error: 'Invalid credentials.' });
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).send({ error: 'Invalid credentials.' });
        
        const payload = { address: user.address };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        res.send({ token });
    } catch (err) {
        res.status(500).send({ error: 'Server error during login.' });
    }
});


// Protected Agreement Routes
app.get('/api/agreements', authMiddleware, async (req, res) => {
    try {
        const userAddress = req.user.address.toLowerCase();
        const agreements = await Agreement.find({
            $or: [{ depositor: userAddress }, { arbiter: userAddress }, { beneficiary: userAddress }]
        }).sort({ createdAt: -1 });
        res.send(agreements);
    } catch (err) {
        res.status(500).send({ error: 'Server error while fetching agreements.' });
    }
});

app.post('/api/agreements', authMiddleware, async (req, res) => {
    try {
        const { contractAddress, depositor, arbiter, beneficiary, amount, token, tokenAddress } = req.body;
        // Additional check to ensure the JWT user is the one creating the agreement
        if (req.user.address.toLowerCase() !== depositor.toLowerCase()) {
            return res.status(403).send({ error: 'Forbidden: You can only create agreements for yourself.' });
        }
        const newAgreement = new Agreement({ contractAddress, depositor, arbiter, beneficiary, amount, token, tokenAddress });
        await newAgreement.save();
        res.status(201).send(newAgreement);
    } catch (err) {
        res.status(500).send({ error: 'Server error while saving agreement.' });
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
        res.status(500).send({ error: 'Server error while updating agreement status.' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));