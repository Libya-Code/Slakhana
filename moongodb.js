const { name } = require("ejs");
const { Schema, model } = require("mongoose");

// سكيمة العداد
const counterSchema = new Schema({
  name: { type: String, required: true }, // اسم العداد، مثلاً "Requests" أو "Payments"
  seq: { type: Number, default: 0 }, // الرقم الحالي للعداد
});

const Counter = model("counter", counterSchema);

// =================
// سكيمة مستخدم
// =================

const SchemaUser = new Schema({
  name: {
    type: String,
    default: "غير معروف"
  },
  email: {
    type: String,
    require: true,
    default: null,
  },
  password: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ================
// سكيمة مبياعات
// ===============
const SchemaSale = new Schema({
  uuid: Number,
  employeeName: {
    type: String,
    default: null
  },
  name: {
    type: String,
    default: null,
  },
  qye: {
    type: Number,
    default: null,
  },
  price: {
    type: Number,
    default: null,
  },
  payment: {
    type: String,
    default: null,
  },
  status: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

SchemaSale.pre("save", async function () {
  if (this.isNew) {
    const { seq } = await Counter.findOneAndUpdate(
      {
        name: "SchemaSale",
      },
      {
        $inc: { seq: 1 },
      },
      {
        returnDocument: "after",
        upsert: true,
      },
    );
    this.uuid = seq
  }
});
// ===============
// سكيمة تصنيفات
// ==============
const SchemaCategory = new Schema({
  name: {
    type: String,
    default: null,
  },
  description: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const category = model("category", SchemaCategory);
const Sale = model("Sale", SchemaSale);
const User = model("user", SchemaUser);

module.exports = { category, Sale, User };
