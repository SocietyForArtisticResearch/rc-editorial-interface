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

// Function to remove existing suggestion spans from HTML to get clean original content
function removeExistingSuggestionSpans(html) {
    // Create a temporary div to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Find all suggestion spans and replace them with their text content
    const suggestionSpans = tempDiv.querySelectorAll('.rc-suggestion-highlight');
    suggestionSpans.forEach(span => {
        // Replace the span with its text content
        const textNode = document.createTextNode(span.textContent);
        span.parentNode.replaceChild(textNode, span);
    });
    
    return tempDiv.innerHTML.trim();
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
            const currentHtml = textContent.innerHTML.trim();
            const hasSpansNow = currentHtml.includes('rc-suggestion-highlight');
            
            // Get the original HTML by removing any existing suggestion spans
            const originalHtml = removeExistingSuggestionSpans(currentHtml);
            
            console.log(`📝 Tool ${toolData.id}: spans=${hasSpansNow}, html=${originalHtml.length}chars, htmlSpan=${currentHtml.length}chars`);
            
            // Get both plain text and HTML content
            toolData.content = {
                plainText: textContent.innerText.trim(),
                html: originalHtml, // Always the original HTML without spans
                htmlSpan: currentHtml // Current HTML state with any existing suggestion spans
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
    
    // Get suggestions for this weave
    const suggestionsKey = `rc_suggestions_${expositionId}_${weaveId}`;
    console.log('RC Tool Commenter: Looking for suggestions with key:', suggestionsKey);
    const suggestionsResult = await browser.storage.local.get(suggestionsKey);
    const suggestions = suggestionsResult[suggestionsKey] || {};
    console.log('RC Tool Commenter: Found suggestions:', suggestions);
    
    tools.forEach(tool => {
        const toolData = extractToolContent(tool);
        
        // Preserve existing htmlSpan data if it has spans and current DOM doesn't
        const toolId = toolData.id;
        const existingToolData = expositionData.weaves[weaveId]?.tools?.find(t => t.id === toolId);
        
        if (existingToolData?.content?.htmlSpan && 
            existingToolData.content.htmlSpan !== existingToolData.content.html &&
            toolData.content.htmlSpan === toolData.content.html) {
            
            console.log(`🔒 Preserving existing span data for tool ${toolId} (${existingToolData.content.htmlSpan.length} chars)`);
            toolData.content.htmlSpan = existingToolData.content.htmlSpan;
        }
        
        // Add suggestions for this tool
        console.log(`RC Tool Commenter: Processing tool ${toolId}, looking for suggestions...`);
        toolData.suggestions = suggestions[toolId] || [];
        toolData.suggestionCount = toolData.suggestions.length;
        console.log(`RC Tool Commenter: Tool ${toolId} has ${toolData.suggestionCount} suggestions:`, toolData.suggestions);
        
        weaveTools.push(toolData);
    });
    
    // Store tools organized by weave
    const totalSuggestions = weaveTools.reduce((sum, tool) => sum + tool.suggestionCount, 0);
    
    expositionData.weaves[weaveId] = {
        weaveId: weaveId,
        url: window.location.href,
        tools: weaveTools,
        toolCount: weaveTools.length,
        suggestionCount: totalSuggestions,
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
    
    if (!expositionData || !expositionData.weaves || Object.keys(expositionData.weaves).length === 0) {
        showNotification('No tools found to save');
        return;
    }
    
    console.log('RC Tool Commenter: Exporting exposition data:', expositionData);
    
    // Calculate totals from the stored data (suggestions are already attached to tools)
    let totalTools = 0;
    let totalSuggestions = 0;
    
    Object.values(expositionData.weaves).forEach(weave => {
        totalTools += weave.tools.length;
        weave.tools.forEach(tool => {
            totalSuggestions += tool.suggestionCount || 0;
        });
    });
    
    // Create comprehensive JSON structure
    const exportData = {
        exposition: {
            id: expositionId,
            exportTimestamp: new Date().toISOString(),
            totalWeaves: Object.keys(expositionData.weaves).length,
            totalTools: totalTools,
            totalSuggestions: totalSuggestions
        },
        weaves: expositionData.weaves  // Use the weaves data as-is since it already contains suggestions
    };
    
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
let toolsStoredForCurrentWeave = false; // Flag to prevent repeated storage calls
let suggestionBadgesRestored = false; // Flag to prevent repeated badge restoration

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
            
            // Re-initialize RC navigation functionality
            console.log('RC Tool Commenter: Re-initializing RC navigation...');
            reinitializeRCNavigation();
            
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

// Function to re-initialize Research Catalogue's navigation functionality
function reinitializeRCNavigation() {
    try {
        console.log('RC Tool Commenter: Debugging navigation structure...');
        
        // Debug: Check what navigation elements exist
        const navigation = document.querySelector('#navigation');
        if (navigation) {
            console.log('Navigation found:', navigation);
            console.log('Navigation HTML:', navigation.outerHTML.substring(0, 500) + '...');
        } else {
            console.log('Navigation element not found!');
        }
        
        // Check for main menu
        const mainMenu = document.querySelector('.mainmenu');
        if (mainMenu) {
            console.log('Main menu found:', mainMenu);
            console.log('Main menu display style:', mainMenu.style.display);
        } else {
            console.log('Main menu not found!');
        }
        
        // Check for menu items
        const menuItems = document.querySelectorAll('.menu');
        console.log('Menu items found:', menuItems.length);
        menuItems.forEach((item, index) => {
            console.log(`Menu item ${index}:`, item.className, item.querySelector('.caption')?.textContent);
        });
        
        // Re-attach the menu toggle functionality
        const menuToggleLinks = document.querySelectorAll('a[onclick*="next(\'ul\').toggle()"]');
        console.log('Found menu toggle links:', menuToggleLinks.length);
        menuToggleLinks.forEach(link => {
            // Remove the onclick attribute and add proper event listener
            link.removeAttribute('onclick');
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const nextUl = this.nextElementSibling;
                if (nextUl && nextUl.tagName === 'UL') {
                    if (nextUl.style.display === 'none' || !nextUl.style.display) {
                        nextUl.style.display = 'block';
                    } else {
                        nextUl.style.display = 'none';
                    }
                }
                return false;
            });
        });
        
        // Re-attach chapter highlighting functionality
        const chapterLinks = document.querySelectorAll('a.chapter-entry[onclick*="highlightChapter"]');
        console.log('Found chapter links:', chapterLinks.length);
        chapterLinks.forEach(link => {
            // Remove the onclick attribute and add proper event listener
            link.removeAttribute('onclick');
            link.addEventListener('click', function(e) {
                // Remove highlight from all chapter entries
                document.querySelectorAll('a.chapter-entry').forEach(chapter => {
                    chapter.classList.remove('highlighted');
                });
                // Add highlight to current chapter
                this.classList.add('highlighted');
            });
        });
        
        // Re-attach main menu icon functionality
        const menuIcon = document.querySelector('#page-menu-icon');
        const menuList = document.querySelector('#page-menu-list');
        if (menuIcon && menuList) {
            console.log('Menu icon and list found');
            // Remove any existing onclick
            menuIcon.removeAttribute('onclick');
            menuIcon.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Menu icon clicked');
                if (menuList.style.display === 'none' || !menuList.style.display) {
                    menuList.style.display = 'block';
                } else {
                    menuList.style.display = 'none';
                }
            });
        } else {
            console.log('Menu icon or list not found:', !!menuIcon, !!menuList);
        }
        
        console.log('RC Tool Commenter: Successfully re-initialized RC navigation');
        
        // Force CSS hover functionality by adding explicit styles
        addNavigationCSS();
        
    } catch (error) {
        console.error('RC Tool Commenter: Failed to re-initialize RC navigation:', error);
    }
}

