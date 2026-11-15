# Supabase repair migrations — English for Cricket

These SQL files repair the backend gaps found during the 2026-11-15
verification. They have **not** been run anywhere — they are files only,
for you to run when you're ready.

## How to run a file

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Open the `.sql` file (in this folder), copy its full contents, paste
   into the query editor.
3. Click **Run**. Watch for a success message; if there's an error, copy
   the error text and send it to Muse before running anything else.
4. Run the files **in number order** (000001 → 000008).

## Run order and what each file does

| # | File | Required? | What it changes, in plain language |
|---|------|-----------|-------------------------------------|
| 1 | `20261115000001_create_lesson_media.sql` | Required | Creates the missing `lesson_media` table (a registry of the images/audio uploaded for lesson slides) with safety rules: anyone can read, only the admin can add/change/delete. Also creates a small helper (`is_admin()`) that the other files use. |
| 2 | `20261115000002_create_assets.sql` | Required | Creates the missing `assets` table (a registry of uploaded site files, today the logo) with the same safety rules. |
| 3 | `20261115000003_signup_profile_trigger.sql` | Check first, then run if needed | Makes sure every new sign-up automatically gets their profile row, without which new users get a "Profile Error" at first login. **Do the 30-second check in the file's header first** (it looks up the test user below). Running it is harmless even if a trigger already exists — but if the check shows one exists under a different name, read the header notes before replacing anything. |
| 4 | `20261115000004_super_admin_rls.sql` | Required | Gives the admin (super_admin) account full powers — see, add, edit and delete **all** users, organisations, students and content. You confirmed on 2026-11-15 that the admin should have full powers; right now the admin can only see its own row, which is why the admin panel lists nobody. This only widens access for super_admin — managers, learners and the public keep exactly the access they have today. |
| 5 | `20261115000005_pin_hashing_OPTIONAL.sql` | **OPTIONAL — do not run** | A template for storing student PINs as real hashes instead of readable values. It is deliberately unfinished: the two student-login functions live only in the hosted database, so their real definitions must be pulled from the dashboard and edited (the file explains how) before this can run safely. Running it as-is would break student PIN login. Decide first whether you want it: after hashing, managers can **set** a student's PIN but can no longer **see/copy** an existing one. Students keep using the same PINs. |
| 6 | `20261115000006_lesson_completions.sql` | Required for Phase 1 | Creates the `lesson_completions` table the new Lesson Player writes to when a student finishes a lesson (score, time taken), with safety rules: students see their own completions, their manager sees their students', and the admin sees all. The player works without it (it just can't record yet), so run it when convenient — but ticks on the Learning Path only appear after it exists. |
| 7 | `20261115000007_fix_signup_trigger_role_cast.sql` | **Required — run ASAP** | Fixes file 3: the `role` column is an enum type, and file 3's trigger inserted plain text, which made **every new registration fail** with a database error. This file replaces the trigger's function with a version that casts the role properly. Run it, then test by registering a new account in the app. |
| 8 | `20261115000008_activity_and_stats.sql` | Required for Phase 2 | Three things: (1) a `log_activity` function so **PIN students' game/video playtime finally gets recorded** (until now only email learners' time was logged; the function checks the student exists and is active, the same trust model as student PIN login); (2) the sign-up trigger now also saves **country and region** into the new profile when the register form sends them; (3) a `get_admin_user_stats` function that gives the admin one row per learner — total time on the app, the game/video/lesson split, lessons completed, average accuracy, last active — and returns nothing to anyone who isn't the admin. The app keeps working if this file hasn't been run yet; recording for PIN students just stays off until it is. |

## One thing these files cannot do

Deleting a row from `user_profiles` / `sub_accounts` (covered by file 4)
is not the same as deleting a person's actual **login**. Removing an
auth account requires the Supabase dashboard (**Authentication → Users**)
or a future Edge Function with the service-role key. Until that step is
built, "delete user" in the admin panel removes their data, and the login
itself is removed by hand in the dashboard.

## Cleanup reminder

A throwaway account was created during testing:
**muse-test-20261115@mailinator.com** — please delete it in the Supabase
dashboard under **Authentication → Users**. (Its user id,
`52c981b8-44f7-42c9-8640-ed8cae55d2e9`, is also the id used in the file-3
check: look for that id in `user_profiles` *before* deleting the user —
if a profile row exists for it, the sign-up trigger already works.)
