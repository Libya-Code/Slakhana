const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const express = require("express");
const app = express();
const helmet = require("helmet");
const mongoSanitize = require("@exortek/express-mongo-sanitize");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const cors = require("cors");
const path = require("path");

require("dotenv").config();

// ===== التحقق من متغيرات البيئة عند التشغيل =====
for (const key of ["MONGODB_URI", "TOKEN_JWT"]) {
  if (!process.env[key]) {
    console.error(`متغير البيئة ${key} غير موجود. أوقفت التشغيل.`);
    process.exit(1);
  }
}
if (process.env.TOKEN_JWT.length < 32) {
  console.warn("[SECURITY] TOKEN_JWT قصير (أقل من 32 حرفًا). استخدم مفتاحًا عشوائيًا أطول.");
}
const isProd = process.env.NODE_ENV === "production";
const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN || "https://grey-rail-279824.hostingersite.com";

// =================
// اتصال ب مانقو دبي
// ===============
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("You successfully connected to MongoDB! ✅");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
}
connectDB();

const { Sale, category, User, Debt, Employee } = require("./moongodb");
const {
  text,
  verifyUser,
  verifyAdmin,
  requireAdminPage,
  requireAdminApi,
  securityLog,
  maskEmail,
  time,
} = require("./functions");

// ===== دوال التحقق من المدخلات (جهة السيرفر) =====
const isStr = (v, max, min = 0) =>
  typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
const optStr = (v, max) => v == null || v === "" || isStr(v, max);
const isNum = (v, { min = 0, max = 1e9, gt = false } = {}) => {
  if (v === "" || v == null || typeof v === "boolean") return false;
  const n = Number(v);
  return Number.isFinite(n) && (gt ? n > min : n >= min) && n <= max;
};
const optDate = (v) =>
  v == null || v === "" || (typeof v === "string" && !isNaN(new Date(v).getTime()));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAYMENTS = ["نقدي", "بطاقة", "تحويل"];
const fail = (res, message, status = 400) =>
  res.status(status).json({ success: false, ok: false, message });

function validateEmployee({ name, phone, position, salary, hireDate, note, email, password }) {
  if (!isStr(name, 100, 1)) return "اسم الموظف مطلوب (حتى 100 حرف)";
  if (!optStr(phone, 30)) return "رقم الهاتف غير صحيح";
  if (!optStr(position, 60)) return "الوظيفة طويلة جدًا";
  if (!optStr(note, 500)) return "الملاحظة طويلة جدًا";
  if (salary != null && salary !== "" && !isNum(salary, { max: 1e7 })) return "الراتب غير صحيح";
  if (!optDate(hireDate)) return "تاريخ التعيين غير صحيح";
  if (email != null && email !== "" && !(isStr(email, 120) && EMAIL_RE.test(email.trim())))
    return "البريد الإلكتروني غير صحيح";
  if (
    password != null &&
    password !== "" &&
    !(typeof password === "string" && password.length >= 8 && password.length <= 72)
  )
    return "كلمة المرور يجب أن تكون بين 8 و72 حرفًا";
  return null;
}

// تجزئة وهمية: لمقارنة bcrypt حتى لو البريد غير موجود (تقليل تسريب الوقت)
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// محاولات الدخول الفاشلة (في الذاكرة) لإطلاق تنبيه عند التكرار
const failedLogins = new Map();
const FAIL_WINDOW = 15 * 60 * 1000;
const FAIL_ALERT_AT = 5;
function noteFailedLogin(req, email) {
  const key = `${req.ip}|${email}`;
  const now = Date.now();
  let entry = failedLogins.get(key);
  if (!entry || now - entry.first > FAIL_WINDOW) entry = { count: 0, first: now };
  entry.count++;
  failedLogins.set(key, entry);
  const alert = entry.count >= FAIL_ALERT_AT;
  securityLog(
    alert ? "login_bruteforce_suspected" : "login_failed",
    { ip: req.ip, email: maskEmail(email), attempts: entry.count },
    alert ? "ALERT" : "WARN",
  );
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of failedLogins) if (now - v.first > FAIL_WINDOW) failedLogins.delete(k);
}, FAIL_WINDOW).unref();

