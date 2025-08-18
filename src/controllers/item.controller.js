import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Item } from "../models/item.model.js";
import { Category } from "../models/category.model.js";
import { SubCategory } from "../models/subCategory.model.js";
import { Room } from "../models/room.model.js";
import { PAGINATION_LIMIT } from "../constants.js";
import { trimValues } from "../utils/trimmer.js";
import { parseObjectId } from "../utils/parseObjectId.js";
import { ActivityLog } from "../models/activityLog.model.js";
import { addActivityLog } from "../utils/addActivityLog.js";
import { getSourceNameById } from "../utils/sourceNameResolver.js";
import { getItemStatusNameById } from "../utils/itemStatusNameResolver.js";
import { itemSource } from "../constants.js";
import { itemStatus } from "../constants.js";

const itemsDataFetcher = async (filter = {}, skip) => {
  const totalItems = await Item.countDocuments(filter);
  if (totalItems === 0) {
    return { totalItems: 0, items: [] };
  }
  const activeMatchingItems = await Item.aggregate([
    {
      $match: filter,
    },
    {
      $sort: { updatedAt: -1 },
    },
    {
      $skip: skip,
    },
    {
      $limit: PAGINATION_LIMIT,
    },
    {
      $lookup: {
        from: "floors",
        localField: "itemFloor",
        foreignField: "_id",
        as: "floor",
      },
    },
    {
      $unwind: "$floor",
    },
    {
      $lookup: {
        from: "categories",
        localField: "itemCategory",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $unwind: "$category",
    },
    {
      $lookup: {
        from: "subcategories",
        localField: "itemSubCategory",
        foreignField: "_id",
        as: "subCategory",
      },
    },
    {
      $unwind: "$subCategory",
    },
    {
      $lookup: {
        from: "rooms",
        localField: "itemRoom",
        foreignField: "_id",
        as: "room",
      },
    },
    {
      $unwind: "$room",
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
      $project: {
        _id: 1,
        itemName: 1,
        itemModelNumberOrMake: 1,
        itemAcquiredDate: 1,
        itemCost: 1,
        itemStatusId: 1,
        itemStatus: 1,
        itemSourceId: 1,
        itemSource: 1,
        itemSerialNumber: 1,
        itemDescription: 1,
        itemFloorId: "$floor._id",
        itemFloor: "$floor.floorName",
        itemRoomId: "$room._id",
        itemRoom: "$room.roomName",
        itemCategoryId: "$category._id",
        itemCategory: "$category.categoryName",
        itemSubCategoryId:"$subCategory._id",
        itemSubCategory:"$subCategory.subCategoryName",
        createdBy: "$creator.username",
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ]);
  return { totalItems, items: activeMatchingItems };
};
const addNewItem = asyncHandler(async (req, res) => {
  const {
    item_name,
    item_description,
    item_category_id,
    item_subCategory_id,
    item_make_or_model_no,
    item_floor_id,
    item_room_id,
    item_source,
    item_cost,
    item_status,
    item_acquired_date,
    item_create_count,
  } = req.body;
  if (!req.isAdmin) {
    throw new ApiError(401, "Only admin can add items.");
  }
  const [
    itemName,
    itemDescription,
    itemCategoryIdString,
    itemSubCategoryIdString,
    itemModelNumberOrMake,
    itemFloorIdString,
    itemRoomIdString,
    itemSource,
    itemCost,
    itemStatus,
    itemAcquiredDate,
  ] = trimValues([
    item_name,
    item_description,
    item_category_id,
    item_subCategory_id,
    item_make_or_model_no,
    item_floor_id,
    item_room_id,
    item_source,
    item_cost,
    item_status,
    item_acquired_date,
  ]);
  const [itemFloor, itemRoom, itemCategory, itemSubCategory] = parseObjectId([
    itemFloorIdString,
    itemRoomIdString,
    itemCategoryIdString,
    itemSubCategoryIdString,
  ]);
  const sourceName = getSourceNameById(itemSource);
  if (!sourceName) {
    throw new ApiError(404, "Valid item source not found.");
  }
  const statusName = getItemStatusNameById(itemStatus);
  if (!statusName) {
    throw new ApiError(404, "Valid item status not found.");
  }
  const subCategory = await SubCategory.findById(itemSubCategory);
  const subCategoryAbbr = subCategory.subCategoryAbbreviation;
  const idOffset = subCategory.lastItemSerialNumber;
  const currentYear = new Date().getFullYear();
  const items = Array.from({ length: item_create_count || 1 }, (_, index) => {
    const serial = String(idOffset + index + 1).padStart(3, "0");
    return {
      itemName,
      itemDescription,
      itemCategory,
      itemSubCategory,
      itemModelNumberOrMake,
      itemFloor,
      itemRoom,
      itemSourceId: itemSource,
      itemSource: sourceName,
      itemCost,
      itemStatusId: itemStatus,
      itemStatus: statusName,
      itemAcquiredDate,
      itemSerialNumber: `${currentYear}${subCategoryAbbr}${serial}`,
      createdBy: req.user._id,
    };
  });
  const lastItemSerialNumber = idOffset + items.length;
  await SubCategory.findByIdAndUpdate(
    itemSubCategory,
    { lastItemSerialNumber },
    { new: true }
  );
  const insertedItems = await Item.insertMany(items);
  if (insertedItems.length === 0) {
    throw new ApiError(500, "Items could not be added successfully");
  }
  await Item.populate(insertedItems, [
    {
      path: "itemRoom",
      select: "roomName",
    },
    {
      path: "itemFloor",
      select: "floorName",
    },
  ]);
  const logs = insertedItems.map((item) => ({
    action: "added",
    entityType: "Item",
    entityId: item._id,
    entityName: item.itemName,
    performedBy: req.user._id,
    performedByName: req.user.username,
    performedByRole: req.user.role,
    changes: {
      room: { from: null, to: item.itemRoom.roomName },
      status: { from: null, to: item.itemStatus },
      floor: { from: null, to: item.itemFloor.floorName },
      isActive: { from: null, to: true },
    },
    description: `Added an item '${item.itemName}' to room '${item.itemRoom.roomName}'`,
  }));

  await ActivityLog.insertMany(logs); // Efficient batch insert
  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        insertedItems,
        `${insertedItems.length} items added successfully`
      )
    );
});
const getItemSource = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(
      new ApiResponse(200, itemSource, "Item Sources fetched successfully")
    );
});
const getItemStatus = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(
      new ApiResponse(200, itemStatus, "Item statuses fetched successfully.")
    );
});
const updateItemStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [itemId] = parseObjectId(trimValues([id]));
  const { statusId } = req.body;
  const statusName = getItemStatusNameById(statusId);
  const allowedStatus = ["Working", "Repairable", "Not working"];
  if (!allowedStatus.includes(statusName)) {
    throw new ApiError(403, "Bad request:Invalid status.");
  }
  const itemInContention = await Item.findById(itemId)
    .populate("itemRoom", "roomName")
    .populate("itemFloor", "floorName")
    .lean();
  if (!itemInContention) {
    throw new ApiError(404, "Item with provided id not found.");
  }
  const updatedItem = await Item.findByIdAndUpdate(
    itemId,
    { itemStatus: statusName, itemStatusId: statusId },
    { new: true }
  );
  if (!updatedItem) {
    throw new ApiError(500, "Item status updation unsuccessful.");
  }
  await addActivityLog({
    action: "changed status",
    entityType: "Item",
    entityId: itemId,
    entityName: itemInContention.itemName,
    performedBy: req.user._id,
    performedByName: req.user.username,
    performedByRole: req.user.role,
    changes: {
      room: {
        from: itemInContention.itemRoom.roomName,
        to: itemInContention.itemRoom.roomName,
      },
      floor: {
        from: itemInContention.itemFloor.floorName,
        to: itemInContention.itemFloor.floorName,
      },
      status: { from: itemInContention.itemStatus, to: updatedItem.itemStatus },
      isActive: { from: true, to: true },
    },
    description: `Changed status of item '${itemInContention.itemName}' to '${updatedItem.itemStatus}'`,
  });
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedItem,
        `Item with status updated to '${statusName}'.`
      )
    );
});
const softDeleteItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [itemId] = parseObjectId(trimValues([id]));
  console.log(itemId);
  const item = await Item.findById(itemId)
    .populate("itemRoom", "roomName")
    .populate("itemFloor", "floorName")
    .lean();
  if (!item) {
    throw new ApiError(404, "Item with the provided id not found.");
  }
  const deletedItem = await Item.findByIdAndUpdate(
    itemId,
    { isActive: false, deactivatedAt: new Date() },
    { new: true }
  );
  if (!deletedItem) {
    throw new ApiError(500, "Item deletion unsuccessful.");
  }
  await addActivityLog({
    action: "removed",
    entityType: "Item",
    entityId: item._id,
    entityName: item.itemName,
    performedBy: req.user._id,
    performedByName: req.user.username,
    performedByRole: req.user.role,
    changes: {
      room: { from: item.itemRoom.roomName, to: item.itemRoom.roomName },
      floor: { from: item.itemFloor.floorName, to: item.itemFloor.floorName },
      status: { from: item.itemStatus, to: item.itemStatus },
      isActive: { from: true, to: false },
    },
    description: `Removed item '${item.itemName}'`,
  });
  res
    .status(200)
    .json(new ApiResponse(200, deletedItem, `Item deleted successfully`));
  //the name soft delete because we are not actually delete the entry from the database rather just manipulating the status.
});
const updateItemDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [itemId] = parseObjectId(trimValues([id]));
  const {
    item_name,
    item_description,
    item_category_id,
    item_subCategory_id,
    item_make_or_model_no,
    item_source,
    item_cost,
    item_acquired_date,
    item_room_id,
    item_status,
  } = req.body;
  const [
    itemName,
    itemDescription,
    itemCategoryString,
    itemSubCategoryString,
    itemModelNumberOrMake,
    itemSource,
    itemStatus,
  ] = trimValues([
    item_name,
    item_description,
    item_category_id,
    item_subCategory_id,
    item_make_or_model_no,
    item_source,
    item_status,
  ]);
  if (itemName === "" || item_cost === "" || item_room_id === "0") {
    throw new ApiError(
      400,
      "Bad request.Cant update the item with insufficient details."
    );
  }
  const itemInContention = await Item.findById(itemId)
    .populate("itemRoom", "roomName")
    .populate("itemFloor", "floorName")
    .lean();
  if (!itemInContention) {
    throw new ApiError(404, "Item with provided id not found.");
  }
  const query = {};
  if (itemName) {
    query.itemName = itemName;
  }
  if (itemDescription) {
    query.itemDescription = itemDescription;
  }
  if (itemCategoryString) {
    const [itemCategory] = parseObjectId([itemCategoryString]);
    const category = await Category.findById(itemCategory);
    if (!category) {
      throw new ApiError(404, "Valid category matching the given id not found");
    }
    query.itemCategory = itemCategory;
  }
  if (itemSubCategoryString) {
    const [itemSubCategory] = parseObjectId([itemSubCategoryString]);
    const subCategory = await SubCategory.findById(itemSubCategory);
    if (!subCategory) {
      throw new ApiError(
        404,
        "Valid  sub category matching the given id not found"
      );
    }
    if (itemSubCategory.equals(itemInContention.itemSubCategory)) {
      query.itemSubCategory = itemSubCategory;
    } else {
      query.itemSerialNumber =
        itemInContention.itemSerialNumber.slice(0, 4) +
        subCategory.subCategoryAbbreviation +
        String(subCategory.lastItemSerialNumber + 1).padStart(3, "0");
      query.itemSubCategory = itemSubCategory;
      subCategory.lastItemSerialNumber += 1;
      await subCategory.save({ validateBeforeSave: false });
    }
  }
  if (itemModelNumberOrMake) {
    query.itemModelNumberOrMake = itemModelNumberOrMake;
  }
  if (itemSource) {
    const sourceName = getSourceNameById(itemSource);
    if (!sourceName) {
      throw new ApiError(404, "Valid item source not found.");
    }
    query.itemSourceId = itemSource;
    query.itemSource = sourceName;
  }
  if (item_cost) {
    query.itemCost = item_cost;
  }
  if (item_acquired_date) {
    query.itemAcquiredDate = item_acquired_date;
  }
  if (itemStatus) {
    const statusName = getItemStatusNameById(itemStatus);
    if (!statusName) {
      throw new ApiError(404, "Valid item status not found.");
    }
    query.itemStatusId = itemStatus;
    query.itemStatus = statusName;
  }
  if (item_room_id) {
    const [newRoomId] = parseObjectId(trimValues([item_room_id]));
    console.log(newRoomId);
    const newRoom = await Room.findById(newRoomId);

    if (!newRoom) {
      throw new ApiError(404, "valid room not found.");
    }
    query.itemFloor = newRoom.floor;
    query.itemRoom = newRoom._id;
  }

  const updatedItem = await Item.findByIdAndUpdate(itemId, query, {
    new: true,
  })
    .populate("itemFloor", "floorName")
    .populate("itemRoom", "roomName")
    .lean();
  if (!updatedItem) {
    throw new ApiError(500, "Updating item details unsuccessful.");
  }

  await addActivityLog({
    action: "edited details",
    entityType: "Item",
    entityId: itemId,
    entityName: updatedItem.itemName,
    performedBy: req.user._id,
    performedByName: req.user.username,
    performedByRole: req.user.role,
    changes: {
      room: {
        from: itemInContention.itemRoom.roomName,
        to: updatedItem.itemRoom.roomName,
      },
      floor: {
        from: itemInContention.itemFloor.floorName,
        to: updatedItem.itemFloor.floorName,
      },
      status: {
        from: itemInContention.itemStatus,
        to: updatedItem.itemStatus,
      },
      isActive: { from: true, to: true },
      itemSerialNumber: {
        from: itemInContention.itemSerialNumber,
        to: updatedItem.itemSerialNumber,
      },
    },
    description: `Edited details of item '${updatedItem.itemName}'`,
  });
  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedItem, "Item details updated successfully.")
    );
});
const filterItems = asyncHandler(async (req, res) => {
  const { category_id, subCategory_id,room_id, floor_id,status, source, starting_date, end_date } =
    req.params;
  let { page } = req.params;
  page = parseInt(page, 10) || 1;
  const skip = (page - 1) * PAGINATION_LIMIT;
  const [categoryIdString,subCategoryIdString, roomIdString,floorIdString] = trimValues([category_id,subCategory_id, room_id, floor_id]);
  const statusValue = getItemStatusNameById(trimValues([status])[0]);
  const sourceValue = getSourceNameById(trimValues([source])[0]);
  const filter = {};
  filter.isActive = true;
  if (categoryIdString && categoryIdString !== "0") {
    const [categoryId] = parseObjectId([categoryIdString]);
    filter.itemCategory = categoryId;
  }
  if (subCategoryIdString && subCategoryIdString !== "0") {
    const [subCategoryId] = parseObjectId([subCategoryIdString]);
    filter.itemSubCategory = subCategoryId;
  }
  if (roomIdString && roomIdString !== "0") {
    const [roomId] = parseObjectId([roomIdString]);
    filter.itemRoom = roomId;
  }
  if (floorIdString && floorIdString !== "0") {
    const [floorId] = parseObjectId([floorIdString]);
    filter.itemFloor = floorId;
  }
  if (statusValue && statusValue !== "0") {
    filter.itemStatus = statusValue;
  }
  if (sourceValue && sourceValue !== "0") {
    filter.itemSource = sourceValue;
  }
  if (starting_date !== "0" || end_date !== "0") {
    filter.itemAcquiredDate = {};
    if (starting_date !== "0") {
      filter.itemAcquiredDate.$gte = new Date(starting_date);
    }
    if (end_date !== "0") {
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);
      filter.itemAcquiredDate.$lte = end;
    }
  }
  console.log(filter);
  const response = await itemsDataFetcher(filter, skip);
  res
    .status(200)
    .json(
      new ApiResponse(200, response, "Filtered items fetched successfully.")
    );
});
const getSimilarItemsStats = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [itemId] = parseObjectId(trimValues([id]));
  const item = await Item.findById(itemId);
  if (!item) {
    throw new ApiError(404, "Item not found");
  }
  const categoryId = item.itemCategory;
  console.log(categoryId);
  const similarItemsStats = await Item.aggregate([
    {
      $match: { itemCategory: categoryId, isActive: true },
    },
    {
      $group: {
        _id: "$itemModelNumberOrMake",
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        modelOrMake: "$_id",
        count: 1,
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);
  console.log(similarItemsStats);
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        similarItemsStats,
        "Similar items detail fetched successfully"
      )
    );
});
const getInventoryItemStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const firstOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1); //gets the first of current month(milliseconds equivalent)
  const endOfLastMonth = new Date(firstOfCurrentMonth - 1); //gets the last possible millisecond of the last month
  endOfLastMonth.setHours(23, 59, 59, 999); //just making sure its the last possible millisecond for the last month

  const result = await Item.aggregate([
    {
      $facet: {
        statusCounts: [
          {
            $group: {
              _id: "$itemStatus",
              count: { $sum: 1 },
            },
          },
        ],
        totalInventoryValue: [
          {
            $group: {
              _id: null,
              total: { $sum: "$itemCost" },
            },
          },
        ],
        numberOfItemsTillLastMonth: [
          {
            $match: {
              itemAcquiredDate: { $lte: endOfLastMonth },
              $or: [
                { isActive: true },
                { deactivatedAt: { $gt: endOfLastMonth } },
              ],
            },
          },
          {
            $count: "count",
          },
        ],
      },
    },
    {
      $project: {
        statusCounts: 1,
        totalInventoryValue: {
          $ifNull: [{ $arrayElemAt: ["$totalInventoryValue.total", 0] }, 0],
        },
        numberOfItemsTillLastMonth: {
          $ifNull: [
            { $arrayElemAt: ["$numberOfItemsTillLastMonth.count", 0] },
            0,
          ],
        },
      },
    },
  ]);
  const stats = result[0];
  //initializating the stats object because if a certain status is not present in the db,
  //then stats obtained using aggregation wont have any keys for that status which causes discrepancy in the code
  const inventoryStats = {
    no_total_items: 0,
    no_working: 0,
    no_repairable: 0,
    no_not_working: 0,
    no_total_items_till_last_month: stats.numberOfItemsTillLastMonth,
    inventory_total_value: stats.totalInventoryValue,
  };
  for (const stat of stats.statusCounts) {
    const status = stat._id;
    const count = stat.count;

    inventoryStats.no_total_items += count;

    if (status === "Working") inventoryStats.no_working = count;
    else if (status === "Repairable") inventoryStats.no_repairable = count;
    else if (status === "Not working") inventoryStats.no_not_working = count;
  }
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        inventoryStats,
        "Inventory stats fetched successfully."
      )
    );
});

