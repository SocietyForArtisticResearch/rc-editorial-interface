// Content script for Research Catalogue Tool Commenter
// This script runs on Research Catalogue exposition pages

console.log('RC Tool Commenter: Content script loaded');

// Detect editor mode vs viewing mode
const isEditorMode = window.location.pathname.includes('/editor') || document.body.classList.contains('editor-block');
console.log('RC Tool Commenter: Mode detected:', isEditorMode ? 'EDITOR' : 'VIEWER');

// Check if user has edit permissions for the current exposition
async function checkEditPermissions(expositionId) {
    // Use cached result if it's recent (within 5 minutes)
    const now = Date.now();
    if (permissionCheckCache !== null && (now - permissionCheckTime) < 300000) {
        console.log('RC Tool Commenter: Using cached permission result:', permissionCheckCache);
        return permissionCheckCache;
    }
    
    const permUrl = `https://www.researchcatalogue.net/editor/permissions?research=${expositionId}`;
    try {
        console.log('RC Tool Commenter: Checking edit permissions for exposition', expositionId);
        console.log('RC Tool Commenter: Permission URL:', permUrl);
        
        const resp = await fetch(permUrl, { method: 'GET', credentials: 'include' });
        
        console.log('RC Tool Commenter: Permission response status:', resp.status);
        console.log('RC Tool Commenter: Permission response headers:', Object.fromEntries(resp.headers.entries()));
        
        // Try to read the response body for more info
        const responseText = await resp.text();
        console.log('RC Tool Commenter: Permission response body:', responseText.substring(0, 200), responseText.length > 200 ? '...' : '');
        
        let hasPermissions = false;
        
        if (resp && resp.status === 200) {
            // Status 200 is not enough - we need an empty response body
            // If we get HTML content, it means we're being redirected to a login page or error page
            if (responseText.trim() === '') {
                console.log('RC Tool Commenter: Edit permissions granted (200 + empty body)');
                hasPermissions = true;
            } else {
                console.log('RC Tool Commenter: Edit permissions denied (200 but HTML content - likely login page)');
                hasPermissions = false;
            }
        } else {
            console.log('RC Tool Commenter: Edit permissions denied (status:', resp.status, ')');
            hasPermissions = false;
        }
        
        // Cache the result
        permissionCheckCache = hasPermissions;
        permissionCheckTime = now;
        
        return hasPermissions;
    } catch (err) {
        console.error('RC Tool Commenter: Permission check failed:', err);
        console.error('RC Tool Commenter: Error details:', {
            message: err.message,
            stack: err.stack,
            name: err.name
        });
        
        // Cache negative result
        permissionCheckCache = false;
        permissionCheckTime = now;
        
        return false;
    }
}

// Show permission denied message
function showPermissionDeniedMessage() {
    const message = document.createElement('div');
    message.className = 'rc-permission-denied';
    message.innerHTML = `
        <div class="rc-permission-denied-content">
            <h3>🔒 Access Denied</h3>
            <p>You do not have permissions to edit this exposition.</p>
            <p>The RC Tool Commenter extension requires edit access to function.</p>
        </div>
    `;
    document.body.appendChild(message);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (message.parentNode) {
            message.remove();
        }
    }, 5000);
}

// Function to detect if we're on a Research Catalogue exposition page
function isExpositionPage() {
    return window.location.hostname.includes('researchcatalogue.net') && 
           (window.location.pathname.includes('/exposition/') || 
            window.location.pathname.includes('/view/') ||
            window.location.pathname.includes('/editor'));
}

