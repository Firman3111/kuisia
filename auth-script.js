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

// 1. PROTEKSI & REDIRECT (DIPERBAIKI)
auth.onAuthStateChanged((user) => {
    // HANYA redirect otomatis jika user sedang di Mode Login
    // Jika sedang daftar, biarkan fungsi submit yang menangani redirectnya
    if (user && isLoginMode) {
        window.location.href = "admin.html";
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
                    window.location.href = "admin.html";

                } catch (err) {
                    console.error("Gagal:", err);
                    alert("Terjadi Masalah: " + err.message);
                }
            }
        };
    }
};