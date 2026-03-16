require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

// CLOUDINARY IMPORTS
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// 1. MONGODB CONNECTION
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('📦 Connected to MongoDB Successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// 2. DATABASE SCHEMA
const participantSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
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

// 3. CLOUDINARY CONFIGURATION
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'event_receipts', 
        allowedFormats: ['jpeg', 'png', 'jpg', 'pdf']
    }
});

const upload = multer({ storage: storage });

// 4. API ROUTES
app.post('/api/register', upload.single('receipt'), async (req, res) => {
    try {
        const { fullName, email, phone, gender, matricNo, department } = req.body;
        const receiptFile = req.file;

        if (!receiptFile) return res.status(400).json({ error: 'Receipt required.' });

        const ticketId = uuidv4();
        const qrCodeDataUrl = await QRCode.toDataURL(ticketId, { errorCorrectionLevel: 'H', margin: 2, width: 300 });

        const newParticipant = new Participant({
            id: ticketId,
            fullName,
            email,
            phone,
            gender,
            matricNo,
            department,
            receiptPath: receiptFile.path // Saves the Cloudinary URL
        });
        
        await newParticipant.save();
        console.log(`✅ Saved to DB: ${fullName} (${matricNo})`);

        res.json({ success: true, qrCodeUrl: qrCodeDataUrl });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: 'Database error during registration.' });
    }
});

app.get('/api/admin/participants', async (req, res) => {
    try {
        const participants = await Participant.find().sort({ registeredAt: -1 });
        res.json(participants);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch participants' });
    }
});

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        return res.json({ success: true, message: 'Login successful' });
    }
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

app.post('/api/admin/validate', async (req, res) => {
    try {
        const { ticketId } = req.body;
        if (!ticketId) return res.status(400).json({ success: false, message: 'No ticket ID provided.' });

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

        participant.isValidated = true;
        participant.scannedAt = new Date().toLocaleTimeString();
        await participant.save();

        return res.json({
            success: true,
            message: '✅ Ticket Validated Successfully! Grant Entry.',
            participant: { 
                fullName: participant.fullName, 
                matricNo: participant.matricNo,
                paymentReceipt: participant.receiptPath 
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Database error during validation.' });
    }
});

// 5. START SERVER
app.listen(PORT, () => {
    console.log(`🚀 Backend Server is running on http://localhost:${PORT}`);
});