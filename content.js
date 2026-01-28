// Content script for Research Catalogue Tool Commenter
// This script runs on Research Catalogue exposition pages

console.log('RC Tool Commenter: Content script loaded');

// Function to detect if we're on a Research Catalogue exposition page
function isExpositionPage() {
    return window.location.hostname.includes('researchcatalogue.net') && 
           (window.location.pathname.includes('/exposition/') || 
            window.location.pathname.includes('/view/'));
}

// Function to identify tool elements in the exposition
function identifyTools() {
    // Skip if we're in text-only view
    if (isTextOnlyView) {
        console.log('RC Tool Commenter: Skipping tool identification - in text-only view');
        return [];
    }
    
    // Prevent excessive calls (throttle to once per 100ms)
    const now = Date.now();
    if (now - lastToolIdentification < 100) {
        console.log('RC Tool Commenter: Throttling tool identification');
        return [];
    }
    lastToolIdentification = now;
    
    // Research Catalogue uses specific tool classes based on the HTML structure
    // Tools are elements with class starting with 'tool-' and have data-tool attribute
    const toolSelectors = [
        '.tool-text',
        '.tool-simpletext'
        //'.tool-picture', 
        //'.tool-video',
        //'.tool-audio',
        //'.tool-pdf',
        //'.tool-slideshow'    
    ];
    
    let tools = [];
    
    // Debug: Log all potential tools found
    console.log('RC Tool Commenter: Searching for tools...');
    
    toolSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        console.log(`Found ${elements.length} elements with selector "${selector}"`);
        
        elements.forEach(element => {
            // Exclude tool-content divs - only target actual tool containers
            if (!element.hasAttribute('data-rc-tool-enhanced') && 
                !element.classList.contains('tool-content')) {
                console.log(`Adding tool:`, element, `Class: ${element.className}, Data-tool: ${element.dataset.tool}`);
                tools.push(element);
            } else {
                console.log(`Skipping tool (already enhanced or tool-content):`, element);
            }
        });
    });
    
    // Also look for any div with class starting with 'tool-' that has data-tool attribute
    // But only if we're looking for text tools specifically
    const genericTools = document.querySelectorAll('div.tool-text[data-tool], div.tool-simpletext[data-tool]');
    console.log(`Found ${genericTools.length} generic text tool elements`);
    
    genericTools.forEach(element => {
        if (!element.hasAttribute('data-rc-tool-enhanced') && 
            !element.classList.contains('tool-content') &&
            !tools.includes(element)) {
            console.log(`Adding generic text tool:`, element);
            tools.push(element);
        }
    });
    
    console.log(`RC Tool Commenter: Total tools to enhance: ${tools.length}`);
    
    // Create save button if tools were found
    if (tools.length > 0) {
        createSaveButton();
    }
    
    return tools;
}

// Function to get all text tools regardless of enhancement state (for text-only view)
function getAllTextTools() {
    const toolSelectors = [
        '.tool-text',
        '.tool-simpletext'
    ];
    
    let tools = [];
    
    console.log('RC Tool Commenter: Getting all text tools for text-only view...');
    
    toolSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        console.log(`Found ${elements.length} elements with selector "${selector}"`);
        
        elements.forEach(element => {
            // Include all tools, even if enhanced, but exclude tool-content divs
            if (!element.classList.contains('tool-content') && !tools.includes(element)) {
                console.log(`Adding tool for text-only view:`, element, `Class: ${element.className}, Data-tool: ${element.dataset.tool}`);
                tools.push(element);
            } else {
                console.log(`Skipping tool-content or duplicate:`, element);
            }
        });
    });
    
    // Also look for any div with class starting with 'tool-' that has data-tool attribute
    const genericTools = document.querySelectorAll('div.tool-text[data-tool], div.tool-simpletext[data-tool]');
    console.log(`Found ${genericTools.length} generic text tool elements`);
    
    genericTools.forEach(element => {
        if (!element.classList.contains('tool-content') && !tools.includes(element)) {
            console.log(`Adding generic text tool for text-only view:`, element);
            tools.push(element);
        }
    });
    
    console.log(`RC Tool Commenter: Total tools for text-only view: ${tools.length}`);
    return tools;
}

// Function to extract exposition and weave IDs from URL
function extractFromUrl(type) {
    const url = window.location.href;
    const match = url.match(/\/view\/(\d+)\/(\d+)/);
    if (match) {
        return type === 'exposition' ? match[1] : match[2];
    }
    return null;
}

// Function to extract tool content
function extractToolContent(tool) {
    // Extract exposition and weave IDs from the page
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
    
    const toolData = {
        id: tool.dataset.id || 'unknown',
        type: tool.dataset.tool || 'unknown',
        title: tool.dataset.title || '',
        className: tool.className,
        expositionId: expositionId,
        weaveId: weaveId,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        content: ''
    };
    
    // Extract text content based on tool type
    if (tool.dataset.tool === 'text') {
        const textContent = tool.querySelector('.html-text-editor-content');
        if (textContent) {
            // Get both plain text and HTML content
            toolData.content = {
                plainText: textContent.innerText.trim(),
                html: textContent.innerHTML.trim()
            };
        }
    }
    
    // Add position/style info
    const rect = tool.getBoundingClientRect();
    toolData.position = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
    };
    
    // Add data attributes
    toolData.dataAttributes = {};
    for (let attr of tool.attributes) {
        if (attr.name.startsWith('data-')) {
            toolData.dataAttributes[attr.name] = attr.value;
        }
    }
    
    return toolData;
}

// Function to store tools in browser storage by exposition and weave
async function storeToolsInMemory(tools) {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
    
    console.log(`Storing ${tools.length} tools for exposition ${expositionId}, weave ${weaveId}`);
    
    // Get existing stored tools for this exposition
    const storageKey = `rc_exposition_${expositionId}`;
    const result = await browser.storage.local.get(storageKey);
    let expositionData = result[storageKey] || {
        expositionId: expositionId,
        weaves: {},
        lastUpdated: new Date().toISOString()
    };
    
    // Prepare tools data for current weave
    const weaveTools = [];
    tools.forEach(tool => {
        const toolData = extractToolContent(tool);
        weaveTools.push(toolData);
    });
    
    // Store tools organized by weave
    expositionData.weaves[weaveId] = {
        weaveId: weaveId,
        url: window.location.href,
        tools: weaveTools,
        lastVisited: new Date().toISOString(),
        pageTitle: document.title
    };
    
    expositionData.lastUpdated = new Date().toISOString();
    
    // Save back to storage
    await browser.storage.local.set({ [storageKey]: expositionData });
    console.log(`Stored exposition data:`, expositionData);
    
    // Update button text to show total count across all weaves
    await updateSaveButtonCount(expositionData);
}

