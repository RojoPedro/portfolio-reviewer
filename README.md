This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## 🔐 Supabase Auth Setup (Required)
This app uses Supabase for Authentication and tracking usage credits (3 free reviews/user).

1.  **Create a Supabase Project**: [database.new](https://database.new)
2.  **Run SQL Migration**: Copy the content of `supabase_schema.sql` and run it in the Supabase **SQL Editor**.
3.  **Get Credentials**: Go to **Project Settings > API**.
4.  **Configure Env**: Add the following to your `.env.local` (or Vercel Env Vars):
    ```env
    NEXT_PUBLIC_SUPABASE_URL=your_project_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
    ```

## 🚀 Deployment (Vercel)
1.  **Import Repository**: Connect your GitHub repo to Vercel.
2.  **Environment Variables**:
    - Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
    - **Google Cloud Credentials**:
      - Copy the **content** of your `service-account.json`.
      - Create an Env Var named `GOOGLE_SERVICE_ACCOUNT_JSON` and paste the content as the value.
3.  **Deploy**: Vercel will build and deploy the app.

## 📱 PWA (Installable)
The app is a Progressive Web App. You can install it on your Desktop or Mobile via the browser "Install" button.
