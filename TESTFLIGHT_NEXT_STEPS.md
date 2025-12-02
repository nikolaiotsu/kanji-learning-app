# TestFlight Submission - Next Steps

## ✅ What's Been Completed:

### 1. **App Configuration**
- ✅ Updated camera and photo permissions with accurate descriptions
- ✅ Bundle ID configured: `com.bluve01.kanjilearningapp`
- ✅ App version: 1.0.1
- ✅ Privacy manifest configured

### 2. **Privacy Policy**
- ✅ Comprehensive privacy policy created (`PRIVACY_POLICY.md`)
- ✅ Privacy policy link added to Settings screen (all languages)
- ✅ Translations added for 7 languages (EN, ES, JA, KO, ZH, HI, AR)
- ✅ Setup instructions documented (`PRIVACY_POLICY_SETUP.md`)

### 3. **Authentication**
- ✅ EAS login verified (logged in as: bluve01)
- ✅ Apple Developer credentials configured

---

## 🚀 IMMEDIATE NEXT STEPS:

### Step 1: Create Your Notion Privacy Policy Page (5 minutes)

1. **Go to https://notion.so** and log in
2. Click "+ New Page"
3. Name it: **"WordDex Privacy Policy"**
4. Copy the entire contents from `PRIVACY_POLICY.md`
5. Paste into Notion
6. Click **"Share"** button (top right)
7. Toggle **"Share to web"** ON
8. **Copy the public URL** (looks like: `https://yourworkspace.notion.site/WordDex-Privacy-Policy-xxxxx`)

### Step 2: Update the App with Your Notion URL (2 minutes)

**File:** `app/settings.tsx`  
**Line:** ~196

**Replace:**
```typescript
const privacyPolicyUrl = 'https://your-notion-url.notion.site/privacy-policy';
```

**With your actual URL:**
```typescript
const privacyPolicyUrl = 'https://yourworkspace.notion.site/WordDex-Privacy-Policy-xxxxx';
```

### Step 3: Build for TestFlight (30-40 minutes build time)

```bash
cd /Users/nikko/Desktop/flaschardcardapp2/kanji-learning-app
eas build --platform ios --profile testflight --non-interactive
```

**What happens:**
- EAS will build your app in the cloud
- Takes 30-40 minutes
- You'll get a URL to monitor progress
- Build will be automatically signed

### Step 4: Submit to App Store Connect (5 minutes)

After the build completes:

```bash
eas submit --platform ios --profile testflight
```

**What happens:**
- Uploads your build to App Store Connect
- Associates it with your app (ID: 6752800274)
- Takes 5-10 minutes
- Build will appear in App Store Connect within 10-30 minutes

---

## 📱 THEN: Configure TestFlight in App Store Connect

### Step 5: Complete App Store Connect Setup (30-60 minutes)

1. **Go to App Store Connect**: https://appstoreconnect.apple.com/
2. **Select your app**: WordDex (ID: 6752800274)
3. **Go to TestFlight tab**

### Required Information:

#### A. App Privacy
- Go to: **App Information → Privacy Policy URL**
- Enter your **Notion URL** from Step 1
- Save

#### B. Export Compliance (Already Done ✅)
- Your app.json already has: `ITSAppUsesNonExemptEncryption: false`
- Apple may still ask during review - answer "No" to encryption questions

#### C. Test Information
In the TestFlight tab:
- **Beta App Description**: Brief description for testers
  - Example: "WordDex is a language learning flashcard app with OCR scanning. Scan text with your camera to create flashcards instantly."
- **Feedback Email**: lnotsunari@gmail.com
- **What to Test**: 
  - Example: "Please test camera scanning, flashcard creation, and translation accuracy. Try creating collections and reviewing flashcards."

---

## 👥 INTERNAL TESTING (Share with Friends - Option 1)

### For 2-5 Close Friends (Available TODAY after build completes):

1. **Add them to App Store Connect:**
   - Go to: Users and Access → Users
   - Click "+" button
   - Add their Apple ID email
   - Assign role: "App Manager" or "Developer" (minimal permissions)
   - They'll receive an invitation email

2. **Add to Internal Testing:**
   - TestFlight → Internal Testing
   - Click "+" next to testers
   - Select the people you just added
   - They'll get TestFlight invite **immediately**

