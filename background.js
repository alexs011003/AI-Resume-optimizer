// Service worker for Chrome extension
// Configures side panel to open automatically when extension icon is clicked

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed, checking side panel API...');
  console.log('chrome.sidePanel:', chrome.sidePanel);
  console.log('Available chrome APIs:', Object.keys(chrome));
  
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .then(() => {
        console.log('Side panel configured successfully');
      })
      .catch((error) => {
        console.error('Error setting side panel behavior:', error);
      });
  } else {
    console.error('chrome.sidePanel is still undefined after adding permission');
  }
});
