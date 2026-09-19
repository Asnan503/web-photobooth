const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const sessions = {};
global.allPhotos = global.allPhotos || [];
let globalCoupleName = "Agung & Hera";

app.post('/api/register-guest', (req, res) => {
    const { guestName, barcodeId } = req.body;
    if (!guestName) {
        return res.json({ success: false, message: 'Nama tamu harus diisi!' });
    }

    const sessionId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    
    sessions[sessionId] = {
        coupleName: globalCoupleName,
        barcode: `${barcodeId} - ${guestName}`,
        quota: 3,
        usedQuota: 0,
        createdAt: new Date()
    };

    res.json({ success: true, sessionId: sessionId });
});

app.get('/api/session/:id', (req, res) => {
    const session = sessions[req.params.id];
    if (!session) {
        return res.json({ success: false, message: 'Sesi tidak ditemukan atau sudah kadaluarsa.' });
    }
    res.json({ success: true, data: session });
});

app.post('/api/upload-photo', (req, res) => {
    const { sessionId, imageBase64 } = req.body;
    const session = sessions[sessionId];
    
    if (!session) {
        return res.json({ success: false, message: 'Sesi tidak ditemukan.' });
    }
    if (session.usedQuota >= session.quota) {
        return res.json({ success: false, message: 'Kuota foto Anda sudah habis!' });
    }

    try {
        const base64Data = imageBase64.replace(/^data:image\/jpeg;base64,/, "");
        const filename = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
        const filepath = path.join(uploadDir, filename);

        fs.writeFileSync(filepath, base64Data, 'base64');

        const photoUrl = `/uploads/${filename}`;
        session.usedQuota += 1;

        global.allPhotos.push({
            guestName: session.barcode,
            url: photoUrl,
            time: new Date().toLocaleTimeString()
        });

        res.json({ success: true, photoUrl: photoUrl });
    } catch (err) {
        console.error('Gagal menyimpan foto:', err);
        res.json({ success: false, message: 'Gagal menyimpan foto ke server.' });
    }
});

app.get('/api/admin/photos', (req, res) => {
    res.json({ success: true, photos: global.allPhotos });
});

app.listen(PORT, () => {
    console.log(`Server photobooth berjalan di port ${PORT}`);
});
