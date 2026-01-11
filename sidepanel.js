// Side panel JavaScript
// Handles all interactions and view navigation

console.log('Resume Optimizer side panel loaded');

// Helper function to wait for PDF.js library to be available
async function waitForPDFjs(maxWaitMs = 2000) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    // Check for PDF.js in various possible locations
    const pdfjs = window.pdfjsLib || window.pdfjs;
    if (pdfjs && typeof pdfjs.getDocument !== 'undefined') {
      console.log('PDF.js library found');
      return pdfjs;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}

// Helper function to wait for Mammoth.js library to be available
async function waitForMammoth(maxWaitMs = 5000) {
  // STEP 2: Add debug logging to check if mammoth exists
  console.log('Checking for Mammoth.js library... window.mammoth:', typeof window.mammoth);
  
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    if (typeof window.mammoth !== 'undefined' && typeof window.mammoth.extractRawText !== 'undefined') {
      console.log('✓ Mammoth.js library found and ready');
      return window.mammoth;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.error('❌ Mammoth.js library not found after', maxWaitMs, 'ms');
  return null;
}

// View management
const mainView = document.getElementById('main-view');
const keywordView = document.getElementById('keyword-view');
const jobView = document.getElementById('job-view');

// Current resume content
let currentResumeText = '';
let currentJobDescription = '';
let currentJobMetadata = {
  title: '',
  company: '',
  date: '',
  source: '',
  domain: 'general' // Added domain field
};

// Keywords loaded from keywords.json
let loadedKeywords = [];
let loadedTechKeywords = [];
let loadedSoftKeywords = [];
let loadedSweKeywords = [];
let loadedPmMarketingKeywords = [];
let loadedDesignKeywords = [];

// Domain detection function
// Reference: Jobalytics util.js fetchDomain function
function detectJobDomain(jobTitle, jobDescription, url) {
  // Combine all text for analysis
  const combinedText = `${jobTitle || ''} ${jobDescription || ''} ${url || ''}`.toLowerCase();
  
  // SWE detection patterns (must NOT match "Product Design" or "Design Engineer" roles)
  const swePatterns = [
    /software\s+engineer/gi,
    /backend\s+engineer/gi,
    /frontend\s+engineer/gi,
    /full.?stack\s+engineer/gi,
    /machine\s+learning\s+engineer/gi,
    /ml\s+engineer/gi,
    /data\s+engineer/gi,
    /devops\s+engineer/gi,
    /sre\s+engineer/gi,
    /solutions\s+architect/gi,
    /developer/gi,
    /programmer/gi,
    /coder/gi,
    /ai\s+engineer/gi,
    /tech( analyst)?/gi
  ];
  
  // PM/Marketing detection patterns
  // IMPORTANT: "product" alone should NOT match - only "product manager" or "product management"
  // This avoids false positives with "Product Design" roles
  const pmMarketingPatterns = [
    /product\s+manager/gi,  // Must be "product manager", not just "product"
    /product\s+management/gi,  // Must be "product management"
    /marketing/gi,
    /marketer/gi,
    /advertising/gi,
    /advertiser/gi,
    /copywriting/gi,
    /copywriter/gi,
    /social\s+media/gi,
    /brand/gi,
    /ambassador/gi,
    /cmo/gi,
    /go.?to.?market/gi,
    /gtm/gi,
    /roadmap/gi,
    /product\s+strategy/gi  // Must be "product strategy", not just "product"
  ];
  
  // Design detection patterns (MUST be checked before SWE to avoid false positives)
  // Priority: Check for "design" keyword first, then specific design roles
  const designPatterns = [
    /product\s+design/gi,  // "Product Design" - must come before generic "product" patterns
    /product\s+designer/gi,
    /design\s+intern/gi,   // "Design Intern" pattern
    /ux\s+designer/gi,
    /ui\s+designer/gi,
    /user\s+experience\s+designer/gi,
    /user\s+interface\s+designer/gi,
    /ux\s+researcher/gi,
    /user\s+researcher/gi,
    /design\s+researcher/gi,
    /interaction\s+designer/gi,
    /visual\s+designer/gi,
    /design\s+system/gi,
    /figma/gi,
    /prototyping/gi,
    /wireframing/gi,
    /user\s+research/gi,
    /usability\s+testing/gi,
    /information\s+architecture/gi,
    /user\s+flows/gi,
    /journey\s+mapping/gi,
    /design\s+thinking/gi,
    /\bdesigner\b/gi  // Generic "designer" keyword (but check after specific patterns)
  ];
  
  // Hybrid role detection patterns (Design + Engineering)
  // These roles require both design and engineering skills
  const hybridPatterns = [
    /design\s+(technologist|engineer|developer)/gi,
    /(technologist|engineer|developer)\s+.*design/gi,
    /frontend\s+designer/gi,
    /designer.*frontend/gi,
    /ui\s+engineer/gi,
    /ux\s+engineer/gi,
    /creative\s+technologist/gi,
    /design\s+engineer/gi,
    /design\s+developer/gi
  ];
  
  // Count matches for each domain
  let sweScore = 0;
  let pmMarketingScore = 0;
  let designScore = 0;
  let isHybrid = false;
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:133',message:'Domain detection start',data:{jobTitle,combinedTextPreview:combinedText.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'K'})}).catch(()=>{});
  // #endregion
  
  // Check for hybrid roles first
  hybridPatterns.forEach(pattern => {
    if (pattern.test(combinedText)) {
      isHybrid = true;
    }
  });
  
  // Count SWE patterns
  swePatterns.forEach(pattern => {
    const matches = combinedText.match(pattern);
    if (matches) sweScore += matches.length;
  });
  
  // Check for generic "engineer" but exclude design-related contexts
  // This must be done AFTER design patterns are checked
  const genericEngineerPattern = /\bengineer(ing)?\b/gi;
  const engineerMatches = combinedText.match(genericEngineerPattern);
  if (engineerMatches) {
    // Only count if NOT in design context
    const designContextPattern = /(product\s+)?design\s+engineer|ux\s+engineer|ui\s+engineer|designer|product\s+design/gi;
    const hasDesignContext = designContextPattern.test(combinedText);
    if (!hasDesignContext) {
      sweScore += engineerMatches.length;
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:148',message:'Engineer pattern check',data:{engineerMatchesCount:engineerMatches.length,hasDesignContext,addedToSwe:!hasDesignContext},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'L'})}).catch(()=>{});
    // #endregion
  }
  
  pmMarketingPatterns.forEach(pattern => {
    const matches = combinedText.match(pattern);
    if (matches) pmMarketingScore += matches.length;
  });
  
  designPatterns.forEach(pattern => {
    const matches = combinedText.match(pattern);
    if (matches) designScore += matches.length;
  });
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:165',message:'Domain scores calculated',data:{sweScore,pmMarketingScore,designScore},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'M'})}).catch(()=>{});
  // #endregion
  
  // Determine domain based on highest score
  // Hybrid roles have HIGHEST priority (most specific)
  // Design has HIGH priority if score > 0 (more specific roles)
  // Check design first to avoid false positives from "Product" matching PM patterns
  let finalDomain = 'general';
  
  // Check for hybrid roles first (Design + Engineering)
  if (isHybrid) {
    finalDomain = 'hybrid_design_swe';
    console.log('🔍 Detected hybrid role (Design + Engineering)');
  }
  // If not hybrid, proceed with normal domain detection
  else if (designScore > 0) {
    // Design wins if it has any matches, or if it ties with others
    if (designScore >= sweScore && designScore >= pmMarketingScore) {
      finalDomain = 'design';
    }
    // If design ties with SWE but job title contains "design", prefer design
    else if (designScore === sweScore && /design/i.test(jobTitle)) {
      finalDomain = 'design';
    }
  }
  
  if (finalDomain === 'general') {
    if (sweScore > 0 && sweScore > pmMarketingScore) {
      finalDomain = 'swe';
    } else if (pmMarketingScore > 0) {
      finalDomain = 'pm_marketing';
    }
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:185',message:'Domain decision',data:{finalDomain,jobTitleContainsDesign:/design/i.test(jobTitle)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'N'})}).catch(()=>{});
  // #endregion
  
  return finalDomain;
}

// Keyword suggestions data
const keywordSuggestions = {
  'Python': {
    skill: 'Proficient in Python for data analysis and backend development, with experience in libraries such as Pandas, NumPy, and Flask',
    summary: 'Full-stack developer with expertise in JavaScript, TypeScript, and Python, delivering scalable web applications',
    original: 'Full-stack developer with expertise in JavaScript and TypeScript, delivering scalable web applications'
  },
  'Machine Learning': {
    skill: 'Applied machine learning algorithms including regression, classification, and clustering using Python and scikit-learn',
    summary: 'Data-driven developer with experience in machine learning and predictive modeling, building intelligent web applications',
    original: 'Data-driven developer building intelligent web applications'
  },
  'AWS': {
    skill: 'Experienced with AWS services including EC2, S3, Lambda, and RDS for cloud infrastructure and deployment',
    summary: 'Cloud-focused developer proficient in AWS infrastructure, deploying and maintaining scalable applications',
    original: 'Developer experienced in deploying and maintaining scalable applications'
  },
  'Docker': {
    skill: 'Skilled in Docker containerization for consistent development environments and simplified deployment workflows',
    summary: 'DevOps-minded developer leveraging Docker for containerized applications and streamlined CI/CD pipelines',
    original: 'DevOps-minded developer working with containerized applications'
  },
  'Kubernetes': {
    skill: 'Proficient in Kubernetes orchestration for managing containerized applications at scale',
    summary: 'Infrastructure-aware developer utilizing Kubernetes for container orchestration and microservices architecture',
    original: 'Infrastructure-aware developer working with microservices architecture'
  },
  'CI/CD': {
    skill: 'Implemented CI/CD pipelines using Jenkins, GitHub Actions, and GitLab CI for automated testing and deployment',
    summary: 'Agile developer with strong CI/CD practices, automating build, test, and deployment processes',
    original: 'Agile developer automating build and deployment processes'
  },
  'Agile': {
    skill: 'Experienced in Agile methodologies including Scrum and Kanban, collaborating in cross-functional teams',
    summary: 'Collaborative developer working in Agile environments with experience in sprint planning and iterative development',
    original: 'Collaborative developer working in sprint planning and iterative development'
  },
  'REST API': {
    skill: 'Designed and developed RESTful APIs using Node.js and Express, following best practices for scalability and security',
    summary: 'Backend developer specializing in RESTful API design and integration with modern frontend frameworks',
    original: 'Backend developer specializing in API design and integration'
  }
};

// Fetch keywords from keywords.json
async function fetchKeywords() {
  try {
    const keywordsUrl = chrome.runtime.getURL('keywords.json');
    const response = await fetch(keywordsUrl);
    
    if (!response.ok) {
      console.error('Failed to fetch keywords.json:', response.status);
      return { 
        allKeywords: [], 
        techKeywords: [], 
        softKeywords: [],
        sweKeywords: [],
        pmMarketingKeywords: [],
        designKeywords: []
      };
    }
    
    const data = await response.json();
    
    // Store all keyword lists
    const techKeywords = data.techKeywords || [];
    const softKeywords = data.softKeywords || [];
    const sweKeywords = data.sweKeywords || [];
    const pmMarketingKeywords = data.pmMarketingKeywords || [];
    const designKeywords = data.designKeywords || [];
    
    // All keywords combined (for general/fallback use)
    const allKeywords = [...techKeywords, ...softKeywords];
    
    console.log('Keywords loaded successfully:');
    console.log('  - Tech:', techKeywords.length);
    console.log('  - Soft:', softKeywords.length);
    console.log('  - SWE:', sweKeywords.length);
    console.log('  - PM/Marketing:', pmMarketingKeywords.length);
    console.log('  - Design:', designKeywords.length);
    console.log('  - Total (tech+soft):', allKeywords.length);
    
    return { 
      allKeywords, 
      techKeywords, 
      softKeywords,
      sweKeywords,
      pmMarketingKeywords,
      designKeywords
    };
  } catch (error) {
    console.error('Error loading keywords:', error);
    // Return fallback keywords if loading fails
    const fallbackTech = [
  'JavaScript', 'React', 'TypeScript', 'Node.js', 'Git', 'SQL', 'MongoDB',
      'HTML/CSS', 'Redux', 'Testing', 'Python', 'AWS', 'Docker', 'Agile'
    ];
    const fallbackSoft = [
      'Communication', 'Leadership', 'Problem Solving', 'Teamwork'
    ];
    return {
      allKeywords: [...fallbackTech, ...fallbackSoft],
      techKeywords: fallbackTech,
      softKeywords: fallbackSoft,
      sweKeywords: [],
      pmMarketingKeywords: [],
      designKeywords: []
    };
  }
}

// Helper function to check if a keyword is a soft skill
function isSoftSkill(keyword) {
  return loadedSoftKeywords.some(sk => sk.toLowerCase() === keyword.toLowerCase());
}

// Synonym mapping for keyword normalization
// Reference: Jobalytics synonyms_list.js
const keywordSynonyms = [
  ["react", "reactjs", "react.js", "react js"],
  ["node.js", "nodejs", "node"],
  ["vue", "vuejs", "vue.js"],
  ["angular", "angularjs", "angular.js"],
  ["javascript", "js"],
  ["html", "html5"],
  ["css", "css3"],
  ["aws", "amazon web services"],
  ["gcp", "google cloud platform"],
  ["postgres", "postgresql", "postgressql"],
  ["machine learning", "ml"],
  ["ai", "artificial intelligence"],
  ["ci/cd", "continuous integration", "continuous deployment"],
  ["design system", "design systems"],
  ["wireframe", "wireframes", "wireframing"],
  ["prototype", "prototypes", "prototyping"],
  ["user flow", "user flows"],
  ["persona", "personas"],
  ["grid system", "grid systems"],
  ["ux", "user experience"],
  ["ui", "user interface"],
  ["ixd", "interaction design"],
  ["vui", "voice ui"],
  ["hcd", "human-centered design"],
  ["ia", "information architecture"]
];

// Prefix consolidation for keyword normalization
// Reference: Jobalytics util.js correct_for_prefixes
const keywordPrefixes = [
  "design",      // design, designing, designer, designs
  "research",    // research, researching, researcher
  "prototype",   // prototype, prototyping, prototyped
  "user",        // user, users, user-centered
  "test",        // test, testing, tested, tests
  "engineer",    // engineer, engineering, engineered
  "communicat",   // communicate, communication, communicating
  "strateg"      // strategy, strategic, strategize
];

// Normalize keywords for comparison only (always uses canonical form)
// This ensures "HCD" and "human-centered design" both normalize to "hcd" for matching
// Reference: Jobalytics util.js correct_for_synonyms and correct_for_prefixes
function normalizeForComparison(keywords) {
  if (!keywords || keywords.length === 0) return [];
  
  // Step 1: Convert to lowercase and remove duplicates
  let normalized = [...new Set(keywords.map(kw => kw.toLowerCase()))];
  
  // Step 2: Apply synonym mapping - always use canonical (first) form for comparison
  normalized = normalized.map(kw => {
    for (const synonymGroup of keywordSynonyms) {
      if (synonymGroup.includes(kw)) {
        // Always return canonical (first) form for comparison
        // This ensures "hcd" and "human-centered design" both become "hcd"
        return synonymGroup[0];
      }
    }
    return kw;
  });
  
  // Step 3: Apply prefix consolidation
  normalized = normalized.map(kw => {
    for (const prefix of keywordPrefixes) {
      if (kw.startsWith(prefix) && kw.length > prefix.length) {
        // Check if there's a canonical form with this prefix
        const canonical = normalized.find(n => n === prefix || n.startsWith(prefix + ' '));
        if (canonical) {
          return canonical;
        }
      }
    }
    return kw;
  });
  
  // Step 4: Remove duplicates again after normalization
  return [...new Set(normalized)];
}

// Legacy function - kept for backward compatibility if used elsewhere
// Normalize keywords using synonyms and prefixes
function normalizeKeywords(keywords) {
  return normalizeForComparison(keywords);
}

// Extract keywords with domain-specific lists and normalization
// Reference: Jobalytics util.js getKeywordsFromTextWithSuffixes
function extractKeywords(text, domain = 'general') {
  if (!text) return [];
  const foundKeywords = [];
  const foundKeywordsLower = new Set();
  
  // Select keyword list based on domain
  let keywordsToCheck = [];
  switch(domain) {
    case 'swe':
      keywordsToCheck = loadedSweKeywords.length > 0 ? loadedSweKeywords : loadedKeywords;
      break;
    case 'pm_marketing':
      keywordsToCheck = loadedPmMarketingKeywords.length > 0 ? loadedPmMarketingKeywords : loadedKeywords;
      break;
    case 'design':
      // For design roles, also include frontend-relevant SWE keywords
      // (since many design roles require frontend knowledge)
      keywordsToCheck = [
        ...(loadedDesignKeywords.length > 0 ? loadedDesignKeywords : []),
        // Add frontend-relevant SWE keywords
        ...(loadedSweKeywords.filter(kw => {
          const kwLower = kw.toLowerCase();
          return /^(html|css|javascript|js|react|typescript|frontend|vue|angular|sass|less|tailwind|bootstrap|webpack)$/i.test(kwLower) ||
                 kwLower.includes('frontend') || kwLower.includes('front-end');
        }))
      ];
      keywordsToCheck = [...new Set(keywordsToCheck)]; // Remove duplicates
      break;
    case 'hybrid_design_swe':
      // Hybrid roles: Combine design + SWE keywords
      keywordsToCheck = [
        ...(loadedDesignKeywords.length > 0 ? loadedDesignKeywords : []),
        ...(loadedSweKeywords.length > 0 ? loadedSweKeywords : [])
      ];
      keywordsToCheck = [...new Set(keywordsToCheck)]; // Remove duplicates
      break;
    default:
      keywordsToCheck = loadedKeywords.length > 0 ? loadedKeywords : [];
  }
  
  // ALWAYS add soft keywords (they're relevant for all domains)
  // This ensures soft skills like "Communication", "Leadership", "Problem Solving" 
  // are checked regardless of whether the job is SWE, PM/Marketing, or Design
  keywordsToCheck = [...keywordsToCheck, ...loadedSoftKeywords];
  
  // Remove duplicates (in case soft keywords are already in domain-specific list)
  keywordsToCheck = [...new Set(keywordsToCheck)];
  
  // Suffix variations to check (reference: util.js lines 254-275)
  const suffixes = ["ing", "d", "ed", "s"];
  
  // Sort keywords by length (longest first) to match multi-word keywords first
  keywordsToCheck = keywordsToCheck.sort((a, b) => b.length - a.length);
  
  // Extract base keywords
  keywordsToCheck.forEach(keyword => {
    const keywordLower = keyword.toLowerCase();
    
    // Skip if we've already found this keyword (avoid duplicates)
    if (foundKeywordsLower.has(keywordLower)) {
      return;
    }
    
    // Escape special regex characters in the keyword
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // For multi-word phrases: Require lexical adjacency (words must be next to each other)
    let regexPattern;
    if (keyword.includes(' ')) {
      // Replace spaces with [\s-]+ to match space or hyphen between words only
      const flexiblePattern = escapedKeyword.split(/\s+/).join('[\\s-]+');
      // Make trailing 's' optional for pluralization/stemming
      regexPattern = `(?:^|[^a-zA-Z0-9])(${flexiblePattern})(s)?(?:$|[^a-zA-Z0-9])`;
    } else {
      // Single word - case-insensitive with optional trailing 's'
      regexPattern = `(?:^|[^a-zA-Z0-9])(${escapedKeyword})(s)?(?:$|[^a-zA-Z0-9])`;
    }
    
    const regex = new RegExp(regexPattern, 'i');
    
    // Use exec() instead of test() to capture the actual matched text from JD
    const match = regex.exec(text);
    if (match) {
      // Capture the actual matched text from the JD (match[1] is the captured group)
      const matchedText = match[1];
      foundKeywords.push(matchedText);  // Store actual matched text, not keyword from list
      foundKeywordsLower.add(keywordLower);
      return;
    }
    
    // PLURALIZATION: If keyword ends with 's', try matching without 's' (singular form)
    if (keyword.endsWith('s') && keyword.length > 3) {
      const singularKeyword = keyword.slice(0, -1);
      const escapedSingular = singularKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      let singularPattern;
      if (singularKeyword.includes(' ')) {
        singularPattern = escapedSingular.split(/\s+/).join('[\\s-]+');
      } else {
        singularPattern = escapedSingular;
      }
      
      const singularRegex = new RegExp(`(?:^|[^a-zA-Z0-9])(${singularPattern})(?:$|[^a-zA-Z0-9])`, 'i');
      const singularMatch = singularRegex.exec(text);
      if (singularMatch) {
        const matchedText = singularMatch[1];
        foundKeywords.push(matchedText);  // Store actual matched text
        foundKeywordsLower.add(keywordLower);
        return;
      }
    }
    
    // SUFFIX VARIATIONS: Check for "ing", "ed", "d" variations
    // Example: "test" matches "testing", "tested", "tests"
    for (const suffix of suffixes) {
      if (suffix === 's') continue; // Already handled above
      
      const keywordWithSuffix = keyword + suffix;
      const escapedSuffix = keywordWithSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      let suffixPattern;
      if (keyword.includes(' ')) {
        const flexiblePattern = escapedSuffix.split(/\s+/).join('[\\s-]+');
        suffixPattern = `(?:^|[^a-zA-Z0-9])(${flexiblePattern})(?:$|[^a-zA-Z0-9])`;
      } else {
        suffixPattern = `(?:^|[^a-zA-Z0-9])(${escapedSuffix})(?:$|[^a-zA-Z0-9])`;
      }
      
      const suffixRegex = new RegExp(suffixPattern, 'i');
      const suffixMatch = suffixRegex.exec(text);
      if (suffixMatch) {
        const matchedText = suffixMatch[1];
        foundKeywords.push(matchedText);  // Store actual matched text
        foundKeywordsLower.add(keywordLower);
        return;
      }
    }
  });
  
  // Return original matched text (preserve case for display)
  // Normalization will be done separately for comparison only
  return foundKeywords;
}

// Analyze resume against job description with domain detection
// Reference: Jobalytics util.js get_match_result and match_result_via_basic_algorithm
function analyzeResume(resumeText, jobDescription) {
  console.log('--- Starting Resume Analysis ---');
  console.log('Resume text length:', resumeText ? resumeText.length : 0);
  console.log('Job description length:', jobDescription ? jobDescription.length : 0);
  
  // STEP 5: Validation - Check if resume contains binary data
  if (resumeText && resumeText.startsWith('%PDF')) {
    console.error('❌ Resume contains binary PDF data - not parsed correctly');
    throw new Error('Resume was not parsed correctly. Please re-upload.');
  }
  
  // STEP 1: Detect domain from job metadata and description
  const jobTitle = currentJobMetadata.title || '';
  // Use source from metadata (hostname) or empty string
  const jobUrl = currentJobMetadata.source || '';
  const detectedDomain = detectJobDomain(jobTitle, jobDescription, jobUrl);
  
  // Store detected domain in metadata
  currentJobMetadata.domain = detectedDomain;
  
  console.log('🔍 Detected domain:', detectedDomain);
  console.log('Job Preview:', jobDescription ? jobDescription.substring(0, 300) : '(empty)');
  
  // STEP 2: Extract keywords from both texts (preserve original case for display)
  const resumeKeywordsOriginal = extractKeywords(resumeText, detectedDomain);
  const jobKeywordsOriginal = extractKeywords(jobDescription, detectedDomain);
  
  console.log('Keywords found in resume:', resumeKeywordsOriginal.length, resumeKeywordsOriginal);
  console.log('Keywords found in job description:', jobKeywordsOriginal.length, jobKeywordsOriginal);
  
  // STEP 3: Normalize keywords only for comparison (use canonical forms)
  // This ensures "HCD" and "human-centered design" both normalize to "hcd" for matching
  const resumeKeywords = normalizeForComparison(resumeKeywordsOriginal);
  const jobKeywords = normalizeForComparison(jobKeywordsOriginal);
  
  // Convert normalized keywords to lowercase for comparison
  const resumeKeywordsLower = resumeKeywords.map(kw => kw.toLowerCase());
  const jobKeywordsLower = jobKeywords.map(kw => kw.toLowerCase());
  
  // Find matched keywords (keywords that appear in both resume and job)
  // Use ORIGINAL text from job description for display
  const matchedKeywords = [];
  const matchedKeywordsLower = new Set();
  
  jobKeywordsOriginal.forEach(kwOriginal => {
    // Normalize the original keyword for comparison
    const kwNormalized = normalizeForComparison([kwOriginal])[0];
    const kwLower = kwNormalized.toLowerCase();
    
    if (resumeKeywordsLower.includes(kwLower) && !matchedKeywordsLower.has(kwLower)) {
      matchedKeywords.push(kwOriginal);  // Use original text for display
      matchedKeywordsLower.add(kwLower);
    }
  });
  
  // Find unmatched keywords (keywords in job but not in resume)
  // Use ORIGINAL text from job description for display
  const unmatchedKeywords = [];
  const unmatchedKeywordsLower = new Set();
  
  jobKeywordsOriginal.forEach(kwOriginal => {
    // Normalize the original keyword for comparison
    const kwNormalized = normalizeForComparison([kwOriginal])[0];
    const kwLower = kwNormalized.toLowerCase();
    
    if (!resumeKeywordsLower.includes(kwLower) && !unmatchedKeywordsLower.has(kwLower)) {
      unmatchedKeywords.push(kwOriginal);  // Use original text for display
      unmatchedKeywordsLower.add(kwLower);
    }
  });
  
  // STEP 4: Calculate score using basic algorithm (simple percentage)
  // Reference: Jobalytics match_result_via_basic_algorithm line 528
  const totalKeywordsInJob = matchedKeywords.length + unmatchedKeywords.length;
  const score = totalKeywordsInJob > 0 ? Math.round((matchedKeywords.length / totalKeywordsInJob) * 100) : 0;
  
  // Separate technical and soft skills for analytics
  const matchedTech = matchedKeywords.filter(kw => !isSoftSkill(kw));
  const matchedSoft = matchedKeywords.filter(kw => isSoftSkill(kw));
  const unmatchedTech = unmatchedKeywords.filter(kw => !isSoftSkill(kw));
  const unmatchedSoft = unmatchedKeywords.filter(kw => isSoftSkill(kw));
  
  console.log('✓ Matched keywords:', matchedKeywords.length, '(', matchedTech.length, 'technical +', matchedSoft.length, 'soft)');
  console.log('✗ Missing keywords:', unmatchedKeywords.length, '(', unmatchedTech.length, 'technical +', unmatchedSoft.length, 'soft)');
  console.log('Match score:', score + '%');
  console.log('Domain:', detectedDomain);
  console.log('--- Analysis Complete ---');
  
  return {
    score,
    matchedKeywords,
    unmatchedKeywords,
    totalKeywords: totalKeywordsInJob,
    matchedCount: matchedKeywords.length,
    matchedTech,
    matchedSoft,
    unmatchedTech,
    unmatchedSoft,
    domain: detectedDomain
  };
}

// Get job description from current page
async function getJobDescription() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if tab exists
    if (!tab || !tab.url) {
      console.warn('No active tab found');
      return '[ERROR] No active tab found. Please navigate to a job posting page.';
    }
    
    // Check if trying to access chrome:// URLs
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      console.warn('Cannot access chrome:// or extension URLs');
      return '[ERROR] Please navigate to a job posting page (LinkedIn, Indeed, etc.) to analyze.';
    }
    
    console.log('Extracting job description from:', tab.url);
    
    // Inject script to extract job description
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      function: () => {
        console.log('🔍 Scanning DOM for job details...');
        
        // STEP 1: Wait for element helper - retries for up to 2 seconds
        async function waitForElement(selectors, maxWaitMs = 2000) {
          const startTime = Date.now();
          const checkInterval = 200; // Check every 200ms
          const triedSelectors = [];
          const foundButEmpty = [];
          
          // Increase wait time for collections pages AND search results pages (content loads dynamically)
          const actualMaxWait = needsIframeCheck ? 5000 : maxWaitMs;
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:511',message:'waitForElement entry',data:{selectorCount:selectors.length,maxWaitMs:actualMaxWait,needsIframeCheck,isCollectionsPage,isSearchResultsPage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          while (Date.now() - startTime < actualMaxWait) {
            for (const selector of selectors) {
              try {
                const element = document.querySelector(selector);
                if (element) {
                  const text = (element.innerText || element.textContent || '').trim();
                  if (text.length > 100) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:520',message:'Element found with valid text',data:{selector,textLength:text.length,elapsed:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                    // #endregion
                    console.log(`✅ Element found after ${Date.now() - startTime}ms: "${selector}"`);
                    return { element, selector };
                  } else {
                    foundButEmpty.push({selector, textLength: text.length});
                  }
                } else {
                  triedSelectors.push(selector);
                }
              } catch (e) {
                // Skip invalid selector
              }
            }
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, checkInterval));
          }
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:534',message:'waitForElement timeout',data:{triedCount:triedSelectors.length,foundButEmptyCount:foundButEmpty.length,foundButEmpty:foundButEmpty.slice(0,3),elapsed:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          
          console.log(`⏱ Timeout: No valid element found after ${actualMaxWait}ms`);
          return null;
        }
        
        // Check if "See more" button exists on LinkedIn (indicates hidden content)
        const seeMoreButton = document.querySelector('.jobs-description__footer-button') || 
                             document.querySelector('[aria-label*="Show more"]') ||
                             document.querySelector('[aria-label*="See more"]');
        
        if (seeMoreButton) {
          console.log('⚠ "See more" button detected - scraping full description including hidden content');
        }
        
        // Self-profile filter phrases - if these appear, it's likely user's own profile content
        const profileFilterPhrases = [
          'My jobs',
          'My Career Insights',
          'Post a free job',
          'My Network',
          'My Profile',
          'Career advice',
          'Job seeker guidance',
          'Saved jobs'
        ];
        
        // Helper function to check if text contains profile content
        function isProfileContent(text) {
          const lowerText = text.toLowerCase();
          for (const phrase of profileFilterPhrases) {
            if (lowerText.includes(phrase.toLowerCase())) {
              console.log(`❌ Skipping - detected profile content: "${phrase}"`);
              return true;
            }
          }
          return false;
        }
        
        // STEP 1: High-precision selectors based on actual LinkedIn HTML structure
        // Check if we're on a collections page OR search results page - both use iframes
        const isCollectionsPage = window.location.pathname.includes('/collections/');
        const isSearchResultsPage = window.location.pathname.includes('/search-results/') && 
                                    window.location.search.includes('currentJobId');
        const isJobViewPage = window.location.pathname.includes('/view/') || 
                              window.location.pathname.includes('/jobs/view/');
        const needsIframeCheck = isCollectionsPage || isSearchResultsPage;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:589',message:'Page type detection',data:{url:window.location.href,pathname:window.location.pathname,isCollectionsPage,isSearchResultsPage,isJobViewPage,needsIframeCheck},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        const selectors = [
          // PRIMARY: LinkedIn job details ID (HIGHEST PRIORITY)
          '#job-details',
          
          // LinkedIn Collections Page selectors (for /jobs/collections/ pages)
          // Reference: Jobalytics crawler.js - linkedin_job_collection uses #job-details
          ...(isCollectionsPage ? [
            '#job-details', // Primary selector for collections (reference: Jobalytics)
            '.jobs-search__job-details',
            '.jobs-search__job-details-container',
            '[data-test-id="job-details"]',
            '.jobs-details__main-content',
            '.jobs-search__job-details__container',
            '.jobs-search__job-details-container .jobs-description',
            '.jobs-search__job-details-container .jobs-description__content',
            '.jobs-search__job-details-container .jobs-description__text',
            '.jobs-search__job-details-container [class*="description"]',
            '.details-pane__content .description', // Reference: Jobalytics crawler.js line 96
            '[class*="details-pane"] [class*="description"]'
          ] : []),
          
          // LinkedIn-specific selectors (confirmed working on 2026 structure)
          '.jobs-description-content__text--stretch',
          '.jobs-box__html-content',
          '.jobs-description__content',
          '.jobs-details__main-content',
          '.jobs-description-content__text',
          '.jobs-description-content',
          '.jobs-description__content--condensed',
          '.jobs-description',
          '[class*="jobs-search__job-details"]',
          '.jobs-details',
          
          // Indeed job description selectors
          '#jobDescriptionText',
          '.jobsearch-JobComponent-description',
          '.jobsearch-jobDescriptionText',
          '.jobsearch-JobComponent-embeddedBody', // For iframe content
          
          // Glassdoor selectors (reference: Jobalytics)
          'div[class*="JobDetails_jobDescriptionWrapper"]',
          '.jobDescriptionContent',
          
          // Workday selectors (reference: Jobalytics)
          '*[data-automation-id="jobPostingDescription"]',
          
          // Handshake selectors (reference: Jobalytics)
          '.style__container___3At56',
          
          // Generic job description selectors (lowest priority)
          '[data-job-description]',
          '.job-description',
          '.jobDescription',
          '[class*="job-description"]',
          '[id*="jobDescription"]',
          'article[role="main"]',
          '[role="article"]'
        ];
        
        // STEP 2: PRECISION metadata extraction with Jobalytics selectors
        // Reference: Jobalytics createPersistentScore.js (lines 56-116)
        async function extractJobMetadata() {
          console.log('📋 Extracting job metadata with Jobalytics-style selectors...');
          
          let title = '';
          let company = '';
          let date = '';
          const source = window.location.hostname;
          
          // Helper function to get text from class (reference: Jobalytics _text_from_class)
          function _text_from_class(class_name, doc = document) {
            const divs = doc.getElementsByClassName(class_name);
            if (divs.length == 0) {
              return '';
            }
            return divs[0].innerText.trim();
          }
          
          // Helper function to clean company name
          function cleanCompanyName(rawCompany) {
            if (!rawCompany) return '';
            let cleaned = rawCompany.trim();
            // Clean: Remove 'Show match details', 'H-1B', and other noise
            cleaned = cleaned.replace(/Show match details/gi, '');
            cleaned = cleaned.replace(/H-1B/gi, '');
            cleaned = cleaned.replace(/\(.*?\)/g, ''); // Remove anything in parentheses
            // Take only first line
            cleaned = cleaned.split('\n')[0].trim();
            // Normalize whitespace
            cleaned = cleaned.replace(/\s+/g, ' ').trim();
            return cleaned;
          }
          
          // Enhanced job title validation with confidence scoring
          function isValidJobTitle(title, context = {}) {
            if (!title || title.trim().length === 0) return { valid: false, confidence: 0, reason: 'empty' };
            
            const titleLower = title.toLowerCase().trim();
            const titleOriginal = title.trim();
            let confidence = 0;
            
            // REJECT invalid patterns (high priority - reject immediately)
            const invalidPatterns = [
              /^\d+\s+results?$/i,           // "10 results"
              /^search\s+results?$/i,
              /^jobs?$/i,
              /^find\s+jobs?$/i,
              /^job\s+search$/i,
              /^showing\s+\d+/i,
              /^page\s+\d+/i,
              /^results?$/i,
              /^no\s+results?$/i,
              /^try\s+again/i,
              /^error/i,
              /^loading/i,
              /^click\s+here/i,
              /^view\s+more/i,
              /^apply\s+now$/i,
              /^save\s+job$/i,
              /^share$/i,
              /^\d+$/i,                      // Only numbers
              /^[a-z]$/i                     // Single letter
            ];
            
            for (const pattern of invalidPatterns) {
              if (pattern.test(titleLower)) {
                return { valid: false, confidence: 0, reason: 'invalid pattern' };
              }
            }
            
            // LENGTH CHECK
            if (titleOriginal.length < 5 || titleOriginal.length > 150) {
              return { valid: false, confidence: 0, reason: 'invalid length' };
            }
            
            // POSITIVE PATTERNS (increase confidence)
            const jobPatterns = [
              /\b(engineer|developer|designer|manager|analyst|specialist|coordinator|director|architect|consultant|executive|officer|assistant|intern|trainee)\b/i,
              /\b(senior|junior|lead|principal|staff|associate|entry|mid)\s+\w+/i,
              /\b(software|product|data|marketing|sales|ux|ui|frontend|backend|full.?stack)\s+\w+/i,
              /\b(product\s+manager|pm|program\s+manager|project\s+manager)\b/i
            ];
            
            let hasJobPattern = false;
            for (const pattern of jobPatterns) {
              if (pattern.test(titleLower)) {
                confidence += 30;
                hasJobPattern = true;
                break;
              }
            }
            
            // FORMAT CHECK
            const hasProperCase = /[A-Z]/.test(titleOriginal) && /[a-z]/.test(titleOriginal);
            if (hasProperCase) confidence += 15;
            
            // CONTEXT BOOST (if from reliable source)
            if (context.source === 'json-ld' || context.source === 'structured-data') {
              confidence += 50; // Very high confidence
            } else if (context.source === 'meta-tag') {
              confidence += 40;
            } else if (context.source && context.source.includes('job-title')) {
              confidence += 35;
            } else if (context.isHeading && context.inJobContainer) {
              confidence += 25;
            }
            
            // MINIMUM THRESHOLD
            const MIN_CONFIDENCE = 30;
            if (confidence < MIN_CONFIDENCE) {
              return { valid: false, confidence: confidence, reason: 'low confidence' };
            }
            
            // If no job pattern matched, require higher confidence
            if (!hasJobPattern && confidence < 50) {
              return { valid: false, confidence: confidence, reason: 'no job pattern' };
            }
            
            return { valid: true, confidence: Math.min(confidence, 100) };
          }
          
          // Hybrid job title extraction with validation
          function extractJobTitleHybrid(doc = document) {
            console.log('🔍 Hybrid job title extraction...');
            
            let title = null;
            
            // PRIORITY 1: Structured Data (JSON-LD) - MOST RELIABLE
            if (!title) {
              const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
              for (const script of scripts) {
                try {
                  const data = JSON.parse(script.textContent);
                  
                  // Single object
                  if (data['@type'] === 'JobPosting' && data.title) {
                    const validation = isValidJobTitle(data.title.trim(), { source: 'json-ld' });
                    if (validation.valid) {
                      title = data.title.trim();
                      console.log(`✅ Title found (JSON-LD, confidence: ${validation.confidence}%): "${title}"`);
                      break;
                    }
                  }
                  
                  // Array format
                  if (Array.isArray(data)) {
                    for (const item of data) {
                      if (item['@type'] === 'JobPosting' && item.title) {
                        const validation = isValidJobTitle(item.title.trim(), { source: 'json-ld' });
                        if (validation.valid) {
                          title = item.title.trim();
                          console.log(`✅ Title found (JSON-LD array, confidence: ${validation.confidence}%): "${title}"`);
                          break;
                        }
                      }
                    }
                    if (title) break;
                  }
                  
                  // @graph format
                  if (data['@graph']) {
                    for (const item of data['@graph']) {
                      if (item['@type'] === 'JobPosting' && item.title) {
                        const validation = isValidJobTitle(item.title.trim(), { source: 'json-ld' });
                        if (validation.valid) {
                          title = item.title.trim();
                          console.log(`✅ Title found (JSON-LD @graph, confidence: ${validation.confidence}%): "${title}"`);
                          break;
                        }
                      }
                    }
                    if (title) break;
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
            
            // PRIORITY 2: Meta Tags
            if (!title) {
              const metaSelectors = [
                'meta[property="og:title"]',
                'meta[name="twitter:title"]',
                'meta[property="og:job:title"]',
                'meta[name="title"]'
              ];
              
              for (const selector of metaSelectors) {
                const meta = doc.querySelector(selector);
                if (meta) {
                  const text = (meta.getAttribute('content') || '').trim();
                  const validation = isValidJobTitle(text, { source: 'meta-tag' });
                  if (validation.valid) {
                    title = text;
                    console.log(`✅ Title found (meta tag, confidence: ${validation.confidence}%): "${title}"`);
                    break;
                  }
                }
              }
            }
            
            // PRIORITY 3: Known LinkedIn Selectors (with validation)
            if (!title) {
              const highConfidenceSelectors = [
                '.jobs-details-top-card__job-title',
                '.jobs-top-card__job-title',
                '.job-details-jobs-unified-top-card__job-title',
                '[data-test-job-title]',
                '[data-job-title]',
                '.job-details-top-card__job-title',
                '.jobs-details-top-card__job-title-link',
                '.jobs-top-card__job-title-link',
                'h2.jobs-details-top-card__job-title',
                'h2.jobs-top-card__job-title',
                '.jobs-unified-top-card__job-title'
              ];
              
              for (const selector of highConfidenceSelectors) {
                const el = doc.querySelector(selector);
                if (el) {
                  const text = (el.innerText || el.textContent || el.getAttribute('data-job-title') || '').trim();
                  if (text) {
                    const validation = isValidJobTitle(text.split('\n')[0].trim(), { 
                      source: `selector:${selector}`,
                      isHeading: el.tagName.match(/^H[1-4]$/),
                      inJobContainer: true
                    });
                    if (validation.valid) {
                      title = text.split('\n')[0].trim();
                      console.log(`✅ Title found (${selector}, confidence: ${validation.confidence}%): "${title}"`);
                      break;
            } else {
                      console.log(`❌ Rejected from ${selector}: "${text}" (${validation.reason})`);
                    }
                  }
                }
              }
            }
            
            // PRIORITY 4: Aria labels
          if (!title) {
              const ariaEl = doc.querySelector('[aria-label*="job title"], [aria-label*="Job Title"]');
              if (ariaEl) {
                const text = ariaEl.getAttribute('aria-label').replace(/job title:?/i, '').trim();
                const validation = isValidJobTitle(text);
                if (validation.valid) {
                  title = text;
                  console.log(`✅ Title found (aria-label, confidence: ${validation.confidence}%): "${title}"`);
                }
              }
            }
            
            // PRIORITY 5: Headings in job containers (with validation)
            if (!title) {
              const jobContainers = [
                '.jobs-details-top-card',
                '.jobs-top-card',
                '.job-details-jobs-unified-top-card',
                '.jobs-details',
                '[data-job-id]'
              ];
              
              for (const containerSel of jobContainers) {
                const container = doc.querySelector(containerSel);
                if (container) {
                  const headings = container.querySelectorAll('h1, h2, h3');
                  for (const heading of headings) {
                    const text = (heading.innerText || heading.textContent || '').trim();
                    const validation = isValidJobTitle(text, {
                      isHeading: true,
                      inJobContainer: true
                    });
                    if (validation.valid) {
                      title = text.split('\n')[0].trim();
                      console.log(`✅ Title found (heading in ${containerSel}, confidence: ${validation.confidence}%): "${title}"`);
                      break;
                    }
                  }
                  if (title) break;
                }
              }
            }
            
            // PRIORITY 6: Topcard fallback (logged-out)
            if (!title) {
              try {
                const detailsPane = doc.getElementsByClassName('details-pane__content')[0];
                if (detailsPane) {
                  const topcardTitle = detailsPane.getElementsByClassName('topcard__title')[0];
                  if (topcardTitle) {
                    const text = topcardTitle.textContent.trim();
                    const validation = isValidJobTitle(text);
                    if (validation.valid) {
                      title = text;
                      console.log(`✅ Title found (topcard, confidence: ${validation.confidence}%): "${title}"`);
                    }
                  }
                }
              } catch (err) {
                // Fallback failed
              }
            }
            
            return title;
          }
          
          // STEP 1: Check iframe content first (for collections pages AND search results pages)
          if (needsIframeCheck) {
            const pageType = isCollectionsPage ? 'collections' : 'search results';
            console.log(`🔍 Checking iframes for metadata (${pageType} page)...`);
            
            // Wait a bit for iframe content to load on search results pages (enhanced with MutationObserver)
            if (isSearchResultsPage) {
              console.log('⏳ Waiting for iframe content to load (search results page)...');
              
              // Enhanced iframe extraction with MutationObserver
              const iframeCheck = new Promise((resolve) => {
                let resolved = false;
                
                // Method 1: Wait with timeout
                setTimeout(() => {
                  if (!resolved) {
                    resolved = true;
                    resolve();
                  }
                }, 2000);
                
                // Method 2: Use MutationObserver to detect when iframe loads
                try {
                  const observer = new MutationObserver((mutations) => {
                    if (resolved) return;
                    
                    const iframes = document.querySelectorAll('iframe');
                    for (const iframe of iframes) {
                      try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (iframeDoc && iframeDoc.body && iframeDoc.body.innerText && iframeDoc.body.innerText.trim().length > 100) {
                          console.log('✓ Iframe content detected via MutationObserver');
                          if (!resolved) {
                            resolved = true;
                            observer.disconnect();
                            resolve();
                            return;
                          }
                        }
                      } catch (e) {
                        // Cross-origin
                      }
                    }
                  });
                  
                  observer.observe(document.body, {
                    childList: true,
                    subtree: true
                  });
                  
                  // Cleanup after 5 seconds
                  setTimeout(() => {
                    if (!resolved) {
                      resolved = true;
                      observer.disconnect();
                      resolve();
                    }
                  }, 5000);
                } catch (e) {
                  console.log('⚠️ MutationObserver not available, using timeout only');
                }
              });
              
              await iframeCheck;
            }
            
            const iframes = document.querySelectorAll('iframe');
            console.log(`📦 Found ${iframes.length} iframes to check`);
            
            for (const iframe of iframes) {
              try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc) {
                  // Check if iframe has content (not just empty)
                  const iframeBody = iframeDoc.body;
                  if (iframeBody && iframeBody.innerText && iframeBody.innerText.trim().length > 10) {
                    console.log(`✓ Iframe has content (${iframeBody.innerText.trim().length} chars)`);
                    
                    // Extract title from iframe using hybrid approach
                    if (!title) {
                      title = extractJobTitleHybrid(iframeDoc);
                      if (title) {
                        console.log(`✅ Title found in iframe: "${title}"`);
                      } else {
                        console.log('⚠️ No valid title found in iframe');
                      }
                    }
                    
                    // Extract company from iframe (Jobalytics selectors - note: uses -url not -name)
                    if (!company) {
                      const iframeCompany = _text_from_class('jobs-details-top-card__company-url', iframeDoc) ||
                                           _text_from_class('jobs-top-card__company-url', iframeDoc);
                      if (iframeCompany) {
                        company = cleanCompanyName(iframeCompany);
                        console.log(`✓ Company found in iframe: "${company}"`);
                      }
                    }
                    
                    // Extract date from iframe
                    if (!date) {
                      // Try time elements first
                      const timeEls = iframeDoc.querySelectorAll('time');
                      for (const timeEl of timeEls) {
                        const timeText = (timeEl.innerText || timeEl.textContent || timeEl.getAttribute('datetime') || '').trim();
                        if (timeText) {
                          date = timeText;
                          console.log(`✓ Date found in iframe (time element): "${date}"`);
                          break;
                        }
                      }
                      
                      // Try low-emphasis spans
                      if (!date) {
                        const lowEmphasisSpans = iframeDoc.querySelectorAll('.tvm__text--low-emphasis span');
                        const dateRegex = /\d+\s+(hour|day|week|month)s?\s+ago|just\s+now|today|yesterday/i;
                        for (const span of lowEmphasisSpans) {
                          const text = (span.innerText || span.textContent || '').trim();
                          const match = text.match(dateRegex);
                          if (match) {
                            date = match[0];
                            console.log(`✓ Date found in iframe (low-emphasis): "${date}"`);
                            break;
                          }
                        }
                      }
                    }
                    
                    // If we found all metadata in iframe, return early
                    if (title && company && date) {
                      console.log('✅ All metadata found in iframe, returning early');
                      break;
                    }
                  } else {
                    console.log('⚠️ Iframe appears empty or has no content');
                  }
                }
              } catch (e) {
                // Cross-origin iframe, can't access
                console.log('⚠️ Cannot access iframe (cross-origin or not loaded):', e.message);
              }
            }
            
            if (title || company || date) {
              console.log(`📋 Metadata from iframe: title="${title || 'not found'}", company="${company || 'not found'}", date="${date || 'not found'}"`);
            } else {
              console.log('⚠️ No metadata found in any iframe');
            }
          }
          
          // STEP 2: JOB TITLE - Multiple fallback methods
          if (!title) {
            console.log('🔍 Searching for job title using multiple methods...');
            
            // METHOD 1: Browser tab title extraction
            const pageTitle = document.title || '';
            if (pageTitle) {
              // Clean LinkedIn page title: "Job Title | Company | LinkedIn" or "Job Title - Company | LinkedIn"
              let cleanedTitle = pageTitle
                .replace(/\s*\|\s*LinkedIn.*$/i, '') // Remove "| LinkedIn" and everything after
                .replace(/\s*-\s*[^|]+\s*\|.*$/i, '') // Remove "- Company | ..."
                .replace(/\s*\|.*$/i, '') // Remove any remaining "| ..."
                .trim();
              
              const validation = isValidJobTitle(cleanedTitle);
              if (validation.valid) {
                title = cleanedTitle;
                console.log(`✅ Title found from browser tab (confidence: ${validation.confidence}%): "${title}"`);
              } else {
                console.log(`❌ Browser tab title rejected: "${cleanedTitle}" (${validation.reason})`);
              }
            }
            
            // METHOD 2: Visible DOM search on search results page
            if (!title && isSearchResultsPage) {
              // Get currentJobId from URL
              const urlParams = new URLSearchParams(window.location.search);
              const currentJobId = urlParams.get('currentJobId');
              
              if (currentJobId) {
                console.log(`🔍 Searching visible DOM for job card with ID: ${currentJobId}`);
                
                // Find the job card with matching data-job-id
                const jobCard = document.querySelector(`[data-job-id="${currentJobId}"]`) ||
                               document.querySelector(`[data-entity-urn*="${currentJobId}"]`) ||
                               document.querySelector(`[data-job-id*="${currentJobId}"]`);
                
                if (jobCard) {
                  console.log('✓ Found job card in visible DOM');
                  
                  // Look for title in the card
                  const titleSelectors = [
                    '.job-card-list__title',
                    '.jobs-search-results__list-item-title',
                    'h3',
                    'h2',
                    '[data-control-name="job_card_title"]',
                    '.job-card-container__link',
                    'a[data-control-name="job_card_title"]'
                  ];
                  
                  for (const selector of titleSelectors) {
                    const titleEl = jobCard.querySelector(selector);
                    if (titleEl) {
                      const text = (titleEl.innerText || titleEl.textContent || titleEl.getAttribute('aria-label') || '').trim();
                      if (text) {
                        const validation = isValidJobTitle(text);
                        if (validation.valid) {
                          title = text;
                          console.log(`✅ Title found from visible DOM (${selector}, confidence: ${validation.confidence}%): "${title}"`);
                          break;
                        } else {
                          console.log(`❌ Rejected from visible DOM (${selector}): "${text}" (${validation.reason})`);
                        }
                      }
                    }
                  }
                } else {
                  console.log('⚠️ Job card not found in visible DOM');
                }
              }
            }
            
            // METHOD 3: Parse job description text
            if (!title) {
              // Try to extract job description text from the page
              const jobDescSelectors = [
                '#job-details',
                '.jobs-description__content',
                '.jobs-description-content__text',
                '[data-job-id] .jobs-description',
                '.job-details__job-description',
                'section[data-test-id="job-details"]'
              ];
              
              let jobDescText = '';
              for (const selector of jobDescSelectors) {
                const descEl = document.querySelector(selector);
                if (descEl) {
                  jobDescText = (descEl.innerText || descEl.textContent || '').trim();
                  if (jobDescText && jobDescText.length > 50) {
                    break;
                  }
                }
              }
              
              // Also check iframes for job description
              if (!jobDescText || jobDescText.length < 50) {
                const iframes = document.querySelectorAll('iframe');
                for (const iframe of iframes) {
                  try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                      const iframeDescEl = iframeDoc.querySelector('#job-details') ||
                                          iframeDoc.querySelector('.jobs-description__content');
                      if (iframeDescEl) {
                        jobDescText = (iframeDescEl.innerText || iframeDescEl.textContent || '').trim();
                        if (jobDescText && jobDescText.length > 50) {
                          break;
                        }
                      }
                    }
                  } catch (e) {
                    // Cross-origin
                  }
                }
              }
              
              if (jobDescText && jobDescText.length > 50) {
                console.log(`🔍 Parsing job description text (${jobDescText.length} chars) for title...`);
                
                // Look for title patterns in first 300 characters
                const preview = jobDescText.substring(0, 300);
                
                // Pattern 1: "At [Company] we're looking for... [Job Title]"
                // Pattern 2: "Job Title - [description]"
                // Pattern 3: "We are seeking a [Job Title]"
                // Pattern 4: "[Job Title] Intern" or "[Job Title] Engineer"
                const titlePatterns = [
                  /(?:looking for|seeking|hiring)\s+(?:a\s+)?([A-Z][^.!?]{10,80}?)(?:\s+(?:to|who|that|intern|engineer|designer|manager|position|role))/i,
                  /^([A-Z][^.!?\n]{10,80}?)(?:\s*-\s*|\.|$)/m,
                  /(?:position|role|opening)[:\s]+([A-Z][^.!?\n]{10,80}?)(?:\s*$|\s*at\s+[A-Z])/i,
                  /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Intern|Engineer|Designer|Manager|Analyst|Specialist|Coordinator|Director|Architect|Consultant|Executive|Officer|Assistant|Trainee))/,
                  /(?:join our\s+)?(\d+[- ]week\s+[A-Z][^.!?]{10,60}?)(?:\s+program|internship)/i
                ];
                
                for (const pattern of titlePatterns) {
                  const match = preview.match(pattern);
                  if (match && match[1]) {
                    const candidate = match[1].trim();
                    const validation = isValidJobTitle(candidate);
                    if (validation.valid) {
                      title = candidate;
                      console.log(`✅ Title found from job description (confidence: ${validation.confidence}%): "${title}"`);
                      break;
                    }
                  }
                }
              }
            }
            
            // METHOD 4: Network request interception (optional, detects API calls)
            if (!title && isSearchResultsPage) {
              console.log('🔍 Attempting network request interception...');
              
              // Note: PerformanceObserver can detect requests but can't read response bodies
              // This is a placeholder for future enhancement with chrome.webRequest API
              try {
                const observer = new PerformanceObserver((list) => {
                  for (const entry of list.getEntries()) {
                    if (entry.name && (
                      entry.name.includes('voyager/api/graphql') ||
                      entry.name.includes('jobs/jobPostings') ||
                      entry.name.includes('jobPosting')
                    )) {
                      console.log('🔍 Detected LinkedIn job-related API request:', entry.name);
                      // Future: Could use chrome.webRequest API to intercept and parse responses
                      // For now, this just logs the detection
                    }
                  }
                });
                
                observer.observe({ entryTypes: ['resource'] });
                
                // Disconnect after 3 seconds
                setTimeout(() => {
                  observer.disconnect();
                }, 3000);
              } catch (e) {
                console.log('⚠️ PerformanceObserver not supported for network interception');
              }
            }
            
            // METHOD 5: Hybrid extraction with validation (existing method)
            if (!title) {
              title = extractJobTitleHybrid(document);
              if (title) {
                console.log(`✅ Title found via hybrid extraction: "${title}"`);
              } else {
                console.log('⚠️ No valid job title found via hybrid extraction');
              }
            }
          }
          
          // STEP 3: JOB COMPANY - Jobalytics selectors (reference: lines 85-116)
          // Note: Jobalytics uses -url not -name
          if (!company) {
          console.log('🔍 Searching for company name...');
            // Priority 1: jobs-details-top-card__company-url (logged-in search/collections)
            let rawCompany = _text_from_class('jobs-details-top-card__company-url');
            if (rawCompany) {
              company = cleanCompanyName(rawCompany);
              console.log(`✓ Company found (jobs-details-top-card__company-url): "${company}"`);
            }
            
            // Priority 2: jobs-top-card__company-url (direct view pages)
            if (!company) {
              rawCompany = _text_from_class('jobs-top-card__company-url');
              if (rawCompany) {
                company = cleanCompanyName(rawCompany);
                console.log(`✓ Company found (jobs-top-card__company-url): "${company}"`);
              }
            }
            
            // Priority 3: topcard__flavor[0] in details-pane__content (logged-out fallback)
            if (!company) {
              try {
                const detailsPane = document.getElementsByClassName('details-pane__content')[0];
                if (detailsPane) {
                  const topcardFlavor = detailsPane.getElementsByClassName('topcard__flavor')[0];
                  if (topcardFlavor) {
                    company = cleanCompanyName(topcardFlavor.textContent);
                    console.log(`✓ Company found (topcard__flavor, logged-out): "${company}"`);
                  }
                }
              } catch (err) {
                // Fallback failed
              }
            }
            
            // Priority 4: Current selector as fallback
            if (!company) {
              const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name a');
              if (companyEl && companyEl.innerText) {
                company = cleanCompanyName(companyEl.innerText);
                console.log(`✓ Company found (unified-top-card fallback): "${company}"`);
              }
            }
            
            // Priority 5: Other fallback selectors
          if (!company) {
            const companyFallbacks = [
              '.jobs-unified-top-card__company-name a',
              '.job-details-jobs-unified-top-card__company-name',
              'a[data-test-app-aware-link]'
            ];
            
            for (const sel of companyFallbacks) {
              const el = document.querySelector(sel);
              if (el && el.innerText && el.innerText.trim().length > 0) {
                  company = cleanCompanyName(el.innerText);
                console.log(`✓ Company found via fallback "${sel}": "${company}"`);
                break;
                }
              }
            }
          }
          
          // STEP 4: JOB POSTED DATE - Enhanced extraction
          if (!date) {
          console.log('🔍 Searching for posted date...');
            
            // Priority 1: time elements (semantic HTML)
            const timeEls = document.querySelectorAll('time');
            for (const timeEl of timeEls) {
              const timeText = (timeEl.innerText || timeEl.textContent || timeEl.getAttribute('datetime') || '').trim();
              if (timeText) {
                date = timeText;
                console.log(`✓ Date found (time element): "${date}"`);
                break;
              }
            }
            
            // Priority 2: tvm__text--low-emphasis spans (LinkedIn's low-emphasis text)
            if (!date) {
              const lowEmphasisSpans = document.querySelectorAll('.tvm__text--low-emphasis span');
              const dateRegex = /\d+\s+(hour|day|week|month)s?\s+ago|just\s+now|today|yesterday|posted\s+\d+\s+(hour|day|week|month)s?\s+ago/i;
              for (const span of lowEmphasisSpans) {
                const text = (span.innerText || span.textContent || '').trim();
                const match = text.match(dateRegex);
                if (match) {
                  date = match[0];
                  console.log(`✓ Date found (low-emphasis span): "${date}"`);
                  break;
                }
              }
            }
            
            // Priority 3: Search in job card containers
            if (!date) {
              const dateRegex = /\d+\s+(hour|day|week|month)s?\s+ago|just\s+now|today|yesterday|posted\s+\d+\s+(hour|day|week|month)s?\s+ago/i;
              const containers = [
                '.jobs-details-top-card__primary-description-container',
                '.jobs-top-card__primary-description',
                '.job-details-jobs-unified-top-card__primary-description-container'
              ];
              
              for (const containerSel of containers) {
                const container = document.querySelector(containerSel);
                if (container) {
                  const spans = container.querySelectorAll('span');
            for (const span of spans) {
              const text = (span.innerText || span.textContent || '').trim();
              const match = text.match(dateRegex);
              if (match) {
                      date = match[0];
                      console.log(`✓ Date found in container "${containerSel}": "${date}"`);
                break;
                    }
                  }
                  if (date) break;
                }
              }
            }
            
            // Priority 4: Generic search in job card (restricted scope)
            if (!date) {
              const dateRegex = /\d+\s+(hour|day|week|month)s?\s+ago|just\s+now|today|yesterday/i;
              const jobCard = document.querySelector('.jobs-details-top-card, .jobs-top-card, .job-details-jobs-unified-top-card');
              if (jobCard) {
                const allElements = jobCard.querySelectorAll('span, time');
                for (const el of allElements) {
                  const text = (el.innerText || el.textContent || '').trim();
                const match = text.match(dateRegex);
                if (match) {
                  date = match[0];
                    console.log(`✓ Date found in job card: "${date}"`);
                    break;
                }
              }
            }
          }
          
            // Priority 5: Generic fallback (last resort)
          if (!date) {
              const dateRegex = /\d+\s+(hour|day|week|month)s?\s+ago|just\s+now|today|yesterday/i;
            const allElements = document.querySelectorAll('span, time');
            for (const el of allElements) {
              const text = (el.innerText || el.textContent || '').trim();
              const match = text.match(dateRegex);
              if (match) {
                date = match[0];
                  console.log(`✓ Date found via generic search: "${date}"`);
                break;
                }
              }
            }
          }
          
          // HEURISTIC FALLBACK - If all specific selectors fail, use <main> element
          if (!title || !company || !date) {
            console.log('⚠ Some metadata missing, attempting heuristic fallback...');
            const mainElement = document.querySelector('main');
            
            if (mainElement) {
              const mainText = (mainElement.innerText || mainElement.textContent || '').trim();
              const lines = mainText.split('\n').filter(line => line.trim().length > 0);
              
              // Get first three distinct lines for missing fields
              const distinctLines = [];
              for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.length > 3 && !distinctLines.includes(trimmedLine)) {
                  distinctLines.push(trimmedLine);
                  if (distinctLines.length >= 3) break;
                }
              }
              
              if (!title && distinctLines.length > 0) {
                // Validate before accepting - try each line until we find a valid one
                for (const line of distinctLines) {
                  const validation = isValidJobTitle(line);
                  if (validation.valid) {
                    title = line;
                    console.log(`✅ Title from heuristic fallback (confidence: ${validation.confidence}%): "${title}"`);
                    break;
                  } else {
                    console.log(`❌ Rejected heuristic candidate: "${line}" (${validation.reason})`);
                  }
                }
              }
              if (!company && distinctLines.length > 1) {
                company = distinctLines[1];
                console.log(`✓ Company from heuristic fallback: "${company}"`);
              }
              if (!date && distinctLines.length > 2) {
                date = distinctLines[2];
                console.log(`✓ Date from heuristic fallback: "${date}"`);
              }
            }
          }
          
          // DYNAMIC UI SYNC - Set missing fields to 'Manual Entry Required'
          if (!title || title.trim() === '') {
            title = 'Manual Entry Required';
            console.log('⚠ Title not found - set to Manual Entry Required');
          }
          if (!company || company.trim() === '') {
            company = 'Manual Entry Required';
            console.log('⚠ Company not found - set to Manual Entry Required');
          }
          if (!date || date.trim() === '') {
            date = 'Manual Entry Required';
            console.log('⚠ Date not found - set to Manual Entry Required');
          }
          
          // STEP 3: UI SYNC - Update UI elements immediately with cleaned values
          console.log('🔄 Syncing cleaned metadata to UI elements...');
          const jobTitleTextEl = document.getElementById('job-title-text');
          const jobCompanyTextEl = document.getElementById('job-company-text');
          const jobPostedTextEl = document.getElementById('job-posted-text');
          
          if (jobTitleTextEl) {
            jobTitleTextEl.textContent = title;
            console.log(`✓ Updated job-title-text: "${title}"`);
          }
          if (jobCompanyTextEl) {
            jobCompanyTextEl.textContent = company;
            console.log(`✓ Updated job-company-text: "${company}"`);
          }
          if (jobPostedTextEl) {
            jobPostedTextEl.textContent = date;
            console.log(`✓ Updated job-posted-text: "${date}"`);
          }
          
          console.log('📋 Metadata extraction complete:', { title, company, date, source });
          return { title, company, date, source };
        }
        
        // Helper: Clean third-party extension noise
        function cleanExtensionNoise(text) {
          const thirdPartyArtifacts = [
            'Jobalytics',
            'Resume Match',
            'Increase your match score',
            'Job Match Score',
            'Match Rate',
            'Application Tracker',
            'Chrome Extension'
          ];
          
          const lines = text.split('\n');
          const filteredLines = lines.filter(line => {
            const lowerLine = line.toLowerCase();
            return !thirdPartyArtifacts.some(artifact => lowerLine.includes(artifact.toLowerCase()));
          });
          return filteredLines.join('\n').trim();
        }
        
        // Helper: Find "About the job" semantic anchor and extract metadata from it
        function findSemanticAnchor() {
          console.log('🔍 Searching for "About the job" semantic anchor...');
          
          // Look for h2, h3, or strong tags with exact text "About the job"
          const headingSelectors = ['h2', 'h3', 'strong', 'h4'];
          let anchorElement = null;
          
          for (const selector of headingSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              const text = (el.innerText || el.textContent || '').trim().toLowerCase();
              if (text === 'about the job' || text === 'about the role') {
                anchorElement = el;
                console.log(`✓ Semantic Anchor Found: "About the job" identified at node [${el.nodeName}]`);
                break;
              }
            }
            if (anchorElement) break;
          }
          
          return anchorElement;
        }
        
        // STEP 2: Extract metadata using "About the job" as anchor
        function extractMetadataFromAnchor(anchorElement) {
          console.log('📋 Extracting metadata using semantic anchor...');
          
          let title = '';
          let company = '';
          let date = '';
          
          // TITLE: Search upwards for nearest h1
          let currentNode = anchorElement;
          while (currentNode && currentNode !== document.body && !title) {
            if (currentNode.nodeName === 'H1') {
              const candidateTitle = (currentNode.innerText || currentNode.textContent || '').trim();
              const validation = isValidJobTitle(candidateTitle);
              if (validation.valid) {
                title = candidateTitle;
                console.log(`✅ Title found via upward search (confidence: ${validation.confidence}%): "${title}"`);
              break;
              } else {
                console.log(`❌ Rejected h1 from upward search: "${candidateTitle}" (${validation.reason})`);
                // Continue searching if invalid
              }
            }
            
            // Check siblings and parent
            if (!title) {
            const h1InParent = currentNode.parentElement?.querySelector('h1');
            if (h1InParent) {
                const candidateTitle = (h1InParent.innerText || h1InParent.textContent || '').trim();
                const validation = isValidJobTitle(candidateTitle);
                if (validation.valid) {
                  title = candidateTitle;
                  console.log(`✅ Title found in parent container (confidence: ${validation.confidence}%): "${title}"`);
              break;
                } else {
                  console.log(`❌ Rejected h1 from parent: "${candidateTitle}" (${validation.reason})`);
                  // Continue searching if invalid
                }
              }
            }
            
            currentNode = currentNode.parentElement;
          }
          
          // COMPANY: Search upwards for first <a> tag that doesn't contain 'jobs'
          currentNode = anchorElement;
          let searchDepth = 0;
          while (currentNode && currentNode !== document.body && searchDepth < 10) {
            const links = currentNode.querySelectorAll('a');
            for (const link of links) {
              const text = (link.innerText || link.textContent || '').trim();
              const lowerText = text.toLowerCase();
              if (text.length > 0 && 
                  !lowerText.includes('jobs') && 
                  !lowerText.includes('notification') &&
                  !lowerText.includes('message') &&
                  text !== title) {
                company = text.split('\n')[0].trim();
                console.log(`✓ Company found via anchor search: "${company}"`);
                break;
              }
            }
            
            if (company) break;
            currentNode = currentNode.parentElement;
            searchDepth++;
          }
          
          // POSTED: Search for span with "ago" within reasonable distance from anchor
          currentNode = anchorElement;
          searchDepth = 0;
          while (currentNode && currentNode !== document.body && searchDepth < 10) {
            const spans = currentNode.querySelectorAll('span');
            for (const span of spans) {
              const text = (span.innerText || span.textContent || '').trim();
              if (text.toLowerCase().includes('ago') && text.length < 50) {
                // Verify it's within ~500 pixels (check bounding rect)
                const anchorRect = anchorElement.getBoundingClientRect();
                const spanRect = span.getBoundingClientRect();
                const distance = Math.abs(anchorRect.top - spanRect.top);
                
                if (distance < 500) {
                  date = text;
                  console.log(`✓ Date found near anchor (${Math.round(distance)}px away): "${date}"`);
                  break;
                }
              }
            }
            
            if (date) break;
            currentNode = currentNode.parentElement;
            searchDepth++;
          }
          
          return { title, company, date };
        }
        
        // Main extraction function
        async function extractJobDescription() {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:936',message:'extractJobDescription entry',data:{url:window.location.href,pathname:window.location.pathname,hostname:window.location.hostname,selectorCount:selectors.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          
          console.log('🎯 Trying to find job description using', selectors.length, 'selectors...');
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:940',message:'Before waitForElement',data:{selectors:selectors.slice(0,5),iframeCount:document.querySelectorAll('iframe').length,bodyTextLength:document.body.innerText.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          
          // Try to find element with wait/retry logic
          const result = await waitForElement(selectors);
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:943',message:'After waitForElement',data:{resultFound:!!result,selector:result?.selector,elementTextLength:result?.element?.innerText?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          if (result) {
            const { element, selector } = result;
            // STEP 2: Use innerText for better readability
            const text = (element.innerText || element.textContent || '').trim();
            
            // SELF-PROFILE FILTER: Skip if contains profile-related phrases
            if (isProfileContent(text)) {
              console.log(`⏭ Element skipped due to profile content`);
              // Continue with fallback methods below
            } else {
              // STEP 3: Clean job scraper noise
              let cleanedText = cleanExtensionNoise(text);
              
              // Success! Log detailed extraction info
              const preview = cleanedText.substring(0, 100).replace(/\n/g, ' ');
              const hiddenNote = seeMoreButton ? ' (including hidden content)' : '';
              
              console.log(`✅ Success: Extracted via "${selector}"${hiddenNote}`);
              console.log(`📊 Original length: ${text.length} → Cleaned length: ${cleanedText.length} characters`);
              console.log(`📄 Preview: "${preview}..."`);
              
              // Extract metadata using heuristics
              const finalExtractedData = await extractJobMetadata();
              console.log(`📋 Metadata:`, finalExtractedData);
              
                return {
                text: cleanedText,
                  selector: selector,
                length: cleanedText.length,
                hasHiddenContent: !!seeMoreButton,
                preview: preview,
                metadata: finalExtractedData
              };
            }
          }
          
          // STEP 1: SEMANTIC ANCHOR FALLBACK - Look for "About the job" heading
          console.log('🔄 Trying semantic anchor fallback: searching for "About the job"...');
          const anchorElement = findSemanticAnchor();
          
          if (anchorElement) {
            // Navigate to parent and find next sibling with highest text density
            const parent = anchorElement.parentElement;
            let bestCandidate = null;
            let highestDensity = 0;
            
            if (parent) {
              // Check next siblings
              let sibling = anchorElement.nextElementSibling;
              let siblingCount = 0;
              
              while (sibling && siblingCount < 5) {
                const text = (sibling.innerText || sibling.textContent || '').trim();
                if (text.length > 200 && !isProfileContent(text)) {
                  if (text.length > highestDensity) {
                    highestDensity = text.length;
                    bestCandidate = sibling;
                  }
                }
                sibling = sibling.nextElementSibling;
                siblingCount++;
              }
              
              // If no good sibling found, try parent's next sibling
              if (!bestCandidate) {
                sibling = parent.nextElementSibling;
                siblingCount = 0;
                
                while (sibling && siblingCount < 3) {
                  const text = (sibling.innerText || sibling.textContent || '').trim();
                  if (text.length > 200 && !isProfileContent(text)) {
                    if (text.length > highestDensity) {
                      highestDensity = text.length;
                      bestCandidate = sibling;
                    }
                  }
                  sibling = sibling.nextElementSibling;
                  siblingCount++;
                }
              }
              
              if (bestCandidate) {
                let jobText = (bestCandidate.innerText || bestCandidate.textContent || '').trim();
                
                // STEP 3: Remove extension noise
                jobText = cleanExtensionNoise(jobText);
                
                console.log('✅ Success: Found via "About the job" semantic anchor');
                console.log(`📊 Length: ${jobText.length} characters (density: ${highestDensity})`);
                console.log(`📄 Preview: "${jobText.substring(0, 100)}..."`);
                
                // STEP 2: Extract metadata using anchor
                const anchorMetadata = extractMetadataFromAnchor(anchorElement);
                const source = window.location.hostname;
                
                // Merge with heuristic extraction as fallback
                const heuristicMetadata = await extractJobMetadata();
                const finalMetadata = {
                  title: anchorMetadata.title || heuristicMetadata.title,
                  company: anchorMetadata.company || heuristicMetadata.company,
                  date: anchorMetadata.date || heuristicMetadata.date,
                  source: source
                };
                
                console.log('📋 Metadata (semantic anchor + heuristic):', finalMetadata);
                
          return {
                    text: jobText,
                    selector: 'semantic-anchor (About the job)',
                    length: jobText.length,
                    hasHiddenContent: false,
                    preview: jobText.substring(0, 100),
                    metadata: finalMetadata
                  };
              }
            }
          }
          
          // Legacy fallback for other semantic markers
          console.log('🔄 Trying legacy fallback: searching for job description markers...');
          const allElements = document.querySelectorAll('div, section, article');
          
          for (const el of allElements) {
            const textContent = (el.textContent || '').trim();
            if (textContent.toLowerCase().includes('job description')) {
              
              // Try to get parent or parent's siblings
              const parent = el.parentElement;
              if (parent) {
                const parentText = (parent.innerText || parent.textContent || '').trim();
                if (parentText.length > 200 && !isProfileContent(parentText)) {
                  const cleanedText = cleanExtensionNoise(parentText);
                  console.log('✅ Success: Found via legacy "job description" fallback');
                  console.log(`📊 Length: ${cleanedText.length} characters`);
                  console.log(`📄 Preview: "${cleanedText.substring(0, 100)}..."`);
                  
                  const finalExtractedData = await extractJobMetadata();
          return {
                    text: cleanedText,
                    selector: 'fallback (job description)',
                    length: cleanedText.length,
                    hasHiddenContent: false,
                    preview: cleanedText.substring(0, 100),
                    metadata: finalExtractedData
                  };
                }
              }
            }
          }
          
          // STEP 4: Check iframes for LinkedIn collections pages AND search results pages (reference: Jobalytics crawler.js)
          if (needsIframeCheck) {
            const pageType = isCollectionsPage ? 'collections' : 'search results';
            console.log(`🔄 Checking iframes for ${pageType} page...`);
            
            // Wait for iframe to load on search results pages
            if (isSearchResultsPage) {
              console.log('⏳ Waiting for iframe content to load (search results page)...');
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
            
            const iframes = document.querySelectorAll('iframe');
            
            // #region agent log
            const iframeInfo = Array.from(iframes).map(iframe => ({
              src: iframe.src || 'no-src',
              id: iframe.id || 'no-id',
              className: iframe.className || 'no-class',
              hasContent: !!iframe.contentDocument
            }));
            fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:1095',message:`Checking iframes for ${pageType} page`,data:{iframeCount:iframes.length,iframes:iframeInfo.slice(0,3),isCollectionsPage,isSearchResultsPage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
            // #endregion
            
            // Reference: Jobalytics crawler.js lines 66-74 - handles Indeed iframe
            // For LinkedIn collections, check iframe with id="vjs-container-iframe" or similar
            for (const iframe of iframes) {
              try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc) {
                  // Try selectors inside iframe (reference: Jobalytics)
                  const iframeSelectors = [
                    '#job-details',
                    '.jobs-description__content',
                    '.jobs-description-content__text',
                    '.jobsearch-JobComponent-embeddedBody', // Indeed pattern
                    '.jobs-description',
                    '[class*="job-description"]'
                  ];
                  
                  for (const selector of iframeSelectors) {
                    const iframeElement = iframeDoc.querySelector(selector);
                    if (iframeElement) {
                      const iframeText = (iframeElement.innerText || iframeElement.textContent || '').trim();
                      if (iframeText.length > 100 && !isProfileContent(iframeText)) {
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:1120',message:'Found job description in iframe',data:{selector,textLength:iframeText.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
                        // #endregion
                        const cleanedText = cleanExtensionNoise(iframeText);
                        const finalExtractedData = await extractJobMetadata();
                        return {
                          text: cleanedText,
                          selector: `iframe:${selector}`,
                          length: cleanedText.length,
                          hasHiddenContent: false,
                          preview: cleanedText.substring(0, 100),
                          metadata: finalExtractedData
                        };
                      }
                    }
                  }
                }
              } catch (e) {
                // Cross-origin iframe, can't access - log it
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:1135',message:'Iframe access blocked (cross-origin)',data:{error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
                // #endregion
              }
            }
          }
          
          // STEP 5: If all else fails, log body content for debugging
          console.error('❌ All extraction methods failed');
          
          // #region agent log
          const iframes = Array.from(document.querySelectorAll('iframe')).map(iframe => ({
            src: iframe.src || 'no-src',
            id: iframe.id || 'no-id',
            className: iframe.className || 'no-class'
          }));
          const collectionsPageCheck = window.location.pathname.includes('/collections/');
          const jobViewCheck = window.location.pathname.includes('/view/') || window.location.pathname.includes('/jobs/view/');
          fetch('http://127.0.0.1:7242/ingest/3b595b84-3d7c-4c26-80fb-96782efb256f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sidepanel.js:1130',message:'All extraction methods failed',data:{url:window.location.href,pathname:window.location.pathname,isCollectionsPage:collectionsPageCheck,isJobView:jobViewCheck,iframeCount:iframes.length,iframes:iframes.slice(0,3),bodyTextLength:document.body.innerText.length,bodyPreview:document.body.innerText.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
          // #endregion
          
          const bodyPreview = (document.body.innerText || '').substring(0, 500);
          console.log('🔍 DEBUG - First 500 characters of body:', bodyPreview);
          
          // Check for common error states
          if (bodyPreview.toLowerCase().includes('sign in') || 
              bodyPreview.toLowerCase().includes('log in') ||
              bodyPreview.toLowerCase().includes('login')) {
            console.error('⚠ Possible login/auth page detected');
          } else if (bodyPreview.length < 50) {
            console.error('⚠ Page appears to be loading or empty');
        }
        
        // Extract metadata even on failure
        const finalExtractedData = await extractJobMetadata();
        
        return {
          text: '[ERROR] No job description found on this page.',
          selector: 'none',
            length: 0,
            hasHiddenContent: false,
            preview: bodyPreview,
            debugInfo: 'Check console for body preview',
            metadata: finalExtractedData
          };
        }
        
        // Execute the extraction
        return extractJobDescription();
      }
    });
    
    const result = results[0]?.result;
    
    if (result && result.text) {
      const hiddenNote = result.hasHiddenContent ? ' (with hidden content)' : '';
      console.log(`✅ Job description extracted${hiddenNote}: ${result.length} characters`);
      console.log(`🎯 Selector used: "${result.selector}"`);
      if (result.preview) {
        console.log(`📄 Content preview: "${result.preview}..."`);
      }
      
      // Store metadata
      if (result.metadata) {
        currentJobMetadata = result.metadata;
        console.log('📋 Metadata:', result.metadata);
      }
      
      return result.text;
    }
    
    console.warn('No job description extracted');
    return '[ERROR] No job description found on this page.';
    
  } catch (error) {
    console.error('Error getting job description:', error);
    
    // Provide helpful error messages
    if (error.message && error.message.includes('Cannot access')) {
      return '[ERROR] Cannot access this page. Please navigate to a public job posting page.';
    }
    
    // Check for permission errors
    if (error.message && (error.message.includes('Permission') || error.message.includes('permission'))) {
      return '[ERROR] Permission denied. Please reload the extension and ensure you have granted access to LinkedIn and Indeed. Go to chrome://extensions, find "Resume Optimizer", and make sure host permissions are enabled.';
    }
    
    // Check for internal Chrome errors
    if (error.message && error.message.toLowerCase().includes('internal')) {
      return '[ERROR] Internal Chrome Error. Try refreshing the job posting page and try again. If the issue persists, reload the extension from chrome://extensions.';
    }
    
    return '[ERROR] Failed to extract job description. Please make sure you are on a job posting page.';
  }
}

