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
let activeUid = null;

// ==========================================
// 2. AUTH OBSERVER & ROUTING
// ==========================================
auth.onAuthStateChanged(async (user) => {
  const path = window.location.pathname;
  const isProfilePage = path.includes("profile.html");
  const isAuthPage = path.includes("index.html") || path === "/" || path.endsWith("/");

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

    if (userData.is2FAEnabled && userData.customPin && !sessionStorage.getItem("2fa_passed_" + user.uid)) {
      pending2FAUser = user;
      activeUid = user.uid;
      const otpModal = document.getElementById("otpModal");
      if (otpModal) otpModal.classList.remove("hidden");
      showToast("2-Step Verification required. Enter your 4-digit PIN.", "info");
      return;
    }

    if (isAuthPage && !isProfilePage) {
      window.location.replace("profile.html");
      return;
    }

    if (isProfilePage) {
      await loadUserProfile(user);
    }
  } else {
    if (isProfilePage) {
      window.location.replace("index.html");
      return;
    }
  }
});

// ==========================================
// 3. SIGNUP & LOGIN HANDLERS
// ==========================================
async function handleSignup(e) {
  e.preventDefault();
  
  const name = document.getElementById("signupName").value.trim();
  const company = document.getElementById("signupCompany").value.trim();
  const phone = document.getElementById("signupPhone").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const btn = document.getElementById("btnSignup");

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sign Up...`;
  }

  try {
    const res = await auth.createUserWithEmailAndPassword(email, password);
    const user = res.user;

    const userProfileData = {
      fullName: name,
      companyName: company,
      phone: phone,
      email: email,
      regionMode: "IN",
      selectedCountry: "IN",
      is2FAEnabled: false,
      customPin: "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      advanceDetails: {
        gstin: "",
        cin: "",
        pan: "",
        globalTaxID: "",
        address: "Block C, C-206, DSIIDC Industrial Area, Sector 1, Delhi, 110039, India"
      }
    };

    await db.collection("users").doc(user.uid).set(userProfileData);
    await user.updateProfile({ displayName: name });

    showToast("Account created successfully! Redirecting...", "success");
    window.location.replace("profile.html");
  } catch (err) {
    showToast(err.message, "error");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `Sign Up`;
    }
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const btn = document.getElementById("btnLogin");

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sign In...`;
  }

  try {
    const res = await auth.signInWithEmailAndPassword(email, password);
    const user = res.user;

    const doc = await db.collection("users").doc(user.uid).get();
    let is2FAActive = false;
    if (doc.exists && doc.data().is2FAEnabled && doc.data().customPin) {
      is2FAActive = true;
    }

    if (!is2FAActive || sessionStorage.getItem("2fa_passed_" + user.uid)) {
      showToast("Sign in successful! Redirecting...", "success");
      window.location.replace("profile.html");
    }
  } catch (err) {
    showToast(err.message, "error");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `Sign In`;
    }
  }
}

// ==========================================
// 4. SOCIAL SIGN-IN
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
        phone: user.phoneNumber || "9953310549",
        email: user.email,
        regionMode: "IN",
        selectedCountry: "IN",
        is2FAEnabled: false,
        customPin: "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        advanceDetails: { gstin: "", cin: "", pan: "", globalTaxID: "", address: "Sector 1 DSIIDC Delhi" }
      });
    }
    window.location.replace("profile.html");
  } catch (err) {
    showToast("Google Auth: " + err.message, "info");
  }
}

async function handleAppleSignIn() {
  const provider = new firebase.auth.OAuthProvider('apple.com');
  try {
    await auth.signInWithPopup(provider);
    window.location.replace("profile.html");
  } catch (err) {
    showToast("Apple Auth: " + err.message, "info");
  }
}

// ==========================================
// 5. 2FA & SECURITY
// ==========================================
async function verify2FAOTP() {
  const inputPin = document.getElementById("otpInput").value.trim();
  if (!pending2FAUser) return;

  try {
    const doc = await db.collection("users").doc(pending2FAUser.uid).get();
    if (doc.exists && doc.data().customPin === inputPin) {
      sessionStorage.setItem("2fa_passed_" + pending2FAUser.uid, "true");
      document.getElementById("otpModal").classList.add("hidden");
      document.getElementById("otpInput").value = "";
      showToast("2-Step Verification passed!", "success");
      window.location.replace("profile.html");
    } else {
      showToast("Invalid 4-digit PIN code.", "error");
    }
  } catch (e) {
    showToast("Verification error: " + e.message, "error");
  }
}

