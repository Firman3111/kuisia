// 1. Inisialisasi Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDoo_WtH6JbT0KvMzmud5Ew_TpEjgFGqhU",
    authDomain: "fir-kuis-23368.firebaseapp.com",
    databaseURL: "https://fir-kuis-23368-default-rtdb.asia-southeast1.firebasedatabase.app"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

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
            btn.style.color = '#ff4757';
            
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

function renderQuizzes(quizzes) {
    const quizContainer = document.getElementById('quiz-list');
    if (!quizContainer) return;
    
    quizContainer.innerHTML = '';
    
    if (quizzes.length === 0) {
        quizContainer.innerHTML = '<p style="text-align:center; grid-column: 1/-1; padding: 50px;">Tidak ada kuis yang ditemukan.</p>';
        return;
    }

    quizzes.forEach(quiz => {
        const card = document.createElement('div');
        card.className = 'quiz-card-modern';
        card.style.position = 'relative'; 
        
        const hasLiked = localStorage.getItem(`liked_${quiz.id}`);
        const heartClass = hasLiked ? 'fas fa-heart' : 'far fa-heart';
        const btnStyle = hasLiked ? 'color: #ff4757;' : '';
        
        // Logika Badge Populer (Main > 1000 atau Suka > 1000)
        const playCount = quiz.results ? Object.keys(quiz.results).length : 0;
        const isPopular = (quiz.likes >= 1000 || playCount >= 1000);
        const popularBadge = isPopular ? `
            <div class="badge-popular" style="position:absolute; top:10px; right:10px; background:linear-gradient(45deg, #FF512F, #DD2476); color:white; padding:5px 12px; border-radius:20px; font-size:0.7rem; font-weight:bold; z-index:5; box-shadow: 0 4px 10px rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.3);">
                <i class="fas fa-fire"></i> POPULER
            </div>` : '';
        const isPrivate = quiz.visibility === 'private';
        const privateBadge = isPrivate ? `
            <div class="badge-private" style="position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.6); color:white; padding:4px 10px; border-radius:20px; font-size:0.6rem; z-index:5;">
                <i class="fas fa-lock"></i> PRIVAT
            </div>` : '';

        // Logika Thumbnail (Kuisia Logo)
        let thumbnailHTML = '';
        if (quiz.thumbnail) {
            thumbnailHTML = `<img src="${quiz.thumbnail}" alt="Thumbnail" style="width:100%; height:160px; object-fit:cover; display:block;">`;
        } else {
            const gradient = generateGradient(quiz.title);
            thumbnailHTML = `
                <div style="width:100%; height:160px; background: ${gradient}; display: flex; align-items: center; justify-content: center; padding: 20px;">
                    <img src="Kuisia_White.png" alt="Kuisia Logo" style="width:200px; height:auto; opacity: 0.9;">
                </div>`;
        }

        card.innerHTML = `
            ${popularBadge}
            ${privateBadge}
            <div class="card-thumbnail" style="margin: 0; padding: 0; overflow: hidden; border-radius: 12px 12px 0 0;">
                ${thumbnailHTML}
            </div>
            <div class="card-body" style="padding: 15px; text-align: center;">
                <h3 class="quiz-title" style="font-size: 1.1rem; margin-bottom: 5px; color: #333;">${quiz.title}</h3>
                <p class="quiz-desc" style="font-size: 0.85rem; color: #666; margin-bottom: 12px; height: 40px; overflow: hidden;">${quiz.description || quiz.desc || "Tidak ada deskripsi."}</p>
                
                <div class="quiz-stats-meta" style="font-size: 0.75rem; color: #888; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <span><i class="fas fa-play-circle"></i> ${playCount} Main</span>
                    <span><i class="fas fa-heart"></i> ${quiz.likes || 0} Suka</span>
                </div>

                <div class="author-info" style="margin-bottom: 15px; border-top: 1px solid #eee; padding-top: 10px;">
                    <span style="font-size: 0.65rem; color: #aaa; text-transform: uppercase; display: block;">Dibuat Oleh</span>
                    <a href="author.html?id=${quiz.userId}" style="font-size: 0.9rem; font-weight: 600; color: #8458B3; text-decoration: none;">
                        ${quiz.authorName || "Memuat..."}
                    </a>
                </div>

                <div class="card-actions" style="display: flex; gap: 8px;">
                    <button class="action-btn love-btn" id="btn-like-${quiz.id}" onclick="likeQuiz('${quiz.userId}', '${quiz.id}')" style="${btnStyle} flex:1; background: #f8f9fa; border: 1px solid #ddd; padding: 8px; border-radius: 8px; cursor: pointer;">
                        <i class="${heartClass}"></i>
                    </button>
                    <button class="action-btn share-btn" onclick="shareQuiz('${quiz.id}', '${quiz.title}')" style="flex:1; background: #f8f9fa; border: 1px solid #ddd; padding: 8px; border-radius: 8px;">
                        <i class="fas fa-share-alt"></i>
                    </button>
                    <a href="kuis.html?id=${quiz.id}" style="flex: 2; background: #8458B3; color: white; text-decoration: none; padding: 8px; border-radius: 8px; font-weight: bold; font-size: 0.9rem; text-align:center;">Mainkan</a>
                </div>
            </div>
        `;
        quizContainer.appendChild(card);
    });
}

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

    // --- Logika Stats ---
    const quizCounter = document.getElementById('user-count');
    const pengerjaanCounter = document.getElementById('admin-count');
    if (quizCounter || pengerjaanCounter) {
        database.ref('users').once('value').then((snapshot) => {
            const users = snapshot.val();
            if (!users) return;

            let totalKuis = 0, totalPengerjaan = 0;
            Object.keys(users).forEach(uid => {
                const qzs = users[uid].quizzes;
                if (qzs) {
                    totalKuis += Object.keys(qzs).length;
                    Object.keys(qzs).forEach(qid => {
                        if (qzs[qid].results) totalPengerjaan += Object.keys(qzs[qid].results).length;
                    });
                }
            });
            if (quizCounter) { quizCounter.setAttribute('data-target', totalKuis); animateCounter(quizCounter); }
            if (pengerjaanCounter) { pengerjaanCounter.setAttribute('data-target', totalPengerjaan); animateCounter(pengerjaanCounter); }
        });
    }

    const modal = document.getElementById('customModal');
    const modalIcon = document.getElementById('modal-icon');
    const modalTitle = document.getElementById('modal-title');
    const modalText = document.getElementById('modal-text');
    const closeBtn = document.getElementById('close-modal-btn');

    // Fungsi buka modal
    function showCustomModal(isSuccess) {
        modalIcon.className = isSuccess ? "fas fa-check-circle fa-4x" : "fas fa-exclamation-circle fa-4x";
        modalIcon.style.color = isSuccess ? "#8458B3" : "#ffc107";
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

// Fungsi untuk memfilter kuis
document.getElementById('search-quiz').addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase();
    
    const filtered = allQuizzes.filter(quiz => {
        // Ambil isi deskripsi dari properti yang tersedia
        const descriptionText = (quiz.description || quiz.desc || "").toLowerCase();
        const titleText = (quiz.title || "").toLowerCase();
        const authorText = (quiz.authorName || "").toLowerCase();

        return titleText.includes(searchTerm) || 
               descriptionText.includes(searchTerm) || 
               authorText.includes(searchTerm);
    });

    renderQuizzes(filtered);
    
    // Sembunyikan tombol Load More saat sedang mencari
    const lb = document.getElementById('load-more-container');
    if(lb) lb.style.display = searchTerm === "" ? 'block' : 'none';
});