// Function to update save button with total tool count
async function updateSaveButtonCount(expositionData) {
    const saveButton = document.getElementById('rc-save-tools-btn');
    if (!saveButton) return;
    
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    
    // Count suggestions across all weaves
    let totalSuggestions = 0;
    
    // Get suggestions for each weave and count them
    for (const weaveId of Object.keys(expositionData.weaves)) {
        const suggestionsKey = `rc_suggestions_${expositionId}_${weaveId}`;
        const suggestionsResult = await browser.storage.local.get(suggestionsKey);
        const weavesSuggestions = suggestionsResult[suggestionsKey] || {};
        
        // Count suggestions for each tool in this weave
        Object.values(weavesSuggestions).forEach(toolSuggestions => {
            if (Array.isArray(toolSuggestions)) {
                totalSuggestions += toolSuggestions.length;
            }
        });
    }
    
    let totalTools = 0;
    let weaveCount = 0;
    
    Object.values(expositionData.weaves).forEach(weave => {
        totalTools += weave.tools.length;
        weaveCount++;
    });
    
    const buttonText = saveButton.querySelector('span') || saveButton;
    buttonText.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 6px;">
            <path fill="currentColor" d="M13 0H3a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V3a3 3 0 0 0-3-3zM8 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM11 14.5H5a.5.5 0 0 1 0-1h6a.5.5 0 0 1 0 1z"/>
        </svg>
        Save ${totalTools} Tools, ${totalSuggestions} Suggestions (${weaveCount} weaves)
    `;
}

// Function to create save button
function createSaveButton() {
    // Remove existing button if present
    const existingButton = document.getElementById('rc-save-tools-btn');
    if (existingButton) {
        existingButton.remove();
    }
    
    const saveButton = document.createElement('button');
    saveButton.id = 'rc-save-tools-btn';
    saveButton.className = 'rc-save-button';
    saveButton.innerHTML = `
        <span>
            <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 6px;">
                <path fill="currentColor" d="M13 0H3a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V3a3 3 0 0 0-3-3zM8 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM11 14.5H5a.5.5 0 0 1 0-1h6a.5.5 0 0 1 0 1z"/>
            </svg>
            Save Tools as JSON
        </span>
    `;
    
    saveButton.addEventListener('click', () => {
        saveAllToolsAsJSON();
    });
    
    // Create import button
    const importButton = document.createElement('button');
    importButton.id = 'rc-import-tools-btn';
    importButton.className = 'rc-import-button';
    importButton.innerHTML = `
        <span>
            <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 6px;">
                <path fill="currentColor" d="M8.5 1.5A2.5 2.5 0 0 1 11 4v4.793l1.146-1.147a.5.5 0 0 1 .708.708L10.5 10.707a.5.5 0 0 1-.708 0L7.439 8.354a.5.5 0 1 1 .708-.708L9.5 8.793V4A1.5 1.5 0 0 0 8 2.5H3A1.5 1.5 0 0 0 1.5 4v8A1.5 1.5 0 0 0 3 13.5h5a.5.5 0 0 1 0 1H3A2.5 2.5 0 0 1 .5 12V4A2.5 2.5 0 0 1 3 1.5h5.5z"/>
            </svg>
            Import JSON
        </span>
    `;
    importButton.title = 'Import suggestions from JSON file';
    
    // Create text-only view toggle button
    const viewToggleButton = document.createElement('button');
    viewToggleButton.id = 'rc-view-toggle-btn';
    viewToggleButton.className = 'rc-view-toggle-button';
    viewToggleButton.innerHTML = `
        <span>
            <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 6px;">
                <path fill="currentColor" d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
            </svg>
            Text View
        </span>
    `;
    viewToggleButton.title = 'Toggle between normal and text-only view';
    
    // Create hidden file input for import
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.id = 'rc-file-input';
    
    // Add click handlers
    importButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleImportFile);
    viewToggleButton.addEventListener('click', toggleTextOnlyView);

    document.body.appendChild(saveButton);
    document.body.appendChild(importButton);
    document.body.appendChild(viewToggleButton);
    document.body.appendChild(fileInput);
}

// Function to save all tools from all visited weaves as JSON
async function saveAllToolsAsJSON() {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    
    // Get stored tools for this exposition
    const storageKey = `rc_exposition_${expositionId}`;
    const result = await browser.storage.local.get(storageKey);
    const expositionData = result[storageKey];
    
    // Get stored suggestions for this exposition
    const suggestionsKey = `rc_suggestions_${expositionId}`;
    const suggestionsResult = await browser.storage.local.get(suggestionsKey);
    const suggestions = suggestionsResult[suggestionsKey] || [];
    
    if (!expositionData || !expositionData.weaves || Object.keys(expositionData.weaves).length === 0) {
        showNotification('No tools found to save');
        return;
    }
    
    // Group suggestions by tool ID
    const suggestionsByTool = {};
    suggestions.forEach(suggestion => {
        if (!suggestionsByTool[suggestion.toolId]) {
            suggestionsByTool[suggestion.toolId] = [];
        }
        suggestionsByTool[suggestion.toolId].push(suggestion);
    });
    
    // Create comprehensive JSON structure
    const exportData = {
        exposition: {
            id: expositionId,
            exportTimestamp: new Date().toISOString(),
            totalWeaves: Object.keys(expositionData.weaves).length,
            totalTools: Object.values(expositionData.weaves).reduce((sum, weave) => sum + weave.tools.length, 0),
            totalSuggestions: suggestions.length
        },
        weaves: {},
        suggestions: {
            total: suggestions.length,
            byTool: suggestionsByTool,
            all: suggestions
        }
    };
    
    // Organize tools by weave and add suggestion counts
    Object.entries(expositionData.weaves).forEach(([weaveId, weaveData]) => {
        const toolsWithSuggestions = weaveData.tools.map(tool => {
            const toolSuggestions = suggestionsByTool[tool.id] || [];
            return {
                ...tool,
                suggestionCount: toolSuggestions.length,
                suggestions: toolSuggestions
            };
        });
        
        exportData.weaves[weaveId] = {
            weaveId: weaveId,
            url: weaveData.url,
            pageTitle: weaveData.pageTitle,
            lastVisited: weaveData.lastVisited,
            toolCount: weaveData.tools.length,
            suggestionCount: toolsWithSuggestions.reduce((sum, tool) => sum + tool.suggestionCount, 0),
            tools: toolsWithSuggestions
        };
    });
    
    // Create downloadable JSON file
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = `rc-exposition-${expositionId}-tools-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Show confirmation
    const weaveCount = Object.keys(expositionData.weaves).length;
    const toolCount = Object.values(expositionData.weaves).reduce((sum, weave) => sum + weave.tools.length, 0);
    const suggestionCount = suggestions.length;
    showNotification(`Saved ${toolCount} tools and ${suggestionCount} suggestions from ${weaveCount} weaves`);
}

