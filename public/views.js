import { state, money, esc, icon, img, cartQty, cartTotal, table } from './core.js';
function header(admin = false) {
  return `<header class="site-header"><div class="container header-inner">
    <a class="brand" href="/" data-link aria-label="AlgoKopi, beranda"><span class="brand-mark">${icon('coffee', 23)}</span><span>Algo<span>Kopi</span><small>COFFEE & COMFORT</small></span></a>
    ${admin === 'login' ? '' : `<nav class="header-nav" aria-label="Navigasi utama">
      ${admin ? '<a href="/admin/orders" data-link>Dashboard</a>' : '<a href="/menu" data-link>Menu</a><a href="/#story">Cerita kami</a>'}
      ${!admin && localStorage.getItem('algokopi_last_order') ? '<a href="/orders/' + esc(localStorage.getItem('algokopi_last_order')) + '" data-link>Pesanan saya</a>' : ''}
    </nav>`}
    <div class="header-actions">${!admin ? `<button class="table-pill" id="choose-table">${icon('pin', 16)}<span>${table() ? esc(table().label) : 'Pilih meja'}</span></button>
      <button class="header-cart" id="header-cart" aria-label="Keranjang, ${cartQty()} item">${icon('bag', 20)}<span class="cart-count">${cartQty()}</span></button>` : admin === 'login' ? '' : '<button class="text-button" id="logout">Keluar</button>'}</div>
  </div></header>`;
}
function demoBanner() {
  return `${state.config.demo ? '<div class="demo-banner"><div class="container">Mode demo · Harga dan foto hanya contoh, belum merupakan daftar resmi AlgoKopi.</div></div>' : ''}${state.config.orders_open === false ? '<div class="closed-banner"><div class="container">Outlet sedang tidak menerima pesanan baru. Menu tetap dapat dilihat.</div></div>' : ''}`;
}
function footer() {
  return `<footer class="footer"><div class="container footer-grid"><div><div class="footer-brand">AlgoKopi<span>.</span></div><p>Kopi hangat, waktu yang tenang.<br>Teman untuk setiap jeda.</p></div><div><strong>Jelajahi</strong><a href="/menu" data-link>Menu kami</a><a href="/cart" data-link>Keranjang</a></div><div><strong>Kunjungi</strong><p>Pesan langsung dari mejamu.<br>Alamat outlet segera tersedia.</p></div></div><div class="container footer-bottom">© ${new Date().getFullYear()} AlgoKopi. Dibuat untuk momen yang terasa dekat.</div></footer>`;
}
function home() {
  return `${header()}${demoBanner()}<main>
  <section class="hero hero-full">
   <div class="hero-background"><img src="https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=1800&q=85&auto=format&fit=crop" alt="Kopi sedang diseduh di meja kafe"></div>
   <div class="container hero-grid"><div class="hero-copy">
    <div class="eyebrow"><span class="eyebrow-line"></span> SELAMAT DATANG DI ALGOKOPI</div>
    <h1>Kopi hangat,<br><em>waktu yang tenang.</em></h1>
    <p>Temukan rasa yang pas untuk jedamu. Pilih menu favorit, pesan dari meja, dan biarkan kami mengantarkannya.</p>
    <div class="hero-actions"><a href="/menu" data-link class="button primary">Lihat Menu ${icon('arrow', 18)}</a><a href="#how" class="underlined-link">Cara memesan ${icon('arrow', 16)}</a></div>
    <div class="hero-foot"><div class="hero-foot-icon">${icon('cup', 22)}</div><span>Diracik untuk menemani<br>setiap cerita di meja.</span></div>
  </div></div></section>
  <section class="intro-strip"><div class="container intro-inner"><span>SESEDERHANA ITU</span><p>Waktu yang baik dimulai dari hal-hal kecil. <em>Secangkir kopi, suasana hangat, dan ruang untuk bernapas.</em></p></div></section>
  <section class="home-menu container"><div class="section-heading"><div><div class="eyebrow">PILIHAN UNTUKMU</div><h2>Favorit di setiap meja.</h2></div><a href="/menu" data-link class="underlined-link">Jelajahi semua menu ${icon('arrow', 17)}</a></div><div class="featured-grid">${state.menu.filter(p => ['Cappuccino', 'Nasi Goreng', 'Brownies'].includes(p.name)).map(card).join('')}</div></section>
  <section class="how-section" id="how"><div class="container how-grid"><div><div class="eyebrow">MUDAH DAN NYAMAN</div><h2>Dari meja,<br>langsung tersaji.</h2><p>Tanpa antre. Ambil waktu untuk memilih, lalu ikuti perjalanan pesananmu sampai tiba di meja.</p><a href="/menu" data-link class="button primary">Mulai pesan ${icon('arrow', 18)}</a></div><div class="steps"><div><b>01</b><span><strong>Pilih mejamu</strong><small>Pindai QR meja atau pilih nomor meja secara manual.</small></span></div><div><b>02</b><span><strong>Temukan favoritmu</strong><small>Jelajahi kopi, makanan, dan dessert yang ingin kamu nikmati.</small></span></div><div><b>03</b><span><strong>Pesan & pantau</strong><small>Pilih cara bayar, lalu lihat progres sampai pesanan diantar.</small></span></div></div></div></section>
  <section class="story container" id="story"><span class="quote-mark">“</span><blockquote>Kami percaya jeda yang sederhana bisa menjadi bagian terbaik dari hari ini.</blockquote><span class="eyebrow">— ALGOKOPI</span></section>
 </main>${footer()}`;
}
function card(p) {
  return `<article class="product-card ${p.available ? '' : 'sold-out'}"><button class="product-image" data-product="${p.id}" ${p.available ? '' : 'disabled'} aria-label="Lihat detail ${esc(p.name)}"><img loading="lazy" src="${img(p.name, 600)}" alt="${esc(p.name)}">${!p.available ? '<span class="sold-label">Habis</span>' : ''}</button><div class="product-body"><span class="product-category">${esc(p.category)}</span><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="product-bottom"><strong>${money(p.price)}</strong><button class="round-add" data-product="${p.id}" ${p.available ? '' : 'disabled'} aria-label="Pilih ${esc(p.name)}">${icon('plus', 20)}</button></div></div></article>`;
}
function menu() {
  const filtered = state.menu.filter(p => (state.category === 'Semua' || p.category === state.category) && p.name.toLowerCase().includes(state.search.toLowerCase()));
  return `${header()}${demoBanner()}<main class="menu-page container"><div class="page-intro"><div class="eyebrow">MENU ALGOKOPI</div><h1>Mau menikmati apa <em>hari ini?</em></h1><p>Dibuat dengan hangat, untuk setiap momen yang ingin kamu nikmati.</p></div>
   <div class="menu-toolbar"><div class="tabs" role="tablist" aria-label="Kategori menu">${['Semua', 'Minuman', 'Makanan', 'Dessert'].map(c => `<button class="tab ${state.category === c ? 'active' : ''}" data-category="${c}" role="tab" aria-selected="${state.category === c}">${c}</button>`).join('')}</div><label class="search-box">${icon('search', 19)}<span class="sr-only">Cari menu</span><input id="menu-search" type="search" placeholder="Cari menu favorit..." value="${esc(state.search)}"></label></div>
   <div class="menu-layout"><div><div class="menu-result"><strong>${state.category === 'Semua' ? 'Semua menu' : state.category}</strong><span>${filtered.length} pilihan</span></div><div class="products-grid">${filtered.length ? filtered.map(card).join('') : '<p class="empty">Menu tidak ditemukan. Coba kata kunci lain.</p>'}</div></div>
   <aside class="side-cart">${cartSummary()}</aside></div>
 </main>${cartQty() ? mobileCart() : ''}${footer()}`;
}
function cartSummary() {
  return `<div class="side-card"><div class="side-card-head"><h3>Pesananmu</h3><span>${cartQty()} item</span></div>${state.cart.length ? state.cart.map(x => `<div class="mini-cart-item"><img src="${img(x.name, 160)}" alt=""><div><strong>${esc(x.name)}</strong><small>${x.quantity} × ${money(x.unit_price)}</small></div><b>${money(x.quantity * x.unit_price)}</b></div>`).join('') : `<div class="empty-cart">${icon('bag', 30)}<p>Belum ada yang dipilih.<br>Yuk, temukan favoritmu.</p></div>`}<div class="side-total"><span>Subtotal</span><strong>${money(cartTotal())}</strong></div><a class="button primary full" href="/cart" data-link>Lihat keranjang ${icon('arrow', 18)}</a></div>`;
}
function mobileCart() {
  return `<div class="mobile-cart"><a href="/cart" data-link class="button primary"><span>${icon('bag', 19)} Keranjang · ${cartQty()} item</span><strong>${money(cartTotal())}</strong></a></div>`;
}
function cartPage() {
  return `${header()}${demoBanner()}<main class="container flow-page"><a href="/menu" data-link class="back-link">${icon('back', 18)} Kembali ke menu</a><div class="flow-heading"><span class="eyebrow">HAMPIR SELESAI</span><h1>Keranjangmu.</h1><p>Periksa lagi sebelum kami menyiapkannya untukmu.</p></div><div class="flow-grid"><div class="panel"><div class="panel-heading"><h2>Item pesanan</h2><span>${cartQty()} item</span></div>${state.cart.length ? state.cart.map((x, i) => `<div class="cart-row"><img src="${img(x.name, 200)}" alt=""><div class="cart-detail"><strong>${esc(x.name)} ${x.unavailable ? '<em class="unavailable-tag">Habis / varian berubah</em>' : ''}</strong><small>${x.options.map(o => esc(o.label)).join(', ') || 'Tanpa varian'}${x.notes ? ' · ' + esc(x.notes) : ''}</small><b>${money(x.unit_price * x.quantity)}</b></div><div class="cart-controls"><div class="quantity"><button data-qty="${i}:-1" aria-label="Kurangi ${esc(x.name)}">${icon('minus', 16)}</button><span>${x.quantity}</span><button data-qty="${i}:1" aria-label="Tambah ${esc(x.name)}">${icon('plus', 16)}</button></div><button class="remove-link" data-remove="${i}">Hapus</button></div></div>`).join('') : '<div class="empty-page">' + icon('bag', 38) + '<h3>Keranjang masih kosong</h3><p>Pilih sesuatu yang ingin kamu nikmati.</p><a href="/menu" data-link class="button primary">Lihat menu</a></div>'}</div><aside class="checkout-aside"><div class="panel"><h2>Ringkasan</h2><div class="summary-line"><span>Subtotal</span><strong>${money(cartTotal())}</strong></div><div class="summary-line"><span>Pajak & biaya layanan</span><strong>Rp0</strong></div><div class="summary-total"><span>Total</span><strong>${money(cartTotal())}</strong></div><a href="/checkout" data-link class="button primary full ${!state.cart.length || state.cart.some(x => x.unavailable) ? 'disabled' : ''}">Lanjut checkout ${icon('arrow', 18)}</a></div></aside></div></main>${footer()}`;
}
function checkout() {
  return `${header()}${demoBanner()}<main class="container flow-page"><a href="/cart" data-link class="back-link">${icon('back', 18)} Kembali ke keranjang</a><div class="flow-heading"><span class="eyebrow">LANGKAH TERAKHIR</span><h1>Konfirmasi pesanan.</h1><p>Pastikan meja dan pilihanmu sudah benar.</p></div><div class="flow-grid"><div class="checkout-main"><div class="panel"><div class="panel-heading"><h2>Lokasi pengantaran</h2><span class="step-tag">01</span></div><button class="table-choice" id="checkout-table">${icon('pin', 22)}<span><strong>${table() ? esc(table().area + ' · ' + table().label) : 'Pilih meja terlebih dahulu'}</strong><small>Pesanan akan diantar ke meja ini</small></span>${icon('edit', 18)}</button></div><div class="panel"><div class="panel-heading"><h2>Metode pembayaran</h2><span class="step-tag">02</span></div><label class="payment-choice"><input type="radio" name="method" value="cashier" checked><span>${icon('cup', 22)}</span><span><strong>Bayar di kasir</strong><small>Sebutkan nomor pesanan saat membayar.</small></span></label><label class="payment-choice ${state.config.qris_enabled ? '' : 'unavailable'}"><input type="radio" name="method" value="qris" ${state.config.qris_enabled ? '' : 'disabled'}><span>${icon('shield', 22)}</span><span><strong>QRIS ${state.config.qris_enabled ? '' : '· belum tersedia'}</strong><small>${state.config.qris_enabled ? 'Bayar melalui kode QR dari AutoGoPay.' : 'Menunggu konfigurasi merchant.'}</small></span></label></div></div><aside class="checkout-aside"><div class="panel"><h2>Ringkasan pesanan</h2>${state.cart.map(x => `<div class="summary-line"><span>${x.quantity} × ${esc(x.name)}</span><strong>${money(x.quantity * x.unit_price)}</strong></div>`).join('')}<div class="summary-line border-top"><span>Subtotal</span><strong>${money(cartTotal())}</strong></div><div class="summary-line"><span>Pajak & biaya layanan</span><strong>Rp0</strong></div><div class="summary-total"><span>Total</span><strong>${money(cartTotal())}</strong></div><button class="button primary full" id="place-order" ${state.cart.length && !state.cart.some(x => x.unavailable) && state.config.orders_open !== false ? '' : 'disabled'}>Buat pesanan ${icon('arrow', 18)}</button><p class="checkout-help">${state.config.orders_open === false ? 'Outlet sedang tidak menerima pesanan.' : 'Dengan membuat pesanan, kamu menyetujui item dan meja di atas.'}</p></div></aside></div></main>${footer()}`;
}
function statusText(s) {
  return {
    pending: 'Menunggu Konfirmasi',
    processing: 'Pesanan Diproses',
    ready: 'Siap Diantar',
    completed: 'Selesai',
    cancelled: 'Dibatalkan'
  }[s] || s;
}
function paymentText(s) {
  return {
    unpaid: 'Belum Dibayar',
    pending: 'Menunggu Pembayaran',
    creating_unknown: 'Perlu Ditinjau',
    expired: 'Kedaluwarsa',
    cancelled: 'Dibatalkan',
    failed: 'Gagal',
    paid: 'Lunas',
    refund_due: 'Perlu Pengembalian',
    refunded_manual: 'Pengembalian Dicatat'
  }[s] || s;
}
function orderPage() {
  const o = state.order;
  if (!o) return `${header()}<main class="container flow-page"><div class="empty-page"><h1>Memuat pesanan...</h1></div></main>`;
  const stages = ['pending', 'processing', 'ready', 'completed'],
    current = stages.indexOf(o.status);
  return `${header()}${o.is_demo ? demoBanner() : ''}<main class="container order-page"><div class="order-success"><span class="success-icon">${icon(o.status === 'cancelled' ? 'close' : 'check', 28)}</span><span class="eyebrow">PESANAN #${esc(o.number)}</span><h1>${o.status === 'cancelled' ? 'Pesanan dibatalkan.' : 'Pesanan diterima.'}</h1><p>${o.status === 'cancelled' ? esc(o.cancel_reason || 'Hubungi staf untuk bantuan.') : o.status === 'completed' ? 'Terima kasih sudah menikmati waktu bersama kami.' : 'Terima kasih. Kami akan mengantarkan pesanan ke ' + esc(o.table_label) + '.'}</p></div>
  <div class="order-grid"><div><div class="panel progress-panel"><div class="panel-heading"><h2>Progres pesanan</h2><span class="status-chip">${statusText(o.status)}</span></div>${o.status === 'cancelled' ? '<div class="notice">Pesanan ini dibatalkan. Hubungi staf jika membutuhkan bantuan.</div>' : `<div class="progress-steps">${stages.map((s, i) => `<div class="progress-step ${i <= current ? 'done' : ''}"><span class="step-dot">${i < current ? icon('check', 15) : i + 1}</span><strong>${statusText(s)}</strong></div>`).join('')}</div><p class="muted">Status diperbarui otomatis setiap 5 detik.</p>`}</div>
  <div class="panel"><div class="panel-heading"><h2>Detail pesanan</h2><span>${esc(o.table_label)}</span></div>${o.items.map(x => `<div class="order-item"><div><strong>${x.quantity} × ${esc(x.name)}</strong><small>${x.options.map(v => esc(v.label)).join(', ')}${x.notes ? ' · Catatan: ' + esc(x.notes) : ''}</small></div><strong>${money(x.unit_price * x.quantity)}</strong></div>`).join('')}<div class="summary-total"><span>Total</span><strong>${money(o.total)}</strong></div></div></div>
  <aside><div class="panel payment-panel"><span class="eyebrow">PEMBAYARAN</span><h2>${paymentText(o.payment_status)}</h2><p>${o.method === 'cashier' ? 'Bayar di kasir dengan menyebut nomor pesanan.' : 'Status pembayaran QRIS diperiksa oleh server.'}</p>${o.method === 'qris' && o.qr_url ? `<img class="qr-image" src="${esc(o.qr_url)}" alt="Kode QRIS untuk pembayaran pesanan"><p>Berlaku hingga ${esc(o.expires_at || 'waktu yang ditentukan penyedia')}</p>${o.checkout_url ? `<a class="button primary full" href="${esc(o.checkout_url)}" target="_blank" rel="noopener noreferrer">Buka halaman pembayaran</a>` : ''}<button class="button secondary full" id="check-payment">Cek status pembayaran</button>` : ''}${o.method === 'qris' && !o.qr_url && o.payment_status === 'pending' ? '<button class="button primary full" id="create-qris">Tampilkan QRIS</button>' : ''}${o.method === 'qris' && ['pending', 'expired', 'cancelled', 'failed'].includes(o.payment_status) ? '<button class="text-button" id="switch-cashier">Ganti ke bayar di kasir</button>' : ''}<div class="payment-number"><small>Nomor pesanan</small><strong>${esc(o.number)}</strong></div></div><a href="/menu" data-link class="button secondary full">Kembali ke menu</a></aside></div></main>${footer()}`;
}
function tableDialog() {
  return `<div class="modal-backdrop" id="modal-backdrop"><div class="modal table-modal" role="dialog" aria-modal="true" aria-labelledby="table-title"><button class="modal-close" id="modal-close" aria-label="Tutup">${icon('close')}</button><span class="eyebrow">LOKASI PESANAN</span><h2 id="table-title">Pilih mejamu.</h2><p>Pesanan akan kami antar ke meja yang kamu pilih.</p><div class="table-grid">${state.tables.map(t => `<button class="table-option ${state.tableId === t.id ? 'selected' : ''}" data-table="${t.id}">${icon('pin', 18)}<strong>${esc(t.label)}</strong><small>${esc(t.area)}</small></button>`).join('')}</div></div></div>`;
}
function productDialog(p) {
  return `<div class="modal-backdrop" id="modal-backdrop"><div class="modal product-modal" role="dialog" aria-modal="true" aria-labelledby="product-title"><button class="modal-close" id="modal-close" aria-label="Tutup">${icon('close')}</button><div class="modal-product-image"><img src="${img(p.name, 900)}" alt="${esc(p.name)}"></div><div class="modal-product-content"><span class="eyebrow">${esc(p.category)}</span><h2 id="product-title">${esc(p.name)}</h2><p>${esc(p.description)}</p><strong class="modal-price">${money(p.price)}</strong>${p.options.map(g => `<fieldset class="option-field"><legend>${esc(g.name)} ${g.required ? '<small>· wajib</small>' : ''}</legend><div class="option-list">${g.choices.map(c => `<label><input type="radio" name="option-${esc(g.name)}" value="${esc(c.id)}"><span>${esc(c.label)}</span><small>${c.delta ? '+' + money(c.delta) : 'Gratis'}</small></label>`).join('')}</div></fieldset>`).join('')}<label class="note-label">Catatan untuk pesanan <span>(opsional)</span><textarea id="product-note" maxlength="300" rows="2" placeholder="Contoh: tanpa es"></textarea></label><div class="modal-actions"><div class="quantity"><button id="modal-minus" aria-label="Kurangi jumlah">${icon('minus', 17)}</button><span id="modal-qty">1</span><button id="modal-plus" aria-label="Tambah jumlah">${icon('plus', 17)}</button></div><button class="button primary" id="add-item">Tambah ke keranjang ${icon('arrow', 17)}</button></div></div></div></div>`;
}
function loginPage() {
  return `${header('login')}<main class="login-page"><div class="login-visual"><span class="eyebrow">ALGOKOPI · STAFF AREA</span><h1>Di balik setiap<br>momen hangat.</h1><p>Kelola pesanan, menu, dan meja dari satu tempat.</p></div><div class="login-form-wrap"><form class="panel login-form" id="login-form"><span class="eyebrow">SELAMAT DATANG KEMBALI</span><h2>Masuk ke dashboard.</h2><p>Gunakan akun staf yang diberikan pengelola.</p><label>Nama pengguna<input name="username" autocomplete="username" required></label><label>Kata sandi<input name="password" type="password" autocomplete="current-password" required></label><button class="button primary full">Masuk ${icon('arrow', 18)}</button></form></div></main>`;
}
function adminPage() {
  const tab = state.adminTab;
  return `${header(true)}<div class="admin-shell"><aside class="admin-sidebar"><span class="eyebrow">RUANG KERJA</span>${(state.role === 'staff' ? [['orders', 'Antrean pesanan']] : [['orders', 'Antrean pesanan'], ['menu', 'Kelola menu'], ['tables', 'Meja'], ['sales', 'Penjualan'], ['review', 'Tinjau pembayaran'], ['audit', 'Riwayat perubahan'], ['settings', 'Pengaturan']]).map(([id, label]) => `<a href="/admin/${id}" data-link class="${tab === id ? 'active' : ''}">${label}</a>`).join('')}</aside><main class="admin-main"><div class="admin-topline"><div><span class="eyebrow">DASHBOARD ALGOKOPI</span><h1>${{
    orders: 'Antrean pesanan',
    menu: 'Kelola menu',
    tables: 'Meja & area',
    sales: 'Ringkasan penjualan',
    review: 'Tinjau pembayaran',
    audit: 'Riwayat perubahan',
    settings: 'Pengaturan outlet'
  }[tab]}</h1></div><span class="admin-date">${new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'full',
    timeZone: 'Asia/Jakarta'
  }).format(new Date())}</span></div>${tab === 'orders' ? adminOrders() : tab === 'menu' ? adminMenu() : tab === 'tables' ? adminTables() : tab === 'sales' ? adminSales() : tab === 'review' ? adminReview() : tab === 'audit' ? adminAudit() : adminSettings()}</main></div>`;
}
function adminOrders() {
  const orders = state.adminOrders.filter(o => (state.adminMode === 'all' || !!o.is_demo === (state.adminMode === 'demo')) && (state.adminStatus === 'all' || o.status === state.adminStatus) && (state.adminTable === 'all' || String(o.table_id) === state.adminTable) && (state.adminMethod === 'all' || o.method === state.adminMethod) && (!state.adminDate || new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(o.created_at)) === state.adminDate));
  return `<div class="admin-stats"><div><small>Total pesanan</small><strong>${state.adminOrders.length}</strong></div><div><small>Menunggu konfirmasi</small><strong>${state.adminOrders.filter(o => o.status === 'pending').length}</strong></div><div><small>Siap diantar</small><strong>${state.adminOrders.filter(o => o.status === 'ready').length}</strong></div><div><small>Tagihan terbuka</small><strong>${state.adminOrders.filter(o => o.payment_status === 'unpaid' && o.status !== 'cancelled').length}</strong></div></div><div class="admin-filterbar"><select id="admin-mode" aria-label="Mode data"><option value="all" ${state.adminMode === 'all' ? 'selected' : ''}>Semua data</option><option value="real" ${state.adminMode === 'real' ? 'selected' : ''}>Data nyata</option><option value="demo" ${state.adminMode === 'demo' ? 'selected' : ''}>Data demo</option></select><select id="admin-status" aria-label="Filter status"><option value="all">Semua status</option>${['pending', 'processing', 'ready', 'completed', 'cancelled'].map(s => `<option value="${s}" ${state.adminStatus === s ? 'selected' : ''}>${statusText(s)}</option>`).join('')}</select><select id="admin-table" aria-label="Filter meja"><option value="all">Semua meja</option>${state.adminTables.map(t => `<option value="${t.id}" ${state.adminTable === String(t.id) ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select><select id="admin-method" aria-label="Filter pembayaran"><option value="all">Semua pembayaran</option><option value="cashier" ${state.adminMethod === 'cashier' ? 'selected' : ''}>Kasir</option><option value="qris" ${state.adminMethod === 'qris' ? 'selected' : ''}>QRIS</option></select><input type="date" id="admin-date" aria-label="Filter tanggal" value="${esc(state.adminDate)}"><button class="button secondary" id="refresh-admin">Muat ulang</button></div><div class="admin-order-list">${orders.length ? orders.map(o => `<article class="admin-order"><div class="admin-order-main"><div><span class="order-number">${esc(o.number)} ${o.is_demo ? '<em>DEMO</em>' : ''}</span><h3>${esc(o.table_label)}</h3><small>${new Date(o.created_at).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short'
  })}</small></div><div class="admin-order-items">${o.items.map(x => `<p><strong>${x.quantity}× ${esc(x.name)}</strong> ${x.options.map(v => esc(v.label)).join(', ')}${x.notes ? ' · ' + esc(x.notes) : ''}</p>`).join('')}</div><div class="admin-order-meta"><strong>${money(o.total)}</strong><span>${paymentText(o.payment_status)} · ${o.method === 'cashier' ? 'Kasir' : 'QRIS'}</span><span class="status-chip">${statusText(o.status)}</span></div></div><div class="admin-order-actions">${o.status !== 'completed' && o.status !== 'cancelled' ? '<button class="button primary small" data-next="' + o.id + '" ' + (o.status === 'pending' && o.method === 'qris' && o.payment_status !== 'paid' ? 'disabled' : '') + '>' + {
    pending: 'Mulai proses',
    processing: 'Siap diantar',
    ready: 'Selesaikan'
  }[o.status] + '</button><button class="text-button danger" data-cancel="' + o.id + '">Batalkan</button>' : ''}${o.method === 'cashier' && o.payment_status === 'unpaid' && o.status !== 'cancelled' ? '<button class="button secondary small" data-pay="' + o.id + '">Tandai lunas</button>' : ''}${o.refund_due > o.refund_recorded ? '<button class="button secondary small" data-refund="' + o.id + '">Catat refund</button>' : ''}</div></article>`).join('') : '<div class="panel empty-page">Belum ada pesanan untuk filter ini.</div>'}</div>`;
}
function adminMenu() {
  return `<div class="admin-note">Harga awal adalah contoh. Ganti dengan harga resmi sebelum mengaktifkan pesanan nyata.</div><form class="admin-create" id="create-product-form"><strong>Tambah menu</strong><input name="name" aria-label="Nama menu baru" placeholder="Nama menu" required maxlength="100"><select name="category" aria-label="Kategori menu"><option>Minuman</option><option>Makanan</option><option>Dessert</option></select><input name="price" type="number" min="0" step="1" aria-label="Harga rupiah" placeholder="Harga (Rp)" required><button class="button primary small">Tambah</button></form><div class="admin-table-wrap"><table><thead><tr><th>Menu</th><th>Kategori</th><th>Harga</th><th>Ketersediaan</th><th>Aksi</th></tr></thead><tbody>${state.adminProducts.map(p => `<tr><td><div class="table-product"><img src="${img(p.name, 120)}" alt=""><strong>${esc(p.name)}</strong></div></td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${p.available ? 'Tersedia' : 'Habis'}</td><td><button class="text-button" data-edit-product="${p.id}">Ubah</button></td></tr>`).join('')}</tbody></table></div>`;
}
function adminTables() {
  return `<div class="admin-note">Meja tidak aktif tidak bisa dipakai untuk pesanan baru. Tautan per meja dapat diubah menjadi QR saat materi cetak disiapkan.</div><form class="admin-create" id="create-table-form"><strong>Tambah meja</strong><input name="label" aria-label="Label meja baru" placeholder="Contoh: Meja 13" required maxlength="80"><input name="area" aria-label="Area meja baru" placeholder="Contoh: Indoor" required maxlength="80"><button class="button primary small">Tambah</button></form><div class="admin-table-wrap"><table><thead><tr><th>Meja</th><th>Area</th><th>Status</th><th>Tautan meja</th><th>Aksi</th></tr></thead><tbody>${state.adminTables.map(t => `<tr><td><strong>${esc(t.label)}</strong></td><td>${esc(t.area)}</td><td>${t.active ? 'Aktif' : 'Nonaktif'}</td><td><a href="/menu?table=${t.id}" target="_blank" rel="noopener">Buka tautan</a></td><td><button class="text-button" data-edit-table="${t.id}">Ubah</button></td></tr>`).join('')}</tbody></table></div>`;
}
function adminSales() {
  const s = state.sales || {};
  return `<div class="admin-note">Laporan hanya menghitung pesanan nyata yang dibayar. Data demo (${s.demo_orders || 0} pesanan) dikecualikan. Nilai berdasarkan penerimaan, bukan pencairan bank.</div><div class="admin-filterbar"><select id="sales-period" aria-label="Rentang laporan"><option value="today" ${state.salesPeriod === 'today' ? 'selected' : ''}>Hari ini</option><option value="7days" ${state.salesPeriod === '7days' ? 'selected' : ''}>7 hari</option><option value="month" ${state.salesPeriod === 'month' ? 'selected' : ''}>Bulan ini</option><option value="custom" ${state.salesPeriod === 'custom' ? 'selected' : ''}>Rentang khusus</option><option value="all" ${state.salesPeriod === 'all' ? 'selected' : ''}>Semua waktu</option></select>${state.salesPeriod === 'custom' ? `<input type="date" id="sales-from" aria-label="Tanggal mulai" value="${esc(state.salesFrom)}"><input type="date" id="sales-to" aria-label="Tanggal akhir" value="${esc(state.salesTo)}">` : ''}</div><div class="sales-grid"><div><small>Penerimaan bruto</small><strong>${money(s.gross)}</strong></div><div><small>Pengembalian tercatat</small><strong>${money(s.refunds)}</strong></div><div><small>Penerimaan bersih</small><strong>${money(s.net)}</strong></div><div><small>Pesanan dibayar</small><strong>${s.paid_orders || 0}</strong></div><div><small>Rata-rata pesanan</small><strong>${money(s.average)}</strong></div><div><small>Tagihan terbuka</small><strong>${money(s.open_bills)}</strong></div><div><small>Kewajiban refund</small><strong>${money(s.refund_due)}</strong></div><div><small>QRIS</small><strong>${money(s.qris_gross)}</strong></div><div><small>Kasir</small><strong>${money(s.cashier_gross)}</strong></div><div><small>Kelebihan pembayaran untuk ditinjau</small><strong>${money(s.extra_receipts)}</strong></div></div><div class="panel sales-detail"><h2>Menu terlaris</h2>${s.best_sellers?.length ? s.best_sellers.map((x, i) => `<div><span>${i + 1}. ${esc(x.name)}</span><strong>${x.quantity} item</strong></div>`).join('') : '<p class="muted">Belum ada pesanan dibayar pada periode ini.</p>'}</div>${s.review_events ? '<div class="admin-note">Ada ' + s.review_events + ' event pembayaran yang perlu ditinjau.</div>' : ''}`;
}
function adminSettings() {
  const s = state.adminSettings || {};
  return `<div class="panel settings-panel"><h2>Penerimaan pesanan</h2><p>Matikan sementara jika outlet tidak menerima pesanan baru. Katalog tetap bisa dilihat.</p><label class="setting-toggle"><input id="orders-open" type="checkbox" ${s.orders_open ? 'checked' : ''}><span>Terima pesanan baru</span></label></div><div class="panel settings-panel"><h2>Mode transaksi</h2><p>${s.real_orders ? 'Pesanan nyata aktif.' : 'Mode demo aktif. Harga contoh belum boleh dianggap harga resmi.'}</p><p>QRIS: ${s.qris_enabled ? 'Tersedia' : 'Belum tersedia; memerlukan akun merchant dan API key server.'}</p></div>`;
}
function adminReview() {
  const r = state.paymentReview || {
    events: [],
    extra_receipts: []
  };
  return `<div class="admin-note">Pembayaran yang tidak cocok atau uang masuk kedua perlu dicocokkan dengan riwayat penyedia sebelum tindakan manual.</div><div class="panel review-panel"><h2>Kelebihan pembayaran</h2>${r.extra_receipts.length ? r.extra_receipts.map(x => `<div class="review-row"><div><strong>${esc(x.number)} ${x.is_demo ? '· DEMO' : ''}</strong><small>Transaksi ${esc(x.transaction_id)} · ${paymentText(x.review_status)}</small></div><strong>${money(x.amount)}</strong>${x.review_status === 'open' ? `<button class="button secondary small" data-extra-refund="${x.id}">Catat pengembalian</button>` : ''}</div>`).join('') : '<p class="muted">Tidak ada kelebihan pembayaran.</p>'}</div><div class="panel review-panel"><h2>Event perlu ditinjau</h2>${r.events.length ? r.events.map(x => `<div class="review-row"><div><strong>${esc(x.provider_transaction_id || 'Referensi tidak tersedia')}</strong><small>${esc(x.received_at)}</small></div><span class="status-chip">Perlu ditinjau</span></div>`).join('') : '<p class="muted">Tidak ada event yang perlu ditinjau.</p>'}</div>`;
}
function adminAudit() {
  return `<div class="panel review-panel"><h2>Perubahan terbaru</h2>${state.audit.length ? state.audit.map(x => `<div class="review-row"><div><strong>Pesanan #${x.order_id} · ${esc(x.kind)}</strong><small>${esc(x.from_value || '—')} → ${esc(x.to_value || '—')}${x.reason ? ' · ' + esc(x.reason) : ''}</small></div><small>${esc(x.actor)}<br>${new Date(x.created_at).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta'
  })}</small></div>`).join('') : '<p class="muted">Belum ada riwayat.</p>'}</div>`;
}
export { home, menu, cartPage, checkout, orderPage, tableDialog, productDialog, loginPage, adminPage };