// Read resume file content
function readResumeFile(file) {
  return new Promise(async (resolve, reject) => {
    // Set PDF.js worker source at the start (required for PDF.js to work)
    // Use chrome.runtime.getURL to get the correct extension path for local worker file
    // Check if PDF.js is available and set worker source
    if (typeof window.pdfjsLib !== 'undefined') {
      const workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
      console.log('PDF.js worker source set (early):', workerSrc);
    }
    
    try {
      // Handle .txt files - extract actual text content
      if (file.type.includes('text') || file.name.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          console.log('Extracted text from .txt file:', e.target.result.substring(0, 100) + '...');
          // Return the actual text content from the file
          resolve(e.target.result);
        };
        reader.onerror = () => {
          reject(new Error('Failed to read text file. Please try again.'));
        };
        reader.readAsText(file);
      }
      // Handle .pdf files - use PDF.js to extract text
      else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        console.log('Parsing PDF file:', file.name);
        
        // Wait for PDF.js library to be available
        const pdfjs = await waitForPDFjs();
        
        // Final check if library is available
        if (!pdfjs || typeof pdfjs.getDocument === 'undefined') {
          console.error('PDF.js library not found after waiting. Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('pdf')));
          reject(new Error('PDF.js library not loaded. Please refresh the page and try again.'));
          return;
        }
        
        // Set PDF.js worker source (required for PDF.js to work)
        // Use chrome.runtime.getURL to get the correct extension path for local worker file
        const workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        console.log('PDF.js worker source set to:', workerSrc);
        console.log('PDF.js version:', pdfjs.version || 'unknown');
        
        // Read file as array buffer
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const arrayBuffer = e.target.result;
            console.log('PDF file read, size:', arrayBuffer.byteLength, 'bytes');
            
            // Load PDF document
            console.log('Attempting to load PDF document...');
            const loadingTask = pdfjs.getDocument({ 
              data: arrayBuffer,
              // Add error handling options
              verbosity: 0 // 0 = errors, 1 = warnings, 5 = infos
            });
            
            const pdf = await loadingTask.promise;
            console.log('PDF loaded successfully, total pages:', pdf.numPages);
            
            // Check if PDF has pages
            if (pdf.numPages === 0) {
              reject(new Error('PDF file has no pages.'));
              return;
            }
            
            // Extract text from all pages
            let fullText = '';
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              try {
                console.log(`Extracting text from page ${pageNum}/${pdf.numPages}...`);
                const page = await pdf.getPage(pageNum);
                
                // STEP 1: Properly await getTextContent()
                const textContent = await page.getTextContent();
                
                // STEP 2: Extract actual text strings from items
                let pageText = textContent.items.map(item => item.str).join(' ');
                
                // STEP 3: VALIDATION - Check if we're reading binary data
                if (pageText.includes('%PDF') || pageText.length > 20000) {
                  console.error(`⚠️ Page ${pageNum} contains binary data or is too large (${pageText.length} chars)`);
                  console.error('First 100 chars:', pageText.substring(0, 100));
                  reject(new Error('PDF parsing failed: Binary data detected. The PDF might be corrupted or not properly formatted.'));
                  return;
                }
                
                // STEP 4: Cleanup - Remove non-ASCII characters
                pageText = pageText.replace(/[^\x00-\x7F]/g, '');
                
                // Normalize whitespace
                pageText = pageText.replace(/\s+/g, ' ').trim();
                
                fullText += pageText + '\n';
                
                console.log(`✓ Page ${pageNum} extracted, cleaned text length:`, pageText.length);
              } catch (pageError) {
                console.error(`❌ Error extracting text from page ${pageNum}:`, pageError);
                // Continue with other pages even if one fails
                fullText += `\n[Error extracting text from page ${pageNum}]\n`;
              }
            }
            
            // Check if we got any text
            const trimmedText = fullText.trim();
            if (trimmedText.length === 0) {
              console.warn('No text extracted from PDF. The PDF might be image-based or scanned.');
              reject(new Error('No text found in PDF. The PDF might be image-based or scanned. Please use a PDF with selectable text.'));
              return;
            }
            
            console.log('PDF text extraction complete. Total length:', trimmedText.length);
            console.log('Extracted text preview:', trimmedText.substring(0, 200) + '...');
            
            resolve(trimmedText);
          } catch (error) {
            console.error('Error parsing PDF:', error);
            console.error('Error details:', {
              name: error.name,
              message: error.message,
              stack: error.stack
            });
            
            // Provide more specific error messages
            let errorMessage = 'Failed to extract text from PDF.';
            if (error.name === 'PasswordException' || error.message.includes('password')) {
              errorMessage = 'PDF is password-protected. Please remove the password and try again.';
            } else if (error.message.includes('Invalid PDF')) {
              errorMessage = 'Invalid PDF file. The file may be corrupted.';
            } else if (error.message.includes('worker')) {
              errorMessage = 'PDF.js worker failed to load. Please check if pdf.worker.min.js is available.';
            } else {
              errorMessage = `Failed to extract text from PDF: ${error.message || 'Unknown error'}`;
            }
            
            reject(new Error(errorMessage));
          }
        };
        reader.onerror = (error) => {
          console.error('FileReader error:', error);
          reject(new Error('Failed to read PDF file. Please try again.'));
        };
        reader.readAsArrayBuffer(file);
      }
      // Handle .docx files - use mammoth.js to extract text
      else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        console.log('Parsing DOCX file:', file.name);
        
        // Wait for Mammoth.js library to be available
        const mammoth = await waitForMammoth();
        
        // Check if mammoth is loaded
        if (!mammoth || typeof mammoth.extractRawText === 'undefined') {
          reject(new Error('Mammoth.js library not loaded. Please refresh the page.'));
          return;
        }
        
        // Read file as array buffer
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const arrayBuffer = e.target.result;
            
            // Extract raw text from DOCX using mammoth
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            
            console.log('DOCX text extraction complete. Length:', result.value.length);
            console.log('Extracted text preview:', result.value.substring(0, 200) + '...');
            
            // Check for warnings
            if (result.messages.length > 0) {
              console.warn('DOCX parsing warnings:', result.messages);
            }
            
            resolve(result.value.trim());
          } catch (error) {
            console.error('Error parsing DOCX:', error);
            reject(new Error('Failed to extract text from DOCX file. The file may be corrupted or in an unsupported format.'));
          }
        };
        reader.onerror = () => {
          reject(new Error('Failed to read DOCX file. Please try again.'));
        };
        reader.readAsArrayBuffer(file);
      }
      // Handle .doc files (old format - not supported by mammoth)
      else if (file.type === 'application/msword' || file.name.endsWith('.doc')) {
        reject(new Error('.doc files (old Word format) are not supported. Please convert to .docx or .txt format.'));
      }
      // Handle other file types
      else {
        reject(new Error('Unsupported file type. Please upload a .txt, .pdf, or .docx file.'));
      }
    } catch (error) {
      console.error('Error in readResumeFile:', error);
      reject(error);
    }
  });
}

