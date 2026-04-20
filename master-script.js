// --- CONFIG & INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDoo_WtH6JbT0KvMzmud5Ew_TpEjgFGqhU",
    authDomain: "fir-kuis-23368.firebaseapp.com",
    databaseURL: "https://fir-kuis-23368-default-rtdb.asia-southeast1.firebasedatabase.app"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// 1. PROTEKSI PANEL MASTER
auth.onAuthStateChanged((user) => {
    const MASTER_EMAIL = "firman.a.prasetyo@gmail.com";
    if (!user || user.email !== MASTER_EMAIL) {
        alert("Akses Ditolak! Hanya Master yang boleh masuk.");
        window.location.href = "admin.html";
    } else {
        loadAllUsers();
    }
});

// 2. LOAD DAFTAR USER & HITUNG STATISTIK (VERSI OPTIMASI)
function loadAllUsers() {
    const tbody = document.getElementById('user-list-body');
    if (!tbody) return;

    const statTotalUser = document.getElementById('stat-total-user');
    const statTotalPremium = document.getElementById('stat-total-premium');
    const statTotalQuiz = document.getElementById('stat-total-quiz');

    // 1. Ambil Total Kuis
    database.ref('quiz_index').on('value', (snap) => {
        if(statTotalQuiz) statTotalQuiz.innerText = snap.numChildren();
    });

    // 2. Ambil Semua Data User
    database.ref('users').on('value', async (snapshot) => {
        tbody.innerHTML = '';
        let countPremium = 0;
        let countTotal = snapshot.numChildren();

        if(statTotalUser) statTotalUser.innerText = countTotal;

        snapshot.forEach((childSnapshot) => {
            const uid = childSnapshot.key;
            const userData = childSnapshot.val();
            
            // --- MODIFIKASI DISINI: LOGIKA MULTI-FIELD ---
            // Kita cek satu-satu: profile.nama -> profile.name -> authorName -> fallback
            let displayNama = userData.profile?.nama || 
                              userData.profile?.name || 
                              userData.authorName || 
                              "User Baru";

            // Cek email di profile atau root
            // 1. Cek di database dulu (jangan kasih "-" dulu di sini)
            let displayEmail = userData.profile?.email || userData.email;

            // 2. Logika Tambahan khusus Master
            if (!displayEmail && uid === "QWAUGXh6oyOoDNEGB9ZSi09jNwu1") {
                displayEmail = "firman.a.prasetyo@gmail.com";
            }

            // 3. BARU KASIH FALLBACK (Jika tetap kosong setelah dicek semua)
            displayEmail = displayEmail || "-";
            
            const isPremium = userData.is_premium || false;
            const expiry = userData.expiry_date || "-";

            if (isPremium) countPremium++;

            // Jika email masih belum ketemu, cari di kuis mereka
            if (displayEmail === "-") {
                database.ref('quiz_index').orderByChild('userId').equalTo(uid).limitToFirst(1).once('value', (quizSnap) => {
                    if (quizSnap.exists()) {
                        quizSnap.forEach(q => {
                            const qData = q.val();
                            const foundEmail = qData.authorEmail;
                            const foundNama = qData.authorName;

                            const row = document.getElementById(`row-${uid}`);
                            if (row) {
                                if (foundNama) row.cells[0].innerHTML = `<strong>${foundNama}</strong>`;
                                if (foundEmail) row.cells[1].innerText = foundEmail;
                            }
                        });
                    }
                });
            }

            // PEWARNAAN BARIS (CEK EXPIRED)
            let rowStyle = "";
            if (isPremium && expiry !== "-") {
                const today = new Date();
                const expDate = new Date(expiry);
                const diffTime = expDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays < 0) {
                    rowStyle = "background-color: #fff1f2;"; 
                } else if (diffDays <= 3) {
                    rowStyle = "background-color: #fffbeb;"; 
                }
            }

            const tr = document.createElement('tr');
            tr.id = `row-${uid}`;
            tr.style = rowStyle;
            tr.innerHTML = `
                <td><strong>${displayNama}</strong></td>
                <td>${displayEmail}</td>
                <td>
                    <span class="badge ${isPremium ? 'badge-premium' : 'badge-free'}">
                        ${isPremium ? '💎 PREMIUM' : 'FREE'}
                    </span>
                </td>
                <td><small>${expiry}</small></td>
                <td>
                    <div style="display: flex; gap: 5px; justify-content: center;">
                        <button class="btn-master btn-edit" onclick="openMasterModal('${uid}', ${isPremium}, '${expiry}')" title="Atur Akses">
                            <i class="fas fa-user-cog"></i>
                        </button>
                        <button class="btn-hapus" onclick="hapusUser('${uid}', '${displayNama}')" title="Hapus User">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if(statTotalPremium) statTotalPremium.innerText = countPremium;
    });
}

//FUNGSI SEARCH
document.getElementById('search-user').addEventListener('input', function(e) {
    const keyword = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#user-list-body tr');

    rows.forEach(row => {
        const name = row.cells[0].textContent.toLowerCase();
        const email = row.cells[1].textContent.toLowerCase();
        
        if (name.includes(keyword) || email.includes(keyword)) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    });
});

// 3. MODAL CONTROL
window.openMasterModal = function(uid, isPremium, expiry) {
    document.getElementById('target-uid').value = uid;
    document.getElementById('select-status').value = isPremium.toString();
    document.getElementById('input-expiry').value = expiry || "";
    document.getElementById('modal-premium').style.display = 'block';
};

window.closeMasterModal = function() {
    document.getElementById('modal-premium').style.display = 'none';
};

// 4. JEMBATAN SIMPAN (UPDATE PREMIUM STATUS)
window.savePremiumSettings = async function() {
    const uid = document.getElementById('target-uid').value;
    const isPremium = document.getElementById('select-status').value === "true";
    const expiry = document.getElementById('input-expiry').value;

    if (!uid) return;

    try {
        await database.ref(`users/${uid}`).update({
            is_premium: isPremium,
            expiry_date: expiry
        });
        
        alert("✅ Status Berhasil Diperbarui!");
        closeMasterModal();
        loadAllUsers(); // Refresh tabel
    } catch (error) {
        console.error(error);
        alert("Gagal mengupdate data.");
    }
};

window.hapusUser = async function(uid, nama) {
    if (confirm(`⚠️ PERINGATAN: Apakah Anda yakin ingin menghapus user "${nama}"? Semua data kuis milik user ini juga akan terhapus secara permanen.`)) {
        try {
            // 1. Hapus data user di folder /users/
            await database.ref(`users/${uid}`).remove();
            
            // 2. Cari dan hapus kuis-kuis milik user tersebut di quiz_index
            const quizIndexRef = database.ref('quiz_index');
            const snapshot = await quizIndexRef.orderByChild('userId').equalTo(uid).once('value');
            
            if (snapshot.exists()) {
                const updates = {};
                snapshot.forEach((child) => {
                    updates[child.key] = null; // Tandai untuk dihapus
                });
                await quizIndexRef.update(updates);
            }

            alert("✅ User dan kuis terkait berhasil dihapus!");
            loadAllUsers(); // Refresh tabel
        } catch (error) {
            console.error(error);
            alert("Gagal menghapus user.");
        }
    }
};

window.jalankanMigrasiConfig = async function() {
    if (!confirm("Paksa sinkronisasi email dan nama dari database kuis?")) return;

    try {
        const quizIndexSnap = await database.ref('quiz_index').once('value');
        const updates = {};
        
        quizIndexSnap.forEach((child) => {
            const data = child.val();
            const uid = data.userId;

            if (uid && data.authorEmail) {
                // Paksa tulis ke folder profile user
                updates[`users/${uid}/profile/email`] = data.authorEmail;
                updates[`users/${uid}/profile/nama`] = data.authorName || data.authorEmail.split('@')[0];
                updates[`users/${uid}/profile/role`] = "author";
            }
        });

        await database.ref().update(updates);
        alert("✅ Sinkronisasi Profil Selesai!");
        location.reload();
    } catch (error) {
        console.error(error);
        alert("Gagal migrasi: " + error.message);
    }
};

// FUNGSI UNTUK UPDATE STATS CARD DI DASHBOARD
function updateDashboardStats() {
    const statTotalUser = document.getElementById('stat-total-user');
    const statTotalPremium = document.getElementById('stat-total-premium');
    const statTotalQuiz = document.getElementById('stat-total-quiz');

    // 1. Hitung Total User & Premium secara Realtime
    database.ref('users').on('value', (snapshot) => {
        let total = 0;
        let premium = 0;
        
        snapshot.forEach((child) => {
            total++;
            if (child.val().is_premium === true) {
                premium++;
            }
        });

        if (statTotalUser) statTotalUser.innerText = total;
        if (statTotalPremium) statTotalPremium.innerText = premium;
        
        console.log(`Stats Updated: ${total} Users, ${premium} Premium`);
    });

    // 2. Hitung Total Kuis Global
    database.ref('quiz_index').on('value', (snapshot) => {
        if (statTotalQuiz) statTotalQuiz.innerText = snapshot.numChildren();
    });
}

// Panggil fungsi ini saat window dimuat
window.addEventListener('load', () => {
    updateDashboardStats();
});

let membershipChart; // Simpan variabel secara global agar bisa di-update

function initCharts(totalFree, totalPremium) {
    const ctx = document.getElementById('membershipChart').getContext('2d');
    
    // Jika chart sudah ada, hancurkan dulu sebelum buat baru (agar tidak tumpang tindih)
    if (membershipChart) membershipChart.destroy();

    membershipChart = new Chart(ctx, {
        type: 'doughnut', // Gunakan tipe donat agar terlihat modern
        data: {
            labels: ['Gratis', 'Premium'],
            datasets: [{
                data: [totalFree, totalPremium],
                backgroundColor: ['#cbd5e1', '#3b82f6'], // Warna abu-abu vs Biru
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            },
            cutout: '70%' // Membuat lubang di tengah lebih besar
        }
    });
}

// Update fungsi updateDashboardStats yang lama agar memanggil initCharts
function updateDashboardStats() {
    database.ref('users').on('value', (snapshot) => {
        let total = 0;
        let premium = 0;
        
        snapshot.forEach((child) => {
            total++;
            if (child.val().is_premium === true) {
                premium++;
            }
        });

        let free = total - premium;

        // Update Angka di Stats Card
        if (document.getElementById('stat-total-user')) document.getElementById('stat-total-user').innerText = total;
        if (document.getElementById('stat-total-premium')) document.getElementById('stat-total-premium').innerText = premium;
        
        // Panggil fungsi gambar grafik
        initCharts(free, premium);
    });
}

// Update fungsi Grow CHart
let growthChart;

function updateGrowthChart(snapshot) {
    const ctx = document.getElementById('growthChart').getContext('2d');
    const registrationDates = {};

    snapshot.forEach((child) => {
        const userData = child.val();
        const timestamp = userData.profile?.createdAt;

        if (timestamp) {
            // Ubah milidetik menjadi format tanggal YYYY-MM-DD
            const date = new Date(timestamp).toISOString().split('T')[0];
            registrationDates[date] = (registrationDates[date] || 0) + 1;
        }
    });

    // Ambil label (tanggal) dan data (jumlah user)
    const labels = Object.keys(registrationDates).sort();
    const dataPoints = labels.map(date => registrationDates[date]);

    if (growthChart) growthChart.destroy();

    growthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'User Baru',
                data: dataPoints,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

// --- SISTEM NAVIGASI SIDEBAR ---
window.switchSection = function(sectionId) {
    console.log("Pindah ke menu:", sectionId);

    // 1. Sembunyikan semua section (Pastikan ID section di HTML adalah section-batch-quiz)
    document.querySelectorAll('.menu-section').forEach(sec => {
        sec.style.display = 'none';
    });
    
    // 2. Tampilkan section yang dituju
    const targetSection = document.getElementById(`section-${sectionId}`);
    if (targetSection) {
        targetSection.style.display = 'block';
    }

    // 3. Update Status Aktif di Sidebar Visual
    document.querySelectorAll('.sidebar-nav li').forEach(li => {
        li.classList.remove('active');
    });

    const navMapping = {
        'dashboard': 'nav-dashboard',
        'users': 'nav-users',
        'inbox': 'nav-inbox',
        'ads': 'nav-ads',
        'settings': 'nav-settings',
        'batch-quiz': 'nav-batch-quiz' // <-- TAMBAHKAN INI
    };

    const activeNavId = navMapping[sectionId];
    if (activeNavId) {
        document.getElementById(activeNavId).parentElement.classList.add('active');
    }

    // 4. Trigger Loading Data Spesifik
    switch(sectionId) {
        case 'ads': loadAdsTable(); break;
        case 'inbox': loadInboxData(); break;
        case 'settings': loadGlobalSettings(); break;
        case 'dashboard': loadPublicQuizzes(); break;
        case 'stats-challenge': loadChallengeStats(); break;
        case 'batch-quiz':
            console.log("Menyiapkan Batch Importer...");
            // Jika nanti Mas ingin menampilkan daftar kuis yang sudah di-import,
            // Mas bisa panggil fungsi load-nya di sini.
            break;
    }

    if (window.innerWidth <= 768) {
        toggleSidebar(); 
    }
};

// --- PASANG EVENT LISTENER PADA TOMBOL SIDEBAR ---
document.addEventListener('DOMContentLoaded', () => {
    const menuMapping = {
        'nav-dashboard': 'dashboard',
        'nav-users': 'dashboard',
        'nav-inbox': 'inbox',
        'nav-ads': 'ads',
        'nav-settings': 'settings',
        'nav-batch-quiz': 'batch-quiz' // <-- TAMBAHKAN INI
    };

    Object.keys(menuMapping).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.onclick = (e) => { 
                e.preventDefault(); 
                switchSection(menuMapping[id]); 
            };
        }
    });

    switchSection('dashboard');
});

// 1. Fungsi Pembantu Konversi Waktu (Agar 3660 detik jadi 1h 1m)
function formatDuration(seconds) {
    if (seconds === 0) return "0s";
    if (seconds < 60) return seconds + "s";
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) return `${hrs}j ${mins}m`;
    return `${mins}m ${secs}s`;
}

// 2. Fungsi Utama Load Statistik Challenge (Versi Lengkap: Statistik + Demografi)
function loadChallengeStats() {
    console.log("Memulai perhitungan statistik challenge & demografi...");
    
    database.ref('quizzes_collections').once('value', (snapshot) => {
        let totalClicks = 0;
        let totalFinished = 0;
        let totalSeconds = 0;
        
        // Penampung data Chart Performa
        let labelsPerforma = [];
        let dataCountsPerforma = [];
        
        // Penampung data Demografi (Peta Lokasi)
        let locationMap = {};

        snapshot.forEach((child) => {
            const quiz = child.val();
            
            // 1. Hitung Total Klik (dari stats/played)
            const played = (quiz.stats && quiz.stats.played) ? quiz.stats.played : 0;
            totalClicks += played;

            // 2. Olah data dari node 'results'
            if (quiz.results) {
                const resultsArr = Object.values(quiz.results);
                const countSelesai = resultsArr.length;
                
                totalFinished += countSelesai;
                
                resultsArr.forEach(res => {
                    // Akumulasi waktu pengerjaan
                    totalSeconds += (res.timeSpent || 0);
                    
                    // Akumulasi data lokasi untuk demografi
                    const loc = res.location || "Lokasi Tidak Diketahui";
                    locationMap[loc] = (locationMap[loc] || 0) + 1;
                });

                // Simpan data untuk Chart Performa (Bar Chart)
                labelsPerforma.push(quiz.title || "Kuis Tanpa Judul");
                dataCountsPerforma.push(countSelesai);
            }
        });

        // 3. Hitung Rata-rata Waktu
        const avgSeconds = totalFinished > 0 ? Math.round(totalSeconds / totalFinished) : 0;

        // 4. Update UI Angka (Cards)
        if (document.getElementById('ch-total-clicks')) {
            document.getElementById('ch-total-clicks').innerText = totalClicks.toLocaleString();
        }
        if (document.getElementById('ch-total-finished')) {
            document.getElementById('ch-total-finished').innerText = totalFinished.toLocaleString();
        }
        if (document.getElementById('ch-avg-time')) {
            document.getElementById('ch-avg-time').innerText = formatDuration(avgSeconds);
        }
        if (document.getElementById('ch-total-duration')) {
            document.getElementById('ch-total-duration').innerText = formatDuration(totalSeconds);
        }

        // 5. Render Chart 1: Performa Kuis (Bar/Line Chart)
        if (typeof renderNewChart === 'function' && labelsPerforma.length > 0) {
            renderNewChart('challengeChart', labelsPerforma, dataCountsPerforma, 'Total Selesai', '#6366f1');
        }

        // 6. Render Chart 2: Demografi Wilayah (Doughnut Chart)
        // Ambil Top 5 wilayah terbanyak
        const sortedLocations = Object.entries(locationMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const labelsDemo = sortedLocations.map(item => item[0]);
        const dataDemo = sortedLocations.map(item => item[1]);

        if (labelsDemo.length > 0) {
            renderDemographicChart(labelsDemo, dataDemo);
        }

        console.log("Statistik & Demografi Berhasil Diperbarui.");
    });
}

// Fungsi Render khusus untuk Chart Demografi (Pie/Doughnut)
function renderDemographicChart(labels, data) {
    const ctx = document.getElementById('demographicChart').getContext('2d');
    
    // Hapus instance lama agar tidak tumpang tindih saat hover
    if (window.demoChartInstance) window.demoChartInstance.destroy();

    window.demoChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#6366f1', // Indigo
                    '#10b981', // Emerald
                    '#f59e0b', // Amber
                    '#ef4444', // Red
                    '#8b5cf6'  // Violet
                ],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { family: 'Poppins', size: 12 }
                    }
                }
            },
            cutout: '70%' // Membuat tampilan Donat yang modern
        }
    });
}

// Fungsi Render Chart Universal (Bisa dipakai Akademik & Challenge)
function renderNewChart(canvasId, labels, data, labelName, color) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (window[canvasId + 'Instance']) window[canvasId + 'Instance'].destroy();

    window[canvasId + 'Instance'] = new Chart(ctx, {
        type: 'bar', // Bisa ganti 'line' atau 'bar'
        data: {
            labels: labels,
            datasets: [{
                label: labelName,
                data: data,
                backgroundColor: color + '33', // Transparansi
                borderColor: color,
                borderWidth: 2,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// --- MANAJEMEN IKLAN LOGIC ---
window.toggleAdInput = function() {
    const type = document.getElementById('new-ad-type').value;
    
    // Ambil semua elemen grup
    const groupBanner = document.getElementById('input-banner-group');
    const groupVideo = document.getElementById('input-video-group');
    const groupBranding = document.getElementById('input-branding-group');

    // 1. Sembunyikan semuanya dulu (Reset)
    if (groupBanner) groupBanner.style.display = 'none';
    if (groupVideo) groupVideo.style.display = 'none';
    if (groupBranding) groupBranding.style.display = 'none';

    // 2. Tampilkan yang sesuai pilihan
    if (type === 'banner' && groupBanner) {
        groupBanner.style.display = 'block';
    } else if (type === 'video' && groupVideo) {
        groupVideo.style.display = 'block';
    } else if (type === 'branding' && groupBranding) {
        groupBranding.style.display = 'block';
    }
    
    console.log("Tipe iklan diganti ke:", type); // Untuk debug di console F12
};

window.saveNewAd = async function() {
    const type = document.getElementById('new-ad-type').value;
    const client = document.getElementById('new-ad-client').value || "General";
    const btn = document.querySelector("button[onclick='saveNewAd()']");
    
    // Validasi Tanggal
    const startDate = document.getElementById('new-ad-start').value;
    const endDate = document.getElementById('new-ad-end').value;
    if(!startDate || !endDate) return alert("Tentukan periode tayang iklan!");

    // Visual Loading
    btn.disabled = true;
    btn.innerText = "⏳ Memproses Iklan...";

    try {
        let adData = {
            client, type, startDate, endDate,
            active: true,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        // --- PROSES UPLOAD BERDASARKAN TIPE ---
        
        if (type === 'banner') {
            const fileInput = document.getElementById('file-ad-banner');
            let imageUrl = document.getElementById('new-ad-content').value;

            // Jika ada file yang dipilih, prioritaskan upload ke Cloudinary
            if (fileInput.files.length > 0) {
                imageUrl = await uploadToCloudinary(fileInput.files[0]);
            }

            if (!imageUrl) throw new Error("Wajib upload banner atau masukkan URL gambar!");
            
            adData.content = imageUrl;
            adData.link = document.getElementById('new-ad-link').value || "#";
            await database.ref('settings/ads/banners').push(adData);
        } 
        
        else if (type === 'branding') {
            const fileInput = document.getElementById('file-ad-logo');
            let logoUrl = document.getElementById('new-ad-brand-logo').value;

            if (fileInput.files.length > 0) {
                logoUrl = await uploadToCloudinary(fileInput.files[0]);
            }

            if (!logoUrl) throw new Error("Wajib upload logo brand atau masukkan URL!");

            adData.brandColor = document.getElementById('new-ad-color').value;
            adData.textColor = document.getElementById('new-ad-color-text').value;
            adData.logoUrl = logoUrl;
            adData.motivation = document.getElementById('new-ad-motivation').value;
            
            await database.ref('settings/ads/branding').push(adData);
        }
        
        else if (type === 'video') {
            adData.videoUrl = document.getElementById('new-ad-video').value;
            if(!adData.videoUrl) throw new Error("ID YouTube wajib diisi!");
            await database.ref('settings/ads/video').push(adData);
        }

        alert("🚀 Iklan " + client + " Berhasil Tayang!");
        document.getElementById('form-ads-new').reset();
        window.toggleAdInput();

    } catch (err) {
        alert("❌ Masalah: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "Publish Iklan";
    }
};

async function uploadToCloudinary(file) {
    const cloudName = 'dz16gb8tw';
    const uploadPreset = 'kuisia_tumbernails'; 
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    
    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        return data.secure_url; // Mengembalikan URL gambar
    } catch (error) {
        console.error("Cloudinary Error:", error);
        throw new Error("Gagal mengunggah gambar ke Cloudinary");
    }
}

// Jalankan ini di halaman user
function applyBrandingAds() {
    const today = new Date().toISOString().split('T')[0];

    database.ref('settings/ads/branding').on('value', (snapshot) => {
        snapshot.forEach((child) => {
            const ad = child.val();
            // Cek apakah hari ini masuk periode tayang
            if (today >= ad.startDate && today <= ad.endDate) {
                console.log("Menerapkan Branding dari:", ad.client);
                
                // Ganti Warna Tema Global
                document.documentElement.style.setProperty('--master-accent', ad.brandColor);
                document.documentElement.style.setProperty('--auth-bg', ad.brandColor); // Jika ada
                
                // Ganti Logo di Hero Section
                const brandText = document.querySelector('.brand-promo');
                if(brandText) brandText.innerHTML = `Bersama <img src="${ad.logoUrl}" style="height:30px; vertical-align:middle;">`;
            }
        });
    });
}

window.loadAdsTable = function() {
    const tbody = document.getElementById('table-ads-body');
    database.ref('settings/ads').on('value', (snapshot) => {
        if(!tbody) return;
        tbody.innerHTML = "";
        
        snapshot.forEach((cat) => {
            const catKey = cat.key; // branding, banners, atau video
            cat.forEach((ad) => {
                const data = ad.val();
                const adKey = ad.key;
                
                // --- LOGIKA PREVIEW ---
                let previewHtml = "";
                if (catKey === 'banners') {
                    previewHtml = `<img src="${data.content}" style="width:50px; height:30px; object-fit:cover; border-radius:4px; margin-right:8px; vertical-align:middle;">`;
                } else if (catKey === 'branding') {
                    previewHtml = `<div style="display:inline-block; width:20px; height:20px; border-radius:50%; background:${data.brandColor}; border:1px solid #ddd; margin-right:8px; vertical-align:middle;"></div>`;
                } else if (catKey === 'video') {
                    previewHtml = `<i class="fab fa-youtube" style="color:red; margin-right:8px;"></i>`;
                }

                // --- LOGIKA BADGE WARNA ---
                let badgeColor = "#64748b"; // Default abu-abu
                if(catKey === 'branding') badgeColor = "#8458B3"; // Ungu
                if(catKey === 'banners') badgeColor = "#22c55e";  // Hijau
                if(catKey === 'video') badgeColor = "#ef4444";    // Merah

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        ${previewHtml}
                        <span style="font-weight:600;">${data.client}</span>
                    </td>
                    <td>
                        <span class="badge-status" style="background:${badgeColor}; color:white; padding:3px 8px; border-radius:12px; font-size:0.7rem;">
                            ${catKey.toUpperCase()}
                        </span>
                    </td>
                    <td style="font-size:0.8rem; color:#475569;">
                        <div>${data.startDate || '-'}</div>
                        <div style="font-size:0.7rem; color:#94a3b8;">s/d ${data.endDate || '-'}</div>
                    </td>
                    <td>
                        <div style="display:flex; gap:10px;">
                            <button onclick="deleteAd('${catKey}', '${adKey}')" title="Hapus Iklan" style="color:#ef4444; border:none; background:none; cursor:pointer; font-size:1rem;">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        });
    });
};

window.deleteAd = (cat, key) => {
    if(confirm("Hapus iklan ini?")) database.ref(`settings/ads/${cat}/${key}`).remove();
};

// Tambahkan ini di akhir file master.js atau di dalam inisialisasi
document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('new-ad-type')) {
        window.toggleAdInput();
    }
});

// --- PESAN MASUK LOGIC ---
window.loadInboxData = function() {
    const tbody = document.getElementById('table-inbox-body');
    database.ref('contacts').on('value', (snapshot) => {
        if(!tbody) return;
        tbody.innerHTML = "";
        if(!snapshot.exists()) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>Tidak ada pesan.</td></tr>";
            return;
        }
        snapshot.forEach((child) => {
            const msg = child.val();
            const date = msg.timestamp ? new Date(msg.timestamp).toLocaleDateString('id-ID') : '-';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${date}</td>
                <td>${msg.name || 'Anonim'}</td>
                <td>${msg.email || '-'}</td>
                <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis;">${msg.message || '-'}</td>
                <td>
                    <button onclick="deleteMsg('${child.key}')" style="color:red; border:none; background:none; cursor:pointer;"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
};

window.deleteMsg = (key) => {
    if(confirm("Hapus pesan?")) database.ref(`contacts/${key}`).remove();
};

// PENGATURAN GLOBAL
window.updateGlobalSetting = function(key, value) {
    database.ref('settings/global/' + key).set(value)
        .then(() => {
            // Notifikasi simpel tanpa window alert yang mengganggu
            console.log(`Setting ${key} updated.`);
        })
        .catch(err => alert("Gagal: " + err.message));
};

// Panggil data saat menu dibuka (Gunakan .on agar real-time)
window.loadGlobalSettings = function() {
    database.ref('settings/global').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        
        // Update Maintenance Switch
        const checkMaint = document.getElementById('set-maintenance');
        if(checkMaint) checkMaint.checked = data.maintenance || false;
        
        // Update Registration Switch
        const checkRegis = document.getElementById('set-registration');
        if(checkRegis) checkRegis.checked = data.registration_open || false;
        
        // Update Announcement
        const txtAnnounce = document.getElementById('set-announcement');
        if(txtAnnounce) txtAnnounce.value = data.announcement || "";

        // Update Running Text
        const txtRunning = document.getElementById('set-running-text');
        if(txtRunning) txtRunning.value = data.running_text || "";
    });
};


// Tabel Kuis Publik
window.loadPublicQuizzes = function() {
    const tbody = document.getElementById('batch-quiz-body');
    if(!tbody) return;

    // 1. Ambil semua User dulu
    database.ref('users').on('value', (usersSnapshot) => {
        tbody.innerHTML = "";
        
        if (!usersSnapshot.exists()) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Tidak ada data user.</td></tr>`;
            return;
        }

        // 2. Loop setiap User
        usersSnapshot.forEach((userChild) => {
            const uid = userChild.key;
            const userData = userChild.val();
            const quizzes = userData.quizzes; // Ambil folder quizzes milik user ini

            if (quizzes) {
                // 3. Loop setiap Kuis milik User tersebut
                Object.keys(quizzes).forEach((quizId) => {
                    const quiz = quizzes[quizId];
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${quiz.title || 'Tanpa Judul'}</strong></td>
                        <td><span class="badge-status" style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">${quiz.category || 'Umum'}</span></td>
                        <td>${quiz.questions ? Object.keys(quiz.questions).length : 0} Soal</td>
                        <td>
                            <div style="font-size: 0.85rem;">
                                <strong>${userData.profile?.nama || userData.authorName || 'Anonim'}</strong><br>
                                <small style="color: #64748b;">${userData.profile?.email || userData.email || '-'}</small>
                            </div>
                        </td>
                        <td>
                            <button onclick="deleteQuiz('${uid}', '${quizId}')" style="color:red; border:none; background:none; cursor:pointer; font-size: 1rem;">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });

        if (tbody.innerHTML === "") {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Belum ada kuis yang dibuat.</td></tr>`;
        }
    });
};

window.deleteQuiz = (uid, quizId) => {
    if(confirm("Hapus kuis ini secara permanen dari akun user?")) {
        // Hapus langsung ke path spesifik user tersebut
        database.ref(`users/${uid}/quizzes/${quizId}`).remove()
        .then(() => {
            alert("Kuis berhasil dihapus.");
        })
        .catch((error) => {
            alert("Gagal menghapus: " + error.message);
        });
    }
};

// Fungsi Pencarian Kuis
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-quiz');
    
    if (searchInput) {
        searchInput.addEventListener('keyup', function() {
            const keyword = this.value.toLowerCase();
            const rows = document.querySelectorAll('#batch-quiz-body tr');

            rows.forEach(row => {
                // Ambil teks dari kolom Judul (indeks 0) dan Kategori (indeks 1)
                const title = row.cells[0].textContent.toLowerCase();
                const category = row.cells[1].textContent.toLowerCase();
                const author = row.cells[3].textContent.toLowerCase();

                if (title.includes(keyword) || category.includes(keyword) || author.includes(keyword)) {
                    row.style.display = ""; // Tampilkan
                } else {
                    row.style.display = "none"; // Sembunyikan
                }
            });
        });
    }
});

window.loadInboxData = function() {
    const tbody = document.getElementById('table-inbox-body');
    const badgeSidebar = document.getElementById('badge-inbox');
    if (!tbody) return;

    database.ref('inbox_messages').on('value', (snapshot) => {
        tbody.innerHTML = "";
        let unreadCount = 0;
        let messages = [];

        snapshot.forEach((child) => {
            const data = child.val();
            data.id = child.key;
            messages.push(data);
            if (data.status === 'unread') unreadCount++;
        });

        // Update Badge Sidebar
        if (badgeSidebar) {
            badgeSidebar.innerText = unreadCount;
            badgeSidebar.style.display = unreadCount > 0 ? "inline-block" : "none";
        }

        messages.reverse().forEach((msg) => {
            const tr = document.createElement('tr');
            
            // Style baris: Biru muda jika belum dibaca
            tr.className = msg.status === 'unread' ? 'unread-row' : '';
            tr.style.backgroundColor = msg.status === 'unread' ? "#f0f7ff" : "#ffffff";

            tr.innerHTML = `
                <td>${new Date(msg.createdAt).toLocaleDateString('id-ID')}</td>
                <td><strong>${msg.name}</strong></td>
                <td><small>${msg.email}</small></td>
                <td><div style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${msg.message}</div></td>
                <td>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="bukaModalPesan('${msg.id}')" class="btn-master btn-edit" title="Baca & Balas">
                            <i class="fas fa-envelope-open"></i>
                        </button>
                        <button onclick="hapusPesan('${msg.id}')" class="btn-master btn-hapus" style="background:#fee2e2; color:#ef4444; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
};

//MODAL INBOX SEND REPLY
window.bukaModalPesan = function(id) {
    console.log("Membuka pesan ID:", id); // Cek di console (F12)
    
    database.ref(`inbox_messages/${id}`).once('value', (snap) => {
        const msg = snap.val();
        if(!msg) return;

        // Isi data ke modal
        document.getElementById('detail-nama').innerText = msg.name;
        document.getElementById('detail-email').innerText = msg.email;
        document.getElementById('detail-isi').innerText = msg.message;
        
        // Tampilkan Modal
        const modal = document.getElementById('modal-inbox');
        modal.style.display = 'flex'; 

        // Update status di Firebase (Silently)
        if (msg.status === 'unread') {
            database.ref(`inbox_messages/${id}`).update({ status: 'read' });
        }

        // Action Tombol Reply Email
        document.getElementById('btn-reply-email').onclick = () => {
            const reply = document.getElementById('reply-text').value;
            const subject = encodeURIComponent("Balasan dari Kuisia");
            const body = encodeURIComponent(reply);
            window.location.href = `mailto:${msg.email}?subject=${subject}&body=${body}`;
        };
    });
};

// Fungsi Hapus Pesan (Tambahkan kembali)
window.hapusPesan = function(id) {
    if(confirm("Hapus pesan ini secara permanen?")) {
        database.ref(`inbox_messages/${id}`).remove()
        .then(() => console.log("Pesan dihapus"))
        .catch(err => alert("Gagal hapus: " + err.message));
    }
};

window.tutupModalInbox = function() {
    document.getElementById('modal-inbox').style.display = 'none';
    document.getElementById('reply-text').value = ""; // Reset balasan
};

//BATCH QUIZZ

document.addEventListener('DOMContentLoaded', () => {
    const navBatch = document.getElementById('nav-batch-quiz');
    const sections = document.querySelectorAll('.master-content-section'); // Sesuaikan class section Mas

    navBatch.addEventListener('click', (e) => {
        e.preventDefault();
        
        // 1. Sembunyikan semua section
        sections.forEach(s => s.style.display = 'none');
        
        // 2. Tampilkan section Batch Quiz
        document.getElementById('section-batch-quiz').style.display = 'block';
        
        // 3. Update status active di sidebar
        document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
        navBatch.parentElement.classList.add('active');
    });
});

// FUNGSI IMPORT (Tetap sama seperti sebelumnya)
function importBatchQuiz() {
    const jsonInput = document.getElementById('json-input');
    const jsonText = jsonInput.value.trim();

    if (!jsonText) return alert("Data kosong!");

    try {
        const data = JSON.parse(jsonText);
        const newRef = database.ref('quizzes_collections').push();
        
        newRef.set({
            ...data,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            stats: { played: 0 }
        }).then(() => {
            alert("✅ Berhasil diunggah ke Koleksi Viral!");
            jsonInput.value = "";
        });
    } catch (e) {
        alert("❌ Format JSON Salah!");
    }
}