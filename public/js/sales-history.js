const $ = (selector) => document.querySelector(selector);

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => toast.classList.remove("show"), 3000);
}

const submit = document.querySelector('[type=submit]')

submit.addEventListener("click", (e) => {
  const Date1 = document.getElementById("Date1").value
  const Date2 = document.getElementById("Date2").value

  if (new Date(Date2) < new Date(Date1) || Date1 == "" || Date2 == "") return showToast("يجب ان يكون تاريخ اكبر من تاريخ تاني")

  window.location.href = `?sales=1&staetDate=${Date1}&endDate=${Date2}`

})

document.getElementById("salesTable").addEventListener("click", async (e) => {
  const printBtn = e.target.closest(".btn-print");
  const deleteBtn = e.target.closest(".btn-delete");

  if (printBtn) {
    const uuid = printBtn.dataset.uuid;

    // console.log("طباعة عملية:", uuid);
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
        setTimeout(() => window.location.reload(), 5000)
      } catch (error) {
        showToast(error.response.data.message || error.message)
      }
    }
  }
});