const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simulasi Database Sederhana untuk Sesi Tamu / Barcode
// key: sessionId, value: { coupleName, barcode, quota }
const sessions = {};

// Endpoint untuk membuat Sesi Baru / Barcode Baru (Admin)
app.post('/api/create-session', async (req, res) => {
    const { coupleName, barcode, quota = 3 } = req.body;
    const sessionId = 'session_' + Date.now();
    
    sessions[sessionId] = {
        coupleName: coupleName || 'Wedding Party',
        barcode: barcode || 'BARCODE001',
        quota: parseInt(quota),
        usedQuota: 0
    };

    // Generate QR URL yang mengarah ke halaman capture HP tamu
    const host = req.get('host');
    const captureUrl = `http://${host}/capture.html?session=${sessionId}`;
    
    try {
        const qrImage = await QRCode.toDataURL(captureUrl);
        res.json({ success: true, sessionId, captureUrl, qrImage });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint untuk memeriksa informasi sesi & kuota tamu
app.get('/api/session/:id', (req, res) => {
    const session = sessions[req.params.id];
    if (!session) {
        return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan atau sudah kedaluwarsa.' });
    }
    res.json({ success: true, data: session });
});

// Endpoint untuk menerima hasil foto dari HP Tamu
app.post('/api/upload-photo', (req, res) => {
    const { sessionId, imageBase64 } = req.body;
    const session = sessions[sessionId];

    if (!session) {
        return res.status(404).json({ success: false, message: 'Sesi tidak valid.' });
    }

    if (session.usedQuota >= session.quota) {
        return res.status(400).json({ success: false, message: 'Kuota ambil gambar sudah habis!' });
    }

    session.usedQuota += 1;

    // Broadcast foto ke layar utama (jika ada live display/slideshow)
    io.emit('new-photo', {
        coupleName: session.coupleName,
        barcode: session.barcode,
        image: imageBase64
    });

    res.json({ 
        success: true, 
        remainingQuota: session.quota - session.usedQuota 
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server Photobooth berjalan di http://localhost:${PORT}`);
});