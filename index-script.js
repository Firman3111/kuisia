// 1. Inisialisasi Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDoo_WtH6JbT0KvMzmud5Ew_TpEjgFGqhU",
    authDomain: "fir-kuis-23368.firebaseapp.com",
    databaseURL: "https://fir-kuis-23368-default-rtdb.asia-southeast1.firebasedatabase.app"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
// index-script.js
const database = firebase.database();
const auth = firebase.auth(); // Sekarang ini tidak akan error lagi!

let allQuizzes = [];      
let displayedCount = 12;  
let authorCache = {};

// 2. Fungsi Utility & Animasi
function animateCounter(counter) {
    const target = +counter.getAttribute('data-target');
    let count = 0;
    const speed = 100;
    const updateCount = () => {
        const inc = target / speed;
        if (count < target) {
            count += inc;
            counter.innerText = Math.ceil(count).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "+";
            setTimeout(updateCount, 20);
        } else {
            counter.innerText = target.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "+";
        }
    };
    updateCount();
}

function submitRating(ratingValue) {
    const ratingRef = database.ref('platform_rating');
    ratingRef.transaction((currentData) => {
        if (currentData === null) return { total_rating: ratingValue, total_votes: 1 };
        let newVotes = (currentData.total_votes || 0) + 1;
        let newRating = (((currentData.total_rating || 0) * (currentData.total_votes || 0)) + ratingValue) / newVotes;
        return { total_rating: newRating, total_votes: newVotes };
    });
}

// 3. Fungsi Global untuk Like (agar bisa diakses dari HTML)
// RAPIKAN: Gabungkan Fungsi Like menjadi satu saja (Gunakan versi ini)
window.likeQuiz = function(userId, quizId) {
    if (localStorage.getItem(`liked_${quizId}`)) {
        showCustomAlert("Sudah Disukai", "Terima kasih! Anda sudah menyukai kuis ini sebelumnya.", "warning");
        return;
    }

    const likeRef = database.ref(`users/${userId}/quizzes/${quizId}/likes`);
    // Gunakan increment agar aman dari konflik data
    likeRef.transaction((currentLikes) => (currentLikes || 0) + 1)
    .then(() => {
        localStorage.setItem(`liked_${quizId}`, true);
        showCustomAlert("Berhasil!", "Kuis ini telah masuk ke daftar favorit Anda.", "success");

        const btn = document.getElementById(`btn-like-${quizId}`);
        if (btn) {
            btn.querySelector('i').className = 'fas fa-heart';
            if(btn) btn.style.color = '#ff4757';
            
            // Update angka di UI secara instan (opsional)
            const likeText = document.querySelector(`#like-${quizId}`);
            if(likeText) likeText.innerText = parseInt(likeText.innerText) + 1;
        }
    });
};

// Fungsi pembantu untuk membuat gradien warna yang konsisten berdasarkan teks
function generateGradient(str) {
    const colors = [
        ['#ff9a9e', '#fecfef'], ['#a1c4fd', '#c2e9fb'], 
        ['#84fab0', '#8fd3f4'], ['#fccb90', '#d57eeb'],
        ['#e0c3fc', '#8ec5fc'], ['#f093fb', '#f5576c']
    ];
    // Pilih indeks warna berdasarkan panjang karakter judul
    const index = str.length % colors.length;
    return `linear-gradient(135deg, ${colors[index][0]} 0%, ${colors[index][1]} 100%)`;
}

