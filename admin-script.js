// TAMBAHKAN INI DI BAGIAN PALING ATAS SCRIPT JS ADMIN MAS


// Simpan referensi chart agar tidak tumpang tindih
let trendChartInstance = null;
let categoryChartInstance = null;

// Variabel untuk menyimpan ID kuis yang sedang aktif dipilih
window.activeQuizId = null;

// 1. CONFIG & INITIALIZATION
const firebaseConfig = {
    apiKey: "AIzaSyDoo_WtH6JbT0KvMzmud5Ew_TpEjgFGqhU",
    authDomain: "fir-kuis-23368.firebaseapp.com",
    databaseURL: "https://fir-kuis-23368-default-rtdb.asia-southeast1.firebasedatabase.app"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const auth = firebase.auth();

// --- FUNGSI CEK STATUS PREMIUM (SATPAM GLOBAL) ---
window.getProStatus = async function() {
    const user = auth.currentUser;
    if (!user) return { isPro: false, reason: 'not_logged_in' };
    
    const snap = await database.ref(`users/${user.uid}`).once('value');
    const data = snap.val();
    
    // Sesuaikan dengan field di master-script.js
    const isPro = data?.is_premium === true;
    const expiryString = data?.expiry_date; // Master menyimpan 'expiry_date'
    
    let isNotExpired = false;
    if (expiryString) {
        const expiryDate = new Date(expiryString).getTime();
        const now = new Date().getTime();
        isNotExpired = expiryDate > now;
    }
    
    return {
        isPro: isPro && isNotExpired,
        expiry: expiryString
    };
};

async function handlePremiumFeature(callback, featureName) {
    const proStatus = await window.getProStatus();
    if (proStatus.isPro) {
        callback();
    } else {
        // Menggunakan fungsi showNotif yang sudah ada di admin-script.js Anda
        showNotif("Fitur Premium", `Fitur ${featureName} hanya tersedia untuk akun Pro.`, "warning");
    }
}

// 2. AUTH PROTECTION
let isLoggingOut = false;

auth.onAuthStateChanged((user) => {
    if (isLoggingOut) return;

    if (user) {
        // 1. Ambil data user SEKALI saja untuk semua keperluan
        database.ref(`users/${user.uid}`).once('value', (snapshot) => {
            const userData = snapshot.val();
            const premiumContainer = document.getElementById('premium-opt-container');
            const linkMaster = document.getElementById('link-master');
            const MASTER_EMAIL = "firman.a.prasetyo@gmail.com";

            // Cek Master Admin
            if (user.email === MASTER_EMAIL && linkMaster) {
                linkMaster.style.display = 'block';
            }

            // Cek Status Premium (untuk Overlay & Container)
            const isPro = userData?.is_premium === true;
            if (isPro && premiumContainer) {
                premiumContainer.style.display = 'block';
            }

            // LANGSUNG JALANKAN LOGIKA BADGE DI SINI (Tanpa panggil getProStatus lagi)
            if (!isPro) {
                const btnExcel = document.getElementById('btn-export-excel');
                if (btnExcel && !btnExcel.querySelector('.badge-pro-mini')) {
                    btnExcel.innerHTML += ` <span class="badge-pro-mini"><i class="fas fa-lock"></i> PRO</span>`;
                }
            }
        });

        // 2. Jalankan Fungsi Utama
        initDashboard();
        loadProfileData();
        initLivePreview(); 
        aktifkanLivePreview();
    } else {
        window.location.href = "login.html";
    }
});

// 3. FUNGSI UTAMA (DASHBOARD)
function initDashboard() {
    showLoading(); // Munculkan saat dashboard mulai memuat
    
    const user = auth.currentUser;
    if (user) {
        // 1. Load Data Identitas (Profil & Sapaan)
        updateWelcomeMessage(user); 
        loadProfileData(); // Tarik data profil ke memori sejak awal login
        
        // 2. Load Data Konten
        loadUserQuizzes();      
        updateCategoryDropdown(); 
        updateStatistics();
        
        // Sembunyikan loading setelah data siap
        setTimeout(hideLoading, 1500); 
        showToast("Dashboard berhasil dimuat!");
    } else {
        // Jika entah bagaimana user tidak ada, kembalikan ke login
        window.location.href = "login.html";
    }
}

// 4. MANAJEMEN MODAL
window.openModalKuis = function() {
    // 1. Bersihkan sisa-sisa editan sebelumnya agar kembali ke mode "Tambah"
    resetModalKeDefault(); 

    const user = auth.currentUser;
    if (!user) {
        showCustomAlert("Peringatan", "Silakan login terlebih dahulu", "error");
        return;
    }

    // 2. Ambil status premium dari Firebase
    database.ref(`users/${user.uid}`).once('value', snapshot => {
        const isPremium = snapshot.val()?.is_premium || false;
        
        // 3. Jalankan mesin pengecek gembok tadi
        updatePremiumUI(isPremium);

        // 4. Munculkan Modal (Gunakan 'block' sesuai preferensi kestabilan Mas)
        const modal = document.getElementById('modal-kuis');
        if (modal) {
            modal.style.display = 'block'; 
        }
    });
};

function closeModalKuis() {
    const modal = document.getElementById('modal-kuis');
    if (modal) {
        modal.style.display = 'none';
        
        // Tambahkan panggilannya di sini
        resetModalKeDefault(); 
    }
}

// 5. SIMPAN KUIS KE FIREBASE (VERSI FINAL DENGAN INTEGRASI CONFIG BOBOT)
window.simpanKuisBaru = async function() { 
    const nameInput = document.getElementById('nama-kuis-baru');
    const descInput = document.getElementById('deskripsi-kuis-baru');
    const typeInput = document.getElementById('tipe-kuis-baru');
    const durModeInput = document.getElementById('durasi-mode-baru');
    const durValInput = document.getElementById('durasi-value-baru');
    const visibilityInput = document.querySelector('input[name="visibility"]:checked');
    const fileInput = document.getElementById('thumbnail-input');
    
    const passInput = document.getElementById('set-quiz-password-baru');
    const scheduledInput = document.getElementById('set-scheduled-baru'); 
    const deadlineInput = document.getElementById('set-deadline-baru');

    const name = nameInput.value.trim();
    if (!name) { showNotif("Peringatan", "Judul kuis wajib diisi!"); return; }

    const currentUser = auth.currentUser;
    const userId = currentUser.uid;
    // Generate Key baru untuk kuis
    const quizId = database.ref().child('quizzes').push().key; 

    // --- PENGECEKAN PREMIUM HYBRID ---
    const userSnap = await database.ref(`users/${userId}`).once('value');
    const userData = userSnap.val();
    const isPremium = userData && (userData.is_premium === true || userData.is_premium === "true");

    let finalVisibility = visibilityInput.value;
    let finalDurMode = durModeInput.value;
    let finalDurVal = parseInt(durValInput.value) || 0;
    
    let finalPassword = passInput ? passInput.value.trim() : "";
    let finalScheduled = (scheduledInput && scheduledInput.value) ? scheduledInput.value : null;
    let finalDeadline = (deadlineInput && deadlineInput.value) ? deadlineInput.value : null;

    // --- SECURITY GATE LOGIC ---
    if (!isPremium) {
        finalVisibility = 'public'; 
        finalDurMode = 'timer';     
        finalDurVal = 60;           
        finalPassword = "";         
        finalScheduled = null;      
        finalDeadline = null;       
    } else {
        if (finalDurMode === 'pr') finalDurVal = 0;
        if (finalScheduled) finalScheduled = new Date(finalScheduled).getTime();
        if (finalDeadline) finalDeadline = new Date(finalDeadline).getTime();
    }

    const authorNameClean = currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : "Anonim");

    let thumbnailUrl = "";
    if (fileInput.files.length > 0) {
        try {
            thumbnailUrl = await compressAndUploadImage(fileInput.files[0]);
        } catch (error) {
            console.error("Upload thumbnail gagal:", error);
            showNotif("Error", "Gagal mengunggah gambar");
            return;
        }
    }

    // --- SKEMA DATA FINAL + INTEGRASI CONFIG ---
    // Mengambil data dari global variabel yang diset di Modal 1
    const configData = window.currentKuisConfig || {};

    const quizData = {
        quizId: quizId,
        title: name,
        desc: descInput.value.trim() || "Latihan soal interaktif",
        thumbnail: thumbnailUrl,
        quizType: typeInput.value,
        durationMode: finalDurMode,
        durationValue: finalDurVal,
        visibility: finalVisibility,  
        accessType: finalVisibility, 
        quizPassword: finalVisibility === 'private' ? finalPassword : null,
        scheduledTime: finalScheduled,
        deadline: finalDeadline,
        isProAdmin: isPremium,
        created_at: firebase.database.ServerValue.TIMESTAMP,
        is_ready: false, // Belum siap karena soal belum diisi
        userId: userId,
        authorName: authorNameClean,
        
        // INTEGRASI BOBOT SKOR DARI MODAL CONFIG
        config: {
            pgPoin: parseFloat(configData.pgPoin) || 0,
            pgTarget: parseInt(configData.pgTarget) || 0,
            essayPoin: parseFloat(configData.essayPoin) || 0,    // Sekarang ambil dari input
            essayTarget: parseInt(configData.essayTarget) || 0, // Sekarang ambil dari input
            hotsTarget: parseInt(configData.hotsTarget) || 0,
            bonusHots: parseFloat(configData.bonusHots) || 0,
            allowReview: configData.allowReview ?? true
        }
    };

    const updates = {};
    updates[`users/${userId}/quizzes/${quizId}`] = quizData;
    updates[`quiz_index/${quizId}`] = quizData;

    database.ref().update(updates)
    .then(() => {
        showNotif("Berhasil", "Kuis '" + name + "' berhasil dibuat.");
        
        // Tutup Modal Detail
        try { closeModalKuis(); } catch(e) { console.log("Gagal tutup modal"); }

        // Update dropdown kategori jika ada
        const selectKategori = document.getElementById('input-kategori');
        if (selectKategori) {
            const newOpt = new Option(name, quizId);
            selectKategori.add(newOpt);
            selectKategori.value = quizId;
            selectKategori.dispatchEvent(new Event('change'));
        }

        // Tampilkan area input soal
        const formBody = document.getElementById('form-body');
        if (formBody) {
            formBody.style.display = 'block';
            formBody.classList.remove('hidden'); 
        }

        // --- UPDATE GUARDRAIL VISUAL ---
        const statusGuardrail = document.getElementById('status-guardrail');
        if (statusGuardrail) {
            statusGuardrail.style.display = "block";
            statusGuardrail.style.padding = "10px";
            statusGuardrail.style.borderRadius = "10px";
            statusGuardrail.style.background = "#f0eaff";
            statusGuardrail.style.color = "#8458B3";
            statusGuardrail.style.border = "1px solid #8458B3";
            statusGuardrail.innerHTML = `
                <i class="fas fa-bullseye"></i> <b>Target:</b> ${quizData.config.pgTarget} PG 
                | <i class="fas fa-fire"></i> <b>HOTS:</b> 0/${quizData.config.hotsTarget} Soal
            `;
        }

        // Reset semua field modal
        if (typeof resetModalBaru === "function") {
            resetModalBaru(nameInput, descInput, fileInput, passInput, scheduledInput, deadlineInput);
        }

        // Scroll otomatis ke area pembuatan soal
        setTimeout(() => {
            const section = document.getElementById('form-section');
            if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 400); 
        
    }).catch((err) => {
        console.error("Firebase Update Error:", err);
        showNotif("Gagal", "Terjadi kesalahan: " + err.message);
    });
};

// Fungsi Helper untuk Reset Modal agar bersih
function resetModalBaru(name, desc, file, pass, scheduled, deadline) {
    if(name) name.value = "";
    if(desc) desc.value = "";
    if(file) file.value = "";
    if(pass) pass.value = "";
    if(scheduled) scheduled.value = "";
    if(deadline) deadline.value = "";
    
    document.getElementById('durasi-mode-baru').value = "timer";
    document.getElementById('durasi-value-baru').value = "15";
    const radioPublic = document.querySelector('input[name="visibility"][value="public"]');
    if(radioPublic) radioPublic.checked = true;

    // Jalankan ulang fungsi toggle untuk merapikan UI
    if(typeof toggleVisibilitySettings === 'function') toggleVisibilitySettings();
    if(typeof toggleDurationInput === 'function') toggleDurationInput();
}

// Panggil fungsi ini saat admin selesai menambahkan soal
window.tandaiKuisSiap = function(quizId) {
    const userId = auth.currentUser.uid;
    
    // Ambil data kuis dulu untuk cek visibility
    database.ref(`users/${userId}/quizzes/${quizId}`).once('value', (snap) => {
        const quizData = snap.val();
        if (!quizData) return;

        const updates = {};
        // 1. Selalu tandai siap di folder User
        updates[`users/${userId}/quizzes/${quizId}/is_ready`] = true;
        
        // 2. Hanya tandai siap di Index jika kuisnya PUBLIC
        if (quizData.visibility === 'public') {
            updates[`quiz_index/${quizId}/is_ready`] = true;
            // Pastikan data lainnya juga sinkron di index
            updates[`quiz_index/${quizId}/visibility`] = 'public';
        } else {
            // Jika privat, pastikan kuis DIHAPUS dari index (beranda)
            updates[`quiz_index/${quizId}`] = null;
        }
        
        database.ref().update(updates);
    });
};

// 6. MENAMPILKAN DAFTAR KUIS (REAL-TIME) - VERSI FIX PRIVATE & PUBLIC - INTEGRASI PASSWORD
// 1. Letakkan variabel limit ini di bagian paling atas file (di luar fungsi)
let currentQuizLimit = 6;

function loadUserQuizzes() {
    const container = document.getElementById('quiz-grid');
    if (!container) return;

    const userId = auth.currentUser.uid;
    
    database.ref(`users/${userId}/quizzes`).on('value', (snapshot) => {
        container.innerHTML = '';
        const data = snapshot.val();
        
        if (!data) {
            container.innerHTML = '<p style="padding:20px; color:#aaa; text-align:center; grid-column:1/-1;">Belum ada kuis yang dibuat.</p>';
            return;
        }

        // Ambil semua kuis dan urutkan dari yang terbaru
        const allQuizzes = Object.entries(data).reverse();
        
        // POTONG DATA: Hanya ambil sebanyak currentQuizLimit
        const displayedQuizzes = allQuizzes.slice(0, currentQuizLimit);

        displayedQuizzes.forEach(([quizId, quizData]) => {
            const date = quizData.created_at ? new Date(quizData.created_at).toLocaleDateString('id-ID') : '-';
            const title = quizData.title || "Kuis Tanpa Judul";
            const description = quizData.desc || 'Tantang dirimu dengan kuis ini!';
            const isPrivate = quizData.visibility === 'private';
            const typeLabel = (quizData.quizType || 'pg').toUpperCase();

            // Logika Password Badge
            const passwordBadge = (isPrivate && quizData.quizPassword) 
                ? `
                <div id="pw-wrapper-${quizId}" onclick="event.stopPropagation(); togglePasswordView('${quizId}', '${quizData.quizPassword}')" 
                    style="display:inline-flex; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; padding:4px 8px; border-radius:6px; cursor:pointer; transition: all 0.3s ease; max-width: 32px; overflow: hidden; white-space: nowrap;" 
                    title="Klik untuk lihat sandi">
                    <i class="fas fa-key" style="color:#64748b; font-size:0.7rem; flex-shrink:0;"></i>
                    <span id="pw-text-${quizId}" style="margin-left:8px; font-size:0.7rem; font-weight:700; color:#c2410c; opacity:0; transition: opacity 0.2s;">
                        ${quizData.quizPassword}
                    </span>
                </div>` : '';

            const visibilityBadge = isPrivate 
                ? `<span class="badge-status private" style="background:#f1f5f9; color:#64748b; padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:600; border:1px solid #e2e8f0;"><i class="fas fa-lock"></i> Privat</span>`
                : `<span class="badge-status public" style="background:#f0fdf4; color:#16a34a; padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:600; border:1px solid #dcfce7;"><i class="fas fa-globe"></i> Publik</span>`;

            container.innerHTML += `
                <div class="quiz-card" style="position:relative; background: white; border-radius: 12px; border: 1px solid #eee; padding: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div class="quiz-card-header" style="display:flex; gap:12px; align-items:start;">
                        <div class="quiz-icon-circle" style="width:40px; height:40px; background:var(--accent-light); color:var(--accent); border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                            <i class="fas fa-layer-group"></i>
                        </div>
                        <div class="quiz-details" style="flex:1;">
                            <h3 style="margin:0; font-size:1rem; color:#1e293b; line-height:1.2;">${title}</h3>
                            <div style="display:flex; gap:4px; margin-top:8px; flex-wrap:wrap; align-items:center;">
                                ${visibilityBadge}
                                ${passwordBadge} 
                                <span class="badge-type" style="background:#eff6ff; color:#3b82f6; padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:600; border:1px solid #dbeafe;">${typeLabel}</span>
                            </div>
                        </div>
                    </div>

                    <p class="quiz-desc" style="font-size: 0.8rem; color: #64748b; margin: 15px 0 10px 0; line-height: 1.5; height: 36px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                        ${description}
                    </p>

                    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:15px; padding-top:12px; border-top:1px solid #f1f5f9;">
                        <span style="font-size:0.7rem; color:#94a3b8;">
                            <i class="fa-regular fa-calendar"></i> ${date}
                        </span>
                        <div style="display:flex; gap:8px;">
                            <button class="btn-action" onclick="persiapanEditKuis('${quizId}')" style="border:none; background:#f3ebff; color:var(--accent); width:32px; height:32px; border-radius:8px; cursor:pointer;" title="Edit Pengaturan">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-action" onclick="copyShareLink('${quizId}')" style="border:none; background:#f8fafc; color:#475569; width:32px; height:32px; border-radius:8px; cursor:pointer;" title="Share">
                                <i class="fas fa-share-alt"></i>
                            </button>
                            <button class="btn-action" onclick="hapusKuis('${quizId}')" style="border:none; background:#fff1f2; color:#e11d48; width:32px; height:32px; border-radius:8px; cursor:pointer;" title="Hapus">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
        });

        // TAMPILKAN TOMBOL LOAD MORE JIKA MASIH ADA KUIS TERSISA
        if (allQuizzes.length > currentQuizLimit) {
            container.innerHTML += `
                <div style="grid-column: 1/-1; text-align: center; padding: 20px;">
                    <button onclick="handleLoadMore()" style="padding: 10px 20px; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        Tampilkan Lebih Banyak (${allQuizzes.length - currentQuizLimit} kuis lagi)
                    </button>
                </div>`;
        }
    });
}

// 2. Fungsi untuk menambah limit saat tombol diklik
window.handleLoadMore = function() {
    currentQuizLimit += 6; // Tambah 6 kuis setiap klik
    loadUserQuizzes(); // Panggil ulang untuk merender kuis tambahan
};

window.togglePasswordView = function(quizId, password) {
    const wrapper = document.getElementById(`pw-wrapper-${quizId}`);
    const text = document.getElementById(`pw-text-${quizId}`);
    
    if (wrapper.style.maxWidth === "32px") {
        // MELEBAR KE KANAN
        wrapper.style.maxWidth = "200px"; // Sesuaikan agar muat password panjang
        wrapper.style.background = "#fff7ed";
        wrapper.style.borderColor = "#ffedd5";
        text.style.opacity = "1";
    } else {
        // MENGECIL KEMBALI
        wrapper.style.maxWidth = "32px";
        wrapper.style.background = "#f8fafc";
        wrapper.style.borderColor = "#e2e8f0";
        text.style.opacity = "0";
    }
};

// 7. UPDATE DROPDOWN KATEGORI SOAL
function updateCategoryDropdown() {
    const selectKategori = document.getElementById('input-kategori');
    if (!selectKategori) return;

    const userId = auth.currentUser.uid;

    database.ref(`users/${userId}/quizzes`).on('value', (snapshot) => {
        const currentSelection = selectKategori.value;
        selectKategori.innerHTML = '<option value="">-- Pilih Kuis / Kategori --</option>';
        
        const data = snapshot.val();
        if (data) {
            Object.entries(data).forEach(([quizId, quizData]) => {
                const opt = document.createElement('option');
                opt.value = quizId;
                opt.textContent = quizData.title || quizId;
                selectKategori.appendChild(opt);
            });
            selectKategori.value = currentSelection;
        }
    });
}

window.hapusKuis = function(quizId) {
    // Menggunakan askConfirm yang sudah ada di sistem Anda
    askConfirm(`Hapus kuis ini dan seluruh data terkait di beranda?`, () => {
        const userId = auth.currentUser.uid;

        // 1. Siapkan objek untuk menghapus di dua lokasi sekaligus
        const updates = {};
        
        // Lokasi A: Data detail kuis di folder user
        updates[`users/${userId}/quizzes/${quizId}`] = null;
        
        // Lokasi B: Data ringkas kuis di folder index (Beranda)
        updates[`quiz_index/${quizId}`] = null;

        // 2. Eksekusi penghapusan serentak
        database.ref().update(updates)
            .then(() => {
                showNotif("Terhapus", "Kuis telah berhasil dihapus dari sistem dan beranda.");
            })
            .catch((err) => {
                console.error("Gagal sinkronisasi hapus:", err);
                showNotif("Gagal", "Terjadi kesalahan: " + err.message);
            });
    });
};

// 8. FITUR SIMPAN SOAL KE FIREBASE (FIXED: VALIDASI PHANTOM REQUIRED)
const formSoal = document.getElementById('form-soal');
if (formSoal) {
    formSoal.addEventListener('submit', async function(e) {
        e.preventDefault(); 
        
        const quizId = document.getElementById('input-kategori').value;
        if (!quizId) return showNotif("Peringatan", "Pilih kuis terlebih dahulu!");

        // --- 1. AMBIL CONFIG & TYPE ---
        const config = window.currentKuisConfig || {};
        const currentType = document.getElementById('current-question-type')?.value || 'pg';
        
        /* --- 2. LOGIKA PEMBATASAN JUMLAH SOAL ---
        const existingPG = document.querySelectorAll('.soal-pg-item').length;
        const existingEssay = document.querySelectorAll('.soal-essay-item').length;

        if (currentType === 'pg') {
            const targetPG = parseInt(config.pgTarget) || 0;
            if (targetPG > 0 && existingPG >= targetPG) {
                return showNotif("Kuota Penuh", `Batas soal PG untuk kuis ini adalah ${targetPG}.`);
            }
        } else {
            const targetEssay = parseInt(config.essayTarget) || 0;
            if (targetEssay > 0 && existingEssay >= targetEssay) {
                return showNotif("Kuota Penuh", `Batas soal Essay untuk kuis ini adalah ${targetEssay}.`);
            }
        }*/

        // --- 3. AMBIL DATA DARI QUILL & GAMBAR ---
        const questionText = quill.root.innerHTML; 
        if (quill.getText().trim().length === 0) return showNotif("Peringatan", "Pertanyaan tidak boleh kosong!");

        const urlGambar = uploadedPhotos.length > 0 ? uploadedPhotos[uploadedPhotos.length - 1] : "";

        // --- 4. HITUNG POIN & SUSUN DATA ---
        const isHots = document.getElementById('input-is-hots').checked;
        const bonusHots = isHots ? (parseFloat(config.bonusHots) || 0) : 0;
        const poinFinal = ((currentType === 'pg' ? parseFloat(config.pgPoin) : parseFloat(config.essayPoin)) || 0) + bonusHots;

        let soalData = {
            question: questionText,
            image: urlGambar, 
            type: currentType,
            isHots: isHots,
            poin: poinFinal,
            created_at: firebase.database.ServerValue.TIMESTAMP
        };

        // --- 5. LOGIKA VALIDASI DINAMIS (KUNCI ERROR DISINI) ---
        if (currentType === 'essay') {
            const kunciEssay = document.getElementById('input-kunci-essay');
            const answerText = kunciEssay ? kunciEssay.value : "";
            
            if (!answerText.trim()) {
                return showNotif("Peringatan", "Kunci jawaban essay wajib diisi!");
            }
            soalData.answer = answerText;
        } else {
            // Logika Pilihan Ganda
            const options = [];
            document.querySelectorAll('.opt-value').forEach(input => {
                if (input.value.trim() !== "") options.push(input.value.trim());
            });

            if (options.length < 2) return showNotif("Peringatan", "Isi minimal 2 pilihan jawaban!");
            
            const correctAnswer = document.getElementById('input-jawaban').value;
            if (correctAnswer === "") return showNotif("Peringatan", "Pilih jawaban yang benar!");

            soalData.options = options;
            soalData.answer = parseInt(correctAnswer);
        }

        // --- 6. SIMPAN KE FIREBASE ---
        const userId = auth.currentUser.uid;
        const questionsRef = database.ref(`users/${userId}/quizzes/${quizId}/questions`);

        questionsRef.push(soalData)
        .then(() => {
            // Reset Hots
            const hotsToggle = document.getElementById('input-is-hots');
            if(hotsToggle) hotsToggle.checked = false;

            return questionsRef.once('value');
        })
        .then((snapshot) => {
            const totalSoal = snapshot.numChildren();
            const isReady = totalSoal >= 1; 

            let updates = {
                lastUpdated: firebase.database.ServerValue.TIMESTAMP,
                hasQuestions: totalSoal > 0,
                is_ready: isReady
            };
            
            database.ref(`users/${userId}/quizzes/${quizId}`).update(updates);
            database.ref(`quiz_index/${quizId}`).update(updates);

            // --- 7. RESET FORM (VERSI FIXED) ---

            // 1. Reset Editor Teks (Quill)
            quill.setContents([]); 

            // 2. RESET TOTAL GAMBAR (Agar tidak nyangkut ke soal berikutnya)
            uploadedPhotos = []; 
            window.uploadedPhotos = []; // Pastikan variabel global juga kosong
            const inputFoto = document.getElementById('image-upload');
            if (inputFoto) inputFoto.value = ""; // Bersihkan path file di input HTML

            // 3. Update UI Upload (Tombol & List Kecil)
            if (typeof renderPhotoPreviews === "function") renderPhotoPreviews();
            if (typeof updateUploadButton === "function") updateUploadButton();

            // 4. Reset Input Essay (Jika ada)
            const inputKunci = document.getElementById('input-kunci-essay');
            if (inputKunci) inputKunci.value = "";

            // 5. Reset Opsi PG
            const containerOpsi = document.getElementById('dynamic-options-container');
            const selectJawaban = document.getElementById('input-jawaban');

            if (containerOpsi) containerOpsi.innerHTML = ""; 
            if (selectJawaban) {
                selectJawaban.innerHTML = '<option value="">-- Pilih Jawaban Benar --</option>';
            }

            window.optionCount = 0; 
            if (typeof window.addOptionField === "function") {
                window.addOptionField(); // Munculkan kembali kolom A
                window.addOptionField(); // Munculkan kembali kolom B
            }

            // --- BAGIAN PALING PENTING ---
            // 6. PAKSA PREVIEW HP UNTUK BERSIH (Clear mockup)
            if (typeof window.updateLivePreview === "function") {
                window.updateLivePreview(); 
            }

            // 7. Refresh Data Lainnya
            if (window.updateLiveProgress) window.updateLiveProgress(); 
            if (window.loadQuestions) window.loadQuestions(quizId);
            if (typeof loadUserQuizzes === "function") loadUserQuizzes();

            showNotif("Berhasil", `Soal disimpan. (${totalSoal} soal terdaftar)`);

        })

        .catch(err => {
            console.error("Firebase Error:", err);
            showNotif("Gagal", "Terjadi kesalahan.");
        });

    });
}

// LOGIKA UI UNTUK MIXED/CAMPURAN (Wajib ada agar tombol muncul)
window.handleMainTypeChange = function() {
    const mainType = document.getElementById('tipe-kuis-baru').value;
    const toggleContainer = document.getElementById('question-type-toggle-container');
    
    if (mainType === 'campuran') {
        if(toggleContainer) toggleContainer.style.display = 'block';
        window.switchQuestionType('pg'); // Default ke PG
    } else {
        if(toggleContainer) toggleContainer.style.display = 'none';
        window.switchQuestionType(mainType);
    }
};

window.switchQuestionType = function(type) {
    const pgArea = document.getElementById('pg-input-area');
    const essayArea = document.getElementById('essay-input-area');
    const previewOptions = document.getElementById('preview-options-list');
    const previewEssay = document.getElementById('preview-essay-area');
    const currentTypeInput = document.getElementById('current-question-type');

    if(currentTypeInput) currentTypeInput.value = type;

    const btnPg = document.getElementById('btn-toggle-pg');
    const btnEssay = document.getElementById('btn-toggle-essay');
    
    if (type === 'pg' || type === 'pilihan_ganda') {
        if(pgArea) pgArea.style.display = 'block';
        if(essayArea) essayArea.style.display = 'none';
        if(previewOptions) previewOptions.style.display = 'grid';
        if(previewEssay) previewEssay.style.display = 'none';
        btnPg?.classList.add('active');
        btnEssay?.classList.remove('active');
    } else {
        if(pgArea) pgArea.style.display = 'none';
        if(essayArea) essayArea.style.display = 'block';
        if(previewOptions) previewOptions.style.display = 'none';
        if(previewEssay) previewEssay.style.display = 'block';
        btnPg?.classList.remove('active');
        btnEssay?.classList.add('active');
    }

    // PANGGIL PREVIEW SETELAH GANTI TIPE
    if (typeof window.updateLivePreview === 'function') {
        window.updateLivePreview();
    }
};

// 9. FUNGSI SHARE (BAGIAN PERBAIKAN UTAMA)
window.copyShareLink = function(quizId) {
    // 1. Ambil user yang sedang login saat ini
    const user = firebase.auth().currentUser;
    
    if (!user) {
        alert("Sesi login berakhir. Silakan refresh halaman.");
        return;
    }

    // 2. PERBAIKAN URL: Mendeteksi path folder agar tidak 404 di GitHub
    const currentPath = window.location.pathname;
    const directoryPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
    
    // Gabungkan agar menjadi URL lengkap yang benar
    const shareUrl = `${window.location.origin}${directoryPath}/kuis.html?id=${quizId}&author=${user.uid}`;
    
    const text = `Ayo kerjakan kuis ini di Kuisia!`;

    // 3. Update UI Modal Share
    const modalShareTitle = document.getElementById('share-quiz-name');
    if(modalShareTitle) modalShareTitle.innerText = "Bagikan Kuis";
    
    const inputLink = document.getElementById('share-link-input');
    if(inputLink) inputLink.value = shareUrl;
    
    // Update href media sosial
    const waBtn = document.getElementById('share-wa');
    const fbBtn = document.getElementById('share-fb');
    const twBtn = document.getElementById('share-tw');

    if(waBtn) waBtn.href = `https://wa.me/?text=${encodeURIComponent(text + "\n" + shareUrl)}`;
    if(fbBtn) fbBtn.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    if(twBtn) twBtn.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;

    // Tampilkan modal
    const modalElement = document.getElementById('modal-share');
    if(modalElement) modalElement.style.display = 'block';
};

window.closeModalShare = function() {
    document.getElementById('modal-share').style.display = 'none';
};

window.copyLinkOnly = function(event) {
    const copyText = document.getElementById("share-link-input");
    const btn = event.currentTarget;
    
    copyText.select();
    navigator.clipboard.writeText(copyText.value).then(() => {
        const originalText = btn.innerText;
        btn.innerText = "Siap!";
        btn.style.background = "#22c55e";
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = "var(--accent)";
        }, 2000);
    });
};

// 10. FUNGSI UPDATE STATISTIK (VERSI DASHBOARD SINKRON DENGAN KUIS)
window.updateStatistics = function() {
    const userId = auth.currentUser.uid;
    const dbRef = database.ref(`users/${userId}/quizzes`);

    dbRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        let totalQuizzes = 0;
        let totalLikesGlobal = 0;
        let trendDataPoints = [0, 0, 0, 0, 0, 0, 0];
        
        let quizListForRanking = []; // List untuk membandingkan share & participant
        const now = new Date().getTime();

        Object.entries(data).forEach(([quizId, quiz]) => {
            totalQuizzes++;
            
            // 1. Hitung Like (Versi angka sesuai fungsi transaction Mas)
            if (quiz.likes) {
                totalLikesGlobal += (typeof quiz.likes === 'number' ? quiz.likes : Object.keys(quiz.likes).length);
            }

            let participantCount = 0;
            if (quiz.results) {
                Object.values(quiz.results).forEach(res => {
                    participantCount++;
                    // Logika Trend Aktivitas (res.date)
                    const resTime = res.date;
                    if (resTime) {
                        const diffDays = Math.floor((now - resTime) / (1000 * 60 * 60 * 24));
                        if (diffDays >= 0 && diffDays < 7) trendDataPoints[6 - diffDays]++;
                    }
                });
            }

            // 2. Kumpulkan data untuk Ranking Share
            quizListForRanking.push({
                name: quiz.title || "Kuis Tanpa Judul",
                shares: quiz.shareCount || 0,
                participants: participantCount
            });
        });

        // --- PROSES RANKING ---

        // Cari Kuis Terfavorit (Berdasarkan Peserta)
        const favoriteQuiz = [...quizListForRanking].sort((a, b) => b.participants - a.participants)[0];

        // Cari Kuis Paling Banyak Dibagikan (Most Shared)
        const mostSharedQuiz = [...quizListForRanking].sort((a, b) => b.shares - a.shares)[0];

        // --- UPDATE UI ---

        // Update Total Like
        document.getElementById('stat-total-likes').innerText = totalLikesGlobal;

        // Update Banede 2: SEKARANG JADI "MOST SHARED"
        const shareEl = document.getElementById('stat-most-wrong'); // Pakai ID lama dulu agar tidak ubah HTML
        if (shareEl) {
            const labelShare = mostSharedQuiz && mostSharedQuiz.shares > 0 
                ? `${mostSharedQuiz.name} (${mostSharedQuiz.shares}x)` 
                : "Belum ada share";
            shareEl.innerText = labelShare;
            shareEl.title = labelShare;
        }

        // Update Banede 3: Kuis Terfavorit
        const favEl = document.getElementById('stat-favorite-quiz');
        if (favEl) {
            favEl.innerText = favoriteQuiz && favoriteQuiz.participants > 0 ? favoriteQuiz.name : "-";
        }

        // Update Banede 4: Total Kuis
        if (document.getElementById('total-quizzes-count')) {
            document.getElementById('total-quizzes-count').innerText = totalQuizzes;
        }

        renderTrendChart(trendDataPoints);
    });
};

// Fungsi Render Chart Terpisah agar rapi
function renderTrendChart(dataPoints) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    if (trendChartInstance) trendChartInstance.destroy();
    
    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['H-6', 'H-5', 'H-4', 'H-3', 'H-2', 'H-1', 'Hari Ini'],
            datasets: [{
                label: 'Aktivitas Peserta',
                data: dataPoints,
                borderColor: '#8458B3',
                backgroundColor: 'rgba(132, 88, 179, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: 3,
                pointRadius: 4,
                pointBackgroundColor: '#8458B3'
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { display: false } },
                x: { grid: { display: false } }
            }
        }
    });
}