const cookieOptions = (req) => ({
  httpOnly: true,
  secure: req.secure || isProd,
  sameSite: "lax",
});

// سجل العمليات الحساسة
const audit = (req, action, target = {}) =>
  securityLog("admin_action", { actor: String(req.user?._id), action, ...target });

app.set("view engine", "ejs");
app.set("views", "./views");
app.locals.money = (n) =>
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// خلف بروكسي الاستضافة: لازم لمعرفة IP الحقيقي ولرؤية https
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

// تحويل HTTP إلى HTTPS (فعّله بـ FORCE_HTTPS=true بعد التأكد أن الاستضافة ترسل X-Forwarded-Proto)
app.use((req, res, next) => {
  if (process.env.FORCE_HTTPS === "true" && !req.secure) {
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
});

app.use(cookieParser());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" },
  }),
);
app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// حماية CSRF: أي طلب يغيّر بيانات من Origin غريب يُرفض
// (مع كوكي SameSite=Lax تصبح الحماية مزدوجة)
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin) {
    const sameOrigin = `${req.protocol}://${req.get("host")}`;
    if (origin !== sameOrigin && origin !== ALLOWED_ORIGIN) {
      securityLog("csrf_blocked", { ip: req.ip, origin, path: req.path }, "WARN");
      return res
        .status(403)
        .json({ success: false, ok: false, message: "طلب مرفوض" });
    }
  }
  next();
});

// 4. منع تكرار معاملات Query بطريقة قد تسبب التباسًا
app.use(hpp());
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "طلبات كثيرة، حاول مرة أخرى لاحقًا",
  },
});

app.use(["/api", "/login"], apiLimiter);

// حد صارم لتسجيل الدخول: لكل IP ولكل بريد (الطلبات الناجحة لا تُحسب)
const loginRateMessage = {
  success: false,
  message: "محاولات دخول كثيرة، حاول بعد 15 دقيقة",
};
const loginLimiterIp = rateLimit({
  windowMs: FAIL_WINDOW,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    securityLog("login_rate_limited", { ip: req.ip, scope: "ip" }, "ALERT");
    res.status(429).json(loginRateMessage);
  },
});
const loginLimiterEmail = rateLimit({
  windowMs: FAIL_WINDOW,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) =>
    String(req.body?.email ?? "").trim().toLowerCase().slice(0, 120) || "none",
  handler: (req, res) => {
    securityLog("login_rate_limited", { ip: req.ip, scope: "email" }, "ALERT");
    res.status(429).json(loginRateMessage);
  },
});
app.use(express.json({ limit: "20kb" }));
app.use(
  express.urlencoded({
    extended: false,
    limit: "20kb",
  }),
);

app.use(mongoSanitize());
app.use(express.static("public"));

// axios من node_modules (بدل CDN خارجي بدون تحقق)
app.get("/vendor/axios.min.js", (req, res) => {
  res.sendFile(path.join(__dirname, "node_modules/axios/dist/axios.min.js"));
});
app.use(text);

app.get("/login", (req, res) => {
  res.render("login");
});

const libyaDay = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tripoli",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

