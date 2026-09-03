# BUYE IELTS

Static site + Google Sheets backend for BUYE IELTS (`ielts.buye.online`).

## Structure
```
index.html        homepage
login.html        login / register
dashboard.html    student dashboard (band scores, history)
admin.html        admin portal (add tests/questions, view analytics)
test.html         mock-test taking screen
assets/config.js  <- put your Apps Script Web App URL here
assets/app.css    shared styles
backend/code.gs   Apps Script backend (copy also lives in your Sheet)
```

## 1. Deploy the backend (one-time)
1. Open the Sheet: https://docs.google.com/spreadsheets/d/1u-WVtpNtIXuNGxbHYUTQiRazo7tZraeOF8_WPqmQg-I/edit
2. **Extensions → Apps Script**, paste in `backend/code.gs` as `Code.gs`.
3. Run `setupDatabase` once (Run ▶, pick that function). Approve permissions.
4. Edit the email/password inside `createFirstAdmin`, then run it once.
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the deployment URL.
7. Paste that URL into `assets/config.js` as `API_URL`.

Re-deploy (Deploy → Manage deployments → Edit → New version) any time you change `code.gs`.

## 2. Push this site to GitHub Pages (from VS Code)

Open this folder in VS Code, then in its terminal:

```bash
git init
git add .
git commit -m "BUYE IELTS site"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

Then on GitHub:
1. Repo → **Settings → Pages**
2. Source: **Deploy from a branch** → Branch: **main**, folder **/(root)**
3. Save. GitHub gives you a URL like `https://<your-username>.github.io/<repo-name>/`.

### Using your own domain (`ielts.buye.online`)
1. In the same **Settings → Pages** screen, under "Custom domain", enter `ielts.buye.online` and save — this adds a `CNAME` file to the repo automatically.
2. At your domain registrar (wherever `buye.online` is managed), add a **CNAME record**: host `ielts`, value `<your-username>.github.io`.
3. DNS can take up to a few hours to propagate. Once it does, check "Enforce HTTPS" back in the Pages settings.

## Notes
- Passwords are salted + SHA-256 hashed in the Sheet — never stored in plain text.
- Band scores are an estimate from a simple correct-answer percentage → band table in `scoreToBand_()` in code.gs — tune the table to match your own marking standards.
- `assets/config.js` is the only file that needs editing after deployment; every page reads from it.