function renderQuizzes(quizzes, searchTerm = "", targetId = 'quiz-list') {
    const quizContainer = document.getElementById(targetId);
    if (!quizContainer) return;
    
    quizContainer.innerHTML = '';
    
    // Jika data kosong
    if (quizzes.length === 0) {
        const message = searchTerm 
            ? `Kuis "<strong>${searchTerm}</strong>" tidak ditemukan.` 
            : "Belum ada kuis tersedia.";
            
        quizContainer.innerHTML = `
            <div style="text-align:center; padding: 40px; min-width: 100%; color: #999;">
                <i class="fas fa-search-minus" style="font-size: 2rem; margin-bottom: 10px; display: block; opacity: 0.5;"></i>
                <p>${message}</p>
            </div>`;
        return;
    }

    quizzes.forEach(quiz => {
        const card = document.createElement('div');
        card.className = 'viral-card'; 
        card.style.position = 'relative'; 
        card.style.minWidth = '280px'; 
        
        const hasLiked = localStorage.getItem(`liked_${quiz.id}`);
        const heartClass = hasLiked ? 'fas fa-heart' : 'far fa-heart';
        const btnStyle = hasLiked ? 'color: #ff4757;' : '';
        const playCount = quiz.results ? Object.keys(quiz.results).length : 0;
        const isPopular = (quiz.likes >= 1000 || playCount >= 1000);
        
        const popularBadge = isPopular ? `
            <div style="position:absolute; top:10px; right:10px; background:linear-gradient(45deg, #FF512F, #DD2476); color:white; padding:4px 10px; border-radius:20px; font-size:0.65rem; font-weight:bold; z-index:5; box-shadow: 0 4px 10px rgba(0,0,0,0.2);">
                <i class="fas fa-fire"></i> POPULER
            </div>` : '';

        let thumbnailHTML = '';
        if (quiz.thumbnail) {
            thumbnailHTML = `<img src="${quiz.thumbnail}" alt="Thumbnail" style="width:100%; height:150px; object-fit:cover;">`;
        } else {
            // Pastikan fungsi generateGradient tersedia di script Mas
            const gradient = typeof generateGradient === 'function' ? generateGradient(quiz.title) : '#eee';
            thumbnailHTML = `
                <div style="width:100%; height:150px; background: ${gradient}; display: flex; align-items: center; justify-content: center; padding: 20px;">
                    <img src="Kuisia_White.png" alt="Kuisia Logo" style="width:100px; height:auto; opacity: 0.8;">
                </div>`;
        }

        card.innerHTML = `
            ${popularBadge}
            <div class="card-header" onclick="window.location.href='kuis.html?id=${quiz.id}'" style="cursor:pointer; overflow:hidden; border-radius:15px 15px 0 0;">
                ${thumbnailHTML}
                <div style="position:absolute; bottom:10px; left:10px; background:rgba(0,0,0,0.6); color:white; padding:3px 8px; border-radius:10px; font-size:0.7rem;">
                    <i class="fas fa-play-circle"></i> ${playCount} Main
                </div>
            </div>
            <div class="card-body" style="padding: 15px;">
                <h4 style="font-size: 1rem; margin: 5px 0; color: #333; cursor:pointer;" onclick="window.location.href='kuis.html?id=${quiz.id}'">
                    ${quiz.title}
                </h4>
                <p style="font-size: 0.8rem; color: #666; margin-bottom: 15px; height: 35px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                    ${quiz.description || quiz.desc || "Ayo uji kemampuanmu sekarang!"}
                </p>
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:5px;">
                    <a href="author.html?id=${quiz.userId}" style="font-size: 0.7rem; font-weight: 700; color: var(--accent); text-decoration: none; text-transform: uppercase;">
                        @${quiz.authorName || "Anonim"}
                    </a>
                    <span style="font-size: 0.7rem; color: #888;"><i class="fas fa-heart"></i> ${quiz.likes || 0}</span>
                </div>
                <div class="card-actions" style="display: flex; gap: 8px; border-top: 1px solid #f0f0f0; padding-top: 12px;">
                    <button id="btn-like-${quiz.id}" onclick="likeQuiz('${quiz.userId}', '${quiz.id}')" style="${btnStyle} flex:1; background: #f8f9fa; border: none; padding: 8px; border-radius: 10px; cursor: pointer;">
                        <i class="${heartClass}"></i>
                    </button>
                    <button onclick="shareQuiz('${quiz.id}', '${quiz.title}')" style="flex:1; background: #f8f9fa; border: none; padding: 8px; border-radius: 10px; cursor: pointer; color:#666;">
                        <i class="fas fa-share-alt"></i>
                    </button>
                    <a href="kuis.html?id=${quiz.id}" style="flex: 2; background: var(--accent); color: white; text-decoration: none; padding: 8px; border-radius: 10px; font-weight: bold; font-size: 0.85rem; text-align:center;">
                        Main
                    </a>
                </div>
            </div>
        `;
        quizContainer.appendChild(card);
    });
}

window.scrollMain = function(direction) {
    const container = document.getElementById('quiz-list');
    const scrollAmount = 300; // Jarak geser setiap klik
    
    container.scrollBy({
        left: direction * scrollAmount,
        behavior: 'smooth'
    });
};

