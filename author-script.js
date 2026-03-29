const database = firebase.database(); 
const urlParams = new URLSearchParams(window.location.search);
const authorId = urlParams.get('id');

// 1. Fungsi Utility Gradien
function generateGradient(title) {
    const colors = ['#8458B3', '#A0D2EB', '#DDBDF4', '#A594F9'];
    const charCode = title.charCodeAt(0) || 0;
    const color1 = colors[charCode % colors.length];
    const color2 = colors[(charCode + 1) % colors.length];
    return `linear-gradient(135deg, ${color1}, ${color2})`;
}

// 2. Fungsi Bagikan Profil
function bagikanProfil() {
    const modal = document.getElementById('modal-share');
    const input = document.getElementById('share-link-input');
    
    input.value = window.location.href; // Ambil URL saat ini
    modal.classList.remove('hidden');
    modal.style.display = 'flex'; // Pastikan tampil
}

function copyShareLink() {
    const input = document.getElementById('share-link-input');
    input.select();
    document.execCommand('copy');
    alert("Tautan berhasil disalin!");
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    document.getElementById(modalId).style.display = 'none';
}

function copyAndSwitch() {
    const input = document.getElementById('share-link-input');
    input.select();
    document.execCommand('copy');

    // Transisi antar view
    const viewInput = document.getElementById('view-input');
    const viewSuccess = document.getElementById('view-success');
    
    viewInput.style.opacity = '0';
    setTimeout(() => {
        viewInput.classList.add('hidden');
        viewSuccess.classList.remove('hidden');
        viewSuccess.style.opacity = '1';
    }, 300); // Durasi fade out
}

// Reset modal saat ditutup agar kembali ke view-input
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('hidden');
    
    // Reset view
    setTimeout(() => {
        document.getElementById('view-input').classList.remove('hidden');
        document.getElementById('view-input').style.opacity = '1';
        document.getElementById('view-success').classList.add('hidden');
    }, 500);
}