// A. Event Listener untuk Dropdown Kategori (LOGIKA CERDAS TAHAP 3B)
document.getElementById('input-kategori').addEventListener('change', function(e) {
    const quizId = e.target.value;
    const quizName = this.options[this.selectedIndex].text;
    const userId = auth.currentUser.uid;
    
    if (quizId) {
        document.getElementById('current-quiz-name').innerText = quizName;

        // 1. CEK TIPE KUIS DI FIREBASE
        database.ref(`users/${userId}/quizzes/${quizId}`).once('value', (snapshot) => {
            const quizData = snapshot.val();
            if (quizData) {
                const tipeKuis = quizData.quizType || 'pg'; // fallback ke pg jika kosong
                const toggleContainer = document.getElementById('question-type-toggle-container');

                if (tipeKuis === 'campuran') {
                    // Jika campuran, tampilkan tombol toggle PG/Essay
                    if(toggleContainer) toggleContainer.style.display = 'block';
                    window.switchQuestionType('pg'); // Default awal ke PG untuk campuran
                } else {
                    // Jika murni PG atau Essay, sembunyikan tombol toggle
                    if(toggleContainer) toggleContainer.style.display = 'none';
                    window.switchQuestionType(tipeKuis);
                }
            }
        });

        // 2. Load data soal dan rekap seperti biasa
        if (typeof loadQuestions === "function") loadQuestions(quizId);
        if (typeof renderRekapNilai === "function") renderRekapNilai(quizId);
        
    } else {
        // Reset jika tidak ada yang dipilih
        document.getElementById('current-quiz-name').innerText = "Pilih Kuis";
        document.getElementById('question-count-badge').innerText = "0 Soal";
        document.getElementById('questions-list-container').innerHTML = '<p style="text-align:center; color:#aaa; padding: 20px;">Pilih kategori untuk melihat soal.</p>';
    }
});