// 5. SATU Blok DOMContentLoaded Utama
document.addEventListener('DOMContentLoaded', () => {
    
    // --- Navigasi Mobile ---
    const menuBtn = document.getElementById('mobile-menu-btn');
    const navMenu = document.getElementById('nav-menu');
    const navOverlay = document.getElementById('nav-overlay');

    if (menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            if (navOverlay) navOverlay.classList.toggle('active');
        });
    }

    if (navOverlay) {
        navOverlay.addEventListener('click', () => {
            navMenu.classList.remove('active');
            navOverlay.classList.remove('active');
        });
    }

    // --- Logika Stats Terpadu (Sekolah + Viral) ---
    const quizCounter = document.getElementById('user-count');
    const pengerjaanCounter = document.getElementById('admin-count');
    
    if (quizCounter || pengerjaanCounter) {
        Promise.all([
            database.ref('users').once('value'),
            database.ref('quizzes_collections').once('value')
        ]).then(([snapshotUsers, snapshotViral]) => {
            const users = snapshotUsers.val();
            const viralQuizzes = snapshotViral.val();

            // Reset ke 0 sebelum menghitung ulang
            let totalKuis = 0;
            let totalPengerjaan = 0;

            // 1. Hitung Kuis Sekolah (dari folder users)
            if (users) {
                Object.values(users).forEach(userData => {
                    const qzs = userData.quizzes;
                    if (qzs) {
                        totalKuis += Object.keys(qzs).length;
                        Object.values(qzs).forEach(quizData => {
                            if (quizData.results) {
                                totalPengerjaan += Object.keys(quizData.results).length;
                            }
                        });
                    }
                });
            }

            // 2. Hitung Kuis Viral (quizzes_collections)
            if (viralQuizzes) {
                const viralItems = Object.values(viralQuizzes);
                totalKuis += viralItems.length;
                
                viralItems.forEach(q => {
                    // LOGIKA FIX: Prioritas hitung dari results agar tidak dobel dengan stats.played
                    if (q.results) {
                        totalPengerjaan += Object.keys(q.results).length;
                    } else if (q.stats && q.stats.played) {
                        // Jika data lama belum punya folder results, baru pakai stats.played
                        totalPengerjaan += q.stats.played;
                    }
                });
            }

            // 3. Jalankan Animasi
            if (quizCounter) { 
                quizCounter.innerText = "0"; // Reset visual
                quizCounter.setAttribute('data-target', totalKuis); 
                animateCounter(quizCounter); 
            }
            if (pengerjaanCounter) { 
                pengerjaanCounter.innerText = "0"; // Reset visual
                pengerjaanCounter.setAttribute('data-target', totalPengerjaan); 
                animateCounter(pengerjaanCounter); 
            }
        }).catch(err => console.error("Gagal memuat statistik gabungan:", err));
    }

    const modal = document.getElementById('customModal');
    const modalIcon = document.getElementById('modal-icon');
    const modalTitle = document.getElementById('modal-title');
    const modalText = document.getElementById('modal-text');
    const closeBtn = document.getElementById('close-modal-btn');

    // Fungsi buka modal
    function showCustomModal(isSuccess) {
        modalIcon.className = isSuccess ? "fas fa-check-circle fa-4x" : "fas fa-exclamation-circle fa-4x";
        if(modalIcon)modalIcon.style.color = isSuccess ? "#8458B3" : "#ffc107";
        modalTitle.innerText = isSuccess ? "Terima Kasih!" : "Opps!";
        modalText.innerText = isSuccess ? "Ulasan Anda sangat berharga bagi kami." : "Maaf, Anda hanya bisa memberikan 1 kali rating.";
        modal.classList.add('active');
    }

    closeBtn.addEventListener('click', () => modal.classList.remove('active'));

    // Logika Rating
    document.querySelectorAll('.stars i').forEach(star => {
        star.addEventListener('click', function() {
            if (localStorage.getItem('hasRatedPlatform')) {
                showCustomModal(false); // Panggil modal error
                return;
            }

            const rating = parseInt(this.getAttribute('data-index'));
            submitRating(rating);
            localStorage.setItem('hasRatedPlatform', 'true');
            
            showCustomModal(true); // Panggil modal sukses
        });
    });

    // --- Inisialisasi Real-time Kuis (VERSI FIX: TAMPILKAN SEMUA) ---
    // Di dalam index-script.js pada bagian database.ref('users').on('value', ...)

    database.ref('users').on('value', (snapshot) => {
        const usersData = snapshot.val();
        allQuizzes = []; 

        if (usersData) {
            for (let userId in usersData) {
                const userData = usersData[userId];
                
                // AMBIL NAMA TERBARU DARI PROFIL USER
                // Jika user sudah edit profil, pakai userData.profile.name
                // Jika belum, pakai userData.authorName (email)
                const namaTerbaru = (userData.profile && userData.profile.name) 
                                    ? userData.profile.name 
                                    : (userData.authorName || "Anonim");

                const userQuizzes = userData.quizzes;
                    if (userQuizzes) {
                        for (let quizId in userQuizzes) {
                            const q = userQuizzes[quizId];
                            
                            // --- LOGIKA FILTER DISINI ---
                            // Kita hanya masukkan ke array allQuizzes jika:
                            // 1. Punya judul (q.title)
                            // 2. Status is_ready: true
                            // 3. Status visibility: 'public' (INI KUNCINYA)
                            
                            if (q.title && q.is_ready === true && q.visibility === 'public') {
                                allQuizzes.push({
                                    ...q, 
                                    id: quizId,
                                    userId: userId,
                                    authorName: namaTerbaru,
                                    desc: q.desc || q.description || "Tantang dirimu!"
                                });
                            }
                        }
                    }
            }
        }
        // ... sorting & render
        allQuizzes.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        renderQuizzes(allQuizzes.slice(0, displayedCount));
    });

    // --- Listener Rating Real-time ---
    database.ref('platform_rating').on('value', (snapshot) => {
        const data = snapshot.val();
        const valEl = document.getElementById('rating-value');
        const infoEl = document.getElementById('rating-info');
        if (data && valEl && infoEl) {
            valEl.innerText = `${parseFloat(data.total_rating).toFixed(1)} / 5.0`;
            infoEl.innerText = `Berdasarkan ${data.total_votes || 0} ulasan`;
        }
    });
});