// Function to identify tool elements in the exposition
async function identifyTools() {
    // Block if extension is disabled due to permissions
    if (window.rcExtensionBlocked) {
        console.log('RC Tool Commenter: identifyTools blocked - no edit permissions');
        return [];
    }
    
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
    
    let totalFound = 0;
    let totalSkipped = 0;
    
    toolSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        totalFound += elements.length;
        
        elements.forEach(element => {
            // Exclude tool-content divs - only target actual tool containers
            if (!element.hasAttribute('data-rc-tool-enhanced') && 
                !element.classList.contains('tool-content')) {
                tools.push(element);
            } else {
                totalSkipped++;
            }
        });
    });
    
    console.log(`Found ${totalFound} total elements, added ${tools.length} new tools, skipped ${totalSkipped} already processed`);
    
    // Also look for any div with class starting with 'tool-' that has data-tool attribute
    // But only if we're looking for text tools specifically
    const genericTools = document.querySelectorAll('div.tool-text[data-tool], div.tool-simpletext[data-tool]');
    
    if (genericTools.length > 0) {
        console.log(`Found ${genericTools.length} generic text tool elements`);
        genericTools.forEach(element => {
            if (!element.hasAttribute('data-rc-tool-enhanced') && 
                !element.classList.contains('tool-content') &&
                !tools.includes(element)) {
                tools.push(element);
            }
        });
    }
    
    if (tools.length > 0) {
        console.log(`RC Tool Commenter: Total tools to enhance: ${tools.length}`);
        createSaveButton();
    } else {
        console.log('RC Tool Commenter: No new tools to enhance');
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
    
    // Handle editor URLs with query parameters: /editor?research=123&weave=456
    if (window.location.pathname.includes('/editor')) {
        const urlParams = new URLSearchParams(window.location.search);
        if (type === 'exposition') {
            return urlParams.get('research');
        } else if (type === 'weave') {
            return urlParams.get('weave');
        }
    }
    
    // Handle view URLs with path parameters: /view/123/456
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
    
    // Find all suggestion and comment spans and replace them with their text content
    const suggestionSpans = tempDiv.querySelectorAll('.rc-suggestion-highlight, .rc-comment-highlight');
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
            const hasSpansNow = currentHtml.includes('rc-suggestion-highlight') || currentHtml.includes('rc-comment-highlight');
            
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
    // Throttle storage calls to prevent rapid-fire operations
    const now = Date.now();
    if (now - lastStorageCall < 1000) {
        console.log('RC Tool Commenter: Throttling storage call');
        return;
    }
    lastStorageCall = now;
    
    // For page refreshes, always fetch fresh data from DOM to capture collaborative changes
    if (isPageRefresh) {
        console.log('🔄 Page refresh detected - forcing fresh tool content extraction from DOM');
    }
    
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
    
    console.log(`Storing ${tools.length} tools for exposition ${expositionId}, weave ${weaveId}`);
    
    // Check permissions before storing anything
    if (expositionId !== 'unknown') {
        const hasPermissions = await checkEditPermissions(expositionId);
        if (!hasPermissions) {
            console.log('RC Tool Commenter: Storage blocked - user lacks edit permissions');
            showPermissionDeniedMessage();
            return;
        }
    }
    
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
        // BUT: Skip preservation on page refresh to ensure fresh collaborative content is captured
        const toolId = toolData.id;
        const existingToolData = expositionData.weaves[weaveId]?.tools?.find(t => t.id === toolId);
        
        if (!isPageRefresh && existingToolData?.content?.htmlSpan && 
            existingToolData.content.htmlSpan !== existingToolData.content.html &&
            toolData.content.htmlSpan === toolData.content.html) {
            
            console.log(`🔒 Preserving existing span data for tool ${toolId} (${existingToolData.content.htmlSpan.length} chars)`);
            toolData.content.htmlSpan = existingToolData.content.htmlSpan;
        } else if (isPageRefresh && existingToolData?.content?.htmlSpan) {
            console.log(`🔄 Page refresh: Skipping span preservation for tool ${toolId} to capture fresh collaborative changes`);
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
    console.log(`🔄 updateSaveButtonCount called`);
    
    const saveButton = document.getElementById('rc-save-tools-btn');
    console.log(`🔍 Save button found:`, saveButton ? 'YES' : 'NO');
    
    if (!saveButton) return;
    
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    
    // Count resolved comments and accepted suggestions across all weaves
    let totalResolvedComments = 0;
    let totalAcceptedSuggestions = 0;
    
    // Get resolved comments and accepted suggestions for each weave
    for (const weaveId of Object.keys(expositionData.weaves)) {
        console.log(`🔍 Checking weave ${weaveId} for resolved/accepted data...`);
        
        // Count resolved comments
        const resolvedCommentsKey = `rc_resolved_comments_${expositionId}_${weaveId}`;
        console.log(`🔍 Looking for resolved comments with key: ${resolvedCommentsKey}`);
        const resolvedResult = await browser.storage.local.get(resolvedCommentsKey);
        const resolvedComments = resolvedResult[resolvedCommentsKey] || {};
        
        console.log(`📊 Resolved comments data:`, resolvedComments);
        
        // Count resolved comments for each tool in this weave
        Object.values(resolvedComments).forEach(toolComments => {
            if (Array.isArray(toolComments)) {
                console.log(`📊 Found ${toolComments.length} resolved comments for a tool`);
                totalResolvedComments += toolComments.length;
            }
        });
        
        // Count accepted suggestions
        const acceptedSuggestionsKey = `rc_accepted_suggestions_${expositionId}_${weaveId}`;
        console.log(`🔍 Looking for accepted suggestions with key: ${acceptedSuggestionsKey}`);
        const acceptedResult = await browser.storage.local.get(acceptedSuggestionsKey);
        const acceptedSuggestions = acceptedResult[acceptedSuggestionsKey] || {};
        
        console.log(`📊 Accepted suggestions data:`, acceptedSuggestions);
        
        // Count accepted suggestions for each tool in this weave
        Object.values(acceptedSuggestions).forEach(toolSuggestions => {
            if (Array.isArray(toolSuggestions)) {
                console.log(`📊 Found ${toolSuggestions.length} accepted suggestions for a tool`);
                totalAcceptedSuggestions += toolSuggestions.length;
            }
        });
    }
    
    console.log(`📊 Final counts: ${totalResolvedComments} resolved, ${totalAcceptedSuggestions} accepted`);
    
    let weaveCount = Object.keys(expositionData.weaves).length;
    
    const buttonText = saveButton.querySelector('span') || saveButton;
    buttonText.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 6px;">
            <path fill="currentColor" d="M13 0H3a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V3a3 3 0 0 0-3-3zM8 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM11 14.5H5a.5.5 0 0 1 0-1h6a.5.5 0 0 1 0 1z"/>
        </svg>
        Save ${totalResolvedComments} Resolved Comments, ${totalAcceptedSuggestions} Accepted Suggestions (${weaveCount} weaves)
    `;
}

// Function to update save button count after resolving/accepting actions
async function updateSaveButtonCountAfterAction(expositionId) {
    try {
        console.log(`🔄 updateSaveButtonCountAfterAction called for exposition ${expositionId}`);
        
        // Get stored tools for this exposition  
        const storageKey = `rc_exposition_${expositionId}`;
        const result = await browser.storage.local.get(storageKey);
        const expositionData = result[storageKey];
        
        console.log(`📊 Found exposition data:`, expositionData ? 'YES' : 'NO');
        
        if (expositionData) {
            console.log(`🔄 Calling updateSaveButtonCount...`);
            await updateSaveButtonCount(expositionData);
            console.log(`✅ Save button count updated`);
        } else {
            console.warn(`⚠️ No exposition data found for ${expositionId}`);
        }
    } catch (error) {
        console.error('❌ Error updating save button count:', error);
    }
}

// Function to create save button
function createSaveButton() {
    // Skip creating save button in editor mode
    if (isEditorMode) {
        console.log('🚫 Skipping save button in editor mode');
        return;
    }
    
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

    // document.body.appendChild(saveButton);
    // document.body.appendChild(importButton);
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
    
    // Get all resolved comments and accepted suggestions for all weaves in this exposition
    const allStorageKeys = await browser.storage.local.get();
    const resolvedComments = {};
    const acceptedSuggestions = {};
    let totalResolvedComments = 0;
    let totalAcceptedSuggestions = 0;
    
    console.log('🔍 Searching for resolved comments and accepted suggestions...');
    console.log('All storage keys:', Object.keys(allStorageKeys).filter(k => k.startsWith('rc_')));
    
    // Find all resolved comments and accepted suggestions storage keys for this exposition
    Object.keys(allStorageKeys).forEach(key => {
        if (key.startsWith(`rc_resolved_comments_${expositionId}_`)) {
            const weaveId = key.replace(`rc_resolved_comments_${expositionId}_`, '');
            const resolvedData = allStorageKeys[key];
            console.log(`📦 Found resolved comments for weave ${weaveId}:`, resolvedData);
            console.log(`📦 Resolved data type:`, typeof resolvedData, 'keys:', Object.keys(resolvedData || {}));
            if (resolvedData && typeof resolvedData === 'object' && Object.keys(resolvedData).length > 0) {
                resolvedComments[weaveId] = resolvedData;
                // Count total resolved comments
                Object.values(resolvedData).forEach(toolComments => {
                    if (Array.isArray(toolComments)) {
                        totalResolvedComments += toolComments.length;
                    }
                });
            }
        } else if (key.startsWith(`rc_accepted_suggestions_${expositionId}_`)) {
            const weaveId = key.replace(`rc_accepted_suggestions_${expositionId}_`, '');
            const acceptedData = allStorageKeys[key];
            console.log(`📦 Found accepted suggestions for weave ${weaveId}:`, acceptedData);
            console.log(`📦 Accepted data type:`, typeof acceptedData, 'keys:', Object.keys(acceptedData || {}));
            if (acceptedData && typeof acceptedData === 'object' && Object.keys(acceptedData).length > 0) {
                acceptedSuggestions[weaveId] = acceptedData;
                // Count total accepted suggestions
                Object.values(acceptedData).forEach(toolSuggestions => {
                    if (Array.isArray(toolSuggestions)) {
                        totalAcceptedSuggestions += toolSuggestions.length;
                    }
                });
            }
        }
    });
    
    console.log('📊 Export totals:', {
        totalResolvedComments,
        totalAcceptedSuggestions,
        resolvedComments,
        acceptedSuggestions
    });
    
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
            totalSuggestions: totalSuggestions,
            totalResolvedComments: totalResolvedComments,
            totalAcceptedSuggestions: totalAcceptedSuggestions
        },
        weaves: expositionData.weaves, // Use the weaves data as-is since it already contains suggestions
        resolvedComments: resolvedComments, // Add resolved comments data
        acceptedSuggestions: acceptedSuggestions // Add accepted suggestions data
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
    
    // Show confirmation message with resolved comments and accepted suggestions info
    const weaveCount = Object.keys(expositionData.weaves).length;
    const toolCount = Object.values(expositionData.weaves).reduce((sum, weave) => sum + weave.tools.length, 0);
    let statusMessage = `Saved ${toolCount} tools, ${totalSuggestions} active suggestions`;
    
    if (totalResolvedComments > 0 || totalAcceptedSuggestions > 0) {
        const resolvedText = totalResolvedComments > 0 ? `${totalResolvedComments} resolved comments` : '';
        const acceptedText = totalAcceptedSuggestions > 0 ? `${totalAcceptedSuggestions} accepted suggestions` : '';
        const combinedText = [resolvedText, acceptedText].filter(Boolean).join(', ');
        statusMessage += `, ${combinedText}`;
    }
    
    statusMessage += ` from ${weaveCount} weaves`;
    showNotification(statusMessage);
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
let lastToolIdentification = 0;
let isInitialized = false; // Prevent duplicate initialization
let toolsStoredForCurrentWeave = false; // Flag to prevent repeated storage calls
let suggestionBadgesRestored = false; // Flag to prevent repeated badge restoration
let lastStorageCall = 0; // Throttle storage operations
let permissionCheckCache = null; // Cache permission check results
let permissionCheckTime = 0; // Track when permissions were last checked
let isPageRefresh = false; // Flag to track page refreshes for collaborative editing
let pageLoadTime = Date.now(); // Track when page was loaded

// Function to toggle between normal and text-only view
function toggleTextOnlyView() {
    const toggleButton = document.getElementById('rc-view-toggle-btn');
    
    console.log('RC Tool Commenter: Toggle clicked, current isTextOnlyView:', isTextOnlyView);
    
    if (!isTextOnlyView) {
        // Switch TO text-only view
        showTextOnlyView();
        isTextOnlyView = true;
        console.log('RC Tool Commenter: Switched TO text-only view');
        
        // Update button
        toggleButton.innerHTML = `
            <span>
                <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 6px;">
                    <path fill="currentColor" d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
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

// Constants for frequently-used selectors
const TEXT_TOOLS_SELECTOR = '.tool-text, .tool-simpletext';

// Constants for text-only view styling
const TEXT_ONLY_TOOL_STYLES = `
    display: block !important;
    position: relative !important;
    float: none !important;
    width: 800px !important;
    max-width: 800px !important;
    min-width: 800px !important;
    margin: 20px auto !important;
    padding: 20px !important;
    background: white !important;
    border: 1px solid #ddd !important;
    border-radius: 8px !important;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
    z-index: 1 !important;
    box-sizing: border-box !important;
    left: auto !important;
    right: auto !important;
    top: auto !important;
    transform: none !important;
`;

const TEXT_ONLY_CONTENT_STYLES = `
    width: 100% !important;
    max-width: none !important;
    min-width: none !important;
    margin: 0 !important;
    padding: 15px !important;
    border: none !important;
    box-sizing: border-box !important;
    position: relative !important;
    float: none !important;
    left: auto !important;
    right: auto !important;
    top: auto !important;
    transform: none !important;
`;

const TEXT_ONLY_CONTAINER_STYLES = `
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
`;

const TEXT_ONLY_BODY_STYLES = `
    background: #f5f5f5 !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow-y: auto !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: flex-start !important;
    min-height: 100vh !important;
`;

// Helper function to hide container with appropriate method for weave type
function hideContainer(containerId, isAggressive = false) {
    const container = document.getElementById(containerId);
    if (container && !container.hasAttribute('data-rc-original-display')) {
        container.setAttribute('data-rc-original-display', 
            window.getComputedStyle(container).display);
        
        if (isAggressive) {
            container.style.setProperty('display', 'none', 'important');
            container.style.setProperty('visibility', 'hidden', 'important');
            container.style.setProperty('position', 'absolute', 'important');
            container.style.setProperty('left', '-9999px', 'important');
            container.style.setProperty('top', '-9999px', 'important');
        } else {
            container.style.display = 'none';
        }
        container.setAttribute('data-rc-hidden', 'true');
    }
}

// Helper function to restore container with appropriate method for weave type
function restoreContainer(containerId, isAggressive = false) {
    const container = document.getElementById(containerId);
    if (container && container.hasAttribute('data-rc-hidden')) {
        const originalDisplay = container.getAttribute('data-rc-original-display');
        
        if (isAggressive) {
            container.style.removeProperty('display');
            if (originalDisplay && originalDisplay !== 'none') {
                container.style.display = originalDisplay;
            }
            container.style.removeProperty('visibility');
            container.style.removeProperty('position');
            container.style.removeProperty('left');
            container.style.removeProperty('top');
        } else {
            if (originalDisplay) {
                container.style.display = originalDisplay === 'none' ? '' : originalDisplay;
            } else {
                container.style.display = '';
            }
        }
        
        container.removeAttribute('data-rc-hidden');
        container.removeAttribute('data-rc-original-display');
    }
}

// Function to show text-only view using CSS
function showTextOnlyView() {
    console.log('RC Tool Commenter: Switching to text-only view with CSS');
    
    // Detect weave type from HTML class
    const htmlElement = document.documentElement;
    const isWeaveGraphical = htmlElement.classList.contains('weave-graphical');
    const isWeaveBlock = htmlElement.classList.contains('weave-block');
    
    console.log('RC Tool Commenter: Detected weave type:', {
        isWeaveGraphical,
        isWeaveBlock,
        htmlClasses: htmlElement.className
    });
    
    // Add text-only class to body to trigger CSS styling
    document.body.classList.add('rc-text-only-mode');
    
    // Store original styles before making changes
    const textTools = document.querySelectorAll(TEXT_TOOLS_SELECTOR);
    console.log('RC Tool Commenter: Found', textTools.length, 'text tools to style');
    
    // Store the original container information for each tool
    textTools.forEach((tool, index) => {
        // Store original styles for restoration
        if (!tool.hasAttribute('data-rc-original-style')) {
            tool.setAttribute('data-rc-original-style', tool.getAttribute('style') || '');
        }
        
        // Store original parent container for restoration
        if (!tool.hasAttribute('data-rc-original-parent')) {
            const parent = tool.parentElement;
            if (parent) {
                tool.setAttribute('data-rc-original-parent', parent.id || parent.className || 'unknown');
                // Store a reference to the actual parent element
                tool._rcOriginalParent = parent;
            }
        }
        
        // Store original tool content styles
        const toolContent = tool.querySelector('.tool-content, .html-text-editor-content');
        if (toolContent && !toolContent.hasAttribute('data-rc-original-style')) {
            toolContent.setAttribute('data-rc-original-style', toolContent.getAttribute('style') || '');
        }
        
        // Apply text-only styling to text tools
        tool.style.cssText = TEXT_ONLY_TOOL_STYLES;
        tool.setAttribute('data-rc-text-styled', 'true'); // Mark for restoration
        
        // Also apply consistent styling to the tool content area
        if (toolContent) {
            toolContent.style.cssText = TEXT_ONLY_CONTENT_STYLES;
        }
        
    });
    
    // Instead of hiding everything, only hide specific non-essential elements
    const elementsToHide = [
        'header', 'nav', '.navigation', '.sidebar', '.footer', 
        '.tool-picture', '.tool-video', '.tool-audio', '.tool-pdf', 
        '.tool-slideshow', '.toolbar', '.menu', '.breadcrumb',
        '.weave-navigation', '.exposition-navigation'
    ];
    
    elementsToHide.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            // Make sure we're not hiding text tools or our extension elements
            if (!element.closest('.tool-text, .tool-simpletext') && 
                !element.id?.startsWith('rc-')) {
                // Store original display style
                if (!element.hasAttribute('data-rc-original-display')) {
                    element.setAttribute('data-rc-original-display', 
                        window.getComputedStyle(element).display);
                }
                element.style.display = 'none';
                element.setAttribute('data-rc-hidden', 'true'); // Mark for restoration
            }
        });
    });
    
    // Store original body styles and apply text-only mode styling
    if (!document.body.hasAttribute('data-rc-original-body-style')) {
        document.body.setAttribute('data-rc-original-body-style', 
            document.body.getAttribute('style') || '');
    }
    
    // Handle weave type-specific container logic
    if (isWeaveGraphical) {
        console.log('RC Tool Commenter: Using weave-graphical logic');
        
        // Hide the main weave container to prevent layout interference
        hideContainer('container-weave');
        
        // Create a new container for text-only view
        let textOnlyContainer = document.getElementById('rc-text-only-container');
        if (!textOnlyContainer) {
            textOnlyContainer = document.createElement('div');
            textOnlyContainer.id = 'rc-text-only-container';
            textOnlyContainer.style.cssText = TEXT_ONLY_CONTAINER_STYLES;
            document.body.appendChild(textOnlyContainer);
        }
        
        // Move text tools to the new container
        textTools.forEach((tool, index) => {
            textOnlyContainer.appendChild(tool);
        });
        
    } else if (isWeaveBlock) {
        console.log('RC Tool Commenter: Using weave-block logic - moving tools to centered container');
        
        // For weave-block, also create a new container and move tools there
        // This gets rid of the grid structure complexity
        let textOnlyContainer = document.getElementById('rc-text-only-container');
        if (!textOnlyContainer) {
            textOnlyContainer = document.createElement('div');
            textOnlyContainer.id = 'rc-text-only-container';
            textOnlyContainer.style.cssText = TEXT_ONLY_CONTAINER_STYLES;
            document.body.appendChild(textOnlyContainer);
        }
        
        // Hide the main content container to get rid of grid structure
        hideContainer('content');
        
        // Also hide the container-weave if it exists (some weave-block pages have both)
        hideContainer('container-weave', true); // Use aggressive hiding for weave-block
        
        // Move text tools to the new container
        textTools.forEach((tool, index) => {
            textOnlyContainer.appendChild(tool);
        });
        
    } else {
        console.log('RC Tool Commenter: Unknown weave type, using fallback logic');
        // Fallback to keeping tools in place like weave-block
    }
    
    // Style the body for text-only mode with proper centering
    document.body.style.cssText = TEXT_ONLY_BODY_STYLES;
    document.body.setAttribute('data-rc-body-styled', 'true'); // Mark for restoration
}

