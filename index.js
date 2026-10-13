const bcrypt = require("bcrypt");
const mongoose = require("mongoose")
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const express = require("express");
const app = express()
const helmet = require("helmet");
const mongoSanitize = require("@exortek/express-mongo-sanitize");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const cors = require("cors");

require("dotenv").config()

// =================
// اتصال ب مانقو دبي
// ===============
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("You successfully connected to MongoDB! ✅");
  }
  catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
}
connectDB()

const { Sale, category, User, Debt, Employee } = require("./moongodb")
const { text, verifyUser, verifyAdmin, time } = require("./functions");

app.set("view engine", "ejs");
app.set("views", "./views");

app.use((req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    next();
});

app.use(cookieParser());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: [
          "'self'",
          "https://cdn.jsdelivr.net"
        ]
      }
    }
  })
);
app.use(cors({
    origin: "https://grey-rail-279824.hostingersite.com",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

// 4. منع تكرار معاملات Query بطريقة قد تسبب التباسًا
app.use(hpp());
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "طلبات كثيرة، حاول مرة أخرى لاحقًا"
    }
});

app.use(["/api", "/login"], apiLimiter);
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({
    extended: false,
    limit: "20kb"
}));

app.use(mongoSanitize());
app.use(express.static("public"));
app.use(express.json())
app.use(text)


app.get("/login", (req, res) => {
  res.render("login")
})

app.get("/skow829o9", verifyAdmin, async (req, res) => {
  const { staetDate, endDate, sales } = req.query

  try {

    const { startOfDay, startOfTomorrow } = (!isNaN(new Date(staetDate).getTime()) && !isNaN(new Date(endDate).getTime())) ? time(staetDate, endDate) : time();

    const [total, totalSale, totalSaleCounter, Category] = await Promise.all([
      Sale.find({
        createdAt: {
          $gte: startOfDay,
          $lt: startOfTomorrow
        }
      })
        .limit(10)
        .sort({ createdAt: -1 }),
      Sale.countDocuments({
        createdAt: {
          $gte: startOfDay,
          $lt: startOfTomorrow
        }
      }),
      Sale.aggregate([
        {
          $match: {
            createdAt: {
              $gte: startOfDay,
              $lt: startOfTomorrow
            }
          }
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: "$price" }
          }
        }
      ]),
      category.find()
    ])

    if (sales == "1") {
      res.render("sales-history", {
        total,
        totalSale,
        totalSaleCounter,
        Category
      })
    } else {
      res.render("index", {
        total,
        totalSale,
        totalSaleCounter,
        Category
      })
    }

  } catch (error) {
    console.error(error);
    return res.redirect("/login");

  }
})



app.get("/categories", verifyAdmin, async (req, res) => {
  try {
    const Category = await category.find().lean();

    return res.render("categories", {
      categories: Category
    });
  } catch (error) {
    console.error("Get Categories Error:", error);
    return res.status(500).send("حدث خطأ أثناء جلب الأصناف.");
  }
});


// ================
// تسجيل الدخول 
// ===============

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "البريد الإلكتروني وكلمة المرور مطلوبان"
      });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() }) || await Employee.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "البريد الإلكتروني أو كلمة المرور غير صحيحة"
      });
    } // التحقق من كلمة المرور المشفرة 
    if (user.status === "inactive") {
      return res.status(401).json({
        success: false,
        message: "انت مطرود من عمل"
      });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }); 4
    }
    // إنشاء JWT 
    const token = jwt.sign(
      {
        id: user._id,
        status: user.status
      }
      , process.env.TOKEN_JWT,
      { expiresIn: "7d" });
    // تخزين التوكن في Cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    // هنا تتحقق من بيانات المستخدم في قاعدة البيانات

    return res.status(200).json({
      success: "/skow829o9",
      message: "تم تسجيل دخولك بنجاح"
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "حدث خطأ في السيرفر"
    });
  }
});

app.post("/api/sales", verifyUser, async (req, res) => {
  try {
    const { name, qye, price, payment } = req.body;
    const user = req.user

    if (
      !name?.trim() ||
      qye == null ||
      price == null ||
      !payment?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "يرجى إدخال جميع البيانات"
      });
    }

    if (

      !Number.isFinite(Number(qye)) ||
      !Number.isFinite(Number(price)) ||
      Number(qye) <= 0 ||
      Number(price) < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "البيانات الرقمية غير صحيحة"
      });
    }

    const sale = await Sale.create({
      name: name.trim(),
      qye: Number(qye),
      price: Number(price),
      payment: payment.trim(),
      employeeName: user?.name ?? "غير معرف"
    });

    return res.status(201).json({
      success: true,
      message: "تمت إضافة المبيعة بنجاح",
      sale
    });

  } catch (error) {
    console.error("Add Sale Error:", error);

    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء إضافة المبيعة"
    });
  }
});

