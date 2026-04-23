// 1. CONFIG & INITIALIZATION (Gunakan config yang sama)
const firebaseConfig = {
    apiKey: "AIzaSyDoo_WtH6JbT0KvMzmud5Ew_TpEjgFGqhU",
    authDomain: "fir-kuis-23368.firebaseapp.com",
    databaseURL: "https://fir-kuis-23368-default-rtdb.asia-southeast1.firebasedatabase.app"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const database = firebase.database();

// Variabel Global untuk menampung soal sementara
let questionsArray = [];
let currentAdminId = null;

// 2. PROTEKSI HALAMAN
auth.onAuthStateChanged((user) => {
    if (user) {
        currentAdminId = user.uid;
        
        // Ambil data profile dari node users
        database.ref(`users/${user.uid}`).on('value', (snapshot) => {
            const userData = snapshot.val();
            if (userData) {
                // Update Nama & Expiry di Header
                document.getElementById('admin-name').innerText = userData.authorName || user.email.split('@')[0];
                document.getElementById('expiry-display').innerText = userData.expiry_date || "-";
                
                // Update Badge Premium
                const badge = document.getElementById('badge-status');
                if (userData.is_premium) {
                    badge.innerText = "Premium";
                    badge.style.background = "#f59e0b"; // Warna Emas
                    badge.style.color = "white";
                }
            }
        });
        loadMyChallenges();
    } else {
        window.location.href = "login.html";
    }
});

// 3. FUNGSI NAVIGASI TAB (Sama dengan admin.html)
function switchTab(targetId) {
    // 1. Sembunyikan semua tab content
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.classList.add('hidden');
    });

    // 2. Tampilkan tab yang diklik
    // Jika targetId = 'create-challenge', maka mencari id 'tab-create-challenge'
    const activeTab = document.getElementById('tab-' + targetId);
    if (activeTab) {
        activeTab.classList.remove('hidden');
    }
    
    // 3. Update style tombol sidebar
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    // Tambahkan logic untuk mengaktifkan class 'active' pada tombol yang diklik
}