// Function to save tools as JSON (legacy - keeping for backwards compatibility)
function saveToolsAsJSON() {
    saveAllToolsAsJSON();
}

// Function to handle importing JSON file
async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const importData = JSON.parse(text);
        
        // Validate the imported data structure
        if (!importData.exposition?.id || !importData.weaves) {
            throw new Error('Invalid JSON structure. Expected exposition data with weaves.');
        }
        
        // Extract exposition ID from the correct location
        const importedExpositionId = importData.exposition.id;
        
        // Get current exposition ID
        const bodyElement = document.body;
        const currentExpositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
        
        // Check if the imported data matches current exposition
        if (importedExpositionId !== currentExpositionId) {
            const confirmImport = confirm(
                `The imported data is for exposition ${importedExpositionId}, but you're currently viewing exposition ${currentExpositionId}. ` +
                'Do you want to import anyway? This will merge the suggestions with current data.'
            );
            if (!confirmImport) {
                event.target.value = ''; // Reset file input
                return;
            }
        }
        
        // Import the data
        await importSuggestionData(importData, currentExpositionId);
        
        // Update save button count to reflect imported suggestions
        const expositionStorageKey = `rc_exposition_${currentExpositionId}`;
        const expositionResult = await browser.storage.local.get(expositionStorageKey);
        if (expositionResult[expositionStorageKey]) {
            await updateSaveButtonCount(expositionResult[expositionStorageKey]);
        }
        
        // Show success message
        showImportStatus('Success! Suggestions imported successfully.', 'success');
        
        // Refresh the current page view to show imported suggestions
        setTimeout(async () => {
            // Clear existing tool enhancements to allow re-processing
            const existingTools = document.querySelectorAll('[data-rc-tool-enhanced]');
            existingTools.forEach(tool => {
                tool.removeAttribute('data-rc-tool-enhanced');
                // Remove existing badges and styling
                const badge = tool.querySelector('.rc-suggestion-count');
                if (badge) badge.remove();
                tool.style.cursor = '';
                tool.style.outline = '';
                tool.style.outlineOffset = '';
            });
            
            // Remove existing buttons to avoid duplicates
            const existingSaveBtn = document.getElementById('rc-save-tools-btn');
            if (existingSaveBtn) existingSaveBtn.remove();
            const existingImportBtn = document.getElementById('rc-import-tools-btn');
            if (existingImportBtn) existingImportBtn.remove();
            const existingFileInput = document.getElementById('rc-file-input');
            if (existingFileInput) existingFileInput.remove();
            
            // Re-initialize the extension
            await initializeExtension();
        }, 300);
        
    } catch (error) {
        console.error('Error importing JSON:', error);
        showImportStatus('Error importing file: ' + error.message, 'error');
    }
    
    // Reset file input
    event.target.value = '';
}

// Function to import suggestion data into storage
async function importSuggestionData(importData, targetExpositionId) {
    const storageKey = `rc_exposition_${targetExpositionId}`;
    
    // Get existing data for this exposition
    const existingResult = await browser.storage.local.get(storageKey);
    const existingData = existingResult[storageKey] || { weaves: {} };
    
    // Merge imported weaves with existing data
    for (const [weaveId, weaveData] of Object.entries(importData.weaves)) {
        if (!existingData.weaves[weaveId]) {
            existingData.weaves[weaveId] = {
                tools: [],
                url: weaveData.url,
                pageTitle: weaveData.pageTitle,
                visitedAt: weaveData.lastVisited || weaveData.visitedAt // Handle both formats
            };
        }
        
        // Merge tools and suggestions
        for (const importedTool of weaveData.tools) {
            const existingToolIndex = existingData.weaves[weaveId].tools.findIndex(
                tool => tool.toolId === importedTool.id || tool.id === importedTool.id
            );
            
            if (existingToolIndex >= 0) {
                // Update existing tool with imported suggestions
                const existingTool = existingData.weaves[weaveId].tools[existingToolIndex];
                
                // Merge suggestions, avoiding duplicates based on content and selected text
                if (importedTool.suggestions && importedTool.suggestions.length > 0) {
                    if (!existingTool.suggestions) {
                        existingTool.suggestions = [];
                    }
                    
                    for (const importedSuggestion of importedTool.suggestions) {
                        const isDuplicate = existingTool.suggestions.some(existing => 
                            existing.selectedText === importedSuggestion.selectedText &&
                            existing.suggestionText === importedSuggestion.suggestionText
                        );
                        
                        if (!isDuplicate) {
                            // Assign new ID to avoid conflicts
                            const newSuggestion = {
                                ...importedSuggestion,
                                id: Date.now() + Math.random(),
                                importedAt: new Date().toISOString()
                            };
                            existingTool.suggestions.push(newSuggestion);
                        }
                    }
                }
            } else {
                // Add new tool with its suggestions
                const newTool = { ...importedTool };
                if (newTool.suggestions) {
                    // Assign new IDs to suggestions to avoid conflicts
                    newTool.suggestions = newTool.suggestions.map(suggestion => ({
                        ...suggestion,
                        id: Date.now() + Math.random(),
                        importedAt: new Date().toISOString()
                    }));
                }
                existingData.weaves[weaveId].tools.push(newTool);
            }
        }
    }
    
    // Save merged data back to storage
    await browser.storage.local.set({ [storageKey]: existingData });
    
    // Import suggestions for ALL weaves in the exposition
    for (const [weaveId, weaveData] of Object.entries(importData.weaves)) {
        if (weaveData.tools) {
            const suggestionsKey = `rc_suggestions_${targetExpositionId}_${weaveId}`;
            const existingSuggestions = await browser.storage.local.get(suggestionsKey);
            const suggestions = existingSuggestions[suggestionsKey] || {};
            
            // Import suggestions for each tool in this weave
            for (const tool of weaveData.tools) {
                if (tool.suggestions && tool.suggestions.length > 0) {
                    const toolKey = tool.id || tool.toolId; // Handle both id formats
                    if (!suggestions[toolKey]) {
                        suggestions[toolKey] = [];
                    }
                    
                    // Add imported suggestions with new IDs
                    for (const suggestion of tool.suggestions) {
                        const isDuplicate = suggestions[toolKey].some(existing => 
                            existing.selectedText === suggestion.selectedText &&
                            existing.suggestionText === suggestion.suggestionText
                        );
                        
                        if (!isDuplicate) {
                            suggestions[toolKey].push({
                                ...suggestion,
                                id: Date.now() + Math.random(),
                                importedAt: new Date().toISOString()
                            });
                        }
                    }
                }
            }
            
            // Save suggestions for this weave
            await browser.storage.local.set({ [suggestionsKey]: suggestions });
        }
    }
}

