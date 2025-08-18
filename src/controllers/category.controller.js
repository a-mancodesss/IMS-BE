import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Category } from "../models/category.model.js";
import { trimValues } from "../utils/trimmer.js";
import { PAGINATION_LIMIT } from "../constants.js";
import { parseObjectId } from "../utils/parseObjectId.js";
import { addActivityLog } from "../utils/addActivityLog.js";
import { Item } from "../models/item.model.js";

const addNewCategory = asyncHandler(async (req, res) => {
  const { category_name} = req.body;
  const [categoryName] = trimValues([
    category_name
  ]);
  const categoryNameNormalized = categoryName.toLowerCase();

  if (!categoryName) {
    throw new ApiError(
      400,
      "Bad request.Category name is required."
    );
  }
  if (!req.isAdmin) {
    throw new ApiError(401, "Only admin can add a category");
  }
  const existingCategory = await Category.findOne({
    isActive: true,
    categoryNameNormalized,
  });
  if (existingCategory) {
    throw new ApiError(409, "Category already exists");
  }
  const category = await Category.create({
    categoryName,
  
    categoryNameNormalized,

    createdBy: req.user._id,
  });
  await addActivityLog({
    action: "added",
    entityType: "Category",
    entityId: category._id,
    entityName: category.categoryName,
    performedBy: req.user._id,
    performedByName: req.user.username,
    performedByRole: req.user.role,
    description: `Added a category '${category.categoryName}'`,
  });
  res
    .status(201)
    .json(new ApiResponse(201, category, "Category added successfully"));
});

const displayAllCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true }).select(
    "categoryName"
  );
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        categories,
        "All  active categories fetched successfully"
      )
    );
});

const updateCategory = asyncHandler(async (req, res) => {
  const { category_name} = req.body;
  const { id } = req.params;
  const [categoryId] = parseObjectId(trimValues([id]));
  const [categoryName] = trimValues([
    category_name,

  ]);
  const categoryNameNormalized = categoryName.toLowerCase();
 
  if (!categoryName) {
    throw new ApiError(400, "Bad request.All the fields are empty.");
  }
  if (!req.isAdmin) {
    throw new ApiError(401, "Only admin can update category details");
  }
  const categoryInContention = await Category.findById(categoryId);
  if (!categoryInContention) {
    throw new ApiError(404, "Category with given id not found.");
  }
  const updateQuery = {};
  let changesForActivityLog = {};
  if (categoryName) {
    const existing = await Category.findOne({
      isActive: true,
      categoryNameNormalized,
      _id: { $ne: categoryId },
    });
    if (existing) {
      throw new ApiError(409, "Category name is already taken");
    }
    changesForActivityLog.name = {
      from: categoryInContention.categoryName,
      to: categoryName,
    };
    updateQuery.categoryName = categoryName;
    updateQuery.categoryNameNormalized = categoryNameNormalized;
  }
  const updatedCategory = await Category.findByIdAndUpdate(
    categoryId,
    updateQuery,
    { new: true }
  );
  if (!updatedCategory) {
    throw new ApiError(404, "Category not found");
  }
  await addActivityLog({
    action: "edited details",
    entityType: "Category",
    entityId: updatedCategory._id,
    entityName: updatedCategory.categoryName,
    performedBy: req.user._id,
    performedByName: req.user.username,
    performedByRole: req.user.role,
    changes: changesForActivityLog,
    description: `Edited details of category '${updatedCategory.categoryName}'`,
  });
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updateCategory,
        "Category details updated successfully."
      )
    );
});

