const state = { sell: [], rent: [], skills: [] };
window.cloudDataCache = state;
let isAdmin = sessionStorage.getItem('rentify_admin') === 'true';
let isLoggedIn = sessionStorage.getItem('rentify_user') != null && sessionStorage.getItem('rentify_user') !== 'Guest';
const isCloudMode = true; // Hardcoded to true to mandate Firebase

const listByCategory = {
    sell: 'sellItemsList',
    rent: 'rentItemsList',
    skills: 'skillItemsList'
};

document.addEventListener('DOMContentLoaded', async () => {
    updateNavAuth();
    bindSearch();
    bindForm('sellForm', 'sell');
    bindForm('rentForm', 'rent');
    bindForm('skillForm', 'skills');
    bindAuthForms();

    // ── 3. PAGE SPECIFIC & LOGIC ───────────────────────────────────────
    console.log("Starting Rentify logic...");
    const path = location.pathname.toLowerCase();
    
    // Page-specific setup
    if (path.includes('checkout')) setupCheckoutPage();
    if (path.includes('orders'))   renderOrdersPage();
    if (path.includes('profile'))  renderProfile();
    if (path.includes('admin'))    return;

    // Data loading logic
    const isHome = path === '/' || path.includes('index') || path === '';
    const isSell = path.includes('sell');
    const isRent = path.includes('rent');
    const isSkills = path.includes('skills');

    if (isSell || isHome) await load('sell');
    if (isRent)           await load('rent');
    if (isSkills)         await load('skills');

    // Safe GSAP Animations
    if (typeof gsap !== 'undefined') {
        const featureCards = document.querySelectorAll('.feature-card');
        if (featureCards.length > 0) {
            gsap.from(featureCards, {
                y: 30, opacity: 0, duration: 0.8, stagger: 0.15, ease: "power2.out",
                scrollTrigger: { trigger: ".features-grid", start: "top 85%" }
            });
        }
        
        const itemCards = document.querySelectorAll('.item-card');
        if (itemCards.length > 0) {
            gsap.from(itemCards, {
                y: 40, opacity: 0, duration: 0.7, stagger: 0.1, ease: "back.out(1.4)",
                scrollTrigger: { trigger: ".items-grid", start: "top 90%" }
            });
        }
    }

    // Visibility rules:
    // Only admins can see the sell panel (Buy section list item box)
    const sellPanel = document.getElementById('sellFormPanel');
    if (sellPanel && !isAdmin) hidePanel(sellPanel);

    // Only logged in users can see the Rent and Skills panels
    const rentPanel  = document.getElementById('rentFormPanel');
    const skillPanel = document.getElementById('skillFormPanel');
    if (rentPanel  && !isLoggedIn) hidePanel(rentPanel);
    if (skillPanel && !isLoggedIn) hidePanel(skillPanel);

    // Initial Splash Screen Handling (Only once per session)
    const splash = document.getElementById('app-splash');
    if (splash) {
        if (sessionStorage.getItem('rentify_splash_seen')) {
            splash.style.display = 'none';
        } else {
            sessionStorage.setItem('rentify_splash_seen', 'true');
            setTimeout(() => {
                splash.style.opacity = '0';
                splash.style.visibility = 'hidden';
            }, 1500);
        }
    }
});

function hidePanel(el) {
    if (el) el.style.display = 'none';
}

/* Update navbar: show Profile icon when logged in, Login button when not */
function updateNavAuth() {
    const authContainer = document.querySelector('.auth-nav-container');
    if (!authContainer) return;
    const loginLink = authContainer.querySelector('a[href="login.html"]');
    if (!loginLink) return;
    if (isLoggedIn) {
        loginLink.textContent = '👤 Profile';
        loginLink.href = 'profile.html';
        loginLink.setAttribute('aria-label', 'Your Profile');
    }
}

