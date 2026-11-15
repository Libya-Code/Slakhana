const $ = (selector) => document.querySelector(selector);

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => toast.classList.remove("show"), 3000);
}

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

// طباعة فاتورة لعملية واحدة من بيانات صف الجدول
function printReceipt(row) {
  if (!row) return;
  const [uuid, employee, name, qye, price, payment, time, date, type] =
    [...row.children].map((td) => td.textContent.trim());

  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) return showToast("اسمح بالنوافذ المنبثقة لطباعة الفاتورة");

  const line = (label, value) =>
    `<div class="row"><span>${label}</span><strong>${escapeHTML(value)}</strong></div>`;

  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>فاتورة ${escapeHTML(uuid)}</title>
<style>
  body{font-family:Tahoma,Arial,sans-serif;margin:0;padding:18px;color:#202a25}
  h2{text-align:center;margin:0 0 4px}
  .sub{text-align:center;color:#84918a;font-size:12px;margin-bottom:14px}
  .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px dashed #ccd5cf;font-size:14px}
  .total{margin-top:12px;font-size:17px}
  .foot{text-align:center;margin-top:18px;font-size:12px;color:#84918a}
</style></head><body>
<h2>ملحمتي</h2>
<div class="sub">${escapeHTML(type)} — فاتورة رقم ${escapeHTML(uuid)}</div>
${line("التاريخ", date)}
${line("الوقت", time)}
${line("الموظف", employee)}
${line("الصنف", name)}
${line("العدد", qye)}
${line("طريقة الدفع", payment)}
<div class="row total"><span>الإجمالي</span><strong>${escapeHTML(price)} د.ل</strong></div>
<div class="foot">شكرًا لتعاملكم معنا</div>
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

const submit = document.querySelector('[type=submit]')

submit.addEventListener("click", (e) => {
  const Date1 = document.getElementById("Date1").value
  const Date2 = document.getElementById("Date2").value

  if (new Date(Date2) < new Date(Date1) || Date1 == "" || Date2 == "") return showToast("يجب ان يكون تاريخ اكبر من تاريخ تاني")

  window.location.href = `?sales=1&startDate=${Date1}&endDate=${Date2}`

})

document.getElementById("salesTable").addEventListener("click", async (e) => {
  const printBtn = e.target.closest(".btn-print");
  const deleteBtn = e.target.closest(".btn-delete");

  if (printBtn) {
    printReceipt(printBtn.closest("tr"));
  }

  if (deleteBtn) {
    const uuid = deleteBtn.dataset.uuid;

    if (confirm("هل أنت متأكد من حذف عملية البيع؟")) {
      try {
        const response = await axios.delete("/api/delete", {
          data: {
            uuid,
            type: "sale"
          },
          headers: {
            "Content-Type": "application/json"
          }
        });
        const message = response.data.message
        showToast(message)
        setTimeout(() => window.location.reload(), 1200)
      } catch (error) {
        showToast(error.response?.data?.message || error.message)
      }
    }
  }
});