// 3. Fungsi Utama Load Data
function loadAuthorData() {
    if (!authorId) return;

    database.ref(`users/${authorId}/profile`).once('value', (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            // Update Teks (dengan pengecekan if agar tidak error jika ID tidak ditemukan)
            const nameEl = document.getElementById('author-name');
            const jobEl = document.getElementById('author-job');
            const bioEl = document.getElementById('author-bio');
            
            if (nameEl) nameEl.innerText = data.name || "Nama Author";
            if (jobEl) jobEl.innerText = data.job || "";
            if (bioEl) bioEl.innerText = data.bio || "Bio belum tersedia.";
            
            // Foto Profil
            const photoEl = document.getElementById('author-photo');
            if (photoEl) {
                if (data.photo && data.photo.trim() !== "") {
                    photoEl.src = data.photo;
                } else {
                    photoEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || "User")}&background=8458B3&color=fff`;
                }
            }

            // --- INTEGRASI LOGIKA TOMBOL ---
            const socialContainer = document.querySelector('.author-actions');
            const btnGift = document.getElementById('btn-gift');

            // 1. Logika Tombol Sosial Dinamis (Bisa banyak ikon)
            // Hapus ikon sosial lama agar tidak duplikat saat reload
            const oldSocials = document.querySelectorAll('.dynamic-social');
            oldSocials.forEach(el => el.remove());

            if (data.social) {
                // Cek apakah data.social itu Array atau String tunggal (untuk kompatibilitas data lama)
                const links = Array.isArray(data.social) ? data.social : [data.social];
                
                // Loop setiap link dan buatkan ikonnya
                links.forEach(link => {
                    if (link && link.trim() !== "") {
                        const iconClass = getSocialIcon(link); // Fungsi deteksi ikon
                        const a = document.createElement('a');
                        a.href = link;
                        a.target = "_blank";
                        a.className = "icon-btn dynamic-social"; // Gunakan class CSS icon-btn
                        a.innerHTML = `<i class="${iconClass}"></i>`;
                        
                        // Masukkan ke dalam container (paling depan)
                        socialContainer.prepend(a); 
                    }
                });
            }

            // 2. Logika Tombol Gift Statis (Hanya satu)
            if (btnGift) {
                if (data.gift && data.gift.trim() !== "") {
                    btnGift.href = data.gift;
                    btnGift.style.display = 'flex'; // Tampilkan dengan flex agar ikon di tengah
                } else {
                    btnGift.style.display = 'none'; // Sembunyikan jika kosong
                }
            }
        }
    });

    // --- GANTI MULAI DARI SINI (PENGAMBILAN KUIS) ---
    // Kita ambil langsung dari folder kuis milik user agar Privat & Is_Ready: false tetap muncul
    database.ref(`users/${authorId}/quizzes`).once('value')
    .then((snapshot) => {
            const grid = document.getElementById('author-quiz-grid');
            grid.innerHTML = ''; 

            if (!snapshot.exists()) {
                grid.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">Belum ada kuis yang dibuat.</p>';
                return;
            }
            
            snapshot.forEach((child) => {
                const quiz = child.val();
                const quizId = child.key;

                // Hanya tampilkan jika kuis memiliki judul (mencegah kuis sampah/kosong)
                if (quiz.title) {
                    
                    // --- LOGIKA BADGE PRIVAT ---
                    // Kuis dianggap privat jika visibility === 'private' ATAU is_ready masih false
                    const isPrivate = quiz.visibility === 'private' || quiz.is_ready === false;
                    const badgePrivat = isPrivate ? `
                        <div class="badge-private" style="position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.7); color:white; padding:4px 10px; border-radius:20px; font-size:0.65rem; font-weight:bold; z-index:10; backdrop-filter:blur(4px); display:flex; align-items:center; gap:5px; border:1px solid rgba(255,255,255,0.2);">
                            <i class="fas fa-lock" style="font-size:0.6rem;"></i> PRIVAT
                        </div>` : '';

                    // Logika Thumbnail
                    let thumbnailHTML = quiz.thumbnail ? 
                        `<img src="${quiz.thumbnail}" alt="Thumbnail" style="width:100%; height:160px; object-fit:cover; display:block;">` :
                        `<div style="width:100%; height:160px; background: ${generateGradient(quiz.title)}; display: flex; align-items: center; justify-content: center;">
                            <img src="Kuisia_White.png" alt="Logo" style="width: 140px; object-fit: contain; opacity: 0.8;">
                        </div>`;

                    const card = document.createElement('div');
                    card.className = 'quiz-card-modern';
                    card.style.background = "#fff";
                    card.style.borderRadius = "12px";
                    card.style.boxShadow = "0 4px 15px rgba(0,0,0,0.05)";
                    card.style.position = "relative"; // Penting agar badge posisi absolutnya benar
                    
                    card.innerHTML = `
                        ${badgePrivat}
                        <div class="card-thumbnail" style="margin: 0; padding: 0; overflow: hidden; border-radius: 12px 12px 0 0;">
                            ${thumbnailHTML}
                        </div>
                        <div class="card-body" style="padding: 15px;">
                            <h3 class="quiz-title" style="font-size: 1.1rem; text-align: center; margin-bottom: 5px; color: #333;">${quiz.title}</h3>
                            <p class="quiz-desc" style="font-size: 0.85rem; text-align: center; color: #666; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${quiz.description || quiz.desc || "Tidak ada deskripsi."}</p>
                            
                            <div class="quiz-stats-meta" style="font-size: 0.75rem; color: #888; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 15px;">
                                <span><i class="fas fa-play-circle"></i> <span id="count-${quizId}">0</span></span>
                                <span><i class="fas fa-heart"></i> <span id="like-${quizId}">0</span></span>
                            </div>

                            <div class="card-actions" style="display: flex; gap: 8px;">
                                <a href="kuis.html?id=${quizId}&author=${authorId}" class="play-btn-main" style="flex-grow: 1; background: #4a90e2; color: white; text-decoration: none; padding: 8px; border-radius: 8px; text-align: center; font-weight: bold; font-size: 0.9rem;">Mainkan</a>
                            </div>
                        </div>
                    `;
                    grid.appendChild(card);
                    
                    // Update statistik
                    updateQuizStats(authorId, quizId);
                }
            });
        });
}

// Panggil fungsi
loadAuthorData();

function getSocialIcon(url) {
    const link = url.toLowerCase();
    if (link.includes('facebook.com')) return 'fab fa-facebook';
    if (link.includes('instagram.com')) return 'fab fa-instagram';
    if (link.includes('twitter.com') || link.includes('x.com')) return 'fab fa-x-twitter';
    if (link.includes('youtube.com')) return 'fab fa-youtube';
    if (link.includes('linkedin.com')) return 'fab fa-linkedin';
    if (link.includes('tiktok.com')) return 'fab fa-tiktok';
    if (link.includes('wa.me') || link.includes('whatsapp.com')) return 'fab fa-whatsapp';
    if (link.includes('github.com')) return 'fab fa-github';
    return 'fas fa-link'; // Ikon default jika tidak dikenal
}

function updateQuizStats(userId, quizId) {
    // 1. Ambil jumlah Likes dari struktur: users/userId/quizzes/quizId/likes
    database.ref(`users/${userId}/quizzes/${quizId}/likes`).on('value', (snapshot) => {
        const likeEl = document.getElementById(`like-${quizId}`);
        if (likeEl) likeEl.innerText = snapshot.val() || 0;
    });

    // 2. Ambil jumlah Play Count (Result) dari: users/userId/quizzes/quizId/results
    database.ref(`users/${userId}/quizzes/${quizId}/results`).on('value', (snapshot) => {
        // Karena results adalah objek yang berisi banyak hasil, 
        // kita hitung jumlah child-nya (jumlah orang yang sudah mengerjakan)
        const count = snapshot.numChildren();
        const countEl = document.getElementById(`count-${quizId}`);
        if (countEl) countEl.innerText = count;
    });
}