app.get("/skow829o9", verifyAdmin, async (req, res) => {
  // staetDate: الاسم القديم (فيه خطأ إملائي) محفوظ للتوافق
  const { startDate, staetDate, endDate, sales } = req.query;
  const from = startDate ?? staetDate;

  try {
    const { startOfDay, startOfTomorrow } =
      !isNaN(new Date(from).getTime()) && !isNaN(new Date(endDate).getTime())
        ? time(from, endDate)
        : time();

    const isHistory = sales == "1";
    const range = { createdAt: { $gte: startOfDay, $lt: startOfTomorrow } };

    const [total, totals, Category] = await Promise.all([
      Sale.find(range)
        .sort({ createdAt: -1 })
        .limit(isHistory ? 500 : 200)
        .lean(),
      // نفصل المبيعات عن المشتريات (status === false) حتى لا تُحسب المشتريات كمبيعات
      Sale.aggregate([
        { $match: range },
        {
          $group: {
            _id: { $ne: ["$status", false] },
            sum: { $sum: "$price" },
            count: { $sum: 1 },
          },
        },
      ]),
      category.find().lean(),
    ]);

    const pick = (isSale) =>
      totals.find((t) => t._id === isSale) || { sum: 0, count: 0 };
    const sold = pick(true);
    const bought = pick(false);
    const stats = {
      salesTotal: sold.sum,
      salesCount: sold.count,
      purchasesTotal: bought.sum,
      purchasesCount: bought.count,
      net: sold.sum - bought.sum,
    };

    const view = {
      total,
      stats,
      Category,
      user: req.user,
      rangeFrom: libyaDay(startOfDay),
      rangeTo: libyaDay(new Date(startOfTomorrow.getTime() - 1)),
    };

    return res.render(isHistory ? "sales-history" : "index", view);
  } catch (error) {
    console.error(error);
    return res.redirect("/login");
  }
});

app.get("/categories", verifyAdmin, async (req, res) => {
  try {
    const Category = await category.find().lean();

    return res.render("categories", {
      categories: Category,
    });
  } catch (error) {
    console.error("Get Categories Error:", error);
    return res.status(500).send("حدث خطأ أثناء جلب الأصناف.");
  }
});

// ================
// تسجيل الدخول
// ===============

app.post("/api/login", loginLimiterIp, loginLimiterEmail, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return fail(res, "البريد الإلكتروني وكلمة المرور مطلوبان");
    }

    const mail = email.trim().toLowerCase();
    const invalid = () => {
      noteFailedLogin(req, mail);
      return fail(res, "البريد الإلكتروني أو كلمة المرور غير صحيحة", 401);
    };
    if (mail.length > 120 || password.length > 128) return invalid();

    const user =
      (await User.findOne({ email: mail })) ||
      (await Employee.findOne({ email: mail }));

    // نقارن دائمًا (حتى لو المستخدم غير موجود) لتقليل الفرق الزمني
    const isPasswordValid = await bcrypt.compare(
      password,
      user?.password || DUMMY_HASH,
    );
    if (!user || !user.password || !isPasswordValid) return invalid();

    // نكشف حالة الإيقاف فقط بعد التأكد من صحة كلمة المرور
    if (user.status === "inactive") {
      securityLog("login_inactive_account", { ip: req.ip, user: String(user._id) }, "WARN");
      return fail(res, "هذا الحساب موقوف", 403);
    }

    const token = jwt.sign(
      { id: user._id, status: user.status },
      process.env.TOKEN_JWT,
      { expiresIn: "1d", algorithm: "HS256" },
    );
    res.cookie("token", token, {
      ...cookieOptions(req),
      maxAge: 24 * 60 * 60 * 1000,
    });

    failedLogins.delete(`${req.ip}|${mail}`);
    securityLog("login_success", { ip: req.ip, user: String(user._id) });

    return res.status(200).json({
      success: "/skow829o9",
      message: "تم تسجيل دخولك بنجاح",
    });
  } catch (error) {
    console.error("Login Error:", error.message);
    return fail(res, "حدث خطأ في السيرفر", 500);
  }
});

app.get("/logout", (req, res) => {
  res.clearCookie("token", cookieOptions(req));
  securityLog("logout", { ip: req.ip });
  res.redirect("/login");
});

