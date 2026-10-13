"use strict";

const STORAGE_KEY = "slaughterhouse_categories_v1";

/* عناصر الصفحة */

const tableBody = document.getElementById("categoriesTable");

// const totalCount = document.getElementById("totalCount");
// const activeCount = document.getElementById("activeCount");
// const inactiveCount = document.getElementById("inactiveCount");
// const unitsCount = document.getElementById("unitsCount");

// const resultsCount = document.getElementById("resultsCount");
// const footerCount = document.getElementById("footerCount");

// const searchInput = document.getElementById("searchInput");
// const statusFilter = document.getElementById("statusFilter");
// const unitFilter = document.getElementById("unitFilter");

// const emptyState = document.getElementById("emptyState");

const modal = document.getElementById("categoryModal");
const modalTitle = document.getElementById("modalTitle");
const categoryForm = document.getElementById("categoryForm");

const categoryId = document.getElementById("categoryId");
const categoryName = document.getElementById("categoryName");
const categoryCode = document.getElementById("categoryCode");
const categoryUnit = document.getElementById("categoryUnit");
const categoryPrice = document.getElementById("categoryPrice");
const categoryStatus = document.getElementById("categoryStatus");
const categoryDescription = document.getElementById("categoryDescription");

const saveButton = document.getElementById("saveButton");

const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");

let toastTimer;


/* إنشاء معرف فريد */

function createId() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* تنسيق الأرقام */

function formatNumber(value) {
    return new Intl.NumberFormat("ar-LY", {
        maximumFractionDigits: 2
    }).format(value);
}

/* حماية النصوص عند عرضها */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

/* التاريخ الحالي */

function updateCurrentDate() {
    const date = new Date();

    document.getElementById("currentDate").textContent =
        new Intl.DateTimeFormat("ar-LY", {
            year: "numeric",
            month: "long",
            day: "numeric"
        }).format(date);
}

/* الإشعارات */

function showToast(message, isError = false) {
    clearTimeout(toastTimer);

    toastMessage.textContent = message;

    toast.classList.toggle("error", isError);
    toast.classList.add("show");

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

/* فتح النافذة */

function openModal(category = null) {
    categoryForm.reset();

    modalTitle.textContent = "إضافة صنف جديد";

    categoryId.value = "";

    saveButton.innerHTML = `
            <i class="fa-solid fa-floppy-disk"></i>
            حفظ الصنف
        `;


    modal.classList.add("show");

    document.body.style.overflow = "hidden";

    setTimeout(() => {
        categoryName.focus();
    }, 100);
}

/* إغلاق النافذة */

function closeModal() {
    modal.classList.remove("show");

    document.body.style.overflow = "";
}

/* إضافة صنف أو تعديل صنف */

categoryForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = categoryName.value.trim();
    const description = categoryDescription.value.trim();

    if (!name) {
        showToast("يرجى إدخال اسم الصنف.", true);
        return;
    }

    saveButton.disabled = true;

    try {
        const response = await axios.post("/api/categories", {
            name,
            description
        });

        if (response.data.success) {
            showToast(response.data.message);

            categoryForm.reset();

            // تحديث الصفحة لعرض الصنف الجديد
            window.location.reload();
        }

    } catch (error) {
        console.error(error);

        showToast(
            error.response?.data?.message || "حدث خطأ أثناء إضافة الصنف.",
            true
        );
    } finally {
        saveButton.disabled = false;
    }

    closeModal();
});

/* أزرار التعديل والتعطيل والحذف */

tableBody.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");

    if (!button) {
        return;
    }

    const { action, id, name } = button.dataset;
    /* الحذف */
    if (action === "delete") {
        const confirmed = confirm(
            `هل أنت متأكد من حذف الصنف "${name}"؟\nلا يمكن التراجع عن هذه العملية.`
        );

        if (!confirmed) {
            return;
        }
        try {
            const response = await axios.delete(`/api/category/${id}`);

            if (response.data.success) {
                showToast(response.data.message);
                setTimeout(() => location.reload(), 4000)

            }

        } catch (error) {
            console.error("Delete Category Error:", error);

            showToast(
                error.response?.data?.message ||
                "حدث خطأ أثناء حذف الصنف"
            );
        }
    }
});


/* فتح وإغلاق النافذة */

document.getElementById("openAddModal").addEventListener("click", () => {
    openModal();
});

document.getElementById("emptyAddButton").addEventListener("click", () => {
    openModal();
});

document.getElementById("closeModal").addEventListener("click", closeModal);

document.getElementById("cancelModal").addEventListener("click", closeModal);

/* إغلاق النافذة بالنقر خارجها */

modal.addEventListener("click", event => {
    if (event.target === modal) {
        closeModal();
    }
});

/* إغلاق النافذة بزر Escape */

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal.classList.contains("show")) {
        closeModal();
    }
});
