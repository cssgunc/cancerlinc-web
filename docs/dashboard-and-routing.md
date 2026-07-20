# Dashboard & Routing — Implementation Notes

This document covers the work done to connect the patient dashboard to Firebase, set up scalable data loading, wire up profile navigation, and add a shared top bar across routes.

---

## Table of Contents

1. [Overview of Changes](#overview-of-changes)
2. [Firebase Schema](#firebase-schema)
3. [Dashboard — Data Loading](#dashboard--data-loading)
4. [Search](#search)
5. [Pagination](#pagination)
6. [Stat Cards](#stat-cards)
7. [Profile Navigation](#profile-navigation)
8. [Shared Layout & Top Bar](#shared-layout--top-bar)
9. [Firestore Security Rules](#firestore-security-rules)
10. [Seed Script](#seed-script)
11. [Known Limitations](#known-limitations)

---

## Overview of Changes

| File                        | What changed                                                          |
| --------------------------- | --------------------------------------------------------------------- |
| `app/routes.ts`             | Added `app_layout` as a wrapping route                                |
| `app/routes/app_layout.tsx` | New — shared top bar rendered on all protected pages                  |
| `app/routes/_index.tsx`     | Replaced fake data with Firestore queries; removed sort feature       |
| `app/routes/member.tsx`     | Removed outer page shell (now owned by layout)                        |
| `firebase/firestore.rules`  | Added `isStaff()` so social workers/admins can read all user profiles |
| `scripts/seed-patients.mjs` | New — populates Firestore with fake patients for development          |
| `.gitignore`                | Added `scripts/service-account.json`                                  |

---

## Firebase Schema

### `users` collection

Each document ID matches the user's Firebase Auth `uid`.

```
uid                     String   — matches document ID
email                   String
firstName               String
lastName                String
lastNameLower           String   — lowercase copy of lastName, used for case-insensitive search
role                    String   — "patient" | "social_worker" | "admin"
isVerified              Boolean
isBanned                Boolean  — optional; true once a patient is denied by staff
disabled                Boolean  — optional; mirrors Firebase Auth disabled flag, set by Cloud Function
phoneNumber             String
hospital                String   — optional, relevant for social workers
profilePhotoUrl         String
status                  String   — "active" | "follow-up" | "pending"  (patients only)
assignedSocialWorkerId  String   — uid of the assigned social worker   (patients only)
assignedSocialWorkerName String  — denormalized name of the social worker (patients only)
lastContactTimestamp    Timestamp — updated whenever a new message is sent (patients only)
createdAt               Timestamp
updatedAt               Timestamp
```

**Why denormalize `assignedSocialWorkerName` and `lastContactTimestamp`?**

The dashboard table needs to display the social worker's name and the last contact date for each patient. Without denormalization, each page load would require N extra Firestore reads to look up those values (one per patient). Storing them directly on the patient document means the dashboard only needs a single paginated query.

The tradeoff is that these fields must be kept in sync when they change — `assignedSocialWorkerName` when a patient is reassigned, and `lastContactTimestamp` whenever a new chat message is sent.

**Why `lastNameLower`?**

Firestore range queries (`>=`, `<`) are case-sensitive. Storing a pre-lowercased copy of `lastName` allows the prefix search to work regardless of how the name was originally capitalized. See [Search](#search) for details.

### Composite indexes required

Firestore requires a composite index for any query that filters on one field and orders by a different field, or filters on two or more fields simultaneously.

| Fields                        | Used by                 |
| ----------------------------- | ----------------------- |
| `role ASC, lastName ASC`      | Default paginated list  |
| `role ASC, lastNameLower ASC` | Prefix search           |
| `role ASC, status ASC`        | Stat card count queries |

This is 3 composite indexes total — well within Firestore's limit of 200 per database.

---

## Dashboard — Data Loading

**File:** `app/routes/_index.tsx`

The dashboard fetches patients from the `users` collection, filtered to `role === "patient"`. It runs three parallel queries on mount:

1. **Paginated patient list** — the main table data
2. **Stat card counts** — three `getCountFromServer` aggregation queries (total, active, follow-up)

These are intentionally separate. The stat card counts reflect the entire database, not just the current page, so they cannot be derived from the paginated results.

Loading, error, and empty states are all handled with inline feedback in the table body.

---

## Search

Search is implemented as a **Firestore prefix range query** on the `lastNameLower` field.

When the user types a query, the following Firestore constraints are added:

```ts
where("lastNameLower", ">=", query);
where("lastNameLower", "<", nextPrefix);
orderBy("lastNameLower");
```

`nextPrefix` is computed by incrementing the last character of the query string — for example, `"smi"` becomes `"smj"`. This creates a range that matches every string starting with `"smi"`.

**Debouncing:** The search input is debounced by 300ms before firing a Firestore query, to avoid sending a request on every keystroke.

**Search state lives in the URL:** The `?q=` query parameter is used instead of local React state. This means:

- Navigating back from a member page restores the previous search automatically
- The URL is shareable/bookmarkable with the search pre-filled

The search input is rendered in the shared `app_layout.tsx` top bar. On the index page it updates `?q=` in place via `useSearchParams`. On the member page it navigates to `/?q=term`.

### Known limitation — first names

Search currently only matches last names. Typing "David" will not find "David Thompson" because the query runs against `lastNameLower`, not `firstNameLower` or a combined full-name field. To support first-name and full-name search, a `fullNameLower` field (e.g. `"david thompson"`) would need to be stored on each user document and queried instead.

---

## Pagination

Pagination uses **Firestore cursor-based pagination** (`startAfter`), not offset-based pagination. This is the correct approach for Firestore — offset pagination would require reading and discarding all preceding documents on every page load, which is both slow and expensive.

**Page size:** 50 patients per page.

**How cursors work:**

- Each page's last document snapshot is stored in a `cursorStack` ref array
- "Next" advances the page index; the query uses `startAfter(cursorStack[page - 1])`
- "Previous" decrements the page index; the cursor for that page is already in the stack
- Changing the search query clears the cursor stack and resets to page 0

**Detecting end of results:**

The query always fetches `PAGE_SIZE + 1` documents. If 51 results come back, there is a next page and the 51st document is discarded. If 50 or fewer come back, the "Next" button is disabled.

**Pagination bar visibility:**

The pagination bar is only rendered when `totalCount > PAGE_SIZE`. If there are 50 or fewer patients, no pagination controls appear.

---

## Stat Cards

The three stat cards (Total Patients, Active Cases, Follow-ups Needed) use Firestore's `getCountFromServer()` aggregation API. These queries return a count without reading individual documents, so they are billed as a single read each regardless of how many documents match.

```ts
getCountFromServer(query(usersRef, where("role", "==", "patient")));
getCountFromServer(
    query(
        usersRef,
        where("role", "==", "patient"),
        where("status", "==", "active")
    )
);
getCountFromServer(
    query(
        usersRef,
        where("role", "==", "patient"),
        where("status", "==", "follow-up")
    )
);
```

These run once on mount, independently of the paginated table. The stat cards show a spinner until the counts resolve.

---

## Profile Navigation

"View Profile" buttons and patient name buttons in the table both call:

```ts
navigate(`/member/${encodeURIComponent(patientId)}`);
```

The `patientId` is the Firestore document ID, which matches the user's Firebase Auth `uid`. The member page at `/member/:user` decodes this and uses it to load the correct user profile and chat.

---

## Shared Layout & Top Bar

**File:** `app/routes/app_layout.tsx`

Both `_index` and `member/:user` are nested under a shared `app_layout` route. The layout renders the top bar once and uses `<Outlet />` for the page content.

```
require_auth
  └── app_layout          ← renders top bar + <Outlet />
      ├── _index
      └── member/:user
```

**Top bar elements:**

| Element          | Index page             | Member page              |
| ---------------- | ---------------------- | ------------------------ |
| Back button      | Hidden                 | Shown — navigates to `/` |
| Logo             | Shown                  | Shown                    |
| Search bar       | Updates `?q=` in place | Navigates to `/?q=term`  |
| Welcome / Logout | Shown                  | Shown                    |

The back button is conditionally rendered using `useMatch("/member/:user")`.

---

## Firestore Security Rules

**File:** `firebase/firestore.rules`

An `isStaff()` helper function was added:

```js
function isStaff() {
  return signedIn()
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
       in ["social_worker", "admin"];
}
```

This is included in the `canReadUserProfile()` function so that social workers and admins can read any user's profile document. Without this, the dashboard's paginated query would be blocked by security rules — the existing rule only permitted reading profiles if you were that user or shared a chat with them.

---

## Seed Script

**File:** `scripts/seed-patients.mjs`

A Node.js script that populates Firestore with fake data for development and testing. Uses the Firebase Admin SDK, which bypasses security rules and is suitable for server-side scripts.

### Setup

1. Download a service account key from **Firebase Console → Project Settings → Service Accounts → Generate New Private Key**
2. Save it as `scripts/service-account.json` (this path is gitignored)
3. Run:

```bash
node scripts/seed-patients.mjs
```

### Configuration

Edit the constants at the top of the file:

```js
const PATIENT_COUNT = 120; // number of patients to create
const WORKER_COUNT = 6; // number of social workers to create
const CLEAR_FIRST = false; // if true, deletes existing patients/social workers first
```

### What it creates

- Social worker documents in `users` with `role: "social_worker"`
- Patient documents in `users` with `role: "patient"`, including all denormalized fields:
    - `status` — randomly weighted toward "active"
    - `assignedSocialWorkerId` / `assignedSocialWorkerName` — randomly assigned from the created workers
    - `lastContactTimestamp` — random date within the past 60 days
    - `lastNameLower` — lowercase copy of `lastName` for search

Social worker documents created by the seed script do not have corresponding Firebase Auth accounts. They exist solely as Firestore records for the dashboard to reference.

---

## Known Limitations

| Limitation                                      | Details                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search matches last name only                   | Typing a first name returns no results. A `fullNameLower` field would be needed to support full-name search.                                                                                                                                                                     |
| Search is prefix-only                           | "ith" will not find "Smith". Only matches from the start of the last name. True substring search requires an external service (e.g. Algolia).                                                                                                                                    |
| Sort removed                                    | Column headers are not sortable. Client-side sort was removed because it only applied to the current page (50 records), which was misleading. Server-side sort via Firestore `orderBy` is possible but requires additional composite indexes and a query rebuild on sort change. |
| `lastContactTimestamp` requires manual sync     | This field on patient documents must be updated by the application whenever a new chat message is sent. It is not automatically derived from the `chats` collection.                                                                                                             |
| `assignedSocialWorkerName` requires manual sync | If a social worker's name changes, all patient documents referencing them must be updated.                                                                                                                                                                                       |