function addNewQuestion() {
    const container = document.getElementById('questions-builder');
    const qIndex = container.children.length;

    const qHtml = `
        <div class="question-item animate__animated animate__fadeInUp">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span style="font-weight: bold;"><i class="fas fa-edit"></i> Soal #${qIndex + 1}</span>
                <button onclick="this.closest('.question-item').remove()" class="btn-danger" style="padding: 5px 10px; font-size: 0.8rem;">
                    <i class="fas fa-trash"></i> Hapus
                </button>
            </div>

            <div style="width: 100%;">
                <label style="font-size: 0.8rem; font-weight: bold; color: #64748b;">Pertanyaan:</label>
                <textarea class="q-text" placeholder="Tuliskan pertanyaan challenge di sini..."></textarea>
            </div>
            
            <div class="options-grid">
                <input type="text" class="opt-a" placeholder="Pilihan A">
                <input type="text" class="opt-b" placeholder="Pilihan B">
                <input type="text" class="opt-c" placeholder="Pilihan C">
                <input type="text" class="opt-d" placeholder="Pilihan D">
            </div>
            
            <div class="answer-selector" style="display: flex; align-items: center; gap: 10px; border-top: 1px solid #eee; padding-top: 15px;">
                <label style="font-size: 0.85rem; font-weight: bold;">Kunci Jawaban:</label>
                <select class="q-answer" style="padding: 5px; border-radius: 5px;">
                    <option value="A">Opsi A</option>
                    <option value="B">Opsi B</option>
                    <option value="C">Opsi C</option>
                    <option value="D">Opsi D</option>
                </select>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', qHtml);
    container.lastElementChild.scrollIntoView({ behavior: 'smooth' });
}

function previewThumbnail(input) {
    const previewContainer = document.getElementById('thumbnail-preview-container');
    const previewImg = document.getElementById('img-preview');
    
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImg.src = e.target.result;
            previewContainer.style.display = 'block';
        }
        reader.readAsDataURL(input.files[0]);
    }
}

async function uploadToCloudinary(file) {
    const cloudName = 'dz16gb8tw';
    const uploadPreset = 'kuisia_tumbernails';
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        return data.secure_url; // Ini adalah URL gambar yang sudah jadi
    } catch (error) {
        console.error("Cloudinary Error:", error);
        return null;
    }
}

// 5. SIMPAN KE FIREBASE (quizzes_collections)
async function saveChallenge() {
    const title = document.getElementById('challenge-title').value;
    const desc = document.getElementById('challenge-desc').value;
    const fileInput = document.getElementById('challenge-thumbnail-input'); // Input File
    const qElements = document.querySelectorAll('.question-item');

    // Validasi Dasar
    if (!title || qElements.length === 0) {
        return alert("Judul dan minimal 1 soal harus diisi!");
    }

    // UI Feedback: Loading
    const btnSave = document.querySelector('.btn-challenge');
    const originalText = btnSave.innerHTML;
    btnSave.disabled = true;
    btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';

    try {
        // 1. Logika Upload Thumbnail ke Cloudinary
        let thumbnailUrl = "https://images.unsplash.com/photo-1606326666490-457574d56488?w=500"; // Default
        
        if (fileInput.files && fileInput.files[0]) {
            const uploadedUrl = await uploadToCloudinary(fileInput.files[0]);
            if (uploadedUrl) thumbnailUrl = uploadedUrl;
        }

        // 2. Ambil data dari builder soal
        const questions = [];
        qElements.forEach(el => {
            questions.push({
                question: el.querySelector('.q-text').value,
                options: [
                    el.querySelector('.opt-a').value,
                    el.querySelector('.opt-b').value,
                    el.querySelector('.opt-c').value,
                    el.querySelector('.opt-d').value
                ],
                // Pastikan class .q-answer ada di builder soal Mas (select/input)
                answer: el.querySelector('.q-answer') ? el.querySelector('.q-answer').value : el.querySelector('.opt-a').value, 
                type: 'pg'
            });
        });

        // 3. Susun Payload
        const newQuizId = 'CHAL-' + Date.now();
        const payload = {
            title: title,
            description: desc,
            thumbnail: thumbnailUrl,
            authorId: currentAdminId,
            category: "Challenge",
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            questions: questions,
            stats: { played: 0 }
        };

        // 4. Simpan ke Firebase (Koleksi & Index)
        await database.ref(`quizzes_collections/${newQuizId}`).set(payload);
        await database.ref(`quiz_index/${newQuizId}`).set({
            title: title,
            thumbnail: thumbnailUrl,
            authorId: currentAdminId,
            type: "challenge"
        });

        alert("Challenge Berhasil Dipublikasikan!");
        location.reload(); // Refresh untuk melihat hasil di list

    } catch (err) {
        console.error("Detail Error:", err);
        alert("Gagal menyimpan challenge: " + err.message);
    } finally {
        // Kembalikan tombol ke kondisi semula jika gagal
        btnSave.disabled = false;
        btnSave.innerHTML = originalText;
    }
}

// 6. LOAD DAFTAR CHALLENGE SAYA - Update Fungsi Load (Ganti Tabel jadi Kartu)
function loadMyChallenges() {
    const container = document.getElementById('challenge-list-container');
    
    // Pastikan currentAdminId sudah terdefinisi dari Firebase Auth
    database.ref('quizzes_collections').orderByChild('authorId').equalTo(currentAdminId).on('value', (snapshot) => {
        if (!snapshot.exists()) {
            container.innerHTML = `
                <div style="text-align:center; padding: 40px; color: #64748b;">
                    <i class="fas fa-folder-open" style="font-size: 3rem; margin-bottom: 10px; opacity: 0.3;"></i>
                    <p>Belum ada challenge yang dibuat.</p>
                </div>`;
            return;
        }

        let gridHtml = ''; // Tidak perlu bungkus div grid lagi di sini karena container sudah punya class .quiz-grid
        
        snapshot.forEach((child) => {
            const kuis = child.val();
            const displayThumb = kuis.thumbnail || 'https://images.unsplash.com/photo-1606326666490-457574d56488?w=500';
            
            // Menggunakan class 'card' yang ada di admin-style.css Mas
            gridHtml += `
                <div class="card" style="padding:0; overflow:hidden; display: flex; flex-direction: column;">
                    <div style="position: relative;">
                        <img src="${displayThumb}" style="width:100%; height:160px; object-fit:cover;">
                        <div style="position: absolute; top: 10px; right: 10px; background: rgba(16, 185, 129, 0.9); color: white; padding: 2px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: bold;">
                            Active
                        </div>
                    </div>
                    <div style="padding:15px; display: flex; flex-direction: column; flex-grow: 1;">
                        <h4 style="margin:0 0 8px 0; font-size: 1rem; color: #1e293b;">${kuis.title}</h4>
                        <p style="font-size:0.8rem; color:#64748b; margin-bottom: 15px; flex-grow: 1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                            ${kuis.description || 'Tidak ada deskripsi.'}
                        </p>
                        <div style="display:flex; gap:8px; margin-top: auto;">
                            <button onclick="copyLink('${child.key}')" class="btn-modern" style="flex:1; font-size:0.75rem; justify-content: center;">
                                <i class="fas fa-share-alt"></i> Share
                            </button>
                            <button onclick="deleteChallenge('${child.key}')" class="btn-modern btn-danger" style="padding:5px 12px; justify-content: center;">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = gridHtml;
    });
}

function copyLink(id) {
    // Ganti index.html menjadi viral.html
    const link = window.location.origin + "/viral.html?id=" + id;
    
    navigator.clipboard.writeText(link).then(() => {
        alert("Link Challenge berhasil disalin!\n\nLink: " + link);
    }).catch(err => {
        console.error('Gagal menyalin link: ', err);
    });
}

function deleteChallenge(id) {
    if (confirm("Hapus kuis ini dari koleksi publik?")) {
        database.ref(`quizzes_collections/${id}`).remove();
        database.ref(`quiz_index/${id}`).remove();
    }
}

function logout() {
    auth.signOut().then(() => { window.location.href = "login.html"; });
}

// 1. Inisialisasi elemen overlay
const sidebar = document.querySelector('.sidebar');
const mobileBtn = document.getElementById('mobile-menu-btn');

// Buat elemen overlay secara otomatis
const overlay = document.createElement('div');
overlay.className = 'sidebar-overlay';
document.body.appendChild(overlay);

// 2. Fungsi Toggle
function toggleMobileMenu() {
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

// 3. Event Listeners
mobileBtn.addEventListener('click', toggleMobileMenu);
overlay.addEventListener('click', toggleMobileMenu);

// Tutup otomatis jika menu diklik (saat pindah tab)
document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            toggleMobileMenu();
        }
    });
});