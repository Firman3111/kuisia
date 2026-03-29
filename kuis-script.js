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
const urlParams = new URLSearchParams(window.location.search);
const quizId = urlParams.get('id');
// Cek parameter 'author' atau 'uid', mana yang tersedia
const authorId = urlParams.get('author') || urlParams.get('uid');

// Variabel Global
let questions = [];
let currentQuestionIndex = 0;
let score = 0;
let playerName = "";
let timeLeft = 60;
let timerInterval;
let startTime; 
let quizDataGlobal = null; 
let adminIdGlobal = "";
let userEssayAnswers = []; // Simpan jawaban teks di sini
let quizDurationMode = 'timer'; // Default Free
let quizDurationValue = 60;      // Default Free (detik per soal)
let selectedAvatarUrl = "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix";
//Kode untuk REVIEW soal
let userAnswersLog = [];        // Data untuk Dashboard Spion
let timeUsedAccumulated = 0;    // Total detik yang sudah terpakai
let totalAllocatedTime = 0;     // Total kapasitas bensin waktu (Soal * Detik)
let isReviewPhase = false;      // Status apakah sedang di Dashboard Spion
let reviewTimerInterval;        // Interval untuk timer global

// --- LOGIKA PENGAMBILAN DATA (HYBRID) - VERSI STABIL ---
async function initializeQuiz() {
    if (!quizId) return;

    try {
        console.log("Mencoba memuat kuis:", quizId);
        
        // 1. Cek di Index (Publik)
        let snapshot = await database.ref(`quiz_index/${quizId}`).once('value');
        let dataPublik = snapshot.val();

        // PERBAIKAN: Cek apakah data ada DAN memiliki judul
        if (snapshot.exists() && dataPublik && dataPublik.title) {
            console.log("Kuis valid ditemukan di Index Publik");
            handleLoadedQuiz(dataPublik);
            return; 
        }

        // 2. Jika di publik tidak ada atau datanya tidak lengkap (seperti log console Anda)
        if (authorId) {
            console.log("Mencari data lengkap di folder privat user:", authorId);
            let privSnapshot = await database.ref(`users/${authorId}/quizzes/${quizId}`).once('value');
            
            if (privSnapshot.exists()) {
                console.log("Kuis lengkap ditemukan di folder Privat");
                handleLoadedQuiz(privSnapshot.val());
            } else {
                alert("Data kuis tidak ditemukan.");
            }
        } else {
            alert("Kuis tidak ditemukan atau data tidak lengkap.");
        }

    } catch (error) {
        console.error("Error loading quiz:", error);
    }
}

// Jalankan fungsi inisialisasi
initializeQuiz();

// MODIFIKASI: Update fungsi handleLoadedQuiz untuk menangkap setting durasi
function handleLoadedQuiz(data) {
    if (!data) return;
    
    quizDataGlobal = data;
    // Tambahkan ini: Ambil config atau buat objek kosong jika tidak ada
    window.currentConfig = data.config || {};

    adminIdGlobal = authorId || data.userId || "";

    const modalGate = document.getElementById('modal-gate-siswa');
    const setupContainer = document.getElementById('setup-container');
    const sekarang = new Date();

    // 1. CEK DEADLINE
    if (data.deadline) {
        const tglDeadline = new Date(data.deadline);
        if (sekarang > tglDeadline) {
            if (setupContainer) setupContainer.classList.add('hidden');
            if (modalGate) {
                modalGate.style.display = 'flex';
                document.getElementById('gate-title').innerText = "Waktu Habis";
                document.getElementById('gate-msg').innerText = "Maaf, batas waktu kuis sudah berakhir.";
                document.getElementById('gate-input-area').style.display = 'none';
            }
            return; // Berhenti di sini jika benar-benar sudah kadaluwarsa
        }
    }

    // 2. CEK PASSWORD (PRIVATE)
    if (data.accessType === 'private') {
        window.targetPassword = data.quizPassword;
        if (setupContainer) setupContainer.classList.add('hidden');
        if (modalGate) {
            modalGate.style.display = 'flex';
            document.getElementById('gate-input-area').style.display = 'block';
        }
        return; 
    }

    // 3. JIKA PUBLIK (ATAU PRIVATE YANG SUDAH LOLOS PASSWORD)
    // Pastikan fungsi ini dipanggil agar badge dan teks aturan muncul
    renderDataKeWaitingRoom(data);
}

function renderQuizHeader(data) {
    if (!data) return;

    // DEBUG: Hapus ini jika sudah berhasil. 
    // Ini untuk melihat di Inspect Element > Console, apa saja kunci yang ada di data kuis Anda.
    console.log("Struktur Data Kuis:", data);

    const titleEl = document.getElementById('quiz-title-display');
    const infoEl = document.getElementById('question-count-display');

    if (titleEl) {
        // Cek semua kemungkinan kunci judul: title, quizTitle, atau judul
        const judulFinal = data.title || data.quizTitle || data.judul;
        
        if (judulFinal) {
            titleEl.innerText = judulFinal;
        } else {
            titleEl.innerText = "Kuis Tanpa Judul";
            console.warn("Judul tidak ditemukan di objek data. Cek console log di atas.");
        }
    }

    if (infoEl) {
        // Hitung jumlah soal
        let qCount = 0;
        if (questions && questions.length > 0) {
            qCount = questions.length;
        } else if (data.questions) {
            qCount = Object.keys(data.questions).length;
        }
        infoEl.innerText = qCount;
    }

    // Tampilkan Start Screen
    const loadingScreen = document.getElementById('loading-screen');
    const startScreen = document.getElementById('start-screen');
    if (loadingScreen) loadingScreen.style.display = 'none';
    if (startScreen) startScreen.style.display = 'block';
}