// Function to restore normal view using CSS
function showNormalView() {
    console.log('RC Tool Commenter: Switching back to normal view with CSS');
    
    // Detect weave type from HTML class
    const htmlElement = document.documentElement;
    const isWeaveGraphical = htmlElement.classList.contains('weave-graphical');
    const isWeaveBlock = htmlElement.classList.contains('weave-block');
    
    console.log('RC Tool Commenter: Restoring from text view, weave type:', {
        isWeaveGraphical,
        isWeaveBlock
    });
    
    // Remove text-only class from body
    document.body.classList.remove('rc-text-only-mode');
    
    // Handle weave type-specific restoration
    if (isWeaveGraphical) {
        console.log('RC Tool Commenter: Using weave-graphical restoration logic');
        
        // First, restore the weave container before moving tools back
        restoreContainer('container-weave');
        
        // Then, move text tools back to their original containers
        const textOnlyContainer = document.getElementById('rc-text-only-container');
        if (textOnlyContainer) {
            const textTools = textOnlyContainer.querySelectorAll(TEXT_TOOLS_SELECTOR);
            
            // Find the original weave container
            const weave = document.getElementById('weave');
            if (weave) {
                textTools.forEach(tool => {
                    weave.appendChild(tool);
                });
            }
            
            // Remove the text-only container
            textOnlyContainer.remove();
        }
        
    } else if (isWeaveBlock) {
        console.log('RC Tool Commenter: Using weave-block restoration logic');
        
        // For weave-block, move tools back to their original containers before restoring styles
        const textOnlyContainer = document.getElementById('rc-text-only-container');
        if (textOnlyContainer) {
            const textTools = textOnlyContainer.querySelectorAll(TEXT_TOOLS_SELECTOR);
            
            // Move tools back to their original parents
            textTools.forEach(tool => {
                if (tool._rcOriginalParent) {
                    tool._rcOriginalParent.appendChild(tool);
                }
            });
            
            // Remove the text-only container
            textOnlyContainer.remove();
        }
        
        // Restore the content container
        restoreContainer('content');
        
        // Also restore the weave container if it was hidden
        restoreContainer('container-weave', true); // Use aggressive restoration for weave-block
        
    } else {
        console.log('RC Tool Commenter: Using fallback restoration logic');
        // Fallback logic similar to weave-block
    }
    
    // Common restoration logic for all weave types
    
    // Restore hidden elements using stored original display values
    const hiddenElements = document.querySelectorAll('[data-rc-hidden="true"]');
    const handledContainerIds = new Set(['container-weave', 'content']); // Track containers we already handled
    
    hiddenElements.forEach(element => {
        // Skip containers that were already handled in weave-specific sections
        if (!element.id || !handledContainerIds.has(element.id)) {
            const originalDisplay = element.getAttribute('data-rc-original-display');
            if (originalDisplay) {
                element.style.display = originalDisplay === 'none' ? '' : originalDisplay;
            } else {
                element.style.display = '';
            }
        }
        element.removeAttribute('data-rc-hidden');
        element.removeAttribute('data-rc-original-display');
    });
    
    // Reset text tools styling using stored original styles
    const styledTextTools = document.querySelectorAll('[data-rc-text-styled="true"]');
    styledTextTools.forEach(tool => {
        // Restore original tool styles
        const originalStyle = tool.getAttribute('data-rc-original-style');
        if (originalStyle) {
            tool.setAttribute('style', originalStyle);
        } else {
            tool.removeAttribute('style');
        }
        tool.removeAttribute('data-rc-text-styled');
        tool.removeAttribute('data-rc-original-style');
        
        // Also restore tool content styling
        const toolContent = tool.querySelector('.tool-content, .html-text-editor-content');
        if (toolContent) {
            const originalContentStyle = toolContent.getAttribute('data-rc-original-style');
            if (originalContentStyle) {
                toolContent.setAttribute('style', originalContentStyle);
            } else {
                toolContent.removeAttribute('style');
            }
            toolContent.removeAttribute('data-rc-original-style');
        }
        
        // Clean up stored parent references and data attributes
        tool.removeAttribute('data-rc-original-parent');
        if (tool._rcOriginalParent) {
            delete tool._rcOriginalParent;
        }
    });
    
    // Reset body styling using stored original style
    const originalBodyStyle = document.body.getAttribute('data-rc-original-body-style');
    if (document.body.hasAttribute('data-rc-body-styled')) {
        if (originalBodyStyle) {
            document.body.setAttribute('style', originalBodyStyle);
        } else {
            document.body.removeAttribute('style');
        }
        document.body.removeAttribute('data-rc-body-styled');
        document.body.removeAttribute('data-rc-original-body-style');
    }
    
    console.log('RC Tool Commenter: Normal view restoration complete');
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
function createTextSuggestionInterface(tool, clickX, clickY) {
    // Remove any existing suggestion interface
    const existingSuggestion = document.getElementById('rc-text-suggestion');
    if (existingSuggestion) {
        existingSuggestion.remove();
    }
    
    if (!tool || !tool.dataset) {
        showNotification('Error: Invalid tool element');
        return;
    }
    
    // Find text content within the tool
    const textContent = tool.querySelector('.html-text-editor-content');
    if (!textContent) {
        showNotification('No editable text found in this tool');
        return;
    }
    
    // Get the HTML content to display
    const htmlContent = textContent.innerHTML;
    
    // Create suggestion interface HTML
    const suggestionOverlay = document.createElement('div');
    suggestionOverlay.id = 'rc-text-suggestion';
    suggestionOverlay.className = 'rc-text-suggestion-overlay';
    
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
                    <label for="rc-suggestion-text">Your comment or suggestion:</label>
                    <textarea id="rc-suggestion-text" placeholder="Add a comment or suggest changes for the selected text..." rows="3"></textarea>
                </div>
                <div class="rc-suggestion-actions">
                    <button class="rc-save-comment" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; margin-right: 8px;">Comment</button>
                    <button class="rc-save-suggestion" style="background: #FFC107; color: #333; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; margin-right: 8px;">Suggest</button>
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
    setupSuggestionEventHandlers(suggestionOverlay, tool);
    
    return suggestionOverlay;
}

// Function to set up suggestion interface event handlers
function setupSuggestionEventHandlers(overlay, tool) {
    const closeBtn = overlay.querySelector('.rc-close-suggestion');
    const selectableText = overlay.querySelector('.rc-selectable-text');
    const suggestionForm = overlay.querySelector('.rc-suggestion-form');
    const selectedTextDisplay = overlay.querySelector('.rc-selected-text');
    const suggestionTextarea = overlay.querySelector('#rc-suggestion-text');
    const saveCommentBtn = overlay.querySelector('.rc-save-comment');
    const saveSuggestionBtn = overlay.querySelector('.rc-save-suggestion');
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
    saveSuggestionBtn.addEventListener('click', async () => {
        await handleSaveAction(currentSelection, suggestionTextarea, tool, overlay, 'suggestion');
    });
    
    // Save comment
    saveCommentBtn.addEventListener('click', async () => {
        await handleSaveAction(currentSelection, suggestionTextarea, tool, overlay, 'comment');
    });
    
    // Helper function to handle save action
    async function handleSaveAction(selection, textarea, toolElement, overlayElement, type) {
        console.log(`RC Tool Commenter: Save ${type} button clicked`);
        console.log('Current selection:', selection);
        console.log(`${type} text:`, textarea.value.trim());
        console.log('Tool:', toolElement);
        
        if (!selection || !textarea.value.trim()) {
            showNotification(`Please select text and enter a ${type}`);
            return;
        }
        
        if (!toolElement) {
            showNotification('Error: No tool element found');
            return;
        }
        
        try {
            await saveSuggestion(toolElement, selection, textarea.value.trim(), type);
            console.log(`RC Tool Commenter: ${type} saved successfully`);
            overlayElement.remove();
            showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} saved successfully`);
            
            // Debug: Check if suggestion was actually stored
            const bodyElement = document.body;
            const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
            const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
            const storageKey = `rc_suggestions_${expositionId}_${weaveId}`;
            const result = await browser.storage.local.get(storageKey);
            console.log(`RC Tool Commenter: ${type}s in storage after save:`, result[storageKey]);
            
        } catch (error) {
            console.error(`RC Tool Commenter: Error saving ${type}:`, error);
            showNotification(`Error saving ${type}`);
        }
    }
    
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

// Function to save suggestion or comment
async function saveSuggestion(tool, selection, suggestionText, type = 'suggestion') {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
    
    // Extract tool information from DOM element
    const toolId = tool.dataset.id || 'unknown';
    const toolType = tool.dataset.tool || 'unknown';
    
    // Generate unique span ID for this suggestion/comment
    const spanId = `rc-${type}-${toolId}-${Date.now()}`;
    
    // Find the text content area within the tool
    const textContent = tool.querySelector('.html-text-editor-content');
    if (!textContent) {
        throw new Error('No text content area found in tool');
    }
    
    // Determine CSS class based on type
    const cssClass = type === 'comment' ? 'rc-comment-highlight' : 'rc-suggestion-highlight';
    
    // Wrap the selected text in a span with the unique ID
    try {
        const span = document.createElement('span');
        span.id = spanId;
        span.className = cssClass;
        
        // Store suggestion/comment data directly in the span
        span.setAttribute('data-suggestion', suggestionText);
        span.setAttribute('data-selected-text', selection.text);
        span.setAttribute('data-type', type);
        
        // Add click handler to show suggestion/comment
        span.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const suggestion = this.getAttribute('data-suggestion');
            const selectedText = this.getAttribute('data-selected-text');
            const spanType = this.getAttribute('data-type') || 'suggestion';
            showSuggestionTooltip(this, suggestion, selectedText, spanType);
        });
        
        // Wrap the selected content using the range from the selection
        if (selection.range) {
            selection.range.surroundContents(span);
        } else {
            // Fallback: simple text replacement if no range available
            const toolText = textContent.innerHTML;
            const selectedText = selection.text;
            if (toolText.includes(selectedText)) {
                const spanHtml = `<span id="${spanId}" class="${cssClass}" data-suggestion="${suggestionText.replace(/"/g, '&quot;')}" data-selected-text="${selectedText.replace(/"/g, '&quot;')}" data-type="${type}">${selectedText}</span>`;
                textContent.innerHTML = toolText.replace(selectedText, spanHtml);
                // Re-add click handler to the newly created span
                const newSpan = textContent.querySelector(`#${spanId}`);
                if (newSpan) {
                    newSpan.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const suggestion = this.getAttribute('data-suggestion');
                        const selectedText = this.getAttribute('data-selected-text');
                        const spanType = this.getAttribute('data-type') || 'suggestion';
                        showSuggestionTooltip(this, suggestion, selectedText, spanType);
                    });
                }
            }
        }
        
        console.log('RC Tool Commenter: Wrapped selection in span with ID:', spanId);
    } catch (error) {
        console.warn('RC Tool Commenter: Could not wrap selection in span:', error);
        throw new Error('Failed to create suggestion highlight');
    }
    
    const suggestion = {
        id: `${type}_${Date.now()}`,
        toolId: toolId,
        expositionId: expositionId,
        weaveId: weaveId,
        spanId: spanId, // New field: unique identifier for the span
        selectedText: selection.text, // Keep for backward compatibility and debugging
        suggestion: suggestionText,
        type: type, // New field: 'suggestion' or 'comment'
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
    
    // **NEW: Apply suggestion to the actual tool via RC API**
    console.log('🚀 Applying suggestion to RC tool...');
    
    try {
        // Get current tool data to access htmlSpan content
        const bodyElement = document.body;
        const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
        const storageKey = `rc_exposition_${expositionId}`;
        const result = await browser.storage.local.get(storageKey);
        const expositionData = result[storageKey];
        
        if (expositionData && expositionData.weaves && expositionData.weaves[weaveId]) {
            const weaveData = expositionData.weaves[weaveId];
            const toolData = weaveData.tools.find(t => t.id === toolId);
            
            if (toolData && toolData.content && toolData.content.htmlSpan) {
                // Get the current DOM content which includes the newly added span
                const toolElement = document.querySelector(`[data-id="${toolId}"]`);
                if (toolElement) {
                    const textContentElement = toolElement.querySelector('.html-text-editor-content');
                    if (textContentElement) {
                        // Use current DOM content which includes all spans (existing + new)
                        const enhancedContent = textContentElement.innerHTML;
                        
                        console.log('📤 Updating RC tool with enhanced content...');
                        console.log('📝 Enhanced content preview:', enhancedContent.substring(0, 200));
                        console.log(`📊 Content length: ${enhancedContent.length} chars`);
                        
                        // Apply the enhanced content to the actual tool via RC's API
                        // Use script injection to execute the function in page scope
                const executeScript = document.createElement('script');
                // Properly escape the content to prevent syntax errors
                const escapedContent = JSON.stringify(enhancedContent);
                executeScript.textContent = `
                    (async function() {
                        try {
                            if (typeof window.applyRCToolUpdate === 'function') {
                                console.log('📞 Calling applyRCToolUpdate from page scope...');
                                const result = await window.applyRCToolUpdate('${toolId}', ${escapedContent}, '${expositionId}');
                                
                                if (result.success) {
                                    console.log('✅ Successfully applied suggestion to RC tool!');
                                    // Trigger a custom event to notify the content script
                                    window.dispatchEvent(new CustomEvent('rcToolUpdateSuccess', { 
                                        detail: { toolId: '${toolId}', success: true } 
                                    }));
                                } else {
                                    console.error('❌ Failed to apply suggestion to RC tool:', result.error);
                                    window.dispatchEvent(new CustomEvent('rcToolUpdateError', { 
                                        detail: { toolId: '${toolId}', error: result.error } 
                                    }));
                                }
                            } else {
                                console.warn('⚠ applyRCToolUpdate function not available in page scope');
                                window.dispatchEvent(new CustomEvent('rcToolUpdateError', { 
                                    detail: { toolId: '${toolId}', error: 'Function not available' } 
                                }));
                            }
                        } catch (error) {
                            console.error('❌ Error in injected script:', error);
                            window.dispatchEvent(new CustomEvent('rcToolUpdateError', { 
                                detail: { toolId: '${toolId}', error: error.message } 
                            }));
                        }
                    })();
                `;
                document.head.appendChild(executeScript);
                
                // Listen for the result
                const handleSuccess = (event) => {
                    if (event.detail.toolId === toolId) {
                        const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
                        showNotification(`${capitalizedType} applied to tool ${toolId}!`);
                        window.removeEventListener('rcToolUpdateSuccess', handleSuccess);
                        window.removeEventListener('rcToolUpdateError', handleError);
                        document.head.removeChild(executeScript);
                    }
                };
                
                const handleError = (event) => {
                    if (event.detail.toolId === toolId) {
                        showNotification(`❌ Failed to apply suggestion: ${event.detail.error}`);
                        window.removeEventListener('rcToolUpdateSuccess', handleSuccess);
                        window.removeEventListener('rcToolUpdateError', handleError);
                        document.head.removeChild(executeScript);
                    }
                };
                
                window.addEventListener('rcToolUpdateSuccess', handleSuccess);
                window.addEventListener('rcToolUpdateError', handleError);
                
                // Cleanup after timeout
                setTimeout(() => {
                    window.removeEventListener('rcToolUpdateSuccess', handleSuccess);
                    window.removeEventListener('rcToolUpdateError', handleError);
                    if (document.head.contains(executeScript)) {
                        document.head.removeChild(executeScript);
                    }
                }, 10000); // 10 second timeout
                    } else {
                        console.warn('⚠ No text content element found for tool');
                        showNotification('⚠ Suggestion saved but could not find tool content');
                    }
                } else {
                    console.warn('⚠ No tool element found for tool ID');
                    showNotification('⚠ Suggestion saved but could not find tool element');
                }
            } else {
                console.warn('⚠ No htmlSpan content found for tool');
                showNotification('⚠ Suggestion saved but no enhanced content to apply');
            }
        }
    } catch (error) {
        console.error('❌ Error applying suggestion to RC tool:', error);
        showNotification(`❌ Error applying suggestion: ${error.message}`);
    }
    
    // Update tool's stored data to include suggestion count
    await updateToolWithSuggestionCount(tool);
    
    // Update save button with new suggestion count
    const expositionStorageKey = `rc_exposition_${expositionId}`;
    const expositionResult = await browser.storage.local.get(expositionStorageKey);
    if (expositionResult[expositionStorageKey]) {
        await updateSaveButtonCount(expositionResult[expositionStorageKey]);
    }
    
    // Re-store tools to update suggestion counts in export data
    const allTextTools = document.querySelectorAll('.tool-text, .tool-simpletext');
    if (allTextTools.length > 0) {
        console.log(`💾 Re-storing tool ${toolId} with spans in DOM:`, tool.querySelector('.html-text-editor-content')?.innerHTML?.includes('rc-suggestion-highlight') || tool.querySelector('.html-text-editor-content')?.innerHTML?.includes('rc-comment-highlight'));
        await storeToolsInMemory(Array.from(allTextTools));
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
    const spans = textContent.querySelectorAll('.rc-suggestion-highlight, .rc-comment-highlight');
    if (spans.length === 0) return;
    
    console.log(`🔗 addClickHandlersToRestoredSpans: Mode=${isEditorMode ? 'EDITOR' : 'VIEWER'}, Tool=${toolId}, Spans=${spans.length}`);
    
    spans.forEach(span => {
        // Check if span has suggestion data stored in attributes
        const suggestion = span.getAttribute('data-suggestion');
        const selectedText = span.getAttribute('data-selected-text');
        const type = span.getAttribute('data-type') || 'suggestion';
        
        if (suggestion) {
            // Data is already in the span - just add click handler
            span.addEventListener('click', function(e) {
                console.log(`🔗 SPAN CLICKED in ${isEditorMode ? 'EDITOR' : 'VIEWER'} mode:`, {
                    spanId: this.id,
                    type: type,
                    defaultPrevented: e.defaultPrevented,
                    cancelBubble: e.cancelBubble,
                    target: e.target,
                    currentTarget: e.currentTarget
                });
                e.preventDefault();
                e.stopPropagation();
                showSuggestionTooltip(this, suggestion, selectedText, type);
            });
            console.log(`🔗 Added click handler to span ${span.id} (self-contained data, type: ${type})`);

            // In editor mode, also try capturing the event at a higher level
            if (isEditorMode) {
                span.addEventListener('click', function(e) {
                    console.log('🔗 EDITOR MODE: Secondary click handler triggered');
                    showSuggestionTooltip(this, suggestion, selectedText, type);
                }, true); // Use capture phase
            }        } else {
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
                console.log(`🔗 SPAN CLICKED (from storage) in ${isEditorMode ? 'EDITOR' : 'VIEWER'} mode:`, {
                    spanId: this.id,
                    type: suggestion.type || 'suggestion',
                    defaultPrevented: e.defaultPrevented,
                    cancelBubble: e.cancelBubble
                });
                e.preventDefault();
                e.stopPropagation();
                const suggestionType = suggestion.type || 'suggestion';
                showSuggestionTooltip(this, suggestion.suggestion, suggestion.selectedText, suggestionType);
            });

            // In editor mode, also try capturing the event at a higher level
            if (isEditorMode) {
                span.addEventListener('click', function(e) {
                    console.log('🔗 EDITOR MODE: Secondary click handler (from storage) triggered');
                    const suggestionType = suggestion.type || 'suggestion';
                    showSuggestionTooltip(this, suggestion.suggestion, suggestion.selectedText, suggestionType);
                }, true); // Use capture phase
            }
            console.log(`🔗 Added click handler to span ${span.id} (from storage, type: ${suggestion.type || 'suggestion'})`);
        }
    } catch (error) {
        console.error('❌ Error adding click handler from storage:', error);
    }
}