// B. Fungsi loadQuestions (Versi Perbaikan dengan Scroll 500px)
function loadQuestions(quizId) {
    const userId = auth.currentUser.uid;
    const container = document.getElementById('questions-list-container');
    const badge = document.getElementById('question-count-badge');
    
    // --- PENERAPAN STYLE SCROLL 500PX ---
    container.style.maxHeight = "500px";
    container.style.overflowY = "auto";
    container.style.paddingRight = "10px";
    container.style.scrollBehavior = "smooth";

    // Menambahkan style scrollbar khusus agar serasi dengan branding Zingquis
    if (!document.getElementById('custom-scroll-style')) {
        const style = document.createElement('style');
        style.id = 'custom-scroll-style';
        style.innerHTML = `
            #questions-list-container::-webkit-scrollbar { width: 6px; }
            #questions-list-container::-webkit-scrollbar-track { background: transparent; }
            #questions-list-container::-webkit-scrollbar-thumb { background: #DDBDF4; border-radius: 10px; }
            #questions-list-container::-webkit-scrollbar-thumb:hover { background: #8458B3; }
        `;
        document.head.appendChild(style);
    }

    database.ref(`users/${userId}/quizzes/${quizId}/questions`).on('value', (snapshot) => {
        const data = snapshot.val();
        container.innerHTML = '';
        
        if (!data) {
            badge.innerText = "0 Soal";
            container.innerHTML = '<p style="text-align:center; color:#aaa; padding: 20px;">Belum ada soal pada kuis ini.</p>';
            if(window.updateTargetStats) window.updateTargetStats();
            return;
        }

        const questions = Object.values(data);
        badge.innerText = `${questions.length} Soal`;

        Object.entries(data).forEach(([qId, qData]) => {
            const itemClass = qData.type === 'pg' ? 'soal-pg-item' : 'soal-essay-item';
            const hotsClass = qData.isHots ? 'is-hots-item' : ''; 
            
            container.innerHTML += `
                <div class="soal-item ${itemClass} ${hotsClass}" style="padding:15px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; background: white; margin-bottom: 8px; border-radius: 12px; border: 1px solid #F4F7FE; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);">
                    <div style="flex: 1; padding-right: 15px;">
                        <p style="margin:0; font-size: 0.95rem; line-height: 1.4; color: #494D5F;">
                            ${qData.isHots ? '<span style="background:#fff7ed; color:#c2410c; border:1px solid #ffedd5; font-size:10px; padding:2px 6px; border-radius:4px; margin-right:5px; font-weight:bold;">HOTS</span>' : ''}
                            <strong>${qData.question}</strong>
                        </p>
                        <small style="color:#666; display: block; margin-top: 4px;">
                            Tipe: <span style="text-transform: uppercase;">${qData.type}</span> | Poin: ${qData.poin || 0}
                        </small>
                    </div>
                    
                    <div style="display: flex; gap: 8px;">
                        <button onclick="window.bukaModalEditSimple('${qId}')" 
                            style="background:#f3ebff; color:#8458B3; border:none; width:35px; height:35px; border-radius:10px; cursor:pointer; transition: 0.2s;"
                            title="Edit Soal">
                            <i class="fas fa-edit"></i>
                        </button>
                        
                        <button onclick="hapusSoal('${qId}')" 
                            style="background:#fee2e2; color:#ef4444; border:none; width:35px; height:35px; border-radius:10px; cursor:pointer; transition: 0.2s;"
                            title="Hapus Soal">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>`;
        });

        if(window.updateTargetStats) window.updateTargetStats();

        // --- TAMBAHKAN INI DI BARIS TERAKHIR DALAM SNAPSHOT ---
        window.checkQuotaAndLock(quizId);
    });
}

// Hapus soal
window.hapusSoal = function(qId) {
    const quizId = document.getElementById('input-kategori').value;
    const userId = auth.currentUser.uid;
    
    askConfirm("Hapus pertanyaan ini?", () => {
        database.ref(`users/${userId}/quizzes/${quizId}/questions/${qId}`).remove()
            .then(() => showNotif("Terhapus", "Soal telah dihapus."));
    });
};

// Opsi Dinamis
let optionCount = 0;

window.addOptionField = function() {
    const container = document.getElementById('dynamic-options-container');
    const selectJawaban = document.getElementById('input-jawaban');
    
    // Hitung jumlah anak (elemen) yang ada di container saat ini
    const currentOptions = container.querySelectorAll('.option-item').length;

    if (currentOptions >= 5) {
        showNotif("Info", "Maksimal 5 pilihan jawaban (A-E)");
        return;
    }

    // Gunakan huruf berdasarkan jumlah yang ada (0=A, 1=B, dst)
    const char = String.fromCharCode(65 + currentOptions); 
    
    const div = document.createElement('div');
    div.className = "option-item mb-2";
    div.innerHTML = `
        <div class="input-group">
            <span class="input-group-text" style="background:#f8fafc; font-weight:bold; color:#64748b;">${char}</span>
            <input type="text" class="input-mordern opt-value" 
            style="border-radius: 8px; padding: 12px; width: 80%; border:1px solid #ddd; font-family: 'Poppins', sans-serif;
            font-size: 14px;" placeholder="Ketik pilihan ${char}..." required>
        </div>
    `;
    container.appendChild(div);

    // Update dropdown jawaban benar
    const opt = new Option(`Pilihan ${char}`, currentOptions);
    selectJawaban.add(opt);
};

document.getElementById('input-soal').addEventListener('input', function(e) {
    const previewText = document.getElementById('preview-question');
    if (previewText) {
        previewText.innerText = e.target.value || "Pertanyaan akan muncul di sini...";
    }
});

// Inisialisasi awal opsi
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('dynamic-options-container');
    if(container) {
        container.innerHTML = '';
        addOptionField(); addOptionField();
    }
});

// Modals & Notif
function showNotif(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Tambahkan ikon besar agar menarik perhatian di tengah layar
    const icon = type === 'warning' ? 'fa-crown' : 'fa-info-circle';
    const iconColor = type === 'warning' ? '#f1c40f' : '#8458B3';

    toast.innerHTML = `
        <div style="font-size: 2rem; color: ${iconColor}; margin-bottom: 15px;">
            <i class="fas ${icon}"></i>
        </div>
        <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 8px; color: #fbbf24;">${title}</div>
        <div style="font-size: 0.95rem; line-height: 1.5; color: #e2e2e2;">${message}</div>
        <button onclick="this.parentElement.remove()" style="margin-top: 15px; background: #eee; border: none; padding: 8px 20px; border-radius: 20px; cursor: pointer; font-size: 0.8rem;">Tutup</button>
    `;

    container.appendChild(toast);

    // Hapus otomatis sedikit lebih lama (5 detik) karena user perlu waktu membaca di tengah
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'scale(0.9)';
            toast.style.transition = '0.3s';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

window.closeNotif = function() { document.getElementById('modal-notif').style.display = 'none'; };

let pendingAction = null;
window.askConfirm = function(message, action) {
    document.getElementById('confirm-message').innerText = message;
    document.getElementById('modal-confirm').style.display = 'block';
    pendingAction = action; 
};
window.closeConfirm = function() { document.getElementById('modal-confirm').style.display = 'none'; };

document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-confirm-action' && pendingAction) {
        pendingAction();
        closeConfirm();
    }
});

document.querySelector('.logout-btn').addEventListener('click', () => {
    isLoggingOut = true; // Tandai bahwa ini logout sengaja
    auth.signOut().then(() => {
        window.location.href = "index.html"; // Arahkan ke index
    }).catch((error) => {
        console.error("Gagal logout:", error);
        isLoggingOut = false; // Reset jika gagal
    });
});

// --- BAGIAN 1: FUNGSI UTILITY (Letakkan di sini) ---
function showLoading() { 
    const overlay = document.getElementById('loading-overlay');
    if(overlay) overlay.style.display = 'flex'; 
}

