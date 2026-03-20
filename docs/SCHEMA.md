# Database Schema

## Overview

Spyglass uses **SQLite** as its database — file-based, zero configuration.

## Tables

### Users

Stores user profile information.

```sql
CREATE TABLE Users (
  _id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  usage_count INTEGER DEFAULT 0,
  usage_reset_at BIGINT
);

CREATE UNIQUE INDEX idx_users_email ON Users(email);
```

---

### Auths

Stores authentication credentials separately from user data.

```sql
CREATE TABLE Auths (
  email TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  userID TEXT NOT NULL REFERENCES Users(_id)
);
```

---

## Field Descriptions

### Users Table

| Field | Type | Description |
|-------|------|-------------|
| `_id` | String (UUID) | Unique identifier |
| `email` | String | User's email (unique) |
| `name` | String | Display name |
| `created_at` | Unix timestamp | Account creation time |
| `usage_count` | Integer | Actions used this period |
| `usage_reset_at` | Unix timestamp | When usage counter resets |

### Auths Table

| Field | Type | Description |
|-------|------|-------------|
| `email` | String | User's email (primary key) |
| `password` | String | bcrypt hash (10 rounds) |
| `userID` | String | Reference to Users._id |

---

## Usage Tracking

Free users have a monthly usage limit (default: 20).

- `usage_count` - Incremented on each tracked action
- `usage_reset_at` - Set to 30 days after first action
- When `now > usage_reset_at`, counter resets to 0

---

## Database Configuration

Configuration in `backend/config.json`:

```json
{
  "database": {
    "db": "Spyglass",
    "dbType": "sqlite",
    "connectionString": "./databases/Spyglass.db"
  }
}
```

### Connection String

**SQLite:**
```
./databases/Spyglass.db
```

---

## Indexes

### Recommended Indexes

```sql
-- Users table
CREATE UNIQUE INDEX idx_users_email ON Users(email);

-- Auths table
CREATE INDEX idx_auths_userid ON Auths(userID);
```
