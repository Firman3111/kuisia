const firebaseConfig = {
    apiKey: "AIzaSyDoo_WtH6JbT0KvMzmud5Ew_TpEjgFGqhU", // Gunakan Key Anda
    authDomain: "fir-kuis-23368.firebaseapp.com",
    databaseURL: "https://fir-kuis-23368-default-rtdb.asia-southeast1.firebasedatabase.app"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

// Cek jika sudah login, langsung lempar ke admin
auth.onAuthStateChanged((user) => {
    if (user) window.location.href = "admin.html";
});

let isLoginMode = true;

const confirmGroup = document.getElementById('confirm-password-group');
const confirmInput = document.getElementById('confirm-password');

// Gunakan Event Delegation pada elemen induk 'toggle-text'
document.getElementById('toggle-text').addEventListener('click', (e) => {
    // Periksa apakah yang diklik adalah elemen <a>
    if (e.target.tagName === 'A') {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        
        const authTitle = document.getElementById('auth-title');
        const btnAuth = document.getElementById('btn-auth');
        const confirmGroup = document.getElementById('confirm-password-group');
        const confirmInput = document.getElementById('confirm-password');

        authTitle.innerText = isLoginMode ? "Login Admin" : "Daftar Admin Baru";
        btnAuth.innerText = isLoginMode ? "Masuk" : "Daftar";
        
        // Update teks footer dan pastikan ID 'toggle-auth' tetap ada
        document.getElementById('toggle-text').innerHTML = isLoginMode 
            ? 'Belum punya akun? <a href="#" id="toggle-auth">Daftar Sekarang</a>' 
            : 'Sudah punya akun? <a href="#" id="toggle-auth">Login di sini</a>';

        // Update visibilitas konfirmasi password
        if (isLoginMode) {
            confirmGroup.classList.add('hidden');
            confirmInput.removeAttribute('required');
        } else {
            confirmGroup.classList.remove('hidden');
            confirmInput.setAttribute('required', 'true');
        }
    }
});

document.getElementById('auth-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (isLoginMode) {
        auth.signInWithEmailAndPassword(email, password)
            .catch((error) => alert("Login Gagal: " + error.message));
    } else {
        const confirmPassword = confirmInput.value;
        if (password !== confirmPassword) return alert("Password tidak cocok!");

        auth.createUserWithEmailAndPassword(email, password)
            .then(() => alert("Akun berhasil dibuat!"))
            .catch((error) => alert("Daftar Gagal: " + error.message));
    }
});