// Function to add/restore navigation CSS functionality
function addNavigationCSS() {
    try {
        // Check if our navigation CSS already exists
        let navStyle = document.getElementById('rc-navigation-fix');
        if (!navStyle) {
            navStyle = document.createElement('style');
            navStyle.id = 'rc-navigation-fix';
            navStyle.textContent = `
                /* Restore navigation hover functionality */
                .mainmenu .menu {
                    position: relative;
                }
                
                .mainmenu .menu .submenu {
                    display: none !important;
                    position: absolute;
                    top: 100%;
                    left: 0;
                    background: white;
                    border: 1px solid #ccc;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    z-index: 1000;
                    min-width: 200px;
                    padding: 10px;
                }
                
                .mainmenu .menu:hover .submenu {
                    display: block !important;
                }
                
                .mainmenu .menu.menu-home .submenu {
                    background: white;
                    padding: 15px;
                }
                
                .mainmenu .menu.menu-home .submenu li {
                    list-style: none;
                    margin: 5px 0;
                }
                
                .mainmenu .menu.menu-home .submenu a {
                    text-decoration: none;
                    color: #333;
                    display: block;
                    padding: 3px 0;
                }
                
                .mainmenu .menu.menu-home .submenu a:hover {
                    background-color: #f0f0f0;
                }
            `;
            document.head.appendChild(navStyle);
            console.log('RC Tool Commenter: Added navigation CSS fix');
        }
    } catch (error) {
        console.error('RC Tool Commenter: Failed to add navigation CSS:', error);
    }
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
        console.log('RC Tool Commenter: Save button clicked');
        console.log('Current selection:', currentSelection);
        console.log('Suggestion text:', suggestionTextarea.value.trim());
        console.log('Tool/toolData:', tool || toolData);
        
        if (!currentSelection || !suggestionTextarea.value.trim()) {
            showNotification('Please select text and enter a suggestion');
            return;
        }
        
        try {
            await saveSuggestion(tool || toolData, currentSelection, suggestionTextarea.value.trim());
            console.log('RC Tool Commenter: Suggestion saved successfully');
            overlay.remove();
            showNotification('Suggestion saved successfully');
            
            // Debug: Check if suggestion was actually stored
            const bodyElement = document.body;
            const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
            const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
            const storageKey = `rc_suggestions_${expositionId}_${weaveId}`;
            const result = await browser.storage.local.get(storageKey);
            console.log('RC Tool Commenter: Suggestions in storage after save:', result[storageKey]);
            
        } catch (error) {
            console.error('RC Tool Commenter: Error saving suggestion:', error);
            showNotification('Error saving suggestion');
        }
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
    let toolId, toolType, tool;
    if (toolOrData.dataset) {
        // This is a DOM element
        tool = toolOrData;
        toolId = toolOrData.dataset.id || 'unknown';
        toolType = toolOrData.dataset.tool || 'unknown';
    } else {
        // This is tool data - for text-only view we can't modify the DOM
        toolId = toolOrData.id || 'unknown';
        toolType = toolOrData.type || 'unknown';
        tool = null;
    }
    
    // Generate unique span ID for this suggestion
    const spanId = `rc-suggestion-${toolId}-${Date.now()}`;
    
    // If we have a DOM tool, wrap the selected text in a span with the unique ID
    if (tool && selection.range) {
        try {
            const span = document.createElement('span');
            span.id = spanId;
            span.className = 'rc-suggestion-highlight';
            span.style.cssText = 'background-color: rgba(255, 235, 59, 0.3); border-bottom: 2px solid #FFC107;';
            
            // Store suggestion data directly in the span
            span.setAttribute('data-suggestion', suggestionText);
            span.setAttribute('data-selected-text', selection.text);
            
            // Add click handler to show suggestion
            span.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const suggestion = this.getAttribute('data-suggestion');
                const selectedText = this.getAttribute('data-selected-text');
                showSuggestionTooltip(this, suggestion, selectedText);
            });
            
            // Wrap the selected content
            selection.range.surroundContents(span);
            
            console.log('RC Tool Commenter: Wrapped selection in span with ID:', spanId);
        } catch (error) {
            console.warn('RC Tool Commenter: Could not wrap selection in span:', error);
            // Fall back to the old approach if wrapping fails
        }
    }
    
    const suggestion = {
        id: `suggestion_${Date.now()}`,
        toolId: toolId,
        expositionId: expositionId,
        weaveId: weaveId,
        spanId: spanId, // New field: unique identifier for the span
        selectedText: selection.text, // Keep for backward compatibility and debugging
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
    
    console.log('Saved suggestion with span ID:', suggestion);
    
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
    
    // Re-store tools to update suggestion counts in export data
    const allTextTools = document.querySelectorAll('.tool-text, .tool-simpletext');
    if (allTextTools.length > 0) {
        console.log(`💾 Re-storing tool ${toolId} with spans in DOM:`, tool ? tool.querySelector('.html-text-editor-content')?.innerHTML?.includes('rc-suggestion-highlight') : 'no DOM tool');
        await storeToolsInMemory(Array.from(allTextTools));
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

// Function to add click handlers to restored spans
async function addClickHandlersToRestoredSpans(textContent, toolId) {
    const spans = textContent.querySelectorAll('.rc-suggestion-highlight');
    if (spans.length === 0) return;
    
    spans.forEach(span => {
        // Check if span has suggestion data stored in attributes
        const suggestion = span.getAttribute('data-suggestion');
        const selectedText = span.getAttribute('data-selected-text');
        
        if (suggestion) {
            // Data is already in the span - just add click handler
            span.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                showSuggestionTooltip(this, suggestion, selectedText);
            });
            console.log(`🔗 Added click handler to span ${span.id} (self-contained data)`);
        } else {
            // Fallback: try to get data from storage (for older spans)
            console.log(`⚠️ Span ${span.id} missing data attributes, attempting storage lookup...`);
            addClickHandlerFromStorage(span, toolId);
        }
    });
}

