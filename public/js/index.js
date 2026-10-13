const $ = (selector) => document.querySelector(selector);

const modal = $("#saleModal");
const form = $("#saleForm");
const salesTable = $("#salesTable");


const saleField = document.querySelector(".sale-field");
const buyingField = document.querySelector(".buying-field");

const productSelect = document.querySelector("#product");
const buyingInput = document.querySelector("#buyingProduct");

const transactionButtons = document.querySelectorAll(".transaction-type button");

function updateTransaction(type) {
    const isSale = type === "sale";

    // إظهار وإخفاء الحقول
    saleField.hidden = !isSale;
    buyingField.hidden = isSale;

    // تفعيل الحقل الظاهر وتعطيل المخفي
    productSelect.disabled = !isSale;
    buyingInput.disabled = isSale;

    // تحديث الزر المحدد
    transactionButtons.forEach(button => {
        button.classList.toggle("active", button.dataset.type === type);
    });
}

// البيع هو الافتراضي
let transactionType = "sale";

updateTransaction(transactionType);

transactionButtons.forEach(button => {
    button.addEventListener("click", () => {
        transactionType = button.dataset.type;
        updateTransaction(transactionType);
    });
});

// تاريخ اليوم
$("#todayDate").textContent = new Intl.DateTimeFormat("ar-LY", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date());

// تخزين تجريبي محلي داخل المتصفح
// هذه البيانات ليست قاعدة بيانات مشتركة بين الأجهزة.
const STORAGE_KEY = "malhamti_sales_v1";

function loadSales() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

let sales = loadSales();

function saveSales() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
}

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

function money(value) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function todayKey() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function todaySales() {
  return sales.filter((sale) => sale.date === todayKey());
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => toast.classList.remove("show"), 3000);
}

function renderStats() {
  const list = todaySales();
  const total = list.reduce((sum, sale) => sum + sale.total, 0);
  const weight = list.reduce((sum, sale) => sum + sale.weight, 0);

  $("#totalSales").innerHTML = `${money(total)} <span>د.ل</span>`;
  $("#salesCount").textContent = list.length;
}


function openModal() {
  form.reset();
  modal.classList.add("show");
  document.body.style.overflow = "hidden";
  // setTimeout(() => $("#product").focus(), 50);
}

function closeModal() {
  modal.classList.remove("show");
  document.body.style.overflow = "";
}

$("#openModal").addEventListener("click", openModal);
$("#closeModal").addEventListener("click", closeModal);
$("#cancelModal").addEventListener("click", closeModal);

modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const price = Number($("#price").value);
  const qye = Number($("#weight").value);
  const name = $("#product").value
  const payment = $("#payment").value
  if (!Number.isFinite(price) || price <= 0) {
    showToast("تأكد من إدخال وزن وسعر صحيحين.");
    return;
  }

  const sale = {
    name,
    qye,
    price,
    payment,
  };

  try {
    const response = await axios.post("/api/sales", sale)
    showToast(response?.data.message);
  } catch (error) {

    showToast(error.response?.data.message || error.message);
    return;
  }

  closeModal();
  window.location.reload()
});



// document.querySelectorAll("[data-feature]").forEach((link) => {
//   link.addEventListener("click", (event) => {
//     event.preventDefault();
//     showToast(`قسم ${link.dataset.feature} غير مفعّل في هذه النسخة.`);
//   });
// });

