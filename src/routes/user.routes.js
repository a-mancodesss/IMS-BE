import { Router } from "express";
import {
  loginUser,
  registerUser,
  logoutUser,
  changeCurrentPassword,
  editProfileDetails,
  deleteUser,
  getActiveUsers,
  getCurrentUser,
} from "../controllers/user.controller.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/admin_check.middleware.js";

const router = Router();

router.route("/register").post(verifyJwt, verifyAdmin, registerUser);
router.route("/login").post(loginUser);
router.route("/logout").post(verifyJwt, logoutUser);
router.route("/change-password").patch(verifyJwt, changeCurrentPassword);
router.route("/edit-profile").patch(verifyJwt, editProfileDetails);
router.route("/:id").delete(verifyJwt, verifyAdmin, deleteUser);
router.route("/active/:page").get(verifyJwt, verifyAdmin, getActiveUsers);
router
  .route("/:username/:page")
  .get(verifyJwt, verifyAdmin, getActiveUsers);
router.route("/current-user").get(verifyJwt, getCurrentUser);

export default router;