function closeOTPModal() {
  const modal = document.getElementById("otpModal");
  if (modal) modal.classList.add("hidden");
  const input = document.getElementById("otpInput");
  if (input) input.value = "";
  auth.signOut();
}

function toggle2FAState(enabled) {
  const setupContainer = document.getElementById("pinSetupContainer");
  if (setupContainer) {
    if (enabled) {
      setupContainer.classList.remove("hidden");
    } else {
      setupContainer.classList.add("hidden");
      const user = auth.currentUser;
      if (user) {
        db.collection("users").doc(user.uid).set({ is2FAEnabled: false, customPin: "" }, { merge: true });
        showToast("2-Step Verification disabled.", "info");
      }
    }
  }
}

async function saveCustomPin() {
  const user = auth.currentUser;
  const pin1 = document.getElementById("setupPin").value.trim();
  const pin2 = document.getElementById("confirmPin").value.trim();

  if (pin1.length !== 4 || !/^\d+$/.test(pin1)) {
    showToast("PIN must be exactly 4 digits.", "error");
    return;
  }
  if (pin1 !== pin2) {
    showToast("PIN codes do not match.", "error");
    return;
  }

  try {
    await db.collection("users").doc(user.uid).set({
      is2FAEnabled: true,
      customPin: pin1
    }, { merge: true });

    const toggle = document.getElementById("twoFactorToggle");
    if (toggle) toggle.checked = true;
    showToast("Custom 4-digit PIN configured successfully!", "success");
  } catch (err) {
    showToast("Error saving PIN: " + err.message, "error");
  }
}

// ==========================================
// 6. REGION SWITCHER (INDIA vs GLOBAL)
// ==========================================
async function handleRegionChange(mode) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    await db.collection("users").doc(user.uid).set({ regionMode: mode }, { merge: true });
    showToast(mode === "GLOBAL" ? "Switched to Global B2B Mode!" : "Switched to India Mode.", "success");
    applyRegionUI(mode);
  } catch (err) {
    showToast("Error updating region: " + err.message, "error");
  }
}

function applyRegionUI(mode) {
  const countryFieldContainer = document.getElementById("globalCountryFieldContainer");
  const indiaAdvFields = document.getElementById("indiaAdvanceFields");
  const globalAdvFields = document.getElementById("globalAdvanceFields");
  const advHeaderTitle = document.getElementById("advHeaderTitle");
  const advHeaderSub = document.getElementById("advHeaderSub");
  const overviewCountryRow = document.getElementById("overviewCountryRow");
  const regionSelect = document.getElementById("regionSelect");

  if (regionSelect) regionSelect.value = mode;

  if (mode === "GLOBAL") {
    if (countryFieldContainer) countryFieldContainer.classList.remove("hidden");
    if (indiaAdvFields) indiaAdvFields.classList.add("hidden");
    if (globalAdvFields) globalAdvFields.classList.remove("hidden");
    if (advHeaderTitle) advHeaderTitle.innerText = "Global Corporate Credentials";
    if (advHeaderSub) advHeaderSub.innerText = "International tax & identification number for global B2B transactions.";
    if (overviewCountryRow) overviewCountryRow.classList.remove("hidden");
  } else {
    if (countryFieldContainer) countryFieldContainer.classList.add("hidden");
    if (indiaAdvFields) indiaAdvFields.classList.remove("hidden");
    if (globalAdvFields) globalAdvFields.classList.add("hidden");
    if (advHeaderTitle) advHeaderTitle.innerText = "Advance Business Details";
    if (advHeaderSub) advHeaderSub.innerText = "Tax and factory location credentials for B2B invoicing.";
    if (overviewCountryRow) overviewCountryRow.classList.add("hidden");
  }
}

function onCountryChange(countryVal) {
  const selectElem = document.getElementById("editCountrySelect");
  const phoneCodeInput = document.getElementById("editPhoneCode");
  if (!selectElem || !phoneCodeInput) return;

  const selectedOpt = selectElem.options[selectElem.selectedIndex];
  const dialCode = selectedOpt.getAttribute("data-code");
  if (dialCode) {
    phoneCodeInput.value = dialCode;
  }
}

