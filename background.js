// Background script for RC Tool Commenter
// Handles extension lifecycle and communication

console.log('RC Tool Commenter: Background script loaded');

// Listen for extension installation
browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('RC Tool Commenter: Extension installed');
        
        // Initialize storage
        browser.storage.local.set({
            'extension_installed': true,
            'install_date': new Date().toISOString()
        });
    }
});

// Listen for tab updates to inject content script if needed
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && 
        tab.url.includes('researchcatalogue.net')) {
        console.log('RC Tool Commenter: RC page loaded, ensuring content script is active');
    }
});

// Handle messages from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('RC Tool Commenter: Received message', message);
    
    if (message.action === 'toolClicked') {
        // Handle tool click events (for future comment functionality)
        console.log('Tool clicked:', message.toolName);
    }
    
    return true; // Keep message channel open for async responses
});