// Function to show import status messages
function showImportStatus(message, type = 'info') {
    // Remove any existing status message
    const existingStatus = document.getElementById('rc-import-status');
    if (existingStatus) {
        existingStatus.remove();
    }
    
    const statusDiv = document.createElement('div');
    statusDiv.id = 'rc-import-status';
    statusDiv.className = `rc-import-status rc-import-${type}`;
    statusDiv.textContent = message;
    
    document.body.appendChild(statusDiv);
    
    // Remove status message after 4 seconds
    setTimeout(() => {
        if (statusDiv.parentNode) {
            statusDiv.remove();
        }
    }, 4000);
}

// Global variable to track view state
let isTextOnlyView = false;
let originalPageContent = null;
let cachedTools = null;
let cachedToolsData = null;
let lastToolIdentification = 0;

// Function to toggle between normal and text-only view
async function toggleTextOnlyView() {
    const toggleButton = document.getElementById('rc-view-toggle-btn');
    
    console.log('RC Tool Commenter: Toggle clicked, current isTextOnlyView:', isTextOnlyView);
    
    if (!isTextOnlyView) {
        // Store current tools and their data before switching
        cachedTools = getAllTextTools();
        cachedToolsData = cachedTools.map(tool => extractToolContent(tool));
        console.log('Cached tools before switching:', cachedTools.length);
        console.log('Cached tools data:', cachedToolsData.length);
        
        // Switch TO text-only view
        await showTextOnlyView();
        isTextOnlyView = true;
        console.log('RC Tool Commenter: Switched TO text-only view');
        
        // Update button
        toggleButton.innerHTML = `
            <span>
                <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 6px;">
                    <path fill="currentColor" d="M0 1.5A.5.5 0 0 1 .5 1H2a.5.5 0 0 1 .485.379L2.89 3H14.5a.5.5 0 0 1 .491.592l-1.5 8A.5.5 0 0 1 13 12H4a.5.5 0 0 1-.491-.408L2.01 3.607 1.61 2H.5a.5.5 0 0 1-.5-.5zM3.102 4l1.313 7h8.17l1.313-7H3.102zM5 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-7 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
                </svg>
                Normal View
            </span>
        `;
        toggleButton.title = 'Switch back to normal view';
    } else {
        // Switch BACK TO normal view
        console.log('RC Tool Commenter: Attempting to switch BACK TO normal view');
        showNormalView();
        isTextOnlyView = false;
        console.log('RC Tool Commenter: Switched BACK TO normal view');
        
        // Update button
        toggleButton.innerHTML = `
            <span>
                <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 6px;">
                    <path fill="currentColor" d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
                </svg>
                Text View
            </span>
        `;
        toggleButton.title = 'Toggle between normal and text-only view';
    }
}

// Function to show text-only view
async function showTextOnlyView() {
    // Use cached tools or get them fresh
    const tools = cachedTools || getAllTextTools();
    console.log('Using tools for text-only view:', tools.length);
    
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = extractFromUrl('weave') || bodyElement.dataset.weave || 'unknown';
    
    // Get suggestions for this weave
    const storageKey = `rc_suggestions_${expositionId}_${weaveId}`;
    const result = await browser.storage.local.get(storageKey);
    const suggestions = result[storageKey] || {};
    
    // Create text-only view container
    const textOnlyContainer = document.createElement('div');
    textOnlyContainer.id = 'rc-text-only-view';
    textOnlyContainer.className = 'rc-text-only-container';
    
    // Add header
    const header = document.createElement('div');
    header.className = 'rc-text-only-header';
    header.innerHTML = `
        <h2>Text-Only View</h2>
        <p>Showing ${tools.length} text tools from current weave</p>
    `;
    textOnlyContainer.appendChild(header);
    
    // Create scrollable content area
    const contentArea = document.createElement('div');
    contentArea.className = 'rc-text-only-content';
    
    // Process each tool
    tools.forEach((tool, index) => {
        // Use cached tool data if available, otherwise extract fresh
        const toolData = cachedToolsData ? cachedToolsData[index] : extractToolContent(tool);
        const toolId = toolData.id || (tool.dataset ? tool.dataset.id : null);
        
        if (!toolId) {
            console.warn('No tool ID found for tool', index);
            return;
        }
        
        const toolSuggestions = suggestions[toolId] || [];
        
        // Create tool item
        const toolItem = document.createElement('div');
        toolItem.className = 'rc-text-only-item';
        toolItem.dataset.originalToolId = toolId;
        
        // Add tool header with number and suggestion count
        const toolHeader = document.createElement('div');
        toolHeader.className = 'rc-text-only-item-header';
        toolHeader.innerHTML = `
            <span class="rc-tool-number">Tool #${index + 1}</span>
            <span class="rc-tool-id">ID: ${toolId}</span>
            ${toolSuggestions.length > 0 ? `<span class="rc-suggestion-indicator">${toolSuggestions.length} suggestion${toolSuggestions.length > 1 ? 's' : ''}</span>` : ''}
        `;
        
        // Add suggestion badge if there are suggestions
        if (toolSuggestions.length > 0) {
            const badge = document.createElement('div');
            badge.className = 'rc-suggestion-count rc-text-view-badge';
            badge.textContent = toolSuggestions.length;
            badge.addEventListener('click', async () => {
                // Create a mock tool object for the suggestion viewer
                const mockTool = { dataset: { id: toolId } };
                await showToolSuggestions(mockTool);
            });
            toolHeader.appendChild(badge);
        }
        
        toolItem.appendChild(toolHeader);
        
        // Add tool content
        const toolContent = document.createElement('div');
        toolContent.className = 'rc-text-only-item-content';
        toolContent.innerHTML = toolData.content.html || toolData.content.plainText;
        
        // Make content clickable for suggestions
        toolContent.addEventListener('click', (event) => {
            // If Cmd key is pressed, allow normal interaction (don't prevent default)
            if (event.metaKey) {
                console.log('RC Tool Commenter: Cmd+click detected, allowing normal interaction');
                return; // Let the event bubble normally
            }
            
            event.preventDefault();
            event.stopPropagation();
            
            const clickX = event.clientX;
            const clickY = event.clientY;
            
            createTextSuggestionInterface(toolData, clickX, clickY);
        });
        
        toolItem.appendChild(toolContent);
        contentArea.appendChild(toolItem);
    });
    
    textOnlyContainer.appendChild(contentArea);
    
    // Replace body content but keep buttons
    const buttonsToKeep = [
        document.getElementById('rc-save-tools-btn'),
        document.getElementById('rc-import-tools-btn'),
        document.getElementById('rc-view-toggle-btn'),
        document.getElementById('rc-file-input')
    ].filter(btn => btn !== null);
    
    // Clear body
    document.body.innerHTML = '';
    
    // Add text-only view
    document.body.appendChild(textOnlyContainer);
    
    // Re-add buttons
    buttonsToKeep.forEach(button => {
        document.body.appendChild(button);
    });
}

