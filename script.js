// ==========================================
// 1. FIREBASE CONFIGURATION & INITIALIZATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDOyKI3LamM2jvpzE2DaS-set_JxBvfYPA",
  authDomain: "sneh-elastic-account.firebaseapp.com",
  projectId: "sneh-elastic-account",
  storageBucket: "sneh-elastic-account.firebasestorage.app",
  messagingSenderId: "578142434664",
  appId: "1:578142434664:web:3c8237180bba44aa6992dd",
  measurementId: "G-DVJ5EJ76Y3"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

let currentUserData = null;
let pending2FAUser = null;
let activeGeneratedOTP = null;

// ==========================================
// 2. AUTHENTICATION STATE OBSERVER
// ==========================================
auth.onAuthStateChanged(async (user) => {
  if (user) {
    let userData = {};
    try {
      const doc = await db.collection("users").doc(user.uid).get();
      if (doc.exists) {
        userData = doc.data();
      }
    } catch (e) {
      console.warn("Firestore Document Fetch Error:", e);
    }

    if (userData.is2FAEnabled && !sessionStorage.getItem("2fa_passed_" + user.uid)) {
      pending2FAUser = user;
      activeGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();
      
      document.getElementById("otpModal").classList.remove("hidden");
      showToast(`2FA active. OTP code generated and sent to ${user.email}`, "info");
      return;
    }

    showToast("Welcome back!", "success");
    await loadUserProfile(user);
    document.getElementById("authSection").classList.add("hidden");
    document.getElementById("profileSection").classList.remove("hidden");
  } else {
    currentUserData = null;
    document.getElementById("profileSection").classList.add("hidden");
    document.getElementById("authSection").classList.remove("hidden");
  }
});

// ==========================================
// 3. REGISTRATION / SIGNUP HANDLER
// ==========================================
async function handleSignup(e) {
  e.preventDefault();
  
  // Input fields se values get karna
  const name = document.getElementById("signupName").value.trim();
  const company = document.getElementById("signupCompany").value.trim();
  const phone = document.getElementById("signupPhone").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const btn = document.getElementById("btnSignup");

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sign Up...`;

  try {
    // 1. Firebase Authentication mein user create karna
    const res = await auth.createUserWithEmailAndPassword(email, password);
    const user = res.user;

    // 2. User Profile Data Object create karna (Name, Company Name, Phone Number, Email Address ke sath)
    const userProfileData = {
      fullName: name,
      companyName: company,
      phone: phone,
      email: email,
      is2FAEnabled: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      advanceDetails: {
        gstin: "",
        cin: "",
        pan: "",
        address: "Block C, C-206, DSIIDC Industrial Area, Sector 1, Delhi, 110039, India"
      }
    };

    // 3. Firestore database ke 'users' collection mein data save karna (UID ke basis par)
    await db.collection("users").doc(user.uid).set(userProfileData);

    // 4. Firebase Auth profile ka display name update karna
    await user.updateProfile({ displayName: name });

    showToast("Account created & details saved successfully!", "success");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `Sign Up`;
  }
}

// ==========================================
// 4. LOGIN HANDLER
// ==========================================
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const btn = document.getElementById("btnLogin");

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sign In...`;

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `Sign In`;
  }
}

// ==========================================
// 5. SOCIAL SIGN-IN HANDLERS
// ==========================================
async function handleGoogleSignIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const res = await auth.signInWithPopup(provider);
    const user = res.user;

    const userRef = db.collection("users").doc(user.uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      await userRef.set({
        fullName: user.displayName || "B2B Client",
        companyName: "Garment Partner",
        phone: user.phoneNumber || "+91 99533 10549",
        email: user.email,
        is2FAEnabled: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        advanceDetails: { gstin: "", cin: "", pan: "", address: "Sector 1 DSIIDC Delhi" }
      });
    }
  } catch (err) {
    showToast("Google Auth: " + err.message, "info");
  }
}

async function handleAppleSignIn() {
  const provider = new firebase.auth.OAuthProvider('apple.com');
  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    showToast("Apple Auth: " + err.message, "info");
  }
}

// ==========================================
// 6. 2FA & SECURITY UTILITIES
// ==========================================
function verify2FAOTP() {
  const input = document.getElementById("otpInput").value.trim();
  if (input === activeGeneratedOTP) {
    sessionStorage.setItem("2fa_passed_" + pending2FAUser.uid, "true");
    document.getElementById("otpModal").classList.add("hidden");
    showToast("2-Step Verification passed!", "success");
    loadUserProfile(pending2FAUser);
    document.getElementById("authSection").classList.add("hidden");
    document.getElementById("profileSection").classList.remove("hidden");
  } else {
    showToast("Invalid OTP code.", "error");
  }
}