// 2. FUNGSI UTILITY
// MODIFIKASI: Fungsi startTimer (Menghormati Mode PR)
function startTimer() {
    // PENGAMAN: Jika mode durasi bukan 'timer', hentikan fungsi segera
    if (quizDurationMode !== 'timer') {
        clearInterval(timerInterval);
        return;
    }

    timeLeft = quizDurationValue;
    const timerDisplay = document.getElementById('timer-display');
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        if(timerDisplay) {
            timerDisplay.textContent = timeLeft;
            
            if (timeLeft <= 5) {
                timerDisplay.style.color = "#f44336"; 
                timerDisplay.style.fontSize = "1.5rem";
            } else {
                timerDisplay.style.color = "var(--accent)";
                timerDisplay.style.fontSize = "1rem";
            }
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleAnswer(null); 
        }
    }, 1000);
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// MODIFIKASI: Fungsi startQuiz (Menyimpan Nama & Kelas + Reset Data Review)
window.startQuiz = function() {
    const nameInput = document.getElementById('player-name');
    const classInput = document.getElementById('player-class');
    const noInput = document.getElementById('player-no');

    if (!nameInput || !nameInput.value.trim()) {
        alert("Masukkan nama lengkap Anda!");
        return;
    }

    // --- [TAMBAHAN: RESET DATA UNTUK REVIEW & BANK WAKTU] ---
    userAnswersLog = [];             // Kosongkan log jawaban lama
    timeUsedAccumulated = 0;         // Reset akumulasi waktu terpakai
    score = 0;                       // Reset skor awal
    isReviewPhase = false;           // Pastikan tidak dalam mode review
    userEssayAnswers = [];           // Kosongkan rekap essay
    // -------------------------------------------------------

    playerName = nameInput.value.trim();
    const playerClass = classInput ? classInput.value : "-";
    const playerNo = noInput ? noInput.value : "-";

    // Simpan ke Session untuk pengiriman skor nanti
    sessionStorage.setItem('temp_class', playerClass);
    sessionStorage.setItem('temp_no', playerNo);

    // 1. Pindah Tampilan ke Modal Rules
    document.getElementById('setup-container').classList.add('hidden');
    document.getElementById('modal-rules').classList.remove('hidden');

    // 2. Logika Presence (Siswa muncul di bubble teman-temannya)
    if (quizDataGlobal && quizDataGlobal.accessType === 'private') {
        const presenceRef = database.ref(`presence/${quizId}`).push();
        presenceRef.set({
            name: playerName,
            avatar: selectedAvatarUrl,
            class: playerClass,
            no: playerNo,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        });
        presenceRef.onDisconnect().remove();
    }

    // 3. LOGIKA PINTU GERBANG (Jadwal vs Manual)
    const sekarang = Date.now();
    const btnStart = document.getElementById('btn-start-manual');
    const countdownWrapper = document.getElementById('countdown-wrapper');
    
    // Aktifkan tampilan daftar teman
    listenToPlayersRealtime();

    if (quizDataGlobal.scheduledTime && sekarang < quizDataGlobal.scheduledTime) {
        // KASUS A: Kuis Terjadwal & Belum Waktunya
        if (btnStart) {
            btnStart.style.display = 'block';
            btnStart.disabled = true;
            btnStart.innerText = "Menunggu Jadwal...";
        }
        if (countdownWrapper) countdownWrapper.style.display = 'block';
        
        // Jalankan countdown ke Waktu Spesifik (Timestamp)
        runScheduledCountdown(quizDataGlobal.scheduledTime);
    } else {
        // KASUS B: Tidak Terjadwal / Sudah Lewat
        if (btnStart) {
            btnStart.style.display = 'block';
            btnStart.disabled = false;
            btnStart.innerText = "Saya Mengerti, Mulai!";
        }
        if (countdownWrapper) countdownWrapper.style.display = 'none';
    }
};

//FITUR KEAMANAN

// 1. CEK STATUS SEBELUMNYA (Mencegah Resume Tanpa Nama)
window.onload = () => {
    if (sessionStorage.getItem('quizInProgress')) {
        // Jika kuis terputus, kita bisa paksa submit atau lanjut 
        // Untuk versi ini, kita biarkan user mengisi nama ulang agar aman
        console.log("Sesi kuis sebelumnya terdeteksi.");
    }
};

// 2. PROTEKSI REFRESH / TOMBOL BACK
window.addEventListener('beforeunload', (e) => {
    if (document.getElementById('quiz-area').classList.contains('hidden') === false) {
        const msg = "Progres kuis akan hilang jika Anda keluar!";
        e.returnValue = msg;
        return msg;
    }
});

// 3. MODIFIKASI: realStart (Menandai kuis dimulai)
// 3. MODIFIKASI: realStart (Menandai kuis dimulai & Inisialisasi Bank Waktu)
function realStart() {
    if (!questions || questions.length === 0) {
        alert("Soal belum selesai dimuat.");
        return;
    }

    // --- [TAMBAHAN: HITUNG TOTAL BANK WAKTU] ---
    // Mengambil durasi per soal dari konfigurasi admin (default 60 detik jika tidak ada)
    const durasiPerSoal = parseFloat(window.currentConfig.durasiSoal) || 60;
    
    // Total kapasitas waktu = Jumlah Soal x Durasi per Soal
    totalAllocatedTime = questions.length * durasiPerSoal; 
    
    // Pastikan akumulasi waktu terpakai benar-benar mulai dari 0
    timeUsedAccumulated = 0; 
    // --------------------------------------------

    // Tandai kuis sedang berjalan
    sessionStorage.setItem('quizInProgress', 'true');
    
    document.getElementById('modal-rules').classList.add('hidden');
    document.getElementById('quiz-area').classList.remove('hidden'); 
    
    startTime = Date.now();
    currentQuestionIndex = 0;
    score = 0;
    showQuestion();
}

