# Your JobMagnet Portfolio

This is your AI-tailored portfolio — generated specifically for the role you applied to. It's a Next.js 15 app that deploys to Vercel in under 2 minutes.

## Deploy in 5 steps

**Prerequisites:** Node.js 18+, [pnpm](https://pnpm.io/installation), [GitHub CLI](https://cli.github.com), a free [Vercel account](https://vercel.com).

1. **Unzip** the downloaded file and open your terminal in the folder.
2. **Enter the folder:**
   ```sh
   cd jobmagnet-portfolio
   ```
3. **Push to GitHub:**
   ```sh
   gh repo create my-portfolio --private --source=. --push
   ```
4. **Import on Vercel:** Go to [vercel.com/new](https://vercel.com/new), click "Import Git Repository", and select `my-portfolio`.
5. **Click Deploy.** Your portfolio is live in about 60 seconds.

Your URL will look like `my-portfolio.vercel.app`. You can add a custom domain in Vercel's project settings.

---

## Make edits locally

```sh
pnpm install
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

All content lives in `portfolio-content.json` at the project root. Edit it directly — the page re-renders on save.

To change colors or fonts, edit `tailwind.config.ts` (colors) and `app/layout.tsx` (font imports).

---

## Remove JobMagnet attribution

The small "i" badge in the bottom-right corner is the only JobMagnet branding. To remove it:

1. Delete `components/InfoBadge.tsx`
2. Open `components/PortfolioRender.tsx` and remove the `<InfoBadge />` import and JSX line.
3. Redeploy (`git push`).

---

## Folder structure

```
portfolio-content.json   ← all your content (edit this)
app/
  page.tsx               ← renders the portfolio
  layout.tsx             ← fonts + metadata
  globals.css            ← Tailwind base styles
components/
  PortfolioRender.tsx    ← top-level layout
  Hero.tsx
  WhyImAFit.tsx
  PitchSection.tsx
  Work.tsx
  About.tsx
  InfoBadge.tsx
lib/
  types.ts               ← TypeScript types for portfolio content
```