// Fallback function to add click handlers using storage data
async function addClickHandlerFromStorage(span, toolId) {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
    const storageKey = `rc_suggestions_${expositionId}_${weaveId}`;
    
    try {
        const result = await browser.storage.local.get(storageKey);
        const suggestions = result[storageKey] || {};
        const toolSuggestions = suggestions[toolId] || [];
        
        const suggestion = toolSuggestions.find(s => s.spanId === span.id);
        if (suggestion) {
            span.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                showSuggestionTooltip(this, suggestion.suggestion, suggestion.selectedText);
            });
            console.log(`🔗 Added click handler to span ${span.id} (from storage)`);
        }
    } catch (error) {
        console.error('❌ Error adding click handler from storage:', error);
    }
}

// Function to show suggestion tooltip
function showSuggestionTooltip(spanElement, suggestionText, selectedText) {
    // Remove any existing tooltips
    const existingTooltips = document.querySelectorAll('.rc-suggestion-tooltip');
    existingTooltips.forEach(tooltip => tooltip.remove());
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'rc-suggestion-tooltip';
    
    tooltip.innerHTML = `
        <div class="rc-suggestion-tooltip-header">Suggestion</div>
        <div class="rc-suggestion-tooltip-text"><strong>Selected:</strong> "${selectedText}"</div>
        <div class="rc-suggestion-tooltip-suggestion">${suggestionText}</div>
    `;
    
    document.body.appendChild(tooltip);
    
    // Position tooltip near the span
    const spanRect = spanElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left = spanRect.left;
    let top = spanRect.bottom + 10;
    
    // Keep tooltip within viewport
    if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    if (left < 10) left = 10;
    
    if (top + tooltipRect.height > window.innerHeight) {
        top = spanRect.top - tooltipRect.height - 10;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    
    // Close tooltip when clicking elsewhere
    const closeTooltip = (e) => {
        if (!tooltip.contains(e.target) && e.target !== spanElement) {
            tooltip.remove();
            document.removeEventListener('click', closeTooltip);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeTooltip);
    }, 100);
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

// Function to set up global suggestion interface for all text tools
function setupGlobalSuggestionInterface() {
    console.log('RC Tool Commenter: Setting up global suggestion interface');
    
    // Create the suggestion editor (hidden initially)
    const suggestionEditor = document.createElement('div');
    suggestionEditor.id = 'rc-global-suggestion-editor';
    suggestionEditor.style.cssText = `
        position: fixed;
        top: 50px;
        right: 20px;
        width: 350px;
        background: white;
        border: 2px solid #007bff;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        padding: 15px;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    `;
    
    suggestionEditor.innerHTML = `
        <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
            <h3 style="margin: 0; font-size: 16px; color: #333; flex: 1;">Suggest Edit</h3>
            <button class="rc-close-suggestion" style="background: none; border: none; font-size: 20px; color: #666; cursor: pointer; padding: 0; margin: 0;">&times;</button>
        </div>
        
        <div class="rc-selected-text-display" style="margin-bottom: 15px;">
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px; color: #555;">Selected text:</div>
            <div class="rc-selected-text" style="background: #fff3cd; padding: 8px; border-radius: 4px; font-size: 13px; line-height: 1.4; max-height: 80px; overflow-y: auto; border: 1px solid #ffeaa7;"></div>
        </div>
        
        <div style="margin-bottom: 15px;">
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px; color: #555;">Your suggestion:</div>
            <textarea class="rc-suggestion-input" placeholder="Enter your suggestion here..." style="width: 100%; height: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; font-size: 13px; font-family: inherit;"></textarea>
        </div>
        
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button class="rc-cancel-suggestion" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">Cancel</button>
            <button class="rc-save-suggestion" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">Save</button>
        </div>
    `;
    
    document.body.appendChild(suggestionEditor);
    
    // Get editor elements
    const selectedTextDisplay = suggestionEditor.querySelector('.rc-selected-text');
    const suggestionInput = suggestionEditor.querySelector('.rc-suggestion-input');
    const closeBtn = suggestionEditor.querySelector('.rc-close-suggestion');
    const saveBtn = suggestionEditor.querySelector('.rc-save-suggestion');
    const cancelBtn = suggestionEditor.querySelector('.rc-cancel-suggestion');
    
    let currentSelection = null;
    let currentTool = null;
    
    // Global mouse up handler for text selection across all tools
    const globalMouseUpHandler = (e) => {
        setTimeout(() => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            
            if (selectedText.length > 0 && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                
                // Find which tool this selection belongs to
                const allTextTools = document.querySelectorAll('.tool-text, .tool-simpletext');
                let targetTool = null;
                
                for (const tool of allTextTools) {
                    const textEditorContent = tool.querySelector('.html-text-editor-content');
                    if (textEditorContent && (
                        textEditorContent.contains(range.commonAncestorContainer) || 
                        textEditorContent.contains(range.startContainer) || 
                        textEditorContent.contains(range.endContainer) ||
                        range.commonAncestorContainer === textEditorContent ||
                        range.startContainer.parentNode === textEditorContent ||
                        range.endContainer.parentNode === textEditorContent
                    )) {
                        targetTool = tool;
                        break;
                    }
                }
                
                if (targetTool) {
                    console.log('RC Tool Commenter: Text selected in tool:', targetTool.dataset.id);
                    
                    currentTool = targetTool;
                    currentSelection = {
                        text: selectedText,
                        range: range.cloneRange(),
                        startOffset: range.startOffset,
                        endOffset: range.endOffset,
                        startContainer: range.startContainer,
                        endContainer: range.endContainer
                    };
                    
                    // Show the suggestion editor
                    selectedTextDisplay.textContent = selectedText;
                    suggestionInput.value = '';
                    suggestionEditor.style.display = 'block';
                    suggestionInput.focus();
                    
                    console.log('RC Tool Commenter: Global suggestion editor shown for tool:', currentTool.dataset.id);
                }
            } else {
                // Only hide editor if we're not clicking on it
                if (!suggestionEditor.contains(e.target)) {
                    suggestionEditor.style.display = 'none';
                    currentSelection = null;
                    currentTool = null;
                }
            }
        }, 50);
    };
    
    // Close button handler
    closeBtn.addEventListener('click', () => {
        suggestionEditor.style.display = 'none';
        currentSelection = null;
        currentTool = null;
    });
    
    // Cancel button handler
    cancelBtn.addEventListener('click', () => {
        suggestionEditor.style.display = 'none';
        currentSelection = null;
        currentTool = null;
    });
    
    // Save button handler
    saveBtn.addEventListener('click', async () => {
        if (!currentSelection || !currentTool) {
            showNotification('Please select text and enter a suggestion');
            return;
        }
        
        const suggestionText = suggestionInput.value.trim();
        if (!suggestionText) {
            showNotification('Please enter a suggestion');
            return;
        }
        
        try {
            console.log('RC Tool Commenter: Saving suggestion for tool:', currentTool.dataset.id);
            await saveSuggestion(currentTool, currentSelection, suggestionText);
            
            showNotification('Suggestion saved successfully');
            
            // Hide the editor
            suggestionEditor.style.display = 'none';
            currentSelection = null;
            currentTool = null;
            
            // Re-store tools with updated suggestion data
            const allTextTools = document.querySelectorAll('.tool-text, .tool-simpletext');
            if (allTextTools.length > 0) {
                console.log('RC Tool Commenter: Re-storing tools with updated suggestion data');
                await storeToolsInMemory(Array.from(allTextTools));
            }
        } catch (error) {
            console.error('RC Tool Commenter: Error saving suggestion:', error);
            showNotification('Error saving suggestion');
        }
    });
    
    // Escape key handler
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            suggestionEditor.style.display = 'none';
            currentSelection = null;
            currentTool = null;
        }
    };
    
    // Add global event listeners
    document.addEventListener('mouseup', globalMouseUpHandler);
    document.addEventListener('keydown', escapeHandler);
    
    console.log('RC Tool Commenter: Global suggestion interface setup complete');
}

