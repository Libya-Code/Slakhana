const jwt = require("jsonwebtoken")
const sanitizeHtml = require("sanitize-html");


const TOKEN_JWT = process.env.TOKEN_JWT


const { Sale, category, User, Employee } = require("./moongodb")



function text(req, res, next) {
    try {
        function clean(value) {
            if (typeof value === "string") {
                return sanitizeHtml(value, {
                    allowedTags: [],
                    allowedAttributes: {}
                }).trim();
            }

            if (Array.isArray(value)) {
                return value.map(clean);
            }

            if (value !== null && typeof value === "object") {
                const result = {};

                for (const [key, item] of Object.entries(value)) {
                    // كلمات المرور تُترك كما هي (لا تنظيف ولا قص) حتى لا تتغير
                result[key] = key === "password" ? item : clean(item);
                }

                return result;
            }

            return value;
        }

        if (req.body && typeof req.body === "object") {
            req.body = clean(req.body);
        }

        next();
    } catch (error) {
        next(error);
    }

}


// سجل أمني بصيغة JSON (بدون كلمات مرور أو توكنات)
function securityLog(event, details = {}, level = "INFO") {
    console.log(
        JSON.stringify({ ts: new Date().toISOString(), level, event, ...details })
    );
}

const maskEmail = (email = "") => {
    const [name = "", domain = ""] = String(email).split("@");
    return `${name.slice(0, 2)}***@${domain}`;
};

async function getUserFromToken(req) {
    const token = req.cookies?.token;
    if (!token) return null;
    const payload = jwt.verify(token, TOKEN_JWT, { algorithms: ["HS256"] });
    const user =
        (await User.findById(payload.id)) ||
        (await Employee.findById(payload.id));
    // مستخدم محذوف أو موظف موقوف لا يُسمح له بالدخول
    if (!user || user.status === "inactive") return null;
    return user;
}

// صفحات: أي مستخدم مسجّل دخوله (مدير أو موظف نشط)
async function verifyAdmin(req, res, next) {
    try {
        const user = await getUserFromToken(req);
        if (!user) return res.redirect("/login");
        req.user = user;
    } catch (error) {
        return res.redirect("/login");
    }
    next();
}

// صفحات: المدير فقط (تُستعمل بعد verifyAdmin)
function requireAdminPage(req, res, next) {
    if (req.user?.status !== "admin") return res.redirect("/skow829o9");
    next();
}

// واجهات API: للمدير فقط (تُستعمل بعد verifyUser)
function requireAdminApi(req, res, next) {
    if (req.user?.status !== "admin") {
        securityLog(
            "forbidden_admin_api",
            { user: String(req.user?._id), method: req.method, path: req.path, ip: req.ip },
            "WARN"
        );
        return res.status(403).json({
            success: false,
            ok: false,
            message: "هذه العملية للمدير فقط"
        });
    }
    next();
}

async function verifyUser(req, res, next) {
    try {
        const user = await getUserFromToken(req);
        if (!user)
            return res.status(401).json({
                success: false,
                message: "يرجا تسجيل دخولك اولا "
            });
        req.user = user;
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "يرجا تسجيل دخولك اولا "
        });
    }
    next();
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

    // تاريخ النهاية شامل: نحتسب حتى نهاية ذلك اليوم
    const DAY = 24 * 60 * 60 * 1000;
    const startOfTomorrow = endOFDey
        ? new Date(new Date(`${endOFDey}T00:00:00+02:00`).getTime() + DAY)
        : new Date(startOfDay.getTime() + DAY);

    return {
        startOfDay,
        startOfTomorrow
    };
}

module.exports = {
    text,
    verifyUser,
    verifyAdmin,
    requireAdminPage,
    requireAdminApi,
    securityLog,
    maskEmail,
    time
}