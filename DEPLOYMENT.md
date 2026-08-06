# Deployment Guide

PortfolioGen can be deployed to multiple platforms. Here are your options:

---

## Option 1: Railway.app (Recommended)

Railway is the simplest option for deploying PortfolioGen. It's designed for Node.js applications like this one.

### Setup Steps:

1. Go to [railway.app](https://railway.app) and sign up (free tier available)
2. Create a new project
3. Connect your GitHub repository
4. Railway will automatically detect the Node.js app
5. Add environment variables in the Railway dashboard:
   - `GEMINI_API_KEY`: Your Google Gemini API key
   - `NODE_ENV`: Set to `production`
6. Deploy! Railway runs `npm run build` and then `npm start`

**Cost**: Free tier includes $5/month; most hobby projects fit free tier.  
**Uptime**: Good for small-to-medium traffic.  
**Bandwidth for portfolios**: Generated portfolios are files served from the same app, so bandwidth is included.

---

## Option 2: Render.com

Similar to Railway, Render is a good alternative.

### Setup Steps:

1. Go to [render.com](https://render.com) and sign up
2. Create a new "Web Service"
3. Connect your GitHub repo
4. Set build command: `npm run build`
5. Set start command: `npm start`
6. Add environment variables:
   - `GEMINI_API_KEY`: Your API key
   - `NODE_ENV`: `production`
7. Deploy

**Cost**: Free tier has limitations; paid plans start at $7/month.  
**Uptime**: Spins down after 15 minutes of inactivity on free tier.

---

## Option 3: Fly.io

Fly.io offers more control and better global performance.

### Setup Steps:

1. Install the Fly CLI: `brew install flyctl` (Mac) or `curl -L https://fly.io/install.sh | sh` (Linux)
2. Go to [fly.io](https://fly.io) and sign up
3. In your repo root, run: `flyctl launch`
4. Follow prompts (use Node.js 22.x runtime)
5. Set environment variables:
   ```bash
   flyctl secrets set GEMINI_API_KEY=YOUR_KEY
   ```
6. Deploy: `flyctl deploy`

**Cost**: Free tier includes 3 shared-cpu-1x 256MB VMs; adequate for hobby use.  
**Uptime**: Always-on, even on free tier.

---

## Option 4: Netlify Functions + AWS S3 (Advanced)

If you want to keep generated portfolios separate from the chat app:

1. Deploy the chat app to Netlify Functions (requires refactoring the Express API)
2. Store generated portfolios in S3 or Netlify's built-in asset handling
3. Portfolios are accessed via direct links

**Complexity**: High; requires restructuring the API layer.

---

## Generated Portfolio Hosting

### Current Approach (Recommended)

The generated portfolios live on the **same server** as the chat app. When a user completes the build:
- Files are saved in the session's output directory
- They're served via `/api/session/:id/preview/:filename`
- User downloads via `/api/session/:id/download/:filename`
- User exports ZIP via `/api/session/:id/export`

**Advantage**: Simple, no extra infrastructure.  
**Downside**: Server storage fills up over time; you'll want to implement session cleanup (e.g., delete sessions older than 30 days).

### Alternative: External Storage

For production at scale, consider:
- **S3/CloudFront**: Serve generated portfolios from S3, linked from the chat app
- **Cloudinary/Imgix**: For image optimization
- **Bunny CDN**: Cheap CDN for portfolio files

---

## Environment Variables

Create a `.env` file locally (copy from `.env.example`):

```bash
GEMINI_API_KEY="your-google-gemini-api-key"
APP_URL="https://your-app.railway.app"  # Set after deployment
PORT=3000  # Only needed locally; platforms override this
```

On the deployed platform, set these via the dashboard:
- Railway: "Variables" section in project settings
- Render: "Environment" tab
- Fly: `flyctl secrets set KEY=value`

---

## Post-Deployment Tasks

After deploying, you should:

1. **Add a custom domain** (optional but recommended)
   - Railway: Projects → Settings → Custom Domain
   - Render: Environment → Custom Domain
   - Fly: `flyctl certs create yourdomain.com`

2. **Set up monitoring** (optional)
   - Most platforms include basic logs and metrics
   - Monitor for `GEMINI_API_KEY not set` warnings

3. **Implement session cleanup** (important for long-term operation)
   - Add a cron job that deletes sessions older than 30 days
   - Or implement manual cleanup in the UI

4. **Backup consideration**
   - Sessions are stored in-memory by default
   - For persistence, migrate to a database (PostgreSQL, MongoDB)

---

## Quick Start: Deploy to Railway

```bash
# 1. Push code to GitHub (already done)
git push origin claude/method-chat-app-0dadtw

# 2. Go to railway.app and click "New Project"
# 3. Select "Deploy from GitHub repo"
# 4. Choose iangel-89/PortfolioGen
# 5. Add GEMINI_API_KEY environment variable
# 6. Click "Deploy"

# Done! Your app is live at https://your-project-name.railway.app
```

---

## Troubleshooting

### "GEMINI_API_KEY not set" on deployed app
- Check that the environment variable is set in the platform dashboard
- Verify the variable name is exactly `GEMINI_API_KEY`
- Restart the deployment

### Build fails
- Check logs in the platform dashboard
- Ensure `npm run build` works locally: `npm run build`
- Verify all dependencies are in package.json

### Port issues
- Most platforms provide a PORT env var at runtime
- The app listens on `process.env.PORT ?? 3000` automatically

---

## Next Steps

1. Choose a platform (Railway recommended for quickest start)
2. Create an account and connect GitHub
3. Set environment variables
4. Deploy
5. Test the live app
6. Share the URL with users

Questions? Check the platform's documentation or open an issue in the repo.