//FUNGSI SEARCH BARU-------------------------------------------------------------------

// 1. Pastikan variabel global sudah ada di paling atas
allQuizzes = [];           // Untuk kuis akademik/biasa
allViralQuizzes = [];      // Untuk kuis challenge (quizzes_collections)

// 2. Ambil data kuis AKADEMIK (Asumsi node-nya 'quizzes')
database.ref('quizzes').on('value', (snapshot) => {
    const data = snapshot.val();
    allQuizzes = []; 
    if (data) {
        for (let id in data) {
            allQuizzes.push({ id, ...data[id] });
        }
    }
    renderQuizzes(allQuizzes, "", 'quiz-list');
});

// 3. Ambil data kuis CHALLENGE (Node: 'quizzes_collections')
database.ref('quizzes_collections').on('value', (snapshot) => {
    const data = snapshot.val();
    allViralQuizzes = []; // Bersihkan wadah sebelum diisi
    
    if (data) {
        for (let id in data) {
            // Kita masukkan data dari Firebase ke variabel global allViralQuizzes
            allViralQuizzes.push({ id, ...data[id] });
        }
        console.log("✅ Data Challenge Berhasil Dimuat:", allViralQuizzes.length);
    }
    
    // Render ke container viral (kotak biru kemarin)
    renderQuizzes(allViralQuizzes, "", 'viral-scroll-container');
});

// Fungsi untuk memunculkan modal custom

document.getElementById('search-quiz').addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase();
    
    // Jika kosong, tampilkan semua
    if (searchTerm === "") {
        renderQuizzes(allQuizzes, "", 'quiz-list');
        renderQuizzes(allViralQuizzes, "", 'viral-scroll-container');
        if(document.getElementById('load-more-container')) {
            document.getElementById('load-more-container').style.display = 'block';
        }
        return;
    }

    // Filter Kuis Challenge (Viral)
    const filteredViral = allViralQuizzes.filter(quiz => {
        const title = (quiz.title || "").toLowerCase();
        const deskripsi = (quiz.desc || "").toLowerCase(); // Sesuai struktur Firebase Mas
        return title.includes(searchTerm) || deskripsi.includes(searchTerm);
    });

    // Filter Kuis Akademik
    const filteredAcademic = allQuizzes.filter(quiz => {
        const title = (quiz.title || "").toLowerCase();
        const deskripsi = (quiz.desc || quiz.description || "").toLowerCase();
        return title.includes(searchTerm) || deskripsi.includes(searchTerm);
    });

    // Render Hasilnya
    renderQuizzes(filteredViral, searchTerm, 'viral-scroll-container');
    renderQuizzes(filteredAcademic, searchTerm, 'quiz-list');
    
    if(document.getElementById('load-more-container')) {
        document.getElementById('load-more-container').style.display = 'none';
    }
});


