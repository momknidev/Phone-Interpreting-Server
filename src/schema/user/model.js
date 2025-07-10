import mongoose from "mongoose";
import { type } from "os";

const UserData = mongoose.Schema({
  name: {
    type: String,
  },
  email: {
    type: String,
    required: false,
  },
  password: {
    type: String,
    required: false,
  },
  role: {
    type: String,
    required: false,
  },
  jobTitle: {
    type: String,
    required: false,
  },
  phoneNumber: {
    type: String,
  },
  department: {
    type: String,
  },
  avatarUrl: {
    type: String,
  },
  description: {
    type: String,
  },
  type: {
    type: String,
  },
  language: {
    type: Array,
    default: []
  },
  personalEmail: {
    type: String,
  },
  address1:
  {
    type: String,
  },
  address2:
  {
    type: String,
  },
  city:
  {
    type: String,
  },
  postcode: {
    type: String,
  },
  country: {
    type: Object,
  },
  dob:{
    type: String,
  },
  permissions:{
    type: Array,

  }

});

export const userModel = mongoose.model("Employees", UserData);
