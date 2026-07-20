# CancerLINC Cloud Functions

Cloud Functions for the CancerLINC platform, written in TypeScript and deployed
to Firebase Cloud Functions (gen 2 / v2).

---

## Local development

```bash
cd functions
npm install
npm run build        # compile TypeScript → lib/
npm run serve        # build + start emulator (requires Firebase CLI)
```

---

## Configuration

### SUPERUSER_EMAIL param

The staff-provisioning callable functions (`createStaffAccount`,
`setStaffDisabled`, `deleteStaffAccount`) are restricted to a single superuser
identified by email address. This email is supplied via the
`SUPERUSER_EMAIL` Cloud Functions parameter — it is **never** hardcoded.

**Local emulator** — create `functions/.env` (git-ignored) with:

```
SUPERUSER_EMAIL=admin@your-domain.com
```

**Production / CI** — set the parameter before deploying:

```bash
# interactive prompt
firebase functions:params:set SUPERUSER_EMAIL=admin@your-domain.com

# or non-interactive (CI)
echo "SUPERUSER_EMAIL=admin@your-domain.com" | firebase functions:params:set --non-interactive
```

The value can also be managed in the Firebase console under
**Functions → Configuration → Parameters**.

> See also the root `.env.template` for a combined reference of all env
> variables required by this project.

---

## Staff-provisioning callable functions

All three functions require the caller to be authenticated as the superuser.
Call them from the web client using the Firebase Functions SDK:

```ts
import { getFunctions, httpsCallable } from "firebase/functions";
const functions = getFunctions();

// Create a new social-worker account
const createStaff = httpsCallable(functions, "createStaffAccount");
await createStaff({ email, firstName, lastName, displayName?, hospital? });

// Enable / disable an existing account
const setDisabled = httpsCallable(functions, "setStaffDisabled");
await setDisabled({ uid, disabled: true });

// Permanently delete an account
const deleteStaff = httpsCallable(functions, "deleteStaffAccount");
await deleteStaff({ uid });
```

---

## Email setup (ops)

Invite emails are sent via the Firebase **Trigger Email** extension, which
watches the `mail` collection and delivers messages through a configured SMTP
provider. The functions only write documents to `mail` — actual sending is
handled by the extension.

### Step 1 — Install the Trigger Email extension

1. In the Firebase console, go to **Extensions** and search for
   "Trigger Email from Firestore".
2. Install it and, when prompted:
    - **SMTP connection URI** — use a transactional provider such as SendGrid,
      Postmark, Mailgun, or AWS SES.
      Example (SendGrid): `smtps://apikey:<SENDGRID_API_KEY>@smtp.sendgrid.net:465`
    - **Email documents collection** — set to `mail` (must match the collection
      the functions write to).
    - **Default FROM address** — `CancerLINC <noreply@your-domain.com>` (use the
      domain for which you configure SPF/DKIM/DMARC below).

### Step 2 — Configure a verified sender identity

With SendGrid: create a **Sender** or verify a **Domain** at
`https://app.sendgrid.com/settings/sender_auth`.

With Postmark: create a **Sender Signature** or verify a **Domain** in the
Postmark dashboard.

### Step 3 — Add DNS records for deliverability

Add the following DNS records to the sending domain's zone file. Your
transactional provider will supply the exact values.

| Type  | Name / Host       | Purpose                                 |
| ----- | ----------------- | --------------------------------------- |
| TXT   | `@` or subdomain  | SPF — authorizes your SMTP provider     |
| CNAME | provider-supplied | DKIM — signs outbound mail              |
| TXT   | `_dmarc`          | DMARC — policy for unauthenticated mail |

Recommended minimum DMARC policy to start:

```
v=DMARC1; p=none; rua=mailto:dmarc-reports@your-domain.com
```

Tighten to `p=quarantine` then `p=reject` once you confirm legitimate mail
passes.

### Step 4 — Test delivery

After DNS propagation (allow up to 48 hours):

1. Trigger a test `createStaffAccount` call with a **Gmail** address and an
   **Outlook / Hotmail** address.
2. Check both inboxes **and** spam / junk folders.
3. Verify the "Set My Password" link works.
4. Confirm DKIM and SPF pass using [mail-tester.com](https://www.mail-tester.com)
   or [MXToolbox Email Header Analyzer](https://mxtoolbox.com/EmailHeaders.aspx).
5. If messages land in spam, review the DMARC reports and check that the FROM
   domain matches the verified sender identity.

> **Recipient action required** — the invite email instructs new staff to mark
> the sender as "Not Junk" / add to safe-senders on first receipt. This is
> especially important for Microsoft 365 / Outlook users.