// 4. FUNGSI AUTO-SUBMIT (Jika Waktu Benar-benar Habis)
function forceSubmitQuiz() {
    clearInterval(timerInterval);
    alert("Waktu kuis telah habis! Jawaban Anda akan dikirim otomatis.");
    finishQuiz();
}

// Funsi Kembali ke beranda
function backToHome() {
    // Ganti 'index.html' dengan nama file halaman depan Anda jika berbeda
    window.location.href = 'index.html'; 
}

// Pastikan fungsi global bisa diakses oleh onclick di HTML
window.startQuiz = startQuiz;
window.realStart = realStart;

// PERBAIKAN: Nama fungsi disamakan dan pengecekan properti soal
function showQuestion() {
    if (currentQuestionIndex < questions.length) {
        const progress = (currentQuestionIndex / questions.length) * 100;
        const progressFill = document.getElementById('progress-fill');
        if(progressFill) progressFill.style.width = `${progress}%`;

        const q = questions[currentQuestionIndex];
        
        const qNumberEl = document.getElementById('q-number');
        if(qNumberEl) qNumberEl.innerText = `Soal ${currentQuestionIndex + 1} dari ${questions.length}`;
        
        const qTextEl = document.getElementById('q-text');
        if(qTextEl) qTextEl.innerText = q.text || q.question || "Soal tidak ditemukan";
        // TAMBAHKAN BADGE HOTS JIKA ADA
            if (q.isHots || q.tipe_soal === "HOTS") {
                qTextEl.innerHTML = `<span class="badge-hots"><i class="fas fa-fire"></i> SOAL TANTANGAN (HOTS)</span><br>${qTextEl.innerText}`;
            }    
        
        const container = document.getElementById('options-container');
        container.innerHTML = '';

        const isEssay = (quizDataGlobal && quizDataGlobal.quizType === 'essay') || q.type === 'essay';

        if (isEssay) {
            const essayWrapper = document.createElement('div');
            essayWrapper.style.width = '100%';
            essayWrapper.innerHTML = `
                <textarea id="answer-essay" placeholder="Ketik jawaban kamu di sini..." style="width:100%; min-height:150px; padding:15px; border:2px solid #ddd; border-radius:12px; font-family:inherit; font-size:1rem; outline:none; transition:border-color 0.3s; margin-bottom: 20px;"></textarea>
                <button class="option-btn" id="submit-essay-btn" style="background:#8458B3; color:white; width:100%;" onclick="handleEssayAnswer()">Simpan Jawaban & Lanjut</button>
            `;
            container.appendChild(essayWrapper);
        } else {
            const options = q.options || [];
            options.forEach((opt, index) => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.innerText = opt;
                btn.onclick = () => handleAnswer(index);
                container.appendChild(btn);
            });
        }
        
        // --- LOGIKA PENYEMBUNYIAN TIMER-BOX & INFO DEADLINE LENGKAP ---
        const timerBox = document.getElementById('timer-box');

        if (quizDurationMode === 'timer') {
            if (timerBox) {
                timerBox.style.display = 'block';
                timerBox.innerHTML = `Sisa Waktu: <span id="timer-display">${quizDurationValue}</span> detik`;
                timerBox.style.background = "transparent";
                timerBox.style.color = "var(--accent)";
            }
            startTimer(); 
        } else {
            if (quizDataGlobal && quizDataGlobal.deadline) {
                const d = new Date(quizDataGlobal.deadline);
                
                // Format Lengkap: Hari, Tanggal Bulan Tahun jam:menit
                const formatLengkap = d.toLocaleDateString('id-ID', { 
                    weekday: 'long', 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                if (timerBox) {
                    timerBox.style.display = 'block';
                    // Menampilkan format: Senin, 1 Januari 2024 pukul 23:59
                    timerBox.innerHTML = `<i class="fas fa-calendar-alt"></i> Batas Akhir: ${formatLengkap}`;
                    timerBox.style.background = "#f8f9fa";
                    timerBox.style.padding = "8px";
                    timerBox.style.borderRadius = "8px";
                    timerBox.style.fontSize = "0.85rem";
                    timerBox.style.lineHeight = "1.4";
                }
            } else {
                if (timerBox) timerBox.style.display = 'none';
            }
            clearInterval(timerInterval); 
        }

    } else {
        const progressFill = document.getElementById('progress-fill');
        if(progressFill) progressFill.style.width = `100%`;
        finishQuiz();
    }
}

function handleAnswer(selectedIndex) {
    clearInterval(timerInterval);
    const q = questions[currentQuestionIndex];
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(b => b.style.pointerEvents = 'none');

    // --- [TAMBAHAN: LOGIKA HITUNG WAKTU TERPAKAI] ---
    const durasiSet = parseFloat(window.currentConfig.durasiSoal) || 60;
    // Hitung berapa detik yang dihabiskan untuk soal ini
    // timeLeft adalah sisa detik yang berjalan di UI
    const detikTerpakai = durasiSet - timeLeft; 
    timeUsedAccumulated += detikTerpakai; 
    // ------------------------------------------------

    // Ambil nilai dari config (Gunakan default jika admin tidak set)
    const pointsPerBenar = parseFloat(window.currentConfig.pgPoin) || 0;
    const pointsBonusHots = parseFloat(window.currentConfig.bonusHots) || 0;

    if (q.options) {
        if (selectedIndex !== null) {
            if (selectedIndex === q.answer) {
                // --- LOGIKA SKOR DINAMIS ---
                let poinDidapat = pointsPerBenar;
                
                if (q.isHots || q.tipe_soal === "HOTS") {
                    poinDidapat += pointsBonusHots;
                    console.log("Mantap! Bonus HOTS didapat:", pointsBonusHots);
                }

                score += poinDidapat;
                // ---------------------------

                if(buttons[selectedIndex]) buttons[selectedIndex].classList.add('correct-flash');
                try { document.getElementById('sound-correct').play(); } catch(e){}
            } else {
                if(buttons[selectedIndex]) buttons[selectedIndex].classList.add('wrong-flash');
                if(buttons[q.answer]) buttons[q.answer].classList.add('correct-flash');
                try { document.getElementById('sound-wrong').play(); } catch(e){}
            }
        } else {
            if(buttons[q.answer]) buttons[q.answer].classList.add('correct-flash');
        }
    }

    // --- [MODIFIKASI: CATAT DATA UNTUK LOG REVIEW & DB] ---
    const labelOpsi = ["A", "B", "C", "D"];
    const jawabanTeks = (selectedIndex !== null) ? `${labelOpsi[selectedIndex] || '?'}. ${q.options[selectedIndex]}` : "Waktu Habis";
    
    const logData = {
        no: currentQuestionIndex + 1, // Penting untuk Grid Review nanti
        soal: q.question || q.text,
        jawabanUser: jawabanTeks,
        isHots: q.isHots || false,
        type: "pg",
        status: (selectedIndex === q.answer) ? "Benar" : "Salah"
    };

    // Update log review dan rekap sekaligus
    userAnswersLog[currentQuestionIndex] = logData; 
    userEssayAnswers[currentQuestionIndex] = logData;

    setTimeout(() => {
        // Cek apakah masih ada soal berikutnya
        if (currentQuestionIndex < questions.length - 1) {
            currentQuestionIndex++;
            showQuestion();
        } else {
            // Jika sudah soal terakhir, jangan langsung finish, tapi ke DASHBOARD REVIEW
            enterReviewPhase(); 
        }
    }, 1200); 
}


window.handleEssayAnswer = function() {
    const textarea = document.getElementById('answer-essay');
    const answerText = textarea ? textarea.value.trim() : "";

    if (!answerText) {
        alert("Harap isi jawaban sebelum lanjut!");
        return;
    }

    clearInterval(timerInterval);
    const q = questions[currentQuestionIndex];

    // --- [TAMBAHAN: LOGIKA HITUNG WAKTU TERPAKAI] ---
    const durasiSet = parseFloat(window.currentConfig.durasiSoal) || 60;
    const detikTerpakai = durasiSet - timeLeft; 
    timeUsedAccumulated += detikTerpakai; 
    // ------------------------------------------------
    
    // --- 1. AMBIL KONFIGURASI POIN DARI ADMIN ---
    const pointsEssay = parseFloat(window.currentConfig.essayPoin) || 0;
    const pointsBonusHots = parseFloat(window.currentConfig.bonusHots) || 0;

    // --- 2. LOGIKA VALIDASI FLEKSIBEL (NORMALISASI) ---
    const userClean = answerText.toLowerCase().replace(/\s+/g, ' ');
    const officialAnswer = (q.answer || "").toString().toLowerCase().replace(/\s+/g, ' ');
    const validAlternatives = officialAnswer.split(',').map(item => item.trim());

    let isCorrect = false;

    // A. Cek kecocokan persis
    if (validAlternatives.includes(userClean)) {
        isCorrect = true;
    } 
    // B. Logika Keyword
    else {
        const keywords = validAlternatives[0].split(' ').filter(word => word.length > 2);
        const matchAllKeywords = keywords.length > 0 && keywords.every(word => userClean.includes(word));
        if (matchAllKeywords) {
            isCorrect = true;
        }
    }

    // --- 3. KALKULASI SKOR DINAMIS ---
    let poinDidapat = 0;
    if (isCorrect) {
        poinDidapat = pointsEssay;
        if (q.isHots || q.tipe_soal === "HOTS") {
            poinDidapat += pointsBonusHots;
            console.log("Essay HOTS Benar! Bonus ditambahkan.");
        }
        score += poinDidapat;
    }

    // --- [MODIFIKASI: CATAT DATA UNTUK LOG REVIEW & DB] ---
    const logData = {
        no: currentQuestionIndex + 1,
        soal: q.text || q.question,
        jawabanUser: answerText,
        kunciJawaban: q.answer,
        isHots: q.isHots || false,
        type: "essay",
        poin: poinDidapat,
        status: isCorrect ? "Benar (Otomatis)" : "Perlu Review Guru"
    };

    // Update log review dan rekap sekaligus menggunakan index agar tidak duplikat saat edit
    userAnswersLog[currentQuestionIndex] = logData;
    userEssayAnswers[currentQuestionIndex] = logData;

    // Efek suara & visual
    try { document.getElementById('sound-essay-save').play(); } catch(e) {}
    const btn = document.getElementById('submit-essay-btn');
    if(btn) {
        btn.disabled = true;
        btn.style.background = "#2ecc71";
        btn.innerText = "Jawaban Tersimpan...";
    }

    setTimeout(() => {
        // --- [MODIFIKASI: CEK ALUR SELANJUTNYA] ---
        if (currentQuestionIndex < questions.length - 1) {
            currentQuestionIndex++;
            showQuestion();
        } else {
            // Jika soal terakhir, masuk ke DASHBOARD REVIEW (SPION)
            enterReviewPhase(); 
        }
    }, 800);
};

// FUNGSI FINISH (SINKRON DENGAN LOGIKA BOBOT ADMIN 100 POIN)
function finishQuiz() {
    // 1. HENTIKAN SEMUA TIMER
    if (timerInterval) clearInterval(timerInterval);
    if (reviewTimerInterval) clearInterval(reviewTimerInterval);
    
    sessionStorage.removeItem('quizInProgress');
    
    const duration = (Date.now() - startTime) / 1000; 
    
    // 2. TAMPILKAN UI (Sembunyikan Kuis & Review, Munculkan Hasil)
    const quizArea = document.getElementById('quiz-area');
    const reviewArea = document.getElementById('review-dashboard'); 
    const resultArea = document.getElementById('result-area');
    
    if(quizArea) quizArea.classList.add('hidden');
    if(reviewArea) reviewArea.classList.add('hidden'); 
    if(resultArea) resultArea.classList.remove('hidden');
    
    // 3. LOGIKA SKOR (Sesuai Simulasi Bobot Admin)
    // Karena Admin sudah mengunci total ke 100, kita gunakan pembulatan aman
    let finalScore = Math.round(score);
    if (finalScore > 100) finalScore = 100; // Proteksi jika ada pembulatan desimal berlebih

    const finalScoreEl = document.getElementById('final-score');
    if(finalScoreEl) finalScoreEl.innerText = finalScore;

    // 4. LOGIKA SUARA & EFEK (Berdasarkan skala 100)
    try {
        if (finalScore >= 80) {
            const snd = document.getElementById('sound-result-excellent');
            if(snd) snd.play();
            if(typeof launchConfetti === 'function') launchConfetti(); 
        } else if (finalScore >= 60) {
            const snd = document.getElementById('sound-result-good');
            if(snd) snd.play();
        } else {
            const snd = document.getElementById('sound-result-poor');
            if(snd) snd.play();
        }
    } catch(e) { console.log("Audio play blocked by browser"); }

    // 5. RINGKASAN TEKS
    let summaryHTML = `Hebat, ${playerName}! Kamu selesai dalam ${duration.toFixed(1)} detik.`;
    // Kita langsung sebutkan "dari 100" agar konsisten dengan halaman admin
    summaryHTML += `<br>Skor kamu: <b>${finalScore}</b> dari maksimal <b>100</b> poin.`;
    
    if (quizDataGlobal && (quizDataGlobal.quizType === 'essay' || questions.some(q => q.type === 'essay'))) {
        summaryHTML += `<br><small style="color: #666; display: block; margin-top: 10px;">
            *Jawaban essay Anda telah disimpan dan akan ditinjau manual oleh admin.
        </small>`;
    }

    const playerSummaryEl = document.getElementById('player-summary');
    if (playerSummaryEl) playerSummaryEl.innerHTML = summaryHTML;
    
    // 6. SIMPAN KE DATABASE
    if(typeof saveResultToDatabase === 'function') {
        saveResultToDatabase(finalScore, duration);
    }
}

// Fungsi Navigasi Beranda (Pastikan ini ada)
function goToHome() {
    window.location.href = 'index.html';
}


// MODIFIKASI: Fungsi saveResultToDatabase (Tambahkan Kelas & No Absen)
function saveResultToDatabase(finalScore, duration) {
    if (quizId && adminIdGlobal) {
        // Ambil maxScore lagi untuk disimpan di database
        const config = window.currentConfig || {};
        const tPG = questions.filter(q => !q.type || q.type === 'pg').length;
        const tES = questions.filter(q => q.type === 'essay').length;
        const tHT = questions.filter(q => q.isHots || q.tipe_soal === "HOTS").length;
        const totalMax = (tPG * (parseFloat(config.pgPoin) || 0)) + 
                         (tES * (parseFloat(config.essayPoin) || 0)) + 
                         (tHT * (parseFloat(config.bonusHots) || 0));

        const resultPayload = {
            playerName: playerName,
            playerClass: sessionStorage.getItem('temp_class') || "Umum",
            playerNo: sessionStorage.getItem('temp_no') || "0",
            score: finalScore,
            maxScore: totalMax, // Tambahkan ini agar admin bisa hitung persentase
            duration: duration,
            date: firebase.database.ServerValue.TIMESTAMP,
            essayAnswers: userEssayAnswers // Tetap kirim ini untuk 'Lihat Detail Jawaban'
        };
        
        // Path sesuai keinginan Mas: di bawah sub-folder 'results' milik kuis terkait
        database.ref(`users/${adminIdGlobal}/quizzes/${quizId}/results`).push(resultPayload)
        .then(() => {
            console.log("Berhasil simpan ke Firebase Admin");
            // userEssayAnswers = []; // Opsional: bersihkan jika perlu
        })
        .catch(err => {
            console.error("Gagal simpan ke path admin:", err);
            // Backup simpan ke path publik jika path admin gagal (opsional)
            database.ref(`results/${quizId}`).push(resultPayload);
        });
    }
}

// Fungsi untuk meledakkan kembang api confetti
function launchConfetti() {
    var duration = 3 * 1000; // Durasi animasi 3 detik
    var end = Date.now() + duration;

    (function frame() {
        // Meledakkan dari sisi kiri dan kanan
        confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#6366f1', '#a855f7', '#ec4899'] // Gunakan warna tema ZingQuis Anda
        });
        confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#6366f1', '#a855f7', '#ec4899']
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

// 3. FUNGSI LEADERBOARD (Perbaikan untuk fitur Toggle)
function showLeaderboard() {
    const listContainer = document.getElementById('leaderboard-list');
    listContainer.innerHTML = "<p style='text-align:center;'>Memuat Peringkat...</p>";
    document.getElementById('leaderboard-section').classList.remove('hidden');
    document.getElementById('btn-leaderboard').classList.add('hidden');

    if (!adminIdGlobal) {
        listContainer.innerHTML = "<p style='text-align:center; color:red;'>Gagal memuat: Admin ID belum terdeteksi.</p>";
        return;
    }

    database.ref(`users/${adminIdGlobal}/quizzes/${quizId}/results`)
        .once('value', snapshot => {
            if (!snapshot.exists()) {
                listContainer.innerHTML = "<p style='text-align:center;'>Belum ada data skor.</p>";
                return;
            }

            let players = [];
            snapshot.forEach(child => { players.push(child.val()); });
            players.sort((a, b) => b.score - a.score || a.duration - b.duration);

            // Tampilkan daftar dengan class blur-item untuk peringkat > 5
            listContainer.innerHTML = players.map((p, i) => {
                const isBlurred = i >= 5 ? 'blur-item' : '';
                return `
                <div class="leaderboard-row ${isBlurred}" style="display: flex; justify-content: space-between; padding: 12px; background: ${i === 0 ? '#fff9c4' : '#f8f9fa'}; margin-bottom: 5px; border-radius: 8px; border: ${i === 0 ? '1px solid #fbc02d' : '1px solid #eee'};">
                    <span>
                        <b style="color: var(--accent);">${i+1}.</b> ${p.playerName} 
                        <small style="display:block; font-size: 0.7rem; color: #777;">Kls: ${p.playerClass || '-'} | No: ${p.playerNo || '-'}</small>
                    </span>
                    <span style="text-align: right;">
                        <b style="color: #27ae60;">${Math.round(p.score)}</b> 
                        <small style="color: #999;">/ ${p.maxScore || '?'}</small>
                        <br>
                        <small style="font-size: 0.7rem; color: #999;"><i class="fas fa-clock"></i> ${p.duration || 0}s</small>
                    </span>
                </div>
                `;
            }).join('');

            // Tombol Toggle (Hanya muncul jika lebih dari 5 siswa)
            if (players.length > 5 && !document.getElementById("toggle-btn")) {
                const toggleBtn = document.createElement('button');
                toggleBtn.id = "toggle-btn";
                toggleBtn.className = "btn-toggle";
                toggleBtn.innerText = "Lihat Semua Peringkat";
                toggleBtn.onclick = toggleLeaderboard;
                listContainer.parentNode.appendChild(toggleBtn);
            }
        });
}

function toggleLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    const btn = document.getElementById('toggle-btn');
    
    if (list.classList.contains('expanded')) {
        list.classList.remove('expanded');
        btn.innerText = "Lihat Semua Peringkat";
    } else {
        list.classList.add('expanded');
        btn.innerText = "Sembunyikan Peringkat Bawah";
    }
}

// FUNGSI BARU: Proses Verivikasi Sandi
window.prosesVerifikasiSandi = function() {
    const inputEl = document.getElementById('pass-input-siswa'); // Ambil elemennya
    const modalGate = document.getElementById('modal-gate-siswa');
    const setupContainer = document.getElementById('setup-container');

    if (!inputEl) return;
    const nilaiInput = inputEl.value.trim(); // Ambil nilainya di sini

    if (nilaiInput === window.targetPassword) {
        inputEl.style.borderColor = "#16a34a";
        inputEl.style.backgroundColor = "#f0fdf4";
        
        setTimeout(() => {
            if (modalGate) modalGate.style.display = 'none';
            if (setupContainer) setupContainer.classList.remove('hidden');

            // Panggil fungsi render yang kita buat di atas
            renderDataKeWaitingRoom(quizDataGlobal);
            
            if(typeof showNotif === "function") showNotif("Berhasil", "Akses kuis dibuka!");
        }, 300);

    } else {
        inputEl.style.borderColor = "#dc2626";
        inputEl.style.backgroundColor = "#fef2f2";
        
        inputEl.style.transform = "translateX(10px)";
        setTimeout(() => inputEl.style.transform = "translateX(-10px)", 100);
        setTimeout(() => inputEl.style.transform = "translateX(0)", 200);

        alert("❌ Sandi Salah! Silakan periksa kembali.");
        
        setTimeout(() => {
            inputEl.style.borderColor = "#eee";
            inputEl.style.backgroundColor = "white";
        }, 1000);
    }
};

// FUNGSI BARU: Untuk memisahkan logika render dari gate keamanan
function renderDataKeWaitingRoom(data) {
    if (!data) return;

    // 1. Simpan ke Global agar bisa diakses fungsi lain
    quizDataGlobal = data; 

    // 2. Isi Identitas Kuis (UI)
    const titleEl = document.getElementById('wait-quiz-title');
    const descEl = document.getElementById('wait-quiz-desc');
    if (titleEl) titleEl.innerText = data.title || "Kuis Tanpa Judul";
    if (descEl) descEl.innerText = data.desc || "Latihan soal interaktif.";

    // 3. Thumbnail
    const thumbImg = document.getElementById('wait-thumbnail');
    if (thumbImg && data.thumbnail) {
        thumbImg.src = data.thumbnail;
        thumbImg.style.display = 'block';
    }

    // --- IMPLEMENTASI POIN 3: INFO DEADLINE (Disesuaikan dengan Wrapper Baru) ---
    const deadlineWrapper = document.getElementById('deadline-wrapper');
    const deadlineInfo = document.getElementById('wait-deadline-info');

    if (data.deadline && deadlineInfo) {
        const d = new Date(data.deadline);
        const opsi = { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        const tanggalLokal = d.toLocaleDateString('id-ID', opsi);
        
        // Isi teks tanggal saja ke dalam info
        deadlineInfo.innerHTML = tanggalLokal;
        
        // Munculkan kotaknya (Wrapper)
        if (deadlineWrapper) deadlineWrapper.style.display = 'block';
    } else {
        // Sembunyikan kotaknya jika tidak ada deadline
        if (deadlineWrapper) deadlineWrapper.style.display = 'none';
    }

    // 4. Durasi & Aturan (Perbaikan Badge)
    quizDurationMode = data.durationMode || 'timer';
    quizDurationValue = parseInt(data.durationValue) || 60;

    const ruleText = document.getElementById('rule-timer');
    const badge = document.getElementById('quiz-mode-badge');

    if (quizDurationMode === 'timer') {
        if (badge) {
            badge.innerHTML = '<i class="fas fa-stopwatch"></i> Mode Timer';
            badge.style.background = 'rgba(255,255,255,0.2)';
            badge.style.display = 'inline-block';
        }
        if (ruleText) ruleText.innerHTML = `<i class="fas fa-clock" style="color: var(--accent); width: 25px;"></i> Waktu: ${quizDurationValue} detik per soal.`;
    } else {
        if (badge) {
            badge.innerHTML = '<i class="fas fa-house-user"></i> Mode PR';
            badge.style.background = '#8458B3';
            badge.style.display = 'inline-block';
        }
        if (ruleText) ruleText.innerHTML = `<i class="fas fa-mug-hot" style="color: var(--accent); width: 25px;"></i> Mode PR: Tidak ada batas waktu.`;
    }

    // 5. Load Soal
    if (data.questions) {
        questions = Object.values(data.questions);
        if (typeof renderQuizHeader === "function") renderQuizHeader(data);
    } else if (adminIdGlobal && quizId) {
        database.ref(`users/${adminIdGlobal}/quizzes/${quizId}/questions`).once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    questions = Object.values(snapshot.val());
                    if (typeof renderQuizHeader === "function") renderQuizHeader(data);
                }
            });
    }

    // 6. Kontrol Setup Container & Avatar
    const setupContainer = document.getElementById('setup-container');
    const avBox = document.getElementById('avatar-box');

    if (setupContainer) {
        setupContainer.classList.remove('hidden');
        
        // Cek Tipe Akses
        if (data.accessType === 'private') {
            if (typeof initAvatarSystem === "function") initAvatarSystem(); 
        } else {
            if (avBox) avBox.style.display = 'none';
        }
    }
}