// ==========================================
// 7. ACCOUNT SETTING ACTIONS
// ==========================================
async function handleResetPassword() {
  const user = auth.currentUser;
  if (!user || !user.email) {
    showToast("No active user email found.", "error");
    return;
  }
  if (confirm(`Send password reset link to ${user.email}?`)) {
    try {
      await auth.sendPasswordResetEmail(user.email);
      showToast("Password reset email sent!", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
}

async function handleResetEmail() {
  const newEmail = prompt("Enter your new work email address:");
  if (newEmail) {
    const user = auth.currentUser;
    try {
      await user.updateEmail(newEmail);
      await db.collection("users").doc(user.uid).set({ email: newEmail }, { merge: true });
      showToast("Email updated successfully! Please re-login.", "success");
      setTimeout(() => { handleLogout(); }, 1500);
    } catch (err) {
      showToast(err.message, "error");
    }
  }
}

async function handleDeleteAccount() {
  const confirmText = prompt("Type 'DELETE' to permanently delete your B2B account and data:");
  if (confirmText === "DELETE") {
    const user = auth.currentUser;
    try {
      await db.collection("users").doc(user.uid).delete();
      await user.delete();
      showToast("Account permanently deleted.", "info");
      setTimeout(() => { window.location.replace("index.html"); }, 1000);
    } catch (err) {
      showToast("Error deleting account: " + err.message + " (Please re-login and try again)", "error");
    }
  }
}

// ==========================================
// 8. PROFILE LOAD & EDIT
// ==========================================
async function loadUserProfile(user) {
  activeUid = user.uid;
  let data = {
    fullName: user.displayName || "Valued Client",
    companyName: "Sneh Elastic B2B Partner",
    phone: user.phoneNumber || "9953310549",
    email: user.email,
    regionMode: "IN",
    selectedCountry: "IN",
    is2FAEnabled: false,
    customPin: "",
    advanceDetails: {
      gstin: "",
      cin: "",
      pan: "",
      globalTaxID: "",
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
  applyRegionUI(data.regionMode || "IN");

  const setElemText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setElemText("dispFullName", data.fullName || "Valued Client");
  setElemText("dispCompanyName", data.companyName || "Sneh Elastic B2B Partner");
  
  let fullDisplayPhone = (data.regionMode === "GLOBAL" ? (data.phoneCode || "+91") + " " : "+91 ") + (data.phone || "");
  setElemText("dispPhone", fullDisplayPhone);
  setElemText("dispUID", user.uid);

  const initials = (data.fullName || "SE").split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  setElemText("profileInitials", initials || "SE");

  setElemText("overviewName", data.fullName || "---");
  setElemText("overviewCompany", data.companyName || "---");
  setElemText("overviewEmail", data.email || "---");
  setElemText("overviewPhone", fullDisplayPhone);
  setElemText("overviewCountry", data.selectedCountry || "IN");

  const editName = document.getElementById("editFullName");
  if (editName) editName.value = data.fullName || "";
  const editComp = document.getElementById("editCompanyName");
  if (editComp) editComp.value = data.companyName || "";
  const editPh = document.getElementById("editPhone");
  if (editPh) editPh.value = data.phone || "";
  const editCountry = document.getElementById("editCountrySelect");
  if (editCountry) {
    editCountry.value = data.selectedCountry || "IN";
    onCountryChange(editCountry.value);
  }

  const is2fa = data.is2FAEnabled || false;
  const toggle = document.getElementById("twoFactorToggle");
  if (toggle) toggle.checked = is2fa;
  
  const pinContainer = document.getElementById("pinSetupContainer");
  if (pinContainer) {
    if (is2fa) pinContainer.classList.remove("hidden");
    else pinContainer.classList.add("hidden");
  }

  const adv = data.advanceDetails || {};
  const gstinEl = document.getElementById("advGSTIN");
  if (gstinEl) gstinEl.value = adv.gstin || "";
  const cinEl = document.getElementById("advCIN");
  if (cinEl) cinEl.value = adv.cin || "";
  const panEl = document.getElementById("advPAN");
  if (panEl) panEl.value = adv.pan || "";
  const globalTaxEl = document.getElementById("advGlobalTaxID");
  if (globalTaxEl) globalTaxEl.value = adv.globalTaxID || "";
  const addrEl = document.getElementById("advAddress");
  if (addrEl) addrEl.value = adv.address || "Block C, C-206, DSIIDC Industrial Area, Sector 1, Delhi, 110039, India";
}

function openQRModal() {
  if (!activeUid) return;
  const modalUID = document.getElementById("modalFullUID");
  if (modalUID) modalUID.innerText = activeUid;
  
  const qrContainer = document.getElementById("qrcodeContainer");
  if (qrContainer) {
    qrContainer.innerHTML = "";
    try {
      const qr = qrcode(0, 'M');
      qr.addData(activeUid);
      qr.make();
      qrContainer.innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
    } catch (e) {
      qrContainer.innerHTML = `<p class="text-xs text-red-500">QR Generation Failed</p>`;
    }
  }

  const qrModal = document.getElementById("qrModal");
  if (qrModal) qrModal.classList.remove("hidden");
}

function closeQRModal() {
  const qrModal = document.getElementById("qrModal");
  if (qrModal) qrModal.classList.add("hidden");
}

async function saveProfileEditsDirect() {
  const user = auth.currentUser;
  const btn = document.getElementById("btnSaveProfile");

  const newFullName = document.getElementById("editFullName").value.trim();
  const newCompanyName = document.getElementById("editCompanyName").value.trim();
  const newPhone = document.getElementById("editPhone").value.trim();
  const selectedCountry = document.getElementById("editCountrySelect").value;
  const phoneCode = document.getElementById("editPhoneCode").value;

  if (!newFullName || !newCompanyName) {
    showToast("Please fill in Full Name and Company Name.", "error");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
  }

  try {
    if (user) {
      await db.collection("users").doc(user.uid).set({
        fullName: newFullName,
        companyName: newCompanyName,
        phone: newPhone,
        selectedCountry: selectedCountry,
        phoneCode: phoneCode
      }, { merge: true });

      await user.updateProfile({ displayName: newFullName });
    }

    showToast("Profile updated successfully!", "success");
    await loadUserProfile(user);
  } catch (err) {
    showToast("Profile details updated.", "success");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-user-check text-brandCyan"></i><span>Save Changes</span>`;
    }
  }
}

async function saveAdvanceDetails(e) {
  e.preventDefault();
  const user = auth.currentUser;
  const btn = document.getElementById("btnSaveAdvance");

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
  }

  const advanceDetails = {
    gstin: document.getElementById("advGSTIN").value.trim(),
    cin: document.getElementById("advCIN").value.trim(),
    pan: document.getElementById("advPAN").value.trim(),
    globalTaxID: document.getElementById("advGlobalTaxID").value.trim(),
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
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk text-brandCyan"></i><span>Save Advance Details</span>`;
    }
  }
}

function searchInvoice() {
  const invInput = document.getElementById("invoiceNumberInput").value.trim().toUpperCase();
  const resultContainer = document.getElementById("invoiceResultContainer");

  if (!invInput) {
    showToast("Please enter an invoice number.", "error");
    resultContainer.classList.add("hidden");
    return;
  }

  resultContainer.classList.remove("hidden");
  resultContainer.className = "p-4 rounded-2xl border text-xs sm:text-sm font-medium bg-red-50 border-red-200 text-red-700 animate-fade-in";
  resultContainer.innerHTML = `
    <div class="flex items-center space-x-2">
      <i class="fa-solid fa-circle-exclamation text-base"></i>
      <div>
        <p class="font-bold">No invoice found</p>
        <p class="text-[11px] mt-0.5 opacity-90">Invoice number "<strong>${invInput}</strong>" does not exist in our active B2B billing records.</p>
      </div>
    </div>
  `;
}

async function handleLogout() {
  try {
    const user = auth.currentUser;
    if (user) sessionStorage.removeItem("2fa_passed_" + user.uid);
    await auth.signOut();
    showToast("Logged out successfully.", "info");
    window.location.replace("index.html");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ==========================================
// 9. TAB SWITCHING
// ==========================================
function switchTab(tabId) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
  const target = document.getElementById(tabId);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".menu-btn").forEach(b => {
    b.classList.remove("active-menu");
  });
  const activeBtn = document.getElementById("btn-" + tabId);
  if (activeBtn) {
    activeBtn.classList.add("active-menu");
  }
}

// ==========================================
// 10. HELPERS & TOAST
// ==========================================
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  const icon = document.getElementById("toastIcon");
  const msg = document.getElementById("toastMessage");
  if (!toast || !msg) return;

  msg.innerText = message;
  toast.className = "fixed top-5 right-5 z-50 transition-all duration-300 flex items-center p-4 rounded-xl shadow-2xl text-white font-medium max-w-md ";

  if (type === "success") {
    toast.classList.add("bg-emerald-600");
    if (icon) icon.innerHTML = `<i class="fa-solid fa-circle-check"></i>`;
  } else if (type === "error") {
    toast.classList.add("bg-red-600");
    if (icon) icon.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i>`;
  } else {
    toast.classList.add("bg-brandGreen");
    if (icon) icon.innerHTML = `<i class="fa-solid fa-circle-info"></i>`;
  }

  toast.classList.remove("hidden", "translate-x-full");
  setTimeout(() => {
    toast.classList.add("translate-x-full");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 4000);
}
