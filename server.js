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
    username: { type: String, unique: true, sparse: true, lowercase: true },
    email: { type: String, unique: true, sparse: true, lowercase: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// --- SCHEMAS ---
// ... userSchema remains the same

const agreementSchema = new mongoose.Schema({
    contractAddress: { type: String, required: true, unique: true, lowercase: true },
    depositor: { type: String, required: true, lowercase: true },
    arbiter: { type: String, required: true, lowercase:true },
    beneficiary: { type: String, required: true, lowercase: true },
    amount: { type: String, required: true },
    token: { type: String, required: true },
    tokenAddress: { type: String, required: true },
    status: { type: String, default: 'Created' },
    createdAt: { type: Date, default: Date.now },
    deadline: { type: Date, required: true },
    // --- ADD THIS LINE ---
    transactionHash: { type: String, default: null } // To store the fund/release TX hash
});
const Agreement = mongoose.model('Agreement', agreementSchema);

// ... middleware remains the same

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
        if (!address || !password) {
            return res.status(400).send({ error: 'Address and password are required.' });
        }
        if (await User.findOne({ address: address.toLowerCase() })) {
            return res.status(400).send({ error: 'User already registered.' });
        }
        if (username && await User.findOne({ username: username.toLowerCase() })) {
            return res.status(400).send({ error: 'Username is already taken.' });
        }
        if (email && await User.findOne({ email: email.toLowerCase() })) { // ADDED: Email check
            return res.status(400).send({ error: 'Email is already registered.' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newUser = new User({
            address: address.toLowerCase(),
            password: hashedPassword,
            ...(username && { username: username.toLowerCase() }),
            ...(email && { email: email.toLowerCase() })
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
        const { identifier, password } = req.body;
        if (!identifier || !password) {
            return res.status(400).send({ error: 'Identifier and password are required.' });
        }
        let query;
        if (identifier.startsWith('0x')) {
            query = { address: identifier.toLowerCase() };
        } else if (identifier.includes('@')) { // MODIFIED: Check for email format
            query = { email: identifier.toLowerCase() }; // MODIFIED: Look up by email
        } else {
            query = { username: identifier.toLowerCase() }; // Original username lookup
        }
        const user = await User.findOne(query);
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).send({ error: 'Invalid credentials.' });
        }
        const payload = { address: user.address };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        res.send({ token });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).send({ error: 'Server error during login.' });
    }
});

// ... (after the app.post('/api/auth/login', ...) endpoint)

app.put('/api/auth/reset-password', async (req, res) => {
    try {
        const { address, newPassword } = req.body;

        // --- Validation ---
        if (!address || !newPassword) {
            return res.status(400).send({ error: 'Address and new password are required.' });
        }
        if (!address.startsWith('0x')) {
            return res.status(400).send({ error: 'Invalid address format.' });
        }

        // --- Find the user ---
        const user = await User.findOne({ address: address.toLowerCase() });
        if (!user) {
            return res.status(404).send({ error: 'No account found for this address.' });
        }

        // --- Hash the new password and update the user document ---
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await User.updateOne(
            { address: address.toLowerCase() },
            { $set: { password: hashedPassword } }
        );

        res.status(200).send({ message: 'Password has been reset successfully.' });

    } catch (err) {
        console.error("Reset password error:", err);
        res.status(500).send({ error: 'Server error during password reset.' });
    }
});

// --- AGREEMENT API ENDPOINTS ---
// ... (rest of your file)

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

// ... other endpoints remain the same

app.put('/api/agreements/:contractAddress/status', authMiddleware, async (req, res) => {
    try {
        const { contractAddress } = req.params;
        // --- MODIFIED: Destructure status AND transactionHash from the request body ---
        const { status, transactionHash } = req.body;

        const updateData = {
            $set: {
                status: status,
                // Conditionally add transactionHash to the update if it was provided
                ...(transactionHash && { transactionHash: transactionHash })
            }
        };

        const updatedAgreement = await Agreement.findOneAndUpdate(
            { contractAddress: contractAddress.toLowerCase() },
            updateData,
            { new: true }
        );

        if (!updatedAgreement) return res.status(404).send({ error: 'Agreement not found' });
        res.send(updatedAgreement);
    } catch (err) {
        console.error("Error updating status:", err);
        res.status(500).send({ error: 'Server error while updating agreement status' });
    }
});

// ... app.listen remains the same

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));