app.post("/api/sales", verifyUser, async (req, res) => {
  try {
    const { name, qye, price, payment, transactionType } = req.body;
    const user = req.user;

    if (!isStr(name, 100, 1) || !PAYMENTS.includes(payment)) {
      return fail(res, "يرجى إدخال جميع البيانات بشكل صحيح");
    }
    if (!["sale", "buying"].includes(transactionType)) {
      return fail(res, "نوع المعاملة غير صالح");
    }
    if (!isNum(qye, { gt: true, max: 10000 }) || !isNum(price, { max: 1000000 })) {
      return fail(res, "البيانات الرقمية غير صحيحة");
    }

    const sale = await Sale.create({
      name: name.trim(),
      qye: Number(qye),
      price: Number(price),
      payment: payment.trim(),
      employeeName: user?.name ?? "غير معرف",
      status: transactionType === "sale",
    });

    return res.status(201).json({
      success: true,
      message: "تمت إضافة المبيعة بنجاح",
      sale,
    });
  } catch (error) {
    console.error("Add Sale Error:", error);

    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء إضافة المبيعة",
    });
  }
});

// =============================
// جزئية الحدف مبياعات / حدف دين
//===========================

app.delete("/api/delete", verifyUser, requireAdminApi, async (req, res) => {
  const { uuid, type } = req.body;

  try {
    if (typeof uuid !== "string" || !mongoose.isValidObjectId(uuid) || !type) {
      return res.status(400).json({
        success: false,
        message: "يجب تحديد المعرف ونوع الحذف",
      });
    }

    let deletedData;

    if (type === "sale") {
      // حذف عملية بيع
      deletedData = await Sale.findByIdAndDelete(uuid);
    } else if (type === "debt") {
      // حذف صاحب الدين
      deletedData = await Debt.findByIdAndDelete(uuid);
    } else {
      return res.status(400).json({
        success: false,
        message: "نوع الحذف غير صالح",
      });
    }

    if (!deletedData) {
      return res.status(404).json({
        success: false,
        message: "العنصر المطلوب غير موجود",
      });
    }

    audit(req, "delete_" + type, { id: uuid });
    return res.status(200).json({
      success: true,
      message: "تم الحذف بنجاح",
    });
  } catch (error) {
    console.error("Delete Error:", error);

    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء عملية الحذف",
    });
  }
});

// ===============
// اضافة تصنيف
// ============
app.post("/api/categories", verifyUser, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!isStr(name, 60, 1) || !optStr(description, 300)) {
      return fail(res, "اسم الصنف مطلوب (حتى 60 حرفًا) والوصف حتى 300 حرف.");
    }

    const newCategory = await category.create({
      name: name.trim(),
      description: description?.trim() || "",
    });

    return res.status(201).json({
      success: true,
      message: "تمت إضافة الصنف بنجاح.",
      category: newCategory,
    });
  } catch (error) {
    console.error("Add Category Error:", error);

    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء إضافة الصنف.",
    });
  }
});

// حدف تصنيف
app.delete("/api/category/:id", verifyUser, requireAdminApi, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "معرف الصنف غير صالح",
      });
    }

    const Category = await category.findByIdAndDelete(id);

    if (!Category) {
      return res.status(404).json({
        success: false,
        message: "الصنف غير موجود",
      });
    }

    audit(req, "delete_category", { id });
    return res.status(200).json({
      success: true,
      message: "تم حذف الصنف بنجاح",
    });
  } catch (error) {
    console.error("Delete Category Error:", error);

    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء حذف الصنف",
    });
  }
});

// =======================

const METHODS = ["cash", "transfer", "binance"];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const validId = (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ ok: false, message: "معرّف غير صحيح" });
    return false;
  }
  return true;
};
// صفحة الديون
app.get("/debts", verifyAdmin, async (req, res) => {
  try {
    const debts = await Debt.find().sort({ createdAt: -1 }).lean();
    const stats = debts.reduce(
      (s, d) => {
        s.total += d.amount;
        s.paid += d.paid;
        if (d.status !== "paid") s.open++;
        return s;
      },
      { total: 0, paid: 0, open: 0 },
    );
    stats.remaining = stats.total - stats.paid;
    res.render("debts", { debts, stats, user: req.user || { name: "المدير" } });
  } catch (e) {
    console.error(e);
    res.status(500).send("خطأ في السيرفر");
  }
});

