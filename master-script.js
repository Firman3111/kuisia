// --- CONFIG & INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDoo_WtH6JbT0KvMzmud5Ew_TpEjgFGqhU",
    authDomain: "fir-kuis-23368.firebaseapp.com",
    databaseURL: "https://fir-kuis-23368-default-rtdb.asia-southeast1.firebasedatabase.app"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// 1. PROTEKSI PANEL MASTER
auth.onAuthStateChanged((user) => {
    const MASTER_EMAIL = "firman.a.prasetyo@gmail.com";
    if (!user || user.email !== MASTER_EMAIL) {
        alert("Akses Ditolak! Hanya Master yang boleh masuk.");
        window.location.href = "admin.html";
    } else {
        loadAllUsers();
    }
});

// 2. LOAD DAFTAR USER (OPTIMIZED)
function loadAllUsers() {
    const tbody = document.getElementById('user-list-body');
    if (!tbody) return;

    // Ambil semua data user
    database.ref('users').on('value', async (snapshot) => {
        tbody.innerHTML = '';
        
        snapshot.forEach((childSnapshot) => {
            const uid = childSnapshot.key;
            const userData = childSnapshot.val();
            
            // Ambil data dasar
            let displayNama = userData.profile?.nama || "User Baru";
            let displayEmail = userData.profile?.email || "-";
            const isPremium = userData.is_premium || false;
            const expiry = userData.expiry_date || "-";

            // JIKA EMAIL MASIH KOSONG, CARI DI QUIZ_INDEX
            if (displayEmail === "-") {
                database.ref('quiz_index').orderByChild('userId').equalTo(uid).limitToFirst(1).once('value', (quizSnap) => {
                    if (quizSnap.exists()) {
                        quizSnap.forEach(q => {
                            const qData = q.val();
                            displayEmail = qData.authorEmail || "-";
                            displayNama = qData.authorName || displayNama;
                            
                            // Update baris tabel secara spesifik jika ketemu
                            const row = document.getElementById(`row-${uid}`);
                            if (row) {
                                row.cells[0].innerText = displayNama;
                                row.cells[1].innerText = displayEmail;
                            }
                        });
                    }
                });
            }

            const tr = document.createElement('tr');
            tr.id = `row-${uid}`; // Beri ID agar bisa diupdate jika pencarian email berhasil
            tr.innerHTML = `
                <td>${displayNama}</td>
                <td>${displayEmail}</td>
                <td>
                    <span class="badge ${isPremium ? 'badge-premium' : 'badge-free'}">
                        ${isPremium ? '💎 PREMIUM' : 'FREE'}
                    </span>
                </td>
                <td>${expiry}</td>
                <td>
                    <button class="btn-master btn-edit" onclick="openMasterModal('${uid}', ${isPremium}, '${expiry}')" title="Atur Akses">
                        <i class="fas fa-user-cog"></i>
                    </button>
                    <button class="btn-hapus" onclick="hapusUser('${uid}', '${displayNama}')" title="Hapus User">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
}

// 3. MODAL CONTROL
window.openMasterModal = function(uid, isPremium, expiry) {
    document.getElementById('target-uid').value = uid;
    document.getElementById('select-status').value = isPremium.toString();
    document.getElementById('input-expiry').value = expiry || "";
    document.getElementById('modal-premium').style.display = 'block';
};

window.closeMasterModal = function() {
    document.getElementById('modal-premium').style.display = 'none';
};

// 4. JEMBATAN SIMPAN (UPDATE PREMIUM STATUS)
window.savePremiumSettings = async function() {
    const uid = document.getElementById('target-uid').value;
    const isPremium = document.getElementById('select-status').value === "true";
    const expiry = document.getElementById('input-expiry').value;

    if (!uid) return;

    try {
        await database.ref(`users/${uid}`).update({
            is_premium: isPremium,
            expiry_date: expiry
        });
        
        alert("✅ Status Berhasil Diperbarui!");
        closeMasterModal();
        loadAllUsers(); // Refresh tabel
    } catch (error) {
        console.error(error);
        alert("Gagal mengupdate data.");
    }
};

window.hapusUser = async function(uid, nama) {
    if (confirm(`⚠️ PERINGATAN: Apakah Anda yakin ingin menghapus user "${nama}"? Semua data kuis milik user ini juga akan terhapus secara permanen.`)) {
        try {
            // 1. Hapus data user di folder /users/
            await database.ref(`users/${uid}`).remove();
            
            // 2. Cari dan hapus kuis-kuis milik user tersebut di quiz_index
            const quizIndexRef = database.ref('quiz_index');
            const snapshot = await quizIndexRef.orderByChild('userId').equalTo(uid).once('value');
            
            if (snapshot.exists()) {
                const updates = {};
                snapshot.forEach((child) => {
                    updates[child.key] = null; // Tandai untuk dihapus
                });
                await quizIndexRef.update(updates);
            }

            alert("✅ User dan kuis terkait berhasil dihapus!");
            loadAllUsers(); // Refresh tabel
        } catch (error) {
            console.error(error);
            alert("Gagal menghapus user.");
        }
    }
};

window.jalankanMigrasiConfig = async function() {
    if (!confirm("Paksa sinkronisasi email dan nama dari database kuis?")) return;

    try {
        const quizIndexSnap = await database.ref('quiz_index').once('value');
        const updates = {};
        
        quizIndexSnap.forEach((child) => {
            const data = child.val();
            const uid = data.userId;

            if (uid && data.authorEmail) {
                // Paksa tulis ke folder profile user
                updates[`users/${uid}/profile/email`] = data.authorEmail;
                updates[`users/${uid}/profile/nama`] = data.authorName || data.authorEmail.split('@')[0];
                updates[`users/${uid}/profile/role`] = "author";
            }
        });

        await database.ref().update(updates);
        alert("✅ Sinkronisasi Profil Selesai!");
        location.reload();
    } catch (error) {
        console.error(error);
        alert("Gagal migrasi: " + error.message);
    }
};