// Letakkan di paling bawah file kuis-script.js
function initAvatarSystem() {
    const grid = document.getElementById('avatar-grid');
    const box = document.getElementById('avatar-box');
    if (!grid || !box) return;

    box.style.display = 'block';
    const seeds = ["Felix", "Anya", "Buddy", "Max", "Loki", "Coco", "Mochi", "Zorro", "Bibi", "Kiki", "Panda", "Momo"];
    grid.innerHTML = "";

    seeds.forEach((seed, index) => {
        const url = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
        const img = document.createElement('img');
        img.src = url;
        img.style = "width:100%; aspect-ratio:1/1; object-fit:cover; border-radius:50%; border:3px solid transparent; cursor:pointer; transition:0.3s; background:white; padding:2px;";
        img.id = `av-${index}`;
        
        img.onclick = function() {
            selectedAvatarUrl = url;
            document.querySelectorAll('#avatar-grid img').forEach(i => {
                i.style.borderColor = "transparent";
                i.style.transform = "scale(1)";
            });
            img.style.borderColor = "var(--accent)";
            img.style.transform = "scale(1.1)";
        };

        if (index === 0) {
            img.style.borderColor = "var(--accent)";
            selectedAvatarUrl = url;
        }

        grid.appendChild(img);
    });
}