// إضافة دين
app.post("/api/debts", verifyUser, async (req, res) => {
  try {
    const { customerName, phone, amount, dueDate, note } = req.body;
    if (!isStr(customerName, 100, 1))
      return fail(res, "اسم المدين مطلوب (حتى 100 حرف)");
    if (!optStr(phone, 30) || !optStr(note, 500) || !optDate(dueDate))
      return fail(res, "بيانات الدين غير صحيحة");
    if (!isNum(amount, { gt: true, max: 1e9 }))
      return fail(res, "المبلغ غير صحيح");
    const amt = Number(amount);

    const debt = await Debt.create({
      customerName,
      phone,
      amount: amt,
      note,
      dueDate: dueDate || null,
    });
    res.status(201).json({ ok: true, debt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "فشل إضافة الدين" });
  }
});

// تسديد (كامل أو جزئي) — ذرّي يمنع التسديد الزائد
app.post("/api/debts/:id/pay", verifyUser, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ ok: false, message: "معرّف غير صحيح" });

    const amt = Number(req.body.amount);
    if (!isNum(req.body.amount, { gt: true, max: 1e9 }) || !optStr(req.body.note, 500))
      return res
        .status(400)
        .json({ ok: false, message: "مبلغ التسديد غير صحيح" });

    const payment = {
      amount: amt,
      method: METHODS.includes(req.body.method) ? req.body.method : "cash",
      note: typeof req.body.note === "string" ? req.body.note : "",
      date: new Date(),
    };

    const debt = await Debt.findOneAndUpdate(
      { _id: id, $expr: { $lte: [{ $add: ["$paid", amt] }, "$amount"] } },
      [
        {
          $set: {
            paid: { $add: ["$paid", amt] },
            payments: { $concatArrays: ["$payments", [payment]] },
          },
        },
        {
          $set: {
            status: {
              $cond: [
                { $gte: ["$paid", "$amount"] },
                "paid",
                { $cond: [{ $gt: ["$paid", 0] }, "partial", "unpaid"] },
              ],
            },
          },
        },
      ],
      { returnDocument: "after", updatePipeline: true },
    );

    if (!debt)
      return res.status(400).json({
        ok: false,
        message: "المبلغ أكبر من المتبقي أو الدين غير موجود",
      });
    res.json({ ok: true, debt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "فشل التسديد" });
  }
});

// حذف
app.delete("/api/debts/:id", verifyUser, requireAdminApi, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ ok: false, message: "معرّف غير صحيح" });
    const d = await Debt.findByIdAndDelete(req.params.id);
    if (!d) return res.status(404).json({ ok: false, message: "غير موجود" });
    audit(req, "delete_debt", { id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "فشل الحذف" });
  }
});

// ==========================

// routes/employees.page.js

app.get("/employees", verifyAdmin, requireAdminPage, async (req, res) => {
  try {
    const employees = await Employee.find().sort({ createdAt: -1 }).lean();
    const stats = employees.reduce(
      (s, e) => {
        s.total++;
        if (e.status === "active") {
          s.active++;
          s.salaries += e.salary || 0;
        } else s.inactive++;
        return s;
      },
      { total: 0, active: 0, inactive: 0, salaries: 0 },
    );
    res.render("employees", {
      employees,
      stats,
      user: req.user || { name: "المدير" },
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("خطأ في السيرفر");
  }
});

// إضافة موظف
app.post("/api/employees", verifyUser, async (req, res) => {
  try {
    const { name, phone, position, salary, hireDate, note } = req.body;
    const user = req.user;
    if (user.status !== "admin")
      return res
        .status(400)
        .json({ ok: false, message: "انت لا تملك صلاحيات اضافة موضف" });

    const invalid = validateEmployee(req.body);
    if (invalid) return res.status(400).json({ ok: false, message: invalid });
    const sal = Number(salary || 0);

    const employee = await Employee.create({
      name,
      phone,
      position,
      note,
      salary: sal,
      hireDate: hireDate || Date.now(),
    });
    audit(req, "create_employee", { id: String(employee._id) });
    const { password: _p, ...safeNew } = employee.toObject();
    res.status(201).json({ ok: true, employee: safeNew });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "فشل إضافة الموظف" });
  }
});

