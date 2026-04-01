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

// PERBAIKAN: Fungsi showQuestion dengan Dukungan Gambar Soal
function showQuestion() {
    if (currentQuestionIndex < questions.length) {
        // 1. UPDATE PROGRESS BAR
        const progress = (currentQuestionIndex / questions.length) * 100;
        const progressFill = document.getElementById('progress-fill');
        if(progressFill) progressFill.style.width = `${progress}%`;

        const q = questions[currentQuestionIndex];
        const dataLama = userAnswersLog[currentQuestionIndex];
        
        // 2. UPDATE INFO NOMOR & TEKS SOAL
        const qNumberEl = document.getElementById('q-number');
        if(qNumberEl) qNumberEl.innerText = `Soal ${currentQuestionIndex + 1} dari ${questions.length}`;

        const qTextEl = document.getElementById('q-text');
        if(qTextEl) {
            // Gunakan innerHTML karena data dari Admin (Quill) berbentuk HTML
            let content = q.question || q.text || "Soal tidak ditemukan";
            
            // --- LOGIKA PENAMBAHAN GAMBAR (FITUR BARU) ---
            // Jika ada properti image di database, kita tambahkan elemen img
            if (q.image && q.image !== "") {
                content += `
                    <div class="question-image-container" style="margin-top: 15px; margin-bottom: 15px; text-align: center;">
                        <img src="${q.image}" alt="Ilustrasi Soal" 
                             style="max-width: 100%; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 2px solid #f3ebff;">
                    </div>
                `;
            }

            // Tambahkan badge HOTS jika ada
            if (q.isHots || q.tipe_soal === "HOTS") {
                content = `<span class="badge-hots"><i class="fas fa-fire"></i> SOAL TANTANGAN (HOTS)</span><br>${content}`;
            }
            
            qTextEl.innerHTML = content;
        }

        const container = document.getElementById('options-container');
        container.innerHTML = '';

        const isEssay = (quizDataGlobal && quizDataGlobal.quizType === 'essay') || q.type === 'essay';

        // 3. RENDER INPUT BERDASARKAN TIPE (ESSAY / PG)
        if (isEssay) {
            const essayWrapper = document.createElement('div');
            essayWrapper.style.width = '100%';

            const teksLama = dataLama ? dataLama.jawabanUser : "";

            essayWrapper.innerHTML = `
                <textarea id="answer-essay" placeholder="Ketik jawaban kamu di sini..." 
                    style="width:100%; min-height:150px; padding:15px; border:2px solid #eef0f7; border-radius:12px; font-family:inherit; font-size:1rem; outline:none; transition:0.3s; margin-bottom: 20px;">${teksLama}</textarea>
                <button class="option-btn" id="submit-essay-btn" 
                    style="background:#8458B3; color:white; width:100%; font-weight:600;" 
                    onclick="handleEssayAnswer()">Simpan Jawaban & Lanjut</button>
            `;
            container.appendChild(essayWrapper);

        } else {
            // RENDERING PILIHAN GANDA (PG)
            const options = q.options || [];
            const labelOpsi = ["A", "B", "C", "D", "E"];

            options.forEach((opt, index) => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.id = `opt-${index}`;
                btn.innerHTML = `
                    <span class="option-label">${labelOpsi[index]}</span>
                    <span class="option-text">${opt}</span>
                `;

                if (dataLama && dataLama.indexJawabanUser === index) {
                    btn.style.background = "#8458B3"; 
                    btn.style.color = "white";
                    btn.style.borderColor = "#8458B3";
                    btn.classList.add('selected');
                }

                btn.onclick = () => handleAnswer(index);
                container.appendChild(btn);
            });
        }

        // 4. UPDATE NAVIGASI BAWAH
        if (typeof updatePagination === 'function') updatePagination();

        // 5. LOGIKA TIMER & DEADLINE
        const timerBox = document.getElementById('timer-box');
        
        if (quizDurationMode === 'timer') {
            if (timerBox) {
                timerBox.style.display = 'block';
                if (typeof isReviewPhase !== 'undefined' && isReviewPhase) {
                    timerBox.innerHTML = `<span style="color: #8458B3;"><i class="fas fa-clock"></i> Sisa Waktu Review: <span id="review-timer-floating"></span></span>`;
                    timerBox.style.background = "#f3ebff";
                    timerBox.style.padding = "8px 15px";
                    timerBox.style.borderRadius = "10px";
                    clearInterval(timerInterval); 
                } else {
                    timerBox.innerHTML = `<i class="fas fa-hourglass-half"></i> Sisa Waktu: <span id="timer-display">${quizDurationValue}</span> detik`;
                    timerBox.style.background = "transparent";
                    timerBox.style.color = "var(--accent)";
                    startTimer(); 
                }
            }
        } else {
            if (quizDataGlobal && quizDataGlobal.deadline) {
                const d = new Date(quizDataGlobal.deadline);
                const formatLengkap = d.toLocaleDateString('id-ID', { 
                    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
                });
                
                if (timerBox) {
                    timerBox.style.display = 'block';
                    timerBox.innerHTML = `<i class="fas fa-calendar-alt"></i> Batas: ${formatLengkap}`;
                    timerBox.style.fontSize = "0.85rem";
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

    const durasiSet = parseFloat(window.currentConfig?.durasiSoal) || 60;
    const detikTerpakai = durasiSet - timeLeft; 
    timeUsedAccumulated += detikTerpakai; 

    if (userAnswersLog[currentQuestionIndex]) {
        score -= (userAnswersLog[currentQuestionIndex].poin || 0);
    }

    const pointsPerBenar = parseFloat(window.currentConfig?.pgPoin) || 0;
    const pointsBonusHots = parseFloat(window.currentConfig?.bonusHots) || 0;

    let poinDidapat = 0;
    let isCorrect = false;

    if (selectedIndex !== null && selectedIndex === q.answer) {
        isCorrect = true;
        poinDidapat = pointsPerBenar + (q.isHots ? pointsBonusHots : 0);
        score += poinDidapat;
    }

    // --- MODIFIKASI: EFEK VISUAL NETRAL ---
    if (selectedIndex !== null && buttons[selectedIndex]) {
        // Beri warna Ungu (Branding) sebagai tanda "Sudah Dipilih"
        buttons[selectedIndex].style.background = "#8458B3";
        buttons[selectedIndex].style.color = "white";
        buttons[selectedIndex].style.borderColor = "#8458B3";
        
        // Getar halus tetap ada sebagai feedback input
        if (navigator.vibrate) navigator.vibrate(50);
    }

    // Catat log (Tetap simpan status Benar/Salah untuk Review nanti)
    const labelOpsi = ["A", "B", "C", "D", "E"];
    const teksJawabanUser = (selectedIndex !== null) ? q.options[selectedIndex] : "Waktu Habis";
    
    const logData = {
        no: currentQuestionIndex + 1,
        soal: q.question || q.text,
        jawabanUser: (selectedIndex !== null) ? `${labelOpsi[selectedIndex]}. ${teksJawabanUser}` : "Waktu Habis",
        indexJawabanUser: selectedIndex, // Simpan index untuk mempermudah render review
        kunciIndex: q.answer,           // Simpan kunci untuk pembanding di review
        isHots: q.isHots || false,
        type: "pg",
        poin: poinDidapat, 
        status: isCorrect ? "Benar" : (selectedIndex === null ? "Waktu Habis" : "Salah")
    };

    userAnswersLog[currentQuestionIndex] = logData; 

    // Jeda lebih singkat (500ms) agar kuis terasa cepat/snappy
    setTimeout(() => {
        if (currentQuestionIndex < questions.length - 1) {
            currentQuestionIndex++;
            showQuestion();
        } else {
            enterReviewPhase(); 
        }
    }, 500); 
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

    const durasiSet = parseFloat(window.currentConfig.durasiSoal) || 60;
    const detikTerpakai = durasiSet - timeLeft;
    timeUsedAccumulated += detikTerpakai;

    if (userAnswersLog[currentQuestionIndex]) {
        score -= (userAnswersLog[currentQuestionIndex].poin || 0);
    }   

    const pointsEssay = parseFloat(window.currentConfig.essayPoin) || 0;
    const pointsBonusHots = parseFloat(window.currentConfig.bonusHots) || 0;

    // Logika validasi (Tetap simpan yang sudah Mas buat)
    const userClean = answerText.toLowerCase().replace(/\s+/g, ' ');
    const officialAnswer = (q.answer || "").toString().toLowerCase().replace(/\s+/g, ' ');
    const validAlternatives = officialAnswer.split(',').map(item => item.trim());

    let isCorrect = false;
    if (validAlternatives.includes(userClean)) {
        isCorrect = true;
    } else {
        const keywords = validAlternatives[0].split(' ').filter(word => word.length > 2);
        if (keywords.length > 0 && keywords.every(word => userClean.includes(word))) {
            isCorrect = true;
        }
    }

    let poinDidapat = isCorrect ? (pointsEssay + (q.isHots ? pointsBonusHots : 0)) : 0;
    if (isCorrect) score += poinDidapat;

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

    userAnswersLog[currentQuestionIndex] = logData;

    // Efek visual tombol simpan (Netral/Sukses)
    const btn = document.getElementById('submit-essay-btn');
    if(btn) {
        btn.disabled = true;
        btn.style.background = "#8458B3"; // Gunakan warna branding
        btn.innerText = "Tersimpan...";
    }

    setTimeout(() => {
        if (currentQuestionIndex < questions.length - 1) {
            currentQuestionIndex++;
            showQuestion();
        } else {
            enterReviewPhase();
        }
    }, 600);
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

    // 5. RINGKASAN TEKS & TOMBOL PEMBAHASAN
    let summaryHTML = `Hebat, ${playerName}! Kamu selesai dalam ${duration.toFixed(1)} detik.`;
    summaryHTML += `<br>Skor kamu: <b>${finalScore}</b> dari maksimal <b>100</b> poin.`;

    // TAMBAHKAN TOMBOL INI:
    summaryHTML += `
    <div style="margin-top: 25px; display: flex; flex-direction: column; gap: 10px;">
        <button onclick="bukaPembahasan()" class="option-btn" 
            style="background: #2ecc71; color: white; border: none; width: 100%; font-weight: 600;">
            <i class="fas fa-book-open"></i> Lihat Pembahasan (Benar/Salah)
        </button>
    </div>
    
    <div id="review-pembahasan-area" class="hidden" style="margin-top: 30px; text-align: left;">
        <h3 style="color: #8458B3; border-bottom: 2px solid #f3ebff; padding-bottom: 10px;">
            <i class="fas fa-spell-check"></i> Lembar Pembahasan
        </h3>

        <div style="display: flex; gap: 10px; margin: 15px 0;">
            <button onclick="filterReview('all')" id="btn-filter-all" 
                style="flex:1; padding: 8px; border-radius: 8px; border: 1px solid #8458B3; background: #8458B3; color: white; cursor: pointer; font-size: 0.8rem; font-weight: 600;">
                Semua
            </button>
            <button onclick="filterReview('wrong')" id="btn-filter-wrong" 
                style="flex:1; padding: 8px; border-radius: 8px; border: 1px solid #eee; background: white; color: #666; cursor: pointer; font-size: 0.8rem; font-weight: 600;">
                Hanya Salah
            </button>
        </div>

        <div id="review-list-container" style="margin-top: 15px;"></div>
    </div>
`;

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
    // 1. Matikan timer per soal yang sedang berjalan
    if (timerInterval) clearInterval(timerInterval);
    isReviewPhase = true;

    // 2. Hitung Sisa Waktu Global (Total dikurangi yang sudah terpakai)
    const reviewTimeLimit = totalAllocatedTime - timeUsedAccumulated;

    if (reviewTimeLimit <= 0) {
        alert("Waktu pengerjaan telah habis!");
        finishQuiz();
        return;
    }

    // 3. SEMBUNYIKAN Floating Timer (agar tidak dobel tampilan saat di dashboard review)
    const floatingTimer = document.getElementById('global-review-info');
    if (floatingTimer) floatingTimer.classList.add('hidden');

    // 4. Jalankan Timer Global "Sisa Waktu"
    // Fungsi ini akan mengupdate baik 'review-timer' (kotak besar) maupun 'review-timer-floating' (melayang)
    startGlobalReviewTimer(reviewTimeLimit);

    // 5. Tampilkan Halaman Konfirmasi (Review Dashboard)
    const quizArea = document.getElementById('quiz-area');
    const reviewArea = document.getElementById('review-dashboard'); 
    
    if(quizArea) quizArea.classList.add('hidden');
    
    if(reviewArea) {
        reviewArea.classList.remove('hidden');
        reviewArea.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; background: white; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
                <div id="review-timer-container" style="background: #fff5f5; padding: 20px; border-radius: 15px; margin-bottom: 25px; border: 2px solid #feb2b2;">
                    <p style="margin:0; color: #c53030; font-weight: 600; font-size: 0.9rem; letter-spacing: 1px;">SISA WAKTU REVIEW</p>
                    <span id="review-timer" style="font-size: 2.5rem; font-weight: 800; color: #c53030;">00:00</span>
                </div>

                <h2 style="color: #333; margin-bottom: 10px;">Luar Biasa, Selesai!</h2>
                <p style="color: #666; margin-bottom: 30px; line-height: 1.6;">
                    Semua soal telah dijawab. Kamu masih punya waktu sisa untuk memeriksa kembali jawabanmu atau langsung kirim nilai sekarang.
                </p>
                
                <button onclick="backToQuiz()" class="option-btn" style="background: white; color: #8458B3; border: 2px solid #8458B3; margin-bottom: 15px; width: 100%; font-weight: 600; transition: 0.3s;">
                    <i class="fas fa-search"></i> Periksa Kembali Jawaban
                </button>
                
                <button onclick="finishQuiz()" class="option-btn" style="background: #8458B3; color: white; width: 100%; font-weight: 600; box-shadow: 0 5px 15px rgba(132, 88, 179, 0.3); transition: 0.3s;">
                    <i class="fas fa-flag-checkered"></i> Selesai & Lihat Hasil
                </button>
            </div>
        `;
    }
}

// Fungsi pembantu untuk kembali ke kuis
function backToQuiz() {
    // Sembunyikan Dashboard Review
    document.getElementById('review-dashboard').classList.add('hidden');
    
    // Munculkan Area Soal
    document.getElementById('quiz-area').classList.remove('hidden');
    
    // MUNCULKAN Floating Timer di halaman soal
    const floatingTimer = document.getElementById('global-review-info');
    if(floatingTimer) floatingTimer.classList.remove('hidden');

    showQuestion();
}

function startGlobalReviewTimer(seconds) {
    if (reviewTimerInterval) clearInterval(reviewTimerInterval);

    let timeLeftReview = Math.floor(seconds);

    reviewTimerInterval = setInterval(() => {
        const minutes = Math.floor(timeLeftReview / 60);
        const secs = timeLeftReview % 60;
        const timeStr = `${minutes < 10 ? '0' : ''}${minutes}:${secs < 10 ? '0' : ''}${secs}`;

        // 1. Update Kotak Besar di Dashboard (Jika sedang terlihat)
        const displayDashboard = document.getElementById('review-timer');
        if (displayDashboard) displayDashboard.innerText = timeStr;
        
        // 2. Update Floating Timer di Soal (Jika sedang terlihat)
        const displayFloating = document.getElementById('review-timer-floating');
        if (displayFloating) displayFloating.innerText = timeStr;

        // Efek Kritis: Jika sisa waktu < 60 detik, beri kelas animasi
        const floatingContainer = document.getElementById('global-review-info');
        if (timeLeftReview <= 60 && floatingContainer) {
            floatingContainer.classList.add('timer-critical');
        }

        if (timeLeftReview <= 0) {
            clearInterval(reviewTimerInterval);
            alert("Waktu Review Telah Habis!");
            finishQuiz();
        }

        timeLeftReview--;
    }, 1000);
}

function updatePagination() {
    const navContainer = document.getElementById('quiz-pagination');
    if (!navContainer) return;

    navContainer.innerHTML = '';
    questions.forEach((_, index) => {
        const btn = document.createElement('button');
        btn.innerText = index + 1;
        
        // Style dasar nomor soal
        btn.className = (index === currentQuestionIndex) ? 'nav-btn active' : 'nav-btn';
        
        // Tandai jika sudah dijawab (agar siswa tahu mana yang terlewat)
        if (userAnswersLog[index]) {
            btn.classList.add('answered');
        }

        btn.onclick = () => {
            currentQuestionIndex = index;
            showQuestion();
        };
        navContainer.appendChild(btn);
    });
}

window.bukaPembahasan = function() {
    const area = document.getElementById('review-pembahasan-area');
    if(area) {
        area.classList.remove('hidden');
        // Animasi halus saat muncul
        area.style.opacity = "0";
        area.style.transition = "opacity 0.5s ease";
        setTimeout(() => area.style.opacity = "1", 10);
    }
    
    const container = document.getElementById('review-list-container');
    if(!container) return;

    container.innerHTML = ''; // Reset isi agar tidak duplikat saat diklik ulang

    questions.forEach((q, index) => {
        const log = userAnswersLog[index];
        const isPG = q.type === 'pg' || !q.type;
        
        const card = document.createElement('div');
        card.className = 'review-card'; // Tambahkan class untuk CSS
        
        // --- LOGIKA FILTER STATUS ---
        const isCorrect = log && (log.status === "Benar" || log.status === "Benar (Otomatis)");
        card.setAttribute('data-status', isCorrect ? 'correct' : 'wrong');

        card.style = `
            background: #fff; 
            padding: 20px; 
            border-radius: 15px; 
            margin-bottom: 15px; 
            border: 1px solid #eee;
            box-shadow: 0 4px 12px rgba(0,0,0,0.03);
            border-left: 5px solid ${isCorrect ? '#27ae60' : '#e74c3c'};
        `;

        // Tentukan Header (Nomor & Icon Status)
        let statusHeader = "";
        if (log) {
            statusHeader = isCorrect 
                ? `<span style="color:#27ae60; font-weight:600;"><i class="fas fa-check-circle"></i> Benar</span>`
                : `<span style="color:#e74c3c; font-weight:600;"><i class="fas fa-times-circle"></i> Salah</span>`;
        } else {
            statusHeader = `<span style="color:#95a5a6;"><i class="fas fa-exclamation-circle"></i> Kosong</span>`;
        }

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="background:#f3ebff; color:#8458B3; padding:4px 12px; border-radius:20px; font-size:0.85rem; font-weight:bold;">Soal ${index + 1}</span>
                ${statusHeader}
            </div>
            <div style="margin-bottom:15px; line-height:1.5; color:#333; font-weight:500;">${q.question || q.text}</div>
            <div id="opsi-review-${index}"></div>
        `;

        container.appendChild(card);

        // Render Detail Opsi (PG) atau Jawaban (Essay)
        const targetOpsi = document.getElementById(`opsi-review-${index}`);
        if (isPG) {
            renderOptionsReview(targetOpsi, q, log);
        } else {
            renderEssayReview(targetOpsi, q, log);
        }
    });

    // Scroll otomatis ke area pembahasan dengan sedikit offset agar tidak terlalu mepet
    const yOffset = -20; 
    const y = area.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
};

// JANGAN LUPA: Tambahkan fungsi filter ini juga agar tombol tab berfungsi
window.filterReview = function(type) {
    const allCards = document.querySelectorAll('.review-card');
    const btnAll = document.getElementById('btn-filter-all');
    const btnWrong = document.getElementById('btn-filter-wrong');

    allCards.forEach(card => {
        const isCorrect = card.getAttribute('data-status') === 'correct';
        if (type === 'all') {
            card.style.display = 'block';
        } else {
            card.style.display = isCorrect ? 'none' : 'block';
        }
    });

    // Styling tombol saat aktif
    if (type === 'all') {
        btnAll.style.background = "#8458B3"; btnAll.style.color = "white";
        btnWrong.style.background = "white"; btnWrong.style.color = "#666";
    } else {
        btnWrong.style.background = "#e74c3c"; btnWrong.style.color = "white";
        btnAll.style.background = "white"; btnAll.style.color = "#666";
    }
};

function renderOptionsReview(target, soal, log) {
    const labelOpsi = ["A", "B", "C", "D", "E"];
    const kunciIndex = soal.answer; // Index jawaban benar dari database
    const userIndex = log ? log.indexJawabanUser : null; // Index yang diklik user

    soal.options.forEach((opt, idx) => {
        let bgColor = "#ffffff";
        let textColor = "#494D5F";
        let borderColor = "#eef0f7";
        let icon = "";

        // 1. Jika ini adalah KUNCI JAWABAN (Harus Hijau)
        if (idx === kunciIndex) {
            bgColor = "#d1fae5"; 
            textColor = "#065f46";
            borderColor = "#34d399";
            icon = '<i class="fas fa-check" style="margin-left:auto; color:#10b981;"></i>';
        } 
        // 2. Jika ini pilihan USER tapi SALAH (Merah)
        else if (userIndex !== null && idx === userIndex && idx !== kunciIndex) {
            bgColor = "#fee2e2"; 
            textColor = "#991b1b";
            borderColor = "#f87171";
            icon = '<i class="fas fa-times" style="margin-left:auto; color:#ef4444;"></i>';
        }

        const div = document.createElement('div');
        div.style = `
            display: flex; align-items: center; padding: 12px 15px; 
            margin-bottom: 8px; border-radius: 10px; font-size: 0.95rem;
            background: ${bgColor}; color: ${textColor}; border: 1.5px solid ${borderColor};
            transition: 0.3s;
        `;
        
        // Beri penebalan jika ini pilihan user atau kunci
        if (idx === kunciIndex || idx === userIndex) div.style.fontWeight = "600";

        div.innerHTML = `
            <span style="margin-right:12px; font-weight:bold; opacity:0.5;">${labelOpsi[idx]}</span>
            <span>${opt}</span>
            ${icon}
        `;
        target.appendChild(div);
    });
}

function renderEssayReview(target, soal, log) {
    target.innerHTML = `
        <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
            <div style="background:#f8f9fa; padding:12px; border-radius:10px; border-left:4px solid #8458B3;">
                <small style="color:#888; font-weight:bold; text-transform:uppercase; font-size:0.7rem;">Jawaban Kamu:</small>
                <div style="color:#444; margin-top:3px;">${log ? log.jawabanUser : '<i>(Tidak dijawab)</i>'}</div>
            </div>
            <div style="background:#f0fff4; padding:12px; border-radius:10px; border-left:4px solid #2ecc71;">
                <small style="color:#888; font-weight:bold; text-transform:uppercase; font-size:0.7rem;">Kunci Jawaban:</small>
                <div style="color:#065f46; margin-top:3px; font-weight:600;">${soal.answer}</div>
            </div>
        </div>
    `;
}

window.filterReview = function(type) {
    const allCards = document.querySelectorAll('.review-card');
    const btnAll = document.getElementById('btn-filter-all');
    const btnWrong = document.getElementById('btn-filter-wrong');

    allCards.forEach(card => {
        const isCorrect = card.getAttribute('data-status') === 'correct';
        
        if (type === 'all') {
            card.style.display = 'block';
        } else {
            // Jika filter 'wrong', sembunyikan yang benar
            card.style.display = isCorrect ? 'none' : 'block';
        }
    });

    // Update Styling Tombol Tab
    if (type === 'all') {
        btnAll.style.background = "#8458B3"; btnAll.style.color = "white";
        btnWrong.style.background = "white"; btnWrong.style.color = "#666";
    } else {
        btnWrong.style.background = "#e74c3c"; btnWrong.style.color = "white"; btnWrong.style.border = "1px solid #e74c3c";
        btnAll.style.background = "white"; btnAll.style.color = "#666"; btnAll.style.border = "1px solid #eee";
    }
};