// Highlight keywords in job description
// Reference: Jobalytics highlightKeywords.js
function highlightKeywordsInDescription(matchedKeywords, unmatchedKeywords, descriptionElement) {
  if (!descriptionElement || !descriptionElement.textContent) {
    console.log('⚠ No description element or content to highlight');
    return;
  }
  
  if ((!matchedKeywords || matchedKeywords.length === 0) && 
      (!unmatchedKeywords || unmatchedKeywords.length === 0)) {
    console.log('⚠ No keywords to highlight');
    return;
  }
  
  let text = descriptionElement.textContent;
  
  // Sort keywords by length (longest first) to avoid partial matches
  // Reference: Jobalytics line 34
  const sortedMatched = [...(matchedKeywords || [])].sort((a, b) => b.length - a.length);
  const sortedUnmatched = [...(unmatchedKeywords || [])].sort((a, b) => b.length - a.length);
  
  // Track which positions have been highlighted to avoid double-highlighting
  const highlightedRanges = [];
  
  // Helper: Check if a position range overlaps with already highlighted ranges
  function isOverlapping(start, end) {
    return highlightedRanges.some(range => {
      return (start >= range.start && start < range.end) ||
             (end > range.start && end <= range.end) ||
             (start <= range.start && end >= range.end);
    });
  }
  
  // Helper: Add range to highlighted list
  function addRange(start, end) {
    highlightedRanges.push({ start, end });
    highlightedRanges.sort((a, b) => a.start - b.start);
  }
  
  // Helper: Generate keyword variations (suffixes, spaces, dashes)
  // Reference: Jobalytics with_keyword_variations() lines 45-63
  function getKeywordVariations(keyword) {
    const variations = [keyword];
    const lowerKeyword = keyword.toLowerCase();
    
    // Suffix variations: ing, ed, d, s
    // Reference: Jobalytics line 84
    const suffixes = ['ing', 'ed', 'd', 's'];
    suffixes.forEach(suffix => {
      if (!lowerKeyword.endsWith(suffix)) {
        variations.push(keyword + suffix);
        variations.push(lowerKeyword + suffix);
      }
    });
    
    // Space variations: "user research" → "user-research", "userresearch"
    if (keyword.includes(' ')) {
      variations.push(keyword.replace(/\s+/g, '-'));
      variations.push(keyword.replace(/\s+/g, ''));
      variations.push(lowerKeyword.replace(/\s+/g, '-'));
      variations.push(lowerKeyword.replace(/\s+/g, ''));
    }
    
    // Dash variations: "user-research" → "user research", "userresearch"
    if (keyword.includes('-')) {
      variations.push(keyword.replace(/-/g, ' '));
      variations.push(keyword.replace(/-/g, ''));
      variations.push(lowerKeyword.replace(/-/g, ' '));
      variations.push(lowerKeyword.replace(/-/g, ''));
    }
    
    // Case variations
    variations.push(keyword.toLowerCase());
    variations.push(keyword.toUpperCase());
    if (keyword.length > 0) {
      variations.push(keyword[0].toUpperCase() + keyword.slice(1).toLowerCase());
    }
    
    return [...new Set(variations)];
  }
  
  // Helper: Escape special regex characters
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // Helper: Escape HTML to prevent XSS
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  // Helper: Create regex pattern for keyword matching
  // Reference: Jobalytics highlight_single_elm() lines 87-140
  function createKeywordPattern(keyword) {
    const escaped = escapeRegex(keyword);
    // Handle multi-word keywords with flexible spacing/hyphenation
    if (keyword.includes(' ') || keyword.includes('-')) {
      const parts = escaped.split(/[\s-]+/);
      const flexiblePattern = parts.join('[\\s-]+');
      // Word boundaries for multi-word phrases
      return new RegExp(`(?:^|[^a-zA-Z0-9])(${flexiblePattern})(?:$|[^a-zA-Z0-9])`, 'gi');
    } else {
      // Single word with word boundaries
      return new RegExp(`(?:^|[^a-zA-Z0-9])(${escaped})(?:$|[^a-zA-Z0-9])`, 'gi');
    }
  }
  
  // Helper: Escape HTML to prevent XSS
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  // Collect all matches with their positions
  const allMatches = [];
  
  // Process matched keywords (green)
  sortedMatched.forEach(keyword => {
    const variations = getKeywordVariations(keyword);
    variations.forEach(variation => {
      const pattern = createKeywordPattern(variation);
      let match;
      // Reset lastIndex before each search
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        // match[0] is the full match including word boundaries
        // match[1] is the captured keyword group
        // Find where match[1] starts within match[0]
        const fullMatch = match[0];
        const keywordMatch = match[1];
        const offsetInFullMatch = fullMatch.indexOf(keywordMatch);
        const start = match.index + offsetInFullMatch;
        const end = start + keywordMatch.length;
        
        if (!isOverlapping(start, end) && start >= 0 && end <= text.length) {
          allMatches.push({
            start,
            end,
            keyword: keywordMatch,
            isMatched: true
          });
        }
      }
    });
  });
  
  // Process unmatched keywords (yellow)
  sortedUnmatched.forEach(keyword => {
    const variations = getKeywordVariations(keyword);
    variations.forEach(variation => {
      const pattern = createKeywordPattern(variation);
      let match;
      // Reset lastIndex before each search
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        // match[0] is the full match including word boundaries
        // match[1] is the captured keyword group
        // Find where match[1] starts within match[0]
        const fullMatch = match[0];
        const keywordMatch = match[1];
        const offsetInFullMatch = fullMatch.indexOf(keywordMatch);
        const start = match.index + offsetInFullMatch;
        const end = start + keywordMatch.length;
        
        if (!isOverlapping(start, end) && start >= 0 && end <= text.length) {
          allMatches.push({
            start,
            end,
            keyword: keywordMatch,
            isMatched: false
          });
        }
      }
    });
  });
  
  // Sort matches by start position, then by length (longest first for same start)
  allMatches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end; // Longer matches first
  });
  
  // Remove overlapping matches (keep first/longest)
  const nonOverlappingMatches = [];
  for (const match of allMatches) {
    if (!isOverlapping(match.start, match.end)) {
      nonOverlappingMatches.push(match);
      addRange(match.start, match.end);
    }
  }
  
  // Build highlighted HTML
  let highlightedHTML = '';
  let lastIndex = 0;
  
  for (const match of nonOverlappingMatches) {
    // Add text before match
    if (match.start > lastIndex) {
      const beforeText = text.substring(lastIndex, match.start);
      highlightedHTML += escapeHTML(beforeText);
    }
    
    // Add highlighted match
    const matchText = text.substring(match.start, match.end);
    const className = match.isMatched ? 'keyword-matched' : 'keyword-unmatched';
    highlightedHTML += `<span class="${className}">${escapeHTML(matchText)}</span>`;
    
    lastIndex = match.end;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    highlightedHTML += escapeHTML(text.substring(lastIndex));
  }
  
  // Replace element content with highlighted version
  // Preserve white-space: pre-line styling
  descriptionElement.innerHTML = highlightedHTML;
  
  const matchedCount = nonOverlappingMatches.filter(m => m.isMatched).length;
  const unmatchedCount = nonOverlappingMatches.filter(m => !m.isMatched).length;
  console.log(`✓ Highlighted ${matchedCount} matched and ${unmatchedCount} unmatched keywords`);
}