// Fungsi untuk memunculkan modal custom
function showCustomAlert(title, message, type = 'info') {
    const modal = document.getElementById('custom-alert-modal');
    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');
    const iconEl = document.getElementById('alert-icon');

    titleEl.innerText = title;
    msgEl.innerText = message;
    if(modal)modal.style.display = 'flex';

    // Atur icon berdasarkan tipe
    if (type === 'success') {
        iconEl.innerHTML = '❤️'; // Hati untuk sukses like
    } else if (type === 'warning') {
        iconEl.innerHTML = '😊'; // Senyum untuk pemberitahuan
    }
}

// Fungsi menutup modal
window.closeAlert = function() {
    document.getElementById('custom-alert-modal')?.style.setProperty('display','none');
};

window.shareQuiz = function(quizId, title, authorId) { 
    // 1. Perbaikan URL agar tidak 404 di GitHub Pages
    const currentPath = window.location.pathname;
    const directoryPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
    const shareUrl = `${window.location.origin}${directoryPath}/kuis.html?id=${quizId}${authorId ? '&author='+authorId : ''}`;
    
    const modal = document.getElementById('share-modal');
    const inputLink = document.getElementById('share-link-input');
    
    inputLink.value = shareUrl;

    const encodedText = encodeURIComponent(`Ayo mainkan kuis seru ini: ${title}`);
    const encodedUrl = encodeURIComponent(shareUrl);

    // 2. FUNGSI PENCATATAN SHARE (Tetap Masukkan ke Sini)
    const recordShare = () => {
        if (authorId && quizId) {
            database.ref(`users/${authorId}/quizzes/${quizId}/shareCount`)
                .transaction((current) => (current || 0) + 1);
            console.log("Pencatatan share berhasil dikirim");
        }
    };

    // 3. Pasang pemicu klik pada tombol sosmed
    document.getElementById('share-wa').onclick = recordShare;
    document.getElementById('share-fb').onclick = recordShare;
    document.getElementById('share-x').onclick = recordShare;

    // 4. Update Link Sosmed
    document.getElementById('share-wa').href = `https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`;
    document.getElementById('share-fb').href = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
    document.getElementById('share-x').href = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
    
    if(modal)modal.style.display = 'flex';
};

window.copyLinkOnly = function() {
    const copyText = document.getElementById('share-link-input');
    copyText.select();
    copyText.setSelectionRange(0, 99999); // Untuk mobile
    navigator.clipboard.writeText(copyText.value);
    
    // --- LOGIKA PENCATATAN SAAT SALIN LINK ---
    try {
        const url = new URL(copyText.value);
        const qId = url.searchParams.get('id');
        const aId = url.searchParams.get('author') || url.searchParams.get('uid');

        if (qId && aId) {
            database.ref(`users/${aId}/quizzes/${qId}/shareCount`)
                .transaction((current) => (current || 0) + 1);
        }
    } catch (e) {
        console.error("Gagal mencatat share via copy link", e);
    }

    showCustomAlert("Berhasil Salin", "Link kuis sudah disalin ke clipboard!", "success");
};

window.closeShareModal = function() {
    const modal = document.getElementById('share-modal');
    if(modal) modal.style.display = 'none';
};

// Tips Tambahan: Klik di luar modal untuk menutup
window.onclick = function(event) {
    const shareModal = document.getElementById('share-modal');
    const alertModal = document.getElementById('custom-alert-modal');
    if (event.target == shareModal) closeShareModal();
    if (event.target == alertModal) typeof closeAlert === 'function' && closeAlert();
};

function updateLoadMoreButton() {
    let container = document.getElementById('load-more-container');
    const quizList = document.getElementById('quiz-list');
    
    if (!quizList) return;

    if (!container) {
        container = document.createElement('div');
        container.id = 'load-more-container';
        if(container)container.style.textAlign = 'center';
        if(container)container.style.margin = '30px 0';
        quizList.after(container);
    }

    if (displayedCount < allQuizzes.length) {
        container.innerHTML = `
            <button onclick="loadMore()" class="btn-load-more" style="background: white; color: #8458B3; border: 2px solid #8458B3; padding: 10px 25px; border-radius: 30px; font-weight: bold; cursor: pointer;">
                Lihat Lebih Banyak <i class="fas fa-chevron-down"></i>
            </button>`;
    } else {
        container.innerHTML = `<p style="color: #aaa; font-size: 0.9rem;">Semua kuis telah dimuat ✨</p>`;
    }
}