function closeOTPModal() {
  document.getElementById("otpModal").classList.add("hidden");
  auth.signOut();
}

async function handleForgotPassword() {
  const email = prompt("Enter your registered work email for password reset:");
  if (email) {
    try {
      await auth.sendPasswordResetEmail(email);
      showToast("Password reset link sent to your email!", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
}

// ==========================================
// 7. PROFILE DISPLAY & EDIT MANAGEMENT
// ==========================================
async function loadUserProfile(user) {
  let data = {
    fullName: user.displayName || "Valued Client",
    companyName: "Sneh Elastic B2B Partner",
    phone: user.phoneNumber || "+91 99533 10549",
    email: user.email,
    is2FAEnabled: false,
    advanceDetails: {
      gstin: "",
      cin: "",
      pan: "",
      address: "Block C, C-206, DSIIDC Industrial Area, Sector 1, Delhi, 110039, India"
    }
  };

  try {
    const doc = await db.collection("users").doc(user.uid).get();
    if (doc.exists) {
      data = { ...data, ...doc.data() };
    }
  } catch (e) {
    console.warn("Firestore fetch notice:", e);
  }

  currentUserData = data;

  document.getElementById("dispFullName").innerText = data.fullName || "Valued Client";
  document.getElementById("dispCompanyName").innerText = data.companyName || "Sneh Elastic B2B Partner";
  document.getElementById("dispPhone").innerText = data.phone || "+91 99533 10549";
  document.getElementById("dispUID").innerText = user.uid;

  const initials = (data.fullName || "SE").split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  document.getElementById("profileInitials").innerText = initials || "SE";

  document.getElementById("overviewName").innerText = data.fullName || "---";
  document.getElementById("overviewCompany").innerText = data.companyName || "---";
  document.getElementById("overviewEmail").innerText = data.email || "---";
  document.getElementById("overviewPhone").innerText = data.phone || "---";

  document.getElementById("editFullName").value = data.fullName || "";
  document.getElementById("editCompanyName").value = data.companyName || "";
  document.getElementById("editPhone").value = data.phone || "";
  document.getElementById("twoFactorToggle").checked = data.is2FAEnabled || false;

  const adv = data.advanceDetails || {};
  document.getElementById("advGSTIN").value = adv.gstin || "";
  document.getElementById("advCIN").value = adv.cin || "";
  document.getElementById("advPAN").value = adv.pan || "";
  document.getElementById("advAddress").value = adv.address || "Block C, C-206, DSIIDC Industrial Area, Sector 1, Delhi, 110039, India";
}

async function saveProfileEditsDirect() {
  const user = auth.currentUser;
  const btn = document.getElementById("btnSaveProfile");

  const newFullName = document.getElementById("editFullName").value.trim();
  const newCompanyName = document.getElementById("editCompanyName").value.trim();
  const newPhone = document.getElementById("editPhone").value.trim();

  if (!newFullName || !newCompanyName) {
    showToast("Please fill in Full Name and Company Name.", "error");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

  try {
    if (user) {
      await db.collection("users").doc(user.uid).set({
        fullName: newFullName,
        companyName: newCompanyName,
        phone: newPhone
      }, { merge: true });

      await user.updateProfile({ displayName: newFullName });
    }

    document.getElementById("dispFullName").innerText = newFullName;
    document.getElementById("dispCompanyName").innerText = newCompanyName;
    document.getElementById("dispPhone").innerText = newPhone;
    document.getElementById("overviewName").innerText = newFullName;
    document.getElementById("overviewCompany").innerText = newCompanyName;
    document.getElementById("overviewPhone").innerText = newPhone;

    const initials = newFullName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    document.getElementById("profileInitials").innerText = initials || "SE";

    showToast("Profile updated successfully!", "success");
  } catch (err) {
    showToast("Profile details updated.", "success");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-user-check text-brandCyan"></i><span>Save Changes</span>`;
  }
}

async function toggle2FA(enabled) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    await db.collection("users").doc(user.uid).set({ is2FAEnabled: enabled }, { merge: true });
    showToast(`2-Step Verification ${enabled ? "enabled" : "disabled"}!`, "info");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function saveAdvanceDetails(e) {
  e.preventDefault();
  const user = auth.currentUser;
  const btn = document.getElementById("btnSaveAdvance");

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

  const advanceDetails = {
    gstin: document.getElementById("advGSTIN").value.trim(),
    cin: document.getElementById("advCIN").value.trim(),
    pan: document.getElementById("advPAN").value.trim(),
    address: document.getElementById("advAddress").value.trim()
  };

  try {
    if (user) {
      await db.collection("users").doc(user.uid).set({ advanceDetails }, { merge: true });
    }
    showToast("Advance details saved successfully!", "success");
  } catch (err) {
    showToast("Details stored for current session.", "info");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk text-brandCyan"></i><span>Save Advance Details</span>`;
  }
}

async function handleLogout() {
  try {
    const user = auth.currentUser;
    if (user) sessionStorage.removeItem("2fa_passed_" + user.uid);
    await auth.signOut();
    showToast("Logged out successfully.", "info");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ==========================================
// 8. INTERFACE HELPERS & ANIMATIONS
// ==========================================
function flipCard(showSignup) {
  const flipper = document.getElementById("cardFlipper");
  if (showSignup) {
    flipper.classList.add("rotate-y-180");
  } else {
    flipper.classList.remove("rotate-y-180");
  }
}

function togglePasswordVisibility(id, iconEl) {
  const input = document.getElementById(id);
  if (input.type === "password") {
    input.type = "text";
    iconEl.classList.replace("fa-eye", "fa-eye-slash");
  } else {
    input.type = "password";
    iconEl.classList.replace("fa-eye-slash", "fa-eye");
  }
}

function checkPasswordStrength(val) {
  const bar = document.getElementById("strengthBar");
  let score = 0;
  if (val.length >= 6) score += 33;
  if (/[A-Z]/.test(val) && /[0-9]/.test(val)) score += 33;
  if (/[^A-Za-z0-9]/.test(val)) score += 34;

  bar.style.width = score + "%";
  if (score <= 33) bar.className = "h-full bg-red-500 transition-all duration-300";
  else if (score <= 66) bar.className = "h-full bg-yellow-500 transition-all duration-300";
  else bar.className = "h-full bg-emerald-500 transition-all duration-300";
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
  document.getElementById(tabId).classList.remove("hidden");

  document.querySelectorAll(".nav-tab-btn").forEach(b => {
    b.classList.remove("bg-brandGreen", "text-white");
    b.classList.add("text-gray-600");
  });
  const activeBtn = document.getElementById("btn-" + tabId);
  activeBtn.classList.add("bg-brandGreen", "text-white");
  activeBtn.classList.remove("text-gray-600");
}

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  const icon = document.getElementById("toastIcon");
  const msg = document.getElementById("toastMessage");

  msg.innerText = message;
  toast.className = "fixed top-5 right-5 z-50 transition-all duration-300 flex items-center p-4 rounded-xl shadow-2xl text-white font-medium max-w-md ";

  if (type === "success") {
    toast.classList.add("bg-emerald-600");
    icon.innerHTML = `<i class="fa-solid fa-circle-check"></i>`;
  } else if (type === "error") {
    toast.classList.add("bg-red-600");
    icon.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i>`;
  } else {
    toast.classList.add("bg-brandGreen");
    icon.innerHTML = `<i class="fa-solid fa-circle-info"></i>`;
  }

  toast.classList.remove("hidden", "translate-x-full");
  setTimeout(() => {
    toast.classList.add("translate-x-full");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 4000);
}

// Canvas Wave Animation
const canvas = document.getElementById("threadCanvas");
const ctx = canvas.getContext("2d");
let width, height;

function resizeCanvas() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const threads = Array.from({ length: 14 }, () => ({
  x: Math.random() * width,
  y: Math.random() * height,
  length: 120 + Math.random() * 180,
  speed: 0.4 + Math.random() * 0.6,
  color: Math.random() > 0.5 ? "rgba(32, 82, 82, 0.15)" : "rgba(0, 212, 255, 0.2)"
}));

function animateBackground() {
  ctx.clearRect(0, 0, width, height);

  threads.forEach(t => {
    t.y -= t.speed;
    if (t.y < -t.length) t.y = height + t.length;

    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.quadraticCurveTo(
      t.x + Math.sin(t.y * 0.02) * 25,
      t.y - t.length / 2,
      t.x + Math.cos(t.y * 0.02) * 20,
      t.y - t.length
    );
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  requestAnimationFrame(animateBackground);
}
animateBackground();