// Update UI with analysis results
function updateUI(analysis) {
  // Clear previous keywords grid at the very beginning to prevent old hardcoded tags
  const keywordsGrid = document.querySelector('.keywords-grid');
  keywordsGrid.innerHTML = '';
  
  const scoreNumber = document.getElementById('score-number');
  
  // Update score (remove loading state if present)
  scoreNumber.textContent = analysis.score;
  scoreNumber.classList.remove('loading');
  
  // Update progress bar
  const progressFill = document.getElementById('progress-fill');
  progressFill.style.width = `${analysis.score}%`;
  if (analysis.score >= 70) {
    progressFill.style.backgroundColor = '#00c950';
  } else {
    progressFill.style.backgroundColor = '#fcb44f';
  }
  
  // Update description
  const description = document.querySelector('.score-description');
  description.innerHTML = `Your resume has <strong>${analysis.matchedCount} out of ${analysis.totalKeywords} (${analysis.score}%)</strong> keywords that appear in the job description.`;
  
  // Update keyword count badge
  const keywordCount = document.querySelector('.keyword-count');
  keywordCount.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 2.5L4.5 8L2 5.5" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    ${analysis.matchedCount}/${analysis.totalKeywords}
  `;
  
  // STEP 1: Update Detected Job section with real data from currentJobMetadata
  console.log('📋 Updating UI with metadata:', currentJobMetadata);
  
  // Get all job-related elements (both in main view and edit view)
  const jobTitleEl = document.getElementById('job-title-text');
  const jobCompanyEl = document.getElementById('job-company-text');
  const jobSourceEl = document.getElementById('job-source-text');
  const jobPostedEl = document.getElementById('job-posted-text');
  const jobDescriptionEl = document.getElementById('job-description-full');
  
  const jobTitleMainEl = document.getElementById('job-title-main');
  const jobMetaMainEl = document.getElementById('job-meta-main');
  const jobDateMainEl = document.getElementById('job-date-main');
  const jobIconEl = document.getElementById('job-icon');
  
  // STEP 1: Update Job Edit View (job-view) - ensure fields are populated
  if (jobTitleEl) {
    jobTitleEl.textContent = currentJobMetadata.title || 'Job Title Not Found';
    console.log('✓ Updated job-title-text:', jobTitleEl.textContent);
  }
  if (jobCompanyEl) {
    jobCompanyEl.textContent = currentJobMetadata.company || 'Company Not Found';
    console.log('✓ Updated job-company-text:', jobCompanyEl.textContent);
  }
  if (jobSourceEl) {
    jobSourceEl.textContent = currentJobMetadata.source || 'Unknown Source';
    console.log('✓ Updated job-source-text:', jobSourceEl.textContent);
  }
  if (jobPostedEl) {
    jobPostedEl.textContent = currentJobMetadata.date || 'Date Unknown';
    console.log('✓ Updated job-posted-text:', jobPostedEl.textContent);
  }
  if (jobDescriptionEl) {
    // Set text content first
    jobDescriptionEl.textContent = currentJobDescription || 'No description available';
    console.log('✓ Updated job-description-full, length:', (currentJobDescription || '').length);
    
    // Highlight keywords in job description
    if (currentJobDescription && analysis) {
      highlightKeywordsInDescription(
        analysis.matchedKeywords || [],
        analysis.unmatchedKeywords || [],
        jobDescriptionEl
      );
    }
  }
  
  // STEP 1: Update Main View Job Card - ensure fields are populated in real-time
  if (jobTitleMainEl) {
    jobTitleMainEl.textContent = currentJobMetadata.title || 'Job Title Not Found';
    console.log('✓ Updated job-title-main:', jobTitleMainEl.textContent);
  }
  if (jobMetaMainEl) {
    // STEP 2: Clean and format source name
    let source = currentJobMetadata.source || 'Unknown';
    source = source.replace('www.', '').replace('.com', '');
    // Capitalize first letter for display
    source = source.charAt(0).toUpperCase() + source.slice(1);
    
    const company = currentJobMetadata.company || 'Company Unknown';
    jobMetaMainEl.textContent = `${source} • ${company}`;
    console.log('✓ Updated job-meta-main:', jobMetaMainEl.textContent);
  }
  if (jobDateMainEl) {
    jobDateMainEl.textContent = currentJobMetadata.date || 'Date Unknown';
    console.log('✓ Updated job-date-main:', jobDateMainEl.textContent);
  }
  if (jobIconEl) {
    // Set icon based on source
    const source = (currentJobMetadata.source || '').toLowerCase();
    if (source.includes('linkedin')) {
      jobIconEl.textContent = 'LI';
      jobIconEl.style.backgroundColor = '#0077B5';
      console.log('✓ Updated job-icon: LinkedIn');
    } else if (source.includes('indeed')) {
      jobIconEl.textContent = 'IN';
      jobIconEl.style.backgroundColor = '#2164f3';
      console.log('✓ Updated job-icon: Indeed');
    } else if (source.includes('glassdoor')) {
      jobIconEl.textContent = 'GD';
      jobIconEl.style.backgroundColor = '#0caa41';
      console.log('✓ Updated job-icon: Glassdoor');
    } else {
      jobIconEl.textContent = source.substring(0, 2).toUpperCase() || 'JB';
      jobIconEl.style.backgroundColor = '#6b7280';
      console.log('✓ Updated job-icon: Generic');
    }
  }
  
  console.log('✅ UI update complete - all job metadata fields updated');
  
  // Add unmatched keywords first (yellow - all the same)
  analysis.unmatchedKeywords.forEach(keyword => {
    const tag = document.createElement('span');
    tag.className = 'keyword-tag unmatched';
    tag.setAttribute('data-keyword', keyword);
    tag.textContent = keyword;
    tag.addEventListener('click', () => openKeywordView(keyword));
    keywordsGrid.appendChild(tag);
  });
  
  // Add matched keywords (green - all the same)
  analysis.matchedKeywords.forEach(keyword => {
    const tag = document.createElement('span');
    tag.className = 'keyword-tag matched';
    tag.innerHTML = `
      <svg class="checkmark" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.6667 3.5L5.25 10L2.33333 7" stroke="#008236" stroke-width="1.45833" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      ${keyword}
    `;
    keywordsGrid.appendChild(tag);
  });
}

// Perform scan and analysis
async function performScan() {
  console.log('Scanning resume and job description...');
  
  // Show loading state on score
  const scoreNumber = document.getElementById('score-number');
  scoreNumber.textContent = 'Analyzing...';
  scoreNumber.classList.add('loading');
  
  // Show loading state on buttons
  const refreshBtn = document.getElementById('refresh-btn');
  const scanPageBtn = document.getElementById('scan-page-btn');
  refreshBtn.style.opacity = '0.5';
  refreshBtn.disabled = true;
  if (scanPageBtn) {
    scanPageBtn.style.opacity = '0.5';
    scanPageBtn.disabled = true;
  }
  
  try {
    // Get job description from current page
    const jobDescription = await getJobDescription();
    currentJobDescription = jobDescription;
    
    // Check if job description extraction returned an error message
    if (jobDescription.startsWith('[ERROR]')) {
      console.warn('Job description extraction failed:', jobDescription);
      
      // Display error message to user instead of trying to analyze
      const errorMessage = jobDescription.replace('[ERROR] ', '');
      alert(errorMessage);
      
      // Reset to default state (don't run analysis on error message)
      return;
    }
    
    // Check if job description is empty or too short
    if (!jobDescription || jobDescription.trim().length < 50) {
      console.warn('Job description is empty or too short:', jobDescription.length, 'characters');
      alert('No meaningful job description found on this page. Please navigate to a job posting with a detailed description.');
      return;
    }
    
    // DEBUG: Log the final character count
    console.log('✓ Job description extracted successfully');
    console.log('📊 Total character count:', jobDescription.length, 'characters');
    console.log('📄 Preview (first 200 chars):', jobDescription.substring(0, 200) + '...');
    
    // Step 1: Check if currentResumeText exists and is not empty
    // If no resume exists, use a default placeholder with common tech keywords
    // This allows analysis to work even without an uploaded resume
    const resumeText = (currentResumeText && currentResumeText.trim() !== '') 
      ? currentResumeText 
      : 'JavaScript React TypeScript Node.js Python Git SQL MongoDB HTML CSS';
    
    console.log('Analyzing resume vs job description...');
    
    // Perform analysis
    const analysis = analyzeResume(resumeText, jobDescription);
    
    console.log('Analysis complete:', {
      score: analysis.score,
      matchedCount: analysis.matchedCount,
      totalKeywords: analysis.totalKeywords,
      matchedKeywords: analysis.matchedKeywords,
      unmatchedKeywords: analysis.unmatchedKeywords
    });
    
    // Update UI
    updateUI(analysis);
    
  } catch (error) {
    console.error('Error during scan:', error);
    alert('Error scanning page. Please make sure you are on a job posting page and try again.');
    
    // Remove loading state on error
    const scoreNumber = document.getElementById('score-number');
    scoreNumber.textContent = '0';
    scoreNumber.classList.remove('loading');
  } finally {
    refreshBtn.style.opacity = '1';
    refreshBtn.disabled = false;
    if (scanPageBtn) {
      scanPageBtn.style.opacity = '1';
      scanPageBtn.disabled = false;
    }
  }
}

// Show view helper
function showView(view) {
  // Hide all views
  mainView.style.display = 'none';
  keywordView.style.display = 'none';
  jobView.style.display = 'none';
  
  // Show selected view
  view.style.display = 'flex';
}

// Close button handler
document.getElementById('close-btn')?.addEventListener('click', () => {
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
  window.close();
});

// Refresh button handler
document.getElementById('refresh-btn')?.addEventListener('click', () => {
  performScan();
});

// Scan Current Page button handler
document.getElementById('scan-page-btn')?.addEventListener('click', () => {
  performScan();
});

// Upload button handler
document.getElementById('upload-btn')?.addEventListener('click', () => {
  document.getElementById('resume-upload').click();
});

// File upload handler
document.getElementById('resume-upload')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (file) {
    // Update UI to show the selected file name
    document.getElementById('current-file').textContent = file.name;
    console.log('Uploaded file:', file.name, 'Type:', file.type);
    
    try {
      // Step 1: Read and parse file content using readResumeFile()
      // This handles .txt, .pdf, and .docx files
      const fileContent = await readResumeFile(file);
      
      console.log('File parsed successfully. Content length:', fileContent.length);
      console.log('Content preview:', fileContent.substring(0, 300) + '...');
      
      // Step 2: Save to chrome.storage.local (works for all supported file types)
      await chrome.storage.local.set({
        resumeText: fileContent,
        resumeFilename: file.name
      });
      
      // Step 3: Update currentResumeText variable
      currentResumeText = fileContent;
      
      // Step 4: Show success message to user
      console.log('Resume saved successfully:', file.name);
      
      // Step 5: Perform scan after successful upload
      await performScan();
    } catch (error) {
      console.error('Error reading/parsing file:', error);
      
      // STEP 3: Clear storage on failure to prevent using corrupted data
      console.log('Clearing storage due to file upload error...');
      await chrome.storage.local.remove(['resumeText', 'resumeFilename']);
      currentResumeText = '';
      
      // Show user-friendly error message
      alert(error.message || 'Error reading resume file. Please try again.');
      // Reset file input on error
      e.target.value = '';
      document.getElementById('current-file').textContent = 'No file selected';
    }
  }
});

// Keyword click handlers - open keyword detail view
function attachKeywordHandlers() {
  document.querySelectorAll('.keyword-tag.unmatched').forEach(tag => {
    tag.addEventListener('click', () => {
      const keyword = tag.getAttribute('data-keyword') || tag.textContent.trim();
      openKeywordView(keyword);
    });
  });
}

// Open keyword detail view
function openKeywordView(keyword) {
  const suggestions = keywordSuggestions[keyword] || {
    skill: `Add ${keyword} to your technical skills section`,
    summary: `Consider mentioning ${keyword} in your professional summary`,
    original: 'Your current resume text'
  };

  // Update selected keyword tag
  document.getElementById('selected-keyword-tag').textContent = keyword;

  // Update suggestions
  document.getElementById('skill-suggestion').textContent = suggestions.skill;
  document.getElementById('summary-suggestion').textContent = suggestions.summary;
  document.getElementById('original-text').textContent = suggestions.original;

  // Show keyword view
  showView(keywordView);
}

// Back button from keyword view
document.getElementById('back-from-keyword')?.addEventListener('click', () => {
  showView(mainView);
});

// Edit job button handler
document.getElementById('edit-job-btn')?.addEventListener('click', () => {
  showView(jobView);
});

// Back button from job view
document.getElementById('back-from-job')?.addEventListener('click', () => {
  showView(mainView);
});

// STEP 3: Add listener for manual edits to job description
let editTimeout = null;
const jobDescriptionEl = document.getElementById('job-description-full');
const saveRescanBtn = document.getElementById('save-rescan-btn');

if (jobDescriptionEl) {
  // Show save button when user starts editing
  jobDescriptionEl.addEventListener('input', () => {
    if (saveRescanBtn) {
      saveRescanBtn.style.display = 'block';
    }
  });
  
  // Auto-trigger re-scan after user stops typing (debounced)
  jobDescriptionEl.addEventListener('input', () => {
    clearTimeout(editTimeout);
    editTimeout = setTimeout(() => {
      console.log('📝 Job description manually edited - auto re-scanning...');
      // Update currentJobDescription with edited content
      currentJobDescription = jobDescriptionEl.textContent || '';
      
      // Re-analyze with edited description
      if (currentResumeText && currentResumeText.trim() !== '') {
        const analysis = analyzeResume(currentResumeText, currentJobDescription);
        updateUI(analysis);
        
        // Hide save button after successful re-scan
        if (saveRescanBtn) {
          saveRescanBtn.style.display = 'none';
        }
      }
    }, 2000); // Wait 2 seconds after user stops typing
  });
}

// Manual Save & Re-scan button
if (saveRescanBtn) {
  saveRescanBtn.addEventListener('click', () => {
    console.log('💾 Save & Re-scan triggered manually');
    
    // Update currentJobDescription with edited content
    if (jobDescriptionEl) {
      currentJobDescription = jobDescriptionEl.textContent || '';
    }
    
    // Re-analyze with edited description
    if (currentResumeText && currentResumeText.trim() !== '') {
      const analysis = analyzeResume(currentResumeText, currentJobDescription);
      updateUI(analysis);
      
      // Hide save button after successful re-scan
      saveRescanBtn.style.display = 'none';
      
      // Show success feedback
      const originalText = saveRescanBtn.textContent;
      saveRescanBtn.textContent = '✓ Saved';
      setTimeout(() => {
        saveRescanBtn.textContent = originalText;
      }, 2000);
    }
  });
}

// Copy button handlers
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const copyType = btn.getAttribute('data-copy');
    let textToCopy = '';

    if (copyType === 'skill') {
      textToCopy = document.getElementById('skill-suggestion').textContent;
    } else if (copyType === 'summary') {
      textToCopy = document.getElementById('summary-suggestion').textContent;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      
      // Update button to show "Copied" state
      const copyIcon = btn.querySelector('.copy-icon');
      const copyText = btn.querySelector('.copy-text');
      
      // Store original SVG
      const originalSVG = copyIcon.outerHTML;
      const originalText = copyText.textContent;
      
      // Replace icon with checkmark
      copyIcon.outerHTML = '<svg class="copy-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.6667 3.5L5.25 10L2.33333 7" stroke="#1447E6" stroke-width="1.45833" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      copyText.textContent = 'Copied';
      
      // Reset after 2 seconds
      setTimeout(() => {
        const newIcon = btn.querySelector('.copy-icon');
        if (newIcon) {
          newIcon.outerHTML = originalSVG;
        }
        copyText.textContent = originalText;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      
      // Show feedback even with fallback
      const copyText = btn.querySelector('.copy-text');
      const originalText = copyText.textContent;
      copyText.textContent = 'Copied';
      setTimeout(() => {
        copyText.textContent = originalText;
      }, 2000);
    }
  });
});

// Debounce timer for tab updates
let tabUpdateDebounceTimer = null;

// Listen for tab updates (when user switches job pages)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only trigger if page is completely loaded and resume is already loaded
  if (changeInfo.status === 'complete' && currentResumeText && currentResumeText.trim() !== '') {
    console.log('Tab updated, scheduling auto-scan...');
    
    // Clear previous debounce timer
    if (tabUpdateDebounceTimer) {
      clearTimeout(tabUpdateDebounceTimer);
    }
    
    // Set new debounce timer (1000ms)
    tabUpdateDebounceTimer = setTimeout(() => {
      console.log('Auto-scanning after tab update...');
      performScan();
    }, 1000);
  }
});

// Initialize - perform initial scan when panel opens
window.addEventListener('DOMContentLoaded', async () => {
  console.log('=== Resume Optimizer Initializing ===');
  
  // Step 1: Load keywords from keywords.json - CRITICAL: Must complete before any scan
  console.log('Step 1: Loading keywords from keywords.json...');
  const keywordData = await fetchKeywords();
  loadedKeywords = keywordData.allKeywords;
  loadedTechKeywords = keywordData.techKeywords;
  loadedSoftKeywords = keywordData.softKeywords;
  loadedSweKeywords = keywordData.sweKeywords;
  loadedPmMarketingKeywords = keywordData.pmMarketingKeywords;
  loadedDesignKeywords = keywordData.designKeywords;
  console.log('✓ Keywords loaded successfully:', loadedKeywords.length, 'keywords');
  console.log('  Domain-specific lists: SWE=' + loadedSweKeywords.length + ', PM/Marketing=' + loadedPmMarketingKeywords.length + ', Design=' + loadedDesignKeywords.length);
  
  // Step 2: Load saved resume from chrome.storage.local
  console.log('Step 2: Loading saved resume from storage...');
  try {
    const savedData = await chrome.storage.local.get(['resumeText', 'resumeFilename']);
    
    // Step 3: Check if resumeText exists
    if (savedData.resumeText) {
      // Step 4: Resume found - set currentResumeText and update UI
      currentResumeText = savedData.resumeText;
      
      // Update UI to show the saved filename (or "Saved Resume" if filename not available)
      const filename = savedData.resumeFilename || 'Saved Resume';
      document.getElementById('current-file').textContent = filename;
      
      console.log('✓ Loaded saved resume:', filename, '(' + currentResumeText.length + ' characters)');
    } else {
      // Step 5: No resume found - show placeholder message
      document.getElementById('current-file').textContent = 'No resume uploaded yet';
      console.log('⚠ No saved resume found');
    }
  } catch (error) {
    console.error('✗ Error loading saved resume:', error);
    // On error, show placeholder message
    document.getElementById('current-file').textContent = 'No resume uploaded yet';
  }
  
  // Step 6: Perform initial scan ONLY AFTER keywords are loaded
  console.log('Step 3: Performing initial scan...');
  await performScan();
  
  // Attach keyword handlers
  attachKeywordHandlers();
  
  console.log('=== Initialization Complete ===');
});

// Re-attach handlers after UI updates
const originalUpdateUI = updateUI;
updateUI = function(analysis) {
  originalUpdateUI(analysis);
  attachKeywordHandlers();
};
