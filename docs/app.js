import { state, qs, esc, img, money, icon } from './core.js';
import { home, menu, loginPage, adminPage } from './views.js';

const basePath = new URL('./', import.meta.url).pathname;
const adminTabs = new Set(['orders', 'menu', 'tables', 'sales', 'review', 'audit', 'settings']);
const previewMessage = 'Pratinjau statis · Harga dan foto contoh. Pesanan dan perubahan dashboard tidak disimpan.';

function pageUrl(page) {
  return page === 'home' ? basePath : `${basePath}?page=${encodeURIComponent(page)}`;
}

function currentPage() {
  const page = new URLSearchParams(location.search).get('page') || 'home';
  if (page === 'home' || page === 'menu' || page === 'admin-login') return page;
  return page.startsWith('admin-') && adminTabs.has(page.slice(6)) ? page : 'home';
}

function navigate(page) {
  history.pushState({}, '', pageUrl(page));
  render();
  window.scrollTo(0, 0);
}

function previewBanner() {
  return `<div class="preview-banner">${previewMessage}</div>`;
}

function decorateLinks() {
  for (const link of document.querySelectorAll('a[data-link]')) {
    const href = link.getAttribute('href');
    let page;
    if (href === '/') page = 'home';
    else if (href === '/menu') page = 'menu';
    else if (href?.startsWith('/admin/')) page = `admin-${href.split('/')[2]}`;
    if (!page) {
      link.remove();
      continue;
    }
    link.href = pageUrl(page);
    link.dataset.previewPage = page;
  }
  for (const link of document.querySelectorAll('a[href="/#story"]')) {
    link.href = `${pageUrl('home')}#story`;
  }
}

function decorateStorefront(page) {
  qs('.demo-banner')?.remove();
  qs('#choose-table')?.remove();
  qs('#header-cart')?.remove();
  const actions = qs('.header-actions');
  actions?.insertAdjacentHTML('beforeend', `<a class="button secondary small" href="${pageUrl('admin-login')}" data-preview-page="admin-login">Dashboard demo</a>`);
  if (page === 'menu') {
    const aside = qs('.side-cart');
    aside.innerHTML = `<div class="side-card preview-aside"><span class="eyebrow">PRATINJAU MENU</span><h3>Lihat menu dengan santai.</h3><p>Katalog ini memakai data contoh. Pemesanan dari meja tersedia saat server AlgoKopi dijalankan.</p><a class="button secondary full" href="${pageUrl('admin-login')}" data-preview-page="admin-login">Lihat dashboard demo ${icon('arrow', 17)}</a></div>`;
  }
}

function decorateAdmin(page) {
  if (page === 'admin-login') {
    qs('.login-form p').textContent = 'Akun pratinjau: admin / demoadmin. Data di halaman ini hanya contoh.';
    return;
  }
  const main = qs('.admin-main');
  main.querySelector('.admin-topline')?.insertAdjacentHTML('afterend', '<div class="admin-note">Pratinjau dashboard saja. Tombol perubahan dan data transaksi tidak aktif.</div>');
  for (const control of main.querySelectorAll('input, select, button')) control.disabled = true;
  for (const link of main.querySelectorAll('a[href^="/menu"]')) {
    link.href = pageUrl('menu');
    link.removeAttribute('target');
    link.dataset.previewPage = 'menu';
  }
}

function syncHeroHeight() {
  const hero = qs('.hero-full');
  if (!hero) return;
  const top = hero.getBoundingClientRect().top + window.scrollY;
  qs('.hero-full .hero-grid').style.minHeight = `calc(100svh - ${Math.round(top)}px)`;
}

function render() {
  const page = currentPage();
  const app = qs('#app');
  document.body.classList.remove('modal-open');
  if (page === 'menu') app.innerHTML = menu();
  else if (page === 'admin-login') app.innerHTML = loginPage();
  else if (page.startsWith('admin-')) {
    if (sessionStorage.getItem('algokopi_preview_login') !== '1') {
      history.replaceState({}, '', pageUrl('admin-login'));
      app.innerHTML = loginPage();
    } else {
      state.adminTab = page.slice(6);
      app.innerHTML = adminPage();
    }
  } else app.innerHTML = home();

  qs('.site-header')?.insertAdjacentHTML('afterend', previewBanner());
  decorateLinks();
  const shownPage = currentPage();
  if (shownPage === 'home' || shownPage === 'menu') decorateStorefront(shownPage);
  else decorateAdmin(shownPage);
  syncHeroHeight();
  if (location.hash) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
}