// Function to enhance text tools with permanent blue borders and global suggestion capability
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
        toolsStoredForCurrentWeave = true;
    } else if (!toolsStoredForCurrentWeave) {
        // Only collect existing tools once per weave if no tools to enhance
        console.log('RC Tool Commenter: No tools to enhance, but collecting existing tools for suggestion data (one time)');
        const allTextTools = document.querySelectorAll('.tool-text, .tool-simpletext');
        if (allTextTools.length > 0) {
            await storeToolsInMemory(Array.from(allTextTools));
            toolsStoredForCurrentWeave = true;
        }
    }
    
    // Restore suggestion badges for tools that have suggestions
    // Always check all text tools, not just newly enhanced ones
    if (!suggestionBadgesRestored) {
        const allTextTools = document.querySelectorAll('.tool-text, .tool-simpletext');
        await restoreSuggestionBadges(Array.from(allTextTools));
        suggestionBadgesRestored = true; // Prevent repeated calls
    }
    
    // Set up global suggestion interface (only once)
    if (!window.rcGlobalSuggestionSetup) {
        setupGlobalSuggestionInterface();
        window.rcGlobalSuggestionSetup = true;
    }
    
    tools.forEach((tool, index) => {
        // Mark as enhanced to avoid duplicate processing
        tool.setAttribute('data-rc-tool-enhanced', 'true');
        
        const toolType = tool.dataset.tool;
        
        // For text tools, add permanent blue borders and enable text selection
        if (toolType === 'text' || toolType === 'simpletext') {
            const toolContent = tool.querySelector('.tool-content');
            if (toolContent) {
                toolContent.style.border = '2px solid #007bff';
                toolContent.style.borderRadius = '4px';
                toolContent.style.transition = 'border 0.2s ease';
            }
            
            // Enable text selection for text editor content
            const textEditorContent = tool.querySelector('.html-text-editor-content');
            if (textEditorContent) {
                textEditorContent.style.userSelect = 'text';
            }
        } else {
            // For non-text tools, keep the old click behavior for showing tool names
            tool.style.cursor = 'pointer';
            tool.style.outline = '1px dashed rgba(0, 123, 255, 0.4)';
            tool.style.outlineOffset = '1px';
            tool.style.transition = 'outline 0.2s ease-in-out';
            
            // Add click handler for non-text tools
            tool.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                const toolName = getToolName(tool);
                const x = event.clientX;
                const y = event.clientY - 40;
                
                console.log(`RC Tool Commenter: Clicked on tool "${toolName}"`);
                showToolName(toolName, x, y);
            });
            
            // Add hover effect for non-text tools
            tool.addEventListener('mouseenter', () => {
                tool.style.outline = '1px solid rgba(0, 123, 255, 0.8)';
            });
            
            tool.addEventListener('mouseleave', () => {
                tool.style.outline = '1px dashed rgba(0, 123, 255, 0.4)';
            });
        }
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
    
    // Get stored tool data for this exposition to access htmlSpan content
    const expositionStorageKey = `rc_exposition_${expositionId}`;
    const expositionResult = await browser.storage.local.get(expositionStorageKey);
    const expositionData = expositionResult[expositionStorageKey];
    
    console.log('RC Tool Commenter: Restoring badges and highlights for suggestions:', Object.keys(suggestions));
    
    // Add badges to tools that have suggestions and restore visual highlights
    tools.forEach(tool => {
        const toolId = tool.dataset.id;
        
        if (toolId && suggestions[toolId] && suggestions[toolId].length > 0) {
            const suggestionCount = suggestions[toolId].length;
            console.log(`🔍 Tool ${toolId} has ${suggestionCount} suggestions - restoring`);
            
            addSuggestionBadge(tool, suggestionCount);
            
            // Restore htmlSpan content for this tool
            restoreToolHtmlSpan(tool, toolId, expositionData, weaveId);
        }
    });
}