function listenToPlayersRealtime() {
    const listContainer = document.getElementById('player-list-container');
    const waitingArea = document.getElementById('waiting-room-area');
    
    if (!listContainer || !waitingArea) return;
    
    // Munculkan area waiting room
    waitingArea.style.display = 'block';

    // Pantau pemain yang masuk ke kuis ini
    database.ref(`presence/${quizId}`).on('value', (snapshot) => {
        listContainer.innerHTML = "";
        const players = snapshot.val();
        
        if (players) {
            Object.values(players).forEach(p => {
                const bubble = document.createElement('div');
                bubble.className = "player-bubble"; // Gunakan class CSS animasi popIn tadi
                bubble.innerHTML = `
                    <img src="${p.avatar}" alt="avatar">
                    <span style="display: block; font-size: 0.65rem; font-weight: 600; color: #475569; margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #e2e8f0; padding: 2px 5px; border-radius: 10px;">
                        ${p.name}
                    </span>
                `;
                listContainer.appendChild(bubble);
            });
        }
    });
}

function runScheduledCountdown(targetTime) {
    const display = document.getElementById('waiting-countdown');
    const btnStart = document.getElementById('btn-start-manual');
    const countdownWrapper = document.getElementById('countdown-wrapper');

    const timer = setInterval(() => {
        const sekarang = Date.now();
        const selisih = targetTime - sekarang;
        
        if (selisih <= 0) {
            clearInterval(timer);
            if (display) display.innerText = "GO!";
            if (btnStart) {
                btnStart.disabled = false;
                btnStart.innerText = "Mulai Sekarang!";
            }
            // Opsi: Jika ingin kuis otomatis mulai saat waktu habis, hapus komentar baris bawah:
            // realStart(); 
            return;
        }

        const totalDetik = Math.floor(selisih / 1000);
        const menit = Math.floor(totalDetik / 60);
        const detik = totalDetik % 60;
        
        if (display) {
            display.innerText = menit > 0 ? `${menit}:${detik.toString().padStart(2, '0')}` : detik;
        }
    }, 1000);
}

