# Chrome Web Store Submission Guide

## Prerequisites

1. **Google Developer Account** — Register at https://chrome.google.com/webstore/devconsole
   - One-time $5 registration fee
   - Use a Google account you want associated with the extension

2. **Build the extension:**
   ```bash
   cd /Users/nikhiloo7/personal-projects/recoME
   npm run build
   ```

3. **Create the ZIP:**
   ```bash
   cd dist && zip -r ../recome-extension.zip . && cd ..
   ```

4. **Screenshots** — Take 3-5 screenshots at 1280×800 (see STORE_LISTING.md for the plan)

5. **Host the privacy policy** — Options:
   - GitHub Pages (free): Add `store/PRIVACY_POLICY.md` to a GitHub repo and use the raw URL
   - GitHub README: Push the repo and link to the file directly
   - Any public URL works — the Chrome Web Store just needs a link

## Submission Steps

### 1. Upload Package
- Go to https://chrome.google.com/webstore/devconsole
- Click "New Item"
- Upload `recome-extension.zip`

### 2. Store Listing Tab
Fill in from STORE_LISTING.md:
- **Name:** RecoMe — Smart Feed Control
- **Summary:** (use the short description)
- **Description:** (use the detailed description — strip markdown formatting)
- **Category:** Productivity
- **Language:** English

Upload:
- Icon 128×128 (use `public/icons/icon128.png`)
- Screenshots (1280×800 minimum, up to 5)
- Promotional tile 440×280 (optional but recommended)

### 3. Privacy Tab
- **Single purpose description:** "Filter and control recommendation feeds on websites by learning user preferences locally"
- **Permission justifications:**
  - `storage`: "Store user preferences and settings locally"
  - `tabs`: "Detect the current website to activate the correct content adapter"
  - `activeTab`: "Analyze visible content on the current tab for topic extraction"
  - `host_permissions (https://*/*)`: "Inject content overlay UI and analyze recommendation cards on all websites the user visits"
  - `alarms`: "Schedule periodic background tasks like pattern detection and memory maintenance"
- **Data usage disclosure:**
  - Does NOT collect personally identifiable information
  - Does NOT collect health information
  - Does NOT collect financial information
  - Does NOT collect authentication information
  - Does NOT collect personal communications
  - Does NOT collect location data
  - Does NOT collect web history
  - Does NOT collect user activity
  - Does collect "Website content" — justify: "Visible text of recommendation cards is analyzed locally for topic extraction. No content is transmitted externally unless the user opts in to the AI enhancement feature with their own API key."
- **Privacy policy URL:** (your hosted URL)

### 4. Distribution Tab
- **Visibility:** Public
- **Distribution:** All regions (or select specific ones)
- **Mature content:** No

### 5. Submit for Review
- Click "Submit for review"
- Review typically takes 1-3 business days
- You'll get an email when approved or if changes are needed

## Common Review Rejection Reasons & How to Avoid

| Reason | Prevention |
|--------|-----------|
| Broad host permissions without justification | Provide clear justification (done above) — "works on all sites" is valid for content filters |
| Missing privacy policy | Host the privacy policy at a public URL before submitting |
| Misleading description | Keep claims accurate — don't overstate AI capabilities |
| Excessive permissions | All permissions are justified and necessary |
| Single-purpose violation | The extension has one clear purpose: feed filtering |

## After Approval

- Extension gets a Chrome Web Store URL you can share
- Updates: bump version in `manifest.json`, rebuild, re-upload ZIP
- Monitor reviews and ratings in the developer console
- Respond to user feedback promptly

## Useful Commands

```bash
# Full validation before submission
npm run validate

# Build production bundle
npm run build

# Create submission ZIP
cd dist && zip -r ../recome-extension.zip . && cd ..

# Check ZIP contents
unzip -l recome-extension.zip

# Check bundle size
du -sh dist/
```
