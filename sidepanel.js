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
  source: ''
};

// Keywords loaded from keywords.json
let loadedKeywords = [];
let loadedTechKeywords = [];
let loadedSoftKeywords = [];

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
      return { allKeywords: [], techKeywords: [], softKeywords: [] };
    }
    
    const data = await response.json();
    
    // Store technical and soft keywords separately
    const techKeywords = data.techKeywords || [];
    const softKeywords = data.softKeywords || [];
    const allKeywords = [...techKeywords, ...softKeywords];
    
    console.log('Keywords loaded successfully:', techKeywords.length, 'technical +', softKeywords.length, 'soft =', allKeywords.length, 'total');
    
    return { allKeywords, techKeywords, softKeywords };
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
      softKeywords: fallbackSoft
    };
  }
}

// Helper function to check if a keyword is a soft skill
function isSoftSkill(keyword) {
  return loadedSoftKeywords.some(sk => sk.toLowerCase() === keyword.toLowerCase());
}

// Extract keywords from text (case-insensitive with fuzzy matching)
function extractKeywords(text) {
  if (!text) return [];
  const foundKeywords = [];
  const foundKeywordsLower = new Set();
  
  // Use loaded keywords or fallback to empty array
  const keywordsToCheck = loadedKeywords.length > 0 ? loadedKeywords : [];
  
  keywordsToCheck.forEach(keyword => {
    const keywordLower = keyword.toLowerCase();
    
    // Skip if we've already found this keyword (avoid duplicates)
    if (foundKeywordsLower.has(keywordLower)) {
      return;
    }
    
    // Escape special regex characters in the keyword
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // STEP 1: For multi-word phrases, allow flexible spacing (space or hyphen)
    // This ensures '3D Design' matches '3D Design' or '3D-Design' but NOT '3 other Design'
    let regexPattern;
    if (keyword.includes(' ')) {
      // Replace spaces with [\s-]+ to match space or hyphen between words
      const flexiblePattern = escapedKeyword.split(/\s+/).join('[\\s-]+');
      // STEP 2: Make trailing 's' optional for better stemming
      // Pattern: (?:^|[^a-zA-Z0-9])(keyword)(s)?(?:$|[^a-zA-Z0-9])
      regexPattern = `(?:^|[^a-zA-Z0-9])(${flexiblePattern})(s)?(?:$|[^a-zA-Z0-9])`;
    } else {
      // Single word - use standard pattern with optional trailing 's'
      regexPattern = `(?:^|[^a-zA-Z0-9])(${escapedKeyword})(s)?(?:$|[^a-zA-Z0-9])`;
    }
    
    const regex = new RegExp(regexPattern, 'i');
    
    if (regex.test(text)) {
      foundKeywords.push(keyword);
      foundKeywordsLower.add(keywordLower);
      return;
    }
    
    // FUZZY MATCHING: If keyword ends with 's', try matching without 's' (singular)
    // This handles cases like 'Design Systems' matching 'Design System'
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
      
      if (singularRegex.test(text)) {
        foundKeywords.push(keyword);
        foundKeywordsLower.add(keywordLower);
        return;
      }
    }
  });
  
  return foundKeywords;
}

