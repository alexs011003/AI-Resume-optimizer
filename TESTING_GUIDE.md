# Resume Optimizer Testing Guide

## Pre-Testing Checklist

1. **Reload Extension**
   - Go to `chrome://extensions/`
   - Find "Resume Optimizer"
   - Click the reload button (circular arrow icon)
   - Ensure extension is enabled

2. **Open Browser Console**
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
   - Go to "Console" tab
   - Keep it open to see logs

## Test 1: Keyword Loading

**Goal:** Verify all keyword lists load correctly

**Steps:**
1. Open the extension side panel
2. Check console for:
   ```
   Keywords loaded successfully:
     - Tech: [number]
     - Soft: [number]
     - SWE: [number]
     - PM/Marketing: [number]
     - Design: [number]
   ```

**Expected Results:**
- All keyword lists should have counts > 0
- SWE keywords: ~100+
- PM/Marketing keywords: ~150+
- Design keywords: ~200+

**If it fails:**
- Check if `keywords.json` is accessible
- Check console for errors

---

## Test 2: Domain Detection

### Test 2A: Software Engineering Domain

**Test Job:**
- Go to LinkedIn/Indeed
- Search for: "Software Engineer" or "Full Stack Developer"
- Open any job posting

**Expected:**
- Console should show: `🔍 Detected domain: swe`
- Extension should use `sweKeywords` list

**Verify in Console:**
```
🔍 Detected domain: swe
Keywords found in job description: [number] keywords
```

### Test 2B: Product Designer/UX Domain

**Test Job:**
- Search for: "Product Designer" or "UX Designer" or "UX Researcher"
- Open any job posting

**Expected:**
- Console should show: `🔍 Detected domain: design`
- Extension should use `designKeywords` list

**Verify in Console:**
```
🔍 Detected domain: design
Keywords found in job description: [number] keywords
```

### Test 2C: Product Manager/Marketing Domain

**Test Job:**
- Search for: "Product Manager" or "Marketing Manager"
- Open any job posting

**Expected:**
- Console should show: `🔍 Detected domain: pm_marketing`
- Extension should use `pmMarketingKeywords` list

**Verify in Console:**
```
🔍 Detected domain: pm_marketing
Keywords found in job description: [number] keywords
```

### Test 2D: General Domain (Fallback)

**Test Job:**
- Search for: "Sales Representative" or "Account Manager"
- Open any job posting

**Expected:**
- Console should show: `🔍 Detected domain: general`
- Extension should use `techKeywords + softKeywords` list

---

## Test 3: Keyword Extraction

### Test 3A: Design Keywords Extraction

**Test Resume Text:**
```
Skills: Figma, User Research, Prototyping, Wireframing, Design Systems, 
Usability Testing, Information Architecture, Journey Mapping, Personas
```

**Test Job Description:**
```
We're looking for a Product Designer with experience in:
- Figma for design
- User research and usability testing
- Prototyping and wireframing
- Design systems
- Information architecture
```

**Expected:**
- Should extract: Figma, User Research, Prototyping, Wireframing, Design Systems, Usability Testing, Information Architecture
- Console should show extracted keywords

### Test 3B: Synonym Normalization

**Test Resume Text:**
```
Skills: React.js, NodeJS, AWS, PostgreSQL
```

**Test Job Description:**
```
Requirements: React, Node.js, Amazon Web Services, Postgres
```

**Expected:**
- "React.js" should match "React"
- "NodeJS" should match "Node.js"
- "AWS" should match "Amazon Web Services"
- "PostgreSQL" should match "Postgres"
- All should be normalized and matched

### Test 3C: Suffix Variations

**Test Resume Text:**
```
Experience with testing, prototyping, and designing
```

**Test Job Description:**
```
We need someone who can test, prototype, and design
```

**Expected:**
- "testing" should match "test"
- "prototyping" should match "prototype"
- "designing" should match "design"
- Keywords should be extracted despite suffix differences

---

## Test 4: Comparison Algorithm

### Test 4A: Basic Percentage Calculation

**Scenario:**
- Job has 10 keywords
- Resume matches 7 keywords
- Missing 3 keywords

**Expected Score:** 70% (7/10)

**Verify:**
- Check the score displayed in UI
- Check console: `Match score: 70%`

### Test 4B: Design Role Matching

**Test Resume:**
```
Product Designer with 5 years experience.
Skills: Figma, Sketch, User Research, Prototyping, Wireframing, 
Design Systems, Usability Testing, Information Architecture
```

**Test Job:**
```
Looking for Senior Product Designer
Required: Figma, User Research, Prototyping, Design Systems, 
Usability Testing, Information Architecture, Journey Mapping, Personas
```

**Expected:**
- Matched: Figma, User Research, Prototyping, Design Systems, Usability Testing, Information Architecture (6)
- Missing: Journey Mapping, Personas (2)
- Score: 6/8 = 75%

