# Krishi Sahayata – Project Guide

This guide explains the project in plain language so you can understand every part, change it with confidence, and explain it in an interview. Read it top to bottom once, then use it as a reference.

---

## 1. The big picture

There are two programs:

1. **The server** (`server/`) – a Node.js + Express app. It owns the data (MongoDB), checks who is logged in, enforces the rules, talks to Twilio (SMS) and Open-Meteo (weather), and answers requests with JSON.
2. **The client** (`client/`) – a React app that runs in the browser. It shows pages and forms, and calls the server with Axios.

In development they run separately (React on port 5173, API on port 5000; Vite forwards `/api/...` calls to port 5000). In production the server can also serve the built React files, so the whole thing runs as one service.

**Three kinds of users**

| Role | Logs in with | Can do |
| --- | --- | --- |
| Farmer | Mobile number + OTP | File claims, see only their own claims, set farm location and language |
| Field officer | Email + password | See claims assigned to them (and unassigned ones in their district), move them through the stages, run weather checks |
| Admin | Email + password | Everything: all claims, disburse payments, reassign officers, create staff, see analytics |

---

## 2. What happens when… (follow the code)

### A farmer registers

1. `client/src/pages/Register.jsx` → `POST /api/auth/otp/request` with `purpose: "register"`.
2. `server/src/routes/auth.routes.js` checks the input (express-validator), then `auth.controller.js → requestOtp`.
3. The phone is normalised to `+91XXXXXXXXXX` (`utils/phone.js`). If the number is already registered, it answers 409.
4. `services/otp.service.js` makes a random 6-digit code with `crypto.randomInt`, stores only a **bcrypt hash** of it in the `otps` collection with an expiry time, and sends it with `services/sms.service.js`.
5. MongoDB deletes expired OTPs by itself thanks to a **TTL index** on `expiresAt` (`models/Otp.js`).
6. The farmer types the code → `POST /api/auth/otp/verify` → the hash is compared, attempts are counted (max 5), and on success the user is created and a **JWT** is returned.
7. The React app stores the token (`client/src/api.js`) and every later request sends `Authorization: Bearer <token>`.

### A farmer files a claim

1. `pages/farmer/NewClaim.jsx` is a 4-step form. Each step is checked in the browser before moving on.
2. On submit it sends **multipart/form-data** (because of the photos) to `POST /api/claims`.
3. In `routes/claims.routes.js` the request passes through, in order:
   - `requireAuth` + `requireRole('farmer')` – who are you, are you allowed?
   - `parsePhotos` (multer) – reads up to 3 photos into memory, max 2 MB each
   - `createRules` + `validate` – checks every field (IFSC format, loss date within 30 days, …)
   - `storePhotos` – checks the file really is an image (first bytes), saves it to **GridFS**
   - `createClaim` – builds the claim
4. `controllers/claims.controller.js → createClaim`:
   - gets the next claim number from an atomic counter (`models/Counter.js`)
   - picks the officer in that district with the fewest open claims (`services/assignment.service.js`)
   - saves the claim with the first timeline entry
   - sends the "claim received" SMS (`services/claimNotifications.js`)
   - starts the **weather check in the background** so the farmer doesn't wait.

### The weather check runs

`services/weatherCheck.service.js`:

1. Works out which dates to look at (`requiredRange` in `weatherScoring.js`), e.g. 30 days before the loss for drought.
2. Calls Open-Meteo through `services/weather.service.js`. Dates older than ~6 days come from the **archive** API; recent dates come from the **forecast** API's `past_days`. Responses are cached in MongoDB (`WeatherCache`, TTL index).
3. `weatherScoring.js → scoreClaimWeather` applies the rule for that cause and returns `{ score, verdict, reasons, metrics }`. This file does only maths, which is why it is easy to unit test.
4. The result is saved on the claim; officers see it on the claim page and can filter by it.

### An officer approves a claim

1. `pages/ClaimDetail.jsx → ActionsCard` → `PATCH /api/claims/:id/status` with `{ to: "approved", amountApproved }`.
2. `claims.controller.js → updateStatus` → `services/claimWorkflow.js → applyTransition`, which checks:
   - is `approved` allowed after the current status? (`TRANSITIONS` table)
   - is this role allowed? (only admins can `disbursed`)
   - is the claim assigned to this officer?
   - is the amount valid (not more than claimed)? Is there a reason when rejecting?
3. If all good: status changes, a timeline entry is added, and the farmer gets an SMS in their language.

### The daily weather alert