// Function to show suggestion or comment tooltip
function showSuggestionTooltip(spanElement, suggestionText, selectedText, type = 'suggestion') {
    console.log(`🔗 showSuggestionTooltip called: Mode=${isEditorMode ? 'EDITOR' : 'VIEWER'}, Type=${type}`);
    
    // Verify the type matches the span's actual data-type attribute, with fallback to CSS class
    let actualType = spanElement.getAttribute('data-type');
    
    // Fallback: infer type from CSS class if data-type is missing
    if (!actualType) {
        if (spanElement.classList.contains('rc-comment-highlight')) {
            actualType = 'comment';
        } else if (spanElement.classList.contains('rc-suggestion-highlight')) {
            actualType = 'suggestion';
        } else {
            actualType = 'suggestion'; // Default fallback
        }
        console.log(`ℹ️ Inferred span type '${actualType}' from CSS class for tooltip`);
    }
    
    if (actualType !== type) {
        console.warn(`Type mismatch: passed type '${type}' but span has actual type '${actualType}'. Using actual type.`);
        type = actualType; // Use the span's actual type
    }
    
    // Remove any existing tooltips
    const existingTooltips = document.querySelectorAll('.rc-suggestion-tooltip, .rc-comment-tooltip');
    existingTooltips.forEach(tooltip => tooltip.remove());
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    const tooltipClass = type === 'comment' ? 'rc-comment-tooltip' : 'rc-suggestion-tooltip';
    tooltip.className = tooltipClass;
    
    const header = type === 'comment' ? 'Comment' : 'Suggestion';
    const bgColor = type === 'comment' ? '#4CAF50' : '#FFC107';
    const textColor = type === 'comment' ? 'white' : '#333';
    const contentClass = type === 'comment' ? 'rc-comment-tooltip-suggestion' : 'rc-suggestion-tooltip-suggestion';
    
    // Add "Resolved" button for comments or "Accept" button for suggestions
    const actionButton = type === 'comment' ? `
        <div style="margin-top: 8px; text-align: right;">
            <button class="rc-resolve-comment-btn" style="background: #4CAF50; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">
                Resolved
            </button>
        </div>
    ` : `
        <div style="margin-top: 8px; text-align: right;">
            <button class="rc-accept-suggestion-btn" style="background: #4CAF50; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">
                Accept
            </button>
        </div>
    `;
    
    tooltip.innerHTML = `
        <div class="rc-suggestion-tooltip-header" style="background: ${bgColor}; color: ${textColor};">${header}</div>
        <div class="rc-suggestion-tooltip-text"><strong>Selected:</strong> "${selectedText}"</div>
        <div class="${contentClass}">${suggestionText}</div>
        ${actionButton}
    `;
    
    document.body.appendChild(tooltip);
    
    // Add click handler for "Resolved" button if it's a comment
    if (type === 'comment') {
        const resolveBtn = tooltip.querySelector('.rc-resolve-comment-btn');
        if (resolveBtn) {
            resolveBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await resolveComment(spanElement);
                    tooltip.remove();
                    showNotification('Comment resolved and removed');
                } catch (error) {
                    console.error('Error resolving comment:', error);
                    showNotification('Error resolving comment: ' + error.message);
                }
            });
        }
    }
    
    // Add click handler for "Accept" button if it's a suggestion
    if (type === 'suggestion') {
        const acceptBtn = tooltip.querySelector('.rc-accept-suggestion-btn');
        if (acceptBtn) {
            acceptBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    // Double-check that this is actually a suggestion span
                    const actualType = spanElement.getAttribute('data-type') || 'suggestion';
                    if (actualType !== 'suggestion') {
                        throw new Error(`Cannot accept ${actualType}, only suggestions can be accepted`);
                    }
                    await acceptSuggestion(spanElement);
                    tooltip.remove();
                    showNotification('Suggestion accepted and applied');
                } catch (error) {
                    console.error('Error accepting suggestion:', error);
                    showNotification('Error accepting suggestion: ' + error.message);
                }
            });
        }
    }
    
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

// Function to resolve a comment by removing the span and updating the tool
async function resolveComment(spanElement) {
    try {
        // Get span information BEFORE removing it from DOM
        const spanId = spanElement.id;
        let spanType = spanElement.getAttribute('data-type');
        
        // Fallback: infer type from CSS class if data-type is missing
        if (!spanType) {
            if (spanElement.classList.contains('rc-comment-highlight')) {
                spanType = 'comment';
            } else if (spanElement.classList.contains('rc-suggestion-highlight')) {
                spanType = 'suggestion';
            } else {
                spanType = 'comment'; // Default fallback
            }
            console.log(`ℹ️ Inferred span type '${spanType}' from CSS class for span ${spanId}`);
        }
        
        const spanText = spanElement.textContent;
        
        if (spanType !== 'comment') {
            throw new Error('Only comments can be resolved');
        }
        
        // Find the parent tool
        const tool = spanElement.closest('.tool-text, .tool-simpletext');
        if (!tool) {
            throw new Error('Could not find parent tool');
        }
        
        const toolId = tool.dataset.id;
        if (!toolId) {
            throw new Error('Tool ID not found');
        }
        
        console.log(`🔄 Resolving comment ${spanId} in tool ${toolId}`);
        
        // Store span info for RC update before DOM modification
        const spanInfo = {
            id: spanId,
            text: spanText,
            outerHTML: spanElement.outerHTML
        };
        
        // Remove the span from DOM and unwrap its content
        const textNode = document.createTextNode(spanElement.textContent);
        spanElement.parentNode.replaceChild(textNode, spanElement);
        
        console.log(`✂️ Removed span ${spanId} from DOM`);
        
        // Remove from active suggestions storage and move to resolved comments storage
        const bodyElement = document.body;
        const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
        const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
        const storageKey = `rc_suggestions_${expositionId}_${weaveId}`;
        const resolvedStorageKey = `rc_resolved_comments_${expositionId}_${weaveId}`;
        
        const result = await browser.storage.local.get([storageKey, resolvedStorageKey]);
        const suggestions = result[storageKey] || {};
        const resolvedComments = result[resolvedStorageKey] || {};
        const toolSuggestions = suggestions[toolId] || [];
        
        // Find the comment to resolve
        const commentToResolve = toolSuggestions.find(s => s.spanId === spanId);
        let commentData;
        
        if (commentToResolve) {
            // Capture full tool HTML content for audit trail
            const toolContent = tool.outerHTML;
            const toolContentLength = toolContent.length;
            console.log(`📄 Capturing full tool HTML content (${toolContentLength} chars) for comment ${spanId}`);
            
            // Add resolution metadata
            commentToResolve.resolvedAt = new Date().toISOString();
            commentToResolve.resolvedBySpanRemoval = true;
            commentToResolve.originalSpanInfo = spanInfo;
            commentToResolve.fullToolHtmlAtResolution = toolContent;
            commentToResolve.toolHtmlLength = toolContentLength;
            
            commentData = commentToResolve;
        } else {
            // Comment not in storage, create from span data
            console.log(`⚠️ Comment not in storage, creating from span data...`);
            
            // Extract data from span attributes
            const suggestion = spanElement.getAttribute('data-suggestion') || '';
            const selectedText = spanElement.getAttribute('data-selected') || spanText;
            
            // Capture full tool HTML content for audit trail
            const toolContent = tool.outerHTML;
            const toolContentLength = toolContent.length;
            console.log(`📄 Capturing full tool HTML content (${toolContentLength} chars) for comment ${spanId}`);
            
            commentData = {
                spanId: spanId,
                suggestion: suggestion,
                selectedText: selectedText,
                type: spanType,
                timestamp: new Date().toISOString(),
                toolId: toolId,
                recreatedFromSpan: true,
                resolvedAt: new Date().toISOString(),
                resolvedBySpanRemoval: true,
                originalSpanInfo: spanInfo,
                fullToolHtmlAtResolution: toolContent,
                toolHtmlLength: toolContentLength
            };
            
            console.log(`✅ Created comment from span attributes:`, commentData);
        }
        
        // Move to resolved comments storage
        if (!resolvedComments[toolId]) {
            resolvedComments[toolId] = [];
        }
        resolvedComments[toolId].push(commentData);
        
        console.log(`📦 Moved comment ${spanId} to resolved storage with metadata`);
        
        // Remove the comment from active suggestions
        const updatedSuggestions = toolSuggestions.filter(s => s.spanId !== spanId);
        suggestions[toolId] = updatedSuggestions;
        
        // Save both storages
        await browser.storage.local.set({ 
            [storageKey]: suggestions,
            [resolvedStorageKey]: resolvedComments
        });
        
        console.log(`🗑️ Removed comment ${spanId} from active storage`);
        console.log(`💾 Stored resolved comment ${spanId} with resolution metadata`);
        
        // Update the tool via RC API (pass spanInfo for proper removal)
        await updateToolAfterCommentResolution(tool, toolId, spanInfo);
        
        // Update the suggestion badge count
        await updateToolWithSuggestionCount(tool);
        
        // Update save button count to reflect the resolved comment
        await updateSaveButtonCountAfterAction(expositionId);
        
        console.log(`✅ Comment ${spanId} resolved successfully`);
        
    } catch (error) {
        console.error('❌ Error in resolveComment:', error);
        throw error;
    }
}