// --- FUNGSI DASHBOARD REVIEW (SPION) ---

function enterReviewPhase() {
    // 1. Matikan timer soal yang sedang berjalan
    if (timerInterval) clearInterval(timerInterval);
    isReviewPhase = true;

    // 2. Hitung Sisa Bank Waktu: (Kapasitas Total - Waktu yang Sudah Terpakai)
    const reviewTimeLimit = totalAllocatedTime - timeUsedAccumulated;

    // 3. Jika waktu sudah benar-benar habis, langsung finish
    if (reviewTimeLimit <= 0) {
        alert("Waktu pengerjaan telah habis!");
        finishQuiz();
        return;
    }

    // 4. Ganti Tampilan: Sembunyikan Kuis, Munculkan Dashboard
    const quizArea = document.getElementById('quiz-area');
    const reviewArea = document.getElementById('review-dashboard'); // Pastikan ID ini ada di HTML
    
    if(quizArea) quizArea.classList.add('hidden');
    if(reviewArea) {
        reviewArea.classList.remove('hidden');
        renderReviewGrid(); // Gambar kotak-kotak nomor
        startGlobalReviewTimer(reviewTimeLimit); // Mulai hitung mundur global
    }
}

function renderReviewGrid() {
    const gridContainer = document.getElementById('review-grid');
    if (!gridContainer) return;

    // 1. Tambahkan Teks Panduan di atas grid (jika belum ada)
    gridContainer.innerHTML = `
        <p style="grid-column: 1 / -1; text-align: center; color: #7f8c8d; font-size: 0.85rem; margin-bottom: 15px;">
            <i class="fas fa-info-circle"></i> Klik nomor soal untuk mengecek atau mengubah jawabanmu.
        </p>
    `;

    // 2. Sesuaikan Layout Grid agar responsif
    gridContainer.style.display = 'grid';

    // Ini kuncinya: 
    // auto-fit = penuhi baris yang tersedia
    // 40px = ukuran tetap supaya tidak kekecilan di HP
    gridContainer.style.gridTemplateColumns = 'repeat(auto-fit, 40px)'; 

    gridContainer.style.gap = '12px'; 
    gridContainer.style.justifyContent = 'center'; // Menarik semua lingkaran ke tengah baris
    gridContainer.style.margin = '0 auto'; 
    gridContainer.style.padding = '10px'; // Jarak aman agar tidak nempel pinggir layar HP

    questions.forEach((q, index) => {
        const log = userAnswersLog[index];
        const isAnswered = log && log.jawabanUser !== "Waktu Habis";
        
        const box = document.createElement('div');
        box.className = 'review-box';
        box.innerText = index + 1;
        
        // --- STYLING LINGKARAN & SOFT COLOR ---
        box.style.width = '40px';
        box.style.height = '40px';
        box.style.lineHeight = '40px'; // Agar angka pas di tengah vertikal
        box.style.borderRadius = '50%'; // Membuat jadi lingkaran sempurna
        box.style.textAlign = 'center';
        box.style.fontWeight = '600';
        box.style.fontSize = '0.9rem';
        box.style.cursor = 'pointer';
        box.style.transition = 'all 0.3s ease';
        
        if (isAnswered) {
            // Warna Biru/Ungu Soft (Bisa disesuaikan dengan var(--accent) Mas)
            box.style.background = '#d6d6d6'; 
            box.style.color = '#60566d';
            box.style.border = '2px solid #adadad';
        } else {
            // Warna Abu-abu Soft untuk yang kosong
            box.style.background = '#f8f9fa';
            box.style.color = '#bdc3c7';
            box.style.border = '2px solid #ecf0f1';
        }

        // Efek Hover agar lebih hidup
        box.onmouseover = () => {
            box.style.transform = 'scale(1.1)';
            box.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
        };
        box.onmouseout = () => {
            box.style.transform = 'scale(1)';
            box.style.boxShadow = 'none';
        };

        box.onclick = () => jumpToQuestion(index);
        
        gridContainer.appendChild(box);
    });
}