// =============================
// جزئية الحدف مبياعات / حدف دين 
//===========================

app.delete("/api/delete", verifyUser, async (req, res) => {
  const { uuid, type } = req.body;

  try {
    if (!uuid || !type) {
      return res.status(400).json({
        success: false,
        message: "يجب تحديد المعرف ونوع الحذف"
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
        message: "نوع الحذف غير صالح"
      });
    }

    if (!deletedData) {
      return res.status(404).json({
        success: false,
        message: "العنصر المطلوب غير موجود"
      });
    }

    return res.status(200).json({
      success: true,
      message: "تم الحذف بنجاح"
    });

  } catch (error) {
    console.error("Delete Error:", error);

    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء عملية الحذف"
    });
  }
});

// ===============
// اضافة تصنيف 
// ============
app.post("/api/categories", verifyUser, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "اسم الصنف مطلوب."
      });
    }

    const newCategory = await category.create({
      name: name.trim(),
      description: description?.trim() || ""
    });

    return res.status(201).json({
      success: true,
      message: "تمت إضافة الصنف بنجاح.",
      category: newCategory
    });

  } catch (error) {
    console.error("Add Category Error:", error);

    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء إضافة الصنف."
    });
  }
});

// حدف تصنيف
app.delete("/api/category/:id", verifyUser, async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "معرف الصنف غير صالح"
            });
        }

        const Category = await category.findByIdAndDelete(id);

        if (!Category) {
            return res.status(404).json({
                success: false,
                message: "الصنف غير موجود"
            });
        }

        return res.status(200).json({
            success: true,
            message: "تم حذف الصنف بنجاح"
        });

    } catch (error) {
        console.error("Delete Category Error:", error);

        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء حذف الصنف"
        });
    }
});

// =======================

const METHODS = ['cash', 'transfer', 'binance'];
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validId = (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ ok: false, message: 'معرّف غير صحيح' });
    return false;
  }
  return true;
};
// صفحة الديون 
app.get('/debts', verifyAdmin, async (req, res) => {
  try {
    const debts = await Debt.find().sort({ createdAt: -1 }).lean();
    const stats = debts.reduce(
      (s, d) => {
        s.total += d.amount;
        s.paid += d.paid;
        if (d.status !== 'paid') s.open++;
        return s;
      },
      { total: 0, paid: 0, open: 0 }
    );
    stats.remaining = stats.total - stats.paid;
    res.render('debts', { debts, stats, user: req.user || { name: 'المدير' } });
  } catch (e) {
    console.error(e);
    res.status(500).send('خطأ في السيرفر');
  }
});

// إضافة دين
app.post('/api/debts', verifyUser, async (req, res) => {
  try {
    const { customerName, phone, amount, dueDate, note} = req.body;
    const amt = Number(amount);
    if (!customerName?.trim()) return res.status(400).json({ ok: false, message: 'اسم المدين مطلوب' });
    
    if (!amt || amt <= 0) return res.status(400).json({ ok: false, message: 'المبلغ غير صحيح' });
   
    const debt = await Debt.create({ customerName, phone, amount: amt, note, dueDate: dueDate || null });
    res.status(201).json({ ok: true, debt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: 'فشل إضافة الدين' });
  }
});

// تسديد (كامل أو جزئي) — ذرّي يمنع التسديد الزائد
app.post('/api/debts/:id/pay', verifyUser, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, message: 'معرّف غير صحيح' });

    const amt = Number(req.body.amount);
    if (!amt || amt <= 0) return res.status(400).json({ ok: false, message: 'مبلغ التسديد غير صحيح' });

    const payment = {
      amount: amt,
      method: METHODS.includes(req.body.method) ? req.body.method : 'cash',
      note: req.body.note || '',
      date: new Date(),
    };

    const debt = await Debt.findOneAndUpdate(
      { _id: id, $expr: { $lte: [{ $add: ['$paid', amt] }, '$amount'] } },
      [
        {
          $set: {
            paid: { $add: ['$paid', amt] },
            payments: { $concatArrays: ['$payments', [payment]] },
          },
        },
        {
          $set: {
            status: {
              $cond: [{ $gte: ['$paid', '$amount'] }, 'paid', { $cond: [{ $gt: ['$paid', 0] }, 'partial', 'unpaid'] }],
            },
          },
        },
      ],
      { returnDocument: 'after', updatePipeline: true }
    );

    if (!debt) return res.status(400).json({ ok: false, message: 'المبلغ أكبر من المتبقي أو الدين غير موجود' });
    res.json({ ok: true, debt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: 'فشل التسديد' });
  }
});

