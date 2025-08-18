import mongoose, { Schema } from "mongoose";
const itemSchema = new Schema(
  {
    itemName: {
      type: String,
      required: true,
    },
    itemCategory: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    itemSubCategory:{
      type:Schema.Types.ObjectId,
      ref:"SubCategory",
      required:true,
    },
    itemModelNumberOrMake: {
      type: String,
    },
    itemAcquiredDate: {
      type: Date,
      required: true,
    },
    itemCost: {
      type: Number,
      required: true,
    },
    itemFloor: {
      type: Schema.Types.ObjectId,
      ref: "Floor",
      required: true,
    },
    itemRoom: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    itemStatusId:{
      type:String
    },
    itemStatus: {
      type: String,
      enum: ["Working", "Repairable", "Not working"],
      required: true,
    },
    itemSourceId:{
      type:String,
    },
    itemSource: {
      type: String,
      enum: ["Purchase", "Donation"],
      required: true,
    },
    itemDescription: {
      type: String,
    },
    itemSerialNumber: {
      type: String,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deactivatedAt:{
      type:Date
    },
    itemRemark:{
      type:String
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);
itemSchema.index({ updatedAt: -1 });



export const Item = mongoose.model("Item", itemSchema);