function startGlobalReviewTimer(seconds) {
    // Jika timer sebelumnya masih jalan, hentikan dulu
    if (reviewTimerInterval) clearInterval(reviewTimerInterval);

    let timeLeftReview = Math.floor(seconds);
    const display = document.getElementById('review-timer');

    reviewTimerInterval = setInterval(() => {
        const minutes = Math.floor(timeLeftReview / 60);
        const secs = timeLeftReview % 60;

        if (display) {
            display.innerText = `${minutes < 10 ? '0' : ''}${minutes}:${secs < 10 ? '0' : ''}${secs}`;
        }

        if (timeLeftReview <= 0) {
            clearInterval(reviewTimerInterval);
            alert("Waktu Review Telah Habis!");
            finishQuiz();
        }

        timeLeftReview--;
    }, 1000);
}

function jumpToQuestion(index) {
    // 1. Set index soal ke yang dipilih
    currentQuestionIndex = index;

    // 2. Sembunyikan Dashboard Review, Munculkan Area Kuis
    const reviewArea = document.getElementById('review-dashboard');
    const quizArea = document.getElementById('quiz-area');
    
    if(reviewArea) reviewArea.classList.add('hidden');
    if(quizArea) quizArea.classList.remove('hidden');

    // 3. Tampilkan Soal
    showQuestion();
    
    // 4. [PENTING] Karena ini Mode Review, matikan timer per soal
    // Agar tidak mengganggu Timer Global yang sedang jalan di background
    clearInterval(timerInterval);
    const timerDisplay = document.getElementById('timer');
    if(timerDisplay) timerDisplay.innerText = "Mode Review";
}