// Function to retrieve resolved comments for a tool or entire weave
async function getResolvedComments(toolId = null) {
    try {
        const bodyElement = document.body;
        const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
        const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
        const resolvedStorageKey = `rc_resolved_comments_${expositionId}_${weaveId}`;
        
        const result = await browser.storage.local.get(resolvedStorageKey);
        const resolvedComments = result[resolvedStorageKey] || {};
        
        if (toolId) {
            // Return resolved comments for specific tool
            return resolvedComments[toolId] || [];
        } else {
            // Return all resolved comments for the weave
            return resolvedComments;
        }
    } catch (error) {
        console.error('Error retrieving resolved comments:', error);
        return toolId ? [] : {};
    }
}

// Function to get resolution statistics
async function getResolutionStats() {
    try {
        const bodyElement = document.body;
        const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
        const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
        const resolvedStorageKey = `rc_resolved_comments_${expositionId}_${weaveId}`;
        
        const result = await browser.storage.local.get(resolvedStorageKey);
        const resolvedComments = result[resolvedStorageKey] || {};
        
        let totalResolved = 0;
        let resolutionsByTool = {};
        let resolutionsByDate = {};
        
        Object.entries(resolvedComments).forEach(([toolId, comments]) => {
            resolutionsByTool[toolId] = comments.length;
            totalResolved += comments.length;
            
            comments.forEach(comment => {
                if (comment.resolvedAt) {
                    const dateKey = comment.resolvedAt.split('T')[0]; // Get just the date part
                    resolutionsByDate[dateKey] = (resolutionsByDate[dateKey] || 0) + 1;
                }
            });
        });
        
        return {
            totalResolved,
            resolutionsByTool,
            resolutionsByDate,
            weaveId,
            expositionId
        };
    } catch (error) {
        console.error('Error getting resolution stats:', error);
        return null;
    }
}

// Function to accept a suggestion by replacing the original text with the suggested text
async function acceptSuggestion(spanElement) {
    try {
        // Get span information BEFORE removing it from DOM
        const spanId = spanElement.id;
        let spanType = spanElement.getAttribute('data-type');
        
        // Fallback: infer type from CSS class if data-type is missing
        if (!spanType) {
            if (spanElement.classList.contains('rc-comment-highlight')) {
                spanType = 'comment';
            } else if (spanElement.classList.contains('rc-suggestion-highlight')) {
                spanType = 'suggestion';
            } else {
                spanType = 'suggestion'; // Default fallback
            }
            console.log(`ℹ️ Inferred span type '${spanType}' from CSS class for span ${spanId}`);
        }
        
        const originalText = spanElement.getAttribute('data-selected-text');
        const suggestedText = spanElement.getAttribute('data-suggestion');
        
        if (spanType !== 'suggestion') {
            throw new Error('Only suggestions can be accepted');
        }
        
        if (!suggestedText) {
            throw new Error('Missing suggested text data in span');
        }
        
        console.log(`📝 Will replace "${originalText || spanElement.textContent}" with "${suggestedText}"`);
        
        // Find the parent tool
        const tool = spanElement.closest('.tool-text, .tool-simpletext');
        if (!tool) {
            throw new Error('Could not find parent tool');
        }
        
        const toolId = tool.dataset.id;
        if (!toolId) {
            throw new Error('Tool ID not found');
        }
        
        console.log(`🔄 Accepting suggestion ${spanId} in tool ${toolId}`);
        
        // FIRST: Move from active to accepted storage BEFORE any DOM/RC changes
        const bodyElement = document.body;
        const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
        const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
        const storageKey = `rc_suggestions_${expositionId}_${weaveId}`;
        const acceptedStorageKey = `rc_accepted_suggestions_${expositionId}_${weaveId}`;
        
        const result = await browser.storage.local.get([storageKey, acceptedStorageKey]);
        const suggestions = result[storageKey] || {};
        const acceptedSuggestions = result[acceptedStorageKey] || {};
        const toolSuggestions = suggestions[toolId] || [];
        
        console.log(`🔍 DEBUG: Looking for suggestion ${spanId} in tool ${toolId}`);
        console.log(`🔍 DEBUG: toolSuggestions array:`, toolSuggestions);
        console.log(`🔍 DEBUG: toolSuggestions length:`, toolSuggestions.length);
        
        // Find the suggestion to accept - if not in storage, get from span attributes
        let suggestionToAccept = toolSuggestions.find(s => s.spanId === spanId);
        console.log(`🔍 DEBUG: suggestionToAccept found in storage:`, suggestionToAccept ? 'YES' : 'NO');
        
        if (!suggestionToAccept) {
            console.log(`⚠️ Suggestion not in storage, creating from span data...`);
            // Create suggestion object from span attributes
            const suggestionText = spanElement.getAttribute('data-suggestion');
            const selectedText = spanElement.getAttribute('data-selected-text');
            const type = spanElement.getAttribute('data-type') || 'suggestion';
            
            if (suggestionText && selectedText) {
                suggestionToAccept = {
                    spanId: spanId,
                    suggestion: suggestionText,
                    selectedText: selectedText,
                    type: type,
                    timestamp: new Date().toISOString(),
                    // Add any other fields we might need
                    toolId: toolId,
                    recreatedFromSpan: true
                };
                console.log(`✅ Created suggestion from span attributes:`, suggestionToAccept);
            } else {
                console.error(`❌ Cannot create suggestion - missing span attributes`);
                throw new Error('Cannot accept suggestion - missing required data');
            }
        }
        
        if (suggestionToAccept) {
            console.log(`🔍 DEBUG: suggestionToAccept data:`, suggestionToAccept);
            
            // Get full tool content for audit trail
            const tool = spanElement.closest('.tool-text, .tool-simpletext');
            const toolContent = tool ? tool.outerHTML : null;
            const toolContentLength = toolContent ? toolContent.length : 0;
            
            console.log(`📄 Capturing full tool HTML content (${toolContentLength} chars) for suggestion ${spanId}`);
            
            // Add acceptance metadata
            suggestionToAccept.acceptedAt = new Date().toISOString();
            suggestionToAccept.acceptedByTextReplacement = true;
            suggestionToAccept.fullToolHtmlAtAcceptance = toolContent;
            suggestionToAccept.toolHtmlLength = toolContentLength;
            
            // Move to accepted suggestions storage
            if (!acceptedSuggestions[toolId]) {
                acceptedSuggestions[toolId] = [];
            }
            acceptedSuggestions[toolId].push(suggestionToAccept);
            
            console.log(`📦 Moved suggestion ${spanId} to accepted storage with metadata`);
        }
        
        // Remove the suggestion from active suggestions
        const updatedSuggestions = toolSuggestions.filter(s => s.spanId !== spanId);
        suggestions[toolId] = updatedSuggestions;
        
        // Save both storages BEFORE DOM/RC changes
        await browser.storage.local.set({ 
            [storageKey]: suggestions,
            [acceptedStorageKey]: acceptedSuggestions
        });
        
        console.log(`🗑️ Removed suggestion ${spanId} from active storage`);
        console.log(`💾 Stored accepted suggestion ${spanId} with acceptance metadata`);
        console.log(`🔍 DEBUG: Storage keys used:`, { storageKey, acceptedStorageKey });
        console.log(`🔍 DEBUG: Data being stored to acceptedStorageKey:`, acceptedSuggestions);
        
        // Verify the storage worked by reading it back immediately
        const verifyResult = await browser.storage.local.get(acceptedStorageKey);
        console.log(`🔍 DEBUG: Verification read from storage:`, verifyResult);

        // Store span info for RC update before DOM modification
        const spanInfo = {
            id: spanId,
            originalText: originalText || spanElement.textContent,
            suggestedText: suggestedText,
            outerHTML: spanElement.outerHTML
        };
        
        // Replace the span content with the suggested text (no highlighting)
        const textNode = document.createTextNode(suggestedText);
        spanElement.parentNode.replaceChild(textNode, spanElement);
        
        console.log(`✂️ Replaced span ${spanId} with suggested text in DOM`);
        
        // Update the tool via RC API (pass spanInfo for proper text replacement)
        await updateToolAfterSuggestionAcceptance(tool, toolId, spanInfo);
        
        // Update the suggestion badge count
        await updateToolWithSuggestionCount(tool);
        
        // Update save button count to reflect the accepted suggestion
        await updateSaveButtonCountAfterAction(expositionId);
        
        console.log(`✅ Suggestion ${spanId} accepted successfully`);
        
    } catch (error) {
        console.error('❌ Error in acceptSuggestion:', error);
        throw error;
    }
}

// Function to update the tool content after comment resolution
async function updateToolAfterCommentResolution(tool, toolId, spanInfo) {
    try {
        console.log(`🔄 Updating RC tool ${toolId} after comment resolution...`);
        
        const bodyElement = document.body;
        const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
        const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
        
        // Step 1: Fetch current tool content from Research Catalogue
        const editUrl = `${window.location.origin}/item/edit?item=${toolId}&research=${expositionId}`;
        const editResponse = await fetch(editUrl, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (!editResponse.ok) {
            throw new Error(`Failed to fetch tool data: ${editResponse.status}`);
        }
        
        const editHtml = await editResponse.text();
        console.log('📥 Fetched tool edit form from RC');
        
        // Step 2: Parse the form and extract current content
        const parser = new DOMParser();
        const doc = parser.parseFromString(editHtml, 'text/html');
        
        // Find the content field (could be different names depending on tool type)
        const contentField = doc.querySelector('textarea[name="media[textcontent]"]') ||
                           doc.querySelector('textarea[name="media[content]"]') ||
                           doc.querySelector('textarea[name="textcontent"]');
        
        if (!contentField) {
            throw new Error('Could not find content field in tool edit form');
        }
        
        let currentContent = contentField.value;
        console.log('📄 Current tool content length:', currentContent.length);
        
        // Step 3: Remove the resolved comment span from the content
        if (spanInfo && spanInfo.id) {
            // Use regex to remove the span while preserving its text content
            const spanRegex = new RegExp(`<span[^>]*id="${spanInfo.id}"[^>]*>(.*?)</span>`, 'gi');
            const updatedContent = currentContent.replace(spanRegex, '$1');
            
            if (updatedContent !== currentContent) {
                console.log('✂️ Removed resolved comment span from RC content');
                currentContent = updatedContent;
            } else {
                console.log('⚠️ Comment span not found in RC content - may have been removed already');
            }
        }
        
        // Step 4: Prepare form data for update
        const formData = new URLSearchParams();
        
        // Copy all existing form fields from the edit form
        const formElements = doc.querySelectorAll('input, textarea, select');
        formElements.forEach(element => {
            if (element.name && element.name !== 'media[textcontent]' && element.name !== 'media[content]') {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    if (element.checked) {
                        formData.append(element.name, element.value);
                    }
                } else if (element.type !== 'submit' && element.type !== 'button') {
                    formData.append(element.name, element.value);
                }
            }
        });
        
        // Set the updated content
        const contentFieldName = contentField.name;
        formData.set(contentFieldName, currentContent);
        
        // Add submit button
        if (!formData.has('submitbutton')) {
            formData.append('submitbutton', 'submitbutton');
        }
        
        console.log('📤 Sending update request to RC...');
        
        // Step 5: Submit the update to Research Catalogue
        const updateUrl = `${window.location.origin}/item/edit?item=${toolId}&research=${expositionId}`;
        const updateResponse = await fetch(updateUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: formData.toString()
        });
        
        if (!updateResponse.ok) {
            throw new Error(`Failed to update tool: ${updateResponse.status}`);
        }
        
        // Check if update was successful
        const hasValidationHeader = updateResponse.headers.get('Form-Validation');
        if (hasValidationHeader === '1') {
            console.log('✅ RC tool updated successfully after comment resolution!');
            
            // Step 6: Update our local storage to reflect the changes
            const storageKey = `rc_exposition_${expositionId}`;
            const result = await browser.storage.local.get(storageKey);
            const expositionData = result[storageKey];
            
            if (expositionData && expositionData.weaves && expositionData.weaves[weaveId]) {
                const weaveData = expositionData.weaves[weaveId];
                const toolData = weaveData.tools.find(t => t.id === toolId);
                
                if (toolData && toolData.content) {
                    // Update stored content to match what we sent to RC
                    toolData.content.htmlSpan = currentContent;
                    await browser.storage.local.set({ [storageKey]: expositionData });
                    console.log('💾 Updated local storage with resolved comment changes');
                }
            }
            
            // Re-store tools to update suggestion counts in export data
            const allTextTools = document.querySelectorAll('.tool-text, .tool-simpletext');
            if (allTextTools.length > 0) {
                await storeToolsInMemory(Array.from(allTextTools));
            }
            
        } else {
            throw new Error('RC update validation failed');
        }
        
        console.log(`✅ Tool ${toolId} successfully updated on Research Catalogue`);
        
    } catch (error) {
        console.error('❌ Error updating RC tool after comment resolution:', error);
        throw error;
    }
}