// حذف
app.delete('/api/debts/:id', verifyUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ ok: false, message: 'معرّف غير صحيح' });
    const d = await Debt.findByIdAndDelete(req.params.id);
    if (!d) return res.status(404).json({ ok: false, message: 'غير موجود' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: 'فشل الحذف' });
  }
});


// ==========================

// routes/employees.page.js

app.get('/employees', verifyAdmin, async (req, res) => {
  try {
    const employees = await Employee.find().sort({ createdAt: -1 }).lean();
    const stats = employees.reduce(
      (s, e) => {
        s.total++;
        if (e.status === 'active') {
          s.active++;
          s.salaries += e.salary || 0;
        } else s.inactive++;
        return s;
      },
      { total: 0, active: 0, inactive: 0, salaries: 0 }
    );
    res.render('employees', { employees, stats, user: req.user || { name: 'المدير' } });
  } catch (e) {
    console.error(e);
    res.status(500).send('خطأ في السيرفر');
  }
});

// إضافة موظف
app.post('/api/employees', verifyUser, async (req, res) => {
  try {
    const { name, phone, position, salary, hireDate, note } = req.body;
    const user = req.user
    if (user.status !== "admin") return res.status(400).json({ ok: false, message: 'انت لا تملك صلاحيات اضافة موضف' });

    if (!name?.trim()) return res.status(400).json({ ok: false, message: 'اسم الموظف مطلوب' });
    const sal = Number(salary || 0);
    if (isNaN(sal) || sal < 0) return res.status(400).json({ ok: false, message: 'الراتب غير صحيح' });

    const employee = await Employee.create({
      name, phone, position, note,
      salary: sal,
      hireDate: hireDate || Date.now(),
    });
    res.status(201).json({ ok: true, employee });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: 'فشل إضافة الموظف' });
  }
});

// تفعيل / إيقاف
app.patch('/api/employees/:id/status', verifyUser, async (req, res) => {
  try {
    if (!validId(req, res)) return;
    const user = req.user
    if (user.status !== "admin") return res.status(400).json({ ok: false, message: 'انت لا تملك صلاحيات' });
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) return res.status(400).json({ ok: false, message: 'حالة غير صحيحة' });

    const employee = await Employee.findByIdAndUpdate(req.params.id, { status }, { returnDocument: 'after' });
    if (!employee) return res.status(404).json({ ok: false, message: 'غير موجود' });
    res.json({ ok: true, employee });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: 'فشل تغيير الحالة' });
  }
});

// تعديل موظف
app.put('/api/employees/:id', verifyUser, async (req, res) => {
  try {
    if (!validId(req, res)) return;

    const user = req.user
    if (user.status !== "admin") return res.status(400).json({ ok: false, message: 'انت لا تملك صلاحيات تعديل بيانات الموضف' });

    const { name, phone, position, salary, hireDate, note, password, email } = req.body;

    if (!name?.trim()) return res.status(400).json({ ok: false, message: 'اسم الموظف مطلوب' });
    const sal = Number(salary || 0);
    if (isNaN(sal) || sal < 0) return res.status(400).json({ ok: false, message: 'الراتب غير صحيح' });

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { name, phone, position, note, salary: sal, ...(hireDate && { hireDate }) },
      { returnDocument: 'after', runValidators: true }
    );
    if (!employee) return res.status(404).json({ ok: false, message: 'غير موجود' });
    if (typeof password === "string" && password.trim().length >= 8) {
      employee.password = await bcrypt.hash(password.trim(), 12);
    }

    if (typeof email === "string" && email.trim() !== "") {
      employee.email = email.trim();
    }

    await employee.save();

    res.json({ ok: true, employee });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: 'فشل التعديل' });
  }
});

// حذف
app.delete('/api/employees/:id', verifyUser, async (req, res) => {
  try {
    if (!validId(req, res)) return;

    const user = req.user
    if (user.status !== "admin") return res.status(400).json({ ok: false, message: 'انت لا تملك صلاحيات حدف موضف' });

    const e = await Employee.findByIdAndDelete(req.params.id);
    if (!e) return res.status(404).json({ ok: false, message: 'غير موجود' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'فشل الحذف' });
  }
});


app.use((req, res) => {
    res.status(404).end();
});

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
})