`jobs/weatherAlerts.js` is scheduled with **node-cron** at 6 AM IST (`WEATHER_ALERT_CRON`). It groups farmers by location, fetches the 2-day forecast once per location, and sends at most one SMS per farmer per day if heavy rain (≥ 64.5 mm), extreme heat (≥ 45 °C) or strong wind (≥ 62 km/h) is expected. Admins can run it on demand from the Analytics page.

---

## 3. Server files, one line each

| File | What it does |
| --- | --- |
| `src/index.js` | Connects to MongoDB, schedules the cron job, starts listening |
| `src/app.js` | Creates the Express app: security headers (helmet), CORS, JSON parsing, routes, error handler, serves the React build if present |
| `src/config/env.js` | Reads `.env` in one place and applies defaults |
| `src/config/db.js` | Connects Mongoose |
| `src/constants.js` | Fixed lists: roles, causes of loss, seasons, languages |
| `src/models/User.js` | Farmers and staff; password hashing helpers |
| `src/models/Claim.js` | The claim: crop, loss, location, bank, photos, status, timeline, weather check, AI summary; `isOverdue` virtual |
| `src/models/Otp.js` | Hashed OTP codes with automatic expiry |
| `src/models/Notification.js` | Log of every SMS attempt |
| `src/models/Counter.js` | Atomic sequence for claim numbers |
| `src/models/WeatherCache.js` | Cached Open-Meteo responses with automatic expiry |
| `src/middleware/auth.js` | `signToken`, `requireAuth`, `requireRole` |
| `src/middleware/validate.js` | Turns express-validator errors into a 400 response |
| `src/middleware/upload.js` | multer config, image type check, save to GridFS |
| `src/middleware/rateLimit.js` | Limits for OTP, login and public endpoints |
| `src/middleware/error.js` | 404 handler and the central error handler |
| `src/utils/ApiError.js` | Error class with HTTP status + code |
| `src/utils/phone.js` | Normalises Indian mobile numbers |
| `src/services/claimWorkflow.js` | **The state machine** – statuses, allowed moves, permission checks |
| `src/services/claimNotifications.js` | English/Hindi SMS text for each status |
| `src/services/assignment.service.js` | Picks the least-busy officer in the district |
| `src/services/sms.service.js` | Twilio sending with retries; logs to `Notification` |
| `src/services/otp.service.js` | Create / verify OTPs |
| `src/services/storage.service.js` | GridFS save / read / delete |
| `src/services/weather.service.js` | Open-Meteo calls (history, forecast, geocoding) + caching |
| `src/services/weatherScoring.js` | **The weather check rules** (pure functions) |
| `src/services/weatherCheck.service.js` | Fetch → score → save on the claim |
| `src/services/analytics.service.js` | Aggregation pipelines for the dashboard |
| `src/services/ai.service.js` | Groq → Gemini fallback summary |
| `src/jobs/weatherAlerts.js` | Daily forecast alerts |
| `src/routes/*.routes.js` | URL + validation rules for each area |
| `src/controllers/*.controller.js` | Request handlers |
| `src/scripts/seed.js` | Demo data |

## 4. Client files, one line each

| File | What it does |
| --- | --- |
| `src/main.jsx` | Starts React with the router, translations and auth context |
| `src/App.jsx` | All page routes; protected routes by role; lazy-loads Analytics |
| `src/api.js` | Axios instance: base URL, adds the token, handles expired sessions, error helpers |
| `src/i18n.js` + `src/locales/*.json` | English and Hindi text |
| `src/context/AuthContext.jsx` | Who is logged in; `login` / `logout` |
| `src/components/ProtectedRoute.jsx` | Redirects if not logged in or wrong role |
| `src/components/Navbar.jsx`, `LanguageSwitch.jsx` | Top bar and EN / हिं toggle |
| `src/components/OtpForm.jsx` | Enter-OTP step with resend timer |
| `src/components/PlacePicker.jsx` | GPS button + place search (debounced) |
| `src/components/WeatherWidget.jsx` | 7-day forecast cards |
| `src/components/SecureImage.jsx` | Loads a photo with the token and shows it as a blob URL |
| `src/components/Badges.jsx`, `Timeline.jsx`, `Field.jsx`, `Pagination.jsx` | Small reusable pieces |
| `src/pages/...` | One file per page |

---

## 5. Key ideas you should be able to explain

- **JWT (JSON Web Token)** – after login the server signs `{ user id, role }` with `JWT_SECRET`. The browser sends it back on every request; the server checks the signature, so it doesn't need to store sessions. The server still loads the user from the database on each request, so a deactivated account stops working immediately.
- **Why hash OTPs** – if the database leaked, the attacker still couldn't read active codes. Same idea as passwords.
- **State machine** – a fixed table of allowed moves between statuses. It stops invalid actions (e.g. paying a rejected claim) in one central place instead of `if` checks scattered around the code.
- **TTL index** – a MongoDB index that deletes documents automatically when a date field passes. Used for OTPs and the weather cache.
- **GridFS** – MongoDB's way of storing files larger than a document by splitting them into chunks. Used here so no paid file storage is needed.
- **Aggregation pipeline** – a list of steps MongoDB runs on the server side: `$match` (filter) → `$group` (count / sum) → `$sort`. Faster than loading every claim into Node.
- **Indexes** – `Claim` has indexes on the fields the dashboards filter by (`assignedOfficer + status`, `location.district + status`, …) so queries stay fast as data grows.
- **Validation on both sides** – the browser checks for quick feedback; the server checks again because anyone can call the API directly.
- **Rate limiting** – stops someone spamming OTP SMS (which cost money) or guessing claim numbers.
- **Background work** – the weather check runs after the response is sent (`setImmediate`), so filing a claim stays fast even if Open-Meteo is slow.
- **Graceful degradation** – no Twilio keys → SMS printed in the terminal; Open-Meteo down → claim saved, check marked "failed" and can be re-run; no AI key → feature hidden.

---

## 6. Things I could not verify while building (please check on your laptop)

The code was built and tested in a cloud workspace with two restrictions:

1. **No real MongoDB could be downloaded there.** Tests ran against a MongoDB-compatible server (FerretDB). 79 of 81 tests passed there. The 2 analytics tests fail on FerretDB only because it doesn't support `$cond`, `$dateToString` and `$avg`. Their queries were checked separately with a JavaScript MongoDB-query engine (mingo) and gave the expected numbers. **Run `npm test` in `server/`** – it uses a real in-memory MongoDB and all 81 should pass.
2. **Open-Meteo was blocked there.** The weather code follows the official API docs and is tested with fake data. **Run `npm run seed`** (it runs real weather checks) and open a claim as an officer to see real results.

Twilio and Groq/Gemini have not been called with real keys either; they follow each provider's documented API.

---

## 7. Interview questions you can expect

**Why MongoDB and not MySQL here?**
Claims have nested, uneven data: a timeline array, photo list, weather metrics that differ per cause. A document fits that naturally. MongoDB also gave TTL indexes (OTP expiry, cache), GridFS (photos) and aggregation pipelines (analytics) without extra services.

**How do you stop a farmer from seeing another farmer's claim?**
`scopeFilter` in `claims.controller.js` adds `{ farmer: user._id }` to every list query, and `canView` is checked on single-claim and photo requests. It returns 404, not 403, so ids can't be probed.

**What if two claims are filed at the same moment – can they get the same number?**
No. `Counter.findOneAndUpdate` with `$inc` is atomic in MongoDB.

**How does the weather check work? Isn't it unreliable?**
Explain the window + rule per cause + IMD thresholds, and be honest about limitations: fixed thresholds, grid-cell data, no hail data for India. That's why it only assists the officer and never auto-rejects.

**What happens if Twilio is down?**
The status change is still saved. `sendSms` retries twice with backoff (except for permanent errors like an invalid number), logs the failure in `notifications`, and officers can see it in the SMS log.

**How would you scale this?**
Move background work (weather checks, SMS) to a job queue; put photos in object storage; add pagination everywhere (already done for staff); add read replicas. Mention you kept it simple on purpose because of free-tier hosting.

**Where are the security measures?**
helmet headers, CORS allowlist, rate limits, bcrypt for passwords and OTPs, JWT expiry, input validation on every route, file type checks by magic bytes, bank account number never returned, and secrets only in `.env` (gitignored).

**What did you test?**
Pure logic with unit tests (state machine, scoring, alerts, phone parsing) and API behaviour with Supertest against an in-memory MongoDB, with Open-Meteo mocked.

---

## 8. How to change common things

| I want to… | Change |
| --- | --- |
| Add a status | `STATUS` + `TRANSITIONS` in `services/claimWorkflow.js`, SMS text in `claimNotifications.js`, `NEXT_STATUSES` in `client/src/constants.js`, labels in both locale files |
| Change weather rules | `RULES` in `services/weatherScoring.js`, then update `tests/unit/weatherScoring.test.js` |
| Change overdue days | `SLA_DAYS` in `.env` |
| Add a translation | Same key in `client/src/locales/en.json` and `hi.json` |
| Add a cause of loss | `CAUSES_OF_LOSS` in `server/src/constants.js`, `CAUSES` in `client/src/constants.js`, labels in locale files |
