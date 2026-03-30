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

        const sortedQuizzes = Object.entries(data).reverse();

        sortedQuizzes.forEach(([quizId, quizData]) => {
            const date = quizData.created_at ? new Date(quizData.created_at).toLocaleDateString('id-ID') : '-';
            const title = quizData.title || "Kuis Tanpa Judul";
            const description = quizData.desc || 'Tantang dirimu dengan kuis ini!';
            
            const isPrivate = quizData.visibility === 'private';
            
            // 1. LOGIKA TAMPILAN PASSWORD
            // 1. LOGIKA TOMBOL KUNCI INTERAKTIF
            const passwordBadge = (isPrivate && quizData.quizPassword) 
                ? `
                <div id="pw-wrapper-${quizId}" onclick="event.stopPropagation(); togglePasswordView('${quizId}', '${quizData.quizPassword}')" 
                    style="display:inline-flex; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; padding:4px 8px; border-radius:6px; cursor:pointer; transition: all 0.3s ease; max-width: 32px; overflow: hidden; white-space: nowrap;" 
                    title="Klik untuk lihat sandi">
                    <i class="fas fa-key" style="color:#64748b; font-size:0.7rem; flex-shrink:0;"></i>
                    <span id="pw-text-${quizId}" style="margin-left:8px; font-size:0.7rem; font-weight:700; color:#c2410c; opacity:0; transition: opacity 0.2s;">
                        ${quizData.quizPassword}
                    </span>
                </div>
                `
                : '';

            const visibilityBadge = isPrivate 
                ? `<span class="badge-status private" style="background:#f1f5f9; color:#64748b; padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:600; border:1px solid #e2e8f0;">
                    <i class="fas fa-lock"></i> Privat
                   </span>`
                : `<span class="badge-status public" style="background:#f0fdf4; color:#16a34a; padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:600; border:1px solid #dcfce7;">
                    <i class="fas fa-globe"></i> Publik
                   </span>`;

            const typeLabel = (quizData.quizType || 'pg').toUpperCase();

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
    });
}

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