// Function to restore htmlSpan content for a tool
function restoreToolHtmlSpan(tool, toolId, expositionData, weaveId) {
    try {
        console.log(`🔧 Restoring spans for tool ${toolId}`);
        
        // Find the text content area
        const textContent = tool.querySelector('.html-text-editor-content');
        if (!textContent) {
            console.log(`❌ No text content area found for tool ${toolId}`);
            return;
        }
        
        // Check if we have stored tool data with htmlSpan
        if (!expositionData || !expositionData.weaves || !expositionData.weaves[weaveId]) {
            console.log(`❌ No stored data for weave ${weaveId}`);
            return;
        }
        
        const weaveData = expositionData.weaves[weaveId];
        const toolData = weaveData.tools.find(t => t.id === toolId);
        
        if (!toolData || !toolData.content) {
            console.log(`❌ No tool data found for tool ${toolId}`);
            return;
        }
        
        const hasSpans = textContent.innerHTML.includes('rc-suggestion-highlight');
        const htmlSpanDifferent = toolData.content.htmlSpan !== toolData.content.html;
        
        console.log(`🔧 Tool ${toolId}: hasSpans=${hasSpans}, htmlSpanDifferent=${htmlSpanDifferent}`);
        console.log(`📊 Tool ${toolId} data: html=${toolData.content.html?.length}chars, htmlSpan=${toolData.content.htmlSpan?.length}chars`);
        
        // Restore spans if DOM doesn't have them but storage does
        if (!hasSpans && htmlSpanDifferent && toolData.content.htmlSpan) {
            textContent.innerHTML = toolData.content.htmlSpan;
            console.log(`✅ Restored spans for tool ${toolId} from storage`);
            
            // Add click handlers to restored spans
            addClickHandlersToRestoredSpans(textContent, toolId);
        } else {
            console.log(`⚠️ Tool ${toolId}: No restoration needed (hasSpans=${hasSpans}, different=${htmlSpanDifferent})`);
        }
        
    } catch (error) {
        console.error('❌ Error restoring spans:', error);
    }
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
                    <div class="rc-suggestion-item" data-span-id="${suggestion.spanId || ''}">
                        <div class="rc-suggestion-meta">
                            <span class="rc-suggestion-number">#${index + 1}</span>
                            <span class="rc-suggestion-date">${formatDate(suggestion.timestamp)}</span>
                            <span class="rc-suggestion-weave">Weave ${suggestion.weaveId}</span>
                            ${suggestion.spanId ? `<span class="rc-suggestion-span-id">Span: ${suggestion.spanId}</span>` : ''}
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
                            ${suggestion.spanId ? `
                                <button class="rc-highlight-span" data-span-id="${suggestion.spanId}" title="Highlight this suggestion in text">
                                    <svg width="14" height="14" viewBox="0 0 16 16">
                                        <path fill="currentColor" d="M8.5 2.687c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
                                    </svg>
                                    Locate
                                </button>
                            ` : ''}
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
    const highlightButtons = viewer.querySelectorAll('.rc-highlight-span');
    
    // Close button
    closeBtn.addEventListener('click', () => {
        viewer.remove();
    });
    
    // Highlight span buttons
    highlightButtons.forEach(button => {
        button.addEventListener('click', () => {
            const spanId = button.dataset.spanId;
            highlightSuggestionSpan(spanId);
        });
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

// Function to highlight a suggestion span in the text
function highlightSuggestionSpan(spanId) {
    // Find the span element
    const span = document.getElementById(spanId);
    
    if (!span) {
        showNotification('Could not find the suggestion location in the text');
        return;
    }
    
    // Scroll to the span
    span.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Add temporary highlighting
    const originalStyle = span.style.cssText;
    span.style.cssText = originalStyle + '; background-color: rgba(255, 0, 0, 0.5) !important; box-shadow: 0 0 10px rgba(255, 0, 0, 0.8) !important; transition: all 0.3s ease !important;';
    
    // Remove temporary highlighting after 3 seconds
    setTimeout(() => {
        span.style.cssText = originalStyle;
    }, 3000);
    
    console.log('RC Tool Commenter: Highlighted suggestion span:', spanId);
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
    
    // Reset storage flag for new weave
    toolsStoredForCurrentWeave = false;
    suggestionBadgesRestored = false; // Reset badge restoration flag for new weave
    
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