window.loadMore = function() {
    displayedCount += 12;
    renderQuizzes(allQuizzes.slice(0, displayedCount));
    updateLoadMoreButton();
};



database.ref('settings/global/maintenance').on('value', (snapshot) => {
    const isMaintenance = snapshot.val();
    
    // Cek apakah user adalah admin (berdasarkan email atau status login)
    // Jika Mas sedang login sebagai firman.a.prasetyo@gmail.com, jangan di-kick
    const isAdmin = auth.currentUser && auth.currentUser.email === 'firman.a.prasetyo@gmail.com';

    if (isMaintenance && !isAdmin) {
        window.location.href = "maintenance.html"; // Atau ganti innerHTML seperti tadi
    }
});


// Jalankan fungsi ini di bagian paling atas script user
function checkMaintenance() {
    database.ref('settings/global/maintenance').on('value', (snapshot) => {
        const isMaintenance = snapshot.val();
        if (isMaintenance) {
            // Arahkan ke halaman khusus atau ganti tampilan body
            document.body.innerHTML = `
                <div style="text-align:center; padding:100px 20px; font-family:sans-serif;">
                    <img src="assets/maintenance-icon.png" width="150">
                    <h1 style="color:#1e293b;">Maaf, Kuisia Sedang Perbaikan</h1>
                    <p style="color:#64748b;">Kami sedang mengoptimalkan server. Silakan kembali beberapa saat lagi.</p>
                    <a href="about.html" style="color:#3b82f6;">Hubungi Admin</a>
                </div>
            `;
        }
    });
}
checkMaintenance();

//RUNNING TEXT
database.ref('settings/global/running_text').on('value', (snapshot) => {
    const text = snapshot.val();
    const container = document.getElementById('top-announcement');
    const content = document.getElementById('running-text-content');
    
    if (text && text.trim() !== "") {
        content.innerText = text;
        if(container)container.style.display = "block";
    } else {
        if(container)container.style.display = "none";
    }
});


//MANAJEMEN IKLAN

function initKuisiaAds() {
    const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

    // 1. Ambil Data Iklan Branding (Prioritas Utama)
    database.ref('settings/ads/branding').on('value', (snapshot) => {
        snapshot.forEach((child) => {
            const ad = child.val();
            // Cek apakah hari ini masuk periode tayang
            if (today >= ad.startDate && today <= ad.endDate && ad.active) {
                applyBranding(ad);
            }
        });
    });

    // 2. Ambil Data Iklan Video (Overlay)
    database.ref('settings/ads/video').on('value', (snapshot) => {
        snapshot.forEach((child) => {
            const ad = child.val();
            if (today >= ad.startDate && today <= ad.endDate && ad.active) {
                // Cek SessionStorage agar tidak muncul terus-menerus saat refresh
                if (!sessionStorage.getItem('video_ad_shown_' + child.key)) {
                    showVideoOverlay(ad.videoUrl, child.key);
                }
            }
        });
    });
}

// FUNGSI UNTUK MERUBAH TEMA (BRANDING)
function applyBranding(ad) {
    console.log("Menerapkan Branding:", ad.client);
    
    // Ubah Variabel CSS Global
    document.documentElement?.style.setProperty('--accent', ad.brandColor);
    document.documentElement.style.setProperty('--primary', ad.brandColor);
    
    // Ganti Teks Hero Section (Sesuaikan selector dengan HTML Mas)
    const heroSubtitle = document.querySelector('.hero-section p');
    if (heroSubtitle) {
        heroSubtitle.innerHTML = `Belajar Seru Bersama <img src="${ad.logoUrl}" style="height:25px; vertical-align:middle; margin-left:5px;">`;
    }
    
    // Ubah Footer (Opsional)
    const footerBrand = document.querySelector('.footer-logo');
    if (footerBrand) footerBrand.innerText = `Powered by Kuisia x ${ad.client}`;
}

//Munculkan Video
function showVideoOverlay(videoId, adId) {
    const modal = document.getElementById('ad-video-modal');
    const player = document.getElementById('video-ad-player');
    
    if(modal)modal.style.display = 'flex';
    // Gunakan Iframe YouTube
    player.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    
    // Tandai sudah ditonton di sesi ini
    sessionStorage.setItem('video_ad_shown_' + adId, 'true');
}