// Function to restore normal view
function showNormalView() {
    console.log('RC Tool Commenter: Switching back to normal view');
    
    // Reset view state first
    isTextOnlyView = false;
    
    // Remove text-only view container if it exists
    const textOnlyView = document.getElementById('rc-text-only-view');
    if (textOnlyView) {
        textOnlyView.remove();
    }
    
    // Check if we have original content to restore
    if (!originalPageContent) {
        console.log('RC Tool Commenter: No original content cached, reloading page');
        window.location.reload();
        return;
    }
    
    // Restore the original page content
    document.body.innerHTML = originalPageContent;
    
    // Clear enhancement attributes from all restored tools so they can be re-enhanced
    const restoredTools = document.querySelectorAll('[data-rc-tool-enhanced]');
    restoredTools.forEach(tool => {
        tool.removeAttribute('data-rc-tool-enhanced');
        console.log('RC Tool Commenter: Cleared enhancement attribute from restored tool:', tool.dataset.id);
    });
    
    // Remove any leftover RC overlays
    const leftoverOverlays = document.querySelectorAll('.rc-tool-overlay, .rc-suggestion-interface, .rc-text-only-container');
    leftoverOverlays.forEach(overlay => overlay.remove());
    
    // Clear cached data
    cachedTools = null;
    cachedToolsData = null;
    lastToolIdentification = 0;
    
    // Re-initialize with a promise-based approach for better control
    const reinitialize = async () => {
        try {
            console.log('RC Tool Commenter: Re-initializing normal view...');
            console.log('RC Tool Commenter: Page title:', document.title);
            console.log('RC Tool Commenter: Current URL:', window.location.href);
            
            // Wait for DOM to be ready
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Check if we're still on a valid RC page
            if (!window.location.href.includes('researchcatalogue.net')) {
                console.log('RC Tool Commenter: Not on RC page after restore, skipping initialization');
                return;
            }
            
            // Force tool re-identification (bypass throttling and full init)
            console.log('RC Tool Commenter: Forcing tool re-identification...');
            lastToolIdentification = 0; // Reset throttle
            await identifyTools(); // Force immediate identification
            
            console.log('RC Tool Commenter: Normal view restored successfully');
            
        } catch (error) {
            console.error('RC Tool Commenter: Failed to restore normal view:', error);
            console.log('RC Tool Commenter: Falling back to page reload');
            // Give user a choice instead of auto-reloading
            if (confirm('Failed to restore normal view. Reload the page?')) {
                window.location.reload();
            }
        }
    };
    
    reinitialize();
}