// Analyze resume against job description (case-insensitive)
function analyzeResume(resumeText, jobDescription) {
  console.log('--- Starting Resume Analysis ---');
  console.log('Resume text length:', resumeText ? resumeText.length : 0);
  console.log('Job description length:', jobDescription ? jobDescription.length : 0);
  console.log('Loaded keywords count:', loadedKeywords.length);
  
  // STEP 5: Validation - Check if resume contains binary data
  if (resumeText && resumeText.startsWith('%PDF')) {
    console.error('❌ Resume contains binary PDF data - not parsed correctly');
    throw new Error('Resume was not parsed correctly. Please re-upload.');
  }
  
  // STEP 4: Verification logging - show resume preview to verify readability
  console.log('Resume Preview:', resumeText ? resumeText.substring(0, 500) : '(empty)');
  console.log('Job Preview:', jobDescription ? jobDescription.substring(0, 300) : '(empty)');
  
  // Extract keywords from both texts (case-insensitive)
  const resumeKeywords = extractKeywords(resumeText);
  const jobKeywords = extractKeywords(jobDescription);
  
  console.log('Keywords found in resume:', resumeKeywords.length, resumeKeywords);
  console.log('Keywords found in job description:', jobKeywords.length, jobKeywords);
  
  // Normalize keywords to lowercase for comparison
  const resumeKeywordsLower = resumeKeywords.map(kw => kw.toLowerCase());
  const jobKeywordsLower = jobKeywords.map(kw => kw.toLowerCase());
  
  // Find matched keywords (keywords that appear in both resume and job)
  const matchedKeywords = [];
  const matchedKeywordsLower = new Set();
  
  jobKeywords.forEach(kw => {
    const kwLower = kw.toLowerCase();
    if (resumeKeywordsLower.includes(kwLower) && !matchedKeywordsLower.has(kwLower)) {
      matchedKeywords.push(kw);
      matchedKeywordsLower.add(kwLower);
    }
  });
  
  // Find unmatched keywords (keywords in job but not in resume)
  const unmatchedKeywords = [];
  const unmatchedKeywordsLower = new Set();
  
  jobKeywords.forEach(kw => {
    const kwLower = kw.toLowerCase();
    if (!resumeKeywordsLower.includes(kwLower) && !unmatchedKeywordsLower.has(kwLower)) {
      unmatchedKeywords.push(kw);
      unmatchedKeywordsLower.add(kwLower);
    }
  });
  
  // Calculate score: (Matched / Total keywords found in job) * 100
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
    unmatchedSoft
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
          
          while (Date.now() - startTime < maxWaitMs) {
            for (const selector of selectors) {
              try {
                const element = document.querySelector(selector);
                if (element) {
                  const text = (element.innerText || element.textContent || '').trim();
                  if (text.length > 100) {
                    console.log(`✅ Element found after ${Date.now() - startTime}ms: "${selector}"`);
                    return { element, selector };
                  }
                }
              } catch (e) {
                // Skip invalid selector
              }
            }
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, checkInterval));
          }
          
          console.log(`⏱ Timeout: No valid element found after ${maxWaitMs}ms`);
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
        const selectors = [
          // PRIMARY: LinkedIn job details ID (HIGHEST PRIORITY)
          '#job-details',
          
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
          
          // Generic job description selectors (lowest priority)
          '[data-job-description]',
          '.job-description',
          '.jobDescription',
          '[class*="job-description"]',
          '[id*="jobDescription"]',
          'article[role="main"]',
          '[role="article"]'
        ];
        
        // STEP 1: Extract job metadata with high-precision selectors
        function extractJobMetadata() {
          console.log('📋 Extracting job metadata with precision selectors...');
          
          let title = '';
          let company = '';
          let date = '';
          const source = window.location.hostname;
          
          // Extract Job Title - High precision selectors
          const titleSelectors = [
            'h1',
            '.job-details-jobs-unified-top-card__job-title',
            '.jobs-unified-top-card__job-title',
            '.job-title',
            '[class*="job-title"]'
          ];
          
          for (const sel of titleSelectors) {
            const el = document.querySelector(sel);
            if (el && el.innerText && el.innerText.trim().length > 0) {
              title = el.innerText.trim();
              console.log(`✓ Title found via "${sel}": "${title}"`);
              break;
            }
          }
          
          // Extract Company Name - Primary selector with cleanup
          const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name a');
          if (companyEl && companyEl.innerText) {
            // STEP 2: Clean the data - take only first line to remove platform noise
            company = companyEl.innerText.split('\n')[0].trim();
            company = company.replace(/\s+/g, ' ').trim();
            console.log(`✓ Company found: "${company}"`);
          } else {
            // Fallback selectors if primary fails
            const companyFallbacks = [
              '.jobs-unified-top-card__company-name a',
              'a[data-test-app-aware-link] span',
              '.job-details-jobs-unified-top-card__company-name',
              '.jobs-unified-top-card__company-name'
            ];
            
            for (const sel of companyFallbacks) {
              const el = document.querySelector(sel);
              if (el && el.innerText && el.innerText.trim().length > 0) {
                company = el.innerText.split('\n')[0].trim();
                company = company.replace(/\s+/g, ' ').trim();
                if (company.length > 0) {
                  console.log(`✓ Company found via fallback "${sel}": "${company}"`);
                  break;
                }
              }
            }
          }
          
          // Extract Post Date - Look in primary description container
          const descriptionContainer = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container');
          if (descriptionContainer) {
            // Try to find span with 'ago' text
            const spans = descriptionContainer.querySelectorAll('span');
            for (const span of spans) {
              const text = span.innerText || span.textContent || '';
              if (text.toLowerCase().includes('ago')) {
                date = text.trim();
                console.log(`✓ Date found in container: "${date}"`);
                break;
              }
            }
            
            // If not found, try the 3rd low-emphasis span
            if (!date) {
              const lowEmphasisSpans = descriptionContainer.querySelectorAll('.tvm__text--low-emphasis span');
              if (lowEmphasisSpans.length >= 3) {
                date = lowEmphasisSpans[2].innerText.trim();
                console.log(`✓ Date found (3rd span): "${date}"`);
              }
            }
          }
          
          // Fallback date selectors if container method fails
          if (!date) {
            const dateFallbacks = [
              '.job-details-jobs-unified-top-card__posted-date',
              '.jobs-unified-top-card__posted-date',
              '.tvm__text--low-emphasis span',
              '[class*="posted-date"]',
              'time'
            ];
            
            for (const sel of dateFallbacks) {
              const el = document.querySelector(sel);
              if (el && el.innerText) {
                const text = el.innerText.trim();
                if (text.toLowerCase().includes('ago') || text.toLowerCase().includes('posted')) {
                  date = text.trim();
                  console.log(`✓ Date found via fallback "${sel}": "${date}"`);
                  break;
                }
              }
            }
          }
          
          console.log('📋 Metadata extraction complete:', { title, company, date, source });
          return { title, company, date, source };
        }
        
        // Main extraction function
        async function extractJobDescription() {
          console.log('🎯 Trying to find job description using', selectors.length, 'selectors...');
          
          // STEP 3: Extract metadata first - renamed to avoid conflicts
          const finalExtractedData = extractJobMetadata();
          
          // Try to find element with wait/retry logic
          const result = await waitForElement(selectors);
          
          if (result) {
            const { element, selector } = result;
            // STEP 2: Use innerText for better readability
            const text = (element.innerText || element.textContent || '').trim();
            
            // SELF-PROFILE FILTER: Skip if contains profile-related phrases
            if (isProfileContent(text)) {
              console.log(`⏭ Element skipped due to profile content`);
              // Continue with fallback methods below
            } else {
              // STEP 2: Clean job scraper noise - remove third-party extension artifacts
              let cleanedText = text;
              const thirdPartyArtifacts = [
                'Jobalytics',
                'Resume Match',
                'Increase your match score',
                'Job Match Score',
                'Match Rate',
                'Application Tracker',
                'Chrome Extension'
              ];
              
              // Remove lines containing third-party artifacts
              const lines = cleanedText.split('\n');
              const filteredLines = lines.filter(line => {
                const lowerLine = line.toLowerCase();
                return !thirdPartyArtifacts.some(artifact => lowerLine.includes(artifact.toLowerCase()));
              });
              cleanedText = filteredLines.join('\n').trim();
              
              // Success! Log detailed extraction info
              const preview = cleanedText.substring(0, 100).replace(/\n/g, ' ');
              const hiddenNote = seeMoreButton ? ' (including hidden content)' : '';
              
              console.log(`✅ Success: Extracted via "${selector}"${hiddenNote}`);
              console.log(`📊 Original length: ${text.length} → Cleaned length: ${cleanedText.length} characters`);
              console.log(`📄 Preview: "${preview}..."`);
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
          
          // STEP 3: Fallback - Look for "About the job" or "About the role" text
          console.log('🔄 Trying fallback: searching for "About the job" text...');
          const allElements = document.querySelectorAll('div, section, article');
          
          for (const el of allElements) {
            const textContent = (el.textContent || '').trim();
            if (textContent.toLowerCase().includes('about the job') || 
                textContent.toLowerCase().includes('about the role') ||
                textContent.toLowerCase().includes('job description')) {
              
              // Try to get parent or parent's siblings
              const parent = el.parentElement;
              if (parent) {
                const parentText = (parent.innerText || parent.textContent || '').trim();
                if (parentText.length > 200 && !isProfileContent(parentText)) {
                  console.log('✅ Success: Found via "About the job" fallback');
                  console.log(`📊 Length: ${parentText.length} characters`);
                  console.log(`📄 Preview: "${parentText.substring(0, 100)}..."`);
                  
          return {
                    text: parentText,
                    selector: 'fallback (About the job)',
                    length: parentText.length,
                    hasHiddenContent: false,
                    preview: parentText.substring(0, 100),
                    metadata: finalExtractedData
                  };
                }
              }
            }
          }
          
          // STEP 4: If all else fails, log body content for debugging
          console.error('❌ All extraction methods failed');
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
  
  // STEP 2: Update Detected Job section with real data
  const jobTitleEl = document.getElementById('job-title-text');
  const jobCompanyEl = document.getElementById('job-company-text');
  const jobSourceEl = document.getElementById('job-source-text');
  const jobPostedEl = document.getElementById('job-posted-text');
  const jobDescriptionEl = document.getElementById('job-description-full');
  
  // Also update main view job card
  const jobTitleMainEl = document.getElementById('job-title-main');
  const jobMetaMainEl = document.getElementById('job-meta-main');
  const jobDateMainEl = document.getElementById('job-date-main');
  const jobIconEl = document.getElementById('job-icon');
  
  // Update job view (Edit page)
  if (jobTitleEl) {
    jobTitleEl.textContent = currentJobMetadata.title || 'Job Title Not Found';
  }
  if (jobCompanyEl) {
    jobCompanyEl.textContent = currentJobMetadata.company || 'Company Not Found';
  }
  if (jobSourceEl) {
    jobSourceEl.textContent = currentJobMetadata.source || 'Unknown Source';
  }
  if (jobPostedEl) {
    jobPostedEl.textContent = currentJobMetadata.date || 'Date Unknown';
  }
  if (jobDescriptionEl) {
    jobDescriptionEl.textContent = currentJobDescription || 'No description available';
  }
  
  // Update main view job card
  if (jobTitleMainEl) {
    jobTitleMainEl.textContent = currentJobMetadata.title || 'Job Title Not Found';
  }
  if (jobMetaMainEl) {
    const source = currentJobMetadata.source ? currentJobMetadata.source.replace('www.', '').replace('.com', '') : 'Unknown';
    const company = currentJobMetadata.company || 'Company Unknown';
    jobMetaMainEl.textContent = `${source} • ${company}`;
  }
  if (jobDateMainEl) {
    jobDateMainEl.textContent = currentJobMetadata.date || 'Date Unknown';
  }
  if (jobIconEl) {
    // Set icon based on source
    const source = currentJobMetadata.source || '';
    if (source.includes('linkedin')) {
      jobIconEl.textContent = 'LI';
      jobIconEl.style.backgroundColor = '#0077B5';
    } else if (source.includes('indeed')) {
      jobIconEl.textContent = 'IN';
      jobIconEl.style.backgroundColor = '#2164f3';
    } else if (source.includes('glassdoor')) {
      jobIconEl.textContent = 'GD';
      jobIconEl.style.backgroundColor = '#0caa41';
    } else {
      jobIconEl.textContent = source.substring(0, 2).toUpperCase() || 'JB';
      jobIconEl.style.backgroundColor = '#6b7280';
    }
  }
  
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
  console.log('✓ Keywords loaded successfully:', loadedKeywords.length, 'keywords');
  
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