3. **They install:**
   - Download TestFlight app from App Store
   - Accept invitation
   - Install WordDex
   - ✅ They can test **within 1-2 hours** of your build completing

**Limitation:** They must be on your Apple Developer team

---

## 🌍 EXTERNAL TESTING (Share with Anyone - Option 2)

### For Wider Friend Group (Available in 1-3 DAYS):

1. **Create External Test Group:**
   - TestFlight → External Testing
   - Click "+" to create new group
   - Name it: "Friends and Family" or "Beta Testers"

2. **Submit for Beta Review:**
   - Click "Submit for Review"
   - Apple will review (usually 1-2 days)
   - First external build requires review
   - Updates after approval are much faster

3. **After Approval:**
   - Add testers by email (up to 10,000!)
   - OR generate a **Public Link**
   - Share the link via text, social media, etc.
   - Anyone with the link can install

**Public Link:** `https://testflight.apple.com/join/XXXXXXXX`

---

## 📸 OPTIONAL: Take Screenshots for App Store

While your build is processing, you can prepare screenshots:

### Required Sizes:
- **iPhone 6.7"** (iPhone 15 Pro Max): 1290 x 2796 pixels
- **iPhone 6.5"** (iPhone 11 Pro Max): 1242 x 2688 pixels

### Suggested Screenshots (3-5 total):
1. **Camera scanning feature** - Show the camera view with text selection
2. **Flashcard display** - Show a completed flashcard with furigana/pinyin
3. **Collections view** - Show saved flashcards organized in collections
4. **Settings screen** - Show language options
5. **Review mode** - Show the swipe-to-review interface

**How to capture:**
- Use iOS Simulator or real device
- Press Cmd+S in Simulator or Volume Up + Power on device
- Resize to required dimensions using Preview or Figma

---

## ⚡ QUICK COMMAND REFERENCE:

```bash
# Navigate to project
cd /Users/nikko/Desktop/flaschardcardapp2/kanji-learning-app

# Check EAS login
eas whoami

# Build for TestFlight
eas build --platform ios --profile testflight --non-interactive

# Submit to App Store Connect (after build completes)
eas submit --platform ios --profile testflight
```

---

## 📋 CHECKLIST:

- [ ] Create Notion privacy policy page
- [ ] Copy Notion URL
- [ ] Update `app/settings.tsx` with URL
- [ ] Run `eas build --platform ios --profile testflight`
- [ ] Wait for build to complete (~40 min)
- [ ] Run `eas submit --platform ios --profile testflight`
- [ ] Wait for App Store Connect processing (~20 min)
- [ ] Add privacy policy URL to App Store Connect
- [ ] Complete Test Information in TestFlight
- [ ] Choose Internal OR External testing
- [ ] Add testers
- [ ] Share TestFlight link with friends!

---

## 🎯 Timeline Estimate:

**Today (Total: ~1.5-2 hours active work, 1 hour waiting):**
- Notion setup: 5 minutes
- Code update: 2 minutes
- Build trigger: 2 minutes
- **Wait for build: 30-40 minutes** ⏰
- Submit to App Store: 5 minutes
- **Wait for processing: 10-30 minutes** ⏰
- App Store Connect setup: 30 minutes
- Add internal testers: 10 minutes
- ✅ **Friends can install: 1-2 hours from now!**

**For External Testing (add 1-3 days):**
- Everything above, PLUS
- Submit for beta review: 5 minutes
- **Wait for Apple review: 1-2 days** ⏰
- Generate public link: 2 minutes
- ✅ **Anyone can install!**

---

## 📞 Need Help?

**Your Configuration:**
- Apple ID: lnotsunari@gmail.com
- Team ID: 8FMP37RQXC
- App ID: 6752800274
- Bundle ID: com.bluve01.kanjilearningapp

**Common Issues:**
- **Build fails**: Check EAS dashboard for error logs
- **Can't submit**: Ensure build profile is "testflight" not "production"
- **Apple rejects**: Usually wants privacy policy or export compliance info

---

## 🚀 You're Almost There!

Once you complete the Notion setup and run the build command, you'll be on your way to having friends test your app!

**Ready to start?** Complete Steps 1 & 2, then run the build command!