// 8. FITUR SIMPAN SOAL KE FIREBASE (DENGAN PEMBATASAN TARGET CONFIG)
const formSoal = document.getElementById('form-soal');
if (formSoal) {
    formSoal.addEventListener('submit', async function(e) {
        e.preventDefault(); 
        
        const quizId = document.getElementById('input-kategori').value;
        if (!quizId) return showNotif("Peringatan", "Pilih kuis terlebih dahulu!");

        // --- 1. AMBIL CONFIG DARI GLOBAL VARIABLE ---
        const config = window.currentKuisConfig || {};
        const currentType = document.getElementById('current-question-type')?.value || 'pg';
        
        // --- 2. LOGIKA PEMBATASAN SOAL (PENGUNCI) ---
        // Menghitung jumlah soal berdasarkan class item yang ada di daftar bawah (UI)
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
        }

        const questionText = document.getElementById('input-soal').value;
        if (!questionText.trim()) return showNotif("Peringatan", "Pertanyaan tidak boleh kosong!");

        // --- 3. SUSUN DATA & HITUNG POIN OTOMATIS ---
        const poinDasar = (currentType === 'pg') ? (parseFloat(config.pgPoin) || 0) : (parseFloat(config.essayPoin) || 0);
        const isHots = document.getElementById('input-is-hots').checked;
        
        // Tambahkan bonus poin jika HOTS (ambil dari config)
        const bonusHots = isHots ? (parseFloat(config.bonusHots) || 0) : 0;
        const poinFinal = ((currentType === 'pg' ? parseFloat(config.pgPoin) : parseFloat(config.essayPoin)) || 0) + bonusHots;

        let soalData = {
            question: questionText,
            type: currentType,
            isHots: isHots, // Simpan penanda HOTS
            poin: poinFinal, // Poin yang sudah ditambah bonus
            created_at: firebase.database.ServerValue.TIMESTAMP
        };

        if (currentType === 'essay') {
            const answerText = document.getElementById('input-kunci-essay').value;
            if (!answerText.trim()) return showNotif("Peringatan", "Kunci jawaban essay wajib diisi!");
            soalData.answer = answerText;
        } else {
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

        // --- 4. SIMPAN KE FIREBASE ---
        const userId = auth.currentUser.uid;
        const questionsRef = database.ref(`users/${userId}/quizzes/${quizId}/questions`);

        questionsRef.push(soalData)
        .then(() => {
            const hotsToggle = document.getElementById('input-is-hots');
            if(hotsToggle) hotsToggle.checked = false;

            return questionsRef.once('value');
        })
        .then((snapshot) => {
            const totalSoal = snapshot.numChildren();
            
            const isReady = totalSoal >= (parseInt(config.pgTarget) || 1);

            let updates = {
                lastUpdated: firebase.database.ServerValue.TIMESTAMP,
                hasQuestions: totalSoal > 0,
                is_ready: isReady
            };
            
            database.ref(`users/${userId}/quizzes/${quizId}`).update(updates);
            database.ref(`quiz_index/${quizId}`).update(updates);

            showNotif("Berhasil", `Soal disimpan. (${totalSoal} soal terdaftar)`);
            
            // --- RESET FORM (TETAP SEPERTI KODE ASLI MAS) ---
            document.getElementById('input-soal').value = "";
            const kunciEssay = document.getElementById('input-kunci-essay');
            if(kunciEssay) kunciEssay.value = "";

            optionCount = 0; 
            const containerOpsi = document.getElementById('dynamic-options-container');
            const selectJawaban = document.getElementById('input-jawaban');
            
            if (containerOpsi) containerOpsi.innerHTML = ""; 
            if (selectJawaban) selectJawaban.innerHTML = '<option value="">-- Pilih Jawaban Benar --</option>';

            window.addOptionField(); 
            window.addOptionField();

            if (window.updateLiveProgress) window.updateLiveProgress(); 
            if (window.loadQuestions) window.loadQuestions(quizId);
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
    
};

// 9. FUNGSI SHARE (BAGIAN PERBAIKAN UTAMA)
window.copyShareLink = function(quizId) {
    // 1. Ambil user yang sedang login saat ini
    const user = firebase.auth().currentUser;
    
    // Keamanan: Jika user tidak login, gunakan fallback atau beri peringatan
    if (!user) {
        alert("Sesi login berakhir. Silakan refresh halaman.");
        return;
    }

    // 2. Buat URL dengan parameter id DAN author (UID Anda)
    // Menggunakan window.location.origin + '/kuis.html' lebih aman daripada .replace()
    const shareUrl = `${window.location.origin}/kuis.html?id=${quizId}&author=${user.uid}`;
    
    const text = `Ayo kerjakan kuis ini di Kuisia!`;

    // 3. Update UI Modal Share
    document.getElementById('share-quiz-name').innerText = "Bagikan Kuis";
    document.getElementById('share-link-input').value = shareUrl;
    
    document.getElementById('share-wa').href = `https://wa.me/?text=${encodeURIComponent(text + "\n" + shareUrl)}`;
    document.getElementById('share-fb').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    document.getElementById('share-tw').href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;

    document.getElementById('modal-share').style.display = 'block';
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

// 10. FUNGSI UPDATE STATISTIK (CHART DAN STATISTIK)
window.updateStatistics = function() {
    const userId = auth.currentUser.uid;
    const dbRef = database.ref(`users/${userId}/quizzes`);

    dbRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        let totalQuizzes = 0;
        let totalParticipants = 0;
        let allScores = [];
        let kategoriCount = {};
        let trendDataPoints = [0, 0, 0, 0, 0, 0, 0]; // 7 hari terakhir
        const now = new Date().getTime();

        // 1. SATU LOOP UNTUK SEMUA DATA
        Object.values(data).forEach(quiz => {
            totalQuizzes++;
            let cat = quiz.category || "Umum";
            kategoriCount[cat] = (kategoriCount[cat] || 0) + 1;

            if (quiz.results) {
                Object.values(quiz.results).forEach(res => {
                    // Statistik Skor
                    if (res.score !== undefined) allScores.push(res.score);
                    totalParticipants++;

                    // Logika Trend Aktivitas
                    const resTime = res.created_at || res.timestamp; 
                    if (resTime) {
                        const diffDays = Math.floor((now - resTime) / (1000 * 60 * 60 * 24));
                        if (diffDays >= 0 && diffDays < 7) {
                            trendDataPoints[6 - diffDays]++;
                        }
                    }
                });
            }
        });

        // 2. Update Teks Statistik
        if (document.getElementById('total-users')) document.getElementById('total-users').innerText = totalParticipants;
        if (document.getElementById('average-score')) document.getElementById('average-score').innerText = allScores.length > 0 ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1) : 0;
        if (document.getElementById('total-quizzes-count')) document.getElementById('total-quizzes-count').innerText = totalQuizzes;

        // 3. RENDER CHART (Sekali saja, menggunakan data yang sudah dihitung)
        if (categoryChartInstance) categoryChartInstance.destroy();
        categoryChartInstance = new Chart(document.getElementById('categoryChart'), {
            type: 'doughnut',
            data: {
                labels: Object.keys(kategoriCount),
                datasets: [{
                    data: Object.values(kategoriCount),
                    backgroundColor: ['#4a90e2', '#e11d48', '#34d399', '#f59e0b', '#8b5cf6']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        if (trendChartInstance) trendChartInstance.destroy();
        trendChartInstance = new Chart(document.getElementById('trendChart'), {
            type: 'line',
            data: {
                labels: ['H-6', 'H-5', 'H-4', 'H-3', 'H-2', 'H-1', 'Hari Ini'],
                datasets: [{
                    label: 'Pengerjaan Kuis',
                    data: trendDataPoints,
                    borderColor: '#4a90e2',
                    tension: 0.4,
                    fill: true,
                    backgroundColor: 'rgba(74, 144, 226, 0.1)'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    });
};

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
    if (optionCount >= 5) return showNotif("Limit", "Maksimal 5 opsi.");
    
    const container = document.getElementById('dynamic-options-container');
    const char = String.fromCharCode(65 + optionCount);
    
    // 1. Buat elemen div
    const div = document.createElement('div');
    div.className = 'input-group';
    
    // 2. Tambahkan class 'opt-value' agar mudah dilacak oleh updateLivePreviewOptions
    div.innerHTML = `<label>Opsi ${char}</label><input type="text" class="input-modern opt-value" data-index="${optionCount}" placeholder="Ketik pilihan jawaban...">`;
    container.appendChild(div);

    // 3. Tambahkan Event Listener untuk Live Preview
    const inputBaru = div.querySelector('.opt-value');
    inputBaru.addEventListener('input', updateLivePreviewOptions);

    // 4. Update Dropdown Jawaban Benar (Kode lama Anda)
    const selectJawaban = document.getElementById('input-jawaban');
    const opt = document.createElement('option');
    opt.value = optionCount;
    opt.textContent = `Opsi ${char}`;
    selectJawaban.appendChild(opt);
    
    optionCount++;
    
    // Panggil sekali untuk memastikan preview sinkron
    updateLivePreviewOptions();
};

window.updateLivePreviewOptions = function() {
    const previewContainer = document.getElementById('preview-options-list');
    if (!previewContainer) return; // Keamanan
    
    previewContainer.innerHTML = ""; // Bersihkan preview lama
    
    // Ambil semua input opsi
    const allInputs = document.querySelectorAll('.opt-value');
    
    allInputs.forEach((input, index) => {
        if (input.value.trim() !== "") {
            const char = String.fromCharCode(65 + index);
            const btn = document.createElement('div');
            btn.className = 'preview-option-item';
            btn.innerText = `${char}. ${input.value}`;
            previewContainer.appendChild(btn);
        }
    });
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
        container.innerHTML = "<h3> Silahkan buka dropdown dan pilih kuis/kategori terlebih dahulu.</h3>";
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
                    <th style="padding:12px; border-bottom:2px solid #ddd;">Durasi</th>
                    <th style="padding:12px; border-bottom:2px solid #ddd; text-align:center;">Aksi</th>
                </tr>`;

        // Ubah ke array agar bisa diurutkan berdasarkan No. Absen atau Kelas
        const dataArr = Object.entries(results).map(([id, val]) => ({ id, ...val }));
        dataArr.sort((a, b) => (parseInt(a.playerNo) || 0) - (parseInt(b.playerNo) || 0));

        dataArr.forEach((res) => {
            const resultId = res.id;
            const name = res.playerName || 'Anonim';
            const playerClass = res.playerClass || '-';
            const playerNo = res.playerNo || '-';
            const score = Math.round(res.score || 0);
            const duration = res.duration ? res.duration.toFixed(0) + 's' : '-';
            const hasEssay = res.essayAnswers ? '<i class="fas fa-pen-fancy" style="color:#8458B3; margin-left:5px;"></i>' : '';

            html += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:10px; text-align:center;">${playerNo}</td>
                    <td style="padding:10px;"><b>${name}</b> ${hasEssay}</td>
                    <td style="padding:10px;"><span style="background:#eef0f7; padding:2px 6px; border-radius:4px; font-size:0.8rem;">${playerClass}</span></td>
                    <td style="padding:10px; font-weight:600; color:#8458B3;">${score}</td>
                    <td style="padding:10px; color:#666;">${duration}</td>
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
    }).catch(error => {
        console.error("Gagal mengambil data:", error);
        container.innerHTML = "<p style='color:red;'>Terjadi kesalahan saat memuat data.</p>";
    });
};

// --- LIHAT DETAIL ---
window.bukaDetailJawaban = async function(quizId, resultId) {
    const modal = document.getElementById('modal-detail-jawaban');
    const nameDisplay = document.getElementById('detail-player-name');
    const container = document.getElementById('essay-review-container');

    // 1. Cek Status PRO terlebih dahulu
    const proStatus = await window.getProStatus();
    const proBadge = !proStatus.isPro ? ` <span class="badge-pro-mini"><i class="fas fa-lock"></i> PRO</span>` : '';

    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'block';
    }
    container.innerHTML = "<p>Sedang memuat detail jawaban...</p>";

    // --- LANGKAH 1: Ambil Judul Kuis ---
    database.ref(`users/${auth.currentUser.uid}/quizzes/${quizId}`).once('value', quizSnap => {
        const quizInfo = quizSnap.val();
        const namaKuis = quizInfo ? quizInfo.title : "Laporan Kuis";

        let titleStorage = document.getElementById('quiz-title-display');
        if (!titleStorage) {
            titleStorage = document.createElement('div');
            titleStorage.id = 'quiz-title-display';
            titleStorage.style.display = 'none';
            document.body.appendChild(titleStorage);
        }
        titleStorage.innerText = namaKuis;

        // --- LANGKAH 2: Ambil Data Jawaban ---
        const path = `users/${auth.currentUser.uid}/quizzes/${quizId}/results/${resultId}`;
        database.ref(path).once('value', snapshot => {
            const data = snapshot.val();
            if (!data) {
                container.innerHTML = "<p style='color:red;'>Data tidak ditemukan.</p>";
                return;
            }

            nameDisplay.innerText = data.playerName || "Anonim";
            const answers = data.essayAnswers || [];

            if (answers.length === 0) {
                container.innerHTML = `<div style="text-align:center; padding:20px;"><p>Tidak ada detail jawaban.</p></div>`;
                return;
            }

            // 1. Bagian Header (Tetap di Atas)
            let headerHTML = `
                <div style="position: sticky; top: 0; z-index: 10; background: #fff; margin-bottom: 20px; padding: 15px; border-radius: 8px; border-left: 5px solid #8458B3; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                    <h4 style="margin:0; color:#8458B3;">${namaKuis}</h4>
                    <p style="margin:5px 0 0 0; font-size: 0.8rem; color: #666;">ID Hasil: ${resultId}</p>
                </div>
            `;

            // 2. Bagian List Soal (Yang akan di-scroll)
            let listHTML = `<div class="review-list">`;
            answers.forEach((item, index) => {
                const isCorrect = item.status && item.status.includes("Benar");
                const statusColor = isCorrect ? "#27ae60" : "#e74c3c";
                listHTML += `
                    <div class="review-item" style="border: 1px solid #ddd; border-radius: 12px; padding: 18px; margin-bottom: 20px; background: white;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <b>Soal #${index + 1}</b>
                            <span class="status-badge" style="color: ${statusColor}; font-weight:bold;">${item.status || 'Perlu Review'}</span>
                        </div>
                        <p class="soal-text" style="margin-bottom:10px;"><b>Pertanyaan:</b><br>${item.soal}</p>
                        <div style="background: #f9f9f9; padding: 10px; border-radius: 6px;">
                            <p style="margin:0; font-size:0.7rem; color:#888;">JAWABAN SISWA:</p>
                            <p class="jawaban-text" style="margin:0; font-weight:500;">${item.jawabanUser}</p>
                        </div>
                    </div>`;
            });
            listHTML += `</div>`;

            // 3. Bagian Footer (Tombol Cetak - Tetap di Bawah)
            let footerHTML = `
                <div style="position: sticky; bottom: 0; background: white; padding: 15px; border-top: 2px solid #8458B3; margin-top: 10px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 -5px 10px rgba(0,0,0,0.05);">
                    <div>
                        <label>Skor:</label>
                        <input class="input-modern" type="number" id="manual-score-${resultId}" value="${Math.round(data.score)}" style="width:80px; height: 35px;">
                        <button class="cta-button" onclick="updateSkorManual('${quizId}', '${resultId}')">Simpan</button>
                    </div>
                    <button onclick="handlePremiumFeature(() => generateSinglePDF('${resultId}'), 'Cetak PDF')" 
                        style="background: #e74c3c; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-file-pdf"></i> Cetak PDF${proBadge}
                    </button>
                </div>
            `;

            // Gabungkan semuanya ke dalam container
            container.innerHTML = headerHTML + listHTML + footerHTML;
        });
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

// Fungsi PDF
window.generateSinglePDF = function(resultId) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const namaSiswa = document.getElementById('detail-player-name')?.innerText || "Siswa";
    const judulKuis = document.getElementById('quiz-title-display')?.innerText || "Laporan Kuis";
    const skorTotal = document.getElementById(`manual-score-${resultId}`)?.value || "0";
    const tanggalCetak = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    // Desain Header
    doc.setFontSize(18);
    doc.setTextColor(132, 88, 179); 
    doc.text("HASIL EVALUASI SISWA", 105, 20, { align: "center" });
    doc.line(20, 25, 190, 25); 

    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text(`Nama Siswa      : ${namaSiswa}`, 20, 35);
    doc.text(`Mata Pelajaran : ${judulKuis}`, 20, 42); 
    doc.text(`Tanggal Cetak  : ${tanggalCetak}`, 130, 35);
    doc.text(`Skor Akhir      : ${skorTotal} / 100`, 130, 42);

    // Ekstraksi Data dari Class yang sudah kita buat di atas
    const rows = [];
    const items = document.querySelectorAll('.review-item');
    
    items.forEach((item, index) => {
        const soal = item.querySelector('.soal-text')?.innerText.replace(/Pertanyaan:/i, '').trim() || "-";
        const jawaban = item.querySelector('.jawaban-text')?.innerText.trim() || "-";
        const status = item.querySelector('.status-badge')?.innerText.trim() || "-";
        
        rows.push([index + 1, soal, jawaban, status]);
    });

    doc.autoTable({
        startY: 50,
        head: [['No', 'Pertanyaan', 'Jawaban Siswa', 'Status']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [132, 88, 179] },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 50 }, 3: { cellWidth: 25 } },
        styles: { fontSize: 9, overflow: 'linebreak' }
    });

    doc.save(`Hasil_${namaSiswa.replace(/\s+/g, '_')}_${judulKuis.replace(/\s+/g, '_')}.pdf`);
}; // PErbaikan 2

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

// Fungsi untuk memperbarui daftar opsi di preview
function updateLivePreviewOptions() {
    const previewContainer = document.getElementById('preview-options-list');
    previewContainer.innerHTML = ""; // Reset tampilan
    
    // Ambil semua input opsi yang ada
    const optionInputs = document.querySelectorAll('.option-input');
    
    optionInputs.forEach((input, index) => {
        // Hanya tampilkan jika input ada isinya
        if (input.value.trim() !== "") {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'preview-option-item';
            
            // Tambahkan label A, B, C, dll
            const label = String.fromCharCode(65 + index); // 65 adalah 'A'
            optionDiv.innerText = `${label}. ${input.value}`;
            
            previewContainer.appendChild(optionDiv);
        }
    });
}

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

    database.ref(`users/${user.uid}/profile`).once('value', (snapshot) => {
        const data = snapshot.val();
        
        // Pastikan kita berada di halaman/section yang ada elemen profilnya
        const viewName = document.getElementById('view-name');
        if (!viewName) return; 

        if (data) {
            // Isi Preview
            viewName.innerText = data.name || "Nama Author";
            document.getElementById('view-job').innerText = data.job || "Pekerjaan";
            document.getElementById('view-bio').innerText = data.bio || "Halo, saya author di Kuisia.";
            
            // Jika ada foto di firebase pakai itu, jika tidak pakai UI Avatars
            const photoUrl = data.photo || `https://ui-avatars.com/api/?name=${data.name || 'Author'}&background=random`;
            document.getElementById('view-photo').src = photoUrl;

            // Isi Form Edit
            document.getElementById('inp-name').value = data.name || "";
            document.getElementById('inp-job').value = data.job || "";
            document.getElementById('inp-bio').value = data.bio || "";
            document.getElementById('inp-gift').value = data.gift || "";
            
            window.toggleAccordion('preview');
        } else {
            // Jika data benar-benar kosong (User Baru)
            window.toggleAccordion('edit');
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


// A. Fungsi Live Preview (Ketik langsung berubah di Kartu Preview)
function initLivePreview() {
    const map = [
        { input: 'inp-name', view: 'view-name', default: 'Nama Author' },
        { input: 'inp-job', view: 'view-job', default: 'Pekerjaan' },
        { input: 'inp-bio', view: 'view-bio', default: 'Deskripsi singkat...' }
    ];

    map.forEach(item => {
        const el = document.getElementById(item.input);
        const view = document.getElementById(item.view);
        if (el && view) {
            el.addEventListener('input', () => {
                view.innerText = el.value || item.default;
            });
        }
    });
}

// B. Fungsi Simpan Profil Akhir dengan Sinkronisasi Massal (Tahap 1.1)
window.saveProfileData = async function() {
    const user = auth.currentUser;
    if (!user) return;

    // Ambil data dari input form
    const profileData = {
        name: document.getElementById('inp-name').value.trim(),
        job: document.getElementById('inp-job').value.trim(),
        bio: document.getElementById('inp-bio').value.trim(),
        gift: document.getElementById('inp-gift').value.trim(),
        photo: document.getElementById('view-photo').src 
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

// Tambahkan di dalam fungsi handleQuizSelection
// --- FUNGSI KONTROL SELEKSI KUIS (KONDUKTOR) ---
window.onQuizSelected = async function(quizId) {

    // Tambahkan pengecekan ini di dalam window.onQuizSelected
    const proStatus = await getProStatus();
    const deadlineInput = document.getElementById('set-deadline');

    if (!proStatus.isPro) {
        deadlineInput.classList.add('pro-feature-locked');
        deadlineInput.title = "Fitur Premium";
        // Opsional: munculkan teks "Unlock Pro"
    }

    if (!quizId) {
        // Jika tidak ada kuis yang dipilih, sembunyikan semua panel aksi
        document.getElementById('quick-actions-row').classList.add('hidden');
        document.getElementById('security-panel').classList.add('hidden');
        document.getElementById('questions-list-container').innerHTML = '<p style="text-align:center; color:#aaa; padding: 20px;">Pilih kategori untuk melihat soal.</p>';
        return;
    }

    // 1. Munculkan Tombol Akses Cepat (Rekap & Keamanan)
    document.getElementById('quick-actions-row').classList.remove('hidden');

    // 2. Ambil Data Kuis dari Firebase untuk mengisi form keamanan
    const user = auth.currentUser;
    database.ref(`users/${user.uid}/quizzes/${quizId}`).once('value', (snapshot) => {
        const quizData = snapshot.val();
        if (quizData) {
            // Isi form keamanan dengan data yang ada di DB
            document.getElementById('set-access-type').value = quizData.accessType || 'public';
            document.getElementById('set-quiz-password').value = quizData.quizPassword || '';
            document.getElementById('set-deadline').value = quizData.deadline || '';
            
            // Jalankan logika toggle input password
            togglePassInput();
            
            // 3. Update Label Nama Kuis di daftar soal
            document.getElementById('current-quiz-name').innerText = quizData.title || "Kuis Dipilih";
        }
    });

    // 4. Jalankan fungsi load soal yang sudah Anda miliki sebelumnya
    // Pastikan nama fungsi ini sesuai dengan fungsi load soal di file JS Anda
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

//LOGIKA SWITCH FUNGSI TOMBOL MODAL

let modeEdit = false;
let targetEditId = "";

function persiapanEditKuis(quizId) {
    modeEdit = true;
    targetEditId = quizId;
    const user = auth.currentUser;

    // Ambil data kuis DAN status user secara bersamaan
    database.ref(`users/${user.uid}`).once('value', userSnap => {
        const userData = userSnap.val();
        const isPremium = userData ? userData.is_premium : false;

        // Jalankan update UI Premium agar gembok terbuka/tertutup sesuai status
        updatePremiumUI(isPremium);

        database.ref(`users/${user.uid}/quizzes/${quizId}`).once('value', (quizSnap) => {
            const data = quizSnap.val();
            if (!data) return;

            // Masukkan data ke form (nama, tipe, durasi, dll seperti kode Mas sebelumnya)
            document.getElementById('nama-kuis-baru').value = data.title || "";
            document.getElementById('tipe-kuis-baru').value = data.quizType || "pg";
            document.getElementById('durasi-value-baru').value = data.duration || 60;
            document.getElementById('set-deadline-baru').value = data.deadline || "";
            document.getElementById('deskripsi-kuis-baru').value = data.description || "";
            
            // Set Visibility (Penting agar radio button sesuai data lama)
            const radioTarget = document.querySelector(`input[name="visibility"][value="${data.visibility || 'public'}"]`);
            if(radioTarget) radioTarget.checked = true;
            
            if(data.visibility === 'private') {
                document.getElementById('private-settings').classList.remove('hidden');
                document.getElementById('set-quiz-password-baru').value = data.quizPassword || "";
            }

            // Ubah tombol & judul
            document.querySelector('#modal-kuis h2').innerHTML = `<i class="fas fa-edit"></i> Edit Pengaturan Kuis`;
            const btnSimpan = document.querySelector('.btn-buat');
            btnSimpan.innerText = "Update Perubahan";
            btnSimpan.setAttribute('onclick', 'simpanPerubahanKuis()');

            // Tampilkan modal
            document.getElementById('modal-kuis').style.display = 'block';
        });
    });
}

//FUNGSI PEMICU UPDATE KUIS

function simpanPerubahanKuis() {
    const userId = auth.currentUser.uid;
    
    // Ambil semua nilai dari input yang sama dengan modal kuis lama
    const updatedData = {
        title: document.getElementById('nama-kuis-baru').value,
        quizType: document.getElementById('tipe-kuis-baru').value,
        duration: parseInt(document.getElementById('durasi-value-baru').value),
        deadline: document.getElementById('set-deadline-baru').value,
        description: document.getElementById('deskripsi-kuis-baru').value
    };

    // Tambahkan password jika ada
    const pass = document.getElementById('set-quiz-password-baru').value;
    if(pass) updatedData.quizPassword = pass;

    // Update ke Firebase
    database.ref(`users/${userId}/quizzes/${targetEditId}`).update(updatedData)
    .then(() => {
        showCustomAlert("Berhasil!", "Kuis telah diperbarui", "success");
        closeModalKuis();
        resetModalKeDefault(); // Kembalikan modal ke mode "Tambah"
    })
    .catch(err => console.error(err));
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

//FUNGSI CHECK USER 
function updatePremiumUI(isPremium) {
    const premiumRow = document.getElementById('premium-row');
    const premiumOverlay = document.getElementById('premium-overlay');
    const durModeInput = document.getElementById('durasi-mode-baru');
    const durValInput = document.getElementById('durasi-value-baru');
    const visibilityRadios = document.getElementsByName('visibility');

    if (!isPremium) {
        // --- LOGIKA NON-PREMIUM (TERKUNCI) ---
        if(premiumRow) premiumRow.classList.add('premium-locked');
        if(premiumOverlay) premiumOverlay.style.display = 'flex';
        if(durModeInput) durModeInput.disabled = true;
        if(durValInput) durValInput.disabled = true;
        
        visibilityRadios.forEach(r => {
            if(r.value === 'private') r.disabled = true;
            if(r.value === 'public') r.checked = true; // Paksa public
        });
    } else {
        // --- LOGIKA PREMIUM (TERBUKA) ---
        if(premiumRow) premiumRow.classList.remove('premium-locked');
        if(premiumOverlay) premiumOverlay.style.display = 'none';
        if(durModeInput) durModeInput.disabled = false;
        if(durValInput) durValInput.disabled = false;
        visibilityRadios.forEach(r => r.disabled = false);
    }
}


//MODAL EDIT SOAL
// Variabel penyimpan ID soal yang sedang diedit di modal simple
let currentSimpleEditId = "";

// 1. Fungsi Buka Modal & Isi Data
window.bukaModalEditSimple = function(soalId) {
    currentSimpleEditId = soalId;
    const userId = auth.currentUser.uid;
    const quizId = window.activeQuizId || document.getElementById('input-kategori').value;

    if(!quizId) return alert("Kuis tidak ditemukan");

    database.ref(`users/${userId}/quizzes/${quizId}/questions/${soalId}`).once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Set Pertanyaan
        document.getElementById('edit-simple-pertanyaan').value = data.question;

        // Cek Tipe Soal untuk Tampilan Modal
        const areaPG = document.getElementById('area-edit-pg');
        const areaEssay = document.getElementById('area-edit-essay');

        if (data.type === 'pg' || data.type === 'pilihan_ganda') {
            areaPG.style.display = 'block';
            areaEssay.style.display = 'none';
            
            // Isi Opsi A-D (Hanya 4 opsi untuk kesederhanaan)
            if (data.options) {
                data.options.forEach((opt, idx) => {
                    const el = document.getElementById(`edit-opt-${idx}`);
                    if (el) el.value = opt;
                });
            }
            // Set Kunci Jawaban
            document.getElementById('edit-simple-kunci-pg').value = data.answer;
        } else {
            areaPG.style.display = 'none';
            areaEssay.style.display = 'block';
            document.getElementById('edit-simple-kunci-essay').value = data.answer;
        }

        // Tampilkan Modal
        document.getElementById('modal-edit-soal-simple').style.display = 'block';
    });
};

// 2. Fungsi Tutup Modal
window.tutupModalEditSimple = function() {
    document.getElementById('modal-edit-soal-simple').style.display = 'none';
};

// 3. Fungsi Eksekusi Simpan Perubahan (Versi Dinamis & Fix Opsi Hantu)
window.simpanPerubahanSoalSimple = function() {
    const userId = auth.currentUser.uid;
    const quizId = window.activeQuizId || document.getElementById('input-kategori').value;
    
    if(!currentSimpleEditId) return;

    const areaPG = document.getElementById('area-edit-pg');
    const isPG = areaPG && areaPG.style.display === 'block';
    
    // Ambil teks pertanyaan (Mendukung Quill atau Textarea biasa)
    let questionContent;
    if (window.quillEditorEdit) { 
        // Jika Mas pakai Quill di modal edit
        questionContent = window.quillEditorEdit.root.innerHTML;
    } else {
        questionContent = document.getElementById('edit-simple-pertanyaan').value;
    }

    let updatedData = {
        question: questionContent,
        updated_at: firebase.database.ServerValue.TIMESTAMP
    };

    if (isPG) {
        // --- PERBAIKAN: PENGAMBILAN OPSI DINAMIS ---
        const opts = [];
        
        // Cari semua input yang ID-nya diawali dengan 'edit-opt-' di dalam areaPG
        const inputOptions = areaPG.querySelectorAll('input[id^="edit-opt-"]');
        
        inputOptions.forEach(input => {
            const val = input.value.trim();
            // Hanya masukkan ke array jika input tidak kosong
            if (val !== "") {
                opts.push(val);
            }
        });

        if (opts.length < 2) {
            if(window.showNotif) showNotif("Peringatan", "Minimal harus ada 2 opsi jawaban!");
            else alert("Minimal harus ada 2 opsi jawaban!");
            return;
        }

        updatedData.options = opts;
        updatedData.answer = parseInt(document.getElementById('edit-simple-kunci-pg').value);
    } else {
        // Untuk Essay
        const answerEssay = document.getElementById('edit-simple-kunci-essay').value;
        if (!answerEssay.trim()) {
            if(window.showNotif) showNotif("Peringatan", "Kunci jawaban essay tidak boleh kosong!");
            else alert("Kunci jawaban essay tidak boleh kosong!");
            return;
        }
        updatedData.answer = answerEssay;
    }

    // Push ke Firebase
    database.ref(`users/${userId}/quizzes/${quizId}/questions/${currentSimpleEditId}`)
    .update(updatedData)
    .then(() => {
        if(window.showNotif) {
            showNotif("Berhasil", "Soal telah diperbarui!");
        } else {
            alert("Soal telah diperbarui!");
        }
        
        tutupModalEditSimple();
        
        // Refresh daftar soal di dashboard agar perubahan langsung terlihat
        if(window.loadQuestions) window.loadQuestions(quizId);
        
        // Update statistik jika ada fungsi tersebut
        if(window.updateTargetStats) window.updateTargetStats();
    })
    .catch(err => {
        console.error("Error update soal:", err);
        if(window.showNotif) showNotif("Gagal", "Gagal menyimpan perubahan.");
    });
};

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





