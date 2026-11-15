function showToast(message) {
    const toast = document.querySelector(".toast");
    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => toast.classList.remove("show"), 3000);
}

const loginBtn = document.querySelector('[type="button"]');

async function login() {
    const [email, password] = [
        document.querySelector('[type="email"]').value,
        document.querySelector('[type="password"]').value
    ];
    if (!email || email.trim() === '' || !password || password.trim() == "")
        return showToast("يرجا ادخال جميع حقول")

    loginBtn.disabled = true;
    try {
        const response = await axios.post("/api/login", {
            email,
            password
        });

        showToast(response?.data?.message);
        setTimeout(() => window.location.href = response?.data?.success, 800)
    } catch (error) {
        showToast(error.response?.data?.message || error.message)
        loginBtn.disabled = false;
    }
}

loginBtn.addEventListener("click", login);

// الضغط على Enter داخل الحقول يسجّل الدخول
document.querySelectorAll(".content-login input").forEach((input) => {
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !loginBtn.disabled) login();
    });
});
