const state = {
  path: location.pathname,
  menu: [],
  tables: [],
  config: {},
  cart: JSON.parse(localStorage.getItem('algokopi_cart') || '[]'),
  tableId: Number(localStorage.getItem('algokopi_table') || 0),
  category: 'Semua',
  search: '',
  modal: null,
  adminTab: 'orders',
  adminOrders: [],
  adminProducts: [],
  adminTables: [],
  sales: null,
  adminSettings: null,
  audit: [],
  paymentReview: null,
  adminMode: 'all',
  adminStatus: 'all',
  adminDate: '',
  adminTable: 'all',
  adminMethod: 'all',
  salesPeriod: 'today',
  salesFrom: '',
  salesTo: '',
  order: null,
  busy: false,
  login: false,
  role: null
};
const qs = s => document.querySelector(s);
const money = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
const icon = (name, size = 20) => {
  const paths = {
    cup: '<path d="M5 8h12v7a6 6 0 0 1-12 0V8Z"/><path d="M17 9h2a3 3 0 0 1 0 6h-2M4 21h16M8 3v2m4-2v2m4-2v2"/>',
    bag: '<path d="M4 8h16l-1 13H5L4 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    back: '<path d="M19 12H5m6 6-6-6 6-6"/>',
    pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    close: '<path d="M5 5l14 14M19 5 5 19"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    edit: '<path d="m4 20 4-.8L20 7a2 2 0 0 0-3-3L5 16l-1 4Z"/>',
    coffee: '<path d="M3 8h14v6a7 7 0 0 1-14 0V8ZM17 9h2a3 3 0 0 1 0 6h-2M2 21h18"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.cup}</svg>`;
};
const images = {
  'Americano': 'photo-1497515114629-f71d768fd07c',
  'Espresso': 'photo-1510591509098-f4fdc6d0ff04',
  'Cold Brew': 'photo-1461023058943-07fcbe16d735',
  'Cappuccino': 'photo-1570968915860-54d5c301fa9f',
  'Macchiato': 'photo-1485808191679-5f86510681a2',
  'Flat White': 'photo-1461023058943-07fcbe16d735',
  'Matcha': 'photo-1515823064-d6e0c04616a7',
  'Nasi Goreng': 'photo-1512058564366-18510be2db19',
  'Beef Bowl': 'photo-1547592180-85f173990554',
  'Pasta': 'photo-1473093295043-cdd812d0e601',
  'Brownies': 'photo-1606313564200-e75d5e30476c',
  'Cake': 'photo-1578985545062-69928b1d9587',
  'Waffle': 'photo-1562376552-0d160a2f238d',
  'French Fries': 'photo-1573080496219-bb080dd4f877',
  'Croissant': 'photo-1555507036-ab1f4038808a'
};
const img = (name, width = 600) => `https://images.unsplash.com/${images[name] || images.Cappuccino}?w=${width}&q=80&auto=format&fit=crop`;
const saveCart = () => localStorage.setItem('algokopi_cart', JSON.stringify(state.cart));
const cartQty = () => state.cart.reduce((a, x) => a + x.quantity, 0);
const cartTotal = () => state.cart.reduce((a, x) => a + x.unit_price * x.quantity, 0);
async function refreshCartFromServer() {
  state.menu = await api('/menu');
  let unavailable = false;
  for (const item of state.cart) {
    const p = state.menu.find(x => x.id === item.product_id);
    if (!p || !p.available) {
      item.unavailable = true;
      unavailable = true;
      continue;
    }
    const choices = p.options.flatMap(g => g.choices.map(c => ({
      ...c,
      group: g.name
    })));
    const selected = item.option_ids.map(id => choices.find(c => c.id === id));
    if (selected.some(x => !x)) {
      item.unavailable = true;
      unavailable = true;
      continue;
    }
    item.unavailable = false;
    item.name = p.name;
    item.options = selected.map(x => ({
      group: x.group,
      label: x.label,
      delta: x.delta
    }));
    item.unit_price = p.price + item.options.reduce((sum, x) => sum + x.delta, 0);
  }
  saveCart();
  return unavailable;
}
const table = () => state.tables.find(t => t.id === state.tableId);
const toast = (message, error = false) => {
  const el = qs('#toast');
  el.textContent = message;
  el.className = error ? 'show error' : 'show';
  setTimeout(() => el.className = '', 4000);
};
async function api(path, method = 'GET', body = null, headers = {}) {
  const response = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: body === null ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || 'Permintaan gagal.'), {
    data,
    status: response.status
  });
  return data;
}
export { state, qs, money, esc, icon, img, saveCart, cartQty, cartTotal, refreshCartFromServer, table, toast, api };