function openProduct(id) {
  const product = state.menu.find(item => item.id === Number(id));
  if (!product) return;
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'preview-modal';
  modal.innerHTML = `<div class="modal product-modal" role="dialog" aria-modal="true" aria-labelledby="product-title"><button class="modal-close" id="modal-close" aria-label="Tutup">${icon('close')}</button><div class="modal-product-image"><img src="${img(product.name, 900)}" alt="${esc(product.name)}"></div><div class="modal-product-content"><span class="eyebrow">${esc(product.category)}</span><h2 id="product-title">${esc(product.name)}</h2><p>${esc(product.description)}</p><strong class="modal-price">${money(product.price)}</strong><p class="preview-note">Harga dan foto adalah contoh. Pemesanan tersedia di aplikasi dengan server.</p><div class="preview-modal-actions"><button class="button primary" id="preview-close">Kembali ke menu</button></div></div></div>`;
  qs('#app').append(modal);
  document.body.classList.add('modal-open');
  qs('#modal-close').focus();
}

function closeProduct() {
  qs('#preview-modal')?.remove();
  document.body.classList.remove('modal-open');
}

document.addEventListener('click', event => {
  const pageLink = event.target.closest('[data-preview-page]');
  if (pageLink) {
    event.preventDefault();
    navigate(pageLink.dataset.previewPage);
    return;
  }
  const category = event.target.closest('[data-category]');
  if (category) {
    state.category = category.dataset.category;
    render();
    return;
  }
  const product = event.target.closest('[data-product]');
  if (product) {
    openProduct(product.dataset.product);
    return;
  }
  if (event.target.id === 'preview-modal' || event.target.closest('#modal-close, #preview-close')) {
    closeProduct();
    return;
  }
  if (event.target.closest('#logout')) {
    sessionStorage.removeItem('algokopi_preview_login');
    navigate('admin-login');
  }
});

document.addEventListener('input', event => {
  if (event.target.id !== 'menu-search') return;
  const position = event.target.selectionStart;
  state.search = event.target.value;
  render();
  const input = qs('#menu-search');
  input.focus();
  input.setSelectionRange(position, position);
});

document.addEventListener('submit', event => {
  if (event.target.id !== 'login-form') return;
  event.preventDefault();
  const form = new FormData(event.target);
  if (form.get('username') === 'admin' && form.get('password') === 'demoadmin') {
    sessionStorage.setItem('algokopi_preview_login', '1');
    navigate('admin-orders');
  } else {
    const toast = qs('#toast');
    toast.textContent = 'Akun pratinjau: admin / demoadmin.';
    toast.className = 'show error';
    setTimeout(() => toast.className = '', 4000);
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeProduct();
});
window.addEventListener('popstate', render);
window.addEventListener('resize', syncHeroHeight);

async function init() {
  try {
    const response = await fetch(new URL('./catalog.json', import.meta.url));
    if (!response.ok) throw new Error('Katalog tidak dapat dimuat.');
    state.menu = await response.json();
    state.cart = [];
    state.tableId = 0;
    state.tables = [];
    state.config = { demo: true, orders_open: true };
    state.role = 'admin';
    state.adminProducts = state.menu;
    state.adminTables = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      label: `Meja ${String(index + 1).padStart(2, '0')}`,
      area: index < 8 ? 'Indoor' : 'Teras',
      active: true
    }));
    const now = new Date().toISOString();
    state.adminOrders = [
      { id: 1, number: 'AK-DEMO-01', is_demo: true, table_id: 3, table_label: 'Meja 03', created_at: now, items: [{ quantity: 1, name: 'Cappuccino', options: [{ label: 'Panas' }], notes: '' }], total: 34000, method: 'cashier', payment_status: 'unpaid', status: 'pending', refund_due: 0, refund_recorded: 0 },
      { id: 2, number: 'AK-DEMO-02', is_demo: true, table_id: 7, table_label: 'Meja 07', created_at: now, items: [{ quantity: 1, name: 'Brownies', options: [], notes: '' }], total: 29000, method: 'cashier', payment_status: 'paid', status: 'ready', refund_due: 0, refund_recorded: 0 }
    ];
    state.sales = { gross: 0, refunds: 0, net: 0, paid_orders: 0, average: 0, open_bills: 0, refund_due: 0, qris_gross: 0, cashier_gross: 0, extra_receipts: 0, demo_orders: 2, best_sellers: [], review_events: 0 };
    state.adminSettings = { orders_open: true, real_orders: false, qris_enabled: false };
    render();
  } catch (error) {
    qs('#app').innerHTML = '<main class="container empty-page"><h1>Pratinjau belum dapat dimuat</h1><p>Periksa berkas katalog lalu muat ulang halaman.</p></main>';
  }
}

init();
