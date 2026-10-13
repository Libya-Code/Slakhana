(() => {
  'use strict';

  /* ================== أدوات ================== */
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  $$('.progress > i[data-pct]').forEach(i => (i.style.width = i.dataset.pct + '%'));

  const METHOD_LABELS = { cash: 'نقدي', transfer: 'تحويل', binance: 'بطاقة' };
  const fmtDate = d => new Date(d).toLocaleDateString('ar-LY');
  const fmtMoney = n => Number(n).toFixed(2) + ' د.ل';
  const escapeHtml = s =>
    String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let toastTimer;
  function toast(msg, ok = true) {
    const t = $('#toast');
    t.textContent = msg;
    t.style.background = ok ? '#183d2e' : '#a82f2f';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
  }

  const openModal = sel => $(sel).classList.add('show');
  const closeModals = () => $$('.modal').forEach(m => m.classList.remove('show'));

  $$('[data-close]').forEach(b => b.addEventListener('click', closeModals));
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModals(); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });

  /* ================== API ================== */
  const DebtsAPI = {
    async request(url, method = 'GET', body) {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.message || 'حدث خطأ');
      return data;
    },
    list: (params = {}) => DebtsAPI.request('/api/debts?' + new URLSearchParams(params)),
    add: payload => DebtsAPI.request('/api/debts', 'POST', payload),
    pay: (id, payload) => DebtsAPI.request(`/api/debts/${id}/pay`, 'POST', payload),
    remove: id => DebtsAPI.request(`/api/debts/${id}`, 'DELETE'),
  };
  window.DebtsAPI = DebtsAPI; // للاستخدام من الكونسول أو صفحات ثانية

  /* ================== إضافة دين ================== */
  $('#openAdd').addEventListener('click', () => {
    $('#addForm').reset();
    openModal('#addModal');
  });

  $('#addForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    try {
      await DebtsAPI.add(Object.fromEntries(new FormData(e.target)));
      toast('تمت إضافة الدين');
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      toast(err.message, false);
      btn.disabled = false;
    }
  });

  /* ================== تسديد ================== */
  let currentId = null;
  let currentRemaining = 0;
  let currentMethod = 'cash';

  $('#methodBtns').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('#methodBtns button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    currentMethod = b.dataset.method;
  });

  $('#payAll').addEventListener('click', () => {
    $('#payForm [name=amount]').value = currentRemaining;
  });

  $('#payForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amount = Number(e.target.amount.value);
    if (amount > currentRemaining) return toast('المبلغ أكبر من المتبقي', false);
    const btn = e.submitter;
    btn.disabled = true;
    try {
      await DebtsAPI.pay(currentId, { amount, method: currentMethod, note: e.target.note.value });
      toast('تم التسديد بنجاح');
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      toast(err.message, false);
      btn.disabled = false;
    }
  });

  /* ================== أزرار الجدول ================== */
  $('#tbody').addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    const tr = btn.closest('tr');

    // فتح نافذة التسديد
    if (btn.classList.contains('btn-pay')) {
      currentId = tr.dataset.id;
      currentRemaining = Number(tr.dataset.remaining);
      currentMethod = 'cash';
      $('#payForm').reset();
      $$('#methodBtns button').forEach(x => x.classList.toggle('active', x.dataset.method === 'cash'));
      $('#payName').textContent = tr.dataset.name;
      $('#payRemaining').textContent = fmtMoney(currentRemaining);
      $('#payForm [name=amount]').max = currentRemaining;
      openModal('#payModal');
    }

    // سجل التسديدات
    if (btn.classList.contains('btn-history')) {
      const list = JSON.parse(tr.dataset.payments || '[]');
      $('#historyTitle').textContent = 'سجل تسديدات: ' + tr.dataset.name;
      $('#historyList').innerHTML = list.length
        ? list
            .map(
              p => `<li>
                <span>${fmtDate(p.date)} — ${METHOD_LABELS[p.method] || ''}${p.note ? ' — ' + escapeHtml(p.note) : ''}</span>
                <strong>${fmtMoney(p.amount)}</strong>
              </li>`
            )
            .join('')
        : '<li style="justify-content:center;color:var(--muted)">لا توجد تسديدات</li>';
      openModal('#historyModal');
    }

    // حذف
    if (btn.classList.contains('btn-delete')) {
      if (!confirm('هل تريد حذف هذا الدين نهائياً؟')) return;
      try {
        await DebtsAPI.remove(tr.dataset.id);
        tr.remove();
        updateCount();
        toast('تم الحذف');
        setTimeout(() => location.reload(), 800); // لتحديث الإحصائيات
      } catch (err) {
        toast(err.message, false);
      }
    }
  });

  /* ================== بحث وفلترة ================== */
  function updateCount() {
    const visible = $$('#tbody tr[data-id]').filter(r => r.style.display !== 'none').length;
    $('#count').textContent = visible + ' دين';
  }

  function applyFilters() {
    const q = $('#search').value.trim().toLowerCase();
    const st = $('#statusFilter').value;
    $$('#tbody tr[data-id]').forEach(r => {
      const matchQ = !q || r.dataset.name.toLowerCase().includes(q) || r.dataset.phone.includes(q);
      const matchS = !st || r.dataset.status === st;
      r.style.display = matchQ && matchS ? '' : 'none';
    });
    updateCount();
  }

  $('#search').addEventListener('input', applyFilters);
  $('#statusFilter').addEventListener('change', applyFilters);
})();