const moveItemBetweenRooms = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { new_room_id } = req.body;
  const [itemId, newRoomId] = parseObjectId(trimValues([id, new_room_id]));
  const item = await Item.findById(itemId)
    .populate("itemRoom", "roomName")
    .populate("itemFloor", "floorName")
    .lean();
  const oldRoomName = item.itemRoom.roomName;
  const oldRoomId = item.itemRoom._id;
  if (!item) {
    throw new ApiError(404, "Item not found.");
  }
  const newRoom = await Room.findById(newRoomId)
    .populate("floor", "floorName")
    .lean();
  if (!newRoom) {
    throw new ApiError(404, "New room not found.");
  }
  const updatedItem = await Item.findByIdAndUpdate(
    itemId,
    {
      itemRoom: newRoom._id,
      itemFloor: newRoom.floor,
    },
    { new: true }
  );
  if (!updatedItem) {
    throw new ApiError(
      500,
      `Item could not be moved successfully to room ${newRoom.roomName}`
    );
  }
  await addActivityLog({
    action: "moved",
    entityType: "Item",
    entityId: itemId,
    entityName: item.itemName,
    performedBy: req.user._id,
    performedByName: req.user.username,
    performedByRole: req.user.role,
    changes: {
      room: { from: item.itemRoom.roomName, to: newRoom.roomName },
      floor: { from: item.itemFloor.floorName, to: newRoom.floor.floorName },
      status: { from: item.itemStatus, to: item.itemStatus },
      isActive: { from: true, to: true },
    },
    description: `Moved '${item.itemName}' to '${newRoom.roomName}'`,
  });
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedItem,
        `Item moved successfully to room '${newRoom.roomName}'`
      )
    );
});
const getItemLogs = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [itemId] = parseObjectId(trimValues([id]));
  const itemLogs = await ActivityLog.find({
    entityType: "Item",
    entityId: itemId,
  }).sort({
    createdAt: -1,
  });
  if (!itemLogs) {
    throw new ApiError(404, "Item logs not found.");
  }
  return res
    .status(201)
    .json(new ApiResponse(201, itemLogs, "Item Logs fetched successfully."));
});
const getOverallRoomsDetails = asyncHandler(async (req, res) => {
  const roomStats = await Item.aggregate([
    {
      $group: {
        _id: {
          room: "$room",
          status: "$status",
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.room",
        statusCounts: {
          $push: {
            status: "$_id.status",
            count: "$count",
          },
        },
        totalItems: {
          $sum: "$count",
        },
      },
    },
    {
      $lookup: {
        from: "rooms",
        localField: "_id",
        foreignField: "_id",
        as: "roomDetails",
      },
    },
    {
      $unwind: "$roomDetails",
    },
    {
      $lookup: {
        from: "floors",
        localField: "roomDetails.floor",
        foreignField: "_id",
        as: "floorDetails",
      },
    },
    {
      $unwind: "$floorDetails",
    },
    {
      $project: {
        _id: 0,
        roomId: "$_id",
        roomName: "$roomDetails.name",
        floorId: "$roomDetails.floor",
        floorName: "$floorDetails.name",
        totalItems: 1,
        statusCounts: 1,
      },
    },
  ]);
  return res
    .status(201)
    .json(new ApiResponse(201, roomStats, "Room stats fetched"));
});
const displayAllItems = asyncHandler(async (req, res) => {
  let { page } = req.params;
  page = parseInt(page, 10) || 1; //defaults to 1 in case of falsy values
  const skip = (page - 1) * PAGINATION_LIMIT;
  const filter = {
    isActive: true,
  };
  const response = await itemsDataFetcher(filter, skip);
  return res
    .status(200)
    .json(
      new ApiResponse(200, response, "All items data fetched successfully")
    );
});
const getItemSearchResults = asyncHandler(async (req, res) => {
  const { item_string } = req.params;
  let { page } = req.params;
  page = parseInt(page, 10) || 1;
  const skip = (page - 1) * PAGINATION_LIMIT;
  const [itemString] = trimValues([item_string]);
  const filter = {
    isActive: true,
    $or: [
      { itemName: { $regex: item_string, $options: "i" } },
      { itemSerialNumber: { $regex: item_string, $options: "i" } },
    ],
  };
  const response = await itemsDataFetcher(filter, skip);
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        response,
        `All items matching ${itemString} in their names fetched successfully`
      )
    );
});
const getSpecificItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [itemId] = parseObjectId(trimValues([id]));
  const filter = {
    _id: itemId,
    isActive: true,
  };
  const matchingItem = await Item.aggregate([
    {
      $match: filter,
    },
    {
      $lookup: {
        from: "floors",
        localField: "itemFloor",
        foreignField: "_id",
        as: "floor",
      },
    },
    {
      $unwind: "$floor",
    },
    {
      $lookup: {
        from: "rooms",
        localField: "itemRoom",
        foreignField: "_id",
        as: "room",
      },
    },
    {
      $unwind: "$room",
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
      $project: {
        _id: 1,
        itemName: 1,
        itemModelNumberOrMake: 1,
        itemAcquiredDate: 1,
        itemCost: 1,
        itemStatus: 1,
        itemSource: 1,
        itemSerialNumber: 1,
        itemDescription: 1,
        itemFloor: "$floor.floorName",
        itemRoom: "$room.roomName",
        createdBy: "$creator.username",
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ]);
  if (!matchingItem[0]) {
    throw new ApiError(404, "Item not found.");
  }
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        matchingItem[0],
        `item with id ${id} fetched successfully.`
      )
    );
});
//in this functionality we are trying to group together the items having same name,category and model
//along with that we are going to fetch the reports of those items with their number in each of the status
const multipleItemsDataFetcher = async (filter = {}, skip) => {
  const totalItems = await Item.countDocuments(filter);
  if (totalItems === 0) {
    throw new ApiError(404, "Items not found");
  }
  const matchingItemsStatusReport = await Item.aggregate([
    {
      $match: filter,
    },
    {
      $group: {
        _id: {
          itemName: "$itemName",
          itemCategory: "$itemCategory",
          itemModel: "$itemModelNumberOrMake",
        },
        noWorkingItems: {
          $sum: {
            $cond: [{ $eq: ["$itemStatus", "Working"] }, 1, 0],
          },
        },
        noRepairableItems: {
          $sum: {
            $cond: [{ $eq: ["$itemStatus", "Repairable"] }, 1, 0],
          },
        },
        noNotWorkingItems: {
          $sum: {
            $cond: [{ $eq: ["$itemStatus", "Not working"] }, 1, 0],
          },
        },
      },
    },
    {
      $addFields: {
        totalCount: {
          $add: ["$noWorkingItems", "$noRepairableItems", "$noNotWorkingItems"],
        },
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "_id.itemCategory",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 0,
        itemName: "$_id.itemName",
        itemCategory: "$_id.itemCategory",
        itemCategoryName: "$category.categoryName",
        itemModel: "$_id.itemModel",
        noWorkingItems: 1,
        noRepairableItems: 1,
        noNotWorkingItems: 1,
        totalCount: 1,
      },
    },
    {
      $sort: { totalCount: -1 },
    },
    {
      $skip: skip,
    },
    {
      $limit: PAGINATION_LIMIT,
    },
  ]);
  return { totalItems, itemData: matchingItemsStatusReport };
};
const getMultipleItems = asyncHandler(async (req, res) => {
  let { page } = req.params;
  page = parseInt(page, 10) || 1;
  const skip = (page - 1) * PAGINATION_LIMIT;
  const filter = {
    isActive: true,
  };
  const response = await multipleItemsDataFetcher(filter, skip);
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        response,
        "Report for common items fetched successfully."
      )
    );
});
const filterMultipleItems = asyncHandler(async (req, res) => {
  const { category_id } = req.params;
  const [categoryId] = parseObjectId(trimValues([category_id]));
  let { page } = req.params;
  page = parseInt(page, 10) || 1;
  const skip = (page - 1) * PAGINATION_LIMIT;
  const filter = {
    isActive: true,
    itemCategory: categoryId,
  };
  const response = await multipleItemsDataFetcher(filter, skip);
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        response,
        "Report for common items filtered by category fetched successfully."
      )
    );
});
const getIndividualInstancesOfSimilarItemsInARoom = asyncHandler(
  async (req, res) => {
    const { item_name, item_model, item_room_id } = req.params;
    const [itemName, itemModel] = trimValues([item_name, item_model]);
    // console.log(itemModel);
    const [itemRoom] = parseObjectId(trimValues([item_room_id]));
    const filter = {
      itemName,
      itemRoom,
    };
    if (itemModel === '""') {
      filter.itemModelNumberOrMake = "";
    } else {
      filter.itemModelNumberOrMake = itemModel;
    }
    // console.log(filter);
    const allIndividualInstancesOfSimilarItems = await Item.aggregate([
      {
        $match: filter,
      },
      {
        $project: {
          itemName: 1,
          itemModel: "$itemModelNumberOrMake",
          itemAcquiredDate: 1,
          itemSerialNumber: 1,
          itemStatus: 1,
          itemStatusId: 1,
          itemSource: 1,
          itemSourceId: 1,
          itemCost: 1,
        },
      },
    ]);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          allIndividualInstancesOfSimilarItems,
          `All instances of similar items of room with id ${item_room_id} fetched successfully`
        )
      );
  }
);
const bulkDeleteItems = asyncHandler(async (req, res) => {
  if (!req.isAdmin) {
    throw new ApiError(401, "Only admin can delete items");
  }
  const { item_ids } = req.body;
  if (!Array.isArray(item_ids) || item_ids.length === 0) {
    throw new ApiError(403, "Provide item ids for bulk delete");
  }
  const itemIds = parseObjectId(trimValues(item_ids));
  // const updatedItems = await Item.updateMany(
  //   { _id: { $in: itemIds } },
  //   { $set: { isActive: false, deactivatedAt: new Date() } }
  // );
  const items = await Item.find({ _id: { $in: itemIds }, isActive: true })
    .populate("itemRoom")
    .populate("itemFloor");
  const updatePromises = items.map(async (item) => {
    await Item.updateOne(
      { _id: item._id },
      { $set: { isActive: false, deactivatedAt: new Date() } }
    );

    await addActivityLog({
      action: "removed",
      entityType: "Item",
      entityId: item._id,
      entityName: item.itemName,
      performedBy: req.user._id,
      performedByName: req.user.username,
      performedByRole: req.user.role,
      changes: {
        room: {
          from: item.itemRoom.roomName,
          to: item.itemRoom.roomName,
        },
        floor: {
          from: item.itemFloor.floorName,
          to: item.itemFloor.floorName,
        },
        status: {
          from: item.itemStatus,
          to: item.itemStatus,
        },
        isActive: {
          from: true,
          to: false,
        },
      },
      description: `Removed item '${item.itemName}'`,
    });
  });

  await Promise.all(updatePromises);
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Bulk delete successful"));
});
const bulkUpdateItemStatus = asyncHandler(async (req, res) => {
  if (!req.isAdmin) {
    throw new ApiError(401, "Only admin can update status of items");
  }
  const { item_ids, statusId } = req.body;
  if (!Array.isArray(item_ids) || item_ids.length === 0) {
    throw new ApiError(403, "Provide item ids for bulk delete");
  }
  const itemIds = parseObjectId(trimValues(item_ids));
  const status = getItemStatusNameById(statusId);
  if (!status) {
    throw new ApiError(404, "Valid status not found");
  }
  const items = await Item.find({ _id: { $in: itemIds }, isActive: true })
    .populate("itemRoom")
    .populate("itemFloor");
  const updatePromises = items.map(async (item) => {
    await Item.updateOne(
      { _id: item._id },
      { $set: { itemStatus: status, itemStatusId: statusId } }
    );

    await addActivityLog({
      action: "changed status",
      entityType: "Item",
      entityId: item._id,
      entityName: item.itemName,
      performedBy: req.user._id,
      performedByName: req.user.username,
      performedByRole: req.user.role,
      changes: {
        room: {
          from: item.itemRoom.roomName,
          to: item.itemRoom.roomName,
        },
        floor: {
          from: item.itemFloor.floorName,
          to: item.itemFloor.floorName,
        },
        status: { from: item.itemStatus, to: status },
        isActive: { from: true, to: true },
      },
      description: `Changed status of item '${item.itemName}' to '${status}'`,
    });
  });

  await Promise.all(updatePromises);
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Bulk item status updation successful"));
});
const bulkMoveItemsBetweenRooms = asyncHandler(async (req, res) => {
  if (!req.isAdmin) {
    throw new ApiError(401, "Only admin can move items between rooms");
  }
  const { item_ids, new_room_id } = req.body;
  if (!Array.isArray(item_ids) || item_ids.length === 0) {
    throw new ApiError(403, "Provide item ids for bulk delete");
  }
  const itemIds = parseObjectId(trimValues(item_ids));
  const newRoomId = parseObjectId(trimValues([new_room_id]));
  const newRoom = await Room.findById(newRoomId).populate("floor", "floorName");
  if (!newRoom) {
    throw new ApiError(404, "Valid room not found");
  }
  const items = await Item.find({ _id: { $in: itemIds }, isActive: true })
    .populate("itemRoom")
    .populate("itemFloor");
  const updatePromises = items.map(async (item) => {
    await Item.updateOne(
      { _id: item._id },
      { $set: { itemRoom: newRoom._id, itemFloor: newRoom.floor._id } }
    );

    await addActivityLog({
      action: "moved",
      entityType: "Item",
      entityId: item._id,
      entityName: item.itemName,
      performedBy: req.user._id,
      performedByName: req.user.username,
      performedByRole: req.user.role,
      changes: {
        room: { from: item.itemRoom.roomName, to: newRoom.roomName },
        floor: { from: item.itemFloor.floorName, to: newRoom.floor.floorName },
        status: { from: item.itemStatus, to: item.itemStatus },
        isActive: { from: true, to: true },
      },
      description: `Moved '${item.itemName}' to '${newRoom.roomName}'`,
    });
  });

  await Promise.all(updatePromises);
  return res
    .status(200)
    .json(
      new ApiResponse(200, {}, "Bulk item movement between rooms successful")
    );
});
export {
  addNewItem,
  updateItemStatus,
  filterItems,
  softDeleteItem,
  getSimilarItemsStats,
  getInventoryItemStats,
  moveItemBetweenRooms,
  getItemLogs,
  getOverallRoomsDetails,
  displayAllItems,
  getItemSearchResults,
  getSpecificItem,
  updateItemDetails,
  getMultipleItems,
  filterMultipleItems,
  getItemSource,
  getItemStatus,
  getIndividualInstancesOfSimilarItemsInARoom,
  bulkDeleteItems,
  bulkUpdateItemStatus,
  bulkMoveItemsBetweenRooms,
};
