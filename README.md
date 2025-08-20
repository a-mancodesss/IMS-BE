# IMS Backend - Inventory Management System

## 📋 Project Overview

The **Inventory Management System (IMS) Backend** is a comprehensive Node.js/Express.js application designed to streamline college inventory management and eliminate the traditional hassle of maintaining physical registers. This system provides a digital solution for tracking, managing, and organizing institutional assets across different floors, rooms, and categories.

## 🎯 Purpose

This system addresses the common challenges faced by educational institutions in managing their inventory:
- **Eliminates paper-based registers** - No more manual record keeping
- **Centralized asset tracking** - All inventory data in one place
- **Real-time updates** - Instant status changes and location tracking
- **Comprehensive reporting** - Generate detailed inventory reports
- **Role-based access** - Secure access control for administrators and users

## ✨ Key Features

### 🔐 Authentication & Authorization
- **JWT-based authentication** with secure token management
- **Role-based access control** (Admin/User roles)
- **Automatic admin seeding** on first startup
- **Cookie-based session management**

### 📦 Inventory Management
- **Item Management**
  - Add, update, delete inventory items
  - Track item details (name, model, cost, acquisition date)
  - Monitor item status (Working, Repairable, Not Working)
  - Item source tracking (Purchase, Donation)
  - Bulk operations (delete, update status, move items)

- **Location Management**
  - **Floor Management** - Organize inventory by building floors
  - **Room Management** - Track items by specific rooms
  - **Room Types** - Categorize rooms (Lab, Office, Classroom, etc.)
  - **Item Movement** - Transfer items between rooms with audit trail

- **Category Management**
  - **Categories & Subcategories** - Organize items hierarchically
  - **Dynamic category creation** and management
  - **Category-based filtering** and reporting

### 📊 Advanced Features
- **Search & Filtering**
  - Advanced search across multiple fields
  - Filter by category, location, status, date ranges
  - Pagination support for large datasets

- **Activity Logging**
  - Complete audit trail of all inventory changes
  - Track who made changes and when
  - Item movement history

- **Data Export**
  - CSV export functionality for reports
  - Bulk data operations

- **Statistics & Analytics**
  - Similar items statistics
  - Room-wise inventory distribution
  - Status-based reporting

## 🏗️ Technical Architecture

### Technology Stack
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js 5.1.0
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT + bcrypt for password hashing
- **Additional Libraries**:
  - `cors` - Cross-origin resource sharing
  - `cookie-parser` - Cookie handling
  - `json2csv` - CSV export functionality
  - `mongoose-aggregate-paginate-v2` - Advanced pagination

### Project Structure
```
backend/
├── src/
│   ├── controllers/     # Business logic layer
│   ├── models/         # Database schemas
│   ├── routes/         # API route definitions
│   ├── middlewares/    # Authentication & validation
│   ├── utils/          # Helper functions
│   ├── db/            # Database connection
│   ├── app.js         # Express app configuration
│   ├── index.js       # Server entry point
│   └── constants.js   # Application constants
├── package.json       # Dependencies & scripts
└── .env              # Environment variables
```

### Database Models
- **User** - System users with role-based access
- **Item** - Core inventory items with detailed attributes
- **Category/SubCategory** - Hierarchical item classification
- **Floor** - Building floor information
- **Room** - Room details with floor association
- **RoomType** - Room categorization
- **ActivityLog** - Audit trail for all operations

## 🚀 Setup Instructions

### Prerequisites
- **Node.js** (v18 or higher)
- **MongoDB** (local or cloud instance)
- **npm** or **yarn** package manager

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ims-final/backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env` file in the backend root directory:
   ```env
   # Database Configuration
   MONGODB_URI=mongodb://localhost:27017/inventory
   DB_NAME=inventory

   # Server Configuration
   PORT=8000
   CORS_ORIGIN=http://localhost:5173

   # JWT Configuration
   ACCESS_TOKEN_SECRET=your_super_secret_access_token_key
   ACCESS_TOKEN_EXPIRY=1d
   REFRESH_TOKEN_SECRET=your_super_secret_refresh_token_key
   REFRESH_TOKEN_EXPIRY=10d


4. **Start MongoDB**
   Ensure MongoDB is running on your system or configure cloud MongoDB URI.

5. **Run the application**
   
   **Development mode:**
   ```bash
   npm run dev
   ```
   
   **Production mode:**
   ```bash
   npm start
   ```

6. **Verify Setup**
   - Server should start on `http://localhost:8000`
   - Admin user will be automatically created on first run
   - Check console for "Server is running at port 8000" message

## 🔧 API Endpoints

### Authentication
- `POST /api/v1/users/register` - Register new user
- `POST /api/v1/users/login` - User login
- `POST /api/v1/users/logout` - User logout

### Inventory Management
- `GET /api/v1/items` - List all items (paginated)
- `POST /api/v1/items` - Add new item
- `PATCH /api/v1/items/:id/status` - Update item status
- `DELETE /api/v1/items/:id` - Delete item
- `POST /api/v1/items/bulk-operations` - Bulk operations

### Location Management
- `GET /api/v1/floors` - List floors
- `POST /api/v1/floors` - Create floor
- `GET /api/v1/rooms` - List rooms
- `POST /api/v1/rooms` - Create room

### Category Management
- `GET /api/v1/categories` - List categories
- `POST /api/v1/categories` - Create category

## 🔒 Security Features

- **Password Hashing** - bcrypt with salt rounds
- **JWT Authentication** - Secure token-based auth
- **Role-based Authorization** - Admin/User access control
- **Input Validation** - Comprehensive data validation
- **CORS Protection** - Configurable cross-origin policies

## 📝 Development

### Available Scripts
- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run tests (placeholder)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

---

*This IMS Backend provides a robust, scalable solution for educational institutions looking to modernize their inventory management processes and eliminate traditional paper-based tracking systems.* 