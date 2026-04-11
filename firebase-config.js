const firebaseConfig = {
    apiKey: "AIzaSyA9ROcSiqYBeRSBleBfEH1dJrashnwQvG8",
    authDomain: "rentifyaze.firebaseapp.com",
    projectId: "rentifyaze",
    storageBucket: "rentifyaze.firebasestorage.app",
    messagingSenderId: "68860341954",
    appId: "1:68860341954:web:e93cc2be4f675bc34e955b",
    measurementId: "G-VC4HB166NQ"
};

const hasPlaceholders = Object.values(firebaseConfig).some((v) => String(v).includes('YOUR_'));

if (!hasPlaceholders) {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        window.db = firebase.firestore();
        window.auth = firebase.auth();
        window.firebaseReady = true;
        console.log("Firebase Client Database Connected.");
    }
} else {
    window.firebaseReady = false;
    console.warn("Firebase config has placeholders! Database will not connect until you provide real keys.");
}