// Fungsi untuk memunculkan modal custom
function showCustomAlert(title, message, type = 'info') {
    const modal = document.getElementById('custom-alert-modal');
    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');
    const iconEl = document.getElementById('alert-icon');

    titleEl.innerText = title;
    msgEl.innerText = message;
    modal.style.display = 'flex';

    // Atur icon berdasarkan tipe
    if (type === 'success') {
        iconEl.innerHTML = '❤️'; // Hati untuk sukses like
    } else if (type === 'warning') {
        iconEl.innerHTML = '😊'; // Senyum untuk pemberitahuan
    }
}

// Fungsi menutup modal
window.closeAlert = function() {
    document.getElementById('custom-alert-modal').style.display = 'none';
};

window.shareQuiz = function(quizId, title, authorId) { 
    // Gunakan authorId jika tersedia di data kuis beranda
    const shareUrl = `${window.location.origin}/kuis.html?id=${quizId}${authorId ? '&author='+authorId : ''}`;
    
    const modal = document.getElementById('share-modal');
    const inputLink = document.getElementById('share-link-input');
    
    inputLink.value = shareUrl;

    const encodedText = encodeURIComponent(`Ayo mainkan kuis seru ini: ${title}`);
    const encodedUrl = encodeURIComponent(shareUrl);

    document.getElementById('share-wa').href = `https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`;
    document.getElementById('share-fb').href = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
    document.getElementById('share-x').href = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
    
    modal.style.display = 'flex';
};

window.closeShareModal = function() {
    const modal = document.getElementById('share-modal');
    modal.style.display = 'none';
};

// Tips Tambahan: Klik di luar modal untuk menutup
window.onclick = function(event) {
    const shareModal = document.getElementById('share-modal');
    const alertModal = document.getElementById('custom-alert-modal');
    if (event.target == shareModal) closeShareModal();
    if (event.target == alertModal) closeAlert();
}

window.copyLinkOnly = function() {
    const copyText = document.getElementById('share-link-input');
    copyText.select();
    copyText.setSelectionRange(0, 99999); // Untuk mobile
    navigator.clipboard.writeText(copyText.value);
    
    // Gunakan modal alert kustom yang kita buat tadi sebagai notifikasi
    showCustomAlert("Berhasil Salin", "Link kuis sudah disalin ke clipboard!", "warning");
};

function updateLoadMoreButton() {
    let container = document.getElementById('load-more-container');
    const quizList = document.getElementById('quiz-list');
    
    if (!quizList) return;

    if (!container) {
        container = document.createElement('div');
        container.id = 'load-more-container';
        container.style.textAlign = 'center';
        container.style.margin = '30px 0';
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