function hideLoading() { 
    const overlay = document.getElementById('loading-overlay');
    if(overlay) overlay.style.display = 'none'; 
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    if(!container) return; // Mencegah error jika elemen belum ada
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// --- BAGIAN 2: LOGIKA APLIKASI (Fungsi-fungsi yang sudah ada sebelumnya) ---
function loadKuis() {
    showLoading(); // Panggil fungsi loading
    db.collection("kuis").get().then((snapshot) => {
        // ... kode render kuis Anda ...
        hideLoading(); // Sembunyikan setelah sukses
    }).catch(err => {
        hideLoading();
        showToast("Gagal memuat data: " + err.message);
    });
}

// --- RENDER NILAI (PERBAIKAN) ---
window.renderRekapNilai = function(quizId) {
    const container = document.getElementById('rekap-table-container');
    if (!auth.currentUser) {
        container.innerHTML = "<p style='color:red;'>Silakan login kembali.</p>";
        return;
    }
    if (!quizId) {
        container.innerHTML = "<h3> Silahkan pilih kuis terlebih dahulu.</h3>";
        return;
    }

    container.innerHTML = "Memuat data..."; 
    const path = `users/${auth.currentUser.uid}/quizzes/${quizId}/results`;
    
    database.ref(path).once('value', snapshot => {
        const results = snapshot.val();
        if (!results) {
            container.innerHTML = "<p>Belum ada siswa yang mengerjakan kuis ini.</p>";
            return;
        }

        let html = `
            <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size: 0.9rem;">
                <tr style="background:#f4f4f4; text-align:left;">
                    <th style="padding:12px; border-bottom:2px solid #ddd;">No. Absen</th>
                    <th style="padding:12px; border-bottom:2px solid #ddd;">Nama</th>
                    <th style="padding:12px; border-bottom:2px solid #ddd;">Kelas</th>
                    <th style="padding:12px; border-bottom:2px solid #ddd;">Skor</th>
                    <th style="padding:12px; border-bottom:2px solid #ddd; text-align:center;">Aksi</th>
                </tr>`;

        const dataArr = Object.entries(results).map(([id, val]) => ({ id, ...val }));
        dataArr.sort((a, b) => (parseInt(a.playerNo) || 0) - (parseInt(b.playerNo) || 0));

        dataArr.forEach((res) => {
            const resultId = res.id;
            const name = res.playerName || 'Anonim';
            const playerClass = res.playerClass || '-';
            const playerNo = res.playerNo || '-';
            const score = Math.round(res.score || 0);
            
            // SINKRONISASI: Cek 'details' (nama baru) atau 'essayAnswers' (nama lama)
            const hasDetail = (res.details || res.essayAnswers) ? '<i class="fas fa-file-alt" style="color:#8458B3; margin-left:5px;"></i>' : '';

            html += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:10px; text-align:center;">${playerNo}</td>
                    <td style="padding:10px;"><b>${name}</b> ${hasDetail}</td>
                    <td style="padding:10px;"><span style="background:#eef0f7; padding:2px 6px; border-radius:4px; font-size:0.8rem;">${playerClass}</span></td>
                    <td style="padding:10px; font-weight:600; color:#8458B3;">${score}</td>
                    <td style="padding:10px; text-align:center;">
                        <button onclick="bukaDetailJawaban('${quizId}', '${resultId}')" 
                                class="btn-modern" 
                                style="padding: 5px 12px; font-size: 0.8rem; background: #8458B3; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            <i class="fas fa-eye"></i> Detail
                        </button>
                    </td>
                </tr>`;
        });

        html += `</table>`;
        container.innerHTML = html; 
    });
};

// --- LIHAT DETAIL ---
window.bukaDetailJawaban = async function(quizId, resultId) {
    const modal = document.getElementById('modal-detail-jawaban');
    const nameDisplay = document.getElementById('detail-player-name');
    const container = document.getElementById('essay-review-container');

    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'block';
    }
    container.innerHTML = "<p>Sedang memuat detail jawaban...</p>";

    // Ambil Data Jawaban
    const path = `users/${auth.currentUser.uid}/quizzes/${quizId}/results/${resultId}`;
    database.ref(path).once('value', snapshot => {
        const data = snapshot.val();
        if (!data) {
            container.innerHTML = "<p style='color:red;'>Data tidak ditemukan.</p>";
            return;
        }

        nameDisplay.innerText = data.playerName || "Anonim";
        
        // SINKRONISASI: Gunakan data.details (format baru) atau data.essayAnswers (format lama)
        const answers = data.details || data.essayAnswers || [];

        if (answers.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:20px;"><p>Siswa ini mengerjakan versi kuis lama tanpa detail jawaban.</p></div>`;
            return;
        }

        // Bagian Isi Jawaban (Scrollable)
        let listHTML = `<div class="review-list" style="max-height: 400px; overflow-y: auto; padding-right:5px; margin-bottom:15px;">`;
        answers.forEach((item, index) => {
            const isCorrect = item.status === "Benar" || item.isCorrect === true;
            const statusColor = isCorrect ? "#27ae60" : "#e74c3c";
            
            const teksSoal = item.pertanyaan || item.soal || "Pertanyaan tidak terbaca";
            const teksJawaban = item.jawabanSiswa || item.jawabanUser || "Tidak dijawab";

            listHTML += `
                <div class="review-item" style="border: 1px solid #ddd; border-radius: 12px; padding: 15px; margin-bottom: 15px; background: white;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size:0.75rem; color:#888;">SOAL #${index + 1} (${item.tipe || 'pg'})</span>
                        <span style="color: ${statusColor}; font-weight:bold; font-size:0.8rem;">${item.status || (isCorrect ? 'Benar' : 'Salah')}</span>
                    </div>
                    <p style="margin:0 0 10px 0; font-size:0.9rem;"><b>Q:</b> ${teksSoal}</p>
                    <div style="background: #f9f9f9; padding: 10px; border-radius: 6px; border-left: 3px solid ${statusColor};">
                        <p style="margin:0; font-size:0.7rem; color:#888;">JAWABAN SISWA:</p>
                        <p style="margin:0; font-weight:500; font-size:0.85rem;">${teksJawaban}</p>
                    </div>
                </div>`;
        });
        listHTML += `</div>`;

        // --- FOOTER DENGAN TOMBOL PDF ---
        // 3. Susun Footer secara terpisah agar rapi
        const footerHTML = `
            <div style="margin-top:20px; padding:15px; border-top:2px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:0.8rem; color:#666;">Skor:</span>
                    <input type="number" id="manual-score-${resultId}" value="${Math.round(data.score)}" 
                           style="width:60px; padding:5px; border:1px solid #ccc; border-radius:4px; text-align:center;">
                    <button onclick="updateSkorManual('${quizId}', '${resultId}')" 
                            style="background:#8458B3; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.8rem;">
                        Update
                    </button>
                </div>
                
                <div style="display:flex; gap:10px;">
                    <button onclick="generateSinglePDF('${resultId}', '${quizId}')" 
                            style="background: #e74c3c; color: white; border: none; padding: 8px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size:0.8rem;">
                        <i class="fas fa-file-pdf"></i> Cetak PDF
                    </button>
                    <button onclick="closeModal('modal-detail-jawaban')" 
                            style="background:#ddd; color:#333; border:none; padding:8px 15px; border-radius:6px; cursor:pointer; font-size:0.8rem;">
                        Tutup
                    </button>
                </div>
            </div>
        `;

        // Ganti isi container sekaligus
        container.innerHTML = listHTML + footerHTML;
    });
};


// Fungsi pembantu menutup modal
window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
};

// Fungsi UBAH NILAI MANUAL
window.updateSkorManual = function(quizId, resultId) {
    const scoreInput = document.getElementById(`manual-score-${resultId}`);
    const newScore = scoreInput ? scoreInput.value : "";
    
    if (newScore === "" || isNaN(newScore)) {
        showCustomAlert("Peringatan", "Masukkan skor yang valid!", "#e74c3c");
        return;
    }

    const path = `users/${auth.currentUser.uid}/quizzes/${quizId}/results/${resultId}`;
    
    database.ref(path).update({
        score: parseFloat(newScore)
    }).then(() => {
        // Panggil Modal Notifikasi Buatan Sendiri
        showCustomAlert("Berhasil", `Skor telah diubah menjadi <b>${Math.round(newScore)}</b>`, "#27ae60");

        // Update tabel rekap di latar belakang
        if (typeof renderRekapNilai === "function") {
            renderRekapNilai(quizId);
        }
    }).catch(err => {
        console.error(err);
        showCustomAlert("Gagal", "Terjadi kesalahan saat menyimpan.", "#e74c3c");
    });
};

// Fungsi Pendukung untuk Memunculkan Modal Notif
function showCustomAlert(title, message, color) {
    let alertBox = document.getElementById('custom-alert-notif');
    if (!alertBox) {
        alertBox = document.createElement('div');
        alertBox.id = 'custom-alert-notif';
        document.body.appendChild(alertBox);
    }

    // Update CSS agar berada di paling depan (z-index: 99999)
    alertBox.style.cssText = `
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%;
        background: rgba(0,0,0,0.6); 
        display: flex; 
        align-items: center;
        justify-content: center; 
        z-index: 99999; 
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;

    alertBox.innerHTML = `
        <div style="background: white; width: 340px; border-radius: 15px; overflow: hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.3); animation: popIn 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55);">
            <div style="background: ${color}; padding: 18px; color: white; text-align: center; position: relative;">
                <h3 style="margin: 0; font-size: 1.2rem; letter-spacing: 0.5px;">${title}</h3>
                <span onclick="document.getElementById('custom-alert-notif').style.display='none'" 
                      style="position: absolute; right: 15px; top: 12px; cursor: pointer; font-size: 1.8rem; line-height: 1; opacity: 0.8;">&times;</span>
            </div>
            <div style="padding: 25px; text-align: center; color: #333;">
                <p style="margin: 0 0 20px 0; font-size: 1rem; line-height: 1.5;">${message}</p>
                <button onclick="document.getElementById('custom-alert-notif').style.display='none'" 
                        style="background: ${color}; color: white; border: none; padding: 12px 25px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; font-size: 1rem; transition: 0.2s;">
                    Selesai
                </button>
            </div>
        </div>
        <style>
            @keyframes popIn {
                0% { opacity: 0; transform: scale(0.5); }
                100% { opacity: 1; transform: scale(1); }
            }
        </style>
    `;
    alertBox.style.display = 'flex';
}

// Fungsi PDF (Sudah diperbaiki agar tidak error 'null')
window.generateSinglePDF = function(resultId, quizIdDirect) {
    const quizId = quizIdDirect || document.getElementById('quiz-select-rekap')?.value;
    if (!quizId) return alert("ID Kuis tidak ditemukan.");

    const path = `users/${auth.currentUser.uid}/quizzes/${quizId}/results/${resultId}`;
    
    // Ambil judul kuis
    const quizTitle = document.getElementById('quiz-title-display')?.innerText || 
                      document.getElementById('current-quiz-name')?.innerText || "Laporan Kuis";

    database.ref(path).once('value', snapshot => {
        const data = snapshot.val();
        if (!data) return alert("Data tidak ditemukan.");

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const cleanHTML = (text) => {
            if (!text) return "";
            return text.replace(/<\/?[^>]+(>|$)/g, "").trim();
        };

        // --- HEADER ---
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text("HASIL EVALUASI SISWA", 105, 15, { align: "center" });

        // --- INFO SISWA & MATA PELAJARAN (2 BARIS AGAR TIDAK TABRAKAN) ---
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Nama Siswa     : ${data.playerName || 'Anonim'}`, 14, 25);
        
        // Membagi Mata Pelajaran menjadi 2 baris jika terlalu panjang
        const mataPelajaranText = `Mata Pelajaran : ${quizTitle}`;
        const splitTitle = doc.splitTextToSize(mataPelajaranText, 130); // Batasi lebar agar tidak menabrak kotak
        doc.text(splitTitle, 14, 30);
        
        // Sesuaikan posisi tanggal berdasarkan jumlah baris mata pelajaran
        const dateY = 30 + (splitTitle.length * 5);
        doc.text(`Tanggal Cetak  : ${new Date().toLocaleDateString('id-ID')}`, 14, dateY);

        // --- KOTAK SKOR (Dibuat lebih pendek/ramping) ---
        const lebarBaru = 34; // 75% dari 45 adalah 33.75, kita bulatkan 34
        const scoreX = 162;   // Kita geser X ke kanan sedikit (dari 150 ke 162) agar tetap mepet margin kanan
        const scoreY = 22;

        doc.setDrawColor(132, 88, 179);
        doc.setLineWidth(0.6);
        // Lebar kotak diubah dari 45 menjadi lebarBaru (34)
        doc.rect(scoreX, scoreY, lebarBaru, 18); 

        doc.setFontSize(8);
        // Titik tengah teks adalah scoreX + (lebarBaru / 2)
        doc.text("SKOR AKHIR", scoreX + (lebarBaru / 2), scoreY + 5, { align: "center" });

        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text(`${Math.round(data.score)}`, scoreX + (lebarBaru / 2), scoreY + 14, { align: "center" });

        // Line pembatas tetap
        doc.setLineWidth(0.5);
        doc.setDrawColor(0);
        doc.line(14, 48, 196, 48); 

        // --- DATA TABEL ---
        const items = data.details || data.essayAnswers || [];
        const tableRows = items.map((item, index) => {
            const isCorrect = item.status === "Benar" || item.isCorrect === true;
            const tipe = item.tipe ? item.tipe.toUpperCase() : "PG";
            let teksJawaban = cleanHTML(item.jawabanSiswa || item.jawabanUser);
            
            return [
                index + 1,
                cleanHTML(item.pertanyaan || item.soal),
                teksJawaban,
                isCorrect ? `Benar (${tipe})` : `Salah (${tipe})`
            ];
        });

        // --- TABEL ---
        doc.autoTable({
            startY: 53,
            head: [['No', 'Pertanyaan', 'Jawaban Siswa', 'Status']],
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [132, 88, 179], textColor: 255 },
            bodyStyles: { fontSize: 9, cellPadding: 4 },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 80 }, 2: { cellWidth: 50 }, 3: { cellWidth: 35 } },
            margin: { bottom: 30 }
        });

        // --- TANDA TANGAN (TTD) - VERSI ANTI-CRASH ---
        // Menggunakan doc.previousAutoTable.finalY yang lebih stabil
        let finalY = 0;
        if (doc.previousAutoTable && doc.previousAutoTable.finalY) {
            finalY = doc.previousAutoTable.finalY + 10;
        } else {
            finalY = 60; // Fallback jika tabel gagal terdeteksi
        }

        const pageHeight = doc.internal.pageSize.height;
        
        // Cek apakah cukup ruang di halaman ini
        if (finalY > pageHeight - 30) {
            doc.addPage();
            finalY = 20;
        }

        doc.setTextColor(100); 
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        
        // Cetak Garis dan Teks
        doc.text("__________________________", 150, finalY, { align: "center" });
        doc.setFont(undefined, 'italic');
        doc.text("dibuat otomatis oleh AI Kuisia", 150, finalY + 5, { align: "center" });

        // Simpan PDF
        doc.save(`Hasil_${data.playerName || 'Siswa'}_${quizId}.pdf`);
    });
};

// --- MANAJEMEN MODAL REKAP ---
window.openRekapModal = function(quizId) {
    // 1. Tampilkan modal
    document.getElementById('rekap-modal').style.display = 'block';
    
    // 2. Panggil fungsi render untuk kuis spesifik tersebut
    renderRekapNilai(quizId);
};

window.closeRekapModal = function() {
    document.getElementById('rekap-modal').style.display = 'none';
};

// --- FUNGSI EXPORT EXCEL ---
window.exportTableToExcel = function() {
    const container = document.getElementById('rekap-table-container');
    const table = container.querySelector('table');
    
    if (!table) {
        alert("Data belum dimuat atau kosong!");
        return;
    }
    
    const wb = XLSX.utils.table_to_book(table, {sheet: "Rekap Nilai"});
    XLSX.writeFile(wb, "Rekap_Nilai_Kuis.xlsx");
};