// Function to create text suggestion interface
function createTextSuggestionInterface(toolOrData, clickX, clickY) {
    // Remove any existing suggestion interface
    const existingSuggestion = document.getElementById('rc-text-suggestion');
    if (existingSuggestion) {
        existingSuggestion.remove();
    }
    
    // Handle both tool DOM elements and tool data objects
    let tool, toolData;
    if (toolOrData.dataset) {
        // This is a DOM element
        tool = toolOrData;
        toolData = extractToolContent(tool);
    } else {
        // This is already tool data
        toolData = toolOrData;
        tool = null;
    }
    
    // Create suggestion overlay
    const suggestionOverlay = document.createElement('div');
    suggestionOverlay.id = 'rc-text-suggestion';
    suggestionOverlay.className = 'rc-text-suggestion-overlay';
    
    // For text-only view, we work with the toolData content directly
    // For normal view, try to find text content within the tool
    let textContent = null;
    if (tool) {
        textContent = tool.querySelector('.html-text-editor-content');
    }
    
    if (!textContent && !toolData.content) {
        showNotification('No editable text found in this tool');
        return;
    }
    
    // Get the HTML content to display
    const htmlContent = textContent ? textContent.innerHTML : (toolData.content.html || toolData.content.plainText);
    
    // Create suggestion interface HTML
    suggestionOverlay.innerHTML = `
        <div class="rc-suggestion-header">
            <h3>Suggest Text Edits</h3>
            <button class="rc-close-suggestion" title="Close">×</button>
        </div>
        <div class="rc-suggestion-content">
            <div class="rc-text-selection-area">
                <p><strong>Instructions:</strong> Select text below to add suggestions</p>
                <div class="rc-selectable-text" contenteditable="false">${htmlContent}</div>
            </div>
            <div class="rc-suggestion-form" style="display: none;">
                <div class="rc-selected-text-display">
                    <label>Selected text:</label>
                    <div class="rc-selected-text"></div>
                </div>
                <div class="rc-suggestion-input">
                    <label for="rc-suggestion-text">Your suggestion:</label>
                    <textarea id="rc-suggestion-text" placeholder="Suggest changes for the selected text..." rows="3"></textarea>
                </div>
                <div class="rc-suggestion-actions">
                    <button class="rc-save-suggestion">Save Suggestion</button>
                    <button class="rc-cancel-suggestion">Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    // Position overlay
    suggestionOverlay.style.cssText = `
        position: fixed;
        top: 50px;
        right: 20px;
        width: 400px;
        max-height: 80vh;
        background: white;
        border: 2px solid #007bff;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        overflow-y: auto;
    `;
    
    document.body.appendChild(suggestionOverlay);
    
    // Set up event handlers
    setupSuggestionEventHandlers(suggestionOverlay, tool, toolData);
    
    return suggestionOverlay;
}

// Function to set up suggestion interface event handlers
function setupSuggestionEventHandlers(overlay, tool, toolData) {
    const closeBtn = overlay.querySelector('.rc-close-suggestion');
    const selectableText = overlay.querySelector('.rc-selectable-text');
    const suggestionForm = overlay.querySelector('.rc-suggestion-form');
    const selectedTextDisplay = overlay.querySelector('.rc-selected-text');
    const suggestionTextarea = overlay.querySelector('#rc-suggestion-text');
    const saveBtn = overlay.querySelector('.rc-save-suggestion');
    const cancelBtn = overlay.querySelector('.rc-cancel-suggestion');
    
    let currentSelection = null;
    
    // Close button
    closeBtn.addEventListener('click', () => {
        overlay.remove();
    });
    
    // Text selection handling
    selectableText.addEventListener('mouseup', () => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText.length > 0) {
            // Check if selection is within our selectable area
            const range = selection.getRangeAt(0);
            if (selectableText.contains(range.commonAncestorContainer)) {
                currentSelection = {
                    text: selectedText,
                    range: range.cloneRange(),
                    startOffset: range.startOffset,
                    endOffset: range.endOffset,
                    startContainer: range.startContainer,
                    endContainer: range.endContainer
                };
                
                // Highlight selected text
                highlightSelectedText(range, selectableText);
                
                // Show suggestion form
                selectedTextDisplay.textContent = selectedText;
                suggestionForm.style.display = 'block';
                suggestionTextarea.focus();
            }
        }
    });
    
    // Save suggestion
    saveBtn.addEventListener('click', async () => {
        if (!currentSelection || !suggestionTextarea.value.trim()) {
            showNotification('Please select text and enter a suggestion');
            return;
        }
        
        await saveSuggestion(tool || toolData, currentSelection, suggestionTextarea.value.trim());
        overlay.remove();
        showNotification('Suggestion saved successfully');
    });
    
    // Cancel suggestion
    cancelBtn.addEventListener('click', () => {
        suggestionForm.style.display = 'none';
        clearHighlights(selectableText);
        currentSelection = null;
    });
    
    // Close on escape key
    document.addEventListener('keydown', function escapeHandler(e) {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    });
}

// Function to highlight selected text
function highlightSelectedText(range, container) {
    // Clear previous highlights
    clearHighlights(container);
    
    // Create highlight span
    const highlight = document.createElement('span');
    highlight.className = 'rc-text-highlight';
    highlight.style.cssText = `
        background: rgba(255, 235, 59, 0.6);
        border: 1px solid rgba(255, 193, 7, 0.8);
        border-radius: 2px;
        padding: 1px 2px;
    `;
    
    try {
        range.surroundContents(highlight);
    } catch (e) {
        // Fallback for complex selections
        const contents = range.extractContents();
        highlight.appendChild(contents);
        range.insertNode(highlight);
    }
}

// Function to clear text highlights
function clearHighlights(container) {
    const highlights = container.querySelectorAll('.rc-text-highlight');
    highlights.forEach(highlight => {
        const parent = highlight.parentNode;
        while (highlight.firstChild) {
            parent.insertBefore(highlight.firstChild, highlight);
        }
        parent.removeChild(highlight);
    });
}

// Function to save suggestion
async function saveSuggestion(toolOrData, selection, suggestionText) {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
    
    // Handle both tool DOM elements and tool data objects
    let toolId, toolType;
    if (toolOrData.dataset) {
        // This is a DOM element
        toolId = toolOrData.dataset.id || 'unknown';
        toolType = toolOrData.dataset.tool || 'unknown';
    } else {
        // This is tool data
        toolId = toolOrData.id || 'unknown';
        toolType = toolOrData.type || 'unknown';
    }
    
    const suggestion = {
        id: `suggestion_${Date.now()}`,
        toolId: toolId,
        expositionId: expositionId,
        weaveId: weaveId,
        selectedText: selection.text,
        suggestion: suggestionText,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        toolType: toolType
    };
    
    // Store suggestion in browser storage using weave-specific format
    const storageKey = `rc_suggestions_${expositionId}_${weaveId}`;
    const result = await browser.storage.local.get(storageKey);
    const suggestions = result[storageKey] || {};
    
    // Initialize array for this tool if it doesn't exist
    if (!suggestions[toolId]) {
        suggestions[toolId] = [];
    }
    
    suggestions[toolId].push(suggestion);
    await browser.storage.local.set({ [storageKey]: suggestions });
    
    console.log('Saved suggestion:', suggestion);
    
    // Update tool's stored data to include suggestion count (only if we have a DOM tool)
    if (toolOrData.dataset) {
        await updateToolWithSuggestionCount(toolOrData);
    }
    
    // Update save button with new suggestion count
    const expositionStorageKey = `rc_exposition_${expositionId}`;
    const expositionResult = await browser.storage.local.get(expositionStorageKey);
    if (expositionResult[expositionStorageKey]) {
        await updateSaveButtonCount(expositionResult[expositionStorageKey]);
    }
    
    // If we're in text-only view, update the suggestion badge for this tool
    if (isTextOnlyView) {
        const textOnlyItem = document.querySelector(`[data-original-tool-id="${toolId}"]`);
        if (textOnlyItem) {
            // Update or add suggestion badge in text-only view
            const existingBadge = textOnlyItem.querySelector('.rc-text-view-badge');
            const toolSuggestions = suggestions[toolId] || [];
            const newCount = toolSuggestions.length;
            
            if (existingBadge) {
                existingBadge.textContent = newCount;
            } else if (newCount > 0) {
                const header = textOnlyItem.querySelector('.rc-text-only-item-header');
                if (header) {
                    const badge = document.createElement('div');
                    badge.className = 'rc-suggestion-count rc-text-view-badge';
                    badge.textContent = newCount;
                    badge.addEventListener('click', async () => {
                        const mockTool = { dataset: { id: toolId } };
                        await showToolSuggestions(mockTool);
                    });
                    header.appendChild(badge);
                }
            }
        }
    }
}

// Function to update tool with suggestion count
async function updateToolWithSuggestionCount(tool) {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = extractFromUrl('weave') || bodyElement.dataset.weave || 'unknown';
    const toolId = tool.dataset.id || 'unknown';
    
    // Get suggestions for this tool in the current weave
    const storageKey = `rc_suggestions_${expositionId}_${weaveId}`;
    const result = await browser.storage.local.get(storageKey);
    const suggestions = result[storageKey] || {};
    
    const toolSuggestions = suggestions[toolId] || [];
    
    // Use the centralized badge function
    addSuggestionBadge(tool, toolSuggestions.length);
}

// Function to show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'rc-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// Function to get tool name/type
function getToolName(element) {
    // Try to extract tool name from data-tool attribute first (most reliable)
    let toolName = '';
    
    if (element.dataset.tool) {
        toolName = element.dataset.tool;
    } else {
        // Extract tool type from class names
        const classes = element.className.split(' ');
        const toolClass = classes.find(cls => cls.startsWith('tool-'));
        if (toolClass) {
            // Convert class name to readable format
            toolName = toolClass.replace('tool-', '').replace(/[-_]/g, ' ');
            // Capitalize first letter of each word
            toolName = toolName.replace(/\b\w/g, l => l.toUpperCase());
        }
    }
    
    // If still no name found, try to infer from content or fallback
    if (!toolName) {
        if (element.querySelector('img')) {
            toolName = 'Picture';
        } else if (element.querySelector('video')) {
            toolName = 'Video';
        } else if (element.querySelector('audio')) {
            toolName = 'Audio';
        } else if (element.querySelector('.html-text-editor-content')) {
            toolName = 'Text';
        } else {
            toolName = 'Media Tool';
        }
    }
    
    // Get additional info from data attributes if available
    const toolId = element.dataset.id;
    const toolTitle = element.dataset.title;
    
    if (toolTitle && toolTitle.trim()) {
        toolName += ` - ${toolTitle}`;
    } else if (toolId) {
        toolName += ` (ID: ${toolId})`;
    }
    
    return toolName || 'Unknown Tool';
}

// Function to create and show tool name display
function showToolName(toolName, x, y) {
    // Remove any existing tooltip
    const existingTooltip = document.getElementById('rc-tool-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.id = 'rc-tool-tooltip';
    tooltip.className = 'rc-tool-tooltip';
    tooltip.textContent = toolName;
    
    // Position tooltip
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    
    document.body.appendChild(tooltip);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        if (tooltip && tooltip.parentNode) {
            tooltip.remove();
        }
    }, 3000);
}

// Function to enhance tools with click handlers
async function enhanceTools() {
    // Skip tool enhancement if we're in text-only view
    if (isTextOnlyView) {
        console.log('RC Tool Commenter: Skipping tool enhancement - in text-only view');
        return;
    }
    
    const tools = identifyTools();
    
    console.log(`RC Tool Commenter: Found ${tools.length} tools to enhance`);
    
    // Store found tools in memory for cross-weave collection
    if (tools.length > 0) {
        await storeToolsInMemory(tools);
    }
    
    // Restore suggestion badges for tools that have suggestions
    await restoreSuggestionBadges(tools);
    
    tools.forEach((tool, index) => {
        // Mark as enhanced to avoid duplicate processing
        tool.setAttribute('data-rc-tool-enhanced', 'true');
        
        // Add visual indicator (more subtle for RC interface)
        tool.style.cursor = 'pointer';
        tool.style.outline = '1px dashed rgba(0, 123, 255, 0.4)';
        tool.style.outlineOffset = '1px';
        tool.style.transition = 'outline 0.2s ease-in-out';
        
        // Add a subtle overlay to indicate interactivity
        const overlay = document.createElement('div');
        overlay.className = 'rc-tool-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 123, 255, 0.05);
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease-in-out;
            z-index: 1;
        `;
        
        // Insert overlay as first child to ensure it doesn't interfere with content
        if (tool.style.position !== 'absolute' && tool.style.position !== 'relative') {
            tool.style.position = 'relative';
        }
        tool.insertBefore(overlay, tool.firstChild);
        
        // Add click handler
        tool.addEventListener('click', (event) => {
            // If Cmd key is pressed, allow normal interaction (don't prevent default)
            if (event.metaKey) {
                console.log('RC Tool Commenter: Cmd+click detected, allowing normal interaction');
                return; // Let the event bubble normally
            }
            
            event.preventDefault();
            event.stopPropagation();
            
            const toolType = tool.dataset.tool;
            
            // For text tools, open suggestion interface
            if (toolType === 'text' || toolType === 'simpletext') {
                createTextSuggestionInterface(tool, event.clientX, event.clientY);
            } else {
                // For other tools, show tooltip as before
                const toolName = getToolName(tool);
                const x = event.clientX;
                const y = event.clientY - 40;
                
                console.log(`RC Tool Commenter: Clicked on tool "${toolName}"`);
                showToolName(toolName, x, y);
            }
        });
        
        // Add hover effect
        tool.addEventListener('mouseenter', () => {
            tool.style.outline = '1px solid rgba(0, 123, 255, 0.8)';
            const overlay = tool.querySelector('.rc-tool-overlay');
            if (overlay) {
                overlay.style.opacity = '1';
            }
        });
        
        tool.addEventListener('mouseleave', () => {
            tool.style.outline = '1px dashed rgba(0, 123, 255, 0.4)';
            const overlay = tool.querySelector('.rc-tool-overlay');
            if (overlay) {
                overlay.style.opacity = '0';
            }
        });
    });
}