// Function to update the tool content after suggestion acceptance
async function updateToolAfterSuggestionAcceptance(tool, toolId, spanInfo) {
    try {
        console.log(`🔄 Updating RC tool ${toolId} after suggestion acceptance...`);
        
        const bodyElement = document.body;
        const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
        const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
        
        // Step 1: Fetch current tool content from Research Catalogue
        const editUrl = `${window.location.origin}/item/edit?item=${toolId}&research=${expositionId}`;
        const editResponse = await fetch(editUrl, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (!editResponse.ok) {
            throw new Error(`Failed to fetch tool data: ${editResponse.status}`);
        }
        
        const editHtml = await editResponse.text();
        console.log('📥 Fetched tool edit form from RC');
        
        // Step 2: Parse the form and extract current content
        const parser = new DOMParser();
        const doc = parser.parseFromString(editHtml, 'text/html');
        
        // Find the content field (could be different names depending on tool type)
        const contentField = doc.querySelector('textarea[name="media[textcontent]"]') ||
                           doc.querySelector('textarea[name="media[content]"]') ||
                           doc.querySelector('textarea[name="textcontent"]');
        
        if (!contentField) {
            throw new Error('Could not find content field in tool edit form');
        }
        
        let currentContent = contentField.value;
        console.log('📄 Current tool content length:', currentContent.length);
        
        // Step 3: Replace the suggestion span with the accepted text
        if (spanInfo && spanInfo.id) {
            // Use regex to replace the span with the suggested text
            const spanRegex = new RegExp(`<span[^>]*id="${spanInfo.id}"[^>]*>(.*?)</span>`, 'gi');
            const updatedContent = currentContent.replace(spanRegex, spanInfo.suggestedText);
            
            if (updatedContent !== currentContent) {
                console.log('✅ Applied accepted suggestion to RC content');
                console.log(`📝 Replaced span with: "${spanInfo.suggestedText}"`);
                currentContent = updatedContent;
            } else {
                console.log('⚠️ Suggestion span not found in RC content - may have been modified already');
            }
        }
        
        // Step 4: Prepare form data for update
        const formData = new URLSearchParams();
        
        // Copy all existing form fields from the edit form
        const formElements = doc.querySelectorAll('input, textarea, select');
        formElements.forEach(element => {
            if (element.name && element.name !== 'media[textcontent]' && element.name !== 'media[content]') {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    if (element.checked) {
                        formData.append(element.name, element.value);
                    }
                } else if (element.type !== 'submit' && element.type !== 'button') {
                    formData.append(element.name, element.value);
                }
            }
        });
        
        // Set the updated content
        const contentFieldName = contentField.name;
        formData.set(contentFieldName, currentContent);
        
        // Add submit button
        if (!formData.has('submitbutton')) {
            formData.append('submitbutton', 'submitbutton');
        }
        
        console.log('📤 Sending update request to RC...');
        
        // Step 5: Submit the update to Research Catalogue
        const updateUrl = `${window.location.origin}/item/edit?item=${toolId}&research=${expositionId}`;
        const updateResponse = await fetch(updateUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: formData.toString()
        });
        
        if (!updateResponse.ok) {
            throw new Error(`Failed to update tool: ${updateResponse.status}`);
        }
        
        // Check if update was successful
        const hasValidationHeader = updateResponse.headers.get('Form-Validation');
        if (hasValidationHeader === '1') {
            console.log('✅ RC tool updated successfully after suggestion acceptance!');
            
            // Step 6: Update our local storage to reflect the changes
            const storageKey = `rc_exposition_${expositionId}`;
            const result = await browser.storage.local.get(storageKey);
            const expositionData = result[storageKey];
            
            if (expositionData && expositionData.weaves && expositionData.weaves[weaveId]) {
                const weaveData = expositionData.weaves[weaveId];
                const toolData = weaveData.tools.find(t => t.id === toolId);
                
                if (toolData && toolData.content) {
                    // Update stored content to match what we sent to RC
                    toolData.content.htmlSpan = currentContent;
                    await browser.storage.local.set({ [storageKey]: expositionData });
                    console.log('💾 Updated local storage with accepted suggestion changes');
                }
            }
            
            // Re-store tools to update suggestion counts in export data
            const allTextTools = document.querySelectorAll('.tool-text, .tool-simpletext');
            if (allTextTools.length > 0) {
                await storeToolsInMemory(Array.from(allTextTools));
            }
            
        } else {
            throw new Error('RC update validation failed');
        }
        
        console.log(`✅ Tool ${toolId} successfully updated on Research Catalogue with accepted suggestion`);
        
    } catch (error) {
        console.error('❌ Error updating RC tool after suggestion acceptance:', error);
        throw error;
    }
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
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px; color: #555;">Your comment or suggestion:</div>
            <textarea class="rc-suggestion-input" placeholder="Enter your comment or suggestion here..." style="width: 100%; height: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; font-size: 13px; font-family: inherit;"></textarea>
        </div>
        
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button class="rc-cancel-suggestion" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">Cancel</button>
            <button class="rc-save-comment" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; margin-right: 8px;">Comment</button>
            <button class="rc-save-suggestion" style="padding: 8px 16px; background: #FFC107; color: #333; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">Suggest</button>
        </div>
    `;
    
    document.body.appendChild(suggestionEditor);
    
    // Get editor elements
    const selectedTextDisplay = suggestionEditor.querySelector('.rc-selected-text');
    const suggestionInput = suggestionEditor.querySelector('.rc-suggestion-input');
    const closeBtn = suggestionEditor.querySelector('.rc-close-suggestion');
    const saveCommentBtn = suggestionEditor.querySelector('.rc-save-comment');
    const saveSuggestionBtn = suggestionEditor.querySelector('.rc-save-suggestion');
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
    
    // Save suggestion button handler
    saveSuggestionBtn.addEventListener('click', async () => {
        await handleGlobalSaveAction('suggestion');
    });
    
    // Save comment button handler
    saveCommentBtn.addEventListener('click', async () => {
        await handleGlobalSaveAction('comment');
    });
    
    // Helper function for global save action
    async function handleGlobalSaveAction(type) {
        if (!currentSelection || !currentTool) {
            showNotification(`Please select text and enter a ${type}`);
            return;
        }
        
        const suggestionText = suggestionInput.value.trim();
        if (!suggestionText) {
            showNotification(`Please enter a ${type}`);
            return;
        }
        
        try {
            console.log(`RC Tool Commenter: Saving ${type} for tool:`, currentTool.dataset.id);
            await saveSuggestion(currentTool, currentSelection, suggestionText, type);
            
            showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} saved successfully`);
            
            // Hide the editor
            suggestionEditor.style.display = 'none';
            currentSelection = null;
            currentTool = null;
            
            // Re-store tools with updated suggestion data
            const allTextTools = document.querySelectorAll('.tool-text, .tool-simpletext');
            if (allTextTools.length > 0) {
                console.log(`RC Tool Commenter: Re-storing tools with updated ${type} data`);
                await storeToolsInMemory(Array.from(allTextTools));
            }
        } catch (error) {
            console.error(`RC Tool Commenter: Error saving ${type}:`, error);
            showNotification(`Error saving ${type}`);
        }
    }
    
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

// Function to add "Convert to HTML tool" button for simpletext tools
function addConvertToHtmlButton(tool) {
    // Skip adding convert buttons in editor mode
    if (isEditorMode) {
        console.log('🚫 Skipping convert button in editor mode');
        return;
    }
    
    // Check if button already exists
    if (tool.querySelector('.rc-convert-button')) {
        return;
    }
    
    const toolContent = tool.querySelector('.tool-content');
    if (!toolContent) return;
    
    // Create convert button
    const convertButton = document.createElement('button');
    convertButton.className = 'rc-convert-button';
    convertButton.textContent = 'Convert to HTML tool';
    convertButton.title = 'Convert this simple text tool to HTML text tool to enable comments and suggestions';
    
    // Style the button
    Object.assign(convertButton.style, {
        position: 'absolute',
        top: '5px',
        right: '5px',
        padding: '4px 8px',
        fontSize: '11px',
        backgroundColor: '#28a745',
        color: 'white',
        border: 'none',
        borderRadius: '3px',
        cursor: 'pointer',
        zIndex: '1000',
        transition: 'all 0.2s ease',
        opacity: '0.8'
    });
    
    // Hover effects
    convertButton.addEventListener('mouseenter', () => {
        convertButton.style.opacity = '1';
        convertButton.style.backgroundColor = '#218838';
    });
    
    convertButton.addEventListener('mouseleave', () => {
        convertButton.style.opacity = '0.8';
        convertButton.style.backgroundColor = '#28a745';
    });
    
    // Click handler for conversion
    convertButton.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const toolId = tool.dataset.id;
        if (!toolId) {
            showNotification('Unable to find tool ID for conversion', 'error');
            return;
        }
        
        await convertSimpletextToHtml(tool, toolId);
    });
    
    // Add button to tool content
    toolContent.style.position = 'relative';
    toolContent.appendChild(convertButton);
    
    console.log(`🔲 Added convert button to simpletext tool ${tool.dataset.id}`);
}

// Function to convert simpletext tool to HTML text tool
async function convertSimpletextToHtml(toolElement, toolId) {
    try {
        console.log(`🔄 Starting conversion of simpletext tool ${toolId} to HTML text tool`);
        
        // Disable the button during conversion
        const convertButton = toolElement.querySelector('.rc-convert-button');
        if (convertButton) {
            convertButton.disabled = true;
            convertButton.textContent = 'Converting...';
            convertButton.style.opacity = '0.6';
        }
        
        // Get current page context
        const bodyElement = document.body;
        const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
        
        // Construct the conversion API URL
        const baseUrl = window.location.origin;
        const conversionUrl = `${baseUrl}/item/convert?item=${toolId}&research=${expositionId}`;
        
        console.log(`📡 RC API: Conversion URL: ${conversionUrl}`);
        
        // Step 1: GET the conversion form (confirmation dialog)
        console.log(`📡 RC API: Step 1 - Getting conversion confirmation form...`);
        const getResponse = await fetch(conversionUrl, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        });
        
        console.log(`📡 RC API: GET response status: ${getResponse.status}`);
        
        if (!getResponse.ok) {
            throw new Error(`GET request failed with status ${getResponse.status}`);
        }
        
        const formHtml = await getResponse.text();
        console.log(`📡 RC API: Received confirmation form (${formHtml.length} chars)`);
        
        // Step 2: POST the conversion confirmation
        console.log(`📡 RC API: Step 2 - Confirming conversion...`);
        const postResponse = await fetch(conversionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: 'confirmation=confirmation&yesbutton=yesbutton',
            credentials: 'same-origin'
        });
        
        console.log(`📡 RC API: POST response status: ${postResponse.status}`);
        
        if (!postResponse.ok) {
            throw new Error(`POST request failed with status ${postResponse.status}`);
        }
        
        const postResult = await postResponse.text();
        console.log(`📡 RC API: Conversion confirmed (${postResult.length} chars)`);
        
        // Step 3: GET the updated tool
        console.log(`📡 RC API: Step 3 - Fetching updated tool...`);
        const listUrl = `${baseUrl}/item/list?item=${toolId}`;
        const listResponse = await fetch(listUrl, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        });
        
        console.log(`📡 RC API: Tool list response status: ${listResponse.status}`);
        
        if (listResponse.ok) {
            const updatedHtml = await listResponse.text();
            console.log(`📡 RC API: Updated tool HTML (${updatedHtml.length} chars)`);
            
            // Update the tool in the DOM
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = updatedHtml;
            const updatedTool = tempDiv.querySelector('.tool');
            
            if (updatedTool) {
                // Replace the old tool with the updated one
                toolElement.outerHTML = updatedTool.outerHTML;
                console.log(`✅ Successfully replaced tool ${toolId} in DOM with converted version`);
                
                // Re-enhance the new tool
                setTimeout(() => {
                    const newToolElement = document.querySelector(`[data-id="${toolId}"]`);
                    if (newToolElement) {
                        enhanceTools([newToolElement]);
                        console.log(`🔧 Re-enhanced converted tool ${toolId}`);
                    }
                }, 100);
                
                showNotification('Tool converted successfully! You can now add comments and suggestions.', 'success');
            } else {
                throw new Error('Updated tool not found in response');
            }
        } else {
            throw new Error(`Tool list request failed with status ${listResponse.status}`);
        }
        
        console.log(`✅ Successfully converted simpletext tool ${toolId} to HTML text tool`);
        
    } catch (error) {
        console.error(`❌ Conversion failed for tool ${toolId}:`, error);
        
        // Re-enable the button
        const convertButton = toolElement.querySelector('.rc-convert-button');
        if (convertButton) {
            convertButton.disabled = false;
            convertButton.textContent = 'Convert to HTML tool';
            convertButton.style.opacity = '0.8';
        }
        
        showNotification(`Failed to convert tool: ${error.message}`, 'error');
    }
}