function showSetupError(message) {
    Object.values(listByCategory).forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div class="empty-state" style="color:#DC2626">${message}</div>`;
    });
}

function bindSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    input.addEventListener('input', () => renderCurrent(input.value.trim().toLowerCase()));
}

function hideFormPanel() {
    const formPanel = document.querySelector('.form-panel');
    const split = document.querySelector('.split-layout');
    if (formPanel) formPanel.style.display = 'none';
    if (split) split.style.gridTemplateColumns = '1fr';
}

async function load(category) {
    const list = document.getElementById(listByCategory[category]);
    if (!list) return;
    if (!window.db) {
        console.error("Firebase Database (window.db) is not initialized.");
        list.innerHTML = '<div class="empty-state">Database not connected. Check Firebase config.</div>';
        return;
    }
    console.log(`Attempting to load data for: ${category}...`);
    try {
        // Try fetching with order first
        let snap;
        try {
            snap = await db.collection(category).orderBy('createdAt', 'desc').limit(50).get();
        } catch (orderErr) {
            console.warn("Ordered fetch failed, trying without order:", orderErr);
            snap = await db.collection(category).limit(50).get();
        }
        
        state[category] = snap.docs.map((d) => normalize({ id: d.id, ...d.data() }, category));
        console.log(`Successfully loaded ${state[category].length} items for ${category}`);
        renderCurrent('');
    } catch (e) {
        console.error(`Error loading ${category}:`, e);
        list.innerHTML = `<div class="empty-state">Unable to load data. <br><small>${e.message}</small></div>`;
    }
}

function normalize(item, category) {
    return {
        id: item.id,
        title: item.title || item.name || item.topic || 'Untitled',
        price: Number(item.price || 0),
        description: item.description || item.desc || item.contact || '',
        imageUrl: item.imageUrl || item.imgUrl || '',
        category: item.category || category,
        uploaderEmail: item.uploaderEmail || null
    };
}

function bindForm(formId, category) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isLoggedIn) {
            showLoginPopup();
            return;
        }
        
        if (category === 'sell' && !isAdmin) {
            alert('Only authorized Campus Admins can list new products in this section.');
            return;
        }

        const data = collect(formId, category);
        if (!data.title || !data.price || !data.description) return alert('Fill required fields');

        const btn = form.querySelector('button[type="submit"]');
        const old = btn.innerText;
        btn.disabled = true;
        btn.innerText = 'Saving...';

        try {
            const currentUserEmail = sessionStorage.getItem('rentify_user');
            const ref = await db.collection(category).add({
                ...data,
                uploaderEmail: currentUserEmail,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            state[category].unshift(normalize({ ...data, uploaderEmail: currentUserEmail, id: ref.id }, category));
            renderCurrent('');
            form.reset();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = old;
        }
    });
}

function collect(formId, category) {
    if (formId === 'sellForm') {
        return {
            title: (document.getElementById('sellName')?.value || '').trim(),
            price: Number(document.getElementById('sellPrice')?.value || 0),
            description: (document.getElementById('sellDesc')?.value || '').trim(),
            imageUrl: document.getElementById('sellImgPreview')?.src || '',
            category
        };
    }
    if (formId === 'rentForm') {
        const rentType = document.getElementById('rentCategory')?.value || 'rent';
        return {
            title: (document.getElementById('rentName')?.value || '').trim(),
            price: Number(document.getElementById('rentPrice')?.value || 0),
            description: (document.getElementById('rentDesc')?.value || '').trim() || `Category: ${rentType}`,
            imageUrl: document.getElementById('rentImgPreview')?.src || '',
            category: rentType
        };
    }
    return {
        title: (document.getElementById('skillTopic')?.value || '').trim(),
        price: Number(document.getElementById('skillPrice')?.value || 0),
        description: `Instructor: ${(document.getElementById('skillName')?.value || '').trim()} | Contact: ${(document.getElementById('skillContact')?.value || '').trim()}`,
        imageUrl: document.getElementById('skillImgPreview')?.src || '',
        category
    };
}

window.handleImgUpload = function(event, previewId) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        compressImageToBase64(e.target.result, (compressed) => {
            const preview = document.getElementById(previewId);
            if (preview) {
                preview.src = compressed;
                preview.style.display = 'block';
            }
        });
    };
    reader.readAsDataURL(file);
};

function compressImageToBase64(src, callback) {
    const img = new Image();
    img.src = src;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/jpeg', 0.7)); // 70% quality
    };
}

function renderCurrent(filter) {
    const path = location.pathname.toLowerCase();
    const isHome = path === '/' || path.includes('index') || path === '';
    
    if (path.includes('sell') || isHome) renderList('sell', filter);
    if (path.includes('rent'))           renderList('rent', filter);
    if (path.includes('skills'))         renderList('skills', filter);
}

function renderList(category, filter) {
    const list = document.getElementById(listByCategory[category]);
    if (!list) return;

    const rows = state[category].filter((x) => (x.title + ' ' + x.description + ' ' + x.category).toLowerCase().includes(filter));
    if (!rows.length) {
        list.innerHTML = '<div class="empty-state">No items found.</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    rows.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-image-placeholder"><img class="card-real-img" alt="item"></div>
            <div class="item-content">
                <h4 class="item-title"></h4>
                <div class="item-price"><span>Rs. </span><span class="price-val"></span></div>
                <p class="item-desc"></p>
                <div class="action-buttons"></div>
            </div>
        `;
        card.querySelector('.card-real-img').src = item.imageUrl || fallbackImage(category, item.category);
        card.querySelector('.item-title').textContent = item.title;
        card.querySelector('.price-val').textContent = item.price;
        card.querySelector('.item-desc').textContent = item.description;

        const actions = card.querySelector('.action-buttons');

        const requireLogin = (cb) => () => {
            if (!isLoggedIn) {
                showLoginPopup();
                return;
            }
            cb();
        };

        const createActionBtn = (text, className, onClick) => {
            const b = document.createElement('button');
            b.className = className; b.textContent = text;
            b.onclick = requireLogin(onClick);
            return b;
        };

        if (category === 'sell') {
            actions.appendChild(createActionBtn('Buy Now', 'action-btn', () => proceedToCheckout(item.title, item.price, 'Buy')));
            actions.appendChild(createActionBtn('🛒 Add to Cart', 'wishlist-btn', () => addToCart(item)));
        } else if (category === 'rent') {
            actions.appendChild(createActionBtn('Rent Now', 'action-btn', () => proceedToCheckout(item.title, item.price, 'Rent')));
            actions.appendChild(createActionBtn('♡ Save', 'wishlist-btn', () => alert('Saved to wishlist!')));
        } else {
            actions.appendChild(createActionBtn('Book Class', 'action-btn', () => proceedToCheckout(item.title, item.price, 'Book')));
            actions.appendChild(createActionBtn('♡ Save', 'wishlist-btn', () => alert('Saved to wishlist!')));
        }


        if (isAdmin || (item.uploaderEmail && item.uploaderEmail === sessionStorage.getItem('rentify_user'))) {
            const edit = document.createElement('button');
            edit.className = 'action-btn';
            edit.style.background = '#4F46E5';
            edit.style.borderColor = '#4338CA';
            edit.textContent = 'Edit';
            edit.onclick = () => editItemPrompt(category, item);
            actions.appendChild(edit);

            const del = document.createElement('button');
            del.className = 'delete-btn';
            del.textContent = 'Delete';
            del.onclick = () => deleteItem(category, item.id);
            actions.appendChild(del);
        }
        frag.appendChild(card);
    });
    list.innerHTML = '';
    list.appendChild(frag);

    // Apply 3D tilt to newly rendered cards
    if (typeof VanillaTilt !== 'undefined') {
        const renderedCards = list.querySelectorAll('.item-card');
        if (renderedCards.length > 0) {
            VanillaTilt.init(renderedCards, {
                max: 8,
                speed: 400,
                glare: true,
                "max-glare": 0.15,
                scale: 1.02
            });
        }
    }
}

