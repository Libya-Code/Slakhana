const bcrypt = require("bcrypt");
const mongoose = require("mongoose")
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const express = require("express");
const app = express()

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
const { Sale, category, User } = require("./moongodb")
const { text, verifyUser, verifyAdmin, time } = require("./functions");

app.set("view engine", "ejs");
app.set("views", "./views");

app.use(cookieParser());
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
      categories:Category
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
    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "البريد الإلكتروني أو كلمة المرور غير صحيحة"
      });
    } // التحقق من كلمة المرور المشفرة 

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }); 4
    }
    // إنشاء JWT 
    const token = jwt.sign(
      { id: user._id }
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

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
})