// Function to enhance text tools with permanent blue borders and global suggestion capability
async function enhanceTools(toolsToEnhance = null) {
    // Skip tool enhancement if we're in text-only view
    if (isTextOnlyView) {
        console.log('RC Tool Commenter: Skipping tool enhancement - in text-only view');
        return;
    }
    
    const tools = toolsToEnhance || await identifyTools();
    
    if (tools.length > 0) {
        console.log(`RC Tool Commenter: Enhancing ${tools.length} new tools`);
    }
    
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
        
        // ADDITIONAL: Ensure ALL existing spans have click handlers, regardless of restoration logic
        console.log('🔗 Ensuring all existing spans have click handlers...');
        console.log(`🔗 Editor mode: ${isEditorMode}, Total tools found: ${allTextTools.length}`);
        allTextTools.forEach(tool => {
            const toolId = tool.dataset.id;
            const textContent = tool.querySelector('.html-text-editor-content');
            if (textContent && toolId) {
                const existingSpans = textContent.querySelectorAll('.rc-suggestion-highlight, .rc-comment-highlight');
                if (existingSpans.length > 0) {
                    console.log(`🔗 Found ${existingSpans.length} existing spans in tool ${toolId}, ensuring click handlers...`);
                    console.log(`🔗 Editor mode span attachment for tool ${toolId}:`, isEditorMode ? 'EDITOR' : 'VIEWER');
                    addClickHandlersToRestoredSpans(textContent, toolId);
                }
            }
        });
        
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
            
            // For simpletext tools, add conversion button
            if (toolType === 'simpletext') {
                addConvertToHtmlButton(tool);
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
    for (const tool of tools) {
        const toolId = tool.dataset.id;
        
        if (toolId && suggestions[toolId] && suggestions[toolId].length > 0) {
            const suggestionCount = suggestions[toolId].length;
            console.log(`🔍 Tool ${toolId} has ${suggestionCount} suggestions - restoring`);
            
            addSuggestionBadge(tool, suggestionCount);
            
            // Restore htmlSpan content for this tool
            await restoreToolHtmlSpan(tool, toolId, expositionData, weaveId);
        }
    }
}

// Function to restore htmlSpan content for a tool
async function restoreToolHtmlSpan(tool, toolId, expositionData, weaveId) {
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
        
        const hasSpans = textContent.innerHTML.includes('rc-suggestion-highlight') || textContent.innerHTML.includes('rc-comment-highlight');
        const htmlSpanDifferent = toolData.content.htmlSpan !== toolData.content.html;
        
        console.log(`🔧 Tool ${toolId}: hasSpans=${hasSpans}, htmlSpanDifferent=${htmlSpanDifferent}`);
        console.log(`📊 Tool ${toolId} data: html=${toolData.content.html?.length}chars, htmlSpan=${toolData.content.htmlSpan?.length}chars`);
        
        // Case 1: DOM has spans but stored data might be outdated - sync storage with DOM
        if (hasSpans) {
            const currentDOMContent = textContent.innerHTML;
            if (toolData.content.htmlSpan !== currentDOMContent) {
                console.log(`🔄 Tool ${toolId}: Syncing stored data with DOM (spans detected in DOM)`);
                console.log(`📝 Updating htmlSpan: ${toolData.content.htmlSpan?.length || 0} → ${currentDOMContent.length} chars`);
                
                // Update stored data to match current DOM
                toolData.content.htmlSpan = currentDOMContent;
                
                // Re-store the updated data
                const bodyElement = document.body;
                const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
                const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
                const storageKey = `rc_exposition_${expositionId}`;
                
                const result = await browser.storage.local.get(storageKey);
                if (result[storageKey] && result[storageKey].weaves && result[storageKey].weaves[weaveId]) {
                    const weaveData = result[storageKey].weaves[weaveId];
                    const storedTool = weaveData.tools.find(t => t.id === toolId);
                    if (storedTool) {
                        storedTool.content.htmlSpan = currentDOMContent;
                        await browser.storage.local.set({ [storageKey]: result[storageKey] });
                        console.log(`✅ Tool ${toolId}: Storage synchronized with DOM content`);
                    }
                }
            }
            
            // Add click handlers to existing spans
            addClickHandlersToRestoredSpans(textContent, toolId);
        }
        // Case 2: DOM doesn't have spans but storage does - restore from storage
        else if (!hasSpans && htmlSpanDifferent && toolData.content.htmlSpan) {
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

// ========================================
// PROGRAMMATIC TOOL UPDATE FUNCTIONALITY
// ========================================

/**
 * Updates a tool's content via RC's API
 */
async function updateToolContent(toolId, newContent, researchId) {
    try {
        // First, get current tool data
        const editResponse = await fetch(`/item/edit?item=${toolId}&research=${researchId}`, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (!editResponse.ok) {
            throw new Error(`Failed to fetch tool data: ${editResponse.status}`);
        }
        
        const editHtml = await editResponse.text();
        
        // Parse current form data from the edit form
        const parser = new DOMParser();
        const doc = parser.parseFromString(editHtml, 'text/html');
        
        // Extract current form values
        const formData = new URLSearchParams();
        
        // Common fields
        const titleInput = doc.querySelector('#frm-common-title');
        if (titleInput) {
            formData.append('common[title]', titleInput.value);
        }
        
        // Update the text content with our new content
        formData.append('media[textcontent]', newContent);
        
        // Style fields (preserve existing styling)
        const styleFields = [
            'paddingleft', 'paddingtop', 'paddingright', 'paddingbottom',
            'borderstyle', 'borderwidth', 'bordercolor', 'borderradius',
            'backgroundcolor', 'backgroundimagefileid', 'backgroundimagestyle',
            'backgroundimageposition', 'backgroundimagesize',
            'shadowmarginleft', 'shadowmargintop', 'shadowunschaerfe', 'shadowcolor',
            'cssclasses'
        ];
        
        styleFields.forEach(field => {
            const input = doc.querySelector(`#frm-style-${field}`);
            if (input) {
                formData.append(`style[${field}]`, input.value || '');
            } else {
                // Set defaults for missing fields based on HAR analysis
                const defaults = {
                    'borderstyle': 'none',
                    'backgroundimagestyle': 'repeat',
                    'backgroundimageposition': 'left top',
                    'backgroundimagesize': 'auto'
                };
                formData.append(`style[${field}]`, defaults[field] || '');
            }
        });
        
        // Submit button
        formData.append('submitbutton', 'submitbutton');
        
        // Send the update request
        const updateResponse = await fetch(`/item/edit?item=${toolId}&research=${researchId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: formData.toString()
        });
        
        if (!updateResponse.ok) {
            throw new Error(`Failed to update tool: ${updateResponse.status}`);
        }
        
        // Verify the update was successful by checking the response
        const responseText = await updateResponse.text();
        const hasValidationHeader = updateResponse.headers.get('Form-Validation');
        
        if (hasValidationHeader === '1') {
            console.log(`✓ Successfully updated tool ${toolId}`);
            return true;
        } else {
            throw new Error('Update validation failed');
        }
        
    } catch (error) {
        console.error('✗ Error updating tool content:', error);
        return false;
    }
}

/**
 * Applies a suggestion span to tool content and updates the tool
 */
async function applySuggestionToTool(toolId, originalText, suggestionText, researchId) {
    try {
        // Get current research ID if not provided
        if (!researchId) {
            const urlParams = new URLSearchParams(window.location.search);
            researchId = urlParams.get('research');
        }
        
        // Get current tool content
        const editResponse = await fetch(`/item/edit?item=${toolId}&research=${researchId}`, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (!editResponse.ok) {
            throw new Error(`Failed to fetch tool data: ${editResponse.status}`);
        }
        
        const editHtml = await editResponse.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(editHtml, 'text/html');
        
        // Extract current content
        const contentTextarea = doc.querySelector('#frm-media-textcontent');
        if (!contentTextarea) {
            throw new Error('Could not find content textarea');
        }
        
        let currentContent = contentTextarea.value;
        
        // Create enhanced HTML: original content with suggestion span
        // The suggestion span contains the suggested text, with original text stored in data attributes
        const suggestionSpan = `<span class="ai-suggestion" data-original="${escapeHtml(originalText)}" data-suggestion="${escapeHtml(suggestionText)}" title="AI Suggestion: ${escapeHtml(suggestionText)}">${suggestionText}</span>`;
        
        // Replace the original text with the enhanced HTML (original content + suggestion span)
        const enhancedContent = currentContent.replace(originalText, suggestionSpan);
        
        if (enhancedContent === currentContent) {
            console.warn('⚠ No text was replaced - original text not found in tool content');
            console.log('Current content preview:', currentContent.substring(0, 200));
            console.log('Looking for text:', originalText);
            return false;
        }
        
        console.log('📝 Original content preview:', currentContent.substring(0, 200));
        console.log('🔄 Enhanced content preview:', enhancedContent.substring(0, 200));
        
        // Update the tool with the enhanced content (original + suggestion span)
        console.log(`🔄 Applying suggestion enhancement to tool ${toolId}...`);
        const success = await updateToolContent(toolId, enhancedContent, researchId);
        
        if (success) {
            console.log(`✓ Successfully applied suggestion to tool ${toolId}`);
            // Trigger a page refresh to show the changes
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
        
        return success;
        
    } catch (error) {
        console.error('✗ Error applying suggestion to tool:', error);
        return false;
    }
}

/**
 * Helper function to escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Test function to apply a suggestion to a tool (for testing purposes)
 */
async function testApplySuggestion(toolId, originalText, suggestionText) {
    const urlParams = new URLSearchParams(window.location.search);
    const researchId = urlParams.get('research');
    
    if (!researchId) {
        console.error('Could not find research ID in URL');
        return false;
    }
    
    console.log('Testing suggestion application:', { toolId, originalText, suggestionText, researchId });
    
    return await applySuggestionToTool(toolId, originalText, suggestionText, researchId);
}

// Make functions available globally for testing (immediate assignment)
window.updateToolContent = updateToolContent;
window.applySuggestionToTool = applySuggestionToTool;
window.testApplySuggestion = testApplySuggestion;

// Debug function to check function availability
window.checkRCFunctions = function() {
    console.log('RC Functions Status:', {
        updateToolContent: typeof window.updateToolContent,
        applySuggestionToTool: typeof window.applySuggestionToTool,
        testApplySuggestion: typeof window.testApplySuggestion,
        script_loaded: true
    });
    return 'Functions loaded!';
};

console.log('RC Tool Commenter: Functions assigned to window object');

// Function to detect page refresh and clear stale data
async function detectPageRefreshAndClearCache() {
    // Check if this appears to be a page refresh rather than initial navigation
    // We use performance.navigation if available, or check session storage
    isPageRefresh = (window.performance && window.performance.navigation && 
                    window.performance.navigation.type === 1) || 
                   sessionStorage.getItem('rc_extension_was_active') === 'true';
    
    if (isPageRefresh) {
        console.log('🔄 RC Tool Commenter: Page refresh detected - clearing cached tool data to ensure fresh collaborative content');
        
        const bodyElement = document.body;
        const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
        const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
        
        if (expositionId !== 'unknown' && weaveId !== 'unknown') {
            // Clear cached permission check to force re-validation
            permissionCheckCache = null;
            permissionCheckTime = 0;
            
            // Get current stored tool data
            const storageKey = `rc_exposition_${expositionId}`;
            const result = await browser.storage.local.get(storageKey);
            const expositionData = result[storageKey];
            
            if (expositionData && expositionData.weaves && expositionData.weaves[weaveId]) {
                console.log('🗑️ Clearing stale tool data for weave', weaveId, 'to force fresh fetch');
                // Mark this weave's data as stale by removing last fetched timestamp
                const weaveData = expositionData.weaves[weaveId];
                weaveData.needsRefresh = true;
                weaveData.lastRefreshed = new Date().toISOString();
                
                // Save updated exposition data
                await browser.storage.local.set({ [storageKey]: expositionData });
            }
        }
    }
    
    // Mark that extension is now active for future refresh detection
    sessionStorage.setItem('rc_extension_was_active', 'true');
}

// Function to force fresh tool data fetch from live source
async function fetchFreshToolsFromLiveSource() {
    console.log('🔄 RC Tool Commenter: Fetching fresh tool data from live source for collaborative editing');
    
    // Reset enhancement tracking flags to force fresh processing
    toolsStoredForCurrentWeave = false;
    suggestionBadgesRestored = false;
    
    // Clear any existing tool enhancements to start fresh
    const existingEnhancedTools = document.querySelectorAll('[data-rc-tool-enhanced]');
    existingEnhancedTools.forEach(tool => {
        tool.removeAttribute('data-rc-tool-enhanced');
        // Remove existing badges and borders
        const existingBadge = tool.querySelector('.rc-suggestion-badge');
        if (existingBadge) {
            existingBadge.remove();
        }
        tool.classList.remove('rc-tool-enhanced');
    });
    
    console.log('✨ Cleared', existingEnhancedTools.length, 'existing tool enhancements for fresh processing');
}

// Function to initialize the extension
async function initializeExtension() {
    if (isInitialized) {
        console.log('RC Tool Commenter: Already initialized, skipping duplicate call');
        return;
    }
    
    console.log('RC Tool Commenter: *** initializeExtension() called ***');
    isInitialized = true;
    
    if (!isExpositionPage()) {
        console.log('RC Tool Commenter: Not on a Research Catalogue exposition page');
        return;
    }
    
    // Detect page refresh and handle stale data for collaborative editing
    await detectPageRefreshAndClearCache();
    
    if (isPageRefresh) {
        // For page refreshes, ensure we fetch fresh tool data
        await fetchFreshToolsFromLiveSource();
    }
    
    // FIRST: Check permissions before doing ANYTHING else
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    
    if (expositionId !== 'unknown') {
        console.log('RC Tool Commenter: Checking edit permissions for exposition', expositionId);
        const hasPermissions = await checkEditPermissions(expositionId);
        
        if (!hasPermissions) {
            console.log('RC Tool Commenter: BLOCKING EXTENSION - User lacks edit permissions');
            showPermissionDeniedMessage();
            window.rcExtensionBlocked = true;
            return;
        } else {
            console.log('RC Tool Commenter: Permission check passed, proceeding with initialization');
            window.rcExtensionBlocked = false;
        }
    }
    
    console.log('RC Tool Commenter: Initializing on exposition page');
    
    // Extract weave ID for logging and processing
    const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
    
    // Debug: Log the extracted IDs
    console.log(`🔍 Detected exposition ID: ${expositionId}, weave ID: ${weaveId}`);
    console.log(`🌐 Current URL: ${window.location.href}`);
    
    // Check if we need to restore text view mode after reload
    const restoreKey = `rc_restore_text_view_${expositionId}_${weaveId}`;
    const shouldRestoreTextView = localStorage.getItem(restoreKey);
    console.log(`🔍 Checking restoration: key=${restoreKey}, value=${shouldRestoreTextView}, isTextOnlyView=${isTextOnlyView}`);
    
    if (shouldRestoreTextView === 'true') {
        console.log('📝 Restoring text view mode after suggestion application');
        localStorage.removeItem(restoreKey); // Clean up the flag
        
        // Small delay to ensure page is fully loaded
        setTimeout(() => {
            console.log(`📝 Restoration check: isTextOnlyView=${isTextOnlyView}, toggleTextOnlyView available=${typeof toggleTextOnlyView === 'function'}`);
            if (!isTextOnlyView && typeof toggleTextOnlyView === 'function') {
                console.log('📝 Activating text view mode');
                toggleTextOnlyView();
            } else if (isTextOnlyView) {
                console.log('📝 Already in text view mode, no action needed');
            } else {
                console.log('❌ toggleTextOnlyView function not available');
            }
        }, 500);
    }
    
    // Reset storage flag for new weave
    toolsStoredForCurrentWeave = false;
    suggestionBadgesRestored = false; // Reset badge restoration flag for new weave
    
    // Debug: Check all available tools on the page (commented out to reduce console spam)
    // const allTools = document.querySelectorAll('[class*="tool-"]');
    // console.log('RC Tool Commenter: All elements with "tool-" in class:', allTools.length);
    // allTools.forEach((tool, i) => {
    //     console.log(`Tool ${i+1}:`, tool.className, 'Data-tool:', tool.dataset.tool, tool);
    // });
    
    // Load existing data to update button count
    const storageKey = `rc_exposition_${expositionId}`;
    const result = await browser.storage.local.get(storageKey);
    
    // Initial enhancement
    enhanceTools();

    // Set up event delegation for editor mode span clicks
    if (isEditorMode) {
        console.log('🔗 Setting up event delegation for editor mode span clicks...');
        document.addEventListener('click', function(e) {
            // Check if the clicked element is one of our spans
            if (e.target.matches('.rc-suggestion-highlight, .rc-comment-highlight')) {
                console.log('🔗 EVENT DELEGATION: Span clicked in editor mode:', e.target.id);
                
                const span = e.target;
                const suggestion = span.getAttribute('data-suggestion');
                const selectedText = span.getAttribute('data-selected-text');
                const type = span.getAttribute('data-type') || 
                    (span.classList.contains('rc-comment-highlight') ? 'comment' : 'suggestion');
                
                if (suggestion && selectedText) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔗 EVENT DELEGATION: Showing tooltip via delegation');
                    showSuggestionTooltip(span, suggestion, selectedText, type);
                } else {
                    console.log('🔗 EVENT DELEGATION: Missing data attributes, trying storage lookup...');
                    // Fallback to storage lookup
                    const tool = span.closest('.tool-text, .tool-simpletext');
                    if (tool) {
                        const toolId = tool.dataset.id;
                        addClickHandlerFromStorage(span, toolId);
                        // Trigger the newly added handler
                        setTimeout(() => span.click(), 10);
                    }
                }
            }
        }, true); // Use capture phase to intercept before editor handlers
    }
    
    // Update button with existing counts if available
    if (result[storageKey]) {
        await updateSaveButtonCount(result[storageKey]);
    }
    
    // Watch for dynamically added content (scoped to specific containers)
    let mutationTimeout = null;
    const observer = new MutationObserver((mutations) => {
        let hasNewTools = false;
        
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Only check nodes that are likely to contain tools
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Be more specific - only check if the node itself or direct children are tools
                        if ((node.classList && (node.classList.contains('tool-text') || node.classList.contains('tool-simpletext'))) ||
                            (node.querySelector && node.querySelector('.tool-text, .tool-simpletext'))) {
                            hasNewTools = true;
                        }
                    }
                });
            }
        });
        
        if (hasNewTools) {
            // Debounce enhancement calls to prevent spam
            if (mutationTimeout) clearTimeout(mutationTimeout);
            mutationTimeout = setTimeout(() => {
                console.log('RC Tool Commenter: New tools detected, enhancing...');
                enhanceTools();
            }, 1500); // Increased delay to reduce frequency
        }
    });
    
    // Only observe specific containers that are likely to have dynamic tools
    const weaveContent = document.querySelector('#weave-content') || 
                        document.querySelector('.weave') || 
                        document.querySelector('#content') ||
                        document.body;
    
    observer.observe(weaveContent, {
        childList: true,
        subtree: true
    });
    
    // **INJECT RC TOOL UPDATE FUNCTIONS IMMEDIATELY**
    // Small delay to ensure DOM is ready for script injection
    console.log('🔧 About to inject RC tool update functions...');
    setTimeout(() => {
        console.log('🔧 Calling injectRCToolUpdateFunctions...');
        injectRCToolUpdateFunctions();
        
        // Verify injection worked by checking the script element was added
        setTimeout(() => {
            const injectedScript = document.querySelector('script[data-rc-functions-injected]');
            if (injectedScript) {
                console.log('✅ RC Tool Update functions successfully injected and available');
            } else {
                console.warn('⚠ RC Tool Update functions injection may have failed - retrying...');
                injectRCToolUpdateFunctions();
            }
        }, 500);
    }, 100);
}

// FUNCTION INJECTION FOR RC TOOL UPDATES
function injectRCToolUpdateFunctions() {
    console.log('🔧 injectRCToolUpdateFunctions() called');
    try {
        // Ensure functions are available globally for testing
        window.RCToolUpdater = {
            updateToolContent: updateToolContent,
            applySuggestionToTool: applySuggestionToTool,
            testApplySuggestion: testApplySuggestion,
            escapeHtml: escapeHtml
        };
        
        // Also assign individually 
        window.updateToolContent = updateToolContent;
        window.applySuggestionToTool = applySuggestionToTool;
        window.testApplySuggestion = testApplySuggestion;
        
        // Test function
        window.checkRCFunctions = function() {
            console.log('RC Functions Status:', {
                updateToolContent: typeof window.updateToolContent,
                applySuggestionToTool: typeof window.applySuggestionToTool,
                testApplySuggestion: typeof window.testApplySuggestion,
                RCToolUpdater: typeof window.RCToolUpdater,
                applyRCToolUpdate: typeof window.applyRCToolUpdate,
                testRCToolUpdate: typeof window.testRCToolUpdate,
                script_loaded: true
            });
            return window.RCToolUpdater;
        };
        
        // Add functions to the page's actual global scope (not content script scope)
        const script = document.createElement('script');
        script.setAttribute('data-rc-functions-injected', 'true');
        script.textContent = 'window.testRCToolUpdate = async function(toolId, originalText, suggestionText) { const urlParams = new URLSearchParams(window.location.search); let researchId = urlParams.get("research"); if (!researchId) { const pathMatch = window.location.pathname.match(/\\/view\\/(\\d+)/); if (pathMatch) { researchId = pathMatch[1]; } } if (!researchId) { researchId = document.body.dataset.research; } if (!researchId) { console.error("❌ Could not find research ID. Current URL:", window.location.href); console.log("💡 You might need to be on the editor page: /editor?research=1731661&weave=1732783"); return false; } console.log("🧪 Testing RC tool update:", { toolId, originalText, suggestionText, researchId }); console.log("📍 Current page:", window.location.href); console.log("🔍 Research ID extraction method:", researchId ? "success" : "failed"); try { const editResponse = await fetch("/item/edit?item=" + toolId + "&research=" + researchId, { method: "GET", headers: { "X-Requested-With": "XMLHttpRequest" } }); if (!editResponse.ok) { throw new Error("Failed to fetch tool data: " + editResponse.status); } const editHtml = await editResponse.text(); console.log("✓ Successfully fetched tool edit form"); const parser = new DOMParser(); const doc = parser.parseFromString(editHtml, "text/html"); const isBlockWeave = document.documentElement.classList.contains("weave-block"); console.log("🔍 Weave type detected:", isBlockWeave ? "Block" : "Graphical"); const contentTextarea = doc.querySelector("textarea[name=\\"media[textcontent]\\"]"); if (!contentTextarea) { throw new Error("Could not find media[textcontent] textarea"); } const currentContent = contentTextarea.value; if (!currentContent) { throw new Error("Content textarea found but is empty"); } console.log("📝 Current content preview:", currentContent.substring(0, 200)); console.log("📝 Content field name: media[textcontent]"); const escapeHtml = (text) => { const div = document.createElement("div"); div.textContent = text; return div.innerHTML; }; const suggestionSpan = "<span class=\\"ai-suggestion\\" data-original=\\"" + escapeHtml(originalText) + "\\" data-suggestion=\\"" + escapeHtml(suggestionText) + "\\" title=\\"AI Suggestion: " + escapeHtml(suggestionText) + "\\">" + suggestionText + "</span>"; const enhancedContent = currentContent.replace(originalText, suggestionSpan); if (enhancedContent === currentContent) { console.warn("⚠ No text was replaced - original text not found"); return false; } console.log("🔄 Enhanced content preview:", enhancedContent.substring(0, 200)); console.log("✅ Test completed successfully! Ready to apply changes."); console.log("📌 To actually apply: Use this enhanced content in updateToolContent()"); return { success: true, originalContent: currentContent, enhancedContent: enhancedContent, toolId: toolId, researchId: researchId, isBlockWeave: isBlockWeave }; } catch (error) { console.error("✗ Error in test:", error); return { success: false, error: error.message }; } }; window.applyRCToolUpdate = async function(toolId, enhancedContent, researchId) { console.log("🚀 Applying update to tool", toolId); try { const editResponse = await fetch("/item/edit?item=" + toolId + "&research=" + researchId, { method: "GET", headers: { "X-Requested-With": "XMLHttpRequest" } }); if (!editResponse.ok) { throw new Error("Failed to fetch tool data: " + editResponse.status); } const editHtml = await editResponse.text(); const parser = new DOMParser(); const doc = parser.parseFromString(editHtml, "text/html"); const isBlockWeave = document.documentElement.classList.contains("weave-block"); console.log("🔍 Weave type detected:", isBlockWeave ? "Block" : "Graphical"); const contentTextarea = doc.querySelector("textarea[name=\\"media[textcontent]\\"]"); if (!contentTextarea) { throw new Error("Could not find media[textcontent] textarea"); } console.log("📝 Content field name: media[textcontent]"); let formattedContent; if (isBlockWeave) { formattedContent = "<!DOCTYPE html PUBLIC \\"-//W3C//DTD HTML 4.0 Transitional//EN\\" \\"http://www.w3.org/TR/REC-html40/loose.dtd\\">\\n<html><body>" + enhancedContent + "</body></html>"; console.log("📝 Content format: Full HTML document (block weave)"); } else { formattedContent = enhancedContent; console.log("📝 Content format: Simple content (graphical weave)"); } const formData = new URLSearchParams(); console.log("🔍 Collecting all form fields..."); const allInputs = doc.querySelectorAll("input, textarea, select"); console.log("📋 Found", allInputs.length, "form fields"); allInputs.forEach(input => { const name = input.name; const value = input.value || ""; if (name && name !== "media[textcontent]") { formData.append(name, value); console.log("📝 Added field:", name, "=", value.length > 50 ? value.substring(0, 50) + "..." : value); } }); formData.set("media[textcontent]", formattedContent); console.log("📝 Set content field: media[textcontent] =", formattedContent.length + " chars"); if (!formData.has("submitbutton")) { formData.append("submitbutton", "submitbutton"); } console.log("📤 Sending update request..."); console.log("📋 Total form fields:", formData.size); const updateResponse = await fetch("/item/edit?item=" + toolId + "&research=" + researchId, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" }, body: formData.toString() }); if (!updateResponse.ok) { throw new Error("Failed to update tool: " + updateResponse.status); } const hasValidationHeader = updateResponse.headers.get("Form-Validation"); if (hasValidationHeader === "1") { console.log("✅ Tool updated successfully!"); console.log("🔄 Reloading page to show changes..."); const currentUrl = window.location.href; const expositionId = currentUrl.match(/view\\/(\\d+)/)?.[1]; const weaveId = currentUrl.match(/view\\/\\d+\\/(\\d+)/)?.[1]; if (expositionId && weaveId) { const isInTextView = document.body.classList.contains("rc-text-only-mode"); if (isInTextView) { console.log("📝 Text view mode detected - preserving state for reload"); localStorage.setItem("rc_restore_text_view_" + expositionId + "_" + weaveId, "true"); } } setTimeout(() => window.location.reload(), 1000); return { success: true }; } else { throw new Error("Update validation failed"); } } catch (error) { console.error("❌ Error applying update:", error); return { success: false, error: error.message }; } }; console.log("🚀 testRCToolUpdate() and applyRCToolUpdate() functions are now available!"); console.log("🔧 Functions injected at:", new Date().toLocaleTimeString());';
        document.head.appendChild(script);
        
        console.log('✅ RC Tool Commenter: Functions forcibly assigned to global scope');
        console.log('✅ Use window.checkRCFunctions() to verify or window.RCToolUpdater to access functions');
        
    } catch (error) {
        console.error('❌ Failed to assign functions to global scope:', error);
    }
}

// Wait for page to load and initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
}

// Note: Removed duplicate timeout initialization - the isInitialized guard handles this
// RC tool update functions are now injected immediately during initializeExtension()