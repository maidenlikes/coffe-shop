import { state, qs, icon, saveCart, cartTotal, refreshCartFromServer, toast, api } from './core.js';
import { home, menu, cartPage, checkout, orderPage, tableDialog, productDialog, loginPage, adminPage } from './views.js';
let modalReturnSelector = null;
function go(path) {
  history.pushState({}, '', path);
  state.path = location.pathname;
  state.modal = null;
  window.scrollTo(0, 0);
  render();
}
window.addEventListener('popstate', () => {
  state.path = location.pathname;
  state.modal = null;
  render();
});
function render() {
  const p = state.path,
    app = qs('#app');
  if (p.startsWith('/admin/')) {
    state.adminTab = p.split('/')[2] || 'orders';
    app.innerHTML = state.login || state.adminTab === 'login' ? loginPage() : adminPage();
  } else if (p === '/menu') app.innerHTML = menu();else if (p === '/cart') app.innerHTML = cartPage();else if (p === '/checkout') app.innerHTML = checkout();else if (p.startsWith('/orders/')) app.innerHTML = orderPage();else app.innerHTML = home();
  if (state.modal) app.insertAdjacentHTML('beforeend', state.modal === 'table' ? tableDialog() : productDialog(state.menu.find(p => p.id === state.modal)));
  document.body.classList.toggle('modal-open', !!state.modal);
  syncHeroHeight();
}
function syncHeroHeight() {
  const hero = qs('.hero-full .hero-grid');
  if (!hero) return;
  const top = qs('.hero-full').getBoundingClientRect().top + window.scrollY;
  hero.style.minHeight = `calc(100svh - ${Math.round(top)}px)`;
}
window.addEventListener('resize', syncHeroHeight);
async function loadAdmin() {
  try {
    const me = await api('/admin/me');
    state.role = me.role;
    state.login = false;
    if (state.role === 'staff') {
      state.adminOrders = await api('/admin/orders');
      if (state.path !== '/admin/orders') {
        history.replaceState({}, '', '/admin/orders');
        state.path = '/admin/orders';
        state.adminTab = 'orders';
      }
    } else {
      const salesQuery = new URLSearchParams({
        period: state.salesPeriod
      });
      if (state.salesPeriod === 'custom') {
        salesQuery.set('from', state.salesFrom);
        salesQuery.set('to', state.salesTo);
      }
      [state.adminOrders, state.adminProducts, state.adminTables, state.sales, state.adminSettings, state.audit, state.paymentReview] = await Promise.all([api('/admin/orders'), api('/admin/products'), api('/admin/tables'), api('/admin/sales?' + salesQuery), api('/admin/settings'), api('/admin/audit'), api('/admin/payment-review')]);
    }
    if (state.path === '/admin/login') {
      history.replaceState({}, '', '/admin/orders');
      state.path = '/admin/orders';
    }
  } catch (e) {
    if (e.status === 401) {
      state.login = true;
      state.role = null;
      if (state.path !== '/admin/login') {
        history.replaceState({}, '', '/admin/login');
        state.path = '/admin/login';
      }
    } else toast(e.message, true);
  }
  render();
}
async function refreshOrder() {
  const token = state.path.split('/')[2];
  if (!token) return;
  try {
    state.order = await api('/orders/' + encodeURIComponent(token));
    render();
  } catch (e) {
    toast(e.message, true);
  }
}
async function init() {
  try {
    [state.menu, state.tables, state.config] = await Promise.all([api('/menu'), api('/tables'), api('/config')]);
    const tableParam = new URLSearchParams(location.search).get('table');
    if (tableParam) {
      const chosen = state.tables.find(t => t.id === Number(tableParam));
      if (chosen) {
        state.tableId = chosen.id;
        localStorage.setItem('algokopi_table', chosen.id);
      } else toast('Tautan meja tidak valid. Silakan pilih meja.', true);
    }
    if (state.path.startsWith('/admin/')) await loadAdmin();else if (state.path.startsWith('/orders/')) await refreshOrder();else render();
  } catch (e) {
    qs('#app').innerHTML = '<main class="container empty-page"><h1>AlgoKopi belum dapat dimuat</h1><p>Periksa koneksi lalu coba lagi.</p><button class="button primary" onclick="location.reload()">Coba lagi</button></main>';
  }
}
document.addEventListener('click', async e => {
  const link = e.target.closest('[data-link]');
  if (link) {
    e.preventDefault();
    const path = link.getAttribute('href');
    go(path);
    if (path.startsWith('/orders/')) refreshOrder();
    if (path.startsWith('/admin/')) loadAdmin();
    return;
  }
  if (e.target.closest('#header-cart')) {
    go('/cart');
    return;
  }
  const product = e.target.closest('[data-product]');
  if (product) {
    modalReturnSelector = `[data-product="${product.dataset.product}"]`;
    state.modal = Number(product.dataset.product);
    render();
    qs('#modal-close')?.focus();
    return;
  }
  if (e.target.closest('#choose-table,#checkout-table')) {
    modalReturnSelector = e.target.closest('#checkout-table') ? '#checkout-table' : '#choose-table';
    state.modal = 'table';
    render();
    qs('#modal-close')?.focus();
    return;
  }
  const chosen = e.target.closest('[data-table]');
  if (chosen) {
    state.tableId = Number(chosen.dataset.table);
    localStorage.setItem('algokopi_table', state.tableId);
    state.modal = null;
    render();
    return;
  }
  if (e.target.id === 'modal-backdrop' || e.target.closest('#modal-close')) {
    state.modal = null;
    render();
    qs(modalReturnSelector)?.focus();
    return;
  }
  const category = e.target.closest('[data-category]');
  if (category) {
    state.category = category.dataset.category;
    render();
    return;
  }
  if (e.target.closest('#modal-plus,#modal-minus')) {
    const q = qs('#modal-qty');
    q.textContent = Math.max(1, Math.min(20, Number(q.textContent) + (e.target.closest('#modal-plus') ? 1 : -1)));
    return;
  }
  if (e.target.closest('#add-item')) {
    const p = state.menu.find(x => x.id === state.modal);
    const option_ids = [];
    for (const g of p.options) {
      const input = qs(`input[name="option-${g.name}"]:checked`);
      if (g.required && !input) {
        toast('Pilih ' + g.name + ' terlebih dahulu.', true);
        return;
      }
      if (input) option_ids.push(input.value);
    }
    const options = p.options.flatMap(g => g.choices.filter(c => option_ids.includes(c.id)).map(c => ({
      group: g.name,
      label: c.label,
      delta: c.delta
    })));
    const item = {
      product_id: p.id,
      name: p.name,
      quantity: Number(qs('#modal-qty').textContent),
      notes: qs('#product-note').value.trim(),
      option_ids,
      options,
      unit_price: p.price + options.reduce((a, x) => a + x.delta, 0)
    };
    const existing = state.cart.find(x => x.product_id === item.product_id && JSON.stringify(x.option_ids) === JSON.stringify(item.option_ids) && x.notes === item.notes);
    if (existing) existing.quantity = Math.min(20, existing.quantity + item.quantity);else state.cart.push(item);
    saveCart();
    state.modal = null;
    render();
    toast(p.name + ' ditambahkan ke keranjang.');
    return;
  }
  const qty = e.target.closest('[data-qty]');
  if (qty) {
    const [i, delta] = qty.dataset.qty.split(':').map(Number);
    state.cart[i].quantity += delta;
    if (state.cart[i].quantity <= 0) state.cart.splice(i, 1);
    saveCart();
    render();
    return;
  }
  const remove = e.target.closest('[data-remove]');
  if (remove) {
    state.cart.splice(Number(remove.dataset.remove), 1);
    saveCart();
    render();
    return;
  }
  if (e.target.closest('#place-order')) {
    if (!state.tableId) {
      state.modal = 'table';
      render();
      toast('Pilih meja terlebih dahulu.', true);
      return;
    }
    if (!state.cart.length) {
      toast('Keranjang masih kosong.', true);
      return;
    }
    if (state.busy) return;
    state.busy = true;
    const btn = qs('#place-order');
    btn.disabled = true;
    btn.textContent = 'Menyimpan pesanan...';
    try {
      const method = qs('input[name="method"]:checked').value;
      const key = localStorage.getItem('algokopi_pending_key') || crypto.randomUUID() + crypto.randomUUID();
      localStorage.setItem('algokopi_pending_key', key);
      const o = await api('/orders', 'POST', {
        table_id: state.tableId,
        items: state.cart.map(x => ({
          product_id: x.product_id,
          quantity: x.quantity,
          option_ids: x.option_ids,
          notes: x.notes
        })),
        expected_total: cartTotal(),
        method
      }, {
        'Idempotency-Key': key
      });
      localStorage.setItem('algokopi_last_order', o.token);
      localStorage.removeItem('algokopi_pending_key');
      state.cart = [];
      saveCart();
      go('/orders/' + o.token);
      state.order = o;
      render();
      if (method === 'qris') {
        try {
          state.order = await api('/orders/' + o.token + '/payments', 'POST', {});
          render();
        } catch (err) {
          toast(err.message, true);
        }
      }
    } catch (err) {
      if (['price_changed', 'product_unavailable'].includes(err.data?.code)) {
        try {
          const unavailable = await refreshCartFromServer();
          go('/cart');
          toast(unavailable ? 'Ada menu habis atau varian berubah. Periksa keranjang.' : 'Harga terbaru sudah dimuat. Periksa total sebelum checkout ulang.', true);
        } catch {
          toast(err.message, true);
        }
      } else {
        toast(err.message, true);
        btn.disabled = false;
        btn.innerHTML = 'Buat pesanan ' + icon('arrow', 18);
      }
    } finally {
      state.busy = false;
    }
    return;
  }
  if (e.target.closest('#create-qris')) {
    try {
      state.order = await api('/orders/' + state.path.split('/')[2] + '/payments', 'POST', {});
      render();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  if (e.target.closest('#switch-cashier')) {
    try {
      state.order = await api('/orders/' + state.path.split('/')[2] + '/payment-method', 'POST', {
        method: 'cashier'
      });
      render();
      toast('Metode pembayaran diubah ke kasir.');
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  if (e.target.closest('#check-payment')) {
    try {
      state.order = await api('/orders/' + state.path.split('/')[2] + '/payment-status');
      render();
      toast('Status pembayaran diperbarui.');
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  if (e.target.closest('#logout')) {
    try {
      await api('/admin/logout', 'POST', {});
    } catch {}
    state.login = true;
    go('/admin/login');
    return;
  }
  if (e.target.closest('#refresh-admin')) {
    loadAdmin();
    return;
  }
  const next = e.target.closest('[data-next]');
  if (next) {
    const o = state.adminOrders.find(x => x.id === Number(next.dataset.next));
    const target = {
      pending: 'processing',
      processing: 'ready',
      ready: 'completed'
    }[o.status];
    try {
      await api('/admin/orders/' + o.id + '/status', 'PATCH', {
        status: target,
        version: o.version
      });
      await loadAdmin();
      toast('Status pesanan diperbarui.');
    } catch (err) {
      toast(err.message, true);
      loadAdmin();
    }
    return;
  }
  const cancel = e.target.closest('[data-cancel]');
  if (cancel) {
    const reason = prompt('Alasan pembatalan untuk pelanggan:');
    if (!reason) return;
    const o = state.adminOrders.find(x => x.id === Number(cancel.dataset.cancel));
    try {
      await api('/admin/orders/' + o.id + '/status', 'PATCH', {
        status: 'cancelled',
        reason,
        version: o.version
      });
      await loadAdmin();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  const pay = e.target.closest('[data-pay]');
  if (pay) {
    if (!confirm('Konfirmasi uang sudah diterima di kasir?')) return;
    try {
      await api('/admin/orders/' + pay.dataset.pay + '/cashier-payment', 'POST', {});
      await loadAdmin();
      toast('Pembayaran dicatat.');
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  const refund = e.target.closest('[data-refund]');
  if (refund) {
    const o = state.adminOrders.find(x => x.id === Number(refund.dataset.refund));
    const reference = prompt('Referensi pengembalian manual:');
    if (!reference) return;
    try {
      await api('/admin/orders/' + o.id + '/refunds', 'POST', {
        amount: o.refund_due - o.refund_recorded,
        reference
      });
      await loadAdmin();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  const extra = e.target.closest('[data-extra-refund]');
  if (extra) {
    const reference = prompt('Referensi pengembalian kelebihan pembayaran:');
    if (!reference) return;
    try {
      await api('/admin/extra-receipts/' + extra.dataset.extraRefund + '/refund', 'POST', {
        reference
      });
      await loadAdmin();
      toast('Pengembalian tambahan dicatat.');
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  const editP = e.target.closest('[data-edit-product]');
  if (editP) {
    const p = state.adminProducts.find(x => x.id === Number(editP.dataset.editProduct));
    const price = prompt('Harga dalam rupiah untuk ' + p.name + ':', p.price);
    if (price === null) return;
    const available = confirm('Produk tersedia? Pilih Batal untuk menandai habis.');
    try {
      await api('/admin/products/' + p.id, 'PATCH', {
        price: Number(price),
        available: Number(available)
      });
      await loadAdmin();
      toast('Menu diperbarui.');
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  const editT = e.target.closest('[data-edit-table]');
  if (editT) {
    const t = state.adminTables.find(x => x.id === Number(editT.dataset.editTable));
    const label = prompt('Label meja:', t.label);
    if (label === null) return;
    const active = confirm('Meja aktif? Pilih Batal untuk menonaktifkan.');
    try {
      await api('/admin/tables/' + t.id, 'PATCH', {
        label,
        active: Number(active)
      });
      await loadAdmin();
      toast('Meja diperbarui.');
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'menu-search') {
    const pos = e.target.selectionStart;
    state.search = e.target.value;
    render();
    const input = qs('#menu-search');
    input.focus();
    input.setSelectionRange(pos, pos);
  }
});
document.addEventListener('change', async e => {
  if (e.target.id === 'admin-mode') {
    state.adminMode = e.target.value;
    render();
  }
  if (e.target.id === 'admin-status') {
    state.adminStatus = e.target.value;
    render();
  }
  if (e.target.id === 'admin-table') {
    state.adminTable = e.target.value;
    render();
  }
  if (e.target.id === 'admin-method') {
    state.adminMethod = e.target.value;
    render();
  }
  if (e.target.id === 'admin-date') {
    state.adminDate = e.target.value;
    render();
  }
  if (e.target.id === 'sales-period') {
    state.salesPeriod = e.target.value;
    loadAdmin();
  }
  if (e.target.id === 'sales-from') {
    state.salesFrom = e.target.value;
    loadAdmin();
  }
  if (e.target.id === 'sales-to') {
    state.salesTo = e.target.value;
    loadAdmin();
  }
  if (e.target.id === 'orders-open') {
    try {
      await api('/admin/settings', 'PATCH', {
        orders_open: e.target.checked
      });
      state.adminSettings = await api('/admin/settings');
      state.config.orders_open = state.adminSettings.orders_open;
      render();
      toast('Pengaturan outlet diperbarui.');
    } catch (err) {
      e.target.checked = !e.target.checked;
      toast(err.message, true);
    }
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id === 'login-form') {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api('/admin/login', 'POST', {
        username: form.get('username'),
        password: form.get('password')
      });
      go('/admin/orders');
      await loadAdmin();
    } catch (err) {
      toast(err.message, true);
    }
  }
  if (e.target.id === 'create-product-form') {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api('/admin/products', 'POST', {
        name: form.get('name'),
        category: form.get('category'),
        price: Number(form.get('price'))
      });
      await loadAdmin();
      toast('Menu ditambahkan.');
    } catch (err) {
      toast(err.message, true);
    }
  }
  if (e.target.id === 'create-table-form') {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api('/admin/tables', 'POST', {
        label: form.get('label'),
        area: form.get('area')
      });
      await loadAdmin();
      toast('Meja ditambahkan.');
    } catch (err) {
      toast(err.message, true);
    }
  }
});
document.addEventListener('keydown', e => {
  if (!state.modal) return;
  if (e.key === 'Escape') {
    state.modal = null;
    render();
    qs(modalReturnSelector)?.focus();
    return;
  }
  if (e.key === 'Tab') {
    const focusable = [...document.querySelectorAll('.modal button:not(:disabled),.modal input:not(:disabled),.modal textarea:not(:disabled)')];
    if (!focusable.length) return;
    const first = focusable[0],
      last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
setInterval(() => {
  if (state.path.startsWith('/orders/') && state.order) {
    api('/orders/' + state.path.split('/')[2]).then(o => {
      if (JSON.stringify(o) !== JSON.stringify(state.order)) {
        state.order = o;
        render();
      }
    }).catch(() => toast('Koneksi terputus. Status belum diperbarui.', true));
  }
  if (state.path === '/admin/orders' && !state.login) loadAdmin();
}, 5000);
init();
