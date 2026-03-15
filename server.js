require('dotenv').config(); // Loads our hidden .env variables
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose'); // Import Mongoose

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// ==========================================
// 1. MONGODB CONNECTION
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('📦 Connected to MongoDB Successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ==========================================
// 2. DATABASE SCHEMA (The Blueprint)
// ==========================================
const participantSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // The ticket ID
    fullName: String,
    email: String,
    phone: String,
    gender: String,
    matricNo: String,
    department: String,
    receiptPath: String,
    isValidated: { type: Boolean, default: false },
    scannedAt: { type: String, default: null },
    registeredAt: { type: Date, default: Date.now }
});

const Participant = mongoose.model('Participant', participantSchema);

// ==========================================
// 3. FILE UPLOAD CONFIGURATION
// ==========================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// ==========================================
// 4. API ROUTES
// ==========================================

// --- REGISTRATION ROUTE ---
app.post('/api/register', upload.single('receipt'), async (req, res) => {
    try {
        const { fullName, email, phone, gender, matricNo, department } = req.body;
        const receiptFile = req.file;

        if (!receiptFile) return res.status(400).json({ error: 'Receipt required.' });

        const ticketId = uuidv4();
        const qrCodeDataUrl = await QRCode.toDataURL(ticketId, { errorCorrectionLevel: 'H', margin: 2, width: 300 });

        // Save to actual MongoDB Database
        const newParticipant = new Participant({
            id: ticketId,
            fullName,
            email,
            phone,
            gender,
            matricNo,
            department,
            receiptPath: receiptFile.path
        });
        
        await newParticipant.save();
        console.log(`✅ Saved to DB: ${fullName} (${matricNo})`);

        res.json({ success: true, qrCodeUrl: qrCodeDataUrl });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: 'Database error during registration.' });
    }
});

// --- ADMIN GET PARTICIPANTS ROUTE ---
app.get('/api/admin/participants', async (req, res) => {
    try {
        // Fetch all from DB, sorted by newest first
        const participants = await Participant.find().sort({ registeredAt: -1 });
        res.json(participants);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch participants' });
    }
});

// --- ADMIN LOGIN ROUTE ---
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        return res.json({ success: true, message: 'Login successful' });
    }
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// --- ADMIN VALIDATE QR CODE ROUTE ---
app.post('/api/admin/validate', async (req, res) => {
    try {
        const { ticketId } = req.body;
        if (!ticketId) return res.status(400).json({ success: false, message: 'No ticket ID provided.' });

        // Find in MongoDB
        const participant = await Participant.findOne({ id: ticketId });

        if (!participant) {
            return res.status(404).json({ success: false, message: '❌ Invalid Ticket: Not found.' });
        }

        if (participant.isValidated) {
            return res.status(400).json({ 
                success: false, 
                message: `⚠️ Ticket ALREADY USED at ${participant.scannedAt}` 
            });
        }

        // Update in MongoDB
        participant.isValidated = true;
        participant.scannedAt = new Date().toLocaleTimeString();
        await participant.save();

        return res.json({
            success: true,
            message: '✅ Ticket Validated Successfully! Grant Entry.',
            participant: { fullName: participant.fullName, matricNo: participant.matricNo }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Database error during validation.' });
    }
});

// ==========================================
// 5. START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Backend Server is running on http://localhost:${PORT}`);
});