// Function to restore suggestion badges when navigating between weaves
async function restoreSuggestionBadges(tools) {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = extractFromUrl('weave') || bodyElement.dataset.weave || 'unknown';
    
    // Get suggestions for this exposition and weave
    const storageKey = `rc_suggestions_${expositionId}_${weaveId}`;
    const result = await browser.storage.local.get(storageKey);
    const suggestions = result[storageKey] || {};
    
    // Add badges to tools that have suggestions
    tools.forEach(tool => {
        const toolId = tool.dataset.id;
        if (toolId && suggestions[toolId] && suggestions[toolId].length > 0) {
            const suggestionCount = suggestions[toolId].length;
            addSuggestionBadge(tool, suggestionCount);
        }
    });
}

// Function to add suggestion badge to a tool
function addSuggestionBadge(tool, count) {
    // Safety check: ensure tool is still in the DOM
    if (!tool || !tool.parentNode) {
        console.log('Tool is detached from DOM, skipping badge addition');
        return;
    }
    
    // Remove existing badge
    const existing = tool.querySelector('.rc-suggestion-count');
    if (existing) {
        existing.remove();
    }
    
    if (count > 0) {
        const badge = document.createElement('div');
        badge.className = 'rc-suggestion-count';
        badge.textContent = count;
        badge.title = `Click to view ${count} suggestion${count > 1 ? 's' : ''}`;
        badge.style.cssText = `
            position: absolute;
            top: -8px;
            right: -8px;
            background: #dc3545;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            font-size: 11px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            cursor: pointer;
            transition: transform 0.2s ease-in-out;
        `;
        
        // Add hover effect
        badge.addEventListener('mouseenter', () => {
            badge.style.transform = 'scale(1.1)';
        });
        
        badge.addEventListener('mouseleave', () => {
            badge.style.transform = 'scale(1)';
        });
        
        // Add click handler to show suggestions
        badge.addEventListener('click', async (event) => {
            event.stopPropagation();
            event.preventDefault();
            await showToolSuggestions(tool);
        });
        
        tool.appendChild(badge);
    }
}