// --- FUNGSI SCREENSHOT ---
window.screenshotModal = function() {
    const modal = document.querySelector('#rekap-modal > div');
    
    // Simpan style asli agar bisa dikembalikan
    const originalStyle = {
        maxHeight: modal.style.maxHeight,
        overflowY: modal.style.overflowY
    };

    // Ubah style untuk "membuka" modal secara penuh
    modal.style.maxHeight = "none";
    modal.style.overflowY = "visible";

    // Beri sedikit jeda agar browser merender perubahan style
    setTimeout(() => {
        html2canvas(modal, {
            backgroundColor: "#ffffff",
            logging: false,
            // Properti ini memaksa menangkap area yang ter-scroll
            windowHeight: modal.scrollHeight 
        }).then(canvas => {
            // Kembalikan style asli agar scrollbar muncul kembali
            modal.style.maxHeight = originalStyle.maxHeight;
            modal.style.overflowY = originalStyle.overflowY;

            // Proses download
            const link = document.createElement('a');
            link.download = 'rekap-nilai-lengkap.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    }, 300);
};


document.getElementById('input-kategori').addEventListener('change', function(e) {
    const quizId = e.target.value;
    const quizName = this.options[this.selectedIndex].text;
    
    // Perbarui variabel global
    window.activeQuizId = quizId;
    
    if (quizId) {
        document.getElementById('current-quiz-name').innerText = quizName;
        loadQuestions(quizId);
    } else {
        document.getElementById('current-quiz-name').innerText = "Pilih Kuis";
        window.activeQuizId = null; // Reset jika tidak ada yang dipilih
    }
});

window.bukaModalRekapDariHeader = function() {
    console.log("Membuka Modal..."); // Cek di Inspect Element > Console
    const modal = document.getElementById('rekap-modal');
    if(modal) {
        modal.style.display = 'block';
        renderRekapNilai(window.activeQuizId);
    }
};

window.closeRekapModal = function() {
    document.getElementById('rekap-modal').style.display = 'none';
    
    // Reset pencarian
    document.getElementById('search-rekap').value = "";
    // Panggil filter agar tabel kembali normal (semua baris muncul)
    filterRekapSiswa(); 
};

window.toggleForm = function() {
    const formBody = document.getElementById('form-body');
    const icon = document.getElementById('toggle-icon');
    
    if (formBody.style.display === "none") {
        formBody.style.display = "block";
        icon.classList.add('rotate-icon'); // Tambahkan class untuk rotasi
    } else {
        formBody.style.display = "none";
        icon.classList.remove('rotate-icon'); // Hapus class rotasi
    }
};

document.addEventListener('DOMContentLoaded', function() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');

    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', function() {
            sidebar.classList.toggle('active');
        });
    }
});

// Menutup sidebar saat konten utama diklik (Hanya di Mobile)
document.querySelector('.main-content').addEventListener('click', function() {
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('active');
    }
});

// Fungsi untuk memperbarui teks pertanyaan di preview
document.getElementById('input-soal').addEventListener('input', function(e) {
    const previewText = document.getElementById('preview-question');
    previewText.innerText = e.target.value.trim() !== "" ? e.target.value : "Pertanyaan akan muncul di sini...";
});

// Tambahkan listener ke fungsi addOptionField yang sudah ada
// Anda perlu mencari fungsi addOptionField() di admin-script.js dan pastikan 
// setiap kali input baru dibuat, ia memanggil updateLivePreviewOptions()

window.filterRekapSiswa = function() {
    const input = document.getElementById('search-rekap').value.toLowerCase();
    const table = document.querySelector('#rekap-table-container table');
    
    // Jika tabel belum ada, hentikan
    if (!table) return;
    
    const tr = table.getElementsByTagName('tr');
    
    // Loop melalui semua baris (mulai dari indeks 1 untuk melewati header tabel)
    for (let i = 1; i < tr.length; i++) {
        const rowText = tr[i].textContent.toLowerCase();
        
        // Jika teks pencarian ditemukan di dalam baris, tampilkan; jika tidak, sembunyikan
        if (rowText.indexOf(input) > -1) {
            tr[i].style.display = "";
        } else {
            tr[i].style.display = "none";
        }
    }
};

async function compressAndUploadImage(file) {
    const cloudName = 'dz16gb8tw';
    const uploadPreset = 'kuisia_tumbernails'; // PASTIKAN INI "UNSIGNED" DI CLOUDINARY
    
    // Ambil elemen progress
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    
    if (progressContainer) progressContainer.style.display = 'block';
    if (progressBar) {
        progressBar.style.width = '10%';
        progressBar.style.background = 'var(--accent)'; // Reset warna ke ungu
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    
    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        // Debugging: Lihat error asli dari Cloudinary di Console
        if (!response.ok) {
            console.error("Cloudinary Error Details:", data);
            throw new Error(data.error ? data.error.message : "Gagal upload ke Cloudinary");
        }

        if (data.secure_url) {
            if (progressBar) progressBar.style.width = '100%';
            
            // Sembunyikan setelah sukses
            setTimeout(() => { 
                if (progressContainer) progressContainer.style.display = 'none'; 
            }, 2000);
            
            return data.secure_url;
        } else {
            throw new Error("Secure URL tidak ditemukan");
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        if (progressBar) progressBar.style.background = "#e11d48"; // Merah
        showNotif("Gagal Upload", error.message);
        throw error;
    }
}

// Fungsi untuk menampilkan nama admin berdasarkan email
function updateWelcomeMessage(user) {
    const welcomeEl = document.getElementById('welcome-message');
    if (welcomeEl && user && user.email) {
        // Mengambil bagian sebelum '@' di email untuk nama panggilan
        const displayName = user.email.split('@')[0];
        welcomeEl.innerHTML = `Selamat datang di Komunitas Kuisia, <strong>${displayName}</strong>!`;
    }
}

// Fungsi Toggle Section Profil di Sidebar
window.toggleProfile = function() {
    showSection('profile-section');
    loadProfileData(); // Tarik data setiap kali menu dibuka
};

// 1. Fungsi Toggle Accordion yang Aman
window.toggleAccordion = function(type) {
    // Gunakan ID yang sesuai dengan admin.html Anda
    const previewContent = document.getElementById('acc-preview-content');
    const editContent = document.getElementById('acc-edit-content');
    
    // Validasi: Jika elemen tidak ditemukan, hentikan fungsi agar tidak error classList
    if (!previewContent || !editContent) {
        console.warn("Elemen accordion belum dimuat di DOM.");
        return;
    }

    if (type === 'preview') {
        previewContent.classList.add('active');
        editContent.classList.remove('active');
    } else {
        editContent.classList.add('active');
        previewContent.classList.remove('active');
    }
};

// 2. Fungsi Load Data dengan Default Avatar
function loadProfileData() {
    const user = auth.currentUser;
    if (!user) return;

    // Gunakan .on agar setiap ada perubahan di DB, UI langsung update otomatis
    database.ref(`users/${user.uid}/profile`).on('value', (snapshot) => {
        const data = snapshot.val();
        
        const viewName = document.getElementById('view-name');
        if (!viewName) return; 

        if (data) {
            // Isi Preview
            viewName.innerText = data.nama || data.name || "Nama Author";
            document.getElementById('view-job').innerText = data.job || "Pekerjaan";
            document.getElementById('view-bio').innerText = data.bio || "Halo, saya author di Kuisia.";
            
            const photoUrl = data.photo || `https://ui-avatars.com/api/?name=${data.nama || data.name || 'Author'}&background=random`;
            document.getElementById('view-photo').src = photoUrl;

            // Isi Form Edit (Agar input tetap sinkron)
            document.getElementById('inp-name').value = data.nama || data.name || "";
            document.getElementById('inp-job').value = data.job || "";
            document.getElementById('inp-bio').value = data.bio || "";
            document.getElementById('inp-gift').value = data.gift || "";
            
            // Catatan: Jika Mas sedang mengetik, .on() bisa membuat kursor loncat.
            // Biasanya window.toggleAccordion('preview') cukup dipanggil saat awal saja.
        } else {
            // Jika data benar-benar kosong (User Baru)
            if (typeof window.toggleAccordion === "function") window.toggleAccordion('edit');
        }
    });
}

// Fungsi Helper: Identik dengan compressAndUploadImage di bagian Kuis
async function uploadProfileImage(file) {
    const cloudName = 'dz16gb8tw';
    const uploadPreset = 'kuisia_tumbernails'; // Gunakan preset yang sama
    
    const progressContainer = document.getElementById('profile-upload-progress-container');
    const progressBar = document.getElementById('profile-upload-progress-bar');
    const statusText = document.getElementById('profile-upload-status-text');
    
    progressContainer.style.display = 'block';
    progressBar.style.width = '30%';
    progressBar.style.background = 'var(--accent)'; // Reset warna ke ungu
    statusText.innerText = "Mengunggah gambar profil...";
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    
    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (data.secure_url) {
            progressBar.style.width = '100%';
            statusText.innerText = "Upload Selesai!";
            
            setTimeout(() => { 
                progressContainer.style.display = 'none'; 
            }, 2000);
            
            return data.secure_url;
        } else {
            throw new Error("Upload gagal");
        }
    } catch (error) {
        statusText.innerText = "Gagal upload.";
        progressBar.style.background = "#e11d48"; // Merah jika error
        throw error;
    }
}

// Handler saat input file dipilih
window.handleProfileImageUpload = async function(input) {
    const file = input.files[0];
    if (!file) return;

    try {
        const imageUrl = await uploadProfileImage(file);
        if (imageUrl) {
            // Update preview foto secara langsung
            document.getElementById('view-photo').src = imageUrl;
            // Tampilkan notifikasi jika fungsi showNotif tersedia
            if (typeof showNotif === "function") showNotif("Sukses", "Foto berhasil diunggah.");
        }
    } catch (error) {
        console.error("Profile Upload Error:", error);
    }
};


// B. Fungsi Simpan Profil Akhir dengan Sinkronisasi Massal (Tahap 1.1)
window.saveProfileData = async function() {
    const user = auth.currentUser;
    if (!user) return;

    // AMBIL DATA LAMA TERLEBIH DAHULU agar email tidak hilang
    const oldSnap = await database.ref(`users/${user.uid}/profile`).once('value');
    const oldProfile = oldSnap.val() || {};

    const profileData = {
        nama: document.getElementById('inp-name').value.trim(), // Gunakan 'nama' agar sinkron
        name: document.getElementById('inp-name').value.trim(), // Tetap ada 'name' untuk cadangan
        job: document.getElementById('inp-job').value.trim(),
        bio: document.getElementById('inp-bio').value.trim(),
        gift: document.getElementById('inp-gift').value.trim(),
        photo: document.getElementById('view-photo').src,
        email: oldProfile.email || user.email || "-" // PASTIKAN EMAIL TETAP DIBAWA
    };

    if (!profileData.name) {
        if (typeof showNotif === "function") showNotif("Peringatan", "Nama tidak boleh kosong.", "warning");
        return;
    }


    const updates = {};
    
    // 1. Update ke folder Profile & AuthorName level atas untuk user tersebut
    updates[`users/${user.uid}/profile`] = profileData;
    updates[`users/${user.uid}/authorName`] = profileData.name;

    try {
        // Tampilkan loading jika ada
        if (document.getElementById('loading-overlay')) document.getElementById('loading-overlay').style.display = 'flex';

        // 2. SINKRONISASI KE INDEX: Cari semua kuis milik user ini di quiz_index
        const snapshot = await database.ref('quiz_index').orderByChild('userId').equalTo(user.uid).once('value');

        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const quizId = childSnapshot.key;
                // Update authorName di setiap entri kuis pada index agar halaman utama berubah otomatis
                updates[`quiz_index/${quizId}/authorName`] = profileData.name;
            });
        }

        // 3. Jalankan semua update sekaligus (Atomic Update)
        await database.ref().update(updates);

        if (document.getElementById('loading-overlay')) document.getElementById('loading-overlay').style.display = 'none';

        if (typeof showNotif === "function") {
            showNotif("Berhasil", "Profil dan seluruh kuis Anda telah disinkronkan ke halaman utama.");
        }

    } catch (err) {
        console.error("Update DB Error:", err);
        if (document.getElementById('loading-overlay')) document.getElementById('loading-overlay').style.display = 'none';
        if (typeof showNotif === "function") showNotif("Gagal", "Terjadi kesalahan saat sinkronisasi data.");
    }
};

