// Popup script for RC Tool Commenter
document.addEventListener('DOMContentLoaded', () => {
    const statusDiv = document.getElementById('status');
    const statusText = document.getElementById('status-text');
    const openRCButton = document.getElementById('openRC');
    
    // Check if we're currently on a Research Catalogue page
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        
        if (currentTab.url && currentTab.url.includes('researchcatalogue.net')) {
            statusDiv.className = 'status status-active';
            
            if (currentTab.url.includes('/exposition/') || currentTab.url.includes('/view/')) {
                statusText.textContent = '✓ Active on exposition page';
            } else {
                statusText.textContent = '✓ On Research Catalogue (navigate to exposition)';
            }
        } else {
            statusDiv.className = 'status status-inactive';
            statusText.textContent = '⚠ Not on Research Catalogue';
        }
    });
    
    // Handle "Open Research Catalogue" button
    openRCButton.addEventListener('click', () => {
        browser.tabs.create({ 
            url: 'https://www.researchcatalogue.net/portal/expositions' 
        });
        window.close();
    });
    
    // Show recent tool interactions (for future enhancement)
    displayRecentInteractions();
});

function displayRecentInteractions() {
    browser.storage.local.get(null, (items) => {
        const interactions = Object.entries(items)
            .filter(([key, value]) => key.startsWith('tool_'))
            .sort(([,a], [,b]) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 3);
            
        if (interactions.length > 0) {
            const instructionsDiv = document.querySelector('.instructions');
            const recentDiv = document.createElement('div');
            recentDiv.innerHTML = `
                <h4>Recent tool interactions:</h4>
                <ul>
                    ${interactions.map(([key, data]) => 
                        `<li>${data.toolName} - ${new Date(data.timestamp).toLocaleTimeString()}</li>`
                    ).join('')}
                </ul>
            `;
            instructionsDiv.appendChild(recentDiv);
        }
    });
}