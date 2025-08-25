// server.js (Final Version with Password Auth and JWT Sessions)

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
const JWT_SECRET = process.env.JWT_SECRET; // IMPORTANT: Add a long, random secret string in Render

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

// NEW: User Schema for authentication
const userSchema = new mongoose.Schema({
    address: { type: String, required: true, unique: true, lowercase: true },
    username: { type: String, unique: true, sparse: true, lowercase: true }, // Optional and unique
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// Agreement Schema (Unchanged)
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

// Middleware to verify JWT token and protect routes
const authMiddleware = (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
        return res.status(401).send({ error: 'Access denied. No token provided.' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return res.status(401).send({ error: 'Access denied. Malformed token.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Adds the user payload (e.g., { address: '...' }) to the request
        next();
    } catch (err) {
        res.status(400).send({ error: 'Invalid token.' });
    }
};


// --- API ENDPOINTS ---

// --- Authentication Routes ---

// @route   POST /api/auth/check-user/:address
// @desc    Check if a wallet address is already registered.
app.get('/api/auth/check-user/:address', async (req, res) => {
    try {
        const user = await User.findOne({ address: req.params.address.toLowerCase() });
        res.send({ isRegistered: !!user });
    } catch (err) {
        res.status(500).send({ error: 'Server error' });
    }
});


// @route   POST /api/auth/register
// @desc    Register a new user after they've signed a message.
app.post('/api/auth/register', async (req, res) => {
    try {
        const { address, password, username } = req.body;
        if (!address || !password) {
            return res.status(400).send({ error: 'Address and password are required.' });
        }

        let user = await User.findOne({ address: address.toLowerCase() });
        if (user) {
            return res.status(400).send({ error: 'User already registered.' });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newUser = new User({
            address: address.toLowerCase(),
            password: hashedPassword,
            ...(username && { username: username.toLowerCase() }) // Add username only if provided
        });

        await newUser.save();

        // Create and sign a JWT token
        const payload = { address: newUser.address };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }); // Token expires in 7 days
        
        res.status(201).send({ token });

    } catch (err) {
        if (err.code === 11000) return res.status(400).send({ error: 'Username is already taken.' });
        res.status(500).send({ error: 'Server error during registration.' });
    }
});


// @route   POST /api/auth/login
// @desc    Log in a user with address/username and password.
app.post('/api/auth/login', async (req, res) => {
    try {
        const { identifier, password } = req.body; // identifier can be address or username
        if (!identifier || !password) {
            return res.status(400).send({ error: 'Identifier and password are required.' });
        }

        const isAddress = identifier.startsWith('0x');
        const query = isAddress ? { address: identifier.toLowerCase() } : { username: identifier.toLowerCase() };
        
        const user = await User.findOne(query);
        if (!user) {
            return res.status(400).send({ error: 'Invalid credentials.' });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).send({ error: 'Invalid credentials.' });
        }
        
        const payload = { address: user.address };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

        res.send({ token });

    } catch (err) {
        res.status(500).send({ error: 'Server error during login.' });
    }
});


// --- Agreement Routes (Now Protected) ---

app.get('/api/agreements', authMiddleware, async (req, res) => {
    try {
        // req.user.address comes from the decoded JWT in authMiddleware
        const userAddress = req.user.address.toLowerCase();
        const agreements = await Agreement.find({
            $or: [{ depositor: userAddress }, { arbiter: userAddress }, { beneficiary: userAddress }]
        }).sort({ createdAt: -1 });
        res.send(agreements);
    } catch (err) {
        res.status(500).send({ error: 'Server error while fetching agreements.' });
    }
});

// All other agreement routes should also be protected by authMiddleware
app.post('/api/agreements', authMiddleware, async (req, res) => { /* ... unchanged logic ... */ });
app.put('/api/agreements/:contractAddress/status', authMiddleware, async (req, res) => { /* ... unchanged logic ... */ });


// --- Dynamic Port Binding ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});