// SHOW SECTION
window.showSection = function(sectionId) {
    // 1. Ambil semua elemen dengan class 'content-section'
    const sections = document.querySelectorAll('.content-section');
    
    // 2. Sembunyikan semua section (termasuk dashboard, rekap, dan PROFIL)
    sections.forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });

    // 3. Tampilkan section yang dituju
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.style.display = 'block';
        targetSection.classList.add('active');
    }

    // 4. Update status 'active' pada tombol sidebar agar warna ungu berpindah
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    // Cari tombol yang memiliki onclick sesuai sectionId dan beri class active
    const activeBtn = document.querySelector(`[onclick*="${sectionId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // 5. Tutup sidebar otomatis jika di tampilan mobile
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && window.innerWidth <= 768) {
        sidebar.classList.remove('active');
    }
};

// --- FUNGSI KONTROL SELEKSI KUIS (KONDUKTOR) ---
window.onQuizSelected = async function(quizId) {
    // 1. Ambil status PRO dan elemen deadline
    const proStatus = await getProStatus();
    const deadlineInput = document.getElementById('set-deadline');

    // Cek apakah elemen deadline ada sebelum memanipulasi classList
    if (deadlineInput) {
        if (!proStatus.isPro) {
            deadlineInput.classList.add('pro-feature-locked');
            deadlineInput.title = "Fitur Premium";
        } else {
            deadlineInput.classList.remove('pro-feature-locked');
            deadlineInput.title = "";
        }
    }

    // 2. Jika tidak ada kuis yang dipilih (Reset UI)
    if (!quizId) {
        const quickActions = document.getElementById('quick-actions-row');
        const securityPanel = document.getElementById('security-panel');
        const questionsList = document.getElementById('questions-list-container');

        if (quickActions) quickActions.classList.add('hidden');
        if (securityPanel) securityPanel.classList.add('hidden');
        if (questionsList) {
            questionsList.innerHTML = '<p style="text-align:center; color:#aaa; padding: 20px;">Pilih kategori untuk melihat soal.</p>';
        }
        return;
    }

    // 3. Munculkan Tombol Akses Cepat jika elemennya ada
    const quickActions = document.getElementById('quick-actions-row');
    if (quickActions) {
        quickActions.classList.remove('hidden');
    }

    // 4. Ambil Data Kuis dari Firebase untuk mengisi form keamanan
    const user = auth.currentUser;
    if (user) {
        database.ref(`users/${user.uid}/quizzes/${quizId}`).once('value', (snapshot) => {
            const quizData = snapshot.val();
            if (quizData) {
                // Set Tipe Akses
                const accessInput = document.getElementById('set-access-type');
                if (accessInput) accessInput.value = quizData.accessType || 'public';

                // Set Password
                const passInput = document.getElementById('set-quiz-password');
                if (passInput) passInput.value = quizData.quizPassword || '';

                // Set Deadline (ID yang sudah kita perbaiki)
                const dLineInput = document.getElementById('set-deadline'); 
                if (dLineInput) dLineInput.value = quizData.deadline || '';
                
                // Jalankan fungsi toggle password jika ada
                if (typeof togglePassInput === "function") {
                    togglePassInput();
                }
                
                // Update Label Nama Kuis
                const quizNameLabel = document.getElementById('current-quiz-name');
                if (quizNameLabel) {
                    quizNameLabel.innerText = quizData.title || "Kuis Dipilih";
                }
            }
        });
    }

    // 5. Jalankan fungsi load soal
    if (typeof loadQuestions === "function") {
        loadQuestions(quizId);
    }
};

// Fungsi untuk mengatur tampilan kolom Sandi Kuis
window.toggleVisibilitySettings = function() {
    const visibilityElement = document.querySelector('input[name="visibility"]:checked');
    if (!visibilityElement) return;

    const visibility = visibilityElement.value;
    const privateSection = document.getElementById('private-settings');
    const passwordInput = document.getElementById('set-quiz-password-baru');

    if (visibility === 'private') {
        privateSection.classList.remove('hidden');
        if (passwordInput) passwordInput.focus();
    } else {
        privateSection.classList.add('hidden');
        // Bersihkan input saat kembali ke Public agar tidak sengaja tersimpan
        if (passwordInput) passwordInput.value = "";
    }
};

window.toggleDurationInput = function() {
    // 1. Ambil Elemen Input
    const mode = document.getElementById('durasi-mode-baru').value;
    const inputVal = document.getElementById('durasi-value-baru');
    
    // 2. Ambil Elemen Teks Info (Helper Text)
    const durationHelper = document.getElementById('duration-helper-text'); // Info di bawah select durasi
    const scheduledHelper = document.getElementById('scheduled-helper-text'); // Info di bawah jadwal
    const deadlineHelper = document.getElementById('deadline-helper-text'); // Info di bawah deadline

    if (mode === 'pr') {
        // --- LOGIKA MODE PR ---
        if (inputVal) {
            inputVal.classList.add('hidden'); // Sembunyikan input menit
            inputVal.value = 0; // Set 0 sebagai tanda non-aktif timer
        }

        // Update Teks Info Durasi
        if (durationHelper) {
            durationHelper.innerHTML = `<i class="fas fa-house-user"></i> <b>Mode PR:</b> Siswa mengerjakan tanpa batasan waktu per soal.`;
            durationHelper.style.color = "#8458B3";
        }

        // Update Teks Info di kolom Jadwal (Opsional agar sinkron)
        if (scheduledHelper) {
            scheduledHelper.innerHTML = `<i class="fas fa-info-circle"></i> Mode PR tidak menggunakan timer soal.`;
        }

    } else {
        // --- LOGIKA MODE PAKAI WAKTU (TIMER) ---
        if (inputVal) {
            inputVal.classList.remove('hidden'); // Munculkan input menit
            inputVal.value = 15; // Nilai default 15 menit
        }

        // Update Teks Info Durasi
        if (durationHelper) {
            durationHelper.innerHTML = `<i class="fas fa-stopwatch"></i> <b>Mode Timer:</b> Setiap soal dibatasi waktu sesuai durasi yang diatur.`;
            durationHelper.style.color = "#888";
        }

        // Update Teks Info di kolom Jadwal (Sesuai permintaan Anda)
        if (scheduledHelper) {
            scheduledHelper.innerHTML = `<i class="fas fa-info-circle"></i> Setiap soal memiliki waktu default sesuai input durasi di atas.`;
        }
    }
};

// 1. FUNGSI SIMPAN PENGATURAN KEAMANAN (FASE 1)
window.updateQuizSecurity = async function() {
    const quizId = document.getElementById('input-kategori').value;
    if (!quizId) return alert("Silakan pilih kuis terlebih dahulu!");

    // Cek status pro untuk fitur tertentu (seperti deadline)
    const proStatus = await getProStatus();
    
    const accessType = document.getElementById('set-access-type').value;
    const quizPassword = document.getElementById('set-quiz-password').value;
    const deadlineValue = document.getElementById('set-deadline').value;

    // Proteksi: Jika bukan Pro tapi mencoba isi deadline
    if (deadlineValue && !proStatus.isPro) {
        alert("🔒 Maaf, fitur Deadline hanya tersedia untuk Member Premium.");
        document.getElementById('set-deadline').value = ""; // Reset value
        return;
    }

    const updates = {
        accessType: accessType,
        quizPassword: accessType === 'private' ? quizPassword : null, // Hapus pass jika balik ke publik
        deadline: deadlineValue || null
    };

    const user = auth.currentUser;
    try {
        // Update di dua tempat (Folder User & Index Utama) agar sinkron
        const updatesData = {};
        updatesData[`users/${user.uid}/quizzes/${quizId}/accessType`] = updates.accessType;
        updatesData[`users/${user.uid}/quizzes/${quizId}/quizPassword`] = updates.quizPassword;
        updatesData[`users/${user.uid}/quizzes/${quizId}/deadline`] = updates.deadline;
        
        // Update juga di quiz_index agar sistem kuis.html bisa mendeteksi tanpa masuk ke folder user
        updatesData[`quiz_index/${quizId}/accessType`] = updates.accessType;
        updatesData[`quiz_index/${quizId}/deadline`] = updates.deadline;

        await database.ref().update(updatesData);
        
        alert("✅ Pengaturan keamanan berhasil disimpan!");
        // Tutup panel setelah simpan
        toggleSecurityPanel(); 
    } catch (error) {
        console.error(error);
        alert("Gagal menyimpan pengaturan.");
    }
};

// Global Variable untuk menyimpan config sementara
window.currentKuisConfig = {};

// 1. Fungsi saat tombol "Buat Kuis Baru" pertama kali diklik
window.bukaConfigKuis = async function() {
    const user = auth.currentUser;
    if (!user) return;

    // 1. Cek Premium SEKALI di awal (Hybrid Check)
    const snap = await database.ref(`users/${user.uid}`).once('value');
    const userData = snap.val();
    const isPremium = userData && (userData.is_premium === true || userData.is_premium === "true");
    const KUIS_DEFAULTS = {
        pgTarget: 20,
        pgPoin: 2,
        essayTarget: 10,
        essayPoin: 5,
        hotsTarget: 0,
    };

    // 2. Simpan status premium ke variable global agar bisa dipakai di langkah berikutnya
    window.isUserPremium = isPremium;

    // 3. Reset form config ke default menggunakan KUIS_DEFAULTS
    document.getElementById('config-pg-target').value    = KUIS_DEFAULTS.pgTarget;
    document.getElementById('config-pg-poin').value      = KUIS_DEFAULTS.pgPoin;
    document.getElementById('config-essay-target').value = KUIS_DEFAULTS.essayTarget;
    document.getElementById('config-essay-poin').value   = KUIS_DEFAULTS.essayPoin;
    document.getElementById('config-hots-target').value  = KUIS_DEFAULTS.hotsTarget;

    // Jangan lupa panggil simulasi agar Bonus HOTS langsung terhitung
    if (typeof window.hitungSimulasiBobot === "function") {
        window.hitungSimulasiBobot();
    }
    
    // 4. Buka Modal Config
    const modalConfig = document.getElementById('modal-config-kuis');
    if(modalConfig) {
        modalConfig.classList.remove('hidden');
        modalConfig.style.display = 'flex';
    }
};

// 2. Fungsi Transisi dari Config ke Detail
window.lanjutKeDetailKuis = function() {
    // 1. Simpan input config ke global variabel (DITAMBAHKAN INPUT ESSAY)
    window.currentKuisConfig = {
        pgPoin: parseFloat(document.getElementById('config-pg-poin').value) || 0,
        pgTarget: parseInt(document.getElementById('config-pg-target').value) || 0,
        
        // --- PERUBAHAN DISINI: Ambil input Essay ---
        essayPoin: parseFloat(document.getElementById('config-essay-poin').value) || 0,
        essayTarget: parseInt(document.getElementById('config-essay-target').value) || 0,
        
        hotsTarget: parseInt(document.getElementById('config-hots-target').value) || 0,
        bonusHots: parseFloat(document.getElementById('config-hots-bonus').value) || 0,
        allowReview: document.getElementById('config-allow-review') ? document.getElementById('config-allow-review').checked : true
    };

    // 2. Tutup Modal Config
    closeModal('modal-config-kuis');

    // 3. Siapkan UI Modal Detail (Logika Premium Mas tetap sama)
    const isPremium = window.isUserPremium; 
    const premiumRow = document.getElementById('premium-row');
    const premiumOverlay = document.getElementById('premium-overlay');
    const durModeInput = document.getElementById('durasi-mode-baru');
    const durValInput = document.getElementById('durasi-value-baru');
    const visibilityRadios = document.getElementsByName('visibility');

    if (!isPremium) {
        if(premiumRow) premiumRow.classList.add('premium-locked');
        if(premiumOverlay) premiumOverlay.style.display = 'flex';
        if(durModeInput) durModeInput.disabled = true;
        if(durValInput) durValInput.disabled = true;
        visibilityRadios.forEach(r => {
            if(r.value === 'private') r.disabled = true;
            if(r.value === 'public') r.checked = true;
        });
    } else {
        if(premiumRow) premiumRow.classList.remove('premium-locked');
        if(premiumOverlay) premiumOverlay.style.display = 'none';
        if(durModeInput) durModeInput.disabled = false;
        if(durValInput) durValInput.disabled = false;
        visibilityRadios.forEach(r => r.disabled = false);
    }

    // 4. Buka Modal Detail
    const modalDetail = document.getElementById('modal-kuis');
    if(modalDetail) {
        modalDetail.classList.remove('hidden');
        modalDetail.style.display = 'flex';
        modalDetail.style.flexDirection = 'column'; 
        modalDetail.style.alignItems = 'center';
        modalDetail.style.justifyContent = 'center';
    }
};

//HITUNG BOBOT NILAI
window.hitungSimulasiBobot = function() {
    // 1. Ambil elemen input
    const elPgP = document.getElementById('config-pg-poin');
    const elPgT = document.getElementById('config-pg-target');
    const elEsP = document.getElementById('config-essay-poin');
    const elEsT = document.getElementById('config-essay-target');
    const elHtT = document.getElementById('config-hots-target');
    const elHtB = document.getElementById('config-hots-bonus'); // Input Bonus HOTS (readonly/otomatis)
    const displaySkor = document.getElementById('display-total-skor');
    const btnLanjut = document.getElementById('btn-lanjut-config');

    if (!elPgP || !elPgT) return;

    // 2. Ambil nilai (Jika kosong = 0)
    const pgP = parseFloat(elPgP.value) || 0;
    const pgT = parseInt(elPgT.value) || 0;
    const esP = parseFloat(elEsP.value) || 0;
    const esT = parseInt(elEsT.value) || 0;
    const hotsT = parseInt(elHtT.value) || 0;

    // 3. LOGIKA UTAMA
    // Hitung berapa poin yang sudah terpakai oleh PG dan Essay
    const skorDasar = (pgP * pgT) + (esP * esT);
    
    // Hitung sisa menuju 100
    const sisaPoin = 100 - skorDasar;

    let poinPerHots = 0;
    let totalAkhir = skorDasar;

    // Jika ada target soal HOTS, bagikan sisa poin ke soal-soal tersebut
    if (hotsT > 0) {
        // Hanya hitung jika sisa poin positif (tidak overload)
        if (sisaPoin > 0) {
            poinPerHots = sisaPoin / hotsT;
        }
        totalAkhir = skorDasar + (poinPerHots * hotsT);
    } else {
        // Jika tidak ada soal HOTS, total akhir hanya skor dasar
        totalAkhir = skorDasar;
    }

    // 4. UPDATE UI
    // Tampilkan bonus poin per soal HOTS ke input (buat jadi readonly di HTML agar user tidak bingung)
    if (elHtB) {
        elHtB.value = poinPerHots.toFixed(1); 
    }

    if (displaySkor) {
        const hasilBulat = Math.round(totalAkhir);
        displaySkor.innerText = hasilBulat;

        // Validasi: Tombol aktif HANYA jika total pas 100
        if (hasilBulat === 100) {
            displaySkor.style.color = "#27ae60"; // Hijau
            if (btnLanjut) {
                btnLanjut.disabled = false;
                btnLanjut.style.background = "#8458B3";
                btnLanjut.style.opacity = "1";
                btnLanjut.style.cursor = "pointer";
                btnLanjut.innerHTML = 'Lanjut ke Detail Kuis <i class="fas fa-arrow-right"></i>';
            }
        } else {
            displaySkor.style.color = "#e74c3c"; // Merah
            if (btnLanjut) {
                btnLanjut.disabled = true;
                btnLanjut.style.background = "#ccc";
                btnLanjut.style.opacity = "0.7";
                btnLanjut.style.cursor = "not-allowed";
                btnLanjut.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Skor: ${hasilBulat} (Harus 100)`;
            }
        }
    }

    // Update info teks tambahan jika ada
    const textPoinHots = document.getElementById('text-poin-hots-per-soal');
    if (textPoinHots) textPoinHots.innerText = poinPerHots.toFixed(1);
};

// Jalankan fungsi sekali saat halaman load agar nilai default langsung terhitung
document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('modal-config-kuis')) hitungSimulasiBobot();
});

// PENGUNCI TARGET SOAL
window.updateLiveProgress = function() {
    // 1. Ambil data target dari config global
    const config = window.currentKuisConfig || {};
    const targetPG = parseInt(config.pgTarget) || 0;
    const targetEssay = parseInt(config.essayTarget) || 0;
    const targetHots = parseInt(config.hotsTarget) || 0;

    // 2. Hitung jumlah soal berdasarkan class (Pastikan loadQuestions sudah memberikan class ini)
    const jumlahPGSaatIni = document.querySelectorAll('.soal-pg-item').length;
    const jumlahEssaySaatIni = document.querySelectorAll('.soal-essay-item').length;
    const jumlahHotsSaatIni = document.querySelectorAll('.is-hots-item').length;

    // Ambil tipe yang sedang aktif di form (PG atau Essay)
    const currentType = document.getElementById('current-question-type')?.value || 'pg';
    const isHotsChecked = document.getElementById('input-is-hots')?.checked;

    // 3. Update Visual Guardrail (Status Bar & Info)
    const statusGuardrail = document.getElementById('status-guardrail');
    if (statusGuardrail) {
        const sisaHots = targetHots - jumlahHotsSaatIni;
        const totalTarget = targetPG + targetEssay;
        const totalSaatIni = jumlahPGSaatIni + jumlahEssaySaatIni;
        const persentase = totalTarget > 0 ? (totalSaatIni / totalTarget) * 100 : 0;

        statusGuardrail.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                    <span><i class="fas fa-list-ol"></i> PG: <b>${jumlahPGSaatIni}/${targetPG}</b> | Essay: <b>${jumlahEssaySaatIni}/${targetEssay}</b></span>
                    <span style="color: ${sisaHots <= 0 ? '#27ae60' : '#ff9800'}; font-weight: bold;">
                        <i class="fas fa-fire"></i> HOTS: ${jumlahHotsSaatIni}/${targetHots}
                    </span>
                </div>
                <div style="width: 100%; height: 8px; background: #e0e0e0; border-radius: 10px; overflow: hidden; border: 1px solid #ddd;">
                    <div style="width: ${persentase}%; height: 100%; background: #8458B3; transition: 0.5s; border-radius: 10px;"></div>
                </div>
            </div>
        `;
    }

    // 4. Proteksi Tombol "Simpan Soal" (Bukan Tambah Soal, tapi tombol Submit Form)
    // Kita buat tombol berubah status jika kuota tipe yang dipilih sudah penuh
    const btnSimpan = document.querySelector('#form-soal button[type="submit"]');
    if (btnSimpan) {
        let isFull = false;
        let pesan = "";

        // Cek kuota per tipe
        if (currentType === 'pg' && jumlahPGSaatIni >= targetPG) {
            isFull = true;
            pesan = "Kuota PG Penuh";
        } else if (currentType === 'essay' && jumlahEssaySaatIni >= targetEssay) {
            isFull = true;
            pesan = "Kuota Essay Penuh";
        }

        // Cek tambahan jika user menyalakan toggle HOTS tapi kuota HOTS habis
        if (isHotsChecked && jumlahHotsSaatIni >= targetHots) {
            isFull = true;
            pesan = "Kuota HOTS Penuh";
        }

        if (isFull) {
            btnSimpan.disabled = true;
            btnSimpan.innerHTML = `<i class="fas fa-lock"></i> ${pesan}`;
            btnSimpan.style.background = "#94a3b8"; // Warna abu-abu (disabled)
            btnSimpan.style.cursor = "not-allowed";
        } else {
            btnSimpan.disabled = false;
            btnSimpan.innerHTML = '<i class="fas fa-save"></i> Simpan Soal';
            btnSimpan.style.background = "#8458B3";
            btnSimpan.style.cursor = "pointer";
        }
    }
};

// Tambahkan listener pada toggle HOTS agar tombol langsung update saat di klik
document.getElementById('input-is-hots')?.addEventListener('change', window.updateLiveProgress);

// LOGIKA VISUAL TARGET SOAL

window.updateTargetStats = function() {
    const config = window.currentKuisConfig || {};
    
    // Hitung elemen di layar (Pastikan di loadQuestions sudah ada class ini)
    const countPG = document.querySelectorAll('.soal-pg-item').length;
    const countEssay = document.querySelectorAll('.soal-essay-item').length;
    const countHots = document.querySelectorAll('.is-hots-item').length;

    // Update Angka di Header
    const pgEl = document.getElementById('stat-pg');
    const essayEl = document.getElementById('stat-essay');
    const hotsEl = document.getElementById('stat-hots');

    if (pgEl) pgEl.innerHTML = `<span style="color: ${countPG >= config.pgTarget ? '#27ae60' : '#333'}">${countPG} / ${config.pgTarget || 0}</span>`;
    if (essayEl) essayEl.innerHTML = `<span style="color: ${countEssay >= config.essayTarget ? '#27ae60' : '#333'}">${countEssay} / ${config.essayTarget || 0}</span>`;
    if (hotsEl) hotsEl.innerHTML = `<span style="color: ${countHots >= config.hotsTarget ? '#27ae60' : '#d68100'}">${countHots} / ${config.hotsTarget || 0}</span>`;
};

//------------------------------------------------------------------------------------------------------------------------------

//LOGIKA SWITCH FUNGSI TOMBOL MODAL

let modeEdit = false;
let targetEditId = "";

function persiapanEditKuis(quizId) {
    modeEdit = true;
    targetEditId = quizId;
    const user = auth.currentUser;

    if (!user) return;

    // Ambil data user dulu untuk cek status premium
    database.ref(`users/${user.uid}`).once('value').then(userSnap => {
        const userData = userSnap.val();
        const isPremium = userData ? userData.is_premium : false;

        // Jalankan Update UI Premium DULU
        updatePremiumUI(isPremium);

        // Baru ambil data kuisnya
        return database.ref(`users/${user.uid}/quizzes/${quizId}`).once('value');
    }).then(quizSnap => {
        const data = quizSnap.val();
        if (!data) return;

        // Fungsi pembantu isi value (seperti yang kita bahas sebelumnya agar tidak error null)
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        setVal('nama-kuis-baru', data.title || "");
        setVal('tipe-kuis-baru', data.quizType || "pg");
        setVal('durasi-value-baru', data.duration || 60);
        setVal('set-deadline-baru', data.deadline || "");
        setVal('deskripsi-kuis-baru', data.description || "");
        
        // Logika Visibility
        const visibility = data.visibility || 'public';
        const radioTarget = document.querySelector(`input[name="visibility"][value="${visibility}"]`);
        if (radioTarget) radioTarget.checked = true;
        
        const privArea = document.getElementById('private-settings');
        if (visibility === 'private' && privArea) {
            privArea.classList.remove('hidden');
            setVal('set-quiz-password-baru', data.quizPassword || "");
        }

        // Update UI Tombol
        const modalTitle = document.querySelector('#modal-kuis h2');
        if (modalTitle) modalTitle.innerHTML = `<i class="fas fa-edit"></i> Edit Pengaturan Kuis`;
        
        const btnSimpan = document.querySelector('.btn-buat');
        if (btnSimpan) {
            btnSimpan.innerText = "Update Perubahan";
            btnSimpan.setAttribute('onclick', 'simpanPerubahanKuis()');
        }

        // TAMPILKAN MODAL TERAKHIR
        const modalKuis = document.getElementById('modal-kuis');
        if (modalKuis) modalKuis.style.display = 'block';
    }).catch(err => {
        console.error("Error persiapan edit:", err);
    });
}

//FUNGSI PEMICU UPDATE KUIS

function simpanPerubahanKuis() {
    if (!targetEditId) return;
    const userId = auth.currentUser.uid;
    
    // Fungsi pembantu ambil value aman
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : "";
    };

    const updatedData = {
        title: getVal('nama-kuis-baru'),
        quizType: getVal('tipe-kuis-baru'),
        duration: parseInt(getVal('durasi-value-baru')) || 60,
        deadline: getVal('set-deadline-baru'),
        description: getVal('deskripsi-kuis-baru'),
        last_updated: firebase.database.ServerValue.TIMESTAMP // Tambahkan ini agar tahu kapan terakhir diedit
    };

    // Tambahkan visibility
    const vis = document.querySelector('input[name="visibility"]:checked');
    if(vis) updatedData.visibility = vis.value;

    const pass = getVal('set-quiz-password-baru');
    if(pass) updatedData.quizPassword = pass;

    database.ref(`users/${userId}/quizzes/${targetEditId}`).update(updatedData)
    .then(() => {
        // Update juga di quiz_index agar sinkron di beranda
        database.ref(`quiz_index/${targetEditId}`).update({
            title: updatedData.title,
            quizType: updatedData.quizType,
            duration: updatedData.duration,
            deadline: updatedData.deadline,
            visibility: updatedData.visibility
        });

        showNotif("Berhasil", "Pengaturan kuis diperbarui!");
        if(typeof closeModalKuis === 'function') closeModalKuis();
        resetModalKeDefault(); 
        
        // Refresh dashboard kuis
        if(typeof loadUserQuizzes === 'function') loadUserQuizzes();
    })
    .catch(err => {
        console.error(err);
        showNotif("Gagal", "Gagal memperbarui kuis.");
    });
}

// Fungsi tambahan agar saat buka modal "Tambah Kuis" lagi, tampilannya tidak "Edit"
function resetModalKeDefault() {
    modeEdit = false;
    targetEditId = "";

    // 1. Kembalikan Teks Header & Tombol
    const modalTitle = document.querySelector('#modal-kuis h2');
    if (modalTitle) modalTitle.innerHTML = `<i class="fas fa-plus-circle"></i> Tambah Kuis Baru`;
    
    const btnSimpan = document.querySelector('.btn-buat');
    if (btnSimpan) {
        btnSimpan.innerText = "Buat Sekarang";
        btnSimpan.setAttribute('onclick', 'simpanKuisBaru()');
    }

    // 2. Kosongkan Semua Input Form
    const inputs = [
        'nama-kuis-baru', 
        'durasi-value-baru', 
        'set-deadline-baru', 
        'set-quiz-password-baru', 
        'deskripsi-kuis-baru'
    ];
    
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    // 3. Kembalikan Select ke Default
    const tipeKuis = document.getElementById('tipe-kuis-baru');
    if (tipeKuis) tipeKuis.value = "pg";

    // 4. Sembunyikan field password jika sebelumnya terbuka
    const privateSettings = document.getElementById('private-settings');
    if (privateSettings) privateSettings.classList.add('hidden');
    
    // Reset radio button visibility ke Public
    const radioPublic = document.querySelector('input[name="visibility"][value="public"]');
    if (radioPublic) radioPublic.checked = true;
}

function updatePremiumUI(isPremium) {
    // Pastikan isPremium benar-benar boolean
    // Jika isPremium bernilai "true" (string), dia akan dikonversi ke true (boolean)
    const statusPremium = String(isPremium) === 'true' || isPremium === true;

    const premiumRow = document.getElementById('premium-row');
    const premiumOverlay = document.getElementById('premium-overlay');
    const durModeInput = document.getElementById('durasi-mode-baru');
    const durValInput = document.getElementById('durasi-value-baru');
    const visibilityRadios = document.getElementsByName('visibility');

    console.log("Status Premium User:", statusPremium); // Cek di console untuk memastikan statusnya

    if (!statusPremium) {
        // --- LOGIKA NON-PREMIUM (TERKUNCI) ---
        if(premiumRow) premiumRow.classList.add('premium-locked');
        if(premiumOverlay) {
            premiumOverlay.style.setProperty('display', 'flex', 'important');
        }
        
        if(durModeInput) durModeInput.disabled = true;
        if(durValInput) durValInput.disabled = true;
        
        visibilityRadios.forEach(r => {
            if(r.value === 'private') r.disabled = true;
            if(r.value === 'public') r.checked = true;
        });
    } else {
        // --- LOGIKA PREMIUM (TERBUKA) ---
        if(premiumRow) premiumRow.classList.remove('premium-locked');
        
        if(premiumOverlay) {
            premiumOverlay.style.setProperty('display', 'none', 'important');
        }
        
        if(durModeInput) durModeInput.disabled = false;
        if(durValInput) durValInput.disabled = false;
        
        visibilityRadios.forEach(r => {
            r.disabled = false;
        });
    }
}

//------------------------------------------------------------------------------------------------------------------------------

//MODAL EDIT SOAL
// Variabel penyimpan ID soal yang sedang diedit di modal simple
// Deklarasikan semua variabel global di paling atas file!
let quillEditorEdit = null; 
let urlGambarEdit = "";
let currentSimpleEditId = "";
let uploadedPhotos = []; // Pastikan ini juga ada di atas
const MAX_PHOTOS = 3;

// Jalankan ini saat halaman load atau sebelum modal pertama kali dibuka
function initQuillEdit() {
    if (!quillEditorEdit) {
        quillEditorEdit = new Quill('#edit-quill-editor', {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    [{ 'color': [] }],
                    ['clean']
                ]
            }
        });
    }
}

// Inisialisasi Quill
var quill = new Quill('#editor-container', {
    theme: 'snow',
    placeholder: 'Ketik soal di sini...',
    modules: {
        toolbar: [
            ['bold', 'italic', 'underline'],
            [{ 'color': [] }, { 'background': [] }], // Tambahkan warna teks & background teks
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            ['clean']
        ]
    }
});

// Tambahkan ini tepat di bawah inisialisasi Quill Mas
quill.on('text-change', function() {
    // 1. Sinkronkan isi editor ke input hidden agar bisa disimpan ke database
    const questionText = document.getElementById('question_text');
    if (questionText) {
        questionText.value = quill.root.innerHTML;
    }

    // 2. Jalankan Live Preview ke tampilan HP
    if (typeof window.updateLivePreview === 'function') {
        window.updateLivePreview();
    }
});


// SINKRONISASI: Copy dari Quill ke Textarea Tersembunyi
quill.on('text-change', function() {
    var html = quill.root.innerHTML;
    
    // Jika editor kosong, bersihkan textarea agar validasi 'required' berfungsi
    if (quill.getText().trim().length === 0) {
        document.getElementById('input-soal').value = "";
    } else {
        document.getElementById('input-soal').value = html;
    }
});

//------------------------------------------------------------------------------------------------------------------------------

// 1. Fungsi Buka Modal & Isi Data (VERSI FIX)
window.bukaModalEditSimple = function(soalId) {
    currentSimpleEditId = soalId;
    initQuillEdit(); // Pastikan Quill siap

    const userId = auth.currentUser.uid;
    const quizId = window.activeQuizId || document.getElementById('input-kategori').value;

    if(!quizId) return alert("Kuis tidak ditemukan");

    database.ref(`users/${userId}/quizzes/${quizId}/questions/${soalId}`).once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // --- 1. Masukkan Teks ke Quill ---
        quillEditorEdit.root.innerHTML = data.question || "";

        // --- 2. Cek Gambar Soal ---
        // Pastikan ID ini sesuai dengan yang ada di HTML Modal Edit Mas
        const previewCont = document.getElementById('edit-image-preview-container');
        const previewImg = document.getElementById('edit-image-preview');
        
        if (data.image && data.image !== "") {
            urlGambarEdit = data.image; // Simpan URL lama ke variabel global edit
            if(previewImg) previewImg.src = data.image;
            if(previewCont) previewCont.style.display = 'block';
        } else {
            urlGambarEdit = "";
            if(previewCont) previewCont.style.display = 'none';
        }

        // --- 3. Logika Tipe Soal (DENGAN DEFINISI VARIABEL) ---
        const areaPG = document.getElementById('area-edit-pg');
        const areaEssay = document.getElementById('area-edit-essay');

        if (data.type === 'pg' || data.type === 'pilihan_ganda') {
            if(areaPG) areaPG.style.display = 'block';
            if(areaEssay) areaEssay.style.display = 'none';
            
            // Isi Opsi A-D
            if (data.options) {
                data.options.forEach((opt, idx) => {
                    const el = document.getElementById(`edit-opt-${idx}`);
                    if (el) el.value = opt;
                });
            }
            // Set Kunci Jawaban
            const kunciPG = document.getElementById('edit-simple-kunci-pg');
            if(kunciPG) kunciPG.value = data.answer;

        } else {
            if(areaPG) areaPG.style.display = 'none';
            if(areaEssay) areaEssay.style.display = 'block';
            
            const kunciEssay = document.getElementById('edit-simple-kunci-essay');
            if(kunciEssay) kunciEssay.value = data.answer;
        }

        // --- 4. Tampilkan Modal ---
        document.getElementById('modal-edit-soal-simple').style.display = 'block';
    });
};

// 2. Fungsi Tutup Modal
window.tutupModalEditSimple = function() {
    document.getElementById('modal-edit-soal-simple').style.display = 'none';
};

// 3. Fungsi Eksekusi Simpan Perubahan (Versi Dinamis & Fix Opsi Hantu)
window.simpanPerubahanSoalSimple = function() {
    const userId = auth.currentUser ? auth.currentUser.uid : null;
    const quizId = window.activeQuizId || document.getElementById('input-kategori').value;
    
    if (!userId || !quizId || !currentSimpleEditId) {
        return showNotif("Error", "Data tidak lengkap, gagal memperbarui.");
    }

    const areaPG = document.getElementById('area-edit-pg');
    const isPG = areaPG && areaPG.style.display === 'block';
    
    // --- 1. AMBIL KONTEN PERTANYAAN (Gunakan variabel yang benar) ---
    let questionContent;
    const editor = window.quillEditorEdit || quillEditorEdit; // Cek kedua kemungkinan variabel

    if (editor) { 
        questionContent = editor.root.innerHTML;
        if (editor.getText().trim().length === 0) {
            return showNotif("Peringatan", "Pertanyaan tidak boleh kosong!");
        }
    } else {
        const txtArea = document.getElementById('edit-simple-pertanyaan');
        questionContent = txtArea ? txtArea.value : "";
        if (!questionContent.trim()) return showNotif("Peringatan", "Pertanyaan tidak boleh kosong!");
    }

    // --- 2. SUSUN DATA ---
    let updatedData = {
        question: questionContent,
        image: urlGambarEdit || "", // Menggunakan variabel global yang diupdate saat upload/hapus
        updated_at: firebase.database.ServerValue.TIMESTAMP
    };

    // --- 3. LOGIKA TIPE SOAL ---
    if (isPG) {
        const opts = [];
        // Kita ambil manual berdasarkan ID edit-opt-0 sampai 3
        for (let i = 0; i < 4; i++) {
            const input = document.getElementById(`edit-opt-${i}`);
            if (input && input.value.trim() !== "") {
                opts.push(input.value.trim());
            }
        }

        if (opts.length < 2) {
            return showNotif("Peringatan", "Minimal harus ada 2 opsi jawaban!");
        }

        updatedData.options = opts;
        updatedData.answer = parseInt(document.getElementById('edit-simple-kunci-pg').value);
    } else {
        const answerEssay = document.getElementById('edit-simple-kunci-essay').value;
        if (!answerEssay.trim()) {
            return showNotif("Peringatan", "Kunci jawaban essay wajib diisi!");
        }
        updatedData.answer = answerEssay;
    }

    // --- 4. EKSEKUSI KE FIREBASE ---
    database.ref(`users/${userId}/quizzes/${quizId}/questions/${currentSimpleEditId}`)
    .update(updatedData)
    .then(() => {
        showNotif("Berhasil", "Soal telah diperbarui!");
        tutupModalEditSimple();
        
        // REFRESH DATA (Penting!)
        if (window.loadQuestions) window.loadQuestions(quizId);
        if (window.updateLiveProgress) window.updateLiveProgress();
    })
    .catch(err => {
        console.error("Update Error:", err);
        showNotif("Gagal", "Terjadi kesalahan saat menyimpan.");
    });
};

// Baru setelah itu fungsi-fungsinya...
function initQuillEdit() {
    const editorElem = document.getElementById('edit-quill-editor');
    if (!editorElem) return;

    if (quillEditorEdit === null) {
        quillEditorEdit = new Quill('#edit-quill-editor', {
            theme: 'snow',
            modules: {
                toolbar: [['bold', 'italic', 'underline'], [{ 'color': [] }], ['clean']]
            }
        });
    }
}

// Fungsi untuk menghapus gambar saat sedang di MODAL EDIT
window.hapusGambarEdit = function() {
    // 1. Kosongkan variabel global penampung gambar edit
    urlGambarEdit = "";

    // 2. Sembunyikan preview di UI
    const previewCont = document.getElementById('edit-image-preview-container');
    const previewImg = document.getElementById('edit-image-preview');
    
    if (previewImg) previewImg.src = "";
    if (previewCont) previewCont.style.display = 'none';

    // 3. Reset input file agar bisa pilih gambar yang sama lagi jika berubah pikiran
    const inputFile = document.getElementById('edit-input-image');
    if (inputFile) inputFile.value = "";

    showNotif("Info", "Gambar soal dihapus (Klik Update untuk menyimpan)");
};

// Sinkronisasi Upload Gambar di Modal Edit
async function handleImageEdit(input) {
    const file = input.files[0];
    if (!file) return;

    try {
        // Gunakan fungsi kompresi yang sama dengan upload soal baru
        const imageUrl = await compressAndUploadImage(file);
        
        if (imageUrl) {
            urlGambarEdit = imageUrl; // <--- SINKRONKAN DISINI

            const previewCont = document.getElementById('edit-image-preview-container');
            const previewImg = document.getElementById('edit-image-preview');
            
            if (previewImg) previewImg.src = imageUrl;
            if (previewCont) previewCont.style.display = 'block';

            showNotif("Sukses", "Gambar baru siap di-update!");
        }
    } catch (err) {
        showNotif("Gagal", "Gagal upload gambar.");
    }
    input.value = ""; 
} //2949

// --- FIX: NAMA FUNGSI DISAMAKAN DENGAN DI HTML ---
async function handleImageSoal(input) {
    const file = input.files[0];
    if (!file) return;

    // Elemen UI Progress
    const progCont = document.getElementById('upload-progress-container');
    const progBar = document.getElementById('upload-progress-bar');
    const progText = document.getElementById('upload-status-text');

    try {
        if (progCont) progCont.style.display = 'block';

        // Panggil upload dengan callback progress (asumsi fungsi compressAndUploadImage mendukung ini)
        const imageUrl = await compressAndUploadImage(file, (percent) => {
            if (progBar) progBar.style.width = percent + '%';
            if (progText) progText.innerText = `Mengunggah: ${Math.round(percent)}%`;
        });
        
        if (imageUrl) {
            uploadedPhotos.push(imageUrl);
            renderPhotoPreviews();
            updateUploadButton();
            showNotif("Sukses", "Gambar berhasil diunggah!");
        }
    } catch (err) {
        showNotif("Gagal", "Gagal mengunggah gambar.");
    } finally {
        // Sembunyikan kembali setelah selesai/gagal
        setTimeout(() => {
            if (progCont) progCont.style.display = 'none';
            if (progBar) progBar.style.width = '0%';
        }, 2000);
    }
    input.value = "";
} //3144


async function handleImageEdit(input) {
    const file = input.files[0];
    if (!file) return;

    try {
        // Tampilkan loading jika perlu
        const imageUrl = await compressAndUploadImage(file);
        
        if (imageUrl) {
            // Kita simpan ke variabel khusus Edit, bukan array uploadedPhotos
            urlGambarEdit = imageUrl; 

            // Update Preview khusus di dalam Modal Edit
            const previewCont = document.getElementById('edit-image-preview-container');
            const previewImg = document.getElementById('edit-image-preview');
            
            if (previewImg) previewImg.src = imageUrl;
            if (previewCont) previewCont.style.display = 'block';

            showNotif("Sukses", "Gambar soal berhasil diperbarui!");
        }
    } catch (err) {
        console.error("Edit Image Error:", err);
        showNotif("Gagal", "Gagal mengupload gambar baru.");
    }
    
    input.value = ""; 
} //3064

async function handleImageEdit(input) {
    const file = input.files[0];
    if (!file) return;

    try {
        // Gunakan fungsi kompresi yang sama dengan upload soal baru
        const imageUrl = await compressAndUploadImage(file);
        
        if (imageUrl) {
            urlGambarEdit = imageUrl; // <--- SINKRONKAN DISINI

            const previewCont = document.getElementById('edit-image-preview-container');
            const previewImg = document.getElementById('edit-image-preview');
            
            if (previewImg) previewImg.src = imageUrl;
            if (previewCont) previewCont.style.display = 'block';

            showNotif("Sukses", "Gambar baru siap di-update!");
        }
    } catch (err) {
        showNotif("Gagal", "Gagal upload gambar.");
    }
    input.value = ""; 
}//3036


//------------------------------------------------------------------------------------------------------------------------------

// Fungsi untuk "Gembok" atau "Buka" form pembuat soal
window.toggleFormInput = function(isDisabled) {
    const form = document.getElementById('form-soal');
    if (!form) return;

    // Ambil semua elemen input, select, dan button di dalam form
    const elements = form.querySelectorAll('input, textarea, select, button');
    
    elements.forEach(el => {
        // Tombol Simpan diberikan perlakuan khusus agar visualnya jelas
        if (el.classList.contains('cta-button')) {
            el.style.opacity = isDisabled ? "0.6" : "1";
            el.style.cursor = isDisabled ? "not-allowed" : "pointer";
            el.style.filter = isDisabled ? "grayscale(1)" : "none";
            el.innerHTML = isDisabled ? '<i class="fas fa-lock"></i> Kuota Sesuai Config Terpenuhi' : '<i class="fas fa-save"></i> Simpan ke Daftar Soal';
        }
        
        // Disable elemennya
        el.disabled = isDisabled;
    });

    // Jika nanti Mas pakai Quill, tambahkan ini:
    if (window.quillEditor) {
        window.quillEditor.enable(!isDisabled);
        const toolbar = document.querySelector('.ql-toolbar');
        if(toolbar) toolbar.style.opacity = isDisabled ? "0.5" : "1";
        if(toolbar) toolbar.style.pointerEvents = isDisabled ? "none" : "auto";
    }
};

window.checkQuotaAndLock = async function(quizId) {
    if (!quizId) return;

    const userId = auth.currentUser.uid;
    // Ambil config yang sedang aktif di memori
    const config = window.currentKuisConfig || {};
    
    try {
        const snap = await database.ref(`users/${userId}/quizzes/${quizId}/questions`).once('value');
        const questions = snap.val() || {};
        const questionsArray = Object.values(questions);

        const countPG = questionsArray.filter(q => q.type === 'pg').length;
        const countEssay = questionsArray.filter(q => q.type === 'essay').length;

        const targetPG = parseInt(config.pgTarget) || 0;
        const targetEssay = parseInt(config.essayTarget) || 0;

        // Form dikunci HANYA JIKA kedua tipe soal (PG & Essay) sudah mencapai atau melebihi target
        // Jika salah satu masih ada slot, biarkan terbuka
        if (countPG >= targetPG && countEssay >= targetEssay) {
            window.toggleFormInput(true);
        } else {
            window.toggleFormInput(false);
        }
    } catch (error) {
        console.error("Gagal cek kuota:", error);
    }
};


//------------------------------------------------------------------------------------------------------------------------------

// UPLOAD FOTO SOAL


function renderPhotoPreviews() {
    const container = document.getElementById('preview-list');
    const countEl = document.getElementById('current-photo-count');
    
    // Safety check agar tidak error jika elemen tidak ditemukan
    if (!container || !countEl) return;

    container.innerHTML = '';
    countEl.innerText = uploadedPhotos.length;

    // PASTIKAN MENGGUNAKAN uploadedPhotos, BUKAN questions
    uploadedPhotos.forEach((url, index) => {
        const item = document.createElement('div');
        item.style = "position: relative; width: 80px; height: 80px;";
        item.innerHTML = `
            <img src="${url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #8458B3;">
            <button onclick="hapusFoto(${index})" style="position: absolute; top: -5px; right: -5px; background: #e11d48; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 10px;">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(item);
    });
}

