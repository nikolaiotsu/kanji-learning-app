# Privacy Policy Setup Instructions

## ✅ Completed Steps:

1. **Privacy Policy Content Created** - See `PRIVACY_POLICY.md` in the project root
2. **App Updated** - Privacy policy link added to Settings screen
3. **Translations Added** - English translations added for privacy policy

---

## 📝 Next Steps to Complete:

### Step 1: Create Notion Public Page

1. **Go to Notion** (https://notion.so)
   - Log in to your account (or create one if needed - it's free!)

2. **Create a New Page**
   - Click "+ New Page" in your workspace
   - Name it: "WordDex Privacy Policy"

3. **Copy the Privacy Policy Content**
   - Open `PRIVACY_POLICY.md` from this project
   - Copy ALL the content
   - Paste it into your Notion page
   - Format as needed (Notion will handle most formatting automatically)

4. **Make the Page Public**
   - Click "Share" button (top right)
   - Toggle "Share to web" ON
   - Copy the public link (it will look like: `https://yourworkspace.notion.site/WordDex-Privacy-Policy-xxxxx`)

5. **IMPORTANT: Save the URL**
   - Copy the public Notion URL
   - You'll need this in the next step

### Step 2: Update the App with Your Privacy Policy URL

Once you have your Notion URL, update the settings file:

**File to Edit:** `app/settings.tsx`

**Line to Change:** ~Line 193-195

**Replace this:**
```typescript
const privacyPolicyUrl = 'https://your-notion-url.notion.site/privacy-policy';
```

**With your actual Notion URL:**
```typescript
const privacyPolicyUrl = 'https://yourworkspace.notion.site/WordDex-Privacy-Policy-xxxxx';
```

### Step 3: Add Privacy Policy URL to App Store Connect

When you set up TestFlight and App Store Connect:

1. Go to App Store Connect (https://appstoreconnect.apple.com)
2. Select your app (WordDex)
3. Go to "App Information"
4. Find "Privacy Policy URL"
5. Enter your Notion URL
6. Save

---

## 📱 What's Been Added to the App:

### Settings Screen Changes:
- ✅ Added "Privacy Policy" button in Account section
- ✅ Opens the privacy policy URL in the device's browser
- ✅ Available for both logged-in and logged-out users
- ✅ Icon: Shield with checkmark
- ✅ Translations ready in English (need to add to other languages)

### Privacy Policy Features:
- ✅ Opens in external browser
- ✅ User-friendly icon and description
- ✅ Error handling if URL can't be opened

---

## 🌍 Optional: Add Translations for Other Languages

If you want to add privacy policy translations for other languages, update these files:

- `app/i18n/locales/ar.json` (Arabic)
- `app/i18n/locales/es.json` (Spanish)
- `app/i18n/locales/hi.json` (Hindi)
- `app/i18n/locales/ja.json` (Japanese)
- `app/i18n/locales/ko.json` (Korean)
- `app/i18n/locales/zh.json` (Chinese)

Add these keys to the "settings" section:
```json
"privacyPolicy": "Privacy Policy",
"viewPrivacyPolicy": "View Privacy Policy"
```

**Note:** You can create separate Notion pages for each language if needed, or just use the English version for now.

---

## ✅ Privacy Policy Checklist for App Store:

- [x] Privacy policy created with comprehensive information
- [ ] Privacy policy hosted on public URL (Notion)
- [ ] Privacy policy URL added to app settings
- [ ] Privacy policy URL will be added to App Store Connect
- [x] Privacy policy covers all data collection
- [x] Privacy policy explains third-party services
- [x] Privacy policy explains user rights (delete, export)
- [x] Privacy policy mentions immediate data deletion
- [x] Contact email included in privacy policy

---

## 🚀 After Setup:

Once you complete Steps 1 and 2 above, your app will be ready for TestFlight submission with a complete privacy policy setup!

The privacy policy URL will be accessible:
1. **In the app** - Users can tap "Privacy Policy" in Settings
2. **On App Store** - Listed in your app's store listing
3. **During beta review** - Apple reviewers can access it

---

## 📧 Contact Information in Privacy Policy:

The privacy policy includes your email: **lnotsunari@gmail.com**

If you want to change this or add a different support email, update it in:
- `PRIVACY_POLICY.md` (source document)
- Your Notion page (after publishing)

