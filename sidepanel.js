// Side panel JavaScript
// Handles all interactions and view navigation

console.log('Resume Optimizer side panel loaded');

// View management
const mainView = document.getElementById('main-view');
const keywordView = document.getElementById('keyword-view');
const jobView = document.getElementById('job-view');

// Current resume content
let currentResumeText = '';
let currentJobDescription = '';

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

// Common technical keywords to look for
const commonKeywords = [
  'JavaScript', 'React', 'TypeScript', 'Node.js', 'Git', 'SQL', 'MongoDB',
  'HTML/CSS', 'Redux', 'Testing', 'Webpack', 'GraphQL', 'Express', 'Tailwind CSS',
  'Next.js', 'PostgreSQL', 'Scrum', 'Python', 'Machine Learning', 'AWS',
  'Docker', 'Kubernetes', 'CI/CD', 'Agile', 'REST API', 'Java', 'C++',
  'Angular', 'Vue.js', 'PHP', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin',
  'TensorFlow', 'PyTorch', 'Azure', 'GCP', 'Jenkins', 'GitHub Actions',
  'Microservices', 'API', 'JSON', 'XML', 'REST', 'GraphQL', 'WebSocket'
];

// Extract keywords from text
function extractKeywords(text) {
  if (!text) return [];
  const lowerText = text.toLowerCase();
  const foundKeywords = [];
  
  commonKeywords.forEach(keyword => {
    const keywordLower = keyword.toLowerCase();
    // Check for exact match or word boundary match
    const regex = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lowerText)) {
      foundKeywords.push(keyword);
    }
  });
  
  return foundKeywords;
}

// Analyze resume against job description
function analyzeResume(resumeText, jobDescription) {
  const resumeKeywords = extractKeywords(resumeText);
  const jobKeywords = extractKeywords(jobDescription);
  
  // Find matched and unmatched keywords
  const matchedKeywords = resumeKeywords.filter(kw => jobKeywords.includes(kw));
  const unmatchedKeywords = jobKeywords.filter(kw => !resumeKeywords.includes(kw));
  
  // Remove duplicates
  const uniqueMatched = [...new Set(matchedKeywords)];
  const uniqueUnmatched = [...new Set(unmatchedKeywords)];
  
  // Calculate score
  const totalKeywords = uniqueMatched.length + uniqueUnmatched.length;
  const score = totalKeywords > 0 ? Math.round((uniqueMatched.length / totalKeywords) * 100) : 0;
  
  return {
    score,
    matchedKeywords: uniqueMatched,
    unmatchedKeywords: uniqueUnmatched,
    totalKeywords: totalKeywords,
    matchedCount: uniqueMatched.length
  };
}

// Get job description from current page
async function getJobDescription() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return '';
    
    // Inject script to extract job description
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        // Try to find job description in common locations
        const selectors = [
          '[data-job-description]',
          '.job-description',
          '.jobDescription',
          '[class*="description"]',
          '[id*="description"]',
          'article',
          '.description',
          '[role="article"]'
        ];
        
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            const text = element.innerText || element.textContent;
            if (text && text.length > 100) {
              return text;
            }
          }
        }
        
        // Fallback: get all text content
        const bodyText = document.body.innerText || document.body.textContent;
        return bodyText || '';
      }
    });
    
    return results[0]?.result || '';
  } catch (error) {
    console.error('Error getting job description:', error);
    return '';
  }
}

// Read resume file content
function readResumeFile(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      // For PDF files, we'll need to extract text
      // This is a simplified version - in production, you'd use a PDF parsing library
      const reader = new FileReader();
      reader.onload = (e) => {
        // Note: This is a basic implementation
        // For production, use a PDF.js library to extract text from PDF
        resolve('PDF file uploaded. Text extraction requires PDF.js library.');
      };
      reader.readAsArrayBuffer(file);
    } else if (file.type.includes('text') || file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target.result);
      };
      reader.onerror = reject;
      reader.readAsText(file);
    } else {
      // For .doc/.docx, we'd need a library to parse
      // For now, return a placeholder
      resolve('Document file uploaded. Full text extraction requires additional libraries.');
    }
  });
}

// Update UI with analysis results
function updateUI(analysis) {
  // Update score
  document.getElementById('score-number').textContent = analysis.score;
  
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
  
  // Update keywords grid
  const keywordsGrid = document.querySelector('.keywords-grid');
  keywordsGrid.innerHTML = '';
  
  // Add unmatched keywords first (yellow)
  analysis.unmatchedKeywords.forEach(keyword => {
    const tag = document.createElement('span');
    tag.className = 'keyword-tag unmatched';
    tag.setAttribute('data-keyword', keyword);
    tag.textContent = keyword;
    tag.addEventListener('click', () => openKeywordView(keyword));
    keywordsGrid.appendChild(tag);
  });
  
  // Add matched keywords (green)
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
  
  // Show loading state (optional)
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.style.opacity = '0.5';
  refreshBtn.disabled = true;
  
  try {
    // Get job description from current page
    const jobDescription = await getJobDescription();
    currentJobDescription = jobDescription;
    
    // Use current resume text (or placeholder if none)
    const resumeText = currentResumeText || 'JavaScript React TypeScript Node.js Git SQL MongoDB HTML/CSS Redux Testing Webpack GraphQL Express Tailwind CSS Next.js PostgreSQL Scrum';
    
    // Perform analysis
    const analysis = analyzeResume(resumeText, jobDescription);
    
    // Update UI
    updateUI(analysis);
    
    console.log('Analysis complete:', analysis);
  } catch (error) {
    console.error('Error during scan:', error);
    alert('Error scanning page. Please make sure you are on a job posting page.');
  } finally {
    refreshBtn.style.opacity = '1';
    refreshBtn.disabled = false;
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

// Upload button handler
document.getElementById('upload-btn')?.addEventListener('click', () => {
  document.getElementById('resume-upload').click();
});

// File upload handler
document.getElementById('resume-upload')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (file) {
    document.getElementById('current-file').textContent = file.name;
    console.log('Uploaded file:', file.name);
    
    try {
      // Read file content
      const fileContent = await readResumeFile(file);
      currentResumeText = fileContent;
      
      // Perform scan after upload
      await performScan();
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Error reading resume file. Please try again.');
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

// Initialize - perform initial scan when panel opens
window.addEventListener('DOMContentLoaded', () => {
  // Perform initial scan
  performScan();
  
  // Attach keyword handlers
  attachKeywordHandlers();
});

// Re-attach handlers after UI updates
const originalUpdateUI = updateUI;
updateUI = function(analysis) {
  originalUpdateUI(analysis);
  attachKeywordHandlers();
};