function hapusFoto(index) {
    window.uploadedPhotos.splice(index, 1); // Hapus dari array global
    if (typeof uploadedPhotos !== 'undefined') uploadedPhotos = window.uploadedPhotos;

    renderPhotoPreviews(); // Update list kecil di bawah tombol upload
    updateUploadButton();  // Update status tombol (buka gembok jika tadi penuh)
    
    // TAMBAHKAN INI: Agar di mockup HP juga terhapus
    window.updateLivePreview(); 
}

function updateUploadButton() {
    const labelBtn = document.getElementById('btn-upload-label');
    const inputBtn = document.getElementById('image-upload');

    if (uploadedPhotos.length >= MAX_PHOTOS) {
        labelBtn.style.background = "#f1f5f9";
        labelBtn.style.color = "#94a3b8";
        labelBtn.style.borderColor = "#cbd5e1";
        labelBtn.style.cursor = "not-allowed";
        labelBtn.innerHTML = `<i class="fas fa-lock"></i> Kuota Foto Habis`;
        inputBtn.disabled = true;
    } else {
        labelBtn.style.background = "white";
        labelBtn.style.color = "#8458B3";
        labelBtn.style.borderColor = "#8458B3";
        labelBtn.style.cursor = "pointer";
        labelBtn.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> Unggah Gambar (${MAX_PHOTOS - uploadedPhotos.length} Sisa)`;
        inputBtn.disabled = false;
    }
}

// Letakkan di bagian atas admin-script.js
let kuisPhotosTracker = []; // Gunakan ini untuk melacak total gambar di satu kuis

// --- 1. FUNGSI PEMBATASAN & UPLOAD GAMBAR ---
async function handleImageSoal(input) {
    const file = input.files[0];
    if (!file) return;

    // Pastikan variabel global siap
    if (!window.uploadedPhotos) window.uploadedPhotos = [];

    // Gunakan fungsi penghitung global
    const totalGambarTerpakai = typeof hitungTotalGambarKuis === 'function' 
        ? hitungTotalGambarKuis() 
        : window.uploadedPhotos.length; 

    if (totalGambarTerpakai >= 3) {
        showNotif("Gagal", "Batas maksimal kuis ini adalah 3 gambar.");
        input.value = ""; 
        return;
    }

    const progCont = document.getElementById('upload-progress-container');
    const progBar = document.getElementById('upload-progress-bar');

    try {
        if (progCont) progCont.style.display = 'block';

        const imageUrl = await compressAndUploadImage(file, (percent) => {
            if (progBar) progBar.style.width = percent + '%';
        });
        
        if (imageUrl) {
            // SIMPAN KE GLOBAL AGAR DIBACA PREVIEW
            window.uploadedPhotos.push(imageUrl);
            
            // PENTING: Jika Mas punya variabel lokal 'uploadedPhotos', sinkronkan juga
            if (typeof uploadedPhotos !== 'undefined' && uploadedPhotos !== window.uploadedPhotos) {
                uploadedPhotos = window.uploadedPhotos;
            }

            renderPhotoPreviews();
            updateUploadButton();
            
            // Jalankan Preview
            window.updateLivePreview(); 

            showNotif("Sukses", "Gambar berhasil diunggah!");
        }
    } catch (err) {
        showNotif("Gagal", "Gagal mengunggah gambar.");
    } finally {
        if (progCont) progCont.style.display = 'none';
        input.value = ""; 
    }
}

function hitungTotalGambarKuis() {
    let total = 0;
    
    // 1. Hitung gambar dari semua soal yang sudah tersimpan di memori/daftar kuis
    // (Asumsi Mas punya variabel 'daftarSoal' atau sejenisnya)
    if (window.questionsList && Array.isArray(window.questionsList)) {
        window.questionsList.forEach(soal => {
            if (soal.photos && Array.isArray(soal.photos)) {
                total += soal.photos.length;
            }
        });
    }
    
    // 2. Tambahkan dengan gambar yang sedang ada di form (yang belum disimpan ke daftar)
    if (window.uploadedPhotos) {
        total += window.uploadedPhotos.length;
    }
    
    return total;
}

window.updateLivePreview = function() {
    // 1. Teks Soal
    const editorContent = document.querySelector('#editor-container .ql-editor');
    const previewSoalText = document.getElementById('preview-question');
    
    if (previewSoalText) {
        if (editorContent && editorContent.innerText.trim() !== "") {
            previewSoalText.innerHTML = editorContent.innerHTML;
        } else {
            previewSoalText.innerText = "Pertanyaan akan muncul di sini...";
        }
    }

    // 2. Gambar Soal
    let previewImgCont = document.getElementById('preview-soal-images');
    if (!previewImgCont && previewSoalText) {
        previewImgCont = document.createElement('div');
        previewImgCont.id = 'preview-soal-images';
        // Letakkan SEBELUM teks soal (di atas)
        previewSoalText.parentNode.insertBefore(previewImgCont, previewSoalText);
    }

    // Tambahkan baris ini di dalam window.updateLivePreview bagian Gambar Soal
    if (previewImgCont) {
        previewImgCont.innerHTML = ""; 
        const fotoTersedia = window.uploadedPhotos || [];
        
        if (fotoTersedia.length > 0) {
            // ... (kode looping img Mas sudah benar) ...
            previewImgCont.style.display = "block";
        } else {
            // PASTIKAN INI ADA
            previewImgCont.style.display = "none";
            previewImgCont.innerHTML = ""; 
        }
    }

    // 3. Opsi PG
    const previewOptionsCont = document.getElementById('preview-options-list');
    if (previewOptionsCont) {
        previewOptionsCont.innerHTML = "";
        const allInputs = document.querySelectorAll('.opt-value');
        allInputs.forEach((input, index) => {
            if (input.value.trim() !== "") {
                const char = String.fromCharCode(65 + index);
                const item = document.createElement('div');
                item.className = 'preview-option-item';
                item.style = "padding:10px 14px; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:8px; font-size:0.8rem; background:#fff; color:#333; font-weight:500;";
                item.innerText = `${char}. ${input.value}`;
                previewOptionsCont.appendChild(item);
            }
        });
    }
};

window.initLivePreview = function() {
    // Jalankan preview saat ada input di dalam form-soal (termasuk .opt-value)
    const formSoal = document.getElementById('form-soal');
    if (formSoal) {
        formSoal.addEventListener('input', (e) => {
            window.updateLivePreview();
        });
    }
    // Jalankan sekali di awal
    window.updateLivePreview();
};

// --- 3. PEMASANGAN LISTENER (AGAR OTOMATIS SAAT DIKETIK) ---
// Jalankan ini di dalam fungsi initDashboard atau initLivePreview Mas
function aktifkanLivePreview() {
    const soalInput = document.getElementById('soal-text');
    if (soalInput) {
        soalInput.addEventListener('input', updateLivePreview);
    }

    // Gunakan delegasi untuk menangkap input di semua kolom pilihan
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('opt-value')) {
            updateLivePreview();
        }
    });
}






