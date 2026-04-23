// --- CONFIG & INITIALIZATION ---
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

let isLoginMode = true;

// --- MODIFIKASI BAGIAN 1: PROTEKSI & REDIRECT ---
auth.onAuthStateChanged((user) => {
    if (user && isLoginMode) {
        // Jangan langsung redirect, munculkan modal
        showQuizTypeModal();
    }
});

window.onload = function() {
    const authForm = document.getElementById('auth-form');
    const toggleLink = document.getElementById('toggle-auth');
    const confirmGroup = document.getElementById('confirm-password-group');
    const confirmInput = document.getElementById('confirm-password');

    // ... (Logika toggle UI Mas tetap sama) ...
    if (toggleLink) {
        toggleLink.onclick = function(e) {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            if(isLoginMode) {
                confirmGroup.classList.add('hidden');
                confirmInput.removeAttribute('required');
            } else {
                confirmGroup.classList.remove('hidden');
                confirmInput.setAttribute('required', 'true');
            }
        };
    }

    // --- B. LOGIKA SUBMIT (DIPERBAIKI) ---
    if (authForm) {
        authForm.onsubmit = async function(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            if (isLoginMode) {
                auth.signInWithEmailAndPassword(email, password)
                    .catch(err => alert("Gagal Login: " + err.message));
            } else {
                const cPassword = confirmInput.value;
                if (password !== cPassword) return alert("Password tidak cocok!");

                try {
                    console.log("Mendaftarkan ke Auth...");
                    const result = await auth.createUserWithEmailAndPassword(email, password);
                    const user = result.user;

                    console.log("Auth Sukses. Menulis ke Database...");
                    
                    // Kita gunakan .set() dan kita AWAIT (tunggu sampai selesai)
                    await database.ref('users/' + user.uid).set({
                        authorName: email.split('@')[0],
                        is_premium: false,
                        expiry_date: "-",
                        profile: {
                            nama: email.split('@')[0],
                            name: email.split('@')[0],
                            email: email,
                            role: "author",
                            createdAt: firebase.database.ServerValue.TIMESTAMP
                        }
                    });

                    console.log("Data Berhasil Ditulis!");
                    alert("Akun Berhasil Dibuat!");
                    
                    // BARU PINDAH HALAMAN SETELAH DATABASE BERHASIL
                    showQuizTypeModal();

                } catch (err) {
                    console.error("Gagal:", err);
                    alert("Terjadi Masalah: " + err.message);
                }
            }
        };
    }
};

// --- FUNGSI MODAL PEMILIHAN ---
function showQuizTypeModal() {
    // Cek apakah modal sudah ada di HTML, jika belum kita buat lewat JS
    let modal = document.getElementById('quizSelectionModal');
    
    if (!modal) {
        const modalHTML = `
        <div id="quizSelectionModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.9); z-index:9999; display:flex; align-items:center; justify-content:center; font-family: 'Poppins', sans-serif;">
            <div style="background:white; padding:40px; border-radius:24px; width:90%; max-width:550px; text-align:center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <h2 style="color: #1e293b; margin-bottom: 10px; font-size: 1.5rem;">Selamat Datang!</h2>
                <p style="color: #64748b; margin-bottom: 30px;">Pilih model kuis yang ingin Anda kelola hari ini:</p>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div onclick="selectQuizType('academic')" style="cursor:pointer; padding:25px 15px; border:2px solid #f1f5f9; border-radius:18px; transition:0.3s;" onmouseover="this.style.borderColor='#3b82f6'; this.style.background='#eff6ff'" onmouseout="this.style.borderColor='#f1f5f9'; this.style.background='none'">
                        <div style="font-size: 40px; margin-bottom: 15px;">🏫</div>
                        <h3 style="margin:0; color: #1e293b; font-size: 1.1rem;">Akademik</h3>
                        <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 5px;">Sekolah & Ujian</p>
                    </div>

                    <div onclick="selectQuizType('challenge')" style="cursor:pointer; padding:25px 15px; border:2px solid #f1f5f9; border-radius:18px; transition:0.3s;" onmouseover="this.style.borderColor='#10b981'; this.style.background='#ecfdf5'" onmouseout="this.style.borderColor='#f1f5f9'; this.style.background='none'">
                        <div style="font-size: 40px; margin-bottom: 15px;">⚡</div>
                        <h3 style="margin:0; color: #1e293b; font-size: 1.1rem;">Challenge</h3>
                        <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 5px;">Viral & Fun</p>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
}

function selectQuizType(type) {
    // Simpan pilihan ke sessionStorage agar halaman admin tahu mode apa yang aktif
    sessionStorage.setItem('activeAdminMode', type);
    
    if (type === 'academic') {
        window.location.href = "admin.html";
    } else {
        window.location.href = "admin-challenge.html";
    }
}