function closeVideoAd() {
    const modal = document.getElementById('ad-video-modal');
    document.getElementById('video-ad-player').innerHTML = ""; // Stop video
    if(modal)modal.style.display = 'none';
}

//IKLAN SLIDER BANNER

let currentSlide = 0;
let slideInterval;

function loadBannerAds() {
    const today = new Date().toISOString().split('T')[0];
    const wrapper = document.getElementById('container-banner-ads');
    const slidesContainer = document.getElementById('ad-slides-container');

    database.ref('settings/ads/banners').on('value', (snapshot) => {
        slidesContainer.innerHTML = ""; // Bersihkan kontainer
        let activeAdsCount = 0;

        snapshot.forEach((child) => {
            const ad = child.val();
            if (today >= ad.startDate && today <= ad.endDate && ad.active) {
                activeAdsCount++;
                
                // Buat elemen slide untuk setiap iklan
                const slide = document.createElement('div');
                if(slide)slide.style.minWidth = "100%";
                slide.innerHTML = `
                    <a href="${ad.link}" target="_blank" style="display:block;">
                        <img src="${ad.content}" alt="Iklan ${ad.client}" style="width:100%; height:auto; display:block;">
                    </a>
                `;
                slidesContainer.appendChild(slide);
            }
        });

        if (activeAdsCount > 0) {
            if(wrapper)wrapper.style.display = 'block';
            if (activeAdsCount > 1) {
                startAutoSlider(activeAdsCount);
            }
        } else {
            if(wrapper)wrapper.style.display = 'none';
        }
    });
}

function startAutoSlider(count) {
    const slidesContainer = document.getElementById('ad-slides-container');
    
    // Hapus interval lama jika ada (agar tidak bentrok saat ada update data)
    if (slideInterval) clearInterval(slideInterval);

    slideInterval = setInterval(() => {
        currentSlide++;
        if (currentSlide >= count) {
            currentSlide = 0;
        }
        if(slidesContainer)slidesContainer.style.transform = `translateX(-${currentSlide * 100}%)`;

    }, 5000); // Ganti iklan setiap 5 detik
}

//IKLAN BRANDING

function loadBrandingAds() {
    const today = new Date().toISOString().split('T')[0];

    // Kita pantau database branding
    database.ref('settings/ads/branding').on('value', (snapshot) => {
        let activeBranding = null;

        snapshot.forEach((child) => {
            const ad = child.val();
            // Cek apakah iklan aktif dan dalam periode tanggal yang benar
            if (today >= ad.startDate && today <= ad.endDate && ad.active) {
                activeBranding = ad;
            }
        });

        if (activeBranding) {
            // TERAPKAN BRANDING
            applyBrandingStyles(activeBranding);
        } else {
            // KEMBALIKAN KE DEFAULT (Warna asli Mas Firman)
            resetBrandingStyles();
        }
    });
}

function resetBrandingStyles() {
    const root = document.documentElement;

    // 1. Kembalikan warna ke default Kuisia (Ungu)
    document.documentElement.style.setProperty('--accent', '#8458B3');
    document.documentElement.style.setProperty('--accent-light', '#DDBDF4');

    // 2. Hapus Logo Sponsor dari layar
    const logoArea = document.getElementById('branding-logo-area');
    if (logoArea) {
        logoArea.innerHTML = "";
    }

    // 3. Kosongkan pesan motivasi agar tidak muncul di akhir kuis
    activeMotivation = ""; 

    console.log("🎨 Visual dibersihkan, kembali ke default Kuisia.");
}

function applyBrandingStyles(ad) {
    const root = document.documentElement;
    
    // 1. Ubah Warna Tema (Warna Brand & Transparansinya)
    document.documentElement.style.setProperty('--accent', ad.brandColor);
    document.documentElement.style.setProperty('--accent-light', ad.brandColor + '44'); 

    // 2. Tampilkan Logo Sponsor (Jika elemen area logo ada di HTML)
    const logoArea = document.getElementById('branding-logo-area');
    if (logoArea && ad.logoUrl) {
        logoArea.innerHTML = `
            <div style="animation: fadeIn 0.8s ease; text-align: center;">
                <p style="font-size: 0.75rem; color: #64748b; margin-bottom: 10px; letter-spacing: 1px; font-weight: 600;">BELAJAR BERSAMA</p>
                <img src="${ad.logoUrl}" style="max-height: 100px; width: auto; object-fit: contain;">
            </div>
        `;
    }

    // 3. Simpan Pesan Motivasi ke variabel global (untuk skor nanti)
    if (typeof activeMotivation !== 'undefined') {
        activeMotivation = ad.motivation || "";
    }

    console.log(`🎨 Branding Aktif: ${ad.client}`);
}