---

## Test 5: Job Description Extraction

### Test 5A: LinkedIn Extraction

**Steps:**
1. Go to LinkedIn job posting
2. Click extension icon
3. Click "Scan Current Page"

**Expected:**
- Job description should be extracted
- Metadata (title, company, date) should be populated
- Console should show: `✅ Job description extracted successfully`

### Test 5B: Indeed Extraction

**Steps:**
1. Go to Indeed job posting
2. Click extension icon
3. Click "Scan Current Page"

**Expected:**
- Job description should be extracted
- Should handle iframe content if present

### Test 5C: Metadata Extraction

**Verify:**
- Job Title: Should show actual job title
- Company: Should show company name (cleaned, no "Show match details")
- Source: Should show "linkedin" or "indeed"
- Posted Date: Should show "X days ago" format

---

## Test 6: End-to-End Flow

### Complete Test Scenario

**Step 1: Upload Resume**
1. Open extension
2. Click "Upload Resume"
3. Select a PDF/DOCX resume file
4. Verify: File name appears, resume text is parsed

**Step 2: Navigate to Job**
1. Go to LinkedIn/Indeed
2. Open a job posting (e.g., "Product Designer")
3. Extension should auto-scan (or click "Scan Current Page")

**Step 3: Verify Results**
1. Check domain detection in console
2. Check keyword extraction
3. Check match score
4. Check matched keywords (green tags)
5. Check missing keywords (yellow tags)

**Step 4: Test Different Domains**
- Test with SWE job
- Test with Design job
- Test with PM job
- Verify different keyword lists are used

---

## Debugging Tips

### If Domain Detection Fails:
- Check console for domain detection logs
- Verify job title/description contain domain keywords
- Check `detectJobDomain()` function output

### If Keywords Not Extracted:
- Check if keyword exists in the appropriate keyword list
- Verify normalization is working (check console)
- Check if text contains the keyword (case-insensitive)

### If Score Seems Wrong:
- Check console for matched/missing keyword counts
- Verify normalization is applied
- Check if domain-specific list is being used

### Common Issues:

1. **"No keywords extracted"**
   - Check if keyword list is loaded
   - Verify domain detection worked
   - Check if keywords exist in the list

2. **"Domain always shows 'general'"**
   - Check job title/description for domain keywords
   - Verify detection patterns are correct
   - Check console for detection scores

3. **"Keywords not matching"**
   - Check normalization is working
   - Verify synonyms are applied
   - Check suffix handling

---

## Test Data Examples

### Sample Resume Text (Design Role):
```
JOHN DOE
Product Designer

SKILLS
Figma, Sketch, Adobe XD, Framer, Principle
User Research, Usability Testing, A/B Testing
Prototyping, Wireframing, Design Systems
Information Architecture, User Flows, Journey Mapping
Design Thinking, Double Diamond, Lean UX

EXPERIENCE
Senior Product Designer at Tech Company
- Designed user interfaces using Figma
- Conducted user research and usability testing
- Created prototypes and wireframes
- Built design systems and component libraries
```

### Sample Job Description (Design Role):
```
Product Designer

We're looking for a talented Product Designer to join our team.

Requirements:
- 5+ years experience in product design
- Proficiency in Figma and Sketch
- Experience with user research and usability testing
- Strong prototyping and wireframing skills
- Knowledge of design systems
- Experience with information architecture
- Understanding of design thinking methodology
- Portfolio demonstrating UX/UI design work

Nice to have:
- Experience with Framer or Principle
- Motion design skills
- AR/VR design experience
```

**Expected Matches:**
- Figma, Sketch, User Research, Usability Testing, Prototyping, Wireframing, Design Systems, Information Architecture, Design Thinking

**Expected Missing:**
- Framer, Principle, Motion Design, AR/VR Design (if not in resume)

---

## Quick Test Checklist

- [ ] Extension loads without errors
- [ ] Keywords load successfully (all lists)
- [ ] Domain detection works for SWE jobs
- [ ] Domain detection works for Design jobs
- [ ] Domain detection works for PM/Marketing jobs
- [ ] Keyword extraction works for design keywords
- [ ] Synonym normalization works (React = React.js)
- [ ] Suffix variations work (testing = test)
- [ ] Job description extraction works on LinkedIn
- [ ] Job description extraction works on Indeed
- [ ] Metadata extraction works (title, company, date)
- [ ] Match score calculation is correct
- [ ] Matched keywords display correctly
- [ ] Missing keywords display correctly
- [ ] UI updates correctly after scan

---

## Reporting Issues

If you find issues during testing, note:
1. What test failed
2. Expected behavior
3. Actual behavior
4. Console errors (if any)
5. Browser and extension version
6. Job posting URL (if applicable)
