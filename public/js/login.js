function showToast(message) {
    const toast = document.querySelector(".toast");
    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => toast.classList.remove("show"), 3000);
}

document.querySelector('[type="button"]').addEventListener("click", async (e) => {

    const [email, password] = [
        document.querySelector('[type="email"]').value,
        document.querySelector('[type="password"]').value
    ];
    if (!email || email.trim() === '' || !password || password.trim() == "")
        return showToast("يرجا ادخال جميع حقول")

    try {
        const response = await axios.post("/api/login", {
            email,
            password
        });

        showToast(response?.data?.message);
        console.log(response?.data?.success);
        
        setTimeout(() => window.location.href = response?.data?.success , 4000)
    } catch (error) {

        showToast(error.response?.data?.message || error.message)
    }
})