// Function to show existing suggestions for a tool
async function showToolSuggestions(tool) {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = extractFromUrl('weave') || bodyElement.dataset.weave || 'unknown';
    const toolId = tool.dataset.id || 'unknown';
    
    // Get suggestions for this tool in the current weave
    const storageKey = `rc_suggestions_${expositionId}_${weaveId}`;
    const result = await browser.storage.local.get(storageKey);
    const suggestions = result[storageKey] || {};
    
    const toolSuggestions = suggestions[toolId] || [];
    
    if (toolSuggestions.length === 0) {
        showNotification('No suggestions found for this tool');
        return;
    }
    
    // Remove any existing suggestion viewer
    const existingViewer = document.getElementById('rc-suggestion-viewer');
    if (existingViewer) {
        existingViewer.remove();
    }
    
    // Create suggestion viewer overlay
    const viewer = document.createElement('div');
    viewer.id = 'rc-suggestion-viewer';
    viewer.className = 'rc-suggestion-viewer';
    
    // Sort suggestions by timestamp (newest first)
    const sortedSuggestions = toolSuggestions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    viewer.innerHTML = `
        <div class="rc-suggestion-viewer-header">
            <h3>Suggestions for Tool ${toolId}</h3>
            <button class="rc-close-viewer" title="Close">×</button>
        </div>
        <div class="rc-suggestion-viewer-content">
            <div class="rc-suggestions-list">
                ${sortedSuggestions.map((suggestion, index) => `
                    <div class="rc-suggestion-item">
                        <div class="rc-suggestion-meta">
                            <span class="rc-suggestion-number">#${index + 1}</span>
                            <span class="rc-suggestion-date">${formatDate(suggestion.timestamp)}</span>
                            <span class="rc-suggestion-weave">Weave ${suggestion.weaveId}</span>
                        </div>
                        <div class="rc-suggestion-selected-text">
                            <label>Selected text:</label>
                            <div class="rc-selected-text-display">"${suggestion.selectedText}"</div>
                        </div>
                        <div class="rc-suggestion-content">
                            <label>Suggestion:</label>
                            <div class="rc-suggestion-text">${suggestion.suggestion}</div>
                        </div>
                        <div class="rc-suggestion-actions">
                            <button class="rc-delete-suggestion" data-suggestion-id="${suggestion.id}" title="Delete this suggestion">
                                <svg width="14" height="14" viewBox="0 0 16 16">
                                    <path fill="currentColor" d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                                    <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                                </svg>
                                Delete
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Position and style the viewer
    viewer.style.cssText = `
        position: fixed;
        top: 50px;
        left: 50%;
        transform: translateX(-50%);
        width: 600px;
        max-width: 90vw;
        max-height: 80vh;
        background: white;
        border: 2px solid #dc3545;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        z-index: 10001;
        overflow-y: auto;
    `;
    
    document.body.appendChild(viewer);
    
    // Set up event handlers
    setupSuggestionViewerHandlers(viewer, tool);
}

// Function to format date for display
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// Function to set up suggestion viewer event handlers
function setupSuggestionViewerHandlers(viewer, tool) {
    const closeBtn = viewer.querySelector('.rc-close-viewer');
    const deleteButtons = viewer.querySelectorAll('.rc-delete-suggestion');
    
    // Close button
    closeBtn.addEventListener('click', () => {
        viewer.remove();
    });
    
    // Delete suggestion buttons
    deleteButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const suggestionId = button.dataset.suggestionId;
            const confirmed = confirm('Are you sure you want to delete this suggestion?');
            
            if (confirmed) {
                await deleteSuggestion(suggestionId, tool);
                viewer.remove();
                showNotification('Suggestion deleted');
            }
        });
    });
    
    // Close on escape key
    document.addEventListener('keydown', function escapeHandler(e) {
        if (e.key === 'Escape') {
            viewer.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    });
    
    // Close when clicking outside
    viewer.addEventListener('click', (e) => {
        if (e.target === viewer) {
            viewer.remove();
        }
    });
}

// Function to delete a suggestion
async function deleteSuggestion(suggestionId, tool) {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    
    // Get current suggestions
    const storageKey = `rc_suggestions_${expositionId}`;
    const result = await browser.storage.local.get(storageKey);
    let suggestions = result[storageKey] || [];
    
    // Remove the suggestion
    suggestions = suggestions.filter(s => s.id !== suggestionId);
    
    // Save updated suggestions
    await browser.storage.local.set({ [storageKey]: suggestions });
    
    // Update tool badge
    await updateToolWithSuggestionCount(tool);
    
    // Update save button
    const expositionStorageKey = `rc_exposition_${expositionId}`;
    const expositionResult = await browser.storage.local.get(expositionStorageKey);
    if (expositionResult[expositionStorageKey]) {
        await updateSaveButtonCount(expositionResult[expositionStorageKey]);
    }
}

// Function to initialize the extension
async function initializeExtension() {
    if (!isExpositionPage()) {
        console.log('RC Tool Commenter: Not on a Research Catalogue exposition page');
        return;
    }
    
    console.log('RC Tool Commenter: Initializing on exposition page');
    
    // Cache CLEAN page content BEFORE any enhancements (only once)
    if (!isTextOnlyView && !originalPageContent) {
        originalPageContent = document.body.innerHTML;
        console.log('RC Tool Commenter: Cached clean page content for view switching');
    }
    
    // Cache tools immediately for text-only view
    if (!cachedTools) {
        cachedTools = getAllTextTools();
        console.log('Initial cache of tools for text-only view:', cachedTools.length);
    }
    
    // Debug: Check all available tools on the page
    const allTools = document.querySelectorAll('[class*="tool-"]');
    console.log('RC Tool Commenter: All elements with "tool-" in class:', allTools.length);
    allTools.forEach((tool, i) => {
        console.log(`Tool ${i+1}:`, tool.className, 'Data-tool:', tool.dataset.tool, tool);
    });
    
    // Load existing data to update button count
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const storageKey = `rc_exposition_${expositionId}`;
    const result = await browser.storage.local.get(storageKey);
    
    // Initial enhancement
    enhanceTools();
    
    // Update button with existing counts if available
    if (result[storageKey]) {
        await updateSaveButtonCount(result[storageKey]);
    }
    
    // Watch for dynamically added content
    const observer = new MutationObserver((mutations) => {
        let shouldRecheck = false;
        
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                shouldRecheck = true;
            }
        });
        
        if (shouldRecheck) {
            setTimeout(enhanceTools, 500); // Delay to allow content to settle
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Wait for page to load and initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
}

// Also run after a delay for dynamic content
setTimeout(initializeExtension, 2000);