// تفعيل / إيقاف
app.patch("/api/employees/:id/status", verifyUser, async (req, res) => {
  try {
    if (!validId(req, res)) return;
    const user = req.user;
    if (user.status !== "admin")
      return res
        .status(400)
        .json({ ok: false, message: "انت لا تملك صلاحيات" });
    const { status } = req.body;
    if (!["active", "inactive"].includes(status))
      return res.status(400).json({ ok: false, message: "حالة غير صحيحة" });

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: "after" },
    );
    if (!employee)
      return res.status(404).json({ ok: false, message: "غير موجود" });
    audit(req, "employee_status_" + status, { id: req.params.id });
    res.json({ ok: true, employee: { _id: employee._id, status: employee.status } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "فشل تغيير الحالة" });
  }
});

// تعديل موظف
app.put("/api/employees/:id", verifyUser, async (req, res) => {
  try {
    if (!validId(req, res)) return;

    const user = req.user;
    if (user.status !== "admin")
      return res.status(400).json({
        ok: false,
        message: "انت لا تملك صلاحيات تعديل بيانات الموضف",
      });

    const { name, phone, position, salary, hireDate, note, password, email } =
      req.body;

    const invalid = validateEmployee(req.body);
    if (invalid) return res.status(400).json({ ok: false, message: invalid });
    const sal = Number(salary || 0);

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      {
        name,
        phone,
        position,
        note,
        salary: sal,
        ...(hireDate && { hireDate }),
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!employee)
      return res.status(404).json({ ok: false, message: "غير موجود" });
    if (typeof password === "string" && password !== "") {
      employee.password = await bcrypt.hash(password, 12);
    }

    if (typeof email === "string" && email.trim() !== "") {
      // تسجيل الدخول يبحث بالبريد بحروف صغيرة، فنخزّنه بنفس الصيغة
      const mail = email.trim().toLowerCase();
      const taken =
        (await User.findOne({ email: mail })) ||
        (await Employee.findOne({ email: mail, _id: { $ne: employee._id } }));
      if (taken)
        return res.status(409).json({ ok: false, message: "هذا البريد مستخدم بالفعل" });
      employee.email = mail;
    }

    await employee.save();
    audit(req, "update_employee", { id: req.params.id, passwordChanged: Boolean(password) });

    const { password: _omit, ...safeEmployee } = employee.toObject();
    res.json({ ok: true, employee: safeEmployee });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "فشل التعديل" });
  }
});

// حذف
app.delete("/api/employees/:id", verifyUser, async (req, res) => {
  try {
    if (!validId(req, res)) return;

    const user = req.user;
    if (user.status !== "admin")
      return res
        .status(400)
        .json({ ok: false, message: "انت لا تملك صلاحيات حدف موضف" });

    const e = await Employee.findByIdAndDelete(req.params.id);
    if (!e) return res.status(404).json({ ok: false, message: "غير موجود" });
    audit(req, "delete_employee", { id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "فشل الحذف" });
  }
});

app.use((req, res) => {
  res.status(404).end();
});

// معالج أخطاء عام: لا يكشف stack trace ولا مسارات
app.use((err, req, res, next) => {
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  securityLog(
    "request_error",
    { path: req.path, status, type: err.type || err.name },
    status === 500 ? "ERROR" : "WARN",
  );
  res.status(status).json({
    success: false,
    ok: false,
    message: status === 500 ? "حدث خطأ في السيرفر" : "طلب غير صالح",
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason?.message || reason);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
