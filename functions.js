const jwt = require("jsonwebtoken")

const TOKEN_JWT = process.env.TOKEN_JWT


function text(req, res, next) {

    next()
}

async function verifyAdmin(req, res, next) {
    const token = req.cookies?.token;
    try {
        if (!token) return res.redirect("/login");
        jwt.verify(token, TOKEN_JWT)
    } catch (error) {
        return res.redirect("/login");
    }
    next()
}

function verifyUser(params) {

}

function time(startOFDey, endOFDey) {
    // لو لم يتم إرسال تاريخ، نستخدم تاريخ اليوم بتوقيت ليبيا
    const now = new Date();

    const libyaDate = startOFDey
        ? startOFDey
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: "Africa/Tripoli",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(now);

    // بداية اليوم بتوقيت ليبيا محولة إلى UTC
    const startOfDay = new Date(`${libyaDate}T00:00:00+02:00`);

    // لو تم إرسال تاريخ نهاية، نستخدمه، وإلا نضيف يومًا إلى البداية
    const startOfTomorrow = endOFDey
        ? new Date(`${endOFDey}T00:00:00+02:00`)
        : new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return {
        startOfDay,
        startOfTomorrow
    };
}

module.exports = { text, verifyUser, verifyAdmin, time }