//VIDEO OVERLAY

function loadVideoAds() {
    const today = new Date().toISOString().split('T')[0];
    
    database.ref('settings/ads/video').once('value', (snapshot) => {
        snapshot.forEach((child) => {
            const ad = child.val();
            if (today >= ad.startDate && today <= ad.endDate && ad.active) {
                // Gunakan SessionStorage agar user tidak kesal videonya muncul terus tiap refresh
                if (!sessionStorage.getItem('video_seen_' + child.key)) {
                    showVideoAd(ad.videoUrl, child.key);
                }
            }
        });
    });
}

function showVideoAd(videoId, adId) {
    const modal = document.getElementById('video-ad-modal');
    const container = document.getElementById('video-player-container');
    
    if(modal)modal.style.display = 'flex';
    
    // Parameter Tambahan:
    // autoplay=1 -> Putar otomatis
    // mute=1     -> Wajib agar autoplay diizinkan browser
    // controls=1 -> Menampilkan tombol pause/volume YouTube
    // rel=0      -> Tidak menampilkan video rekomendasi lain di akhir
    
    container.innerHTML = `
        <iframe 
            width="100%" 
            height="100%" 
            src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0" 
            frameborder="0" 
            allow="autoplay; encrypted-media" 
            allowfullscreen>
        </iframe>`;
    
    sessionStorage.setItem('video_seen_' + adId, 'true');
}

function closeVideoAd() {
    document.getElementById('video-ad-modal')?.style.setProperty('display', 'none');
    document.getElementById('video-player-container').innerHTML = ''; // Penting: stop video saat tutup
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Cek Branding (Ubah warna & logo)
    if(typeof loadBrandingAds === 'function') loadBrandingAds();
    
    // 2. Munculkan Banner Slider
    if(typeof loadBannerAds === 'function') loadBannerAds();
    
    // 3. Terakhir, munculkan Video Popup (jika ada)
    if(typeof loadVideoAds === 'function') loadVideoAds();
});


//BATCH QUIZZ

function loadViralQuizzes() {
    const container = document.getElementById('viral-scroll-container');
    
    // Ambil data dari Firebase
    database.ref('quizzes_collections').limitToLast(10).on('value', (snapshot) => {
        if (!snapshot.exists()) {
            container.innerHTML = "<p style='padding:20px; color:#999;'>Belum ada kuis viral tersedia.</p>";
            return;
        }

        let htmlContent = "";
        snapshot.forEach((child) => {
            const quiz = child.val();
            const id = child.key;
            const playCount = quiz.stats ? quiz.stats.played : 0;

            htmlContent += `
                <div class="quiz-card-viral" onclick="playBatchQuiz('${id}')">
                    <div class="card-banner">
                        <div class="category-badge">${quiz.category || 'Viral'}</div>
                        <img src="${quiz.thumbnail || 'https://via.placeholder.com/300x150?text=Kuisia+Viral'}" alt="Thumbnail">
                    </div>
                    <div class="card-body">
                        <h4>${quiz.title}</h4>
                        <div class="card-stats">
                            <span><i class="fas fa-play-circle"></i> ${playCount} kali dimainkan</span>
                            <span><i class="fas fa-fire"></i> Hot</span>
                        </div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = htmlContent;
    });
}

// Panggil fungsi saat halaman siap
document.addEventListener('DOMContentLoaded', loadViralQuizzes);

window.playBatchQuiz = function(quizId) {
    // 1. Simpan ID dan Mode ke sessionStorage (Tanpa update database di sini)
    sessionStorage.setItem('selectedQuizId', quizId);
    sessionStorage.setItem('quizMode', 'batch'); 
    
    // 2. Langsung pindah ke halaman viral.html
    window.location.href = 'viral.html'; 
};

window.scrollViral = function(direction) {
    const container = document.getElementById('viral-scroll-container');
    // Kita geser sejauh 300px setiap klik
    const scrollAmount = 320; 
    
    container.scrollBy({
        left: direction * scrollAmount,
        behavior: 'smooth'
    });
};
