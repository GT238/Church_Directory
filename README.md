# Church Directory

A free, mobile-friendly phone directory. Search by name, filter by ministry group, tap a name to call. You maintain the data in a Google Sheet — the page updates automatically, no redeploy needed.

## 1. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. In row 1, add these exact column headers (order doesn't matter, spelling does):

   | First Name | Last Name | Phone | Email | Address | Ministry Group | Active |
   |---|---|---|---|---|---|---|

3. Fill in one row per person. For `Phone`, any format is fine (e.g. `555-123-4567`). `Email` and `Address` are both optional — leave blank if you'd rather not list them for someone.
4. For `Ministry Group`, separate multiple groups with a comma, e.g. `Choir, Youth Group`. Leave blank if none.
5. You can use this same field for any grouping you want to filter/text later, not just ministries — e.g. add `Men` or `Women` to that person's list of tags too: `Choir, Men`. No separate "Gender" column needed; it's just another tag.
6. `Active` is optional too. If you add the column at all, only rows that are checked (or `TRUE`) show up on the site — unchecked or blank rows are hidden, useful for someone who's moved away or shouldn't show up yet without deleting their row. In Google Sheets, select the column and use **Insert > Checkbox** to make it a tickable box. If you never add this column, everyone shows, same as today.

## 2. Publish the sheet as CSV

1. In the Sheet: **File > Share > Publish to web**.
2. Under "Link", choose the specific tab (not "Entire Document") and set the format to **Comma-separated values (.csv)**.
3. Click **Publish** and confirm.
4. Copy the URL it gives you — it looks like:
   `https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv`

> This makes the *data* publicly viewable (like an unlisted link), but the Sheet itself stays editable only by you unless you share edit access separately.

## 3. Connect the page to your sheet

1. Open `script.js`.
2. Replace `PASTE_YOUR_PUBLISHED_CSV_URL_HERE` with the URL you copied.
3. Save.

## 4. Put it on GitHub Pages (free hosting)

From this folder:

```
git init
git add index.html style.css script.js manifest.json README.md
git commit -m "Church directory"
git branch -M main
git remote add origin https://github.com/<your-username>/church-directory.git
git push -u origin main
```

Then on GitHub: **Settings > Pages > Source: Deploy from branch > main / (root)**. After a minute, your site is live at:

`https://<your-username>.github.io/church-directory/`

## 5. Share it with the congregation

Send that link out (bulletin, text, email, QR code). On a phone, opening the link and choosing **"Add to Home Screen"** (Safari share menu on iPhone, or the browser menu on Android) puts a real app icon on the home screen that opens full-screen, no browser bar — no app store involved.

The page also works offline once it's been opened at least once: it caches itself and the last-loaded directory data, so it still opens and shows the most recent info with no signal (e.g. in a church basement). It'll silently refresh to the latest data next time there's a connection.

## Group texting

Filter or search the directory to the people you want (e.g. select the "Men" or "Choir" group), then tap **"Text This Group (N)"**. This opens your phone's own Messages app with everyone's number already added as a recipient, in one shared group thread — you write the message and hit send from your own phone, no extra service or cost.

A few things to know:

- Everyone in that group text can see each other's phone number and any replies (it's one shared thread, not individual private texts). Fine for a small trusted congregation; keep that in mind for larger or sensitive groups.
- This uses the `sms:` link standard. It works reliably on iPhone. Most modern Android phones and messaging apps support it too, but behavior can vary slightly by phone/carrier — test it once with a small group before relying on it for something big.
- Very large groups (dozens of people) can be unwieldy as a single group thread and some carriers cap MMS group size. For big broadcasts, sending in smaller batches works better than one huge thread.
- The button reflects whatever is currently filtered/searched — clear the search and group filter and it'll target everyone with a phone number listed.

## Updating the directory

Just edit the Google Sheet. Changes appear on the site within a minute or two (Google's published CSV refreshes automatically) — no need to touch the code or redeploy.

## Notes

- No login is required to view the directory. Anyone with the link can see it — keep the link semi-private (don't post it publicly online) if that matters to your congregation.
- Only you can edit the Sheet, so only you can change entries. If you later want members to update their own info, that can be added on top of this same setup.
