const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const stream = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi Google Drive API
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
let drive = null;

if (fs.existsSync(CREDENTIALS_PATH)) {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: CREDENTIALS_PATH,
            scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
        drive = google.drive({ version: 'v3', auth });
        console.log('Google Drive API berhasil diinisialisasi.');
    } catch (err) {
        console.error('Gagal menginisialisasi Google Drive API:', err);
    }
} else {
    console.warn('PERINGATAN: File credentials.json tidak ditemukan. Foto akan disimpan secara lokal.');
}

// ID Folder Google Drive Anda (Ganti dengan ID folder yang sudah dishare)
const FOLDER_ID = '1TDhcL8AhRwyq1cbxfmCTPcfTaj4uPnsS'; 

// Database Memori Sementara
const sessions = {};
global.allPhotos = global.allPhotos || [];
let globalCoupleName = "Agung & Hera";

// API Pendaftaran Tamu
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

// API Ambil Sesi
app.get('/api/session/:id', (req, res) => {
    const session = sessions[req.params.id];
    if (!session) {
        return res.json({ success: false, message: 'Sesi tidak ditemukan atau sudah kadaluarsa.' });
    }
    res.json({ success: true, data: session });
});

// API Konfigurasi Sesi dari Admin
app.post('/api/admin/create-session-config', (req, res) => {
    const { coupleName, barcodeId, quota } = req.body;
    globalCoupleName = coupleName || "Agung & Hera";

    const sessionId = 'admin_cfg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    
    sessions[sessionId] = {
        coupleName: coupleName,
        barcode: barcodeId,
        quota: parseInt(quota) || 3,
        usedQuota: 0,
        createdAt: new Date()
    };

    res.json({ success: true, sessionId: sessionId });
});

// API Upload Foto ke Google Drive (Dengan Cadangan Lokal)
app.post('/api/upload-photo', async (req, res) => {
    const { sessionId, imageBase64 } = req.body;
    const session = sessions[sessionId];
    
    if (!session) {
        return.json({ success: false, message: 'Sesi tidak ditemukan.' });
    }
    if (session.usedQuota >= session.quota) {
        return.json({ success: false, message: 'Kuota foto Anda sudah habis!' });
    }

    try {
        const base64Data = imageBase64.replace(/^data:image\/jpeg;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `photo_${session.barcode.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`;

        let photoUrl = '';

        // Coba upload ke Google Drive jika aktif
        if (drive && FOLDER_ID !== '1TDhcL8AhRwyq1cbxfmCTPcfTaj4uPnsS') {
            const bufferStream = new stream.PassThrough();
            bufferStream.end(buffer);

            const fileMetadata = {
                name: filename,
                parents: [FOLDER_ID]
            };

            const media = {
                mimeType: 'image/jpeg',
                body: bufferStream
            };

            const driveResponse = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, webContentLink, webViewLink',
            });

            // Jadikan webContentLink publik atau gunakan format thumbnail drive jika diperlukan
            photoUrl = driveResponse.data.webContentLink || `https://drive.google.com/uc?id=${driveResponse.data.id}`;
        } else {
            // Fallback simpan lokal jika Google Drive belum dikonfigurasi
            const uploadDir = path.join(__dirname, 'public', 'uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const filepath = path.join(uploadDir, filename);
            fs.writeFileSync(filepath, buffer);
            photoUrl = `/uploads/${filename}`;
        }

        session.usedQuota += 1;

        // Catat ke galeri admin
        global.allPhotos.push({
            guestName: session.barcode,
            url: photoUrl,
            time: new Date().toLocaleTimeString()
        });

        res.json({ success: true, photoUrl: photoUrl });
    } catch (err) {
        console.error('Gagal mengunggah foto:', err);
        res.json({ success: false, message: 'Gagal menyimpan foto ke server/cloud.' });
    }
});

// API Galeri Admin
app.get('/api/admin/photos', (req, res) => {
    res.json({ success: true, photos: global.allPhotos });
});

app.listen(PORT, () => {
    console.log(`Server photobooth berjalan di port ${PORT}`);
});
