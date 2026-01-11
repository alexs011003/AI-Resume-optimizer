// Quick Test Script for Resume Optimizer Functions
// Run this in browser console to test functions

// Test 1: Domain Detection
console.log('=== TEST 1: Domain Detection ===');

function testDomainDetection() {
  // Test SWE
  const sweTitle = "Senior Software Engineer";
  const sweDesc = "Looking for a software engineer with Python, React, and AWS experience";
  const sweDomain = detectJobDomain(sweTitle, sweDesc, "");
  console.log('SWE Test:', sweDomain === 'swe' ? '✓ PASS' : '✗ FAIL', '- Got:', sweDomain);
  
  // Test Design
  const designTitle = "Product Designer";
  const designDesc = "We need a UX designer with Figma, prototyping, and user research skills";
  const designDomain = detectJobDomain(designTitle, designDesc, "");
  console.log('Design Test:', designDomain === 'design' ? '✓ PASS' : '✗ FAIL', '- Got:', designDomain);
  
  // Test PM/Marketing
  const pmTitle = "Product Manager";
  const pmDesc = "Looking for a product manager with roadmap, GTM strategy, and marketing experience";
  const pmDomain = detectJobDomain(pmTitle, pmDesc, "");
  console.log('PM/Marketing Test:', pmDomain === 'pm_marketing' ? '✓ PASS' : '✗ FAIL', '- Got:', pmDomain);
}

// Test 2: Keyword Normalization
console.log('\n=== TEST 2: Keyword Normalization ===');

function testNormalization() {
  const testKeywords = ["React.js", "reactjs", "NodeJS", "node.js", "AWS", "amazon web services"];
  const normalized = normalizeKeywords(testKeywords);
  console.log('Input:', testKeywords);
  console.log('Normalized:', normalized);
  console.log('Test:', normalized.includes('react') && normalized.includes('node.js') && normalized.includes('aws') ? '✓ PASS' : '✗ FAIL');
}

// Test 3: Keyword Extraction (requires keywords to be loaded)
console.log('\n=== TEST 3: Keyword Extraction ===');

function testKeywordExtraction() {
  const testText = "I have experience with React, Node.js, Python, AWS, Docker, and Kubernetes. I also know Figma, prototyping, and user research.";
  
  // Test SWE extraction
  const sweKeywords = extractKeywords(testText, 'swe');
  console.log('SWE Keywords:', sweKeywords);
  console.log('SWE Test:', sweKeywords.length > 0 ? '✓ PASS' : '✗ FAIL');
  
  // Test Design extraction
  const designKeywords = extractKeywords(testText, 'design');
  console.log('Design Keywords:', designKeywords);
  console.log('Design Test:', designKeywords.length > 0 ? '✓ PASS' : '✗ FAIL');
}

// Run all tests
console.log('Running all tests...\n');
testDomainDetection();
testNormalization();
testKeywordExtraction();
console.log('\n=== Tests Complete ===');
