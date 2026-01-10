# ========================================
# Cloudflare Pages Configuration Guide
# ========================================

## STEP 1: Create Pages Projects (if not already created)

### For lexicore (Development)
1. Go to Cloudflare Dashboard → Pages
2. Click "Create a project"
3. Connect GitHub repo: `achar717/lexicore-enterprise`
4. Project name: `lexicore`
5. Production branch: `main`
6. Build configuration:
   - Framework preset: `Next.js`
   - Build command: `cd frontend && npm run pages:build`
   - Build output directory: `frontend/.vercel/output/static`
   - Root directory: (leave empty)
7. Click "Save and Deploy"

### For lexicore1 (Staging)
Repeat the same steps but use project name: `lexicore1`

---

## STEP 2: Configure Bindings

### For BOTH Projects (lexicore + lexicore1):

#### A. D1 Database Binding
1. Go to Project Settings → Functions
2. Scroll to "D1 database bindings"
3. Click "Add binding"
4. Variable name: `DB`
5. D1 database: Select your existing `lexicore-production` database
   - If you don't have it yet, create one:
     - Go to Workers & Pages → D1
     - Create database: `lexicore-production`
     - Run migrations from `/home/user/lexicore/migrations/0430_ocr_system.sql`
6. Click "Save"

#### B. R2 Bucket Binding
1. In the same Functions settings page
2. Scroll to "R2 bucket bindings"
3. Click "Add binding"
4. Variable name: `R2_BUCKET`
5. R2 bucket: Select your existing bucket or create new:
   - If creating new:
     - Go to R2 → Create bucket
     - Bucket name: `lexicore-uploads`
     - Location: Automatic
6. Click "Save"

#### C. Environment Variables (Optional)
1. Go to Project Settings → Environment variables
2. Add these variables for AI features:
   - `OPENAI_API_KEY` = `sk-...` (your OpenAI key)
   - `GEMINI_API_KEY` = `...` (your Gemini key)
3. Click "Save"

---

## STEP 3: Deploy

### Option A: Auto-deploy on Git push
- Push to `main` branch
- Cloudflare will auto-build and deploy

### Option B: Manual deploy via Wrangler
```bash
cd frontend
npm install
npm run pages:build
npx wrangler pages deploy .vercel/output/static --project-name lexicore
npx wrangler pages deploy .vercel/output/static --project-name lexicore1
```

---

## STEP 4: Verify Deployment

After deployment completes:

### lexicore (Development)
- URL: `https://lexicore.pages.dev`
- Test endpoints:
  - `https://lexicore.pages.dev/` (home page)
  - `https://lexicore.pages.dev/api/jobs` (create job)
  - `https://lexicore.pages.dev/api/job/test123` (get job)

### lexicore1 (Staging)
- URL: `https://lexicore1.pages.dev`
- Same endpoints as above

---

## STEP 5: Custom Domains (Optional)

### For lexicore
1. Go to Project Settings → Custom domains
2. Click "Set up a custom domain"
3. Enter: `dev.lexicore.com` (or your domain)
4. Follow DNS instructions

### For lexicore1
- Enter: `staging.lexicore.com` (or your domain)

---

## Required Bindings Summary

| Binding Type | Variable Name | Resource Name | Both Projects |
|--------------|---------------|---------------|---------------|
| D1 Database  | `DB`          | `lexicore-production` | ✅ |
| R2 Bucket    | `R2_BUCKET`   | `lexicore-uploads` | ✅ |
| Env Var      | `OPENAI_API_KEY` | (your key) | Optional |
| Env Var      | `GEMINI_API_KEY` | (your key) | Optional |

---

## Compatibility Flags

✅ **nodejs_compat is REQUIRED**

Add this in Project Settings → Functions → Compatibility flags:
- Compatibility flag: `nodejs_compat`
- Click "Save"

This is needed for:
- Next.js App Router
- Node.js APIs in Pages Functions
- D1 database queries

---

## Troubleshooting

### Build fails with "Cannot find module 'next'"
- Ensure `cd frontend` in build command
- Verify `package.json` is in `frontend/` directory

### API endpoints return 404
- Check Functions are deployed (look for `_worker.js` in deployment logs)
- Verify bindings are configured correctly

### "DB is not defined" error
- Add D1 binding with variable name `DB`
- Redeploy project

### R2 upload fails
- Add R2 binding with variable name `R2_BUCKET`
- Verify bucket permissions

---

## Production URLs (After Deployment)

- **lexicore**: https://lexicore.pages.dev
- **lexicore1**: https://lexicore1.pages.dev

---

## Next Steps

1. Push code to GitHub
2. Configure bindings in Cloudflare Dashboard
3. Wait for auto-deploy or run manual deploy
4. Test all API endpoints
5. Set up custom domains (optional)
