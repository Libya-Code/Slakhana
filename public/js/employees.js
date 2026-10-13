(() => {
  'use strict';

  /* ================== أدوات ================== */
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];

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
  const EmployeesAPI = {
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
    list: (params = {}) => EmployeesAPI.request('/api/employees?' + new URLSearchParams(params)),
    add: payload => EmployeesAPI.request('/api/employees', 'POST', payload),
    update: (id, payload) => EmployeesAPI.request(`/api/employees/${id}`, 'PUT', payload),
    setStatus: (id, status) => EmployeesAPI.request(`/api/employees/${id}/status`, 'PATCH', { status }),
    remove: id => EmployeesAPI.request(`/api/employees/${id}`, 'DELETE'),
  };
  window.EmployeesAPI = EmployeesAPI;

  /* ================== إضافة / تعديل ================== */
  let editingId = null;

  $('#openAdd').addEventListener('click', () => {
    editingId = null;
    $('#empForm').reset();
    $('#empModalTitle').textContent = 'إضافة موظف جديد';
    $('#empForm [name=hireDate]').value = new Date().toISOString().slice(0, 10);
    openModal('#empModal');
  });

  $('#empForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    const payload = Object.fromEntries(new FormData(e.target));
    try {
      if (editingId) await EmployeesAPI.update(editingId, payload);
      else await EmployeesAPI.add(payload);
      toast(editingId ? 'تم تعديل بيانات الموظف' : 'تمت إضافة الموظف');
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

    // تعديل
    if (btn.classList.contains('btn-edit')) {
      const emp = JSON.parse(tr.dataset.emp);
      editingId = tr.dataset.id;
      const f = $('#empForm');
      f.name.value = emp.name || '';
      f.phone.value = emp.phone || '';
      f.position.value = emp.position || '';
      f.salary.value = emp.salary || 0;
      f.hireDate.value = emp.hireDate ? String(emp.hireDate).slice(0, 10) : '';
      f.note.value = emp.note || '';
      $('#empModalTitle').textContent = 'تعديل بيانات الموظف';
      openModal('#empModal');
    }

    // تفعيل / إيقاف
    if (btn.classList.contains('btn-toggle')) {
      const next = tr.dataset.status === 'active' ? 'inactive' : 'active';
      try {
        await EmployeesAPI.setStatus(tr.dataset.id, next);
        toast(next === 'active' ? 'تم تفعيل الموظف' : 'تم إيقاف الموظف');
        setTimeout(() => location.reload(), 600);
      } catch (err) {
        toast(err.message, false);
      }
    }

    // حذف
    if (btn.classList.contains('btn-delete')) {
      if (!confirm('هل تريد حذف هذا الموظف نهائياً؟')) return;
      try {
        await EmployeesAPI.remove(tr.dataset.id);
        toast('تم الحذف');
        setTimeout(() => location.reload(), 600);
      } catch (err) {
        toast(err.message, false);
      }
    }
  });

  /* ================== بحث وفلترة ================== */
  function updateCount() {
    const visible = $$('#tbody tr[data-id]').filter(r => r.style.display !== 'none').length;
    $('#count').textContent = visible + ' موظف';
  }

  function applyFilters() {
    const q = $('#search').value.trim().toLowerCase();
    const st = $('#statusFilter').value;
    $$('#tbody tr[data-id]').forEach(r => {
      const hay = (r.dataset.name + ' ' + r.dataset.phone + ' ' + r.dataset.position).toLowerCase();
      const matchQ = !q || hay.includes(q);
      const matchS = !st || r.dataset.status === st;
      r.style.display = matchQ && matchS ? '' : 'none';
    });
    updateCount();
  }

  $('#search').addEventListener('input', applyFilters);
  $('#statusFilter').addEventListener('change', applyFilters);
})();