function fallbackImage(category, rentType) {
    if (category === 'sell') return 'https://images.unsplash.com/photo-1456735190827-d1262f71b8a3?auto=format&fit=crop&w=400&q=80';
    if (category === 'skills') return 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=400&q=80';
    if ((rentType || '').toLowerCase() === 'tools') return 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=400&q=80';
    return 'https://images.unsplash.com/photo-1555529733-0e67056058e1?auto=format&fit=crop&w=400&q=80';
}

window.deleteItem = async function (category, id) {
    const item = state[category]?.find(x => x.id === id);
    const isOwner = item && item.uploaderEmail && item.uploaderEmail === sessionStorage.getItem('rentify_user');
    if (!isAdmin && !isOwner) return alert('Admin or Owner only');
    if (!confirm('Delete this item?')) return;
    try {
        await db.collection(category).doc(id).delete();
        state[category] = state[category].filter((x) => x.id !== id);
        renderCurrent('');
        if (typeof window.renderAdminItems === 'function') window.renderAdminItems(category);
    } catch(e) {
        alert('Failed to delete: ' + e.message);
    }
};

window.editItemPrompt = async function (category, item) {
    const isOwner = item && item.uploaderEmail && item.uploaderEmail === sessionStorage.getItem('rentify_user');
    if (!isAdmin && !isOwner) return alert('Admin or Owner only');
    
    const newTitle = prompt('Edit Title:', item.title);
    if (newTitle === null) return; 
    
    const newPrice = prompt('Edit Price (₹):', item.price);
    if (newPrice === null) return;
    
    const newDesc = prompt('Edit Description:', item.description);
    if (newDesc === null) return;

    const payload = {
        title: newTitle.trim() || item.title,
        price: Number(newPrice) || item.price,
        description: newDesc.trim() || item.description
    };

    try {
        await db.collection(category).doc(item.id).update(payload);
        const target = state[category].find(x => x.id === item.id);
        if (target) Object.assign(target, payload);
        renderCurrent('');
        if (typeof window.renderAdminItems === 'function') window.renderAdminItems(category);
    } catch(e) {
        alert('Error updating item: ' + e.message);
    }
};

window.verifyAdminPortal = async function () {
    const passInput = document.getElementById('adminPasskey');
    const pass = passInput?.value || '';
    if (!pass) return alert('Enter passkey');

    const btn = document.querySelector('#adminLoginArea .primary-btn');
    const oldText = btn ? btn.innerText : 'Authenticate';
    if (btn) { btn.disabled = true; btn.innerText = 'Verifying...'; }

    try {
        let correctPass = null;
        if (window.db) {
            try {
                const doc = await db.collection('config').doc('admin').get();
                if (doc.exists && doc.data().passkey) {
                    correctPass = doc.data().passkey;
                }
            } catch (e) { console.warn("Firestore config read failed."); }
        }

        if (!correctPass) {
            alert('Admin passkey is not configured in Firestore. Please set it in config/admin document.');
            return;
        }

        if (pass === correctPass) {
            grantAdminAccess();
        } else {
            alert('Invalid passkey. Access denied.');
        }
    } catch (e) {
        alert('Authentication error: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = oldText; }
    }
};

async function grantAdminAccess() {
    isAdmin = true;
    sessionStorage.setItem('rentify_admin', 'true');
    const loginArea = document.getElementById('adminLoginArea');
    const panelArea = document.getElementById('adminPanel');
    if (loginArea) loginArea.style.display = 'none';
    if (panelArea) panelArea.style.display = 'block';
    
    await Promise.all(['sell', 'rent', 'skills'].map(load));
    if (typeof window.renderAdminItems === 'function') window.renderAdminItems('sell');
}

function renderProfile() {
    const el = document.getElementById('profileEmail');
    if (!el) return;
    const userEmail = sessionStorage.getItem('rentify_user');
    el.textContent = userEmail && userEmail !== 'Guest' ? `User (${userEmail})` : 'Guest User';
}

function uid() {
    return `rid-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
}

// ── AUTHENTICATION ENGINE ───────────────────────────────────────────────────

function bindAuthForms() {

    document.getElementById('loginForm')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const btn = e.target.querySelector('button');
        const oldText = btn.innerText; btn.innerText = 'Checking...'; btn.disabled = true;
        try {
            if (!window.auth) throw new Error("Firebase Authentication is not configured or connected.");
            
            await auth.signInWithEmailAndPassword(email, password);
            sessionStorage.setItem('rentify_user', email);
            location.href = 'index.html';
        } catch(err) {
            alert('Sign-In Failed: ' + err.message);
        } finally {
            btn.innerText = oldText; btn.disabled = false;
        }
    });

    document.getElementById('registerForm')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const name = document.getElementById('regName').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;
        const btn = e.target.querySelector('button');
        const oldText = btn.innerText; btn.innerText = 'Creating...'; btn.disabled = true;
        try {
            if (!window.auth) throw new Error("Firebase Authentication is not configured or connected.");
            
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            // Optionally store extra user details in Firestore
            if (window.db) {
                await db.collection('users').doc(userCredential.user.uid).set({
                    name: name,
                    email: email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            sessionStorage.setItem('rentify_user', email);
            alert('Account Created successfully!');
            location.href = 'index.html';
        } catch(err) {
            alert('Registration Failed: ' + err.message);
        } finally {
            btn.innerText = oldText; btn.disabled = false;
        }
    });

    document.getElementById('resetForm')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const email = document.getElementById('resetEmail').value;
        const btn = e.target.querySelector('button');
        const oldText = btn.innerText; btn.innerText = 'Sending...'; btn.disabled = true;
        try {
            if (!window.auth) throw new Error("Firebase Authentication is not connected.");
            await auth.sendPasswordResetEmail(email);
            alert('Password reset link sent to ' + email);
            if(typeof switchAuthView === 'function') switchAuthView('login');
        } catch(err) {
            alert('Error: ' + err.message);
        } finally {
            btn.innerText = oldText; btn.disabled = false;
        }
    });
}

window.switchAuthView = function (viewName) {
    const login = document.getElementById('loginView');
    const register = document.getElementById('registerView');
    const reset = document.getElementById('resetView');
    if (!login || !register || !reset) return;
    login.style.display = 'none';
    register.style.display = 'none';
    reset.style.display = 'none';
    if (viewName === 'register') register.style.display = 'block';
    else if (viewName === 'reset') reset.style.display = 'block';
    else login.style.display = 'block';
};

window.logoutUser = function () {
    sessionStorage.removeItem('rentify_user');
    sessionStorage.removeItem('rentify_admin');
    location.href = 'index.html';
};

window.proceedToCheckout = function (name, price, type) {
    location.href = `checkout.html?item=${encodeURIComponent(name)}&price=${encodeURIComponent(price)}&type=${encodeURIComponent(type)}`;
};

function setupCheckoutPage() {
    const params = new URLSearchParams(location.search);
    const item = params.get('item') || 'Item';
    const basePrice = parseFloat(params.get('price') || '0');
    const type = params.get('type') || 'Buy';
    const total = basePrice; // Platform fee removed as per request

    const panel = document.getElementById('checkoutSummaryPanel');
    if (panel) {
        panel.innerHTML = `
            <div class="summary-row"><span>${escapeHtml(item)}</span><span>₹${basePrice.toFixed(2)}</span></div>
            <div class="summary-row" style="color:#6B7280;font-size:0.9rem;"><span>Type</span><span>${escapeHtml(type)}</span></div>
            <div class="summary-row" style="color:#16A34A;font-size:0.85rem;margin-top:4px;"><span>✓ Secure Campus Transaction</span></div>
        `;
    }
    const totalEl = document.getElementById('checkoutTotalAmount');
    if (totalEl) totalEl.textContent = `₹${total.toFixed(2)}`;

    // Store final total for order saving
    window._checkoutFinalTotal = total;
}

window.completePayment = function () {
    const params = new URLSearchParams(location.search);
    const finalTotal = window._checkoutFinalTotal || parseFloat(params.get('price') || '0');
    const otp = Math.floor(100000 + Math.random() * 900000);
    const orderId = `ORD-${Date.now()}`;
    const placedAt = Date.now(); // For 30-min cancel window
    
    const order = {
        id: orderId,
        name: params.get('item') || 'Item',
        price: finalTotal.toFixed(2),
        type: params.get('type') || 'Buy',
        date: new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }),
        placedAt: placedAt,
        otp: otp
    };
    
    const userEmail = sessionStorage.getItem('rentify_user') || 'guest';
    const key = `rentify_orders_${userEmail}`;
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    data.unshift(order);
    localStorage.setItem(key, JSON.stringify(data));
    
    showOrderSuccessPopup(orderId, otp);
};

function showOrderSuccessPopup(orderId, otp) {
    let popup = document.getElementById('order-success-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'order-success-popup';
        popup.style.cssText = `
            position:fixed; inset:0; background:rgba(0,0,0,0.85);
            backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
            z-index:99999; display:flex; align-items:center; justify-content:center;
            font-family:Poppins,sans-serif; text-align:center; padding: 20px;
        `;
        document.body.appendChild(popup);
    }
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=RENTIFY-${orderId}-OTP-${otp}`;
    
    popup.innerHTML = `
        <div class="glass-panel" style="background:var(--surface); padding: 40px; border-radius: 24px; max-width: 400px; width:100%; border: 2px solid var(--green); box-shadow: 0 0 30px rgba(0,255,136,0.3); animation: slideUp 0.5s ease;">
            <div class="success-animation">
                <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                    <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none" />
                    <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                </svg>
            </div>
            <h2 style="color:var(--green); font-size:1.8rem; margin-bottom:10px;">Order Placed! 🎉</h2>
            <p style="color:var(--text-muted); margin-bottom: 24px;">Show this QR code or OTP to the seller during the exchange.</p>
            
            <div style="background: #fff; padding: 16px; border-radius: 16px; display:inline-block; margin-bottom: 24px;">
                <img src="${qrUrl}" alt="Exchange QR Code" style="display:block; width:160px; height:160px;">
            </div>
            
            <div style="font-size:0.9rem; color:var(--text-muted); margin-bottom: 8px;">Your Secure OTP</div>
            <div style="font-size:2.4rem; font-weight:800; letter-spacing:4px; margin-bottom: 30px; color:var(--text);">${otp}</div>
            
            <button class="primary-btn submit-btn full-width-btn" onclick="location.href='orders.html'">View My Orders</button>
        </div>
    `;
}

function renderOrdersPage() {
    const list = document.getElementById('myOrdersList');
    if (!list) return;
    const userEmail = sessionStorage.getItem('rentify_user') || 'guest';
    const orders = JSON.parse(localStorage.getItem(`rentify_orders_${userEmail}`) || '[]');
    if (!orders.length) {
        list.innerHTML = '<div class="empty-state">No orders yet.</div>';
        return;
    }
    const frag = document.createDocumentFragment();
    orders.forEach((order) => {
        const card = document.createElement('div');
        card.className = 'item-card order-premium-card';
        card.style.flexDirection = 'row';
        card.style.padding = '24px';

        const timePassed = Date.now() - (order.placedAt || 0);
        const canCancel = timePassed < (30 * 60 * 1000); // 30 minutes
        const minsLeft = Math.ceil(( (30 * 60 * 1000) - timePassed ) / 60000);

        card.innerHTML = `
            <div class="item-content" style="padding:0; flex:1;">
                <h4 class="item-title" style="margin-bottom:8px;"></h4>
                <div class="item-price" style="margin-bottom:12px;"></div>
                <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:8px;">
                    <span class="order-date"></span> &bull; <span class="order-id"></span>
                </div>
                <div><span class="otp-badge" title="Show this code to the seller">OTP: ${order.otp || 'N/A'}</span></div>
            </div>
            <div class="order-actions" style="display:flex; flex-direction:column; gap:10px; align-items:flex-end;">
                ${canCancel ? `
                    <button class="wishlist-btn" onclick="cancelOrder('${order.id}')" style="color:#EF4444; border-color:#EF4444; font-size:0.8rem; padding:8px 12px; width:auto;">
                        ✕ Cancel Order (${minsLeft} min left)
                    </button>
                ` : '<span style="font-size:0.75rem; color:var(--text-muted);">⏱ Cancellation window closed</span>'}
            </div>
        `;
        card.querySelector('.item-title').textContent = order.name;
        card.querySelector('.item-price').textContent = `₹${order.price} (${order.type})`;
        card.querySelector('.order-date').textContent = order.date;
        card.querySelector('.order-id').textContent = order.id;
        frag.appendChild(card);
    });
    list.innerHTML = '';
    list.appendChild(frag);
}

window.cancelOrder = function(orderId) {
    if(!confirm('Are you sure you want to cancel this order?')) return;
    const userEmail = sessionStorage.getItem('rentify_user') || 'guest';
    const key = `rentify_orders_${userEmail}`;
    let orders = JSON.parse(localStorage.getItem(key) || '[]');
    orders = orders.filter(o => o.id !== orderId);
    localStorage.setItem(key, JSON.stringify(orders));
    renderOrdersPage();
};

function escapeHtml(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showLoginPopup() {
    let popup = document.getElementById('rentify-login-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'rentify-login-popup';
        popup.style.cssText = `
            position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
            background:#0D1F0D; color:#fff; padding:16px 28px;
            border-radius:16px; border:1px solid #22C55E; box-shadow:0 8px 32px rgba(34,197,94,0.3);
            font-family:Poppins,sans-serif; font-size:0.95rem; font-weight:600;
            display:flex; align-items:center; gap:16px; z-index:9999;
            animation:slideUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards;
        `;
        popup.innerHTML = `
            <span>🔒 Please sign in to continue</span>
            <a href="login.html" style="background:#22C55E;color:#000;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:700;">Sign In</a>
        `;
        document.body.appendChild(popup);
    }
    popup.style.display = 'flex';
    clearTimeout(popup._timer);
    popup._timer = setTimeout(() => { popup.style.display = 'none'; }, 4000);
}

const CART_KEY = 'rentify_cart';
function addToCart(item) {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    const exists = cart.find(c => c.id === item.id);
    if (exists) {
        exists.qty = (exists.qty || 1) + 1;
    } else {
        cart.push({ ...item, qty: 1 });
    }
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    showCartToast(item.title);
}

function showCartToast(title) {
    let toast = document.getElementById('cart-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cart-toast';
        toast.style.cssText = `
            position:fixed; top:90px; right:24px;
            background:#22C55E; color:#000; padding:14px 22px;
            border-radius:12px; font-family:Poppins,sans-serif; font-size:0.9rem; font-weight:700;
            box-shadow:0 8px 24px rgba(34,197,94,0.4); z-index:9999;
            transform:translateX(120%); transition:transform 0.4s cubic-bezier(0.16,1,0.3,1);
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = `🛒 "${title.substring(0, 20)}" added to cart!`;
    toast.style.transform = 'translateX(0)';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.transform = 'translateX(120%)'; }, 3000);
}

/* ==========================================================
   DARK MODE & 3D ANIMATION ENGINES
   ========================================================== */

document.addEventListener('DOMContentLoaded', () => {
    initThemeEngine();
    initAnimations();
});

function initThemeEngine() {
    const toggleBtn = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');
    if (!toggleBtn) return;

    const isDark = localStorage.getItem('rentify_theme_dark') === 'true';
    if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
    updateIcon(isDark, icon);

    toggleBtn.addEventListener('click', () => {
        const currentlyDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (currentlyDark) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('rentify_theme_dark', 'false');
            updateIcon(false, icon);
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('rentify_theme_dark', 'true');
            updateIcon(true, icon);
        }
    });
}

function updateIcon(isDark, iconEl) {
    if (iconEl) iconEl.textContent = isDark ? '☀️' : '🌙';
}

function initAnimations() {
    // 1. Vanilla Tilt for 3D Cards
    if (typeof VanillaTilt !== 'undefined') {
        VanillaTilt.init(document.querySelectorAll('.item-card, .feature-card'), {
            max: 8,
            speed: 400,
            glare: true,
            "max-glare": 0.15,
            scale: 1.02
        });
    }

    // 2. GSAP Scroll Parallax
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);

        // Sections parallax entrance
        gsap.utils.toArray('.view-section').forEach(section => {
            gsap.fromTo(section, 
                { opacity: 0, y: 40 }, 
                { 
                    opacity: 1, 
                    y: 0, 
                    duration: 1, 
                    ease: "power2.out", 
                    scrollTrigger: {
                        trigger: section,
                        start: "top 85%",
                        toggleActions: "play none none reverse"
                    }
                }
            );
        });

        // Feature cards staggered entrance
        gsap.from(".feature-card", {
            scrollTrigger: {
                trigger: ".features-grid",
                start: "top 80%"
            },
            y: 50,
            opacity: 0,
            duration: 0.8,
            stagger: 0.15,
            ease: "back.out(1.2)"
        });

        bindPageTransitions();
    }
}

function bindPageTransitions() {
    const links = document.querySelectorAll('.nav-links a, .brand-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('#') && !link.hasAttribute('target')) {
                e.preventDefault();
                gsap.to('.content', {
                    opacity: 0,
                    y: -20,
                    duration: 0.3,
                    ease: "power1.inOut",
                    onComplete: () => window.location.href = href
                });
            }
        });
    });
}
