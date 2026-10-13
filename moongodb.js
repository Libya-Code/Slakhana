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
  status:{
    type: String,
    default: "admin"
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

const paymentSchema = new Schema({
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: ['cash', 'transfer', 'binance'], default: 'cash' },
  note: { type: String, trim: true, default: '' },
  date: { type: Date, default: Date.now },
});

const debtSchema = new Schema(
  {
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    amount: { type: Number, required: true, min: 0.01 }, // إجمالي الدين
    paid: { type: Number, default: 0, min: 0 },          // المسدد
    status: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid', index: true },
    dueDate: { type: Date, default: null },
    note: { type: String, trim: true, default: '' },
    payments: { type: [paymentSchema], default: [] },
  },
  { timestamps: true }
);

debtSchema.virtual('remaining').get(function () {
  return Math.max(this.amount - this.paid, 0);
});
debtSchema.set('toJSON', { virtuals: true });

const employeeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, require: true, default: null },
    password: { type: String, default: null },
    position: { type: String, trim: true, default: '' },          // الوظيفة
    salary: { type: Number, default: 0, min: 0 },                  // الراتب الشهري
    hireDate: { type: Date, default: Date.now },                   // تاريخ التعيين
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    note: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

const Employee = model("Employee", employeeSchema)
const Debt = model('Debt', debtSchema);
const category = model("category", SchemaCategory);
const Sale = model("Sale", SchemaSale);
const User = model("user", SchemaUser);

module.exports = { category, Sale, User, Debt, Employee };