const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [categoryId] = parseObjectId(trimValues([id]));
  if (!req.isAdmin) {
    throw new ApiError(401, "Only admin can delete a category.");
  }
  const categoryInContention = await Category.findById(categoryId);
  if (!categoryInContention.isActive) {
    throw new ApiError(400, "Category has already been removed.");
  }
  const deletionResult = await Category.findByIdAndUpdate(
    categoryId,
    { isActive: false },
    { new: true }
  );
  if (!deletionResult) {
    throw new ApiError(404, "Category not found");
  }
  await addActivityLog({
    action: "removed",
    entityType: "Category",
    entityId: deletionResult._id,
    entityName: deletionResult.categoryName,
    performedBy: req.user._id,
    performedByName: req.user.username,
    performedByRole: req.user.role,
    changes: {
      isActive: { from: true, to: false },
    },
    description: `Removed category '${deletionResult.categoryName}'`,
  });
  res
    .status(200)
    .json(new ApiResponse(200, {}, "Category Deleted Successfully"));
});
const getAllCategoryData = asyncHandler(async (req, res) => {
  let { page } = req.params;
  page = parseInt(page, 10) || 1;
  const skip = (page - 1) * PAGINATION_LIMIT;
  const totalCategories = await Category.countDocuments({ isActive: true });
  if (totalCategories === 0) {
    return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { totalCategories:0, categories: [] },
        "All category data fetched successfully."
      )
    );
  }
  const activeCategories = await Category.aggregate([
    {
      $match: {
        isActive: true,
      },
    },
    {
      $skip: skip,
    },
    {
      $limit: PAGINATION_LIMIT,
    },
    {
      $lookup: {
        from: "users",
        localField: "createdBy",
        foreignField: "_id",
        as: "creator",
      },
    },
    {
      $unwind: "$creator",
    },
    {
      $lookup: {
        from: "items",
        localField: "_id",
        foreignField: "itemCategory",
        as: "items",
      },
    },
    {
      $addFields: {
        totalItems: {
          $size: {
            $filter: {
              input: "$items",
              as: "item",
              cond: { $eq: ["$$item.isActive", true] },
            },
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        categoryName: 1,
        totalItems: 1,
        creatorUsername: "$creator.username",
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { totalCategories, categories: activeCategories },
        "All category data fetched successfully."
      )
    );
});
const getItemStatusStatsByCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [categoryId] = parseObjectId(trimValues([id]));
  const itemsGroupedByStatusForParticularCategory = await Item.aggregate([
    {
      $match: {
        itemCategory: categoryId,
        isActive: true,
      },
    },
    {
      $group: {
        _id: "$itemStatus",
        count: { $sum: 1 },
      },
    },
  ]);
  const categorywiseItemStatusStats = {
    no_total_category_items: 0,
    no_category_working_items: 0,
    no_category_repairable_items: 0,
    no_category_not_working_items: 0,
  };
  for (const group of itemsGroupedByStatusForParticularCategory) {
    const status = group._id;
    const count = group.count;

    categorywiseItemStatusStats.no_total_category_items += count;

    if (status === "Working")
      categorywiseItemStatusStats.no_category_working_items = count;
    else if (status === "Repairable")
      categorywiseItemStatusStats.no_category_repairable_items = count;
    else if (status === "Not working")
      categorywiseItemStatusStats.no_category_not_working_items = count;
  }
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        categorywiseItemStatusStats,
        `Items Status stats for a category with id ${id} fetched successfully`
      )
    );
});
const getItemAcquisitionStatsByCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const filter = { isActive: true };
  if (id && id !== "0") {
    const [categoryId] = parseObjectId(trimValues([id]));
    filter.itemCategory = categoryId;
  }

  const itemsGroupedByAcquisitionForParticularCategory = await Item.aggregate([
    {
      $match: filter,
    },
    {
      $group: {
        _id: "$itemSource",
        count: { $sum: 1 },
      },
    },
  ]);
  const categorywiseItemAcquisitionStats = {
    no_total_category_items: 0,
    no_category_purchase_items: 0,
    no_category_donated_items: 0,
  };
  for (const group of itemsGroupedByAcquisitionForParticularCategory) {
    const source = group._id;
    const count = group.count;

    categorywiseItemAcquisitionStats.no_total_category_items += count;

    if (source === "Purchase")
      categorywiseItemAcquisitionStats.no_category_purchase_items = count;
    else if (source === "Donation")
      categorywiseItemAcquisitionStats.no_category_donated_items = count;
  }
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        categorywiseItemAcquisitionStats,
        id && id !== "0"
          ? `Item acquisition stats for category with id ${id} fetched successfully.`
          : "Item acquisition stats for all categories fetched successfully."
      )
    );
});

export {
  addNewCategory,
  displayAllCategories,
  updateCategory,
  deleteCategory,
  getAllCategoryData,
  getItemStatusStatsByCategory,
  getItemAcquisitionStatsByCategory,
};
