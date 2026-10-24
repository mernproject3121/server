const mongoose = require("mongoose");

const hodSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  phone: String,
  department: String
});

module.exports = mongoose.model("HOD", hodSchema);