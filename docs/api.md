# JMStar LIFF API

All endpoints are exposed as Frappe whitelisted methods under the namespace
`jmstar.jmstar.api.liff`. Call them via `/api/method/<method_path>`.

Unless otherwise noted, requests accept and return JSON. Provide the guardian's
`line_uid` in every request; during early testing you can supply the fixed UID
configured on the frontend.

## Authentication & Bootstrap

### `POST /api/method/jmstar.jmstar.api.liff.authenticate`

Creates or updates a guardian profile and returns initial data required by the
frontend. For local testing you can also issue a `GET` request with the query
parameter `mock=1` (no body needed); the endpoint will automatically use the
built-in test guardian (`TEST-LINE-UID-001`).

Request body:

```json
{
  "line_uid": "Uxxxxxxxx",
  "display_name": "Guardian Name",
  "avatar": "https://...",   // optional
  "phone": "",                // optional
  "email": "",                // optional
  "preferred_language": "th"  // optional
}
```

Response:

```json
{
  "guardian": { ... },
  "children": [ ... ],
  "activities": [ ... ]
}
```

## Child Management

### `POST /api/method/jmstar.jmstar.api.liff.save_child`

Creates or updates a child profile belonging to the guardian.

```json
{
  "line_uid": "Uxxxxxxxx",
  "child_id": "CHILD-0001",     // optional when creating new child
  "child_name": "เต็มชื่อ",
  "display_name": "ชื่อที่แสดง", // optional
  "nickname": "ชื่อเล่น",        // optional
  "date_of_birth": "2020-05-25", // optional
  "avatar": "https://...",       // optional
  "notes": "ข้อมูลเพิ่มเติม"      // optional
}
```

Response contains the saved child as `child`.

### `GET /api/method/jmstar.jmstar.api.liff.children`

Query parameters: `line_uid`

Returns `{ "children": [...] }`.

## Activity Management

### `GET /api/method/jmstar.jmstar.api.liff.activities`

Optional query parameter: `include_inactive=1`.

### `POST /api/method/jmstar.jmstar.api.liff.save_activity`

Creates or updates an activity template.

```json
{
  "line_uid": "Uxxxxxxxx",
  "activity_id": "ACT-0001",     // optional when creating
  "activity_name": "กิจกรรม",
  "category": "งานบ้าน",         // optional
  "default_star_value": 5,
  "is_active": 1,
  "description": "รายละเอียด",   // optional
  "color": "#FFAA00"              // optional
}
```

Response includes the saved `activity` object.

## Star Transactions

### `POST /api/method/jmstar.jmstar.api.liff.add_stars`

Creates an earn transaction.

```json
{
  "line_uid": "Uxxxxxxxx",
  "child": "CHILD-0001",
  "activity": "ACT-0001",   // optional; when provided and stars omitted, default is used
  "stars": 5,                // required when activity is blank
  "notes": "ทำกิจกรรมเพิ่ม"
}
```

Returns `entry` (ledger record) and updated `available_stars`.

### `POST /api/method/jmstar.jmstar.api.liff.redeem_stars`

Creates a redemption transaction (stars deducted automatically).

```json
{
  "line_uid": "Uxxxxxxxx",
  "child": "CHILD-0001",
  "stars": 10,
  "redemption_use": "รับของเล่น",
  "notes": "รายละเอียดเพิ่มเติม"
}
```

### `POST /api/method/jmstar.jmstar.api.liff.adjust_stars`

Manual adjustment for edge cases. `stars` can be positive or negative and will
update the available balance directly (no validation against negative results).

## Ledger History

### `GET /api/method/jmstar.jmstar.api.liff.history`

Query parameters: `line_uid`, `child`, optional `limit` (defaults to 30).

Returns `{ "entries": [...] }` with each entry containing:

```json
{
  "name": "STAR-ENTRY-00001",
  "posting_datetime": "2025-11-07 12:15:00",
  "transaction_type": "Earn",
  "activity": "ACT-0001",
  "activity_name": "ชื่อกิจกรรม",   // included when activity is present
  "stars": 5,
  "balance_after": 25,
  "notes": "",
  "redemption_use": ""
}
```

## Notes

- All insert/update operations run with `ignore_permissions=True` because LIFF
  traffic is unauthenticated. Restrict access using the LINE channel or API
  gateway in production.
- The ledger enforces guardian ownership, ensures sufficient balance for
  redemptions, and updates child totals automatically.
- Use the provided adjust